import { describe, it, expect } from 'node:test';
import { getDb, query, queryOne, closeDb } from '../db';
import { Pool } from 'pg';

describe('Smoke Tests - Database Operations', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = getDb() as Pool;
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('Database Connection', () => {
    it('should connect to database', async () => {
      const result = await pool.query('SELECT NOW() as now');
      expect(result.rows[0].now).toBeDefined();
    });
  });

  describe('Sites Operations', () => {
    it('should query sites', async () => {
      const sites = await query<{ id: string; code: string; name: string }>(
        'SELECT id, code, name FROM sites LIMIT 5'
      );
      expect(Array.isArray(sites)).toBe(true);
    });

    it('should find site by code', async () => {
      const site = await queryOne<{ id: string; code: string }>(
        'SELECT id, code FROM sites WHERE code = $1',
        ['misli']
      );
      expect(site).not.toBeNull();
      expect(site?.code).toBe('misli');
    });
  });

  describe('Campaigns Operations', () => {
    it('should query campaigns', async () => {
      const campaigns = await query<{ id: string; fingerprint: string }>(
        'SELECT id, fingerprint FROM campaigns LIMIT 1'
      );
      expect(Array.isArray(campaigns)).toBe(true);
    });
  });

  describe('Jobs Operations', () => {
    it('should query jobs table structure', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'jobs'
        AND column_name IN ('id', 'type', 'status', 'result', 'error')
      `);
      const columns = result.rows.map(r => r.column_name);
      expect(columns).toContain('result');
      expect(columns).toContain('error');
    });

    it('should insert and select a job', async () => {
      const testJobId = await query<{ id: string }>(`
        INSERT INTO jobs (type, status, priority, payload)
        VALUES ('test-job', 'pending', 0, '{"test": true}'::jsonb)
        RETURNING id
      `);

      expect(testJobId[0]).toBeDefined();
      expect(testJobId[0].id).toBeDefined();

      // Cleanup
      await pool.query('DELETE FROM jobs WHERE id = $1', [testJobId[0].id]);
    });
  });

  describe('Scrape Runs Operations', () => {
    it('should insert a scrape run with correct columns', async () => {
      const site = await queryOne<{ id: string }>('SELECT id FROM sites LIMIT 1');
      if (!site) {
        console.log('Skipping scrape run test - no sites found');
        return;
      }

      const result = await pool.query(`
        INSERT INTO scrape_runs (site_id, status, started_at, cards_found, new_campaigns, updated_campaigns, unchanged)
        VALUES ($1, 'running', NOW(), 0, 0, 0, 0)
        RETURNING id
      `, [site.id]);

      expect(result.rows[0]).toBeDefined();

      // Cleanup
      await pool.query('DELETE FROM scrape_runs WHERE id = $1', [result.rows[0].id]);
    });
  });

  describe('SSE Events Operations', () => {
    it('should insert sse_event with event_channel (not channel)', async () => {
      const result = await pool.query(`
        INSERT INTO sse_events (event_type, event_channel, payload)
        VALUES ('test-event', 'test-channel', '{"data": "test"}'::jsonb)
        RETURNING id
      `);

      expect(result.rows[0]).toBeDefined();

      // Cleanup
      await pool.query('DELETE FROM sse_events WHERE id = $1', [result.rows[0].id]);
    });
  });

  describe('Campaign Similarities Operations', () => {
    it('should have correct column names', async () => {
      const result = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'campaign_similarities'
      `);
      const columns = result.rows.map(r => r.column_name);

      expect(columns).toContain('campaign_id_1');
      expect(columns).toContain('campaign_id_2');
      expect(columns).not.toContain('matched_fields');
    });
  });
});
