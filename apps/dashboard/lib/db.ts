// Supabase-backed database layer for the dashboard
// Uses the `exec` RPC function for raw SQL (compatible with existing API routes).
// The exec function must be created in Supabase — see db/migrations/006_supabase_rpc.sql
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function getPool(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    }
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

// ─── Raw SQL via exec RPC ─────────────────────────────────────────────────────
// Compatible with the old pg Pool.query() interface.
// Usage: query<T>('SELECT * FROM campaigns WHERE id = $1', [id])
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const db = getPool();
  const { data, error } = await db.rpc('exec', {
    sql,
    params: params ?? null,
  });
  if (error) throw error;
  // The exec function returns JSONB array
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  if (!Array.isArray(parsed)) return [];
  return parsed as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params?: unknown[]
): Promise<number> {
  const db = getPool();
  const { data, error } = await db.rpc('exec', {
    sql,
    params: params ?? null,
  });
  if (error) throw error;
  // For INSERT/UPDATE/DELETE, exec returns a JSONB object from the SQL result
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  if (parsed && typeof parsed === 'object' && 'rowCount' in parsed) {
    return (parsed as { rowCount: number }).rowCount ?? 0;
  }
  return 0;
}

export async function getTransaction() {
  // Supabase JS doesn't support manual BEGIN/COMMIT/ROLLBACK.
  // All operations auto-commit individually.
  // For transactional consistency, use the `exec` RPC with a SQL transaction block.
  const db = getPool();
  return {
    async commit() {},
    async rollback() {},
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
      return query<T>(sql, params);
    },
    async queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
      return queryOne<T>(sql, params);
    },
  };
}

export async function checkConnection(): Promise<boolean> {
  try {
    const db = getPool();
    const { error } = await db.rpc('exec', {
      sql: 'SELECT 1',
      params: null,
    });
    return !error;
  } catch {
    return false;
  }
}

export default getPool;
