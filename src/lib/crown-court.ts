import type { Level } from './rummy';

export const CROWN_COURT_NAME = 'Crown & Court';
export const COURT_RANKS = ['9', '10', 'J', 'Q', 'K', 'A'] as const;
export const COURT_LENGTHS = { short: { label: 'Short', turns: 7, sections: ['A'] }, medium: { label: 'Medium', turns: 14, sections: ['A', 'B'] }, long: { label: 'Long', turns: 21, sections: ['A', 'B', 'C'] } } as const;
export type CourtLength = keyof typeof COURT_LENGTHS;
export type CourtSection = 'A' | 'B' | 'C';
export const COURT_SECTIONS = { A: 'Poker Hands', B: 'Court Tally', C: 'Royal Trials' } as const;
export const CROWN_COURT_CATEGORIES = [
  { id: 'one-pair', label: 'One Pair', section: 'A', description: 'Exactly one pair and three different singles: 10 + pair rank value.' },
  { id: 'two-pair', label: 'Two Pair', section: 'A', description: 'Two different pairs and one single: 18 + both pair rank values.' },
  { id: 'three-kind', label: 'Three of a Kind', section: 'A', description: 'Exactly three equal faces and two different singles: 28 + triple rank value.' },
  { id: 'straight', label: 'Straight', section: 'A', description: '9, 10, J, Q, K scores 40; 10, J, Q, K, A scores 45.' },
  { id: 'full-house', label: 'Full House', section: 'A', description: 'A triple and a different pair: 50 + twice the triple rank value.' },
  { id: 'four-kind', label: 'Four of a Kind', section: 'A', description: 'Exactly four equal faces and one other: 65 + twice the matching rank value.' },
  { id: 'five-kind', label: 'Five of a Kind', section: 'A', description: 'Five equal faces: 85 + three times the matching rank value.' },
  { id: 'nines', label: 'Nines', section: 'B', description: 'Count the 9s × 1.' },
  { id: 'tens', label: 'Tens', section: 'B', description: 'Count the 10s × 2.' },
  { id: 'jacks', label: 'Jacks', section: 'B', description: 'Count the Jacks × 3.' },
  { id: 'queens', label: 'Queens', section: 'B', description: 'Count the Queens × 4.' },
  { id: 'kings', label: 'Kings', section: 'B', description: 'Count the Kings × 5.' },
  { id: 'aces', label: 'Aces', section: 'B', description: 'Count the Aces × 6.' },
  { id: 'free-roll', label: 'Free Roll', section: 'B', description: 'Sum the rank values of all five dice.' },
  { id: 'five-different', label: 'Five Different', section: 'C', description: 'Five distinct faces: 30.' },
  { id: 'low-run', label: 'Low Run', section: 'C', description: '9, 10, J, Q, K: 45.' },
  { id: 'royal-run', label: 'Royal Run', section: 'C', description: '10, J, Q, K, A: 55.' },
  { id: 'council-four', label: 'Council of Four', section: 'C', description: 'J, Q, K, A all present; the fifth die may be any face: 40.' },
  { id: 'high-court', label: 'High Court', section: 'C', description: 'Every die is a Queen, King, or Ace: 30.' },
  { id: 'twin-crowns', label: 'Twin Crowns', section: 'C', description: 'At least two Kings and at least two Aces: 55.' },
  { id: 'court-majority', label: 'Court Majority', section: 'C', description: 'Exactly three Queens, Kings, or Aces, with two other distinct singles: 40.' },
] as const;
export type CrownCourtCategory = typeof CROWN_COURT_CATEGORIES[number]['id'];
export interface CrownCourtPlayer { id: string; name: string; bot: boolean; level?: Level }
export interface CrownCourtCard { scores: Partial<Record<CrownCourtCategory, number>> }
export interface CrownCourtTotals { A: number; B: number; C: number; ranks: number; bonus: number; total: number; filled: number }
export interface CrownCourtActivity {
  id: number; seat: number; round: number; kind: CrownCourtMove['t']; dice: number[]; held: boolean[]; rolls: number; total: number;
  category?: CrownCourtCategory; score?: number;
}
export interface CrownCourtState {
  players: CrownCourtPlayer[]; length: CourtLength; turn: number; dice: number[]; held: boolean[]; rolls: number;
  cards: CrownCourtCard[]; phase: 'play' | 'finished'; round: number; winners: number[]; log: string[];
  activity: CrownCourtActivity[]; actionSequence: number;
}
export type CrownCourtMove = { t: 'roll' } | { t: 'hold'; index: number } | { t: 'score'; category: CrownCourtCategory };
export interface CrownCourtScoreOption { category: CrownCourtCategory; score: number; legal: boolean }
export const courtRank = (value: number) => COURT_RANKS[value - 1] ?? '—';
export const courtCategories = (length: CourtLength) => CROWN_COURT_CATEGORIES.slice(0, COURT_LENGTHS[length].turns);
const RANK_ROWS = CROWN_COURT_CATEGORIES.slice(7, 13).map(category => category.id);
const validDice = (dice: readonly number[]) => dice.length === 5 && dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6);
const countsOf = (dice: readonly number[]) => Array.from({ length: 7 }, (_, face) => dice.filter(value => value === face).length);

