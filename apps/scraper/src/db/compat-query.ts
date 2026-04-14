import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ResultSetHeader } from 'mysql2';
import { convertPgParamsToMysql } from '@bitalih/shared/sql/convert-pg-params';

export type DbExecutor = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
};

function isRowArray(r: unknown): r is RowDataPacket[] {
  return Array.isArray(r);
}

export async function mysqlQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  executor: Pool | PoolConnection,
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const { sql, values } = convertPgParamsToMysql(text, params ?? []);
  const [result] = await executor.query<RowDataPacket[] | ResultSetHeader>(sql, values);
  if (isRowArray(result)) {
    return { rows: result as T[], rowCount: result.length };
  }
  const header = result as ResultSetHeader;
  return { rows: [], rowCount: header.affectedRows ?? 0 };
}

export function poolAsExecutor(pool: Pool): DbExecutor {
  return {
    query: (text, params) => mysqlQuery(pool, text, params),
  };
}
