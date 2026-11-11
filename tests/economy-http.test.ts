import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { build } from 'esbuild';
import { RoomStore, type Identity } from '../server/rooms';
import { createGameServer } from '../server/http';
import { EconomyStore } from '../server/economy';
import { nodeSocialBinding } from '../server/social-node';
import { RummyError } from '../src/lib/rummy-protocol';
import { POINT_FIELDS, type EconomyCommandResult, type EconomyView, type EconomyWallet } from '../src/lib/economy-protocol';
import { TestD1 } from './helpers/d1';
import type { Environment } from '../worker/index';

// Fictional identities and isolated databases only; these tests never use production keys.
const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const ids = [alice, bob];
const actor = (id: string): Identity => ({ principal: `member:${id}`, jokers: false, owned: [] });
const wallet = (overrides: Partial<EconomyWallet> = {}): EconomyWallet => ({
  points: 900, f3_points: 100, gems_points: 100, rummy_points: 1000, spades_points: 1000, dice_points: 0,domino_points:0,
  lifetime_points: 9000, owned: [], equipped: {}, pending_perks: {}, ...overrides,
});
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.unstubAllGlobals(); });

async function nodeApp() {
  const store = new RoomStore(':memory:');
  const app = createGameServer({ store, verifyMember: async token => {
    if (!ids.includes(token)) throw new RummyError('Invalid fixture identity.', 401);
    return actor(token);
  } });
  const economy = new EconomyStore(nodeSocialBinding(store.db));
  await economy.ensureMember(actor(alice), { wallet: wallet(), awards: [] });
  await economy.ensureMember(actor(bob), { wallet: wallet({ points: 5, rummy_points: 15 }), awards: [] });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  cleanup.push(async () => { app.closeStreams(); await app.rewards.stop(); await new Promise<void>(resolve => app.server.close(() => resolve())); store.close(); });
  const request = (id: string | null, path: string, command?: unknown, extra: Record<string, string> = {}) => fetch(base + path, {
    method: command === undefined ? 'GET' : 'POST', headers: { ...(id ? { Authorization: `Bearer ${id}` } : {}), ...(command === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    ...(command === undefined ? {} : { body: JSON.stringify(command) }),
  });
  const read = async (id = alice) => { const response = await request(id, '/api/economy'); expect(response.status).toBe(200); return response.json() as Promise<EconomyView>; };
  const mutate = async (command: unknown, id = alice) => { const response = await request(id, '/api/economy', command); expect(response.status).toBe(200); return response.json() as Promise<EconomyCommandResult>; };
  return { store, economy, request, read, mutate };
}

describe('authoritative economy HTTP boundary', () => {
  it('requires member auth for private wallets and writes, while publishing a safe fixed catalog', async () => {
    const { request } = await nodeApp();
    expect((await request(null, '/api/economy')).status).toBe(401);
    expect((await request('invalid-token', '/api/economy')).status).toBe(401);
    expect((await request(null, '/api/economy', { operation: 'check_in' })).status).toBe(401);
    const catalog = await request(null, '/api/economy/catalog'); expect(catalog.status).toBe(200);
    const items = (await catalog.json() as { items: { id: string; price: number; currency: string }[] }).items;
    expect(items.find(item => item.id === 'rummy-jokers')).toMatchObject({ price: 500, currency: 'rummy_points' });
    expect(items.find(item => item.id === 'faith3-skin-celestial')).toMatchObject({ price: 375, currency: 'points' });
    expect(JSON.stringify(items)).not.toMatch(/user_id|access_token|refresh_token|secret/);
  });

  it('rejects cross-site mutation and forged mint commands without altering either wallet', async () => {
    const { request, read } = await nodeApp();
    const before = (await read()).wallet;
    expect((await request(alice, '/api/economy', { operation: 'convert', game: 'rummy', amount: 10, requestId: randomUUID() }, { Origin: 'https://outside.invalid' })).status).toBe(403);
    for (const command of [
      { operation: 'award', amount: 1000000, userId: alice },
      { operation: 'creditPuzzle', game: 'faith-3', level: 280, amount: 1000000 },
      { operation: 'claim_achievement', achievementId: 'invented-award', amount: 1000000 },
      { operation: 'purchase', itemId: 'invented-item', price: -1000000 },
    ]) expect((await request(alice, '/api/economy', command)).status).toBeGreaterThanOrEqual(400);
    expect((await read()).wallet).toEqual(before);
    expect((await read(bob)).wallet.points).toBe(5);
  });

  it('converts every game currency with one debit per request ID and preserves lifetime earnings', async () => {
    const { request, read, mutate } = await nodeApp();
    for (const game of ['faith-3', '3-gems', 'rummy', 'spades'] as const) {
      const before = (await read()).wallet, requestId = randomUUID();
      const command = { operation: 'convert', game, amount: 52, requestId };
      const [first, second] = await Promise.all([mutate(command), mutate(command)]);
      expect([first.receipt.alreadyApplied, second.receipt.alreadyApplied].sort()).toEqual([false, true]);
      const after = (await read()).wallet;
      expect(after[POINT_FIELDS[game]]).toBe(before[POINT_FIELDS[game]] - 52);
      expect(after.points).toBe(before.points + 40); expect(after.lifetime_points).toBe(before.lifetime_points);
      expect((await request(alice, '/api/economy', { ...command, amount: 10 })).status).toBe(409);
    }
    const before = (await read()).wallet;
    for (const amount of [0, -10, 1, 11, 10.5, Number.MAX_SAFE_INTEGER, 999990]) {
      expect((await request(alice, '/api/economy', { operation: 'convert', game: 'rummy', amount, requestId: randomUUID() })).status).toBeGreaterThanOrEqual(400);
    }
    expect((await read()).wallet).toEqual(before);
  });

  it('resolves the account from authentication even when the caller supplies another user ID', async () => {
    const { request, read } = await nodeApp();
    const response = await request(alice, '/api/economy', { operation: 'convert', game: 'rummy', amount: 10, requestId: randomUUID(), userId: bob, actor: `member:${bob}` });
    expect([200, 400]).toContain(response.status);
    expect((await read(bob)).wallet).toMatchObject({ points: 5, rummy_points: 15 });
    if (response.status === 200) expect((await read()).wallet).toMatchObject({ points: 907, rummy_points: 990 });
  });

  it('buys a permanent unlock once and enforces owned slot-specific equipment', async () => {
    const { request, read, mutate } = await nodeApp();
    const [first, duplicate] = await Promise.all([
      mutate({ operation: 'purchase', itemId: 'rummy-jokers', price: 0 }),
      mutate({ operation: 'purchase', itemId: 'rummy-jokers', price: 0 }),
    ]);
    expect([first.receipt.alreadyApplied, duplicate.receipt.alreadyApplied].sort()).toEqual([false, true]);
    expect((await read()).wallet).toMatchObject({ rummy_points: 500, owned: ['rummy-jokers'] });
    expect((await request(alice, '/api/economy', { operation: 'equip', slot: 'faith3_skin', itemId: 'faith3-skin-celestial' })).status).toBeGreaterThanOrEqual(400);
    await mutate({ operation: 'purchase', itemId: 'faith3-skin-celestial' });
    await mutate({ operation: 'equip', slot: 'faith3_skin', itemId: 'faith3-skin-celestial' });
    expect((await read()).wallet).toMatchObject({ points: 525, equipped: { faith3_skin: 'faith3-skin-celestial' } });
    expect((await request(alice, '/api/economy', { operation: 'equip', slot: 'spades_deck', itemId: 'faith3-skin-celestial' })).status).toBeGreaterThanOrEqual(400);
    // A freshly bought unlock is immediately authoritative for game permissions.
    const room = await request(alice, '/api/rummy', { operation: 'create', name: 'Fixture', options: { mode: 'bot', variant: 'classic', seats: 2, level: 'normal', jokers: true } });
    expect(room.status).toBe(200);
  });

  it('presents earned player badges without exposing private balances, ownership, or transaction history', async () => {
    const { request } = await nodeApp();
    await request(alice, '/api/social/me');
    const response = await request(bob, '/api/economy/players/' + alice); expect(response.status).toBe(200);
    const profile = await response.json();
    expect(profile).toHaveProperty('achievements');
    expect(JSON.stringify(profile)).not.toMatch(/f3_points|rummy_points|spades_points|gems_points|pending_perks|"wallet"|"history"|"sources"|"owned"|"equipped"|access_token/);
    expect((await request(bob, '/api/economy/players/not-a-player')).status).toBeGreaterThanOrEqual(400);
  });
});

let worker: { fetch(request: Request, env: Environment, context: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> };
beforeAll(async () => {
  const result = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', external: ['node:crypto'],
    plugins: [{ name: 'economy-test-assets', setup(builder) {
      builder.onResolve({ filter: /^clubhouse:assets$/ }, () => ({ path: 'assets', namespace: 'economy-test-assets' }));
      builder.onLoad({ filter: /.*/, namespace: 'economy-test-assets' }, () => ({ contents: 'export default {}', loader: 'js' }));
    } }] });
  worker = (await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`)).default;
});

function workerApp(options: { failAwards?: boolean; changeWallet?: boolean; preSpades?: boolean } = {}) {
  const DB = new TestD1(); cleanup.push(async () => DB.sqlite.close());
  let walletReads = 0, awardsReads = 0;
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.origin).toBe('https://economy.test.invalid');
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const id = headers.get('Authorization')?.replace('Bearer ', '');
    if (!id || !ids.includes(id)) return Response.json({ message: 'Invalid fixture identity.' }, { status: 401 });
    if (url.pathname === '/auth/v1/user') return Response.json({ id, aud: 'authenticated', role: 'authenticated', email: 'fictional@example.invalid', app_metadata: {}, user_metadata: {} });
    if (url.pathname === '/rest/v1/wallets') {
      walletReads++;
      const legacy: Record<string, unknown> = { ...wallet({ points: options.changeWallet ? walletReads : 900, gems_points: 0, owned: ['faith3-skin-jade'], equipped: { faith3_skin: 'faith3-skin-jade' } }), user_id: id };
      if (options.preSpades) delete legacy.spades_points;
      return Response.json([legacy]);
    }
    if (url.pathname === '/rest/v1/point_awards') {
      awardsReads++;
      if (options.failAwards) return Response.json({ message: 'Fixture RLS denied the award read.' }, { status: 403 });
      return Response.json([{ source: 'rummy:win:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', amount: 70, rummy_tier: 'normal', created_at: new Date(1700000000000).toISOString() }]);
    }
    if (url.pathname === '/rest/v1/rpc/lounge_permissions') return Response.json({ name_flagged: false, chat_banned: false, muted_until: null });
    // Any legacy reward writer or unanticipated network call is an integration error.
    throw new Error('Unexpected fixture Supabase call: ' + url.pathname);
  });
  const env = { DB, SUPABASE_URL: 'https://economy.test.invalid', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
  const pending: Promise<unknown>[] = [];
  const request = (id: string | null, path = '/api/economy', command?: unknown) => worker.fetch(new Request('https://clubhouse.test' + path, {
    method: command === undefined ? 'GET' : 'POST', headers: { ...(id ? { Authorization: `Bearer ${id}` } : {}), ...(command === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(command === undefined ? {} : { body: JSON.stringify(command) }),
  }), env, { waitUntil(promise) { pending.push(promise); } });
  return { DB, request, pending, counts: () => ({ walletReads, awardsReads }) };
}

describe('hosted Worker economy migration boundary', () => {
  it('imports verified legacy balances, ownership, and sources once and keeps D1 authoritative', async () => {
    const { request, pending, counts } = workerApp();
    const response = await request(alice); expect(response.status).toBe(200);
    const migrated = await response.json() as EconomyView;
    expect(migrated.wallet).toMatchObject({ points: 900, f3_points: 100, gems_points: 0, rummy_points: 1000, spades_points: 1000, dice_points: 0,domino_points:0, lifetime_points: 9000, owned: ['faith3-skin-jade'], equipped: { faith3_skin: 'faith3-skin-jade' } });
    expect(migrated.sources).toContain('rummy:win:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const imported = counts(); expect(imported.awardsReads).toBeGreaterThan(0);
    const command = { operation: 'convert', game: 'rummy', amount: 988, requestId: randomUUID() };
    expect((await request(alice, '/api/economy', command)).status).toBe(200);
    const after = await (await request(alice)).json() as EconomyView;
    expect(after.wallet).toMatchObject({ points: 1660, rummy_points: 12, lifetime_points: 9000 });
    expect(counts()).toEqual(imported);
    expect(JSON.stringify(after)).not.toMatch(/fictional@example|access_token|refresh_token|public-test-key/);
    await Promise.all(pending);
  });

  it('preserves an older pre-Spades wallet without requiring later Supabase columns', async () => {
    const { request } = workerApp({ preSpades: true });
    const response = await request(alice); expect(response.status).toBe(200);
    const view = await response.json() as EconomyView;
    expect(view.wallet).toMatchObject({ points: 900, f3_points: 100, rummy_points: 1000, spades_points: 0, gems_points: 0, lifetime_points: 9000, owned: ['faith3-skin-jade'] });
  });

  it.each([{ failAwards: true }, { changeWallet: true }])('fails closed on an incomplete or changing legacy snapshot %j', async options => {
    const { DB, request, pending } = workerApp(options);
    const response = await request(alice); expect(response.status).toBe(503);
    const economy = new EconomyStore(DB);
    expect(await economy.hasMember(actor(alice))).toBe(false);
    await Promise.all(pending);
  });
});
