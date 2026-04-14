import { getDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const DB_MIGRATIONS_PATH = '/app/db/migrations';

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
  console.log('Looking for migrations in:', DB_MIGRATIONS_PATH);

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

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
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
    console.log(`${filename} completed`);
  }
  
  console.log('All migrations completed successfully');
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
