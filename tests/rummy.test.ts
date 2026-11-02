import { describe, expect, it } from 'vitest';
import { bestArrangement, cardValue, isMeld, isRun, isSet, MAX_BEST_SORT_CARDS, newGame, rankOf, sortHandByRank, sortHandBySuit, winTier, type Card, type Player, type Variant } from '../src/lib/rummy';
const players: Player[] = [
  { id: 'one', name: 'One', bot: false },
  { id: 'two', name: 'Two', bot: true, level: 'hard' },
];
describe('Rummy dealing', () => {
  it.each(['classic', 'gin', 'r500'] as const)('deals unique cards for %s', variant => {
    const state = newGame(variant, players, () => 0.25);
    const all = [...state.deck, ...state.discard, ...state.hands.flat()];
    expect(all).toHaveLength(52);
    expect(new Set(all).size).toBe(52);
    expect(state.hands.map(hand => hand.length)).toEqual(variant === 'r500' ? [13, 13] : [10, 10]);
    expect(state.phase).toBe('draw');
  });
  it('includes two distinct physical jokers only when enabled', () => {
    const state = newGame('classic', players, () => 0.5, 1, true);
    const all = [...state.deck, ...state.discard, ...state.hands.flat()];
    expect(all).toHaveLength(54);
    expect(new Set(all).size).toBe(54);
    expect(all.filter(card => card.startsWith('X')).sort()).toEqual(['X1', 'X2']);
  });
  it('rejects invalid player counts, repeated player identities and random values', () => {
    expect(() => newGame('gin', [...players, { id: 'three', name: 'Three', bot: false }], Math.random)).toThrow();
    expect(() => newGame('classic', [players[0]!, players[0]!], Math.random)).toThrow();
    expect(() => newGame('classic', players, () => 1)).toThrow();
  });
});
describe('Rummy meld rules', () => {
  it('accepts sets and suited runs including wildcard gaps', () => {
    expect(isSet(['7S', '7H', 'X1'])).toBe(true);
    expect(isRun(['2S', '4S', 'X1'], false)).toBe(true);
    expect(isMeld(['QS', 'KS', 'AS'], 'r500')).toBe(true);
    expect(isMeld(['QS', 'KS', 'AS'], 'gin')).toBe(false);
  });
  it('rejects mixed suits, repeated physical cards and invalid card codes', () => {
    for (const hand of [['2S', '3H', '4S'], ['7S', '7S', '7H'], ['7S', 'X1', 'X1'], ['ZZ', 'ZY', 'ZX'], ['ASjunk', '2S', '3S']]) {
      expect(isMeld(hand, 'classic')).toBe(false);
    }
    expect(rankOf('ZZ')).toBe(0);
    expect(() => cardValue('ZZ', 'classic')).toThrow();
  });
  it('uses variant scores and verified table tiers', () => {
    expect(cardValue('AS', 'r500')).toBe(15);
    expect(cardValue('AS', 'gin')).toBe(1);
    expect(cardValue('X1', 'classic')).toBe(15);
    expect(winTier(players)).toBe('hard');
    expect(winTier(players.map(player => ({ ...player, bot: false })))).toBe('humans');
  });
});

