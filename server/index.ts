import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { RoomStore } from './rooms';
import { createGameServer } from './http';

for (const file of ['.env', '.env.local']) if (existsSync(file)) process.loadEnvFile(file);
const port = Number(process.env.RUMMY_API_PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RUMMY_API_PORT must be a valid port.');
const store = new RoomStore(resolve(process.env.RUMMY_DATA_FILE ?? '.data/rummy.sqlite'));
const { server, closeStreams, rewards } = createGameServer({ store, dist: fileURLToPath(new URL('../dist', import.meta.url)), origin: process.env.RUMMY_ORIGIN, secureCookie: process.env.RUMMY_COOKIE_SECURE === 'true' });
server.listen(port, process.env.RUMMY_HOST ?? '127.0.0.1', () => console.log(`Rummy game service listening on port ${port}.`));
let stopping = false;
const shutdown = async () => { if (stopping) return; stopping = true; closeStreams(); await rewards.stop(); server.close(() => { store.close(); process.exit(0); }); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
