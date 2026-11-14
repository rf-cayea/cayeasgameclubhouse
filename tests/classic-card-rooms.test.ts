import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { ClassicCardRooms } from '../server/classic-card-rooms';
import { EconomyStore } from '../server/economy';
import { ownsCardTable } from '../src/lib/card-table-themes';
import { rummyAppearanceView } from '../src/lib/rummy-cosmetics';
import { spadesVenue } from '../src/lib/spades-cosmetics';
import type { ClassicAction, ClassicKind, ClassicOptions } from '../src/lib/classic-card-protocol';
import { TestD1 } from './helpers/d1';

const databases: TestD1[] = [];
const guest = (seat: number) => ({ principal: `guest:classic-${seat}`, jokers: false });
const host = { principal: 'member:11111111-1111-4111-8111-111111111111', jokers: false };
const options = { listed: true, capacity: 4, jokers: true } as const;
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));

function setup(kind: ClassicKind) {
  const db = new TestD1();
  databases.push(db);
  let clock = 1_000_000;
  const advance = (ms = 1200) => { clock += ms; };
  const store = new ClassicCardRooms(db, () => clock);
  const send = (actor: typeof host, action: ClassicAction, requestId = randomUUID()) => store.command(kind, actor, { ...action, requestId });
  const open = async (actor = guest(0), tableOptions: ClassicOptions = options) => {
    const room = await send(actor, { operation: 'create', name: 'Host', options: tableOptions });
    return room!;
  };
  return { db, store, send, open, advance };
}

