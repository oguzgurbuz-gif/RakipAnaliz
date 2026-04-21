import 'dotenv/config';
import { getMysqlPool } from './index';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { mysqlQuery } from './compat-query';

const LEGACY_MIGRATIONS = new Set(['001_initial_schema.sql', '002_seed_sites.sql']);
const MUTABLE_MIGRATIONS = new Set(['002_seed_sites.sql']);

function findMigrationsDir(): string {
  if (process.env.DB_MIGRATIONS_PATH) return process.env.DB_MIGRATIONS_PATH;
  const candidates = [
    '/app/db/migrations',
    resolve(__dirname, '../../../../db/migrations'),
    resolve(__dirname, '../../../db/migrations'),
    resolve(process.cwd(), 'db/migrations'),
    resolve(process.cwd(), '../../db/migrations'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Could not locate db/migrations directory. Set DB_MIGRATIONS_PATH. Tried: ${candidates.join(', ')}`
  );
}

const DB_MIGRATIONS_PATH = findMigrationsDir();

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

async function runMigrations() {
  const pool = getMysqlPool();
  const conn = await pool.getConnection();

  const migrations = listMigrationFiles(DB_MIGRATIONS_PATH);

  console.log('Running migrations...');
  console.log('Looking for migrations in:', DB_MIGRATIONS_PATH);

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
        if (MUTABLE_MIGRATIONS.has(filename)) {
          await mysqlQuery(
            conn,
            `UPDATE schema_migrations
             SET checksum = $2, executed_at = NOW()
             WHERE filename = $1`,
            [filename, checksum]
          );
          console.log(`Updated checksum for mutable migration ${filename}`);
          continue;
        }
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
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
        throw error;
      }
      console.log(`${filename} completed`);
    }
  } finally {
    conn.release();
  }

  console.log('All migrations completed successfully');
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
