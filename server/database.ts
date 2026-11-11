import { RummyError } from '../src/lib/rummy-protocol';

/** Minimal D1 contract, also usable by the SQLite-backed integration tests. */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface D1Binding {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown>;
}

/** A request-scoped unit of work. D1 batch commits all command writes atomically.
 * The revision check executes inside that batch, so another Worker cannot overwrite
 * the room between its read and write. Never share an instance across requests.
 */
export class CloudDatabase {
  private pending: D1Statement[] | null = null;
  private guards: D1Statement[] = [];
  constructor(private readonly binding: D1Binding) {}
  prepare(sql: string) {
    return {
      get: async (...values: unknown[]) => this.binding.prepare(sql).bind(...values).first<Record<string, unknown>>(),
      run: async (...values: unknown[]) => {
        const statement = this.binding.prepare(sql).bind(...values);
        if (this.pending) { this.pending.push(statement); return; }
        await statement.run();
      },
    };
  }
  expectRoom(table: 'rooms' | 'spades_rooms', code: string, priorRevision: number) {
    if (!this.pending) throw new Error('Room writes require a command transaction.');
    this.guards.push(this.binding.prepare(`INSERT INTO command_guards(valid)
      SELECT CASE WHEN COALESCE((SELECT json_extract(data,'$.revision') FROM ${table} WHERE code=?),0)=? THEN 1 ELSE 0 END`).bind(code, priorRevision));
  }
  async exec(command: 'BEGIN IMMEDIATE' | 'COMMIT' | 'ROLLBACK') {
    if (command === 'BEGIN IMMEDIATE') {
      if (this.pending) throw new Error('Nested command transaction.');
      this.pending = []; this.guards = []; return;
    }
    if (command === 'ROLLBACK') { this.pending = null; this.guards = []; return; }
    const pending = this.pending;
    const guards = this.guards;
    this.pending = null; this.guards = [];
    if (!pending) throw new Error('No command transaction.');
    if (!pending.length) return;
    if (!guards.length) throw new Error('A room command is missing its revision guard.');
    try {
      await this.binding.batch([...guards, ...pending, this.binding.prepare('DELETE FROM command_guards')]);
    } catch (error) {
      if (/room_revision_matches/.test(String(error))) throw new RummyError('The table changed. Refresh before trying again.', 409, 'stale');
      throw error;
    }
  }
}