describe('shared-deck online card tables', () => {
  it('lists only public lobbies, gates moves and keeps other players’ hands and stock private', async () => {
    const { send, store, open, advance } = setup('eights');
    await send(guest(3), { operation: 'create', name: 'Private host', options: { ...options, listed: false } });
    const created = await open();
    const code = created.code;
    expect(await store.list('eights')).toMatchObject([{ code, host: 'Host', humans: 1 }]);
    expect(await store.list('hearts')).toEqual([]);
    await expect(store.get('eights', code, guest(1))).rejects.toMatchObject({ status: 403 });
    const joined = (await send(guest(1), { operation: 'join', code, name: 'Friend' }))!;
    await expect(send(guest(0), { operation: 'start', code, revision: joined.revision })).rejects.toThrow('everyone is ready');
    const ready = (await send(guest(1), { operation: 'ready', code, revision: joined.revision, ready: true }))!;
    await expect(send(guest(1), { operation: 'start', code, revision: ready.revision })).rejects.toThrow();
    const game = (await send(guest(0), { operation: 'start', code, revision: ready.revision }))!;
    expect(game.hand).toHaveLength(5);
    const other = await store.get('eights', code, guest(1));
    expect(other.hand).toHaveLength(5);
    expect(other.hand.every(card => !game.hand.includes(card))).toBe(true);
    expect(other.legal).toEqual([]);
    expect(other.game).not.toHaveProperty('hands');
    expect(other.game).not.toHaveProperty('stock');
    expect(await store.list('eights')).toEqual([]);
    await expect(send(guest(1), { operation: 'play', code, revision: game.revision, card: other.hand[0]! })).rejects.toThrow('Wait for your turn');
    await send(guest(0), { operation: 'leave', code });
    expect(await store.get('eights', code, guest(1))).toMatchObject({ host: true, game: { turn: 0 } });
    advance();
    // A draw can keep the same computer active until it plays or passes.
    for (let i = 0; i < 2; i++) { await store.get('eights', code, guest(1)); advance(); }
    expect(await store.get('eights', code, guest(1))).toMatchObject({ host: true, game: { turn: 1 } });
  });

  it('commits concurrent Hearts joins and passes without exposing anyone’s choices', async () => {
    const { send, store, open } = setup('hearts');
    const { code } = await open();
    const players = [0, 1, 2, 3].map(guest);
    await Promise.all(players.slice(1).map((player, i) => send(player, { operation: 'join', code, name: `Friend ${i}` })));
    for (const player of players.slice(1)) {
      const room = await store.get('hearts', code, player);
      await send(player, { operation: 'ready', code, revision: room.revision, ready: true });
    }
    const lobby = await store.get('hearts', code, guest(0));
    await send(guest(0), { operation: 'start', code, revision: lobby.revision });
    const before = await Promise.all(players.map(player => store.get('hearts', code, player)));
    expect(new Set(before.flatMap(room => room.hand)).size).toBe(52);
    expect(before.flatMap(room => room.hand)).toEqual(expect.arrayContaining(['X1', 'X2']));
    await Promise.all(players.map((player, i) => send(player, {
      operation: 'pass', code, revision: before[i]!.revision, round: 0, cards: before[i]!.hand.slice(0, 3),
    })));
    const after = await Promise.all(players.map(player => store.get('hearts', code, player)));
    expect(after.every(room => room.game?.kind === 'hearts' && room.game.phase === 'play')).toBe(true);
    expect(after.find(room => room.legal.length)?.legal).toEqual(['2C']);
    expect(after.every(room => room.hand.length === 13 && !Object.hasOwn(room.game!, 'passes'))).toBe(true);
  });

  it('credits a verified win, its achievement and crate progress only once', async () => {
    const { db, send, store } = setup('eights');
    const economy = new EconomyStore(db);
    await economy.ensureMember(host);
    const room = (await send(host, { operation: 'create', name: 'Host', options: { ...options, capacity: 1, listed: false } }))!;
    // Resume a deterministic last turn to test the transactional result and replay.
    const row = db.sqlite.prepare('SELECT data FROM classic_card_rooms WHERE code=?').get(room.code)!;
    const data = JSON.parse(String(row.data));
    data.game.state.hands[0] = ['X1'];
    db.sqlite.prepare('UPDATE classic_card_rooms SET data=? WHERE code=?').run(JSON.stringify(data), room.code);
    const id = randomUUID();
    const action = { operation: 'play', code: room.code, revision: room.revision, card: 'X1', suit: 'H' } as const;
    const won = await send(host, action, id);
    expect(won?.rewardMatchId).toBeTruthy();
    expect(await send(host, action, id)).toEqual(won);
    await expect(send(host, action)).rejects.toMatchObject({ status: 409 });
    expect(await store.list('eights')).toEqual([]);
    const first = await economy.read(host);
    const second = await economy.read(host);
    expect(second.wallet.rummy_points).toBeGreaterThan(0);
    expect(second.wallet.rummy_points).toBe(first.wallet.rummy_points);
    expect(second.stats).toMatchObject({ eightsWins: 1, eightsHumanWins: 0 });
    expect(second.achievements.find(award => award.id === 'crazy-eights-victory-1')?.unlocked).toBe(true);
    expect(db.sqlite.prepare("SELECT count(*) n FROM economy_ledger WHERE source LIKE 'crate-progress-v3:cards:bot:crazy-eights:%'").get()?.n).toBe(1);
  });

  it('recognizes legacy table purchases and previously earned Rummy+ surfaces', () => {
    expect(ownsCardTable(['rummy-table-nocturne'], 'spades-table-nocturne')).toBe(true);
    expect(spadesVenue('rummy-table-nocturne').id).toBe('spades-table-nocturne');
    expect(rummyAppearanceView(true, 5, { table_id: 'spades-table-atlas' }, ['spades-table-atlas'])).toMatchObject({
      equipped: { table: 'spades-table-atlas' }, owned: expect.arrayContaining(['rummy-table-sapphire', 'spades-table-atlas']),
    });
  });

  it('shows one computer move per deadline, even when players poll concurrently', async () => {
    const { db, send, store, advance } = setup('eights');
    const room = (await send(host, { operation: 'create', name: 'Host', options: { ...options, capacity: 1, listed: false } }))!;
    const saved = JSON.parse(String(db.sqlite.prepare('SELECT data FROM classic_card_rooms WHERE code=?').get(room.code)!.data));
    saved.game.state.hands = [['2C'], ['3C', '4D'], ['5C', '6D'], ['7C', '8D']];
    saved.game.state.pile = ['KC']; saved.game.state.active = 'C'; saved.game.state.turn = 1;
    saved.nextBotAt = 1_001_100;
    db.sqlite.prepare('UPDATE classic_card_rooms SET data=? WHERE code=?').run(JSON.stringify(saved), room.code);
    expect((await store.get('eights', room.code, host)).game).toMatchObject({ turn: 1, top: 'KC' });
    advance();
    const reads = await Promise.all([store.get('eights', room.code, host), store.get('eights', room.code, host)]);
    expect(reads.every(value => value.game?.turn === 2 && value.revision === room.revision + 1)).toBe(true);
    expect((await store.get('eights', room.code, host)).game).toMatchObject({ turn: 2, top: '3C' });
    advance();
    expect((await store.get('eights', room.code, host)).game).toMatchObject({ turn: 3, top: '5C' });
  });

  it('records a human Hearts win exactly once when the paced last trick is collected', async () => {
    const { db, send, store, advance } = setup('hearts');
    const economy = new EconomyStore(db);
    await economy.ensureMember(host);
    const room = (await send(host, { operation: 'create', name: 'Host', options: { ...options, capacity: 1, listed: false } }))!;
    const saved = JSON.parse(String(db.sqlite.prepare('SELECT data FROM classic_card_rooms WHERE code=?').get(room.code)!.data));
    Object.assign(saved.game.state, { phase: 'play', hands: [[], [], [], []], totals: [0, 99, 99, 99], taken: [0, 0, 0, 0],
      trick: [{ seat: 1, card: 'AC' }, { seat: 2, card: '2H' }, { seat: 3, card: 'QS' }, { seat: 0, card: '3C' }] });
    saved.nextBotAt = 1_001_600;
    db.sqlite.prepare('UPDATE classic_card_rooms SET data=? WHERE code=?').run(JSON.stringify(saved), room.code);
    expect((await store.get('hearts', room.code, host)).game).toMatchObject({ phase: 'play', trick: saved.game.state.trick });
    advance(1700);
    const result = await store.get('hearts', room.code, host);
    expect(result.game).toMatchObject({ phase: 'match', totals: [0, 113, 99, 99] });
    expect(result.rewardMatchId).toBeTruthy();
    await store.get('hearts', room.code, host);
    expect(db.sqlite.prepare('SELECT count(*) n FROM classic_card_rewards').get()?.n).toBe(1);
  });
});
