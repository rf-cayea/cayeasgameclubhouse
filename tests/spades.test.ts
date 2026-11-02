import { describe, expect, it } from 'vitest';
import { applySpadesMove, legalSpadesCards, newSpades, parseSpadesMove, scoreSpadesHand, spadesBotMove, trickWinner, type SpadesMode, type SpadesState } from '../src/lib/spades';
import { rng } from '../src/lib/game';
const players = Array.from({ length: 4 }, (_, seat) => ({ id: `seat-${seat}`, name: `Player ${seat + 1}`, bot: true, level: 'normal' as const }));
const fresh = (mode: SpadesMode = 'teams') => newSpades(mode, players, 100, rng(71));
function cardsInPlay(state: SpadesState) { return [...state.hands.flat(), ...state.completed.flatMap(trick => trick.cards.map(item => item.card)), ...(['play'].includes(state.phase) ? state.trick.map(item => item.card) : [])]; }

describe('52-card Spades rules', () => {
  it('deals exactly 13 unique standard cards to each seat with no jokers', () => {
    const state = fresh(); expect(state.hands.map(hand => hand.length)).toEqual([13, 13, 13, 13]);
    expect(new Set(state.hands.flat()).size).toBe(52); expect(state.hands.flat().every(card => /^[2-9TJQKA][CDHS]$/.test(card))).toBe(true);
    expect(() => newSpades('solo', players.slice(1), 100, rng(1))).toThrow();
  });
  it('bids clockwise, supports nil, and begins play to the dealer left', () => {
    let state = fresh(); expect(applySpadesMove(state, 1, { t: 'bid', bid: 2 }, rng(1))).toBeNull();
    for (const [seat, bid] of [3, 2, 0, 4].entries()) state = applySpadesMove(state, seat, { t: 'bid', bid }, rng(1))!;
    expect(state.phase).toBe('play'); expect(state.turn).toBe(0); expect(state.bids).toEqual([3, 2, 0, 4]);
    expect(applySpadesMove(state, 0, { t: 'bid', bid: 3 }, rng(1))).toBeNull();
    expect(parseSpadesMove({ t: 'bid', bid: 14 })).toBeNull(); expect(parseSpadesMove({ t: 'play', card: 'AS', actor: 0 })).toBeNull();
  });
  it('requires follow-suit, allows trumping when void, and blocks unbroken spade leads unless holding only spades', () => {
    const state = { ...fresh(), phase: 'play' as const, turn: 0, hands: [['AS', '2H'], [], [], []] };
    expect(legalSpadesCards(state, 0)).toEqual(['2H']);
    expect(legalSpadesCards({ ...state, trick: [{ seat: 3, card: 'AH' }] }, 0)).toEqual(['2H']);
    expect(legalSpadesCards({ ...state, trick: [{ seat: 3, card: 'AC' }] }, 0)).toEqual(['AS', '2H']);
    expect(legalSpadesCards({ ...state, hands: [['AS'], [], [], []] }, 0)).toEqual(['AS']);
    expect(legalSpadesCards({ ...state, broken: true }, 0)).toEqual(['AS', '2H']);
    expect(legalSpadesCards(state, 1)).toEqual([]);
  });
  it('takes the highest led suit or highest trump, with aces high', () => {
    expect(trickWinner(['AH', 'KD', 'QH', '2S'].map((card, seat) => ({ card, seat })))).toBe(3);
    expect(trickWinner(['KH', 'AH', 'AD', 'QH'].map((card, seat) => ({ card, seat })))).toBe(1);
    expect(trickWinner(['2S', 'KS', 'AS', 'QS'].map((card, seat) => ({ card, seat })))).toBe(2);
  });
  it('limits partnership contracts to 13 and keeps a tied target match going', () => {
    let state = fresh();
    state = applySpadesMove(state, 0, { t: 'bid', bid: 13 }, rng(1))!;
    state = applySpadesMove(state, 1, { t: 'bid', bid: 3 }, rng(1))!;
    expect(applySpadesMove(state, 2, { t: 'bid', bid: 1 }, rng(1))).toBeNull();
    expect(applySpadesMove(state, 2, { t: 'bid', bid: 0 }, rng(1))?.bids[2]).toBe(0);
    state = { ...fresh(), target: 500, phase: 'play', turn: 0, hands: [['AS'], [], [], []], bids: [3, 3, 3, 3], taken: [2, 3, 3, 4], scores: [440, 439],
      trick: [{ seat: 1, card: '2H' }, { seat: 2, card: '3H' }, { seat: 3, card: '4H' }], completed: Array.from({ length: 12 }, () => ({ cards: [], winner: 0 })) };
    state = applySpadesMove(state, 0, { t: 'play', card: 'AS' }, rng(1))!;
    expect(state.scores).toEqual([500, 500]); expect(state.phase).toBe('handOver'); expect(state.winner).toBeNull();
    const next = applySpadesMove(state, 0, { t: 'next' }, rng(2))!;
    expect(next.scores).toEqual([500, 500]); expect(next.dealer).toBe(0); expect(next.turn).toBe(1); expect(next.hands.flat()).toHaveLength(52);
  });
  it('retains a completed trick until collected, then lets its winner lead', () => {
    let state = { ...fresh(), phase: 'play' as const, turn: 0, hands: [['2H', 'AS'], ['AH', '3C'], ['KH', '4C'], ['QH', '5C']] } as SpadesState;
    for (const [seat, card] of ['2H', 'AH', 'KH', 'QH'].entries()) state = applySpadesMove(state, seat, { t: 'play', card }, rng(1))!;
    expect(state.phase).toBe('trickOver'); expect(state.turn).toBe(1); expect(state.taken).toEqual([0, 1, 0, 0]);
    expect(applySpadesMove(state, 1, { t: 'play', card: '3C' }, rng(1))).toBeNull();
    state = applySpadesMove(state, 0, { t: 'collect' }, rng(1))!;
    expect(state.trick).toEqual([]); expect(state.turn).toBe(1); expect(state.phase).toBe('play');
  });
});

