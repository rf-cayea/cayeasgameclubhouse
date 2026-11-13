import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import type { AddressInfo } from 'node:net';
import { RoomStore } from '../server/rooms';
import { createGameServer } from '../server/http';
import { RummyError, type RoomView } from '../src/lib/rummy-protocol';
import type { SpadesRoomView } from '../src/lib/spades-protocol';
import type { FriendsView, InvitesView, PlayerProfile, SocialCommandResult } from '../src/lib/social-protocol';
import { CLASSIC_DECK, CLASSIC_VENUE } from '../src/lib/spades-cosmetics';
import { TestD1 } from './helpers/d1';
import type { Environment } from '../worker/index';

// These UUIDs and bearer tokens belong only to injected in-memory test identities.
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const [alice, bob, other] = ids;
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); vi.unstubAllGlobals(); });
const rummyOptions = { mode: 'online', variant: 'classic', seats: 2, level: 'normal', jokers: false };
const spadesOptions = { mode: 'online', variant: 'solo', target: 100, humans: 2, level: 'normal', table: CLASSIC_VENUE.id, deck: CLASSIC_DECK.id };

async function nodeApp() {
  const store = new RoomStore(':memory:');
  const app = createGameServer({ store, verifyMember: async token => {
    if (!ids.includes(token)) throw new RummyError('Invalid fixture identity.', 401);
    return { principal: `member:${token}`, jokers: false, owned: [] };
  } });
  await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  cleanup.push(async () => { app.closeStreams(); await app.rewards.stop(); await new Promise<void>(resolve => app.server.close(() => resolve())); store.close(); });
  const request = (actor: string | null, path: string, command?: unknown, extra: Record<string, string> = {}) => fetch(base + path, {
    method: command === undefined ? 'GET' : 'POST', headers: { ...(actor ? { Authorization: `Bearer ${actor}` } : {}), ...(command === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra },
    ...(command === undefined ? {} : { body: JSON.stringify(command) }),
  });
  const read = async <T>(actor: string, path: string) => { const response = await request(actor, '/api/social/' + path); expect(response.status).toBe(200); return response.json() as Promise<T>; };
  const mutate = async (actor: string, command: unknown) => { const response = await request(actor, '/api/social', command); expect(response.status).toBe(200); return response.json() as Promise<SocialCommandResult>; };
  const name = (actor: string, gamerName: string) => mutate(actor, { operation: 'profile', gamerName, bio: 'Ready for a friendly game.', avatar: 'jade' });
  const befriend = async (a = alice!, b = bob!) => { await read<PlayerProfile>(a, 'me'); await read<PlayerProfile>(b, 'me'); await mutate(a, { operation: 'request', targetUserId: b }); await mutate(b, { operation: 'accept', targetUserId: a }); };
  return { store, request, read, mutate, name, befriend };
}

describe('social HTTP authorization and profile lifecycle', () => {
  it('requires a verified member for every social read/write and rejects cross-site writes', async () => {
    const { request } = await nodeApp();
    for (const path of ['me', 'players?q=player', 'friends', 'invites', 'activity']) expect((await request(null, '/api/social/' + path)).status).toBe(401);
    expect((await request(null, '/api/social', { operation: 'profile', gamerName: 'GuestProfile', bio: '', avatar: 'jade' })).status).toBe(401);
    expect((await request('invalid-token', '/api/social/me')).status).toBe(401);
    expect((await request(alice!, '/api/social', { operation: 'profile', gamerName: 'CrossSite', bio: '', avatar: 'jade' }, { Origin: 'https://outside.invalid' })).status).toBe(403);
    // Social sign-in requirements do not remove ordinary guest game access.
    expect((await request(null, '/api/rummy', { operation: 'create', name: 'Guest player', options: { ...rummyOptions, mode: 'bot' } })).status).toBe(200);
  });
  it('creates independent profiles, enforces unique gamer names and derives the edit owner from auth', async () => {
    const { request, read, name } = await nodeApp();
    const first = await read<PlayerProfile>(alice!, 'me');
    const second = await read<PlayerProfile>(bob!, 'me');
    expect(first.userId).toBe(alice); expect(second.userId).toBe(bob); expect(first.gamerName).not.toBe(second.gamerName);
    expect(first).not.toHaveProperty('email');
    await name(alice!, 'JadeAce'); await name(bob!, 'LotusKnight');
    expect((await request(bob!, '/api/social', { operation: 'profile', gamerName: 'jadeace', bio: '', avatar: 'moon' })).status).toBe(409);
    const found = await read<{ players: PlayerProfile[] }>(bob!, 'players?q=JadeAce');
    expect(found.players.map(profile => profile.userId)).toContain(alice);
    expect(await read<PlayerProfile>(bob!, 'players/' + alice)).toMatchObject({ userId: alice, gamerName: 'JadeAce', relationship: 'none' });
    const forged = await request(alice!, '/api/social', { operation: 'profile', userId: bob, gamerName: 'AuthenticatedOwner', bio: '', avatar: 'moon' });
    expect([200, 400]).toContain(forged.status);
    expect(await read<PlayerProfile>(bob!, 'me')).toMatchObject({ userId: bob, gamerName: 'LotusKnight' });
    for (const gamerName of ['a', 'two words', '<script>', 'x'.repeat(25)]) expect((await request(alice!, '/api/social', { operation: 'profile', gamerName, bio: '', avatar: 'jade' })).status).toBe(400);
  });
  it('keeps request direction private, accepts only incoming requests and lets either friend remove the connection', async () => {
    const { request, read, mutate } = await nodeApp();
    for (const actor of ids) await read(actor, 'me');
    expect((await request(alice!, '/api/social', { operation: 'request', targetUserId: alice })).status).toBe(400);
    await mutate(alice!, { operation: 'request', targetUserId: bob });
    const a = await read<FriendsView>(alice!, 'friends'), b = await read<FriendsView>(bob!, 'friends');
    expect(a.outgoing.map(profile => profile.userId)).toEqual([bob]); expect(a.incoming).toEqual([]);
    expect(b.incoming.map(profile => profile.userId)).toEqual([alice]);
    const forgedAccept = await request(other!, '/api/social', { operation: 'accept', targetUserId: alice });
    expect([400, 403, 404, 409]).toContain(forgedAccept.status);
    await mutate(bob!, { operation: 'accept', targetUserId: alice });
    expect((await read<FriendsView>(alice!, 'friends')).friends.map(profile => profile.userId)).toEqual([bob]);
    expect((await read<FriendsView>(bob!, 'friends')).friends.map(profile => profile.userId)).toEqual([alice]);
    await mutate(bob!, { operation: 'remove', targetUserId: alice });
    expect((await read<FriendsView>(alice!, 'friends')).friends).toEqual([]);
  });
  it('blocking removes friendship, revokes invitations and exposes only the blocker’s own block list', async () => {
    const { request, read, mutate, befriend } = await nodeApp(); await befriend();
    const room = await (await request(alice!, '/api/rummy', { operation: 'create', name: 'Host', options: rummyOptions })).json() as RoomView;
    await mutate(alice!, { operation: 'invite', targetUserId: bob, game: 'rummy', code: room.code });
    await mutate(bob!, { operation: 'block', targetUserId: alice });
    expect((await read<FriendsView>(bob!, 'friends')).blocked.map(profile => profile.userId)).toEqual([alice]);
    expect((await read<FriendsView>(alice!, 'friends')).blocked).toEqual([]);
    expect((await read<FriendsView>(alice!, 'friends')).friends).toEqual([]);
    expect((await request(alice!, '/api/social', { operation: 'request', targetUserId: bob })).status).toBe(403);
    expect((await request(alice!, '/api/social', { operation: 'invite', targetUserId: bob, game: 'rummy', code: room.code })).status).toBe(403);
    expect((await read<InvitesView>(bob!, 'invites')).incoming.every(invite => !invite.available)).toBe(true);
    await mutate(bob!, { operation: 'unblock', targetUserId: alice });
    expect((await read<FriendsView>(bob!, 'friends')).blocked).toEqual([]);
    expect((await read<FriendsView>(bob!, 'friends')).friends).toEqual([]);
  });
});

describe.each(['rummy', 'spades'] as const)('friend invitations into real %s multiplayer rooms', game => {
  it('delivers and accepts an invitation, then joins through normal room checks with private hands and gamer names', async () => {
    const { request, read, mutate, name, befriend } = await nodeApp();
    await name(alice!, 'JadeAce'); await name(bob!, 'LotusKnight'); await befriend();
    const options = game === 'rummy' ? rummyOptions : spadesOptions;
    let room = await (await request(alice!, '/api/' + game, { operation: 'create', name: 'Spoofed host', options })).json() as RoomView | SpadesRoomView;
    expect(room.players[0]!.name).toBe('JadeAce');
    const sent = await mutate(alice!, { operation: 'invite', targetUserId: bob, game, code: room.code });
    const incoming = (await read<InvitesView>(bob!, 'invites')).incoming.find(invite => invite.code === room.code)!;
    expect(incoming).toMatchObject({ game, available: true, status: 'pending' });
    expect(incoming.sender.gamerName).toBe('JadeAce');
    expect(incoming.href).toBe(`/games/${game}?room=${room.code}`);
    expect([403, 404]).toContain((await request(other!, '/api/social', { operation: 'accept_invite', inviteId: incoming.id })).status);
    expect((await request(bob!, `/api/${game}/room/${room.code}`)).status).toBe(403);
    const accepted = await mutate(bob!, { operation: 'accept_invite', inviteId: incoming.id });
    expect(accepted.invite).toMatchObject({ id: incoming.id, status: 'accepted', game, code: room.code });
    // Acceptance is acknowledgement, not an authorization shortcut into a seat.
    expect((await request(bob!, `/api/${game}/room/${room.code}`)).status).toBe(403);
    room = await (await request(bob!, '/api/' + game, { operation: 'join', code: room.code, name: 'Spoofed peer' })).json() as typeof room;
    expect(room.players.find(player => player.you)!.name).toBe('LotusKnight');
    room = await (await request(bob!, '/api/' + game, { operation: 'ready', code: room.code, ready: true })).json() as typeof room;
    room = await (await request(alice!, '/api/' + game, { operation: 'start', code: room.code, revision: room.revision })).json() as typeof room;
    expect(room.status).toBe('playing');
    const peer = await (await request(bob!, `/api/${game}/room/${room.code}`)).json() as typeof room;
    expect(room.hand).toHaveLength(game === 'rummy' ? 10 : 13);
    expect(peer.hand).toHaveLength(game === 'rummy' ? 10 : 13);
    expect(peer.hand.some(card => room.hand.includes(card))).toBe(false);
    for (const view of [room, peer]) { expect(view).not.toHaveProperty('hands'); expect(view).not.toHaveProperty('deck'); expect(view).not.toHaveProperty('state'); }
    expect((await request(other!, `/api/${game}/room/${room.code}`)).status).toBe(403);
    expect(sent.ok).toBe(true);
  });
  it('rechecks lobby ownership and capacity when invitations are sent or accepted', async () => {
    const { request, read, mutate, befriend } = await nodeApp(); await befriend();
    const options = game === 'rummy' ? rummyOptions : spadesOptions;
    const room = await (await request(alice!, '/api/' + game, { operation: 'create', name: 'Host', options })).json() as RoomView | SpadesRoomView;
    await mutate(alice!, { operation: 'invite', targetUserId: bob, game, code: room.code });
    const invite = (await read<InvitesView>(bob!, 'invites')).incoming.find(invite => invite.code === room.code)!;
    const forged = await request(bob!, '/api/social', { operation: 'invite', targetUserId: alice, game, code: room.code });
    expect([400, 403, 409]).toContain(forged.status);
    // Someone who knows the private code can fill the last ordinary human seat.
    expect((await request(other!, '/api/' + game, { operation: 'join', code: room.code, name: 'Other player' })).status).toBe(200);
    const unavailable = (await read<InvitesView>(bob!, 'invites')).incoming.find(value => value.id === invite.id)!;
    expect(unavailable.available).toBe(false);
    expect((await request(bob!, '/api/social', { operation: 'accept_invite', inviteId: invite.id })).status).toBe(409);
  });
});

let worker: { fetch(request: Request, env: Environment, context: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> };
beforeAll(async () => {
  const result = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', external: ['node:crypto'],
    plugins: [{ name: 'social-test-assets', setup(builder) {
      builder.onResolve({ filter: /^clubhouse:assets$/ }, () => ({ path: 'assets', namespace: 'social-test-assets' }));
      builder.onLoad({ filter: /.*/, namespace: 'social-test-assets' }, () => ({ contents: 'export default {}', loader: 'js' }));
    } }] });
  worker = (await import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString('base64')}`)).default;
});

describe('hosted Worker social wiring', () => {
  it('uses verified Supabase identities with D1 profiles and friends, without exposing auth or wallet data', async () => {
    const DB = new TestD1(); cleanup.push(async () => DB.sqlite.close());
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      expect(url.origin).toBe('https://social.test.invalid');
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const id = headers.get('Authorization')?.replace('Bearer ', '');
      if (!id || !ids.includes(id)) return new Response(JSON.stringify({ message: 'Invalid test identity.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      if (url.pathname === '/auth/v1/user') return Response.json({ id, aud: 'authenticated', role: 'authenticated', email: 'fictional@example.invalid', app_metadata: {}, user_metadata: {} });
      if (url.pathname === '/rest/v1/wallets') return Response.json([{ points: 0, f3_points: 0, rummy_points: 0, spades_points: 0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {} }]);
      if (url.pathname === '/rest/v1/point_awards') return Response.json([]);
      if (url.pathname === '/rest/v1/rpc/lounge_permissions') return Response.json({ name_flagged: false, chat_banned: false, muted_until: null });
      if (url.pathname === '/rest/v1/profiles') return Response.json({ display_name: 'Lounge' + id.slice(0, 8) });
      throw new Error('Unexpected fixture Supabase call: ' + url.pathname);
    });
    const env = { DB, SUPABASE_URL: 'https://social.test.invalid', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
    const pending: Promise<unknown>[] = [];
    const request = (id: string, path: string, command?: unknown) => worker.fetch(new Request('https://clubhouse.test' + path, { method: command ? 'POST' : 'GET', headers: { Authorization: `Bearer ${id}`, ...(command ? { 'Content-Type': 'application/json' } : {}) }, ...(command ? { body: JSON.stringify(command) } : {}) }), env, { waitUntil(promise) { pending.push(promise); } });
    // A brand-new D1 profile inherits the member's lounge display_name exactly once.
    for (const id of [alice!, bob!]) { const response = await request(id, '/api/social/me'); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ userId: id, gamerName: 'Lounge' + id.slice(0, 8) }); }
    expect((await request(alice!, '/api/social', { operation: 'profile', gamerName: 'WorkerAce', bio: '', avatar: 'jade' })).status).toBe(200);
    expect((await request(alice!, '/api/social', { operation: 'request', targetUserId: bob })).status).toBe(200);
    expect((await request(bob!, '/api/social', { operation: 'accept', targetUserId: alice })).status).toBe(200);
    const response = await request(bob!, '/api/social/friends'); expect(response.status).toBe(200);
    const friends = await response.json() as FriendsView;
    expect(friends.friends[0]).toMatchObject({ userId: alice, gamerName: 'WorkerAce' });
    expect(JSON.stringify(friends)).not.toMatch(/fictional@example|access_token|refresh_token|owned|rummy_points/);
    await Promise.all(pending);
  });
  it('seeds a new member name from profiles.display_name once, then stops reading profiles', async () => {
    const DB = new TestD1(); cleanup.push(async () => DB.sqlite.close());
    const profileReads = new Map<string, number>();
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const id = headers.get('Authorization')?.replace('Bearer ', '');
      if (!id || !ids.includes(id)) return new Response(JSON.stringify({ message: 'Invalid test identity.' }), { status: 401 });
      if (url.pathname === '/auth/v1/user') return Response.json({ id, aud: 'authenticated', role: 'authenticated', email: 'fictional@example.invalid', app_metadata: {}, user_metadata: {} });
      if (url.pathname === '/rest/v1/wallets') return Response.json([{ points: 0, f3_points: 0, rummy_points: 0, spades_points: 0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {} }]);
      if (url.pathname === '/rest/v1/point_awards') return Response.json([]);
      if (url.pathname === '/rest/v1/rpc/lounge_permissions') return Response.json({ name_flagged: false, chat_banned: false, muted_until: null });
      if (url.pathname === '/rest/v1/profiles') { profileReads.set(id, (profileReads.get(id) ?? 0) + 1); return Response.json({ display_name: 'Lounge' + id.slice(0, 8) }); }
      throw new Error('Unexpected fixture Supabase call: ' + url.pathname);
    });
    const env = { DB, SUPABASE_URL: 'https://social.test.invalid', SUPABASE_PUBLISHABLE_KEY: 'public-test-key' };
    const request = (id: string, path: string, command?: unknown) => worker.fetch(new Request('https://clubhouse.test' + path, { method: command ? 'POST' : 'GET', headers: { Authorization: `Bearer ${id}`, ...(command ? { 'Content-Type': 'application/json' } : {}) }, ...(command ? { body: JSON.stringify(command) } : {}) }), env, { waitUntil() {} });
    // First visit: the new D1 profile is created from the member's lounge name.
    expect(await (await request(alice!, '/api/social/me')).json()).toMatchObject({ userId: alice, gamerName: 'Lounge' + alice!.slice(0, 8) });
    expect(profileReads.get(alice!)).toBe(1);
    // Later requests reuse the local profile and never read Supabase profiles again.
    expect(await (await request(alice!, '/api/social/me')).json()).toMatchObject({ gamerName: 'Lounge' + alice!.slice(0, 8) });
    expect((await request(alice!, '/api/social', { operation: 'profile', gamerName: 'WorkerAce', bio: '', avatar: 'jade' })).status).toBe(200);
    expect((await request(alice!, '/api/social/friends')).status).toBe(200);
    expect(await (await request(alice!, '/api/social/me')).json()).toMatchObject({ gamerName: 'WorkerAce' });
    expect(profileReads.get(alice!)).toBe(1);
    // Seeding is per member: a second identity reads its own lounge name once.
    expect(await (await request(bob!, '/api/social/me')).json()).toMatchObject({ gamerName: 'Lounge' + bob!.slice(0, 8) });
    await request(bob!, '/api/social/me');
    expect(profileReads.get(bob!)).toBe(1);
  });
});
