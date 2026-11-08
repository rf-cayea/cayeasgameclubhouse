import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA, type Sql, type SqlStatement } from './sql';

const count = (value: unknown) => Number((value as { changes?: bigint | number }).changes ?? 0);

export interface SqliteSql extends Sql {
  /** Direct handle for fixtures and maintenance; application code uses Sql. */
  raw: DatabaseSync;
  close: () => void;
}

/** Node game service storage. Run exactly one instance per database file. */
export function sqliteSql(path: string): SqliteSql {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  let schema: Promise<void> | null = null;
  let closed = false;
  return {
    raw: db,
    async read<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    async batch(statements: SqlStatement[], options: { requireFirstChange?: boolean } = {}) {
      if (!statements.length) return [];
      db.exec('BEGIN IMMEDIATE');
      try {
        const changes = statements.map(statement => count(db.prepare(statement.sql).run(...((statement.params ?? []) as never[]))));
        if (options.requireFirstChange && changes[0] === 0) { db.exec('ROLLBACK'); return changes; }
        db.exec('COMMIT');
        return changes;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async exec(sql: string) { db.exec(sql); },
    ensure() {
      schema ??= (async () => { db.exec(SCHEMA); })().catch(error => { schema = null; throw error; });
      return schema;
    },
    close() { if (!closed) { closed = true; db.close(); } },
  };
}
