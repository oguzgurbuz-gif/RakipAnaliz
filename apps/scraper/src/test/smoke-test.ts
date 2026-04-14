import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, queryOne, closeDb } from '../db';

describe('Smoke Tests - Database Operations', () => {
  after(async () => {
    await closeDb();
  });

  describe('Database Connection', () => {
    it('should connect to database', async () => {
      const rows = await query<{ now: Date }>('SELECT NOW() as now');
      assert.ok(rows[0]?.now);
    });
  });

  describe('Sites Operations', () => {
    it('should query sites', async () => {
      const sites = await query<{ id: string; code: string; name: string }>(
        'SELECT id, code, name FROM sites LIMIT 5'
      );
      assert.equal(Array.isArray(sites), true);
    });

    it('should find site by code', async () => {
      const site = await queryOne<{ id: string; code: string }>(
        'SELECT id, code FROM sites WHERE code = $1',
        ['misli']
      );
      assert.notEqual(site, null);
      assert.equal(site?.code, 'misli');
    });
  });

  describe('Campaigns Operations', () => {
    it('should query campaigns', async () => {
      const campaigns = await query<{ id: string; fingerprint: string }>(
        'SELECT id, fingerprint FROM campaigns LIMIT 1'
      );
      assert.equal(Array.isArray(campaigns), true);
    });
  });

  describe('Jobs Operations', () => {
    it('should query jobs table structure', async () => {
      const rows = await query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 'jobs'
        AND column_name IN ('id', 'type', 'status', 'result', 'error')
      `);
      const columns = rows.map((r) => r.column_name);
      assert.ok(columns.includes('result'));
      assert.ok(columns.includes('error'));
    });

    it('should insert and select a job', async () => {
      const inserted = await query<{ id: string }>(`
        INSERT INTO jobs (type, status, priority, payload)
        VALUES ('test-job', 'pending', 0, CAST('{"test": true}' AS JSON))
        RETURNING CAST(id AS CHAR) as id
      `);

      assert.ok(inserted[0]);
      assert.ok(inserted[0].id);

      await query('DELETE FROM jobs WHERE id = $1', [inserted[0].id]);
    });
  });

  describe('Scrape Runs Operations', () => {
    it('should insert a scrape run with correct columns', async () => {
      const site = await queryOne<{ id: string }>('SELECT id FROM sites LIMIT 1');
      if (!site) {
        console.log('Skipping scrape run test - no sites found');
        return;
      }

      const rows = await query<{ id: string }>(
        `
        INSERT INTO scrape_runs (site_id, status, started_at, cards_found, new_campaigns, updated_campaigns, unchanged)
        VALUES ($1, 'running', NOW(), 0, 0, 0, 0)
        RETURNING id
      `,
        [site.id]
      );

      assert.ok(rows[0]);

      await query('DELETE FROM scrape_runs WHERE id = $1', [rows[0].id]);
    });
  });

  describe('SSE Events Operations', () => {
    it('should insert sse_event with event_channel (not channel)', async () => {
      const rows = await query<{ id: string }>(`
        INSERT INTO sse_events (event_type, event_channel, payload)
        VALUES ('test-event', 'test-channel', CAST('{"data": "test"}' AS JSON))
        RETURNING CAST(id AS CHAR) as id
      `);

      assert.ok(rows[0]);

      await query('DELETE FROM sse_events WHERE id = $1', [rows[0].id]);
    });
  });

  describe('Campaign Similarities Operations', () => {
    it('should have correct column names', async () => {
      const result = await query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 'campaign_similarities'
      `);
      const columns = result.map((r) => r.column_name);

      assert.ok(columns.includes('campaign_id_1'));
      assert.ok(columns.includes('campaign_id_2'));
      assert.ok(!columns.includes('matched_fields'));
    });
  });
});
