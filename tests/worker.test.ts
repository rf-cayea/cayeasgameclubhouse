import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { CLASSIC_DECK, CLASSIC_VENUE } from '../src/lib/spades-cosmetics';
import type { RoomView } from '../src/lib/rummy-protocol';
import type { SpadesRoomView } from '../src/lib/spades-protocol';
import type { Environment } from '../worker/index';

let worker: { fetch(request: Request, env: Environment, context: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> };
beforeAll(async () => {
  // Exercise the actual bundled Worker, including its embedded-asset import.
  const result = await build({
    entryPoints: ['worker/index.ts'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', external: ['node:crypto'],
    plugins: [{ name: 'test-assets', setup(builder) {
      builder.onResolve({ filter: /^clubhouse:assets$/ }, () => ({ path: 'assets', namespace: 'test-assets' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-assets' }, () => ({ contents: `export default ${JSON.stringify({
        '/assets/transport-test.js': { type: 'application/javascript', data: Buffer.from('window.packagingTest=true;').toString('base64') },
        '/assets/transport-test.css': { type: 'text/css', data: Buffer.from('body{color:green}').toString('base64') },
        '/assets/transport-test.webp': { type: 'image/webp', data: Buffer.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]).toString('base64') },
        '/index.html': { type: 'text/html', data: Buffer.from('<!doctype html><title>Clubhouse</title>').toString('base64') },
      })}`, loader: 'js' }));
    } }],
  });
  expect(result.outputFiles[0].text).not.toContain('node:sqlite');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
  worker = (await import(/* @vite-ignore */ dataUrl)).default;
});
const databases: TestD1[] = [];
const background = new Set<Promise<unknown>>();
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all([...background]); background.clear();
  for (const binding of databases.splice(0)) binding.sqlite.close();
});
function setup(extra: Partial<Environment> = {}) {
  const DB = new TestD1(); databases.push(DB);
  const env = { DB, ...extra };
  const fetch = (path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://clubhouse.test${path}`, init), env, {
    waitUntil(promise) { background.add(promise); },
  });
  const post = (game: 'rummy' | 'spades', cookie: string, command: unknown, headers: Record<string, string> = {}) => fetch(`/api/${game}`, {
    method: 'POST', headers: { Cookie: cookie, Origin: 'https://clubhouse.test', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(command),
  });
  const guest = async () => {
    const response = await fetch('/api/rummy/session');
    expect(response.status).toBe(200);
    return response.headers.get('set-cookie')!.split(';')[0];
  };
  return { DB, fetch, post, guest };
}
const rummyOptions = { mode: 'online', variant: 'classic', seats: 2, level: 'normal', jokers: false };

describe('Sites Worker request integration', () => {
  it.each(['identity', 'gzip, br'])('serves readable HTML, scripts and CSS through gateways with %s accepted', async acceptEncoding => {
    const { fetch } = setup();
    for (const [path, type, body] of [
      ['/', 'text/html', '<!doctype html><title>Clubhouse</title>'],
      ['/games/quintsee', 'text/html', '<!doctype html><title>Clubhouse</title>'],
      ['/games/3-gems', 'text/html', '<!doctype html><title>Clubhouse</title>'],
      ['/assets/transport-test.js', 'application/javascript', 'window.packagingTest=true;'],
      ['/assets/transport-test.css', 'text/css', 'body{color:green}'],
    ]) {
      const response = await fetch(path, { headers: { 'Accept-Encoding': acceptEncoding } });
      expect(response.headers.get('content-type')).toBe(type);
      expect(response.headers.get('content-encoding')).toBeNull();
      // A gateway can forward the raw body without preserving encoding headers.
      const gatewayResponse = new Response(response.body, { headers: { 'Content-Type': type } });
      expect(await gatewayResponse.text()).toBe(body);
      const head = await fetch(path, { method: 'HEAD' });
      expect(head.body).toBeNull();
      expect(head.headers.get('content-type')).toBe(type);
      expect(head.headers.get('cache-control')).toBe(path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
    }
    expect(new Uint8Array(await (await fetch('/assets/transport-test.webp')).arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]));
  });

  it.each(['rummy','spades','five-dice','farkle','crown-court','dominoes'] as const)('%s Match Making publishes and joins real hosted rooms without revealing hands',async game=>{
    const {fetch,guest}=setup(),host=await guest(),peer=await guest();
    const send=(path:string,cookie:string,body:unknown)=>fetch(path,{method:'POST',headers:{Cookie:cookie,Origin:'https://clubhouse.test','Content-Type':'application/json'},body:JSON.stringify(body)});
    const options=game==='crown-court'?{mode:'online',seats:2,level:'normal',length:'short'}:game==='rummy'?rummyOptions:game==='spades'?{mode:'online',variant:'solo',target:100,humans:4,level:'normal',table:CLASSIC_VENUE.id,deck:CLASSIC_DECK.id}:(game==='five-dice'||game==='farkle')?{mode:'online',seats:2,level:'normal'}:{mode:'online',variant:'draw',target:100,level:'normal'};
    const created=await send(`/api/${game}`,host,{operation:'create',name:'Host',options,...(game==='dominoes'||game==='five-dice'||game==='farkle'||game==='crown-court'?{requestId:randomUUID()}:{})});expect(created.status).toBe(200);
    const payload=await created.json() as any,room=payload.view??payload;
    expect((await (await fetch(`/api/${game}/matchmaking`,{headers:{Cookie:peer}})).json() as any).rooms).toEqual([]);
    const listed=await send(`/api/${game}/matchmaking`,host,{operation:'publish',code:room.code});expect(listed.status).toBe(200);expect(await listed.json()).toEqual({listed:true});
    const summary=await (await fetch(`/api/${game}/matchmaking`,{headers:{Cookie:peer}})).json() as any;expect(summary.rooms[0]).toMatchObject({code:room.code,occupied:1});expect(summary.rooms[0]).not.toHaveProperty('hand');
    const joined=await send(`/api/${game}/matchmaking`,peer,{operation:'join',code:room.code,name:'Peer',requestId:randomUUID()});expect(joined.status).toBe(200);const next=await joined.json() as any;expect(next.view??next).toMatchObject({code:room.code,status:'waiting'});
  });

  it('serves default Rummy artwork and rejects forged unlocks and cross-site equips', async () => {
    const { fetch, guest } = setup();
    const cookie = await guest();
    const defaults = await fetch('/api/rummy/appearance', { headers: { Cookie: cookie } });
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toMatchObject({ member: false, wins: 0, equipped: { background: 'rummy-room-classic', table: 'rummy-table-classic' } });
    const payload = { background: 'rummy-room-library', table: 'rummy-table-burgundy', wins: 100 };
    const forged = await fetch('/api/rummy/appearance', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://clubhouse.test', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ code: 'design_locked' });
    expect((await fetch('/api/rummy/appearance', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://other.test', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).status).toBe(403);
  });
  it('reuses the HttpOnly guest cookie for both games across requests', async () => {
    const { fetch, DB } = setup();
    const first = await fetch('/api/rummy/session');
    expect(await first.json()).toEqual({ member: false, jokers: false });
    const cookie = first.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^cayea_rummy=[a-f0-9]{64};/);
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Strict');
    const next = await fetch('/api/spades/session', { headers: { Cookie: `other=value; ${cookie.split(';')[0]}` } });
    expect(next.headers.get('set-cookie')).toBeNull();
    expect(await next.json()).toEqual({ member: false, jokers: false });
    expect(DB.sqlite.prepare('SELECT count(*) AS n FROM sessions').get()?.n).toBe(1);
  });
  it('hosts a complete Rummy lobby with private hands and rejects competing moves', async () => {
    const { fetch, post, guest } = setup();
    const alice = await guest(), bob = await guest(), outsider = await guest();
    let response = await post('rummy', alice, { operation: 'create', name: 'Alice', options: rummyOptions });
    expect(response.status).toBe(200);
    let room = await response.json() as RoomView;
    expect((await post('rummy', bob, { operation: 'join', code: room.code, name: 'Bob' })).status).toBe(200);
    room = await (await post('rummy', bob, { operation: 'ready', code: room.code, ready: true })).json() as RoomView;
    room = await (await post('rummy', alice, { operation: 'start', code: room.code, revision: room.revision })).json() as RoomView;
    expect(room.status).toBe('playing');
    const peer = await (await fetch(`/api/rummy/room/${room.code}`, { headers: { Cookie: bob } })).json() as RoomView;
    expect(room.hand).toHaveLength(10); expect(peer.hand).toHaveLength(10);
    expect(peer.hand.some(card => room.hand.includes(card))).toBe(false);
    expect((await fetch(`/api/rummy/room/${room.code}`, { headers: { Cookie: outsider } })).status).toBe(403);
    const command = { operation: 'move', code: room.code, revision: room.revision, move: { t: 'draw', from: 'stock' } };
    const results = await Promise.all([0, 1].map(() => post('rummy', bob, { ...command, requestId: randomUUID() })));
    expect(results.map(value => value.status).sort()).toEqual([200, 409]);
    const after = await (await fetch(`/api/rummy/room/${room.code}`, { headers: { Cookie: bob } })).json() as RoomView;
    expect(after.hand).toHaveLength(11);
  });
  it('hosts a private Spades table and enforces the partnership unlock', async () => {
    const { fetch, post, guest } = setup();
    const alice = await guest(), bob = await guest();
    const options = { mode: 'online', variant: 'solo', target: 500, humans: 2, level: 'normal', table: CLASSIC_VENUE.id, deck: CLASSIC_DECK.id };
    expect((await post('spades', alice, { operation: 'create', name: 'Alice', options: { ...options, variant: 'teams' } })).status).toBe(403);
    let room = await (await post('spades', alice, { operation: 'create', name: 'Alice', options })).json() as SpadesRoomView;
    expect(room.code).toMatch(/^[A-F0-9]{8}$/);
    expect((await post('spades', bob, { operation: 'join', code: room.code, name: 'Bob', seat: 1 })).status).toBe(200);
    room = await (await post('spades', bob, { operation: 'ready', code: room.code, ready: true })).json() as SpadesRoomView;
    room = await (await post('spades', alice, { operation: 'start', code: room.code, revision: room.revision })).json() as SpadesRoomView;
    expect(room.status).toBe('playing'); expect(room.hand).toHaveLength(13);
    const peer = await (await fetch(`/api/spades/room/${room.code}`, { headers: { Cookie: bob } })).json() as SpadesRoomView;
    expect(peer.hand.some(card => room.hand.includes(card))).toBe(false);
    expect(room).not.toHaveProperty('hands');
  });
  it('rejects cross-site, malformed and oversized commands before changing a room', async () => {
    const { fetch, post, guest, DB } = setup();
    const cookie = await guest();
    const command = { operation: 'create', name: 'Alice', options: rummyOptions };
    expect((await post('rummy', cookie, command, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await fetch('/api/rummy', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect((await fetch('/api/rummy', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{broken' })).status).toBe(400);
    expect((await fetch('/api/rummy', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'Content-Length': '17000' }, body: '{}' })).status).toBe(413);
    expect((await fetch('/api/rummy', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(17000) }) })).status).toBe(413);
    expect(DB.sqlite.prepare('SELECT count(*) AS n FROM rooms').get()?.n).toBe(0);
  });
  it('closes live-event timers when the reader cancels or request aborts', async () => {
    const { fetch, post, guest } = setup();
    const cookie = await guest();
    const room = await (await post('rummy', cookie, { operation: 'create', name: 'Alice', options: rummyOptions })).json() as RoomView;
    vi.useFakeTimers();
    const response = await fetch(`/api/rummy/room/${room.code}/events`, { headers: { Cookie: cookie } });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(`"revision":${room.revision}`);
    expect(vi.getTimerCount()).toBe(1);
    await reader.cancel();
    expect(vi.getTimerCount()).toBe(0);
    const controller = new AbortController();
    const abortable = await fetch(`/api/rummy/room/${room.code}/events`, { headers: { Cookie: cookie }, signal: controller.signal });
    const abortReader = abortable.body!.getReader(); await abortReader.read();
    controller.abort();
    expect((await abortReader.read()).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('exposes only public Supabase configuration and serves app routes without secrets', async () => {
    const { fetch } = setup({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', CLUBHOUSE_REWARD_KEY: 'reward-secret' });
    const response = await fetch('/clubhouse-config.js');
    const text = await response.text();
    expect(text).toContain('https://example.supabase.co'); expect(text).toContain('public-key');
    expect(text).not.toContain('server-secret'); expect(text).not.toContain('reward-secret');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await fetch('/games/rummy')).status).toBe(200);
    expect((await fetch('/missing.js')).status).toBe(404);
    expect(await (await fetch('/games/spades', { method: 'HEAD' })).text()).toBe('');
  });
  it('reports missing member configuration while guest play remains available', async () => {
    const { fetch } = setup();
    const member = await fetch('/api/rummy/session', { headers: { Authorization: 'Bearer fake-token' } });
    expect(member.status).toBe(503);
    expect(await member.json()).toMatchObject({ code: 'auth_unavailable' });
    expect((await fetch('/api/rummy/session')).status).toBe(200);
    const config = await (await fetch('/clubhouse-config.js')).text();
    expect(config).toContain('"supabaseUrl":""'); expect(config).toContain('"supabaseKey":""');
  });
});
