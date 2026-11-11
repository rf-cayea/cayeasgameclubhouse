import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RoomStore } from '../server/rooms';
import { CloudRoomStore } from '../server/cloud-rooms';
import { TestD1 } from './helpers/d1';
import { DEFAULT_RUMMY_APPEARANCE, RUMMY_DESIGNS } from '../src/lib/rummy-cosmetics';

const user = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const member = { principal: `member:${user}`, jokers: false };
const options = { mode: 'bot', variant: 'classic', seats: 2, level: 'normal', jokers: false };
const closes: (() => void)[] = [];
afterEach(() => closes.splice(0).forEach(close => close()));

function setup(kind: 'node' | 'd1') {
  const binding = kind === 'd1' ? new TestD1() : null;
  const node = kind === 'node' ? new RoomStore(':memory:') : null;
  const raw = binding?.sqlite ?? node!.db;
  closes.push(() => raw.close());
  const store = () => binding ? new CloudRoomStore(binding) : node!;
  async function win(mode = 'bot', actor = member) {
    const created = (await store().command(actor, { operation: 'create', name: 'Alice', options: { ...options, mode } })).view;
    const room = JSON.parse(String(raw.prepare('SELECT data FROM rooms WHERE code=?').get(created.code)!.data));
    // Server-owned test position: the next legal discard wins a full match.
    Object.assign(room.state, { turn: 0, phase: 'play', scores: [95, 0], hands: [['AS'], ['KH']], deck: ['2C'], discard: ['3D'], mustUse: null, drewDiscard: null });
    raw.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(room), created.code);
    const move = { operation: 'move', code: created.code, revision: created.revision, requestId: randomUUID(), move: { t: 'discard', card: 'AS' } };
    expect((await store().command(actor, move)).view.status).toBe('finished');
    return { move, code: created.code };
  }
  return { store, win, raw };
}

describe.each(['node', 'd1'] as const)('Rummy+ earned artwork on %s', kind => {
  it('includes default images but rejects forged ownership, counts, slots and locked equipment', async () => {
    const { store } = setup(kind);
    const defaults = await store().appearance('guest:any');
    expect(defaults).toMatchObject({ member: false, wins: 0, equipped: DEFAULT_RUMMY_APPEARANCE });
    expect(defaults.owned).toHaveLength(3);
    await expect(Promise.resolve().then(() => store().equipAppearance(member.principal, { background: 'rummy-room-moonlit', table: DEFAULT_RUMMY_APPEARANCE.table, wins: 100, owned: RUMMY_DESIGNS.map(item => item.id) }))).rejects.toMatchObject({ status: 403, code: 'design_locked' });
    await expect(Promise.resolve().then(() => store().equipAppearance(member.principal, { background: DEFAULT_RUMMY_APPEARANCE.table, table: DEFAULT_RUMMY_APPEARANCE.table }))).rejects.toMatchObject({ status: 400 });
    await expect(Promise.resolve().then(() => store().equipAppearance(member.principal, { ...DEFAULT_RUMMY_APPEARANCE, deck: 'card-deck-deco', wins: 100 }))).rejects.toMatchObject({ status: 403, code: 'design_locked' });
    expect((await store().appearance(member.principal)).equipped).toEqual(DEFAULT_RUMMY_APPEARANCE);
  });
  it('counts unique completed wins immediately, excludes unranked games, and isolates accounts', async () => {
    const { store, win, raw } = setup(kind);
    const fixture = await win();
    expect((await store().appearance(member.principal)).wins).toBe(1);
    expect(raw.prepare('SELECT status FROM reward_outbox').get()!.status).toBe('pending');
    await store().command(member, fixture.move);
    await win('local'); await win('bot', { principal: 'guest:any', jokers: false });
    const earned = await store().appearance(member.principal);
    expect(earned.wins).toBe(1);
    expect(earned.owned).toContain('rummy-room-riviera');
    expect(earned.owned).not.toContain('card-deck-atlas');
    expect(earned.owned).not.toContain('rummy-table-riviera');
    await store().equipAppearance(member.principal, { ...DEFAULT_RUMMY_APPEARANCE, background: 'rummy-room-riviera' });
    expect((await store().appearance(member.principal)).equipped.background).toBe('rummy-room-riviera');
    await store().equipAppearance(member.principal, { ...DEFAULT_RUMMY_APPEARANCE, deck: 'card-deck-atlas' }, ['card-deck-atlas']);
    await store().equipAppearance(member.principal, { background: 'rummy-room-riviera', table: DEFAULT_RUMMY_APPEARANCE.table }, ['card-deck-atlas']);
    expect((await store().appearance(member.principal, ['card-deck-atlas'])).equipped.deck).toBe('card-deck-atlas');
    expect(await store().appearance(`member:${other}`)).toMatchObject({ wins: 0, equipped: DEFAULT_RUMMY_APPEARANCE });
  });
  it('unlocks artwork and decks only as earned and saves independent selections', async () => {
    const { store, win } = setup(kind);
    for (let wins = 1; wins <= 10; wins++) {
      await win();
      const collection = await store().appearance(member.principal);
      expect(collection.wins).toBe(wins);
      for (const design of RUMMY_DESIGNS) expect(collection.owned.includes(design.id), `${design.name} at ${wins} wins`).toBe(!design.purchaseOnly && wins >= design.wins);
    }
    const equipped = { background: 'rummy-room-library', table: 'rummy-table-sapphire', deck: 'card-deck-deco' };
    await store().equipAppearance(member.principal, equipped, ['card-deck-deco']);
    expect((await store().appearance(member.principal, ['card-deck-deco'])).equipped).toEqual(equipped);
    await store().equipAppearance(member.principal, { ...equipped, table: 'rummy-table-burgundy' }, ['card-deck-deco']);
    expect((await store().appearance(member.principal, ['card-deck-deco'])).equipped).toEqual({ ...equipped, table: 'rummy-table-burgundy' });
  });
  it('reads old selections and equips the shared entitlement in Rummy without another purchase', async () => {
    const { store, raw } = setup(kind);
    raw.prepare('INSERT INTO rummy_appearance(principal,background,table_id,deck_id,updated_at) VALUES(?,?,?,?,?)').run(member.principal, DEFAULT_RUMMY_APPEARANCE.background, DEFAULT_RUMMY_APPEARANCE.table, 'rummy-deck-ember', Date.now());
    expect((await store().appearance(member.principal, ['spades-deck-ember'])).equipped.deck).toBe('card-deck-ember');
    const result = await store().equipAppearance(member.principal, { ...DEFAULT_RUMMY_APPEARANCE, deck: 'card-deck-fantasy' }, ['card-deck-fantasy']);
    expect(result.equipped.deck).toBe('card-deck-fantasy');
    expect((await store().appearance(`member:${other}`)).owned).not.toContain('card-deck-fantasy');
  });

});
