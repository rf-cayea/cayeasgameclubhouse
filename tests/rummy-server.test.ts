import { afterEach, describe, expect, it } from 'vitest';
import { RoomStore } from '../server/rooms';
import { createGameServer } from '../server/http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import type { GameOptions, RoomView } from '../src/lib/rummy-protocol';

const stores: RoomStore[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
const open = (path = ':memory:') => { const store = new RoomStore(path); stores.push(store); return store; };
const a = { principal: 'guest:a', jokers: false }, b = { principal: 'guest:b', jokers: false }, c = { principal: 'guest:c', jokers: false };
const options: GameOptions = { mode: 'online', variant: 'classic', seats: 2, level: 'normal', jokers: false };
function started(store: RoomStore) {
  let room = store.command(a, { operation: 'create', name: 'Alice', options }).view;
  store.command(b, { operation: 'join', code: room.code, name: 'Bob' });
  room = store.command(b, { operation: 'ready', code: room.code, ready: true }).view;
  return store.command(a, { operation: 'start', code: room.code, revision: room.revision }).view;
}

describe('authoritative rooms', () => {
  it.each(['classic', 'r500'] as const)('shares %s public actions and live card counts without revealing drawn stock cards', variant => {
    const store = open();
    let room = store.command(a, { operation: 'create', name: 'Alice', options: { ...options, variant } }).view;
    store.command(b, { operation: 'join', code: room.code, name: 'Bob' });
    room = store.command(b, { operation: 'ready', code: room.code, ready: true }).view;
    room = store.command(a, { operation: 'start', code: room.code, revision: room.revision }).view;
    const before = store.get(room.code, b.principal);
    const drawn = store.command(b, { operation: 'move', code: room.code, revision: room.revision, requestId: randomUUID(), move: { t: 'draw', from: 'stock' } }).view;
    const peer = store.get(room.code, a.principal);
    expect(peer.players[1]!.count).toBe(before.hand.length + 1);
    expect(peer.activity).toEqual([{ id: 1, seat: 1, kind: 'stock', cards: [] }]);
    expect(peer.hand).toEqual(room.hand);
    const card = drawn.hand[0]!;
    const discarded = store.command(b, { operation: 'move', code: room.code, revision: drawn.revision, requestId: randomUUID(), move: { t: 'discard', card } }).view;
    const updated = store.get(room.code, a.principal);
    expect(updated.activity).toEqual(discarded.activity);
    expect(updated.activity!.at(-1)).toEqual({ id: 2, seat: 1, kind: 'discard', cards: [card] });
    expect(updated.players[1]!.count).toBe(before.hand.length);
    expect(updated.revealedHands).toBeNull();
  });
  it('fills a ready lobby and keeps stock and other hands private', () => {
    const store = open();
    const room = started(store);
    const peer = store.get(room.code, b.principal);
    expect(room.hand).toHaveLength(10);
    expect(peer.hand).toHaveLength(10);
    expect(room.hand.some(card => peer.hand.includes(card))).toBe(false);
    expect(room.revealedHands).toBeNull();
    expect(room).not.toHaveProperty('deck');
    expect(room).not.toHaveProperty('hands');
    expect(() => store.get(room.code, c.principal)).toThrow('not a member');
    expect(() => store.command(c, { operation: 'join', code: room.code, name: 'Other' })).toThrow();
  });
  it('rejects nonhost starts, unfilled rooms, out-of-turn moves, stale state, and forged actor fields', () => {
    const store = open();
    let room = store.command(a, { operation: 'create', name: 'Alice', options }).view;
    expect(() => store.command(a, { operation: 'start', code: room.code, revision: room.revision })).toThrow('every seat');
    store.command(b, { operation: 'join', code: room.code, name: 'Bob' });
    room = store.command(b, { operation: 'ready', code: room.code, ready: true }).view;
    expect(() => store.command(b, { operation: 'start', code: room.code, revision: room.revision })).toThrow('host');
    room = store.command(a, { operation: 'start', code: room.code, revision: room.revision }).view;
    const command = { operation: 'move', code: room.code, revision: room.revision, requestId: randomUUID(), move: { t: 'draw', from: 'stock' } };
    expect(() => store.command(a, command)).toThrow('not legal');
    expect(() => store.command(b, { ...command, move: { t: 'draw', from: 'stock', actor: 0 } })).toThrow('Invalid move');
    const drawn = store.command(b, command).view;
    expect(drawn.hand).toHaveLength(11);
    expect(() => store.command(b, { ...command, requestId: randomUUID() })).toThrow('table changed');
    expect(store.get(room.code, b.principal).hand).toHaveLength(11);
  });
  it('makes a retried move idempotent and rejects reuse of its ID for different content', () => {
    const store = open(); const room = started(store);
    const command = { operation: 'move', code: room.code, revision: room.revision, requestId: randomUUID(), move: { t: 'draw', from: 'stock' } };
    const first = store.command(b, command).view;
    expect(store.command(b, command)).toEqual({ view: first, changed: false });
    expect(() => store.command(b, { ...command, move: { t: 'discard', card: first.hand[0] } })).toThrow('cannot be reused');
  });
  it('persists rooms across service restart and does not bypass Joker ownership', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rummy-'));
    const path = join(directory, 'games.sqlite');
    const first = new RoomStore(path);
    const room = started(first); first.close();
    const second = new RoomStore(path);
    try {
      expect(second.get(room.code, a.principal)).toEqual(room);
      expect(() => second.command(a, { operation: 'create', name: 'Alice', options: { ...options, jokers: true } })).toThrow('500');
    } finally { second.close(); rmSync(directory, { recursive: true }); }
  });
  it('reassigns a waiting host and ends active games on leaving without declaring a winner', () => {
    const store = open(); const room = started(store);
    store.command(b, { operation: 'leave', code: room.code });
    const after = store.get(room.code, a.principal);
    expect(after.status).toBe('abandoned'); expect(after.winner).toBeNull();
    expect(() => store.command(a, { operation: 'move', code: room.code, revision: after.revision, requestId: randomUUID(), move: { t: 'draw', from: 'stock' } })).toThrow('not accepting');
  });
  it('only enables wild jokers for a verified owner, and supports four local seats', () => {
    const store = open();
    const room = store.command({ ...a, jokers: true }, { operation: 'create', name: 'Alice', options: { ...options, mode: 'local', seats: 4, jokers: true } }).view;
    expect(room.jokers).toBe(true);
    expect(room.players).toHaveLength(4);
    expect(room.hand).toHaveLength(7);
    expect(room.mySeat).toBe(room.turn);
    expect(room.players.every(player => player.you && !player.bot)).toBe(true);
  });
});

