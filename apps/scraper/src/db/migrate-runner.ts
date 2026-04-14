import 'dotenv/config';
import { getMysqlPool, closeDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { mysqlQuery } from './compat-query';

const DB_MIGRATIONS_PATH = '/app/db/migrations';
const LEGACY_MIGRATIONS = new Set(['001_initial_schema.sql', '002_seed_sites.sql']);

async function runMigrations() {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();

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

  await mysqlQuery(
    conn,
    `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      executed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    )
  `
  );

  const hasSitesTable = await mysqlQuery<{ exists: number }>(
    conn,
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'sites'
    ) AS \`exists\`
  `
  );
  const isLegacyDatabase = Boolean(hasSitesTable.rows[0]?.exists);

  try {
    for (const filename of migrations) {
      const migrationPath = join(DB_MIGRATIONS_PATH, filename);
      const sql = readFileSync(migrationPath, 'utf-8');
      const checksum = createHash('sha256').update(sql).digest('hex');

      const existing = await mysqlQuery<{ checksum: string }>(
        conn,
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
      try {
        await conn.query(sql);
        await mysqlQuery(
          conn,
          `INSERT INTO schema_migrations (filename, checksum, executed_at)
           VALUES ($1, $2, NOW())`,
          [filename, checksum]
        );
        console.log(`${filename} completed`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isLegacyBootstrapError =
          isLegacyDatabase &&
          LEGACY_MIGRATIONS.has(filename) &&
          (message.includes('already exists') ||
            message.includes('Duplicate entry') ||
            message.includes('duplicate key'));

        if (isLegacyBootstrapError) {
          await mysqlQuery(
            conn,
            `INSERT INTO schema_migrations (filename, checksum, executed_at)
             VALUES ($1, $2, NOW())
             ON DUPLICATE KEY UPDATE filename = filename`,
            [filename, checksum]
          );
          console.log(`Marking ${filename} as applied for legacy database`);
          continue;
        }
        throw err;
      }
    }
  } finally {
    conn.release();
    // Important: the MySQL pool keeps Node's event loop alive.
    // We need to close it so `migrate.cjs && index.cjs` can proceed.
    await closeDb();
  }

  console.log('All migrations completed');
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
