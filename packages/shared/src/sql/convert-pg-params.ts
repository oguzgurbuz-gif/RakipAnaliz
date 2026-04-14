/**
 * Expands PostgreSQL-style $1, $2 placeholders into MySQL ? placeholders,
 * duplicating parameter values when the same $n appears multiple times.
 */
export function convertPgParamsToMysql(
  sql: string,
  params: unknown[] = []
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const mysqlSql = sql.replace(/\$(\d+)/g, (_, raw: string) => {
    const idx = parseInt(raw, 10) - 1;
    if (idx < 0 || idx >= params.length) {
      throw new Error(`SQL parameter $${raw} is out of range (only ${params.length} bound values)`);
    }
    values.push(params[idx]);
    return '?';
  });
  return { sql: mysqlSql, values };
}

export function isMysqlConnectionString(url: string | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return u.startsWith('mysql://') || u.startsWith('mysql2://');
}