export function crownCourtTotals(card: CrownCourtCard): CrownCourtTotals {
  const sums = { A: 0, B: 0, C: 0 }, ranks = RANK_ROWS.reduce((sum, id) => sum + (card.scores[id] ?? 0), 0), bonus = ranks >= 63 ? 30 : 0;
  for (const category of CROWN_COURT_CATEGORIES) sums[category.section] += card.scores[category.id] ?? 0;
  return { ...sums, B: sums.B + bonus, ranks, bonus, total: sums.A + sums.B + bonus + sums.C, filled: CROWN_COURT_CATEGORIES.filter(category => card.scores[category.id] !== undefined).length };
}
/** Rank values (1–6) are kept separate from the printed poker faces (9–A). */
export function scoreCrownCourt(dice: readonly number[], category: CrownCourtCategory): number {
  if (!validDice(dice)) return 0;
  const counts = countsOf(dice), distinct = counts.filter(Boolean).length, triple = counts.indexOf(3), pair = counts.indexOf(2), four = counts.indexOf(4), five = counts.indexOf(5);
  const rank = RANK_ROWS.indexOf(category);
  if (rank >= 0) return counts[rank + 1]! * (rank + 1);
  const low = distinct === 5 && counts[6] === 0, royal = distinct === 5 && counts[1] === 0;
  switch (category) {
    case 'one-pair': return pair > 0 && distinct === 4 ? 10 + pair : 0;
    case 'two-pair': return counts.filter(count => count === 2).length === 2 ? 18 + counts.reduce((sum, count, face) => sum + (count === 2 ? face : 0), 0) : 0;
    case 'three-kind': return triple > 0 && distinct === 3 ? 28 + triple : 0;
    case 'straight': return royal ? 45 : low ? 40 : 0;
    case 'full-house': return triple > 0 && pair > 0 ? 50 + 2 * triple : 0;
    case 'four-kind': return four > 0 ? 65 + 2 * four : 0;
    case 'five-kind': return five > 0 ? 85 + 3 * five : 0;
    case 'free-roll': return dice.reduce((sum, value) => sum + value, 0);
    case 'five-different': return distinct === 5 ? 30 : 0;
    case 'low-run': return low ? 45 : 0;
    case 'royal-run': return royal ? 55 : 0;
    case 'council-four': return [3, 4, 5, 6].every(face => counts[face]! > 0) ? 40 : 0;
    case 'high-court': return dice.every(value => value >= 4) ? 30 : 0;
    case 'twin-crowns': return counts[5]! >= 2 && counts[6]! >= 2 ? 55 : 0;
    case 'court-majority': return triple >= 4 && distinct === 3 ? 40 : 0;
    default: return 0;
  }
}
function optionsFor(card: CrownCourtCard, dice: readonly number[], length: CourtLength): CrownCourtScoreOption[] {
  return courtCategories(length).map(category => ({ category: category.id, score: scoreCrownCourt(dice, category.id), legal: card.scores[category.id] === undefined }));
}
export function crownCourtScoreOptions(state: CrownCourtState, seat = state.turn): CrownCourtScoreOption[] {
  const card = state.cards[seat];
  return courtCategories(state.length).map(category => ({ category: category.id, score: scoreCrownCourt(state.dice, category.id), legal: Boolean(card && card.scores[category.id] === undefined && state.phase === 'play' && seat === state.turn && state.rolls > 0 && validDice(state.dice)) }));
}
export function parseCrownCourtMove(input: unknown): CrownCourtMove | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>, keys = Object.keys(value);
  if (value.t === 'roll' && keys.length === 1) return { t: 'roll' };
  if (value.t === 'hold' && keys.length === 2 && Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < 5) return { t: 'hold', index: Number(value.index) };
  if (value.t === 'score' && keys.length === 2 && CROWN_COURT_CATEGORIES.some(category => category.id === value.category)) return { t: 'score', category: value.category as CrownCourtCategory };
  return null;
}
export function newCrownCourt(players: CrownCourtPlayer[], length: CourtLength = 'short'): CrownCourtState {
  if (!Object.hasOwn(COURT_LENGTHS, length) || players.length < 2 || players.length > 4 || new Set(players.map(player => player.id)).size !== players.length || players.some(player => !player.id || !player.name || player.bot && !['easy', 'normal', 'hard'].includes(player.level ?? 'normal'))) throw new Error('Choose a match length and two to four distinct players.');
  return { players: players.map(player => ({ ...player })), length, turn: 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0, cards: players.map(() => ({ scores: {} })), phase: 'play', round: 1, winners: [], log: [`${COURT_LENGTHS[length].label} Crown & Court: ${COURT_LENGTHS[length].turns} turns per player.`], activity: [], actionSequence: 0 };
}
function recordActivity(before: CrownCourtState, after: CrownCourtState, kind: CrownCourtMove['t'], details: Partial<CrownCourtActivity> = {}): CrownCourtState {
  const id = before.actionSequence + 1;
  const event: CrownCourtActivity = { id, seat: before.turn, round: before.round, kind, dice: [...after.dice], held: [...after.held], rolls: after.rolls, total: crownCourtTotals(after.cards[before.turn]!).total, ...details };
  return { ...after, actionSequence: id, activity: [...before.activity, event].slice(-64) };
}
export function applyCrownCourtMove(state: CrownCourtState, seat: number, input: CrownCourtMove, random: () => number = Math.random): CrownCourtState | null {
  const move = parseCrownCourtMove(input);
  if (!move || state.phase !== 'play' || state.turn !== seat || !state.players[seat]) return null;
  if (move.t === 'hold') {
    if (state.rolls < 1 || state.rolls >= 3) return null;
    const held = [...state.held]; held[move.index] = !held[move.index]; return recordActivity(state, { ...state, held }, 'hold');
  }
  const name = state.players[seat]!.name;
  if (move.t === 'roll') {
    if (state.rolls >= 3 || state.held.every(Boolean)) return null;
    const dice = state.dice.map((value, index) => { if (state.held[index]) return value; const next = random(); if (!Number.isFinite(next) || next < 0 || next >= 1) throw new Error('Invalid dice randomness.'); return Math.floor(next * 6) + 1; });
    return recordActivity(state, { ...state, dice, rolls: state.rolls + 1, log: [...state.log, `${name} rolled ${dice.map(courtRank).join(' · ')} (${state.rolls + 1}/3).`].slice(-64) }, 'roll');
  }
  const option = crownCourtScoreOptions(state, seat).find(option => option.category === move.category);
  if (!option?.legal) return null;
  const cards = state.cards.map((card, index) => index === seat ? { scores: { ...card.scores, [move.category]: option.score } } : card);
  const turns = COURT_LENGTHS[state.length].turns, finished = cards.every(card => crownCourtTotals(card).filled === turns), turn = finished ? seat : (seat + 1) % state.players.length;
  const scores = cards.map(card => crownCourtTotals(card).total), best = Math.max(...scores), category = CROWN_COURT_CATEGORIES.find(category => category.id === move.category)!;
  return recordActivity(state, { ...state, cards, turn, phase: finished ? 'finished' : 'play', round: !finished && turn === 0 ? Math.min(turns, state.round + 1) : state.round, winners: finished ? scores.flatMap((score, index) => score === best ? [index] : []) : [], dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0,
    log: [...state.log, `${name} scored ${option.score} in ${category.label}.`, ...(finished ? ['Every scorecard is complete.'] : [])].slice(-64) }, 'score', { dice: [...state.dice], held: [...state.held], rolls: state.rolls, category: move.category, score: option.score });
}

