import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { RoomStore, type Identity } from '../server/rooms';
import { SpadesRoomStore } from '../server/spades-rooms';
import { createGameServer } from '../server/http';
import { deliveryWorker } from '../server/rewards';
import { CLASSIC_DECK, CLASSIC_VENUE } from '../src/lib/spades-cosmetics';
import { SPADES_POINTS, type SpadesState } from '../src/lib/spades';
import { spadesRewardTier, spadesWinners, validSpadesReceipt, type SpadesMatchReward, type SpadesReceipt } from '../src/lib/spades-rewards';
import type { SpadesOptions, SpadesRoomView } from '../src/lib/spades-protocol';
import { SPADES_PARTNERSHIPS } from '../src/lib/spades-perks';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const identities = ids.map(id => ({ principal: `member:${id}`, jokers: false, owned: [SPADES_PARTNERSHIPS.id] }));
const options: SpadesOptions = { mode: 'online', variant: 'teams', target: 100, humans: 4, level: 'normal', table: CLASSIC_VENUE.id, deck: CLASSIC_DECK.id };
const stores: RoomStore[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); });
const open = () => { const root = new RoomStore(':memory:'); stores.push(root); return new SpadesRoomStore(root.db); };
function started(store: SpadesRoomStore, actors: Identity[] = identities, settings = options) {
  let view = store.command(actors[0]!, { operation: 'create', name: 'Alice', options: settings }).view;
  for (let index = 1; index < 4; index++) {
    store.command(actors[index]!, { operation: 'join', code: view.code, name: `Player ${index + 1}` });
    view = store.command(actors[index]!, { operation: 'ready', code: view.code, ready: true }).view;
  }
  return store.command(actors[0]!, { operation: 'start', code: view.code, revision: view.revision }).view;
}
function prepareWin(store: SpadesRoomStore, view: SpadesRoomView) {
  const row = JSON.parse(String(store.db.prepare('SELECT data FROM spades_rooms WHERE code=?').get(view.code)!.data)) as { state: SpadesState };
  Object.assign(row.state, { phase: 'play', turn: 0, scores: row.state.mode === 'teams' ? [95, 0] : [95, 0, 0, 0], bids: [1, 1, 1, 1], taken: [5, 2, 3, 2], hands: [['AS'], [], [], []],
    trick: [{ seat: 1, card: '2H' }, { seat: 2, card: '3H' }, { seat: 3, card: '4H' }], completed: Array.from({ length: 12 }, () => ({ cards: [], winner: 0 })) });
  store.db.prepare('UPDATE spades_rooms SET data=? WHERE code=?').run(JSON.stringify(row), view.code);
  return { operation: 'move', code: view.code, revision: view.revision, requestId: randomUUID(), move: { t: 'play', card: 'AS' } };
}
const receipt = (result: SpadesMatchReward): SpadesReceipt => { const tier = spadesRewardTier(result.mode, result.players)!; return { match_id: result.match_id, user_ids: spadesWinners(result), source: `spades:win:${result.match_id}`, tier, amount: SPADES_POINTS[tier], already_credited: false }; };

