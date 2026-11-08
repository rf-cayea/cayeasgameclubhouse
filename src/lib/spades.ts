import { CARD_WIN_POINTS } from './reward-rates';
import type { Card, Level } from './rummy';

export type SpadesMode = 'solo' | 'teams';
export type SpadesPhase = 'bid' | 'play' | 'trickOver' | 'handOver' | 'gameOver';
export interface SpadesPlayer { id: string; name: string; bot: boolean; level?: Level }
export interface TrickCard { seat: number; card: Card }
export interface SpadesTrick { cards: TrickCard[]; winner: number }
export interface HandScore { label: string; bid: number; tricks: number; contract: number; nil: number; overtricks: number; penalty: number; delta: number; score: number; bags: number }
export interface SpadesState {
  mode: SpadesMode; target: number; players: SpadesPlayer[]; hands: Card[][];
  dealer: number; turn: number; round: number; phase: SpadesPhase; bids: (number | null)[]; taken: number[];
  trick: TrickCard[]; completed: SpadesTrick[]; broken: boolean; scores: number[]; bags: number[];
  result: HandScore[] | null; winner: number | null; log: string[];
}
export type SpadesMove = { t: 'bid'; bid: number } | { t: 'play'; card: Card } | { t: 'collect' } | { t: 'next' };
export const SPADES_RANKS = '23456789TJQKA';
export const SPADES_SUITS = 'CDHS';
export const SPADES_TARGETS = [100, 250, 500, 1000] as const;
export const SPADES_POINTS = CARD_WIN_POINTS;
export const spadesRank = (card: Card) => SPADES_RANKS.indexOf(card[0]!) + 2;
export const spadesSuit = (card: Card) => card[1]!;
export const unitFor = (mode: SpadesMode, seat: number) => mode === 'teams' ? seat % 2 : seat;
export const unitLabel = (mode: SpadesMode, unit: number, players: SpadesPlayer[]) => mode === 'teams' ? `Team ${unit + 1}` : players[unit]!.name;
export function sortSpadesHand(hand: Card[], by: 'suit' | 'rank' = 'suit') {
  return [...hand].sort((a, b) => by === 'rank' ? spadesRank(b) - spadesRank(a) || SPADES_SUITS.indexOf(a[1]!) - SPADES_SUITS.indexOf(b[1]!)
    : SPADES_SUITS.indexOf(a[1]!) - SPADES_SUITS.indexOf(b[1]!) || spadesRank(b) - spadesRank(a));
}
function deal(rand: () => number) {
  const deck = [...SPADES_SUITS].flatMap(suit => [...SPADES_RANKS].map(rank => rank + suit));
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
  return Array.from({ length: 4 }, (_, seat) => sortSpadesHand(deck.slice(seat * 13, seat * 13 + 13)));
}
export function newSpades(mode: SpadesMode, players: SpadesPlayer[], target: number, rand: () => number): SpadesState {
  if (players.length !== 4 || new Set(players.map(player => player.id)).size !== 4 || !SPADES_TARGETS.includes(target as 500)) throw new Error('Spades requires four distinct seats and a supported target.');
  return { mode, target, players, hands: deal(rand), dealer: 3, turn: 0, round: 1, phase: 'bid', bids: [null, null, null, null],
    taken: [0, 0, 0, 0], trick: [], completed: [], broken: false, scores: Array(mode === 'teams' ? 2 : 4).fill(0),
    bags: Array(mode === 'teams' ? 2 : 4).fill(0), result: null, winner: null, log: ['Thirteen cards each. Bid clockwise from the dealer’s left.'] };
}
export function trickWinner(cards: TrickCard[]): number {
  if (!cards.length) throw new Error('An empty trick has no winner.');
  const lead = cards[0]!.card[1];
  const trump = cards.some(item => item.card[1] === 'S');
  const eligible = cards.filter(item => item.card[1] === (trump ? 'S' : lead));
  return eligible.reduce((best, item) => spadesRank(item.card) > spadesRank(best.card) ? item : best).seat;
}
export function legalSpadesCards(state: Pick<SpadesState, 'phase' | 'turn' | 'hands' | 'trick' | 'broken'>, seat: number): Card[] {
  if (state.phase !== 'play' || state.turn !== seat) return [];
  const hand = state.hands[seat] ?? [];
  const lead = state.trick[0]?.card[1];
  if (lead) { const follows = hand.filter(card => card[1] === lead); return follows.length ? follows : [...hand]; }
  const nonTrump = hand.filter(card => card[1] !== 'S');
  return !state.broken && nonTrump.length ? nonTrump : [...hand];
}
export function scoreSpadesHand(state: Pick<SpadesState, 'mode' | 'players' | 'bids' | 'taken' | 'scores' | 'bags'>): HandScore[] {
  return state.scores.map((score, unit) => {
    const seats = state.players.map((_, seat) => seat).filter(seat => unitFor(state.mode, seat) === unit);
    const bid = seats.reduce((sum, seat) => sum + (state.bids[seat] ?? 0), 0);
    const nonNilTricks = seats.filter(seat => state.bids[seat] !== 0).reduce((sum, seat) => sum + state.taken[seat]!, 0);
    const nilTricks = seats.filter(seat => state.bids[seat] === 0).reduce((sum, seat) => sum + state.taken[seat]!, 0);
    const nil = seats.filter(seat => state.bids[seat] === 0).reduce((sum, seat) => sum + (state.taken[seat] === 0 ? 100 : -100), 0);
    const contract = nonNilTricks >= bid ? bid * 10 : -bid * 10;
    const overtricks = (nonNilTricks >= bid ? nonNilTricks - bid : 0) + nilTricks;
    const allBags = state.bags[unit]! + overtricks;
    const penalty = Math.floor(allBags / 10) * 100;
    const delta = contract + nil + overtricks - penalty;
    return { label: unitLabel(state.mode, unit, state.players), bid, tricks: seats.reduce((sum, seat) => sum + state.taken[seat]!, 0),
      contract, nil, overtricks, penalty, delta, score: score + delta, bags: allBags % 10 };
  });
}
function handOver(state: SpadesState): SpadesState {
  const result = scoreSpadesHand(state);
  const scores = result.map(row => row.score), bags = result.map(row => row.bags);
  const max = Math.max(...scores);
  const leaders = scores.map((score, index) => score === max ? index : -1).filter(index => index >= 0);
  const winner = max >= state.target && leaders.length === 1 ? leaders[0]! : null;
  return { ...state, scores, bags, result, winner, phase: winner === null ? 'handOver' : 'gameOver' };
}
export function parseSpadesMove(input: unknown): SpadesMove | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const move = input as Record<string, unknown>;
  if (move.t === 'bid' && Object.keys(move).length === 2 && Number.isInteger(move.bid) && Number(move.bid) >= 0 && Number(move.bid) <= 13) return { t: 'bid', bid: Number(move.bid) };
  if (move.t === 'play' && Object.keys(move).length === 2 && typeof move.card === 'string' && /^[2-9TJQKA][CDHS]$/.test(move.card)) return { t: 'play', card: move.card };
  if ((move.t === 'collect' || move.t === 'next') && Object.keys(move).length === 1) return { t: move.t };
  return null;
}
export function applySpadesMove(state: SpadesState, seat: number, move: SpadesMove, rand: () => number): SpadesState | null {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3 || !parseSpadesMove(move)) return null;
  if (move.t === 'collect') return state.phase === 'trickOver' ? { ...state, phase: 'play', trick: [] } : null;
  if (move.t === 'next') {
    if (state.phase !== 'handOver') return null;
    const dealer = (state.dealer + 1) % 4;
    return { ...state, hands: deal(rand), dealer, turn: (dealer + 1) % 4, round: state.round + 1, phase: 'bid', bids: [null, null, null, null], taken: [0, 0, 0, 0], trick: [], completed: [], broken: false, result: null, log: [...state.log.slice(-15), `Hand ${state.round + 1}: a new deal.`] };
  }
  if (seat !== state.turn) return null;
  if (move.t === 'bid') {
    if (state.phase !== 'bid' || state.bids[seat] !== null) return null;
    if (state.mode === 'teams' && move.bid + (state.bids[(seat + 2) % 4] ?? 0) > 13) return null;
    const bids = [...state.bids]; bids[seat] = move.bid;
    const complete = bids.every(bid => bid !== null);
    return { ...state, bids, phase: complete ? 'play' : 'bid', turn: complete ? (state.dealer + 1) % 4 : (seat + 1) % 4,
      log: [...state.log.slice(-15), `${state.players[seat]!.name} bids ${move.bid === 0 ? 'nil' : move.bid}.`] };
  }
  if (!legalSpadesCards(state, seat).includes(move.card)) return null;
  const hands = state.hands.map((hand, index) => index === seat ? hand.filter(card => card !== move.card) : hand);
  const trick = [...state.trick, { seat, card: move.card }];
  let next: SpadesState = { ...state, hands, trick, broken: state.broken || move.card[1] === 'S', turn: (seat + 1) % 4 };
  if (trick.length === 4) {
    const winner = trickWinner(trick), taken = [...state.taken]; taken[winner] = taken[winner]! + 1;
    next = { ...next, taken, turn: winner, completed: [...state.completed, { cards: trick, winner }], phase: 'trickOver',
      log: [...state.log.slice(-15), `${state.players[winner]!.name} takes trick ${state.completed.length + 1}.`] };
    if (next.completed.length === 13) next = handOver(next);
  }
  return next;
}
/** Estimate from this player's hand only. Higher levels account for length and voids. */
export function suggestedSpadesBid(hand: Card[], level: Level = 'normal'): number {
  const suits = [...SPADES_SUITS].map(suit => hand.filter(card => card[1] === suit).map(spadesRank).sort((a, b) => b - a));
  let estimate = 0;
  suits.forEach((ranks, suit) => ranks.forEach(rank => {
    if (suit === 3) estimate += rank >= 12 ? .95 : rank >= 9 ? .65 : ranks.length >= 5 ? .5 : .16;
    else estimate += rank === 14 ? .95 : rank === 13 && ranks.length >= 2 ? .65 : rank === 12 && ranks.length >= 3 ? .3 : 0;
  }));
  if (level === 'hard') estimate += suits.slice(0, 3).filter(ranks => ranks.length <= 1).length * Math.max(0, suits[3]!.length - 2) * .2;
  return Math.max(0, Math.min(10, Math.round(estimate)));
}
/** Uses only own cards, bids, current trick, and publicly played cards. */
export function spadesBotMove(state: SpadesState, seat: number, level: Level = 'normal', rand = Math.random): SpadesMove | null {
  if (state.turn !== seat) return null;
  const hand = state.hands[seat]!;
  if (state.phase === 'bid') {
    let bid = suggestedSpadesBid(hand, level);
    if (level === 'easy') bid = Math.max(1, Math.min(8, bid + Math.floor(rand() * 3) - 1));
    if (state.mode === 'teams') bid = Math.min(bid, 13 - (state.bids[(seat + 2) % 4] ?? 0));
    return { t: 'bid', bid };
  }
  const legal = legalSpadesCards(state, seat);
  if (!legal.length) return null;
  if (level === 'easy') return { t: 'play', card: legal[Math.floor(rand() * legal.length)]! };
  const low = [...legal].sort((a, b) => (a[1] === 'S' ? 20 : 0) + spadesRank(a) - (b[1] === 'S' ? 20 : 0) - spadesRank(b));
  const winning = low.filter(card => trickWinner([...state.trick, { seat, card }]) === seat);
  const losing = low.filter(card => !winning.includes(card));
  const partner = (seat + 2) % 4;
  const leader = state.trick.length ? trickWinner(state.trick) : null;
  let card = low[0]!;
  if (state.bids[seat] === 0 && state.taken[seat] === 0) card = losing.at(-1) ?? winning[0] ?? card;
  else if (state.mode === 'teams' && leader === partner && state.bids[partner] !== 0) card = low[0]!;
  else if (state.trick.length) card = winning[0] ?? (level === 'hard' ? losing.filter(value => value[1] !== 'S').at(-1) : undefined) ?? card;
  else if (level === 'hard') {
    const seen = new Set([...hand, ...state.completed.flatMap(trick => trick.cards.map(item => item.card))]);
    const masters = legal.filter(value => value[1] !== 'S' && [...SPADES_RANKS].every(rank => spadesRank(rank + value[1]) <= spadesRank(value) || seen.has(rank + value[1])));
    card = masters[0] ?? card;
  }
  return { t: 'play', card };
}
