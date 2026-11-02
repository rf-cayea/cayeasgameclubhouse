import { describe, expect, it } from 'vitest';
import { cardLabel, reorderHand } from '../src/lib/hand-order';

describe('hand reordering', () => {
  it('inserts a moved card at its target without changing any physical cards or the input', () => {
    const hand = ['AS', '2H', 'TD', 'X1'];
    expect(reorderHand(hand, 0, 3)).toEqual(['2H', 'TD', 'X1', 'AS']);
    expect(reorderHand(hand, 3, 0)).toEqual(['X1', 'AS', '2H', 'TD']);
    expect(hand).toEqual(['AS', '2H', 'TD', 'X1']);
  });

  it('ignores absent, fractional, unchanged and outside positions', () => {
    const hand = ['AS', '2H', 'X1'];
    for (const [from, to] of [[-1, 2], [0, 3], [3, 0], [0.5, 1], [1, 1]]) {
      expect(reorderHand(hand, from!, to!)).toEqual(hand);
    }
    expect(reorderHand([], 0, 1)).toEqual([]);
  });

  it('names ranks, suits and separate jokers for assistive technology', () => {
    expect(['AS', 'TH', 'QD', 'KC', 'X1', 'X2'].map(cardLabel)).toEqual(['Ace of spades', '10 of hearts', 'Queen of diamonds', 'King of clubs', 'Joker 1', 'Joker 2']);
  });
});