describe('private four-seat Spades rooms', () => {
  it('requires the permanent unlock for computer and online partnerships while solo stays free', () => {
    const store = open();
    for (const actor of [{ principal: 'guest:no-account', jokers: false, owned: [SPADES_PARTNERSHIPS.id] }, { ...identities[0]!, owned: [] }]) {
      for (const mode of ['bot', 'online'] as const) {
        expect(() => store.command(actor, { operation: 'create', name: 'Player', options: { ...options, mode }, owned: [SPADES_PARTNERSHIPS.id], unlocked: true })).toThrow('800 Spades points');
        expect(store.command(actor, { operation: 'create', name: 'Player', options: { ...options, mode, variant: 'solo' } }).view.options.variant).toBe('solo');
      }
    }
    expect(store.command(identities[0]!, { operation: 'create', name: 'Owner', options: { ...options, mode: 'bot' } }).view.options.variant).toBe('teams');
  });
  it('blocks joining, starting, saved-match actions, and retried moves without ownership, but allows leaving', () => {
    const store = open();
    let view = store.command(identities[0]!, { operation: 'create', name: 'Host', options }).view;
    expect(() => store.command({ ...identities[1]!, owned: [] }, { operation: 'join', code: view.code, name: 'Locked' })).toThrow('permanent unlock');
    expect(() => store.command({ principal: 'guest:locked', jokers: false }, { operation: 'join', code: view.code, name: 'Guest' })).toThrow('800 Spades points');
    expect(() => store.command({ ...identities[0]!, owned: [] }, { operation: 'start', code: view.code, revision: view.revision })).toThrow('800 Spades points');
    view = started(store);
    const move = { operation: 'move', code: view.code, revision: view.revision, requestId: randomUUID(), move: { t: 'bid', bid: 3 } };
    store.command(identities[0]!, move);
    expect(() => store.command({ ...identities[0]!, owned: [] }, move)).toThrow('800 Spades points');
    expect(() => store.command({ ...identities[1]!, owned: [] }, { ...move, requestId: randomUUID() })).toThrow('800 Spades points');
    expect(store.command({ ...identities[1]!, owned: [] }, { operation: 'leave', code: view.code }).changed).toBe(true);
  });
  it('keeps all hands private, supports partner seats, and starts ready mixed tables', () => {
    const store = open();
    let view = store.command(identities[0]!, { operation: 'create', name: 'Host', options: { ...options, humans: 2 } }).view;
    store.command(identities[1]!, { operation: 'join', code: view.code, name: 'Partner', seat: 2 });
    view = store.command(identities[1]!, { operation: 'ready', code: view.code, ready: true }).view;
    view = store.command(identities[0]!, { operation: 'start', code: view.code, revision: view.revision }).view;
    const partner = store.get(view.code, identities[1]!.principal);
    expect(partner.mySeat).toBe(2); expect(view.players.map(player => player.bot)).toEqual([false, true, false, true]);
    expect(view.hand).toHaveLength(13); expect(partner.hand).toHaveLength(13); expect(view.hand.some(card => partner.hand.includes(card))).toBe(false);
    expect(view).not.toHaveProperty('hands'); expect(view).not.toHaveProperty('state'); expect(view).not.toHaveProperty('deck');
    expect(view.reward.status).toBe('ineligible'); expect(() => store.get(view.code, 'guest:outsider')).toThrow('not a member');
  });
  it('checks host, lobby capacity, readiness, reserved seats, and private rejoin', () => {
    const store = open(); let view = store.command(identities[0]!, { operation: 'create', name: 'Host', options }).view;
    expect(() => store.command(identities[0]!, { operation: 'start', code: view.code, revision: view.revision })).toThrow('every human');
    expect(() => store.command(identities[1]!, { operation: 'join', code: view.code, name: 'Rival', seat: 0 })).toThrow('unavailable');
    view = store.command(identities[1]!, { operation: 'join', code: view.code, name: 'Rival', seat: 3 }).view;
    expect(() => store.command(identities[1]!, { operation: 'start', code: view.code, revision: view.revision })).toThrow('host');
    const again = store.command(identities[1]!, { operation: 'join', code: view.code, name: 'Duplicate' }).view;
    expect(again.mySeat).toBe(3); expect(again.players.filter(player => player.occupied)).toHaveLength(2);
  });
  it('rejects out-of-turn, forged, stale, and duplicate-content moves while deduplicating retries', () => {
    const store = open(); const view = started(store);
    const command = { operation: 'move', code: view.code, revision: view.revision, requestId: randomUUID(), move: { t: 'bid', bid: 3 } };
    expect(() => store.command(identities[1]!, command)).toThrow('not legal');
    expect(() => store.command(identities[0]!, { ...command, move: { t: 'bid', bid: 3, actor: 0 } })).toThrow('Invalid');
    const bid = store.command(identities[0]!, command).view;
    expect(store.command(identities[0]!, command)).toEqual({ view: bid, changed: false });
    expect(() => store.command(identities[0]!, { ...command, move: { t: 'bid', bid: 4 } })).toThrow('reused');
    expect(() => store.command(identities[1]!, { ...command, requestId: randomUUID() })).toThrow('table changed');
  });
  it('requires verified cosmetic ownership, shares host designs, and resets them when a waiting host leaves', () => {
    const store = open(); const dressed = { ...options, table: 'spades-table-atlas', deck: 'spades-deck-deco' };
    expect(() => store.command(identities[0]!, { operation: 'create', name: 'Host', options: dressed })).toThrow('Collect');
    const owner = { ...identities[0]!, owned: [SPADES_PARTNERSHIPS.id, dressed.table, dressed.deck] };
    const view = store.command(owner, { operation: 'create', name: 'Host', options: dressed }).view;
    const peer = store.command(identities[1]!, { operation: 'join', code: view.code, name: 'Peer' }).view;
    expect(peer.options.table).toBe(dressed.table); expect(peer.options.deck).toBe(dressed.deck);
    store.command(owner, { operation: 'leave', code: view.code });
    const inherited = store.get(view.code, identities[1]!.principal);
    expect(inherited.owner).toBe(true); expect(inherited.options.table).toBe(CLASSIC_VENUE.id);
  });
  it('preserves matches and seats across restart and abandons without a forfeit reward', () => {
    const folder = mkdtempSync(join(tmpdir(), 'spades-')); const file = join(folder, 'games.sqlite');
    let root = new RoomStore(file);
    try {
      let store = new SpadesRoomStore(root.db); const view = started(store); root.close(); root = new RoomStore(file); store = new SpadesRoomStore(root.db);
      expect(store.get(view.code, identities[0]!.principal)).toEqual(view);
      store.command(identities[1]!, { operation: 'leave', code: view.code });
      expect(store.get(view.code, identities[0]!.principal)).toMatchObject({ status: 'abandoned', winner: null });
      expect(store.claimReward(Date.now())).toBeNull();
    } finally { root.close(); rmSync(folder, { recursive: true }); }
  });
});

