import { describe, expect, it } from 'vitest';
import { applyMove, botMove, canLayOff, canTakeDiscard, ginDefence, legalMelds, parseMove, analyseHand } from '../src/lib/rummy-engine';
import { newGame, type Card, type State, type Variant } from '../src/lib/rummy';
import { rng } from '../src/lib/game';

const players = [{ id: 'a', name: 'Alice', bot: false }, { id: 'b', name: 'Bob', bot: false }];
function state(variant: Variant = 'classic', hand: Card[] = ['3S', '4S', '5S', 'KH']): State {
  return { ...newGame(variant, players, rng(11)), turn: 0, opening: null, phase: 'play', hands: [hand, ['7H', '9C']], deck: ['2D', '8S', 'JC'], discard: ['AC'], melds: [], laid: [0, 0] };
}
const move = (s: State, action: Parameters<typeof applyMove>[2]) => {
  const next = applyMove(s, s.turn, action, rng(9));
  expect(next).not.toBeNull();
  return next!;
};

describe('complete Rummy turns', () => {
  it.each(['classic', 'r500'] as const)('records public %s plays and preserves each meld contribution', variant => {
    const original = state(variant, ['3S', '4S', '5S', '6S', 'KH']);
    const melded = move(original, { t: 'meld', cards: ['3S', '4S', '5S'] });
    const laid = move(melded, { t: 'layoff', card: '6S', meld: 0 });
    const discarded = move(laid, { t: 'discard', card: 'KH' });
    expect(discarded.activity).toEqual([
      { id: 1, seat: 0, kind: 'meld', cards: ['3S', '4S', '5S'], meld: 0 },
      { id: 2, seat: 0, kind: 'layoff', cards: ['6S'], meld: 0 },
      { id: 3, seat: 0, kind: 'discard', cards: ['KH'] },
    ]);
    expect(original.activity).toBeUndefined();
    const opponent = { ...melded, turn: 1, hands: [melded.hands[0]!, ['2S', '9H']] };
    const extended = move(opponent, { t: 'layoff', card: '2S', meld: 0 });
    expect(extended.melds[0]!.cards.at(-1)).toEqual({ c: '2S', by: 1 });
    expect(extended.activity!.at(-1)?.seat).toBe(1);
  });
  it('records face-up pickups but never the identity of a stock draw, and resets next round', () => {
    const original = { ...state('r500', ['3S', '4S', 'KH']), phase: 'draw' as const, discard: ['2H', '5S', '9C'] };
    const pickup = move(original, { t: 'draw', from: 'discard', index: 1 });
    expect(pickup.activity).toEqual([{ id: 1, seat: 0, kind: 'pickup', cards: ['5S', '9C'] }]);
    const drawn = move({ ...state(), phase: 'draw' }, { t: 'draw', from: 'stock' });
    expect(drawn.hands[0]).toContain('JC');
    expect(drawn.activity).toEqual([{ id: 1, seat: 0, kind: 'stock', cards: [] }]);
    const ended = move(state('classic', ['3S', '4S', '5S']), { t: 'meld', cards: ['3S', '4S', '5S'] });
    expect(move(ended, { t: 'next' }).activity ?? []).toEqual([]);
  });
  it('bounds public activity while keeping action IDs increasing on resumed games', () => {
    const original = state();
    original.activity = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, seat: 1, kind: 'stock', cards: [] }));
    const next = move(original, { t: 'discard', card: 'KH' });
    expect(next.activity).toHaveLength(40);
    expect(next.activity![0]!.id).toBe(2);
    expect(next.activity!.at(-1)!.id).toBe(41);
  });
  it.each(['classic', 'r500'] as const)('plays ace-low and ace-high melds and layoffs through the %s turn engine', variant => {
    for (const cards of [['AS', '2S', '3S'], ['AS', 'QS', 'KS'], ['AS', 'QS', 'X1']]) {
      const start = state(variant, [...cards, '8H']); start.jokers = true;
      const melded = move(start, { t: 'meld', cards });
      expect(melded.hands[0]).toEqual(['8H']);
      expect(melded.melds[0]!.cards.map(card => card.c)).toEqual(cards);
      expect(legalMelds(cards, variant)).toContainEqual(expect.arrayContaining(cards));
      for (const level of ['easy', 'normal', 'hard'] as const) expect(botMove(start, 0, level, rng(4))?.t).toBe('meld');
    }
    for (const ranks of ['234', 'JQK']) {
      const start = state(variant, ['AS', '8H']);
      start.melds = [{ cards: [...ranks].map(rank => ({ c: rank + 'S', by: 1 })) }];
      expect(canLayOff('AS', start.melds[0]!, variant)).toBe(true);
      const extended = move(start, { t: 'layoff', card: 'AS', meld: 0 });
      expect(extended.hands[0]).toEqual(['8H']);
      expect(extended.melds[0]!.cards).toContainEqual({ c: 'AS', by: 0 });
    }
    const wrapped = state(variant, ['KS', 'AS', '2S', '8H']);
    expect(applyMove(wrapped, 0, { t: 'meld', cards: ['KS', 'AS', '2S'] })).toBeNull();
  });
  it('requires exactly one draw, ownership, current turn, and a legal discard', () => {
    const start = { ...state(), phase: 'draw' as const };
    const snapshot = structuredClone(start);
    expect(applyMove(start, 1, { t: 'draw', from: 'stock' })).toBeNull();
    expect(applyMove(start, 0, { t: 'meld', cards: ['3S', '4S', '5S'] })).toBeNull();
    const drawn = move(start, { t: 'draw', from: 'stock' });
    expect(drawn.hands[0]).toContain('JC');
    expect(applyMove(drawn, 0, { t: 'draw', from: 'stock' })).toBeNull();
    expect(applyMove(drawn, 0, { t: 'discard', card: '2C' })).toBeNull();
    const discarded = move(drawn, { t: 'discard', card: 'KH' });
    expect(discarded.turn).toBe(1);
    expect(discarded.phase).toBe('draw');
    expect(start).toEqual(snapshot);
  });
  it('will not immediately discard the same card picked up from the discard pile', () => {
    const s = move({ ...state(), phase: 'draw' }, { t: 'draw', from: 'discard' });
    expect(applyMove(s, 0, { t: 'discard', card: 'AC' })).toBeNull();
  });
  it('melds, credits layoffs to their player, goes out, scores, and ends a match', () => {
    const start = state('classic', ['3S', '4S', '5S', '6S']);
    start.target = 10;
    const melded = move(start, { t: 'meld', cards: ['3S', '4S', '5S'] });
    const ended = move(melded, { t: 'layoff', card: '6S', meld: 0 });
    expect(ended.phase).toBe('gameOver');
    expect(ended.winner).toBe(0);
    expect(ended.scores).toEqual([16, 0]);
    expect(ended.melds[0]!.cards.at(-1)).toEqual({ c: '6S', by: 0 });
  });
  it('rotates the dealer, preserves cumulative scores, and rejects restarting completed matches', () => {
    const ended = move(state('classic', ['3S', '4S', '5S']), { t: 'meld', cards: ['3S', '4S', '5S'] });
    const next = move(ended, { t: 'next' });
    expect(next.round).toBe(2);
    expect(next.dealer).toBe(1);
    expect(next.turn).toBe(0);
    expect(next.scores).toEqual(ended.scores);
    expect(applyMove({ ...ended, phase: 'gameOver' }, 0, { t: 'next' })).toBeNull();
  });
  it('recycles Classic discards without losing the face-up top card', () => {
    const s = move({ ...state(), phase: 'draw', deck: [], discard: ['2H', '3H', '4H'] }, { t: 'draw', from: 'stock' });
    expect(s.discard).toEqual(['4H']);
    expect([...s.deck, ...s.hands[0]!].filter(c => ['2H', '3H'].includes(c)).sort()).toEqual(['2H', '3H']);
  });
  it('rejects forged payloads and invalid meld/layoff ownership', () => {
    expect(parseMove({ t: 'discard', card: 'AS', actor: 1 })).toBeNull();
    expect(parseMove({ t: 'draw', from: 'discard', index: 1.5 })).toBeNull();
    expect(applyMove(state(), 0, { t: 'meld', cards: ['7H', '8H', '9H'] })).toBeNull();
    expect(applyMove(state(), 0, { t: 'layoff', card: '3S', meld: -1 })).toBeNull();
  });
});