// Opportunity costs reserve rare categories, while the tally bonus rewards collecting ranks.
const BASELINE = [13, 22, 25, 24, 30, 30, 18, 2.5, 5, 7.5, 10, 12.5, 15, 21, 20, 25, 28, 27, 22, 30, 26];
function utility(card: CrownCourtCard, option: CrownCourtScoreOption): number {
  const index = CROWN_COURT_CATEGORIES.findIndex(category => category.id === option.category), ranks = crownCourtTotals(card).ranks;
  return option.score - BASELINE[index]! + (index >= 7 && index < 13 && ranks < 63 ? Math.min(option.score, 63 - ranks) * .35 : 0);
}
function bestOption(state: CrownCourtState, dice: readonly number[], greedy = false) {
  const card = state.cards[state.turn]!;
  return optionsFor(card, dice, state.length).filter(option => option.legal).sort((a, b) => (greedy ? b.score - a.score : utility(card, b) - utility(card, a)))[0]!;
}
interface Outcome { dice: number[]; weight: number }
const outcomeCache = new Map<number, Outcome[]>();
function outcomes(count: number): Outcome[] {
  const cached = outcomeCache.get(count); if (cached) return cached;
  const result: Outcome[] = [], factorial = [1, 1, 2, 6, 24, 120];
  function visit(dice: number[], face: number) {
    if (dice.length === count) { result.push({ dice, weight: factorial[count]! / countsOf(dice).reduce((product, n) => product * factorial[n]!, 1) / 6 ** count }); return; }
    for (let next = face; next <= 6; next++) visit([...dice, next], next);
  }
  visit([], 1); outcomeCache.set(count, result); return result;
}
const scoreCache = new Map<string, number[]>();
function scoreVector(dice: readonly number[]) {
  const key = [...dice].sort().join(''); let vector = scoreCache.get(key);
  if (!vector) { vector = CROWN_COURT_CATEGORIES.map(category => scoreCrownCourt(dice, category.id)); scoreCache.set(key, vector); }
  return vector;
}
const hardPlans = new WeakMap<CrownCourtCard, Map<string, boolean[]>>();
/** Honest one-reroll expectation; never observes or changes the random generator. */
function expectedHolds(state: CrownCourtState): boolean[] {
  const card = state.cards[state.turn]!, key = state.dice.join(''); let plans = hardPlans.get(card);
  if (!plans) { plans = new Map(); hardPlans.set(card, plans); }
  const cached = plans.get(key); if (cached) return cached;
  const available = courtCategories(state.length).flatMap((category, index) => card.scores[category.id] === undefined ? [index] : []), ranks = crownCourtTotals(card).ranks;
  const evaluate = (dice: readonly number[]) => { const scores = scoreVector(dice); let best = -Infinity; for (const index of available) { const score = scores[index]!; best = Math.max(best, score - BASELINE[index]! + (index >= 7 && index < 13 && ranks < 63 ? Math.min(score, 63 - ranks) * .35 : 0)); } return best; };
  const unique = new Set<string>(); let best = -Infinity, chosen = Array<boolean>(5).fill(false), keptBest = -1;
  for (let mask = 0; mask < 32; mask++) {
    const held = state.dice.filter((_, index) => mask & (1 << index)), heldKey = [...held].sort().join(''); if (unique.has(heldKey)) continue; unique.add(heldKey);
    let expected = 0; for (const outcome of outcomes(5 - held.length)) expected += outcome.weight * evaluate([...held, ...outcome.dice]);
    if (expected > best + 1e-8 || Math.abs(expected - best) < 1e-8 && held.length > keptBest) { best = expected; keptBest = held.length; chosen = state.dice.map((_, index) => Boolean(mask & (1 << index))); }
  }
  if (plans.size >= 32) plans.clear(); plans.set(key, chosen); return chosen;
}
function simpleHolds(state: CrownCourtState, easy: boolean): boolean[] {
  const counts = countsOf(state.dice), card = state.cards[state.turn]!, most = [1, 2, 3, 4, 5, 6].sort((a, b) => counts[b]! - counts[a]! || b - a)[0]!;
  if (!easy && counts[most]! < 3 && ['straight', 'low-run', 'royal-run', 'five-different', 'council-four'].some(id => courtCategories(state.length).some(c => c.id === id) && card.scores[id as CrownCourtCategory] === undefined)) {
    if (new Set(state.dice).size >= 4) { const seen = new Set<number>(); return state.dice.map(value => { const hold = !seen.has(value); seen.add(value); return hold; }); }
  }
  if (!easy && card.scores['full-house'] === undefined && counts.filter(count => count === 2).length === 2) return state.dice.map(value => counts[value] === 2);
  return state.dice.map(value => value === most);
}
export function crownCourtBotMove(state: CrownCourtState, seat = state.turn, level: Level = 'normal'): CrownCourtMove | null {
  if (state.phase !== 'play' || state.turn !== seat || !state.players[seat]?.bot) return null;
  if (!state.rolls) return { t: 'roll' };
  const best = bestOption(state, state.dice, level === 'easy');
  if (state.rolls === 3 || best.score >= 65 || level === 'normal' && best.score >= 40) return { t: 'score', category: best.category };
  const desired = level === 'hard' ? expectedHolds(state) : simpleHolds(state, level === 'easy');
  if (desired.every(Boolean)) return { t: 'score', category: best.category };
  const change = desired.findIndex((held, index) => held !== state.held[index]);
  return change >= 0 ? { t: 'hold', index: change } : { t: 'roll' };
}