describe('Spades reward outbox', () => {
  it('preserves a pending team reward across restart and recovers a lost delivery lease', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spades-reward-')); const path = join(directory, 'games.sqlite');
    let root = new RoomStore(path);
    try {
      let store = new SpadesRoomStore(root.db); const view = started(store); store.command(identities[0]!, prepareWin(store, view));
      const first = store.claimReward(1000)!; root.close(); root = new RoomStore(path); store = new SpadesRoomStore(root.db);
      expect(store.get(view.code, identities[2]!.principal).reward.status).toBe('pending');
      expect(store.claimReward(30999)).toBeNull(); const retry = store.claimReward(31000)!;
      expect(retry.result).toEqual(first.result); expect(retry.lease).not.toBe(first.lease);
      store.finishReward(first.result.match_id, first.lease, receipt(first.result));
      expect(store.get(view.code, identities[0]!.principal).reward.status).toBe('pending');
      store.finishReward(retry.result.match_id, retry.lease, receipt(retry.result));
      expect(store.get(view.code, identities[2]!.principal).reward.status).toBe('credited');
    } finally { root.close(); rmSync(directory, { recursive: true }); }
  });
  it('atomically queues both human team winners and credits only those seats, once', async () => {
    const store = open(); const view = started(store); const move = prepareWin(store, view);
    expect(store.command(identities[0]!, move).view.reward).toMatchObject({ status: 'pending', amount: 150 });
    expect(store.get(view.code, identities[2]!.principal).reward.status).toBe('pending');
    expect(store.get(view.code, identities[1]!.principal).reward.status).toBe('ineligible');
    store.command(identities[0]!, move);
    expect(store.db.prepare('SELECT count(*) AS n FROM spades_rewards').get()!.n).toBe(1);
    const deliver = vi.fn(async (result: SpadesMatchReward) => receipt(result));
    const worker = deliveryWorker(store, { configured: () => true, deliver }, validSpadesReceipt);
    try {
      await worker.flush();
      expect(deliver).toHaveBeenCalledTimes(1); expect(deliver.mock.calls[0]![0].players.every(player => !player.bot)).toBe(true);
      expect(store.get(view.code, identities[0]!.principal).reward.status).toBe('credited');
      expect(store.get(view.code, identities[2]!.principal).reward.status).toBe('credited');
      const result = deliver.mock.calls[0]![0]; expect(validSpadesReceipt(result, { ...receipt(result), user_ids: [ids[0]!] })).toBe(false);
      expect(validSpadesReceipt(result, { ...receipt(result), amount: 999 })).toBe(false);
    } finally { await worker.stop(); }
  });
  it('does not queue guest or mixed online wins', () => {
    const store = open(); const guests = ids.map((_, i) => ({ principal: `guest:${i}`, jokers: false }));
    const view = started(store, guests, { ...options, variant: 'solo' }); store.command(guests[0]!, prepareWin(store, view));
    expect(store.claimReward(Date.now())).toBeNull();
  });
});