describe('Rummy 500', () => {
  it('requires the deepest selected discard to be usable and actually used before discarding', () => {
    const start = { ...state('r500', ['3S', '4S', 'KH']), phase: 'draw' as const, discard: ['5S', '2H', '8C'] };
    expect(canTakeDiscard(start, 0)).toBe(true);
    expect(canTakeDiscard(start, 1)).toBe(false);
    const drawn = move(start, { t: 'draw', from: 'discard', index: 0 });
    expect(drawn.hands[0]).toHaveLength(6);
    expect(drawn.mustUse).toBe('5S');
    expect(applyMove(drawn, 0, { t: 'discard', card: 'KH' })).toBeNull();
    const melded = move(drawn, { t: 'meld', cards: ['3S', '4S', '5S'] });
    expect(melded.mustUse).toBeNull();
    expect(move(melded, { t: 'discard', card: 'KH' }).turn).toBe(1);
  });
  it('scores each player’s laid cards minus the cards left in their hand', () => {
    const s = state('r500', ['3S', '4S', '5S']);
    s.laid = [10, 15];
    const result = move(s, { t: 'meld', cards: ['3S', '4S', '5S'] });
    expect(result.roundResult?.points).toEqual([25, 5]);
  });
  it('scores a stock-exhaustion round and handles a large legal hand without freezing Best Sort', () => {
    const s = move({ ...state('r500'), phase: 'draw', deck: [] }, { t: 'draw', from: 'stock' });
    expect(s.phase).toBe('roundOver');
    const hand = [...'SHDC'].flatMap(suit => [...'A23456789TJQK'].map(rank => rank + suit));
    const analysis = analyseHand(hand, 'r500');
    expect(analysis.optimal).toBe(false);
    expect([...analysis.melds.flat(), ...analysis.deadwood].sort()).toEqual([...hand].sort());
    expect(legalMelds(['QS', 'KS', 'AS', 'X1'], 'r500').length).toBeGreaterThan(0);
  });
});

