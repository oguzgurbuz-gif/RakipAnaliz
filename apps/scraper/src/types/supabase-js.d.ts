// Minimal type stub for @supabase/supabase-js
// Install with: pnpm add @supabase/supabase-js
declare module '@supabase/supabase-js' {
  export interface QueryError {
    message: string;
    code: string;
    details?: string;
    hint?: string;
  }

  // PostgREST response when awaiting a QueryBuilder
  export interface QueryResponse<T> {
    data: T[];
    error: null;
  }

  // PostgREST response with count option
  export interface QueryResponseCount<T> {
    data: T[];
    error: null;
    count: number;
  }

  export interface QueryBuilder<T = Record<string, unknown>> {
    then<TResult>(
      onfulfilled?: ((value: QueryResponse<T>) => TResult) | null,
      onrejected?: ((reason: QueryError) => TResult) | null
    ): Promise<TResult>;
    select(
      columns?: string,
      options?: { head?: boolean; count?: 'exact' | 'planned' | 'estimated' }
    ): QueryBuilder<T>;
    insert(data: Record<string, unknown>): QueryBuilder<T>;
    update(data: Record<string, unknown>): QueryBuilder<T>;
    upsert(
      data: Record<string, unknown>,
      config?: { onConflict?: string }
    ): QueryBuilder<T>;
    delete(): QueryBuilder<T>;
    eq(key: string, value: unknown): QueryBuilder<T>;
    neq(key: string, value: unknown): QueryBuilder<T>;
    in(key: string, values: unknown[]): QueryBuilder<T>;
    not(key: string, op: string, value: unknown): QueryBuilder<T>;
    gte(key: string, value: unknown): QueryBuilder<T>;
    lte(key: string, value: unknown): QueryBuilder<T>;
    lt(key: string, value: unknown): QueryBuilder<T>;
    like(key: string, value: string): QueryBuilder<T>;
    ilike(key: string, value: string): QueryBuilder<T>;
    is(key: string, value: unknown): QueryBuilder<T>;
    order(
      column: string,
      options?: { ascending?: boolean; nulls?: 'first' | 'last' }
    ): QueryBuilder<T>;
    limit(n: number): QueryBuilder<T>;
    range(from: number, to: number): QueryBuilder<T>;
    single(): Promise<{ data: T; error: null }>;
    maybeSingle(): Promise<{ data: T | null; error: QueryError | null }>;
  }

  export interface SupabaseClientOptions {
    auth?: {
      persistSession?: boolean;
      autoRefreshToken?: boolean;
    };
    db?: {
      schema?: string;
    };
    global?: Record<string, unknown>;
  }

  export interface SupabaseClient {
    from(table: string): QueryBuilder;
    rpc(
      fn: string,
      params?: Record<string, unknown>
    ): Promise<{ data: unknown; error: QueryError | null }>;
  }

  export function createClient(
    url: string,
    anonKey: string,
    options?: SupabaseClientOptions
  ): SupabaseClient;
}
