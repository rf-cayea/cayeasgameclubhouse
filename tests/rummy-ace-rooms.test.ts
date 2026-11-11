import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RoomStore } from '../server/rooms';
import { CloudRoomStore } from '../server/cloud-rooms';
import { TestD1 } from './helpers/d1';
import type { Move } from '../src/lib/rummy';

const close: (() => void)[] = [];
afterEach(() => close.splice(0).forEach(fn => fn()));
const actor = { principal: 'guest:ace-regression', jokers: false };

describe.each(['node', 'd1'] as const)('ace runs in authoritative %s rooms', backend => {
  it.each(['classic', 'r500'] as const)('persists low/high melds and ace layoffs in %s while rejecting wrapped runs', async variant => {
    const binding = backend === 'd1' ? new TestD1() : null;
    const node = binding ? null : new RoomStore(':memory:');
    const raw = binding?.sqlite ?? node!.db;
    close.push(() => raw.close());
    const store = binding ? new CloudRoomStore(binding) : node!;
    const created = (await store.command(actor, { operation: 'create', name: 'Ace player', options: { mode: 'local', variant, seats: 2, level: 'normal', jokers: false } })).view;
    const room = JSON.parse(String(raw.prepare('SELECT data FROM rooms WHERE code=?').get(created.code)!.data));
    // A local, server-owned position: preserve every physical card and avoid
    // depending on a lucky deal. No test endpoint or production reward is used.
    const hand = ['AS', '2S', '3S', 'QH', 'KH', 'AH', '2H', 'AD', 'AC', '8C'];
    const table = ['2D', '3D', '4D', 'JC', 'QC', 'KC'];
    const opponent = ['7H', '9C'], discard = ['6H'];
    const used = new Set([...hand, ...table, ...opponent, ...discard]);
    const deck = [...'SHDC'].flatMap(suit => [...'A23456789TJQK'].map(rank => rank + suit)).filter(card => !used.has(card));
    Object.assign(room.state, { hands: [hand, opponent], deck, discard, turn: 0, phase: 'play', opening: null,
      melds: [table.slice(0, 3), table.slice(3)].map(cards => ({ cards: cards.map(c => ({ c, by: 1 })) })), laid: [0, 0] });
    raw.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(room), created.code);
    let view = await store.get(created.code, actor.principal);
    const send = async (move: Move) => {
      view = (await store.command(actor, { operation: 'move', code: view.code, revision: view.revision, requestId: randomUUID(), move })).view;
    };
    await expect(send({ t: 'meld', cards: ['KH', 'AH', '2S'] })).rejects.toThrow('not legal');
    await expect(send({ t: 'meld', cards: ['KH', 'AH', '2H'] })).rejects.toThrow('not legal');
    await send({ t: 'meld', cards: ['3S', 'AS', '2S'] });
    await send({ t: 'meld', cards: ['AH', 'KH', 'QH'] });
    await send({ t: 'layoff', card: 'AD', meld: 0 });
    await send({ t: 'layoff', card: 'AC', meld: 1 });
    const saved = await store.get(created.code, actor.principal);
    expect(saved.hand).toEqual(['2H', '8C']);
    expect(saved.melds).toHaveLength(4);
    expect(saved.melds[0]!.cards).toContainEqual({ c: 'AD', by: 0 });
    expect(saved.melds[1]!.cards).toContainEqual({ c: 'AC', by: 0 });
    expect(saved.melds[2]!.cards.map(card => card.c).sort()).toEqual(['2S', '3S', 'AS']);
    expect(saved.melds[3]!.cards.map(card => card.c).sort()).toEqual(['AH', 'KH', 'QH']);
    const persisted = JSON.parse(String(raw.prepare('SELECT data FROM rooms WHERE code=?').get(created.code)!.data));
    const all = [...persisted.state.deck, ...persisted.state.discard, ...persisted.state.hands.flat(), ...persisted.state.melds.flatMap((meld: { cards: { c: string }[] }) => meld.cards.map(card => card.c))];
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
  });
});
