import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Binding, D1Statement } from '../../server/database';

// Real SQLite emulates D1's asynchronous API and atomic, ordered batch execution.
export class TestD1 implements D1Binding {
  readonly sqlite = new DatabaseSync(':memory:');
  constructor() {
    // Exercise the same journal and SQL files that Sites applies in production.
    const journal = JSON.parse(readFileSync(new URL('../../drizzle/meta/_journal.json', import.meta.url), 'utf8')) as { entries: { idx: number; tag: string }[] };
    for (const migration of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
      this.sqlite.exec(readFileSync(new URL(`../../drizzle/${migration.tag}.sql`, import.meta.url), 'utf8'));
    }
  }
  prepare(sql: string): D1Statement {
    let values: (string | number | null)[] = [];
    const statement = {
      bind: (...input: unknown[]) => { values = input as typeof values; return statement; },
      first: async <T>() => (this.sqlite.prepare(sql).get(...values) ?? null) as T | null,
      run: async () => this.sqlite.prepare(sql).run(...values),
      execute: () => this.sqlite.prepare(sql).run(...values),
    };
    return statement;
  }
  async batch(statements: D1Statement[]) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const statement of statements) (statement as D1Statement & { execute(): unknown }).execute();
      this.sqlite.exec('COMMIT');
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
