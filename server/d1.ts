import { SCHEMA, type Sql, type SqlStatement } from './sql';

/** The subset of the Cloudflare D1 binding this service uses. */
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<{ meta?: { changes?: number } }[]>;
  exec(sql: string): Promise<unknown>;
}

/** Cloudflare storage. Every batch is one D1 transaction. */
export function d1Sql(db: D1Database): Sql {
  let schema: Promise<void> | null = null;
  return {
    async read<T>(sql: string, params: unknown[] = []) {
      return (await db.prepare(sql).bind(...params).first<T>()) ?? undefined;
    },
    async batch(statements: SqlStatement[]) {
      if (!statements.length) return [];
      const results = await db.batch(statements.map(statement => db.prepare(statement.sql).bind(...(statement.params ?? []))));
      // A rejected revision guard leaves the earlier statements applied only in the
      // rare cross-isolate race; callers treat the zero count as a lost update.
      return results.map(result => Number(result.meta?.changes ?? 0));
    },
    async exec(sql: string) { await db.exec(sql); },
    ensure() {
      schema ??= (async () => {
        for (const statement of SCHEMA.split(';').map(value => value.trim()).filter(Boolean)) await db.prepare(statement).run();
      })().catch(error => { schema = null; throw error; });
      return schema;
    },
  };
}
