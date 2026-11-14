import { describe, expect, it } from 'vitest';
import { collectTrick, drawEight, eightsBot, eightsLegal, exchangeHearts, heartsBot, heartsLegal, heartPoints, playEight, playHeart, startEights, startHearts, type Hearts, type Eights } from '../src/lib/classic-cards';

describe('Hearts and Crazy Eights rules and complete games', () => {
  it('plays complete Hearts hands with either deck, legal follow suit, and exactly 26 penalty points', () => {
    for (const jokers of [false, true]) for (let round = 0; round < 8; round++) {
      let game = startHearts(jokers, round);
      game = exchangeHearts(game, []);
      let moves = 0;
      while (game.phase === 'play' && moves++ < 70) {
        const legal = heartsLegal(game);
        if (game.trick.length < 4) {
          expect(legal.length).toBeGreaterThan(0);
          expect(legal.every(card => game.hands[game.turn]!.includes(card))).toBe(true);
        }
        game = heartsBot(game);
      }
      expect(moves).toBe(65);
      expect(game.hands.flat()).toEqual([]);
      expect(game.taken.reduce((a, b) => a + b, 0)).toBe(26);
      expect(game.phase).toBe('round');
    }
  });

  it('prohibits first-trick penalties, requires following suit, and applies shooting the moon', () => {
    let game: Hearts = { ...startHearts(false), phase: 'play' as const, hands: [['2C'], ['3C', 'AH', 'QS'], ['4D', 'KH', 'QS'], ['5C']], turn: 0 };
    expect(heartsLegal(game)).toEqual(['2C']);
    game = playHeart(game, '2C');
    expect(heartsLegal(game)).toEqual(['3C']);
    game = playHeart(game, '3C');
    expect(heartsLegal(game)).toEqual(['4D']);
    const moon = collectTrick({ ...game, hands: [[], [], [], []], taken: [25, 0, 0, 0], trick: [{ seat: 0, card: 'AC' }, { seat: 1, card: '2H' }, { seat: 2, card: 'KC' }, { seat: 3, card: '3D' }] });
    expect(moon.totals).toEqual([0, 26, 26, 26]);
    expect(heartPoints('X1') + heartPoints('X2')).toBe(0);
  });

  it('preserves all 54 Crazy Eights cards through drawing, wilds and pile recycling', () => {
    for (let trial = 0; trial < 30; trial++) {
      let game = startEights();
      let moves = 0;
      while (!game.winners.length && moves++ < 3000) {
        const before = game;
        game = eightsBot(game);
        expect(game).not.toBe(before);
        const cards = [...game.hands.flat(), ...game.stock, ...game.pile];
        expect(cards.length).toBe(54);
        expect(new Set(cards).size).toBe(54);
      }
      expect(game.winners.length).toBeGreaterThan(0);
    }
  });

  it('keeps a playable drawn card on the same turn and honors the called wild suit', () => {
    let game: Eights = { ...startEights(), hands: [['3D'], ['4D'], ['5D'], ['6D']], pile: ['KH'], stock: ['2H'], active: 'H' as const };
    game = drawEight(game);
    expect(game.turn).toBe(0);
    expect(game.drew).toBe(true);
    expect(game.hands[0]).toContain('2H');
    game = playEight(game, '2H', 'H');
    expect(game.turn).toBe(1);
    const called = { ...game, active: 'C' as const, pile: ['8H'] };
    expect(eightsLegal(called, '2H')).toBe(false);
    expect(eightsLegal(called, '2C')).toBe(true);
    expect(eightsLegal(called, 'X2')).toBe(true);
  });
});
