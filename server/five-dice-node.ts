import type { DatabaseSync } from 'node:sqlite';
/** Local equivalent of the additive hosted Farkle migration. */
export function initializeFiveDiceNode(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS five_dice_rooms(code TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS five_dice_requests(principal TEXT NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL,response TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(principal,request_id));
    CREATE TABLE IF NOT EXISTS five_dice_rewards(match_id TEXT PRIMARY KEY NOT NULL,room_code TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);`);
}