describe('Spades contract, nil, and bag scoring', () => {
  it('combines opposite partners and applies overtrick bags and ten-bag penalties', () => {
    const state = { ...fresh(), bids: [3, 2, 2, 4], taken: [4, 2, 3, 4], bags: [9, 0] };
    const score = scoreSpadesHand(state);
    expect(score[0]).toMatchObject({ bid: 5, tricks: 7, contract: 50, overtricks: 2, penalty: 100, delta: -48, bags: 1 });
    expect(score[1]).toMatchObject({ bid: 6, delta: 60, bags: 0 });
  });
  it('scores a set contract and failed nil separately; nil tricks do not make a partner contract', () => {
    const state = { ...fresh(), bids: [0, 3, 4, 3], taken: [1, 4, 3, 5] };
    expect(scoreSpadesHand(state)[0]).toMatchObject({ contract: -40, nil: -100, overtricks: 1, delta: -139 });
    expect(scoreSpadesHand({ ...state, taken: [0, 4, 4, 5] })[0]).toMatchObject({ contract: 40, nil: 100, delta: 140 });
  });
  it('scores solo nil and ordinary contracts independently for all four players', () => {
    const state = { ...fresh('solo'), bids: [0, 3, 4, 3], taken: [0, 4, 3, 6] };
    expect(scoreSpadesHand(state).map(row => row.delta)).toEqual([100, 31, -40, 33]);
  });
});

describe('complete computer Spades matches', () => {
  it.each(['solo', 'teams'] as const)('plays %s through complete hands to a real target without losing or duplicating a card', mode => {
    const random = rng(mode === 'solo' ? 92 : 93); let state = newSpades(mode, players, 100, random), moves = 0;
    while (state.phase !== 'gameOver' && moves++ < 20000) {
      const cards = cardsInPlay(state); expect(cards).toHaveLength(52); expect(new Set(cards).size).toBe(52);
      const move = state.phase === 'trickOver' ? { t: 'collect' as const } : state.phase === 'handOver' ? { t: 'next' as const } : spadesBotMove(state, state.turn, ['easy', 'normal', 'hard'][state.turn % 3] as 'hard', random)!;
      const next = applySpadesMove(state, state.turn, move, random); expect(next).not.toBeNull(); state = next!;
    }
    expect(state.phase).toBe('gameOver'); expect(state.completed).toHaveLength(13); expect(state.taken.reduce((a, b) => a + b, 0)).toBe(13);
    expect(state.scores[state.winner!]).toBeGreaterThanOrEqual(100); expect(state.hands.flat()).toHaveLength(0);
  });
  it.each(['easy', 'normal', 'hard'] as const)('%s bots do not inspect opponent hands', level => {
    let state = fresh();
    for (let count = 0; count < 4; count++) state = applySpadesMove(state, state.turn, { t: 'bid', bid: 3 }, rng(1))!;
    const changed = { ...state, hands: [state.hands[0]!, [...state.hands[3]!], [...state.hands[1]!], [...state.hands[2]!]] };
    expect(spadesBotMove(state, 0, level, rng(18))).toEqual(spadesBotMove(changed, 0, level, rng(18)));
    expect(spadesBotMove({ ...state, phase: 'bid' }, 0, level, rng(19))).toEqual(spadesBotMove({ ...changed, phase: 'bid' }, 0, level, rng(19)));
  });
});