describe('real Spades HTTP multiplayer', () => {
  it('uses verified wallet ownership for every human, including private reads and live streams', async () => {
    const root = new RoomStore(':memory:'); const owners = new Set([ids[0]!]);
    const app = createGameServer({ store: root, verifyMember: async token => ({ principal: `member:${token}`, jokers: false, owned: owners.has(token) ? [SPADES_PARTNERSHIPS.id] : [] }) });
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const headers = (seat: number) => ({ Authorization: `Bearer ${ids[seat]}`, 'Content-Type': 'application/json' });
    const post = (seat: number, data: unknown) => fetch(`${base}/api/spades`, { method: 'POST', headers: headers(seat), body: JSON.stringify(data) });
    try {
      const denied = await post(1, { operation: 'create', name: 'Locked', options });
      expect(denied.status).toBe(403); expect(await denied.json()).toMatchObject({ code: 'partnerships_locked' });
      let view = await (await post(0, { operation: 'create', name: 'Owner', options: { ...options, humans: 2 } })).json() as SpadesRoomView;
      expect((await post(1, { operation: 'join', code: view.code, name: 'Peer' })).status).toBe(403);
      owners.add(ids[1]!);
      expect((await post(1, { operation: 'join', code: view.code, name: 'Peer' })).status).toBe(200);
      view = await (await post(1, { operation: 'ready', code: view.code, ready: true })).json() as SpadesRoomView;
      view = await (await post(0, { operation: 'start', code: view.code, revision: view.revision })).json() as SpadesRoomView;
      expect(view.hand).toHaveLength(13); owners.delete(ids[1]!);
      expect((await fetch(`${base}/api/spades/room/${view.code}`, { headers: headers(1) })).status).toBe(403);
      expect((await fetch(`${base}/api/spades/room/${view.code}/events`, { headers: headers(1) })).status).toBe(403);
      expect((await post(1, { operation: 'move', code: view.code, revision: view.revision, requestId: randomUUID(), move: { t: 'bid', bid: 3 } })).status).toBe(403);
      expect((await post(1, { operation: 'leave', code: view.code })).status).toBe(200);
      expect(app.spades.get(view.code, identities[0]!.principal).status).toBe('abandoned');
    } finally { app.closeStreams(); await app.rewards.stop(); await new Promise<void>(resolve => app.server.close(() => resolve())); root.close(); }
  }, 15000);
  it('supports four independent sessions, private hands, synchronized bids, and competing move rejection', async () => {
    const root = new RoomStore(':memory:'); const app = createGameServer({ store: root });
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    try {
      const cookies = await Promise.all(ids.map(async () => (await fetch(`${base}/api/spades/session`)).headers.get('set-cookie')!.split(';')[0]!));
      const post = (seat: number, data: unknown) => fetch(`${base}/api/spades`, { method: 'POST', headers: { Cookie: cookies[seat]!, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      let view = await (await post(0, { operation: 'create', name: 'Host', options: { ...options, variant: 'solo' } })).json() as SpadesRoomView;
      for (let seat = 1; seat < 4; seat++) { await post(seat, { operation: 'join', code: view.code, name: `Peer ${seat}` }); view = await (await post(seat, { operation: 'ready', code: view.code, ready: true })).json() as SpadesRoomView; }
      view = await (await post(0, { operation: 'start', code: view.code, revision: view.revision })).json() as SpadesRoomView;
      const views = await Promise.all(cookies.map(async cookie => (await (await fetch(`${base}/api/spades/room/${view.code}`, { headers: { cookie } })).json()) as SpadesRoomView));
      expect(new Set(views.flatMap(view => view.hand)).size).toBe(52); expect(views.every(view => !Object.hasOwn(view, 'hands'))).toBe(true);
      const command = { operation: 'move', code: view.code, revision: view.revision, move: { t: 'bid', bid: 3 } };
      const races = await Promise.all([0, 1].map(() => post(0, { ...command, requestId: randomUUID() })));
      expect(races.map(response => response.status).sort()).toEqual([200, 409]);
      expect((await fetch(`${base}/api/spades/room/${view.code}`)).status).toBe(403);
      const other = await (await fetch(`${base}/api/spades/room/${view.code}`, { headers: { cookie: cookies[1]! } })).json() as SpadesRoomView;
      expect(other.bids[0]).toBe(3); expect(other.turn).toBe(1);
    } finally { app.closeStreams(); await app.rewards.stop(); await new Promise<void>(resolve => app.server.close(() => resolve())); root.close(); }
  }, 15000);
});
