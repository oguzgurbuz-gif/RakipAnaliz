import 'dotenv/config';
import { getDb, query } from './db';
import { jobScheduler } from './jobs/scheduler';
import { logger } from './utils/logger';
import { scrapeManager } from './core/scraper';
import { getLatestWeeklyReport } from './jobs/weekly-report';

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
    
    await runInitialScrapeIfNeeded();
    
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

    await ensureInitialWeeklyReportIfMissing();
    
    process.env[INITIAL_SCRAPE_DONE_KEY] = 'true';
    logger.info('Initial scrape completed for all sites');
  } catch (error) {
    logger.error('Error during initial scrape', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function ensureInitialWeeklyReportIfMissing(): Promise<void> {
  try {
    const existing = await getLatestWeeklyReport();
    if (existing) {
      logger.info('Weekly report already exists, skipping initial report generation');
      return;
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const weekStartDate = sevenDaysAgo.toISOString().split('T')[0];
    const weekEndDate = now.toISOString().split('T')[0];

    const jobId = await jobScheduler.scheduleJob(
      'weekly-report',
      { weekStartDate, weekEndDate },
      {
        priority: 10,
        scheduledAt: new Date(),
      }
    );

    logger.info('Scheduled initial weekly report after first full scrape cycle', {
      jobId,
      weekStartDate,
      weekEndDate,
    });
  } catch (error) {
    logger.error('Failed to schedule initial weekly report', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function shutdown() {
  logger.info('Shutting down...');
  try {
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
