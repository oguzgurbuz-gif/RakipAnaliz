import { getDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigrations() {
  const db = getDb();
  
  const migrationPath = join(__dirname, '../../../db/migrations/001_initial_schema.sql');
  const sql = readFileSync(migrationPath, 'utf-8');
  
  console.log('Running migrations...');
  await db.query(sql);
  console.log('Migrations completed successfully');
  
  process.exit(0);
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
