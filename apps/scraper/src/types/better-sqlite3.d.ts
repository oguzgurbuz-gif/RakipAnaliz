declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement<BindParameters extends unknown[] = unknown[]> {
    run(...params: BindParameters): RunResult;
    get(...params: BindParameters): unknown;
    all(...params: BindParameters): unknown[];
    iterate(...params: BindParameters): IterableIterator<unknown>;
  }

  class Database {
    constructor(filename: string, options?: { readonly?: boolean; fileMustExist?: boolean });
    open(): void;
    close(): void;
    prepare(sql: string): Statement;
    exec(sql: string): void;
    query(sql: string): Statement;
    transaction<T>(fn: () => T): {
      commit(): void;
      rollback(): void;
      savepoint(name: string): void;
      release(name: string): void;
    };
  }

  export = Database;
}
