import { getDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigrations() {
  const db = getDb();

  // Run each migration file in order via exec RPC
  const migrationFiles = [
    '001_initial_schema.sql',
    '002_seed_sites.sql',
    '003_fix_schema.sql',
    '004_fix_bitalih_schema.sql',
    '005_add_performance_indexes.sql',
    '006_supabase_rpc.sql',
  ];

  console.log('Running Supabase migrations...');

  for (const filename of migrationFiles) {
    const migrationPath = join(__dirname, `../../../db/migrations/${filename}`);
    const sql = readFileSync(migrationPath, 'utf-8');

    console.log(`Executing ${filename}...`);
    const { data, error } = await db.rpc('exec', { sql, params: null });
    if (error) {
      console.error(`Migration ${filename} failed:`, error);
      process.exit(1);
    }
    if (data && typeof data === 'object' && 'error' in (data as object)) {
      console.error(`Migration ${filename} SQL error:`, data);
      process.exit(1);
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
