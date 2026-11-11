import {readFileSync} from 'node:fs';
import type {DatabaseSync} from 'node:sqlite';
export function initializeMatchmakingNode(db:DatabaseSync){
 const sql=readFileSync(new URL('../drizzle/0014_public_matchmaking.sql',import.meta.url),'utf8');
 db.exec(sql.replaceAll('CREATE TABLE ','CREATE TABLE IF NOT EXISTS ').replaceAll('CREATE UNIQUE INDEX ','CREATE UNIQUE INDEX IF NOT EXISTS ').replaceAll('CREATE INDEX ','CREATE INDEX IF NOT EXISTS '));
}
