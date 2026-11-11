import type {DatabaseSync} from 'node:sqlite';
export function initializeCollectiblesNode(db:DatabaseSync){db.exec(`CREATE TABLE IF NOT EXISTS collectible_albums(user_id TEXT PRIMARY KEY NOT NULL,data TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS collectible_trades(id TEXT PRIMARY KEY NOT NULL,seller TEXT NOT NULL,buyer TEXT NOT NULL,give_card TEXT NOT NULL,want_card TEXT,price INTEGER NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS collectible_trade_seller ON collectible_trades(seller,status);CREATE INDEX IF NOT EXISTS collectible_trade_buyer ON collectible_trades(buyer,status);`);}
