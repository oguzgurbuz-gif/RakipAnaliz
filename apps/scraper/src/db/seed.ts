import { getDb } from './index';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runSeeds() {
  const db = getDb();
  
  const seedPath = join(__dirname, '../../../db/migrations/002_seed_sites.sql');
  const sql = readFileSync(seedPath, 'utf-8');
  
  console.log('Running seeds...');
  await db.query(sql);
  console.log('Seeds completed successfully');
  
  process.exit(0);
}

runSeeds().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
