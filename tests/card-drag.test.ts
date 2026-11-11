import { describe, expect, it } from 'vitest';
import { dragSelection, rummyDropAction, spadesDropMove } from '../src/lib/card-drag';
import type { RoomView } from '../src/lib/rummy-protocol';
import type { SpadesRoomView } from '../src/lib/spades-protocol';

const room = {
  hand: ['3S', '4S', '5S', '6S', 'KH'], melds: [], variant: 'classic', phase: 'play',
  drewDiscard: null, mustUse: null, status: 'playing', turn: 0, mySeat: 0,
} satisfies Parameters<typeof rummyDropAction>[0];
const spades = { hand: ['AS', '2H'], legal: ['2H'], status: 'playing', turn: 0, mySeat: 0, phase: 'play' } satisfies Parameters<typeof spadesDropMove>[0];
const drop = (overrides: Partial<RoomView>, target = 'rummy-discard', anchor = 'KH', cards = [anchor], enabled = true) => rummyDropAction({ ...room, ...overrides }, target, anchor, cards, enabled);

describe('table drag gestures', () => {
  it('drags the selected group only when its member is picked up, excluding unavailable cards', () => {
    expect(dragSelection('3S', ['3S', '4S', '3S', 'AC'], room.hand)).toEqual(['3S', '4S']);
    expect(dragSelection('KH', ['3S', '4S'], room.hand)).toEqual(['KH']);
    expect(dragSelection('AC', ['AC'], room.hand)).toEqual([]);
  });
  it('discards the card under the pointer even when a larger group was selected', () => {
    expect(drop({}, 'rummy-discard', 'KH', room.hand)).toEqual({ move: { t: 'discard', card: 'KH' } });
  });
  it.each([{ phase: 'draw' }, { phase: 'roundOver' }, { phase: 'gameOver' }, { turn: 1 }, { mySeat: null }, { status: 'abandoned' }, { mustUse: '3S' }, { drewDiscard: 'KH' }] as const)('rejects discard with %j', changed => {
    expect(drop(changed)).toBeNull();
  });
  it('rejects pending or hidden-hand interactions, foreign cards and unrecognized targets', () => {
    expect(drop({}, 'rummy-discard', 'KH', ['KH'], false)).toBeNull();
    expect(drop({}, 'rummy-discard', 'AC')).toBeNull();
    expect(drop({}, 'rummy-discard', 'KH', ['KH', 'AC'])).toBeNull();
    expect(drop({}, 'rummy-discard', 'KH', ['3S'])).toBeNull();
    expect(drop({}, 'room-background')).toBeNull();
  });
  it.each(['classic', 'r500'] as const)('melds a selected %s run without requiring a separate button', variant => {
    expect(drop({ variant }, 'rummy-melds', '3S', ['3S', '4S', '5S'])).toEqual({ move: { t: 'meld', cards: ['3S', '4S', '5S'] } });
    expect(drop({ variant }, 'rummy-melds', '3S', ['3S', '4S', 'KH'])).toBeNull();
    expect(drop({ variant: 'gin' }, 'rummy-melds', '3S', ['3S', '4S', '5S'])).toBeNull();
  });
  it('extends a unique eligible meld and asks which one when the card fits several', () => {
    const melds = [{ cards: ['3S', '4S', '5S'].map(c => ({ c, by: 1 })) }];
    expect(drop({ melds }, 'rummy-melds', '6S')).toEqual({ move: { t: 'layoff', card: '6S', meld: 0 } });
    expect(drop({ melds: [...melds, { cards: ['6H', '6D', '6C'].map(c => ({ c, by: 0 })) }] }, 'rummy-melds', '6S')).toEqual({ chooseMeld: '6S' });
    expect(drop({ melds }, 'rummy-melds', 'KH')).toBeNull();
    expect(drop({ melds }, 'rummy-melds', '6S', ['6S', 'KH'])).toBeNull();
  });
  it('plays only a legal Spades card into the current trick', () => {
    expect(spadesDropMove(spades, 'spades-play', '2H', true)).toEqual({ t: 'play', card: '2H' });
    expect(spadesDropMove(spades, 'spades-play', 'AS', true)).toBeNull();
    expect(spadesDropMove(spades, 'spades-play', '2H', false)).toBeNull();
    expect(spadesDropMove(spades, 'background', '2H', true)).toBeNull();
    expect(spadesDropMove({ ...spades, hand: ['AS'] }, 'spades-play', '2H', true)).toBeNull();
  });
  it.each([{ phase: 'bid' }, { phase: 'trickOver' }, { phase: 'handOver' }, { phase: 'gameOver' }, { turn: 1 }, { status: 'abandoned' }] as const)('rejects Spades play with %j', changed => {
    expect(spadesDropMove({ ...spades, ...changed } as SpadesRoomView, 'spades-play', '2H', true)).toBeNull();
  });
});
