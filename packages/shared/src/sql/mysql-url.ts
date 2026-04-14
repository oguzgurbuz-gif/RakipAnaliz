export interface ParsedMysqlDatabaseUrl {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
}

/** Parse a `mysql://user:pass@host:port/dbname` URL into mysql2 pool/connection fields. */
export function parseMysqlDatabaseUrl(urlStr: string): ParsedMysqlDatabaseUrl {
  if (!urlStr.startsWith('mysql://')) {
    throw new Error('DATABASE_URL must start with mysql://');
  }
  const normalized = `http://${urlStr.slice('mysql://'.length)}`;
  const u = new URL(normalized);
  const databasePath = u.pathname.replace(/^\//, '').split('?')[0];
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username || ''),
    password: decodeURIComponent(u.password || ''),
    database: databasePath || undefined,
  };
}
