import 'dotenv/config';
import { getDb, query } from './db';
import { jobScheduler } from './jobs/scheduler';
import { logger } from './utils/logger';
import { scrapeManager } from './core/scraper';
import { runWeeklyReportCatchUp } from './jobs/weekly-report';
import {
  startMomentumRecalcSchedule,
  stopMomentumRecalcSchedule,
} from './jobs/momentum-recalc';
import {
  startCampaignAlertsSchedule,
  stopCampaignAlertsSchedule,
} from './jobs/campaign-alerts';
import {
  startStatusBulkRecalcSchedule,
  stopStatusBulkRecalcSchedule,
} from './jobs/status-bulk-recalc';
import {
  startSlackPusherSchedule,
  stopSlackPusherSchedule,
} from './jobs/slack-pusher';
import {
  startCompetitiveStanceSchedule,
  stopCompetitiveStanceSchedule,
} from './jobs/competitive-stance-calc';
import {
  startRankingSnapshotSchedule,
  stopRankingSnapshotSchedule,
} from './jobs/ranking-snapshot';
import {
  startSimilarityCalcSchedule,
  stopSimilarityCalcSchedule,
} from './jobs/similarity-calc';
import { createNotification } from './jobs/notifications';

const INITIAL_SCRAPE_DONE_KEY = 'initial_scrape_done';

