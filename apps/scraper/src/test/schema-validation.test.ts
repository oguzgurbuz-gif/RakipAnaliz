import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'node:test';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@db:5432/campaigns';

describe('Database Schema Validation', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query('SET search_path TO public');
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('sites table', () => {
    it('should have required columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'sites'
        ORDER BY column_name
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('code');
      expect(columns).toContain('name');
      expect(columns).toContain('base_url');
      expect(columns).toContain('is_active');
      expect(columns).toContain('last_scraped_at');
      expect(columns).toContain('last_scrape_status');
      expect(columns).toContain('last_scrape_error');
      expect(columns).toContain('last_scrape_duration');
      expect(columns).toContain('campaign_count');
    });
  });

  describe('campaigns table', () => {
    it('should have required columns', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'campaigns'
        ORDER BY column_name
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('site_id');
      expect(columns).toContain('fingerprint');
      expect(columns).toContain('version_no');
      expect(columns).toContain('status');
      expect(columns).toContain('is_visible_on_last_scrape');
      expect(columns).toContain('valid_from');
      expect(columns).toContain('valid_to');
    });
  });

  describe('jobs table', () => {
    it('should have required columns', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'jobs'
        ORDER BY column_name
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('type');
      expect(columns).toContain('status');
      expect(columns).toContain('priority');
      expect(columns).toContain('payload');
      expect(columns).toContain('scheduled_at');
      expect(columns).toContain('available_at');
      expect(columns).toContain('result');
      expect(columns).toContain('error');
      expect(columns).toContain('max_attempts');
      expect(columns).toContain('attempts');
    });
  });

  describe('scrape_runs table', () => {
    it('should have required columns', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'scrape_runs'
        ORDER BY column_name
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('status');
      expect(columns).toContain('started_at');
      expect(columns).toContain('cards_found');
      expect(columns).toContain('new_campaigns');
      expect(columns).toContain('updated_campaigns');
      expect(columns).toContain('unchanged');
      expect(columns).toContain('site_id');
    });
  });

  describe('scrape_run_sites table', () => {
    it('should have required columns', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'scrape_run_sites'
        ORDER BY column_name
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('id');
      expect(columns).toContain('scrape_run_id');
      expect(columns).toContain('site_id');
      expect(columns).toContain('status');
      expect(columns).toContain('cards_found');
      expect(columns).toContain('new_campaigns');
      expect(columns).toContain('updated_campaigns');
    });
  });

  describe('sse_events table', () => {
    it('should have event_channel column (not channel)', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'sse_events'
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('event_channel');
      expect(columns).not.toContain('channel');
      expect(columns).toContain('event_type');
      expect(columns).toContain('payload');
    });
  });

  describe('campaign_similarities table', () => {
    it('should have campaign_id_1 and campaign_id_2 columns', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'campaign_similarities'
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('campaign_id_1');
      expect(columns).toContain('campaign_id_2');
      expect(columns).toContain('similarity_score');
    });

    it('should have unique constraint on campaign_id_1 and campaign_id_2', async () => {
      const result = await pool.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'campaign_similarities'
        AND constraint_type = 'UNIQUE'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('raw_campaign_snapshots table', () => {
    it('should exist (not raw_snapshots)', async () => {
      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = 'raw_campaign_snapshots'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].table_name).toBe('raw_campaign_snapshots');
    });
  });

  describe('recalculate_campaign_status function', () => {
    it('should exist', async () => {
      const result = await pool.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_name = 'recalculate_campaign_status'
      `);

      expect(result.rows.length).toBe(1);
    });
  });
});
