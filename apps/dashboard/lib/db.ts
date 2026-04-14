import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { convertPgParamsToMysql } from '@bitalih/shared/sql/convert-pg-params';
import { parseMysqlDatabaseUrl } from '@bitalih/shared/sql/mysql-url';

const pool = mysql.createPool({
  ...parseMysqlDatabaseUrl(process.env.DATABASE_URL!),
  waitForConnections: true,
  connectionLimit: 20,
  idleTimeout: 30000,
  timezone: 'Z',
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const { sql, values } = convertPgParamsToMysql(text, params ?? []);
  const [rows] = await pool.query<RowDataPacket[]>(sql, values);
  return rows as T[];
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
  const { sql, values } = convertPgParamsToMysql(text, params ?? []);
  const [result] = await pool.query(sql, values);
  if (Array.isArray(result)) {
    return result.length;
  }
  return (result as ResultSetHeader).affectedRows ?? 0;
}

export async function getTransaction() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const run = async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
      const { sql, values } = convertPgParamsToMysql(text, params ?? []);
      const [rows] = await conn.query<RowDataPacket[]>(sql, values);
      return rows as T[];
    };

    return {
      commit: async () => {
        await conn.commit();
        conn.release();
      },
      rollback: async () => {
        await conn.rollback();
        conn.release();
      },
      query: run,
      queryOne: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
        const rows = await run<T>(text, params);
        return (rows[0] || null) as T | null;
      },
      release: () => {
        conn.release();
      },
    };
  } catch (error) {
    conn.release();
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