async function main() {
  logger.info('Starting bitalih scraper service...');
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  try {
    getDb();
    logger.info('Database connection established');
    
    await jobScheduler.start();
    logger.info('Job scheduler started');

    // Catch-up momentum recalculation + recurring 24h schedule.
    // Runs the snapshot logic from migration 010 every day so dashboard
    // momentum scores never go stale.
    await startMomentumRecalcSchedule();

    // Catch-up competitive stance (Atak/Defans) calculation + recurring 24h
    // schedule. Compares last-7d vs last-4w campaign volume per site (and a
    // bonus inflation kicker) to label sites AGGRESSIVE / NEUTRAL / DEFENSIVE
    // for the dashboard rakip kartlarındaki tutum chip'i.
    await startCompetitiveStanceSchedule();

    // Catch-up campaign status bulk recalculation + recurring 1h schedule.
    // Status flips quickly when valid_to crosses NOW(), so the dashboard
    // would otherwise show stale 'active' on long-expired campaigns.
    await startStatusBulkRecalcSchedule();

    // Campaign-end alerts: scan campaigns ending in next 7d, persist
    // ending_soon rows in campaign_alerts (migration 014). Email dispatch
    // is a TODO in the job — for now we only persist the intent.
    await startCampaignAlertsSchedule();

    // Smart Change Alerts (migration 017): drain unpushed smart_alerts to
    // the configured Slack webhook every 5 minutes. High severity → real
    // time per-alert; medium → daily digest at digest_time_hour UTC; low
    // → weekly digest on Mondays at digest_time_hour UTC. No-op if the
    // webhook URL hasn't been configured yet.
    await startSlackPusherSchedule();

    // Win/Loss Tracker — migration 021. Daily ranking_snapshots for 4 metrics
    // (campaign_count, avg_bonus, category_diversity, momentum). Bootstraps
    // empty tables with a 30-day retro back-fill so the dashboard widget has
    // immediate data; then writes one row per (site, metric) per day.
    await startRankingSnapshotSchedule();

    // Migration 022 — campaign_similarities feeder. Boot-time catch-up plus a
    // recurring 12h scan. Algorithm is a hybrid (TF-IDF cosine + category +
    // bonus proximity + tag Jaccard); zero AI calls, so the cost guard is
    // unaffected. Top-5 cross-site matches per campaign are upserted.
    await startSimilarityCalcSchedule();

    // Wave 4 — emit one-time `new_competitor` notification for any site whose
    // row landed in the past 7 days but doesn't yet have a notification. Also
    // dedupes via sourceTable=sites + sourceId=site_id, so re-runs after the
    // first emission are no-ops. Failure is logged and swallowed.
    try {
      await emitNewCompetitorNotifications();
    } catch (error) {
      logger.warn('emitNewCompetitorNotifications failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await runInitialScrapeIfNeeded();

    // Weekly report catch-up + recurring schedule. Runs on every startup so
    // restarts after long downtime back-fill missed weeks and the next
    // Monday 09:00 UTC job is always queued.
    try {
      await runWeeklyReportCatchUp();
    } catch (error) {
      logger.error('Weekly report startup task failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info('bitalih scraper service is running');
  } catch (error) {
    logger.error('Failed to start scraper service', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

async function runInitialScrapeIfNeeded(): Promise<void> {
  const initialScrapeDone = process.env[INITIAL_SCRAPE_DONE_KEY];
  
  if (initialScrapeDone === 'true') {
    logger.info('Initial scrape already completed, skipping');
    return;
  }
  
  logger.info('Running initial scrape for all active sites...');
  
  try {
    const sites = await query<{ code: string; name: string; base_url: string }>(
      `SELECT code, name, base_url FROM sites WHERE is_active = true`
    );
    
    logger.info(`Found ${sites.length} active sites to scrape`);
    
    for (const site of sites) {
      try {
        logger.info(`Initial scrape for site: ${site.code}`);
        
        const siteConfig = {
          code: site.code,
          name: site.name,
          baseUrl: site.base_url,
          adapter: site.code,
          enabled: true,
        };
        
        const result = await scrapeManager.processSite(site.code, siteConfig);
        
        logger.info(`Initial scrape completed for ${site.code}`, {
          status: result.status,
          cardsFound: result.cardsFound,
          newCampaigns: result.newCampaigns,
          updatedCampaigns: result.updatedCampaigns,
          errors: result.errors.length,
        });
      } catch (error) {
        logger.error(`Initial scrape failed for ${site.code}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Weekly report bootstrap is handled by runWeeklyReportCatchUp() in main().

    process.env[INITIAL_SCRAPE_DONE_KEY] = 'true';
    logger.info('Initial scrape completed for all sites');
  } catch (error) {
    logger.error('Error during initial scrape', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Wave 4 — Notification Center seed.
 *
 * Scans `sites` for rows added in the last 7 days that don't already have a
 * notification entry. createNotification() with dedupeBySource handles the
 * idempotency, so re-running is safe across deploys. Sites that pre-date the
 * notifications table are intentionally NOT back-filled — that would flood
 * the inbox on first deploy.
 */
async function emitNewCompetitorNotifications(): Promise<void> {
  const recent = await query<{
    id: string;
    code: string;
    name: string;
    created_at: string | Date;
  }>(
    `SELECT id, code, name, created_at
       FROM sites
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      ORDER BY created_at DESC`
  );

  if (recent.length === 0) return;

  let inserted = 0;
  for (const site of recent) {
    const result = await createNotification({
      type: 'new_competitor',
      severity: 'low',
      title: `Yeni rakip eklendi: ${site.name}`,
      message: `"${site.code}" izleme listesine eklendi.`,
      payload: {
        site_id: site.id,
        site_code: site.code,
        site_name: site.name,
      },
      sourceTable: 'sites',
      sourceId: site.id,
      linkUrl: `/competition/sites/${encodeURIComponent(site.code)}`,
      dedupeBySource: true,
    });
    if (result.inserted) inserted++;
  }

  if (inserted > 0) {
    logger.info(
      `Emitted ${inserted} new_competitor notification(s) for recently added sites`,
      { totalScanned: recent.length }
    );
  }
}

async function shutdown() {
  logger.info('Shutting down...');
  try {
    stopMomentumRecalcSchedule();
    stopCompetitiveStanceSchedule();
    stopCampaignAlertsSchedule();
    stopStatusBulkRecalcSchedule();
    stopSlackPusherSchedule();
    stopRankingSnapshotSchedule();
    stopSimilarityCalcSchedule();
    await scrapeManager.shutdown();
    await jobScheduler.stop();
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

main();
