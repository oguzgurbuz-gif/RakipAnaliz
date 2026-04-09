import { getDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  ];
  
  console.log('Running migrations...');
  console.log('Looking for migrations in:', DB_MIGRATIONS_PATH);
  
  for (const filename of migrations) {
    const migrationPath = join(DB_MIGRATIONS_PATH, filename);
    const sql = readFileSync(migrationPath, 'utf-8');
    console.log(`Executing ${filename}...`);
    await db.query(sql);
    console.log(`${filename} completed`);
  }
  
  console.log('All migrations completed successfully');
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
