import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { SCHEMA } from '../../server/sql';
import type { D1Database, D1PreparedStatement } from '../../server/d1';

type Row = Record<string, unknown>;

/** D1 accepts booleans and undefined where SQLite wants 0/1 and NULL. */
function normalize(values: unknown[]): never[] {
  return values.map(value => value === undefined ? null : typeof value === 'boolean' ? Number(value) : value) as never[];
}

class TestStatement implements D1PreparedStatement {
  constructor(private readonly db: DatabaseSync, private readonly sql: string, private readonly values: unknown[] = []) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestStatement(this.db, this.sql, values);
  }

  private prepared(): StatementSync {
    return this.db.prepare(this.sql);
  }

  async first<T = Row>(): Promise<T | null> {
    return (this.prepared().get(...normalize(this.values)) as T | undefined) ?? null;
  }

  async all<T = Row>(): Promise<{ results: T[] }> {
    return { results: this.prepared().all(...normalize(this.values)) as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return this.execute();
  }

  /** Synchronous execution; batches and fixture arrangements run statements in order. */
  execute(): { meta: { changes: number } } {
    const result = this.prepared().run(...normalize(this.values));
    return { meta: { changes: Number(result.changes ?? 0) } };
  }
}

/**
 * An in-memory stand-in for the Cloudflare D1 binding.
 *
 * `prepare`/`batch`/`exec` mirror the real binding so the same storage code runs
 * under test, and `sqlite` exposes the raw handle for arranging fixture rows and
 * for assertions that must read what was actually persisted. Batches are atomic:
 * a failing statement rolls back the ones before it, as D1 batches do.
 */
export class TestD1 implements D1Database {
  readonly sqlite: DatabaseSync;
  private savepoints = 0;

  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(SCHEMA);
  }

  prepare(sql: string): D1PreparedStatement {
    return new TestStatement(this.sqlite, sql);
  }

  async batch(statements: D1PreparedStatement[]): Promise<{ meta: { changes: number } }[]> {
    if (!statements.length) return [];
    // A savepoint nests inside any transaction a fixture already opened, so the
    // helper never invalidates a caller's own BEGIN/COMMIT.
    const savepoint = `test_d1_batch_${++this.savepoints}`;
    this.sqlite.exec(`SAVEPOINT ${savepoint}`);
    try {
      const results = statements.map(statement => (statement as TestStatement).execute());
      this.sqlite.exec(`RELEASE ${savepoint}`);
      return results;
    } catch (error) {
      this.sqlite.exec(`ROLLBACK TO ${savepoint}`);
      this.sqlite.exec(`RELEASE ${savepoint}`);
      throw error;
    }
  }

  async exec(sql: string): Promise<void> {
    this.sqlite.exec(sql);
  }

  close(): void {
    this.sqlite.close();
  }
}
