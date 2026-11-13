import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CloudRoomStore } from '../server/cloud-rooms';
import { CloudSpadesRoomStore } from '../server/cloud-spades-rooms';
import { CloudDatabase, type D1Binding, type D1Statement } from '../server/database';
import { DominoRoomStore } from '../server/dominoes-rooms';
import { CLASSIC_DECK, CLASSIC_VENUE } from '../src/lib/spades-cosmetics';
import type { GameOptions } from '../src/lib/rummy-protocol';

import { TestD1 } from './helpers/d1';

const databases: TestD1[] = [];
function db() { const value = new TestD1(); databases.push(value); return value; }
afterEach(() => { for (const value of databases.splice(0)) value.sqlite.close(); });
const alice = { principal: 'guest:alice', jokers: false };
const bob = { principal: 'guest:bob', jokers: false };
const carol = { principal: 'guest:carol', jokers: false };
const dave = { principal: 'guest:dave', jokers: false };
const options: GameOptions = { mode: 'online', variant: 'classic', seats: 2, level: 'normal', jokers: false };

/** Holds a presence write open so a command can commit between its read and its write. */
function gate(binding: D1Binding, match: RegExp) {
  let reach!: () => void;
  let open!: () => void;
  const reached = new Promise<void>(resolve => (reach = resolve));
  const held = new Promise<void>(resolve => (open = resolve));
  const wrapped: D1Binding = {
    prepare(sql: string) {
      const inner = binding.prepare(sql);
      if (!match.test(sql)) return inner;
      const statement: D1Statement = {
        bind(...values: unknown[]) { inner.bind(...values); return statement; },
        first: <T>() => inner.first<T>(),
        run: async () => { reach(); await held; return inner.run(); },
      };
      return statement;
    },
    batch: statements => binding.batch(statements),
  };
  return { binding: wrapped, reached, release: () => open() };
}

/** Counts how often a statement with a given shape actually runs. */
function count(binding: D1Binding, match: RegExp) {
  let runs = 0;
  const wrapped: D1Binding = {
    prepare(sql: string) {
      const inner = binding.prepare(sql);
      if (!match.test(sql)) return inner;
      const statement: D1Statement = {
        bind(...values: unknown[]) { inner.bind(...values); return statement; },
        first: <T>() => inner.first<T>(),
        run: async () => { runs++; return inner.run(); },
      };
      return statement;
    },
    batch: statements => binding.batch(statements),
  };
  return { binding: wrapped, runs: () => runs };
}

