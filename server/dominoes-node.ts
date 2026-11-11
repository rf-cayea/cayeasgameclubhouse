import type { DatabaseSync } from 'node:sqlite';
/** Local equivalent of the additive hosted Dominoes migration. */
export function initializeDominoNode(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS domino_rooms(code TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS domino_requests(principal TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,response TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(principal,request_id));
    CREATE TABLE IF NOT EXISTS domino_rewards(match_id TEXT PRIMARY KEY NOT NULL,room_code TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);`);
}
