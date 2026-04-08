import 'dotenv/config';
import { getDb, query, queryOne } from './src/db';
import { getClient } from './src/db/supabase';
import { logger } from './src/utils/logger';

async function main() {
  logger.info('Testing Supabase connection...');

  // Test 1: Basic connection via exec
  try {
    const result = await query<{ now: string }>('SELECT NOW() as now');
    logger.info('✅ exec RPC works', { now: result?.[0]?.now });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('❌ exec RPC failed', { error: msg });
  }

  // Test 2: Check sites table
  try {
    const sites = await query<{ code: string; name: string }>('SELECT code, name FROM sites LIMIT 5');
    logger.info('✅ sites table accessible', { count: Array.isArray(sites) ? sites.length : 'NOT_ARRAY' });
    if (Array.isArray(sites)) {
      for (const s of sites) {
        logger.info(`  - ${s.code}: ${s.name}`);
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('❌ sites query failed', { error: msg });
  }

  // Test 3: Check campaigns table
  try {
    const campaigns = await query<{ id: string; title: string; status: string }>(
      'SELECT id, title, status FROM campaigns LIMIT 3'
    );
    logger.info('✅ campaigns table accessible', { count: Array.isArray(campaigns) ? campaigns.length : 'NOT_ARRAY' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('❌ campaigns query failed', { error: msg });
  }

  // Test 4: Insert a test scrape_run
  try {
    const db = getClient();
    const { error } = await db.from('scrape_runs').insert({
      status: 'running',
      started_at: new Date().toISOString(),
      total_sites: 1,
      completed_sites: 0,
      failed_sites: 0,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: 0,
      cards_found: 0,
      new_campaigns: 0,
      updated_campaigns: 0,
      unchanged: 0,
      errors: 0,
    }).select('id').single();
    if (error) throw error;
    logger.info('✅ scrape_runs insert works');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('❌ scrape_runs insert failed', { error: msg });
  }

  // Test 5: Check RPC function increment_version_count
  try {
    const firstCampaign = await queryOne<{ id: string }>('SELECT id FROM campaigns LIMIT 1');
    if (firstCampaign) {
      const before = await queryOne<{ content_version: number }>(
        `SELECT content_version FROM campaigns WHERE id = $1`,
        [firstCampaign.id]
      );
      const db = getClient();
      const { error } = await db.rpc('increment_version_count', { campaign_id: firstCampaign.id });
      if (error) throw error;
      const after = await queryOne<{ content_version: number }>(
        `SELECT content_version FROM campaigns WHERE id = $1`,
        [firstCampaign.id]
      );
      logger.info('✅ increment_version_count RPC works', {
        before: before?.content_version,
        after: after?.content_version
      });
    } else {
      logger.info('⏭ no campaigns to test increment_version_count');
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('❌ increment_version_count failed', { error: msg });
  }

  logger.info('All tests complete');
}

main().catch(err => {
  logger.error('Test failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
