import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function execute(
  text: string,
  params?: unknown[]
): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rowCount || 0;
  } finally {
    client.release();
  }
}

export async function getTransaction() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return {
      commit: async () => {
        await client.query('COMMIT');
      },
      rollback: async () => {
        await client.query('ROLLBACK');
      },
      query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
        const result = await client.query(text, params);
        return result.rows as T[];
      },
      queryOne: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
        const rows = await client.query(text, params);
        return (rows.rows[0] || null) as T | null;
      },
      release: () => {
        client.release();
      },
    };
  } catch (error) {
    client.release();
    throw error;
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export default pool;
