// Runs the production Worker bundle against a node:sqlite stand-in for D1 so the
// deployed SQL, routing, cookies and gameplay are exercised before any deploy.
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const bundle = '.cache/worker-smoke/index.js';
await build({ entryPoints: ['server/worker.ts'], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
  conditions: ['worker', 'browser'], mainFields: ['module', 'main'], outfile: bundle, legalComments: 'none', logLevel: 'error' });
const worker = (await import(new URL(`../${bundle}`, import.meta.url).href)).default;

const db = new DatabaseSync(':memory:');
function prepared(sql) {
  let params = [];
  const statement = {
    bind(...values) { params = values; return statement; },
    async first() { return db.prepare(sql).get(...params) ?? null; },
    async all() { return { results: db.prepare(sql).all(...params) }; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...params).changes ?? 0) } }; },
  };
  return statement;
}
const DB = {
  prepare: prepared,
  async batch(statements) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      db.exec('COMMIT');
      return results;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  },
  async exec(sql) { db.exec(sql); },
};
const ASSETS = { async fetch(request) { return new Response(`<html data-path="${new URL(request.url).pathname}"></html>`, { headers: { 'Content-Type': 'text/html' } }); } };
const ctx = { waitUntil() { /* Rewards flush immediately in this harness. */ } };
const env = { DB, ASSETS };
const call = (path, init = {}) => worker.fetch(new Request(`https://clubhouse.test${path}`, init), env, ctx);

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`PASS: ${label}`);
  else { failures++; console.log(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`); }
};
const cookieFrom = (response) => (response.headers.get('set-cookie') ?? '').split(';')[0];

check('rummy health', (await call('/api/rummy/health')).status === 200);
check('spades health', (await call('/api/spades/health')).status === 200);

const session = await call('/api/rummy/session');
const cookie = cookieFrom(session);
check('guest session returns a cookie', session.status === 200 && cookie.startsWith('cayea_rummy='), cookie);
check('guest session body', (await session.clone().json()).member === false);

const create = await call('/api/rummy', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://clubhouse.test', Cookie: cookie },
  body: JSON.stringify({ operation: 'create', name: 'Tester', options: { mode: 'bot', variant: 'classic', seats: 2, level: 'normal', jokers: false } }),
});
const room = await create.json();
check('create bot room', create.status === 200 && /^[A-F0-9]{8}$/.test(room.code ?? ''), JSON.stringify(room).slice(0, 160));
check('dealt a hand', Array.isArray(room.hand) && room.hand.length === 10, String(room.hand?.length));
check('room is playing', room.status === 'playing' && room.phase === 'draw', `${room.status}/${room.phase}`);

const fetchRoom = await call(`/api/rummy/room/${room.code}`, { headers: { Cookie: cookie } });
check('read room with the same guest', fetchRoom.status === 200 && (await fetchRoom.clone().json()).code === room.code);

const foreign = await call('/api/rummy', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: cookie },
  body: JSON.stringify({ operation: 'join', code: room.code, name: 'Mallory' }),
});
check('foreign origin rejected', foreign.status === 403, String(foreign.status));

const stale = await call('/api/rummy', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://clubhouse.test', Cookie: cookie },
  body: JSON.stringify({ operation: 'move', code: room.code, revision: room.revision + 5, requestId: crypto.randomUUID(), move: { t: 'draw', from: 'stock' } }),
});
check('stale revision rejected', stale.status === 409, String(stale.status));

const events = await call(`/api/rummy/room/${room.code}/events`, { headers: { Cookie: cookie } });
check('event stream opens', events.status === 200 && (events.headers.get('content-type') ?? '').includes('text/event-stream'));
const firstEvent = await events.body.getReader().read();
check('event stream pushes a revision', new TextDecoder().decode(firstEvent.value).startsWith('data: {'));

const spades = await call('/api/spades', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://clubhouse.test', Cookie: cookie },
  body: JSON.stringify({ operation: 'create', name: 'Tester', options: { mode: 'bot', variant: 'solo', target: 500, humans: 2, level: 'normal', table: 'spades-table-classic', deck: 'spades-deck-classic' } }),
});
const spadesRoom = await spades.json();
check('create spades room', spades.status === 200 && spadesRoom.hand?.length === 13, JSON.stringify(spadesRoom).slice(0, 160));

const compliance = await call('/api/rummy', {
  method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: 'https://clubhouse.test', Cookie: cookie }, body: '{}',
});
check('non-JSON body rejected', compliance.status === 415, String(compliance.status));

const page = await call('/games/3-gems');
check('app routes fall through to assets', page.status === 200 && (await page.text()).includes('/games/3-gems'));

const unknown = await call('/api/rummy/room/NOPE');
check('unknown endpoint 404', unknown.status === 404, String(unknown.status));

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll Worker checks passed.');
process.exit(failures ? 1 : 0);
