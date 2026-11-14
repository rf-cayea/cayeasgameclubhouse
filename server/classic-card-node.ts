import type { DatabaseSync } from 'node:sqlite';

export function initializeClassicCardNode(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS classic_card_rooms (code TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS classic_card_lobby ON classic_card_rooms (json_extract(data, '$.kind'), json_extract(data, '$.updatedAt') DESC)
      WHERE json_extract(data, '$.options.listed')=1 AND json_extract(data, '$.game') IS NULL;
    CREATE TABLE IF NOT EXISTS classic_card_requests (principal TEXT NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL, code TEXT, created_at INTEGER NOT NULL, PRIMARY KEY (principal, request_id));
    CREATE INDEX IF NOT EXISTS classic_card_request_age ON classic_card_requests (created_at);
    CREATE TABLE IF NOT EXISTS classic_card_rewards (match_id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL,
      game TEXT NOT NULL CHECK (game IN ('crazy-eights', 'hearts')), tier TEXT NOT NULL CHECK (tier IN ('normal', 'humans')));
    CREATE INDEX IF NOT EXISTS classic_card_rewards_player ON classic_card_rewards (user_id);`);
}
