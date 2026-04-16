import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { parseMysqlDatabaseUrl } from '@bitalih/shared/sql/mysql-url';

const DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:postgres@localhost:3306/campaigns';

describe('Database Schema Validation (MySQL)', () => {
  let pool: Pool;

  before(async () => {
    pool = createPool({
      ...parseMysqlDatabaseUrl(DATABASE_URL),
      connectionLimit: 2,
    });
  });

  after(async () => {
    await pool.end();
  });

  async function cols(table: string): Promise<string[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COLUMN_NAME AS column_name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?
       ORDER BY column_name`,
      [table]
    );
    return rows.map((r) => r.column_name as string);
  }

  describe('sites table', () => {
    it('should have required columns', async () => {
      const columns = await cols('sites');
      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('code'));
      assert.ok(columns.includes('name'));
      assert.ok(columns.includes('base_url'));
      assert.ok(columns.includes('is_active'));
      assert.ok(columns.includes('last_scraped_at'));
      assert.ok(columns.includes('last_scrape_status'));
      assert.ok(columns.includes('last_scrape_error'));
      assert.ok(columns.includes('last_scrape_duration'));
      assert.ok(columns.includes('campaign_count'));
    });
  });

  describe('campaigns table', () => {
    it('should have required columns', async () => {
      const columns = await cols('campaigns');
      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('site_id'));
      assert.ok(columns.includes('fingerprint'));
      assert.ok(columns.includes('version_no'));
      assert.ok(columns.includes('status'));
      assert.ok(columns.includes('is_visible_on_last_scrape'));
      assert.ok(columns.includes('valid_from'));
      assert.ok(columns.includes('valid_to'));
    });
  });

  describe('jobs table', () => {
    it('should have required columns', async () => {
      const columns = await cols('jobs');
      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('type'));
      assert.ok(columns.includes('status'));
      assert.ok(columns.includes('priority'));
      assert.ok(columns.includes('payload'));
      assert.ok(columns.includes('scheduled_at'));
      assert.ok(columns.includes('available_at'));
      assert.ok(columns.includes('result'));
      assert.ok(columns.includes('error'));
      assert.ok(columns.includes('max_attempts'));
      assert.ok(columns.includes('attempts'));
    });
  });

  describe('scrape_runs table', () => {
    it('should have required columns', async () => {
      const columns = await cols('scrape_runs');
      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('status'));
      assert.ok(columns.includes('started_at'));
      assert.ok(columns.includes('cards_found'));
      assert.ok(columns.includes('new_campaigns'));
      assert.ok(columns.includes('updated_campaigns'));
      assert.ok(columns.includes('unchanged'));
      assert.ok(columns.includes('site_id'));
    });
  });

  describe('scrape_run_sites table', () => {
    it('should have required columns', async () => {
      const columns = await cols('scrape_run_sites');
      assert.ok(columns.includes('id'));
      assert.ok(columns.includes('scrape_run_id'));
      assert.ok(columns.includes('site_id'));
      assert.ok(columns.includes('status'));
      assert.ok(columns.includes('cards_found'));
      assert.ok(columns.includes('new_campaigns'));
      assert.ok(columns.includes('updated_campaigns'));
    });
  });

  describe('sse_events table', () => {
    it('should have event_channel column (not channel)', async () => {
      const columns = await cols('sse_events');
      assert.ok(columns.includes('event_channel'));
      assert.ok(!columns.includes('channel'));
      assert.ok(columns.includes('event_type'));
      assert.ok(columns.includes('payload'));
    });
  });

  describe('campaign_similarities table', () => {
    it('should have campaign_id_1 and campaign_id_2 columns', async () => {
      const columns = await cols('campaign_similarities');
      assert.ok(columns.includes('campaign_id_1'));
      assert.ok(columns.includes('campaign_id_2'));
      assert.ok(columns.includes('similarity_score'));
    });

    it('should have unique constraint on campaign_id_1 and campaign_id_2', async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_schema = DATABASE()
        AND table_name = 'campaign_similarities'
        AND constraint_type = 'UNIQUE'`
      );
      assert.ok(rows.length > 0);
    });
  });

  describe('raw_campaign_snapshots table', () => {
    it('should exist (not raw_snapshots)', async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT TABLE_NAME AS table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = 'raw_campaign_snapshots'`
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].table_name, 'raw_campaign_snapshots');
    });
  });
});
