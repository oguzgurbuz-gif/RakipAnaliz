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

    // Catch-up campaign status bulk recalculation + recurring 1h schedule.
    // Status flips quickly when valid_to crosses NOW(), so the dashboard
    // would otherwise show stale 'active' on long-expired campaigns.
    await startStatusBulkRecalcSchedule();

    // Campaign-end alerts: scan campaigns ending in next 7d, persist
    // ending_soon rows in campaign_alerts (migration 014). Email dispatch
    // is a TODO in the job — for now we only persist the intent.
    await startCampaignAlertsSchedule();

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

async function shutdown() {
  logger.info('Shutting down...');
  try {
    stopMomentumRecalcSchedule();
    stopCampaignAlertsSchedule();
    stopStatusBulkRecalcSchedule();
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
