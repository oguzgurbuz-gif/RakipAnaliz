import 'dotenv/config';
import { getDb, query } from './db';
import { jobScheduler } from './jobs/scheduler';
import { logger } from './utils/logger';
import { scrapeManager } from './core/scraper';

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