describe('Best Sort', () => {
  it('groups a completed run and reports zero deadwood without changing the hand', () => {
    const hand = ['4S', '2S', '3S'];
    expect(bestArrangement(hand, 'gin')).toEqual({ melds: [['2S', '3S', '4S']], deadwood: [], dw: 0 });
    expect(hand).toEqual(['4S', '2S', '3S']);
  });

  it('finds a better overlapping set/run allocation than taking the longest run first', () => {
    const hand = ['3S', '4S', '5S', '5H', '5D', '6S', '7S', '8S'];
    const result = bestArrangement(hand, 'gin');
    expect(result.dw).toBe(7);
    expect(result.deadwood).toEqual(['3S', '4S']);
    expect(result.melds).toContainEqual(['5S', '5H', '5D']);
    expect(result.melds).toContainEqual(['6S', '7S', '8S']);
  });

  it('allocates a joker globally across overlapping runs and sets', () => {
    const hand = ['3S', '4S', '5S', '5H', '5D', '6S', '7S', '8S', 'X1'];
    const result = bestArrangement(hand, 'gin');
    expect(result.dw).toBe(0);
    expect(result.melds).toHaveLength(2);
    expect(result.melds.every(meld => isMeld(meld, 'gin'))).toBe(true);
    expect([...result.melds.flat(), ...result.deadwood].sort()).toEqual([...hand].sort());
  });

  it('places jokers in run gaps and applies ace-high only to Rummy 500', () => {
    expect(bestArrangement(['4S', 'X1', '2S'], 'classic')).toEqual({ melds: [['2S', 'X1', '4S']], deadwood: [], dw: 0 });
    expect(bestArrangement(['AS', 'QS', 'X1'], 'r500')).toEqual({ melds: [['QS', 'X1', 'AS']], deadwood: [], dw: 0 });
    expect(bestArrangement(['AS', 'QS', 'KS'], 'r500').dw).toBe(0);
    expect(bestArrangement(['AS', 'QS', 'KS'], 'gin').dw).toBe(21);
  });

  it('is deterministic across manual reorderings and preserves both physical jokers', () => {
    const hand = ['7H', '6S', '7D', '4S', 'X2', '7S', 'X1', '9C', 'AS', '3S'];
    const expected = bestArrangement(hand, 'r500');
    expect(bestArrangement([...hand].reverse(), 'r500')).toEqual(expected);
    expect(bestArrangement([...hand.slice(3), ...hand.slice(0, 3)], 'r500')).toEqual(expected);
    expect([...expected.melds.flat(), ...expected.deadwood].sort()).toEqual([...hand].sort());
    expect(expected.dw).toBe(expected.deadwood.reduce((total, card) => total + cardValue(card, 'r500'), 0));
  });

  it('prefers one coherent run over equivalent split runs and fewer deadwood cards on score ties', () => {
    expect(bestArrangement(['2S', '3S', '4S', '5S', '6S', '7S'], 'gin').melds).toEqual([['2S', '3S', '4S', '5S', '6S', '7S']]);
    const result = bestArrangement(['5D', 'AS', '4S', 'X2', '6H', '3H', '7S', '3S', 'KS'], 'r500');
    expect(result.dw).toBe(30);
    expect(result.deadwood).toHaveLength(5); // An equally scored ace-high alternative leaves six.
  });

  it('handles empty hands and rejects invalid, duplicate, and oversized hands explicitly', () => {
    expect(bestArrangement([], 'gin')).toEqual({ melds: [], deadwood: [], dw: 0 });
    expect(() => bestArrangement(['ZZ'], 'gin')).toThrow('valid, distinct');
    expect(() => bestArrangement(['AS', 'AS'], 'gin')).toThrow('valid, distinct');
    expect(() => bestArrangement(['X1', 'X1'], 'r500')).toThrow('valid, distinct');
    const oversized = [...'SHDC'].flatMap(suit => [...'A23456789TJQK'].map(rank => rank + suit)).slice(0, MAX_BEST_SORT_CARDS + 1);
    expect(() => bestArrangement(oversized, 'gin')).toThrow('up to 20 cards');
    expect(() => bestArrangement(['AS'], 'unknown' as Variant)).toThrow('Invalid Rummy variant');
  });

  it('exactly agrees with an exhaustive partition oracle on small hands', () => {
    const oracle = (hand: Card[], variant: Variant): number => {
      const all = (1 << hand.length) - 1;
      const melds: number[] = [];
      for (let mask = 1; mask <= all; mask++) {
        const cards = hand.filter((_, index) => mask & (1 << index));
        if (isMeld(cards, variant)) melds.push(mask);
      }
      const memo = new Map<number, number>();
      const solve = (mask: number): number => {
        if (memo.has(mask)) return memo.get(mask)!;
        let score = hand.reduce((total, card, index) => total + ((mask & (1 << index)) ? cardValue(card, variant) : 0), 0);
        for (const meld of melds) if ((mask & meld) === meld) score = Math.min(score, solve(mask ^ meld));
        memo.set(mask, score);
        return score;
      };
      return solve(all);
    };
    const pool = ['AS', '2S', '3S', '4S', '5S', 'QS', 'KS', '3H', '3D', '5H', '5D', 'X1', 'X2'];
    for (let shift = 0; shift < pool.length; shift++) {
      const hand = [...pool.slice(shift), ...pool.slice(0, shift)].slice(0, 8);
      for (const variant of ['classic', 'gin', 'r500'] as const) expect(bestArrangement(hand, variant).dw).toBe(oracle(hand, variant));
    }
  });

  it('keeps a representative fourteen-card exact search responsive', () => {
    const hand = ['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS', 'X1'];
    const started = performance.now();
    const result = bestArrangement(hand, 'gin');
    expect(result.dw).toBe(0);
    expect(result.melds.flat()).toHaveLength(14);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('manual hand sorts', () => {
  it('sorts by rank or suit with jokers last and leaves the original order intact', () => {
    const hand = ['X2', '3D', '3S', 'KC', 'AS', '3H', 'X1'];
    const original = [...hand];
    expect(sortHandByRank(hand)).toEqual(['AS', '3S', '3H', '3D', 'KC', 'X1', 'X2']);
    expect(sortHandBySuit(hand)).toEqual(['AS', '3S', '3H', '3D', 'KC', 'X1', 'X2']);
    expect(sortHandBySuit(['2C', 'KS', 'AH', '3D'])).toEqual(['KS', 'AH', '3D', '2C']);
    expect(hand).toEqual(original);
  });
});