describe('Gin Rummy', () => {
  it('offers the opening upcard to both players before a forced stock draw', () => {
    const start = newGame('gin', players, rng(1));
    expect(start.turn).toBe(1);
    expect(applyMove(start, 1, { t: 'draw', from: 'stock' })).toBeNull();
    const first = move(start, { t: 'pass' });
    expect(first.turn).toBe(0);
    const both = move(first, { t: 'pass' });
    expect(both.opening).toBe('stock');
    expect(applyMove(both, 1, { t: 'draw', from: 'discard' })).toBeNull();
    expect(move(both, { t: 'draw', from: 'stock' }).phase).toBe('play');
  });
  it('keeps melds in hand and rejects knocks above ten deadwood', () => {
    expect(applyMove(state('gin'), 0, { t: 'meld', cards: ['3S', '4S', '5S'] })).toBeNull();
    expect(applyMove(state('gin', ['KH', 'QC', '9D', 'AS']), 0, { t: 'discard', card: 'AS', knock: true })).toBeNull();
  });
  it('scores Gin with a 25-point bonus and no opponent layoffs', () => {
    const s = state('gin', ['3S', '4S', '5S', 'AH']);
    const result = move(s, { t: 'discard', card: 'AH', knock: true });
    expect(result.roundResult?.points).toEqual([41, 0]);
    expect(result.roundResult?.note).toContain('went Gin');
    expect(result.roundResult?.announcement).toEqual({kind:'gin',seat:0,deadwood:0});
  });
  it('accounts for chained opponent layoffs and scores undercuts, including ties', () => {
    expect(ginDefence(['6S', '7S', 'KH'], [['3S', '4S', '5S']])).toBe(10);
    const s = state('gin', ['3S', '4S', '5S', '2H', 'AC']);
    s.hands[1] = ['6S', '7S', 'AD'];
    const result = move(s, { t: 'discard', card: 'AC', knock: true });
    expect(result.roundResult?.winner).toBe(1);
    expect(result.roundResult?.points).toEqual([0, 26]);
    expect(result.roundResult?.announcement).toEqual({kind:'knock',seat:0,deadwood:2});
  });
  it('ends the round without points when only two stock cards remain', () => {
    const result = move({ ...state('gin'), phase: 'draw', deck: ['AS', '2S'] }, { t: 'draw', from: 'stock' });
    expect(result.phase).toBe('roundOver');
    expect(result.roundResult?.points).toEqual([0, 0]);
  });
});

describe('complete computer matches', () => {
  it('uses global meld allocation on Hard and never reads hidden opponent cards', () => {
    const s = state('classic', ['3S', '4S', '5S', '5H', '5D', '6S', '7S', '8S']);
    expect(botMove(s, 0, 'hard', rng(4))).toEqual({ t: 'meld', cards: ['5S', '5H', '5D'] });
    const differentSecrets = { ...s, hands: [s.hands[0]!, ['AH', 'AS']], deck: ['KC', 'KD', 'KH'] };
    expect(botMove(differentSecrets, 0, 'hard', rng(4))).toEqual(botMove(s, 0, 'hard', rng(4)));
  });
  it.each((['classic', 'gin', 'r500'] as const).flatMap(variant => [false, true].map(jokers => ({ variant, jokers }))))('plays $variant (jokers=$jokers) to its real match target with conserved cards', ({ variant, jokers }) => {
    const random = rng(72);
    let s = newGame(variant, players, random, 1, jokers);
    // Ace-high Classic runs can leave only one-point cards to score, so a
    // full 100-point match needs more rounds. Keep the real match target.
    for (let actions = 0; actions < 10000 && s.phase !== 'gameOver'; actions++) {
      const action = s.phase === 'roundOver' ? { t: 'next' as const } : botMove(s, s.turn, 'hard', random);
      expect(action, `no move in ${s.phase}`).not.toBeNull();
      const next = applyMove(s, s.turn, action!, random);
      expect(next).not.toBeNull();
      s = next!;
      const all = [...s.deck, ...s.discard, ...s.hands.flat(), ...s.melds.flatMap(m => m.cards.map(c => c.c))];
      expect(all).toHaveLength(jokers ? 54 : 52);
      expect(new Set(all).size).toBe(jokers ? 54 : 52);
    }
    expect(s.phase).toBe('gameOver');
    expect(s.winner).not.toBeNull();
    expect(s.scores[s.winner!]).toBeGreaterThanOrEqual(s.target);
  }, 30_000);
});
