import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { FarkleRoomStore } from '../server/farkle-rooms';
import { CarromRoomStore } from '../server/carrom-rooms';
const databases: TestD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));
const host = { principal: 'member:11111111-1111-4111-8111-111111111111', jokers: false };
const peer = { principal: 'member:22222222-2222-4222-8222-222222222222', jokers: false };

describe.each(['farkle', 'carrom'] as const)('%s completed table departures', game => {
  it('lets both players leave concurrently, preserves the result and reward, and opens another match', async () => {
    const db = new TestD1(); databases.push(db);
    const store = game === 'farkle' ? new FarkleRoomStore(db) : new CarromRoomStore(db);
    const options = { mode: 'online', seats: 2, level: 'normal', ...(game === 'carrom' ? { variant: 'disc-pool' } : {}) };
    const send = (actor: typeof host, input: object) => store.command(actor, { requestId: randomUUID(), ...input });
    const created = (await send(host, { operation: 'create', name: 'Host', options })).view;
    await send(peer, { operation: 'join', code: created.code, name: 'Friend' });
    await send(peer, { operation: 'ready', code: created.code, ready: true });
    const ready = await store.get(created.code, host.principal);
    await send(host, { operation: 'start', code: ready.code, revision: ready.revision });
    const table = game === 'farkle' ? 'farkle_rooms' : 'carrom_rooms';
    const record = JSON.parse(String(db.sqlite.prepare(`SELECT data FROM ${table} WHERE code=?`).get(created.code)!.data));
    record.status = 'finished'; record.state.phase = 'finished';
    if (game === 'farkle') { record.state.winners = [0]; record.state.scores = [10000, 1000]; }
    else { record.state.winner = 0; record.state.potted[0] = Array.from({ length: 9 }, (_, n) => `white-${n+1}`); }
    db.sqlite.prepare(`UPDATE ${table} SET data=? WHERE code=?`).run(JSON.stringify(record), created.code);
    const departure = { operation: 'leave', code: created.code, requestId: randomUUID() };
    const results = await Promise.all([store.command(host, departure), send(peer, { operation: 'leave', code: created.code })]);
    expect(results.every(result => result.view.state === null && result.view.players.length === 0)).toBe(true);
    expect((await store.command(host, departure)).changed).toBe(false);
    const final = JSON.parse(String(db.sqlite.prepare(`SELECT data FROM ${table} WHERE code=?`).get(created.code)!.data));
    expect(final.status).toBe('finished');
    expect(final.state).toEqual(record.state);
    expect(db.sqlite.prepare(`SELECT count(*) n FROM ${game}_rewards`).get()?.n).toBe(1);
    const next = (await send(host, { operation: 'create', name: 'Host', options: { ...options, mode: 'bot' } })).view;
    expect(next.code).not.toBe(created.code);
    expect(next.status).toBe('playing');
  });
});