describe('real HTTP multiplayer', () => {
  it('uses separate HttpOnly guest sessions, live events, private views, and atomic competing moves', async () => {
    const store = open(); const { server, closeStreams } = createGameServer({ store });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const controller = new AbortController();
    try {
      const one = await fetch(`${base}/api/rummy/session`), two = await fetch(`${base}/api/rummy/session`);
      const cookieA = one.headers.get('set-cookie')!.split(';')[0]!, cookieB = two.headers.get('set-cookie')!.split(';')[0]!;
      expect(cookieA).not.toEqual(cookieB); expect(one.headers.get('set-cookie')).toContain('HttpOnly');
      const post = (cookie: string, data: unknown) => fetch(`${base}/api/rummy`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      let room: RoomView = await (await post(cookieA, { operation: 'create', name: 'Alice', options })).json() as RoomView;
      await post(cookieB, { operation: 'join', code: room.code, name: 'Bob' });
      room = await (await post(cookieB, { operation: 'ready', code: room.code, ready: true })).json() as RoomView;
      const live = await fetch(`${base}/api/rummy/room/${room.code}/events`, { headers: { cookie: cookieA }, signal: controller.signal });
      expect(live.headers.get('content-type')).toBe('text/event-stream');
      const reader = live.body!.getReader(); await reader.read();
      room = await (await post(cookieA, { operation: 'start', code: room.code, revision: room.revision })).json() as RoomView;
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('revision');
      const rival = await (await fetch(`${base}/api/rummy/room/${room.code}`, { headers: { cookie: cookieB } })).json() as RoomView;
      expect(rival.hand.some(card => room.hand.includes(card))).toBe(false);
      const results = await Promise.all([0, 1].map(() => post(cookieB, { operation: 'move', code: room.code, revision: room.revision, requestId: randomUUID(), move: { t: 'draw', from: 'stock' } })));
      expect(results.map(result => result.status).sort()).toEqual([200, 409]);
      const forged = await fetch(`${base}/api/rummy`, { method: 'POST', headers: { cookie: cookieB, 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify({ operation: 'leave', code: room.code }) });
      expect(forged.status).toBe(403);
      const outsider = await fetch(`${base}/api/rummy/room/${room.code}`); expect(outsider.status).toBe(403);
      await reader.cancel();
    } finally {
      controller.abort(); closeStreams();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }, 15_000);
});
