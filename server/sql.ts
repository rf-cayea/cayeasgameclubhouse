/**
 * The small asynchronous SQL surface shared by the Node game service and the
 * Cloudflare Worker. Both implementations run the same statements, so the room
 * logic reads identically whether the data lives in node:sqlite or D1.
 */
export interface SqlStatement { sql: string; params?: unknown[] }

export interface Sql {
  /** First matching row, or undefined when the statement returns nothing. */
  read<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /**
   * Runs statements in order. The first statement is the compare-and-set write:
   * it carries the revision it expects to find. With `requireFirstChange`, a zero
   * row count means another writer already advanced the room.
   */
  batch(statements: SqlStatement[], options?: { requireFirstChange?: boolean }): Promise<number[]>;
  /** Schema changes and multi-statement setup. */
  exec(sql: string): Promise<void>;
  /** Creates the schema once; a failure is not cached, so the next request retries. */
  ensure(): Promise<void>;
}

/** Idempotent schema for both stores; safe to run on every cold start. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS requests(code TEXT NOT NULL, actor TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(code,actor,id));
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS reward_outbox(match_id TEXT PRIMARY KEY, room_code TEXT NOT NULL, user_id TEXT NOT NULL, payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, receipt TEXT);
CREATE TABLE IF NOT EXISTS spades_rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS spades_requests(code TEXT NOT NULL, actor TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(code,actor,id));
CREATE TABLE IF NOT EXISTS spades_rewards(match_id TEXT PRIMARY KEY, room_code TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, receipt TEXT);
CREATE TABLE IF NOT EXISTS puzzle_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,game TEXT NOT NULL,level INTEGER NOT NULL,attempt INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',proof TEXT,created_at INTEGER NOT NULL,rules_version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS puzzle_runs_owner ON puzzle_runs(user_id,game);
CREATE INDEX IF NOT EXISTS rooms_recent ON rooms(updated_at);
CREATE INDEX IF NOT EXISTS spades_rooms_recent ON spades_rooms(updated_at);
CREATE INDEX IF NOT EXISTS reward_outbox_queue ON reward_outbox(status, next_attempt);
CREATE INDEX IF NOT EXISTS spades_rewards_queue ON spades_rewards(status, next_attempt);
`;
