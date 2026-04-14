import 'dotenv/config';
import { getDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const DB_MIGRATIONS_PATH = '/app/db/migrations';
const LEGACY_MIGRATIONS = new Set(['001_initial_schema.sql', '002_seed_sites.sql']);

async function runMigrations() {
  const db = getDb();
  
  const migrations = [
    '001_initial_schema.sql',
    '002_seed_sites.sql',
    '003_fix_schema.sql',
    '004_fix_bitalih_schema.sql',
    '005_add_performance_indexes.sql',
    '006_add_search_indexes.sql',
    '007_legacy_schema_compat.sql',
  ];
  
  console.log('Running migrations...');

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const hasSitesTable = await db.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'sites'
    ) AS exists
  `);
  const isLegacyDatabase = Boolean(hasSitesTable.rows[0]?.exists);
  for (const filename of migrations) {
    const migrationPath = join(DB_MIGRATIONS_PATH, filename);
    const sql = readFileSync(migrationPath, 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    const existing = await db.query(
      'SELECT checksum FROM schema_migrations WHERE filename = $1',
      [filename]
    );

    if (existing.rowCount && existing.rows[0].checksum === checksum) {
      console.log(`Skipping ${filename} (already applied)`);
      continue;
    }

    if (existing.rowCount) {
      throw new Error(
        `Migration checksum mismatch for ${filename}. Migration file changed after being applied.`
      );
    }

    console.log(`Executing ${filename}...`);
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query(
        `INSERT INTO schema_migrations (filename, checksum, executed_at)
         VALUES ($1, $2, NOW())`,
        [filename, checksum]
      );
      await db.query('COMMIT');
      console.log(`${filename} completed`);
    } catch (err) {
      await db.query('ROLLBACK');
      const message = err instanceof Error ? err.message : String(err);
      const isLegacyBootstrapError =
        isLegacyDatabase &&
        LEGACY_MIGRATIONS.has(filename) &&
        (message.includes('already exists') || message.includes('duplicate key value'));

      if (isLegacyBootstrapError) {
        await db.query(
          `INSERT INTO schema_migrations (filename, checksum, executed_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (filename) DO NOTHING`,
          [filename, checksum]
        );
        console.log(`Marking ${filename} as applied for legacy database`);
        continue;
      }
      throw err;
    }
  }

  console.log('All migrations completed');
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