describe('D1 hosted rooms', () => {
  it('persists guest sessions and room membership across Worker requests', async () => {
    const binding = db();
    const guest = await new CloudRoomStore(binding).guest(undefined);
    expect(guest.cookie).toMatch(/^[a-f0-9]{64}$/);
    expect(await new CloudRoomStore(binding).guest(guest.cookie)).toEqual({ principal: guest.principal });
    const room = (await new CloudRoomStore(binding).command(alice, { operation: 'create', name: 'Alice', options })).view;
    expect((await new CloudRoomStore(binding).get(room.code, alice.principal)).code).toBe(room.code);
    await expect(new CloudRoomStore(binding).get(room.code, bob.principal)).rejects.toMatchObject({ status: 403 });
  });
  it('keeps hands private and atomically rejects simultaneous Rummy moves', async () => {
    const binding = db();
    const store = () => new CloudRoomStore(binding);
    let room = (await store().command(alice, { operation: 'create', name: 'Alice', options })).view;
    await store().command(bob, { operation: 'join', code: room.code, name: 'Bob' });
    room = (await store().command(bob, { operation: 'ready', code: room.code, ready: true })).view;
    room = (await store().command(alice, { operation: 'start', code: room.code, revision: room.revision })).view;
    const peer = await store().get(room.code, bob.principal);
    expect(peer.hand.some(card => room.hand.includes(card))).toBe(false);
    const command = { operation: 'move', code: room.code, revision: room.revision, requestId: randomUUID(), move: { t: 'draw', from: 'stock' } };
    const outcomes = await Promise.allSettled([
      store().command(bob, command),
      store().command(bob, { ...command, requestId: randomUUID() }),
    ]);
    expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(value => value.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect((await store().get(room.code, bob.principal)).hand).toHaveLength(11);
    expect(binding.sqlite.prepare('SELECT count(*) AS n FROM requests').get()?.n).toBe(1);
    const winner = outcomes.find(value => value.status === 'fulfilled');
    if (outcomes[0].status === 'fulfilled') {
      expect(await store().command(bob, command)).toEqual({ view: winner?.status === 'fulfilled' ? winner.value.view : null, changed: false });
    }
  });
  it('rejects competing Spades lobby edits without losing a committed player', async () => {
    const binding = db();
    const store = () => new CloudSpadesRoomStore(binding);
    const room = (await store().command(alice, { operation: 'create', name: 'Alice', options: {
      mode: 'online', variant: 'solo', humans: 4, target: 500, level: 'normal', table: CLASSIC_VENUE.id, deck: CLASSIC_DECK.id,
    } })).view;
    const outcomes = await Promise.allSettled([
      store().command(bob, { operation: 'join', code: room.code, name: 'Bob' }),
      store().command({ principal: 'guest:carol', jokers: false }, { operation: 'join', code: room.code, name: 'Carol' }),
    ]);
    expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(value => value.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect((await store().get(room.code, alice.principal)).players.filter(player => player.occupied)).toHaveLength(2);
  });
  it('rolls back request IDs and reward writes together when the revision guard fails', async () => {
    const binding = db();
    const store = new CloudDatabase(binding);
    await store.exec('BEGIN IMMEDIATE');
    store.expectRoom('rooms', 'AABBCCDD', 9);
    await store.prepare('INSERT INTO requests(code,actor,id,fingerprint) VALUES(?,?,?,?)').run('AABBCCDD', 'actor', 'request', 'move');
    await store.prepare('INSERT INTO reward_outbox(match_id,room_code,user_id,payload) VALUES(?,?,?,?)').run('match', 'AABBCCDD', 'user', '{}');
    await expect(store.exec('COMMIT')).rejects.toMatchObject({ status: 409 });
    expect(binding.sqlite.prepare('SELECT count(*) AS n FROM requests').get()?.n).toBe(0);
    expect(binding.sqlite.prepare('SELECT count(*) AS n FROM reward_outbox').get()?.n).toBe(0);
  });
  it('drops a presence write whose room changed while the poll was in flight', async () => {
    const binding = db();
    let now = Date.now();
    const room = (await new CloudRoomStore(binding, () => now).command(alice, { operation: 'create', name: 'Alice', options })).view;
    now += 21_000; // the host's stamp is now old enough that a plain read also writes presence
    const poll = gate(binding, /^UPDATE rooms SET data=\?/);
    const staleRead = new CloudRoomStore(poll.binding, () => now).get(room.code, alice.principal);
    await poll.reached; // this poll has already loaded revision 1
    const writes = new CloudRoomStore(binding, () => now);
    await writes.command(bob, { operation: 'join', code: room.code, name: 'Bob' });
    await writes.command(alice, { operation: 'ready', code: room.code, ready: true });
    await writes.command(bob, { operation: 'ready', code: room.code, ready: true });
    const ready = await writes.get(room.code, alice.principal);
    const started = (await writes.command(alice, { operation: 'start', code: room.code, revision: ready.revision })).view;
    expect(started.status).toBe('playing');
    poll.release();
    await staleRead;
    const after = await new CloudRoomStore(binding).get(room.code, bob.principal);
    expect(after.status).toBe('playing');
    expect(after.revision).toBe(started.revision);
    expect(after.players).toHaveLength(2);
  });
  it('drops a stale presence write in a Dominoes table too', async () => {
    const binding = db();
    let now = Date.now();
    const send = (store: DominoRoomStore, actor: typeof alice, input: Record<string, unknown>) => store.command(actor, { requestId: randomUUID(), ...input });
    const dominoes = { mode: 'online', variant: 'draw', level: 'normal', target: 100 } as const;
    const room = (await send(new DominoRoomStore(binding, () => now), alice, { operation: 'create', name: 'Alice', options: dominoes })).view;
    now += 21_000;
    const poll = gate(binding, /^UPDATE domino_rooms SET data=\?/);
    const staleRead = new DominoRoomStore(poll.binding, () => now).get(room.code, alice.principal);
    await poll.reached;
    await send(new DominoRoomStore(binding, () => now), bob, { operation: 'join', code: room.code, name: 'Bob' });
    poll.release();
    await staleRead;
    const after = await new DominoRoomStore(binding, () => now).get(room.code, bob.principal);
    expect(after.players).toHaveLength(2);
  });
  it('lets either player start the next round in a hosted Rummy table', async () => {
    const binding = db(), store = () => new CloudRoomStore(binding);
    let room = (await store().command(alice, { operation: 'create', name: 'Alice', options })).view;
    await store().command(bob, { operation: 'join', code: room.code, name: 'Bob' });
    await store().command(bob, { operation: 'ready', code: room.code, ready: true });
    const lobby = await store().get(room.code, alice.principal);
    room = (await store().command(alice, { operation: 'start', code: room.code, revision: lobby.revision })).view;
    const data = JSON.parse(String((binding.sqlite.prepare('SELECT data FROM rooms WHERE code=?').get(room.code) as { data: string }).data));
    data.state.phase = 'roundOver';
    binding.sqlite.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(data), room.code);
    const over = await store().get(room.code, bob.principal);
    expect(over.phase).toBe('roundOver');
    const next = (await store().command(bob, { operation: 'move', code: room.code, revision: over.revision, requestId: randomUUID(), move: { t: 'next' } })).view;
    expect(next.round).toBe(over.round + 1);
    expect(next.phase).not.toBe('roundOver');
    await expect(store().command(bob, { operation: 'move', code: room.code, revision: next.revision, requestId: randomUUID(), move: { t: 'next' } })).rejects.toMatchObject({ message: expect.stringContaining('not legal') });
  });
  it('lets either player deal the next hand in a hosted Spades table', async () => {
    const binding = db(), store = () => new CloudSpadesRoomStore(binding), people = [alice, bob, carol, dave];
    let room = (await store().command(alice, { operation: 'create', name: 'Alice', options: {
      mode: 'online', variant: 'solo', humans: 4, target: 100, level: 'normal', table: CLASSIC_VENUE.id, deck: CLASSIC_DECK.id,
    } })).view;
    for (const [index, actor] of people.slice(1).entries()) {
      await store().command(actor, { operation: 'join', code: room.code, name: `Player ${index + 2}` });
      await store().command(actor, { operation: 'ready', code: room.code, ready: true });
    }
    const lobby = await store().get(room.code, alice.principal);
    room = (await store().command(alice, { operation: 'start', code: room.code, revision: lobby.revision })).view;
    const data = JSON.parse(String((binding.sqlite.prepare('SELECT data FROM spades_rooms WHERE code=?').get(room.code) as { data: string }).data));
    data.state.phase = 'handOver';
    binding.sqlite.prepare('UPDATE spades_rooms SET data=? WHERE code=?').run(JSON.stringify(data), room.code);
    const over = await store().get(room.code, bob.principal);
    expect(over.phase).toBe('handOver');
    const next = (await store().command(bob, { operation: 'move', code: room.code, revision: over.revision, requestId: randomUUID(), move: { t: 'next' } })).view;
    expect(next.round).toBe(over.round + 1);
    expect(next.dealer).toBe((over.dealer + 1) % 4);
    expect(next.phase).toBe('bid');
  });
  it('writes a waiting table at most once per stamp window while a guest polls', async () => {
    const binding = db(), now = { value: 1_700_000_000_000 }, clock = () => now.value;
    const opener = new DominoRoomStore(binding, clock);
    const dominoes = { mode: 'online', variant: 'draw', level: 'normal', target: 100 } as const;
    const room = (await opener.command(alice, { requestId: randomUUID(), operation: 'create', name: 'Alice', options: dominoes })).view;
    await opener.command(bob, { requestId: randomUUID(), operation: 'join', code: room.code, name: 'Bob' });
    const watched = count(binding, /^UPDATE domino_rooms SET data=\?/);
    const poll = new DominoRoomStore(watched.binding, clock);
    let polls = 0;
    for (let elapsed = 0; elapsed <= 58_000; elapsed += 2_500) {
      expect((await poll.get(room.code, bob.principal)).code).toBe(room.code);
      polls++; now.value += 2_500;
    }
    // 24 reads fit in 58 seconds; only the stamps at +20s and +40s need a write.
    expect(polls).toBe(24);
    expect(watched.runs()).toBe(2);
  });
});
