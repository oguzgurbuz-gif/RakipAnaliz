import { getDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runSeeds() {
  const db = getDb();

  // Seeds are already included in migration 002, but provide standalone run here
  const seedPath = join(__dirname, '../../../db/migrations/002_seed_sites.sql');
  const sql = readFileSync(seedPath, 'utf-8');

  console.log('Running seeds via exec...');
  const { data, error } = await db.rpc('exec', { sql, params: null });
  if (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
  if (data && typeof data === 'object' && 'error' in (data as object)) {
    console.error('Seed SQL error:', data);
    process.exit(1);
  }

  console.log('Seeds completed successfully');
  process.exit(0);
}

runSeeds().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
