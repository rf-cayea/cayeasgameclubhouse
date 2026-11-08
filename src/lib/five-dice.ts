import type { Level } from './rummy';

export const FIVE_DICE_NAME = 'Farkle';
export const FIVE_DICE_CATEGORIES = [
  { id: 'ones', label: 'Ones', short: '1s', section: 'upper', description: 'Add all dice showing 1.' },
  { id: 'twos', label: 'Twos', short: '2s', section: 'upper', description: 'Add all dice showing 2.' },
  { id: 'threes', label: 'Threes', short: '3s', section: 'upper', description: 'Add all dice showing 3.' },
  { id: 'fours', label: 'Fours', short: '4s', section: 'upper', description: 'Add all dice showing 4.' },
  { id: 'fives', label: 'Fives', short: '5s', section: 'upper', description: 'Add all dice showing 5.' },
  { id: 'sixes', label: 'Sixes', short: '6s', section: 'upper', description: 'Add all dice showing 6.' },
  { id: 'three-kind', label: 'Three of a kind', short: '3 alike', section: 'lower', description: 'At least three equal dice: add all five dice.' },
  { id: 'four-kind', label: 'Four of a kind', short: '4 alike', section: 'lower', description: 'At least four equal dice: add all five dice.' },
  { id: 'full-house', label: 'Full house', short: 'Full house', section: 'lower', description: 'Three of one number and two of another: 25 points.' },
  { id: 'small-straight', label: 'Small straight', short: '4 in a row', section: 'lower', description: 'Four consecutive numbers: 30 points.' },
  { id: 'large-straight', label: 'Large straight', short: '5 in a row', section: 'lower', description: 'Five consecutive numbers: 40 points.' },
  { id: 'five-kind', label: 'Five of a kind', short: '5 alike', section: 'lower', description: 'Five equal dice: 50 points. Additional qualifying fives earn 100 bonus points.' },
  { id: 'chance', label: 'Chance', short: 'Chance', section: 'lower', description: 'Any roll: add all five dice.' },
] as const;
export type FiveDiceCategory = typeof FIVE_DICE_CATEGORIES[number]['id'];
export interface FiveDicePlayer { id: string; name: string; bot: boolean; level?: Level }
export interface FiveDiceCard { scores: Partial<Record<FiveDiceCategory, number>>; fiveKindBonuses: number }
export interface FiveDiceTotals { upper: number; upperBonus: number; lower: number; fiveKindBonus: number; total: number; filled: number }
export interface FiveDiceState {
  players: FiveDicePlayer[]; turn: number; dice: number[]; held: boolean[]; rolls: number;
  cards: FiveDiceCard[]; phase: 'play' | 'finished'; round: number; winners: number[]; log: string[];
}
export type FiveDiceMove = { t: 'roll' } | { t: 'hold'; index: number } | { t: 'score'; category: FiveDiceCategory };
export interface FiveDiceScoreOption { category: FiveDiceCategory; score: number; bonus: number; legal: boolean }
const UPPER = FIVE_DICE_CATEGORIES.slice(0, 6).map(category => category.id);
const validDice = (dice: readonly number[]) => dice.length === 5 && dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6);
const countsOf = (dice: readonly number[]) => Array.from({ length: 7 }, (_, face) => dice.filter(value => value === face).length);
const sumOf = (dice: readonly number[]) => dice.reduce((sum, value) => sum + value, 0);
const open = (card: FiveDiceCard, category: FiveDiceCategory) => card.scores[category] === undefined;
const isFive = (dice: readonly number[]) => validDice(dice) && dice.every(value => value === dice[0]);

export function fiveDiceTotals(card: FiveDiceCard): FiveDiceTotals {
  const upper = UPPER.reduce((sum, category) => sum + (card.scores[category] ?? 0), 0);
  const lower = FIVE_DICE_CATEGORIES.slice(6).reduce((sum, category) => sum + (card.scores[category.id] ?? 0), 0);
  const upperBonus = upper >= 63 ? 35 : 0, fiveKindBonus = card.fiveKindBonuses * 100;
  return { upper, upperBonus, lower, fiveKindBonus, total: upper + upperBonus + lower + fiveKindBonus, filled: Object.keys(card.scores).length };
}

/** Natural combination scoring; repeated-five joker rules are applied by options. */
export function scoreFiveDice(dice: readonly number[], category: FiveDiceCategory): number {
  if (!validDice(dice)) return 0;
  const upper = UPPER.indexOf(category);
  if (upper >= 0) return dice.filter(value => value === upper + 1).length * (upper + 1);
  const counts = countsOf(dice), sum = sumOf(dice);
  if (category === 'three-kind') return Math.max(...counts) >= 3 ? sum : 0;
  if (category === 'four-kind') return Math.max(...counts) >= 4 ? sum : 0;
  if (category === 'full-house') return counts.includes(3) && counts.includes(2) ? 25 : 0;
  if (category === 'five-kind') return counts.includes(5) ? 50 : 0;
  if (category === 'chance') return sum;
  const unique = [...new Set(dice)].sort((a, b) => a - b);
  let longest = 1, run = 1;
  for (let index = 1; index < unique.length; index++) { run = unique[index] === unique[index - 1]! + 1 ? run + 1 : 1; longest = Math.max(longest, run); }
  if (category === 'small-straight') return longest >= 4 ? 30 : 0;
  if (category === 'large-straight') return longest === 5 ? 40 : 0;
  return 0;
}

function optionsFor(card: FiveDiceCard, dice: readonly number[]): FiveDiceScoreOption[] {
  const extraFive = isFive(dice) && card.scores['five-kind'] === 50;
  const matching = UPPER[(dice[0] ?? 1) - 1]!;
  const lowerOpen = FIVE_DICE_CATEGORIES.some(category => category.section === 'lower' && open(card, category.id));
  return FIVE_DICE_CATEGORIES.map(category => {
    const legal = open(card, category.id) && (!extraFive || (open(card, matching) ? category.id === matching : lowerOpen ? category.section === 'lower' : category.section === 'upper'));
    const score = extraFive && ['full-house', 'small-straight', 'large-straight'].includes(category.id)
      ? ({ 'full-house': 25, 'small-straight': 30, 'large-straight': 40 }[category.id as 'full-house']) : scoreFiveDice(dice, category.id);
    return { category: category.id, score, bonus: extraFive ? 100 : 0, legal };
  });
}
export function fiveDiceScoreOptions(state: FiveDiceState, seat = state.turn): FiveDiceScoreOption[] {
  const card = state.cards[seat];
  if (!card) return FIVE_DICE_CATEGORIES.map(({ id }) => ({ category: id, score: 0, bonus: 0, legal: false }));
  return optionsFor(card, state.dice).map(option => ({ ...option, legal: option.legal && state.phase === 'play' && seat === state.turn && state.rolls > 0 && validDice(state.dice) }));
}

export function parseFiveDiceMove(input: unknown): FiveDiceMove | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>, keys = Object.keys(value);
  if (value.t === 'roll' && keys.length === 1) return { t: 'roll' };
  if (value.t === 'hold' && keys.length === 2 && Number.isInteger(value.index) && Number(value.index) >= 0 && Number(value.index) < 5) return { t: 'hold', index: Number(value.index) };
  if (value.t === 'score' && keys.length === 2 && FIVE_DICE_CATEGORIES.some(category => category.id === value.category)) return { t: 'score', category: value.category as FiveDiceCategory };
  return null;
}
export function newFiveDice(players: FiveDicePlayer[], _random: () => number = Math.random): FiveDiceState {
  if (players.length < 2 || players.length > 4 || new Set(players.map(player => player.id)).size !== players.length || players.some(player => !player.id || !player.name || player.bot && !['easy', 'normal', 'hard'].includes(player.level ?? 'normal'))) throw new Error('Choose two to four distinct players.');
  return { players: players.map(player => ({ ...player })), turn: 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0, cards: players.map(() => ({ scores: {}, fiveKindBonuses: 0 })), phase: 'play', round: 1, winners: [], log: ['The table is ready. Roll five dice to begin.'] };
}
export function applyFiveDiceMove(state: FiveDiceState, seat: number, input: FiveDiceMove, random: () => number = Math.random): FiveDiceState | null {
  const move = parseFiveDiceMove(input);
  if (!move || state.phase !== 'play' || state.turn !== seat || !state.players[seat]) return null;
  const name = state.players[seat]!.name;
  if (move.t === 'hold') {
    if (state.rolls < 1 || state.rolls >= 3) return null;
    const held = [...state.held]; held[move.index] = !held[move.index]; return { ...state, held };
  }
  if (move.t === 'roll') {
    if (state.rolls >= 3 || state.held.every(Boolean)) return null;
    const dice = state.dice.map((value, index) => { if (state.held[index]) return value; const next = random(); if (!Number.isFinite(next) || next < 0 || next >= 1) throw new Error('Invalid dice randomness.'); return Math.floor(next * 6) + 1; });
    return { ...state, dice, rolls: state.rolls + 1, log: [...state.log, `${name} rolled ${dice.join(' · ')} (${state.rolls + 1}/3).`].slice(-40) };
  }
  const option = fiveDiceScoreOptions(state, seat).find(option => option.category === move.category);
  if (!option?.legal) return null;
  const cards = state.cards.map((card, index) => index === seat ? { scores: { ...card.scores, [move.category]: option.score }, fiveKindBonuses: card.fiveKindBonuses + option.bonus / 100 } : card);
  const finished = cards.every(card => fiveDiceTotals(card).filled === 13), turn = finished ? seat : (seat + 1) % state.players.length;
  const scores = cards.map(card => fiveDiceTotals(card).total), best = Math.max(...scores), category = FIVE_DICE_CATEGORIES.find(category => category.id === move.category)!;
  return { ...state, cards, turn, phase: finished ? 'finished' : 'play', round: !finished && turn === 0 ? Math.min(13, state.round + 1) : state.round, winners: finished ? scores.flatMap((score, index) => score === best ? [index] : []) : [], dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], rolls: 0,
    log: [...state.log, `${name} scored ${option.score} in ${category.label}${option.bonus ? ' + 100 five-of-a-kind bonus' : ''}.`, ...(finished ? ['All thirteen categories are complete.'] : [])].slice(-40) };
}

// Category opportunity costs prevent the stronger bots from burning Chance for
// every ordinary roll or taking a zero in a valuable category too early.
const BASELINE: Record<FiveDiceCategory, number> = { ones: 2.2, twos: 4.4, threes: 6.6, fours: 8.8, fives: 11, sixes: 13.2, 'three-kind': 14, 'four-kind': 10, 'full-house': 10, 'small-straight': 16, 'large-straight': 12, 'five-kind': 5, chance: 20 };
function utility(card: FiveDiceCard, option: FiveDiceScoreOption): number {
  const upper = UPPER.indexOf(option.category), totals = fiveDiceTotals(card);
  const bonusChase = upper >= 0 && totals.upper < 63 ? Math.min(option.score, 63 - totals.upper) * .35 : 0;
  return option.score - BASELINE[option.category] + bonusChase + option.bonus;
}
function bestOption(card: FiveDiceCard, dice: readonly number[], greedy = false) {
  return optionsFor(card, dice).filter(option => option.legal).sort((a, b) => (greedy ? b.score - a.score : utility(card, b) - utility(card, a)) || FIVE_DICE_CATEGORIES.findIndex(category => category.id === a.category) - FIVE_DICE_CATEGORIES.findIndex(category => category.id === b.category))[0]!;
}
function simpleHolds(state: FiveDiceState, easy: boolean): boolean[] {
  const dice = state.dice, card = state.cards[state.turn]!, counts = countsOf(dice);
  const faces = [1, 2, 3, 4, 5, 6].sort((a, b) => counts[b]! - counts[a]! || (easy ? a - b : b - a));
  const most = faces[0]!;
  if (!easy && open(card, 'large-straight')) {
    for (const straight of [[2, 3, 4, 5, 6], [1, 2, 3, 4, 5]]) {
      const present = straight.filter(value => counts[value]);
      if (present.length >= 4 && counts[most]! < 3) { const kept = new Set<number>(); return dice.map(value => { const hold = present.includes(value) && !kept.has(value); if (hold) kept.add(value); return hold; }); }
    }
  }
  if (!easy && open(card, 'full-house') && counts.filter(value => value === 2).length === 2) return dice.map(value => counts[value] === 2);
  if (counts[most]! >= 2) return dice.map(value => value === most);
  return dice.map(value => easy ? value === most : value >= 5);
}
interface Outcome { dice: number[]; weight: number }
const outcomeCache = new Map<number, Outcome[]>();
/** At most 252 unordered results replace 7,776 ordered five-die rolls. */
function outcomes(count: number): Outcome[] {
  const cached = outcomeCache.get(count); if (cached) return cached;
  const result: Outcome[] = [], factorial = [1, 1, 2, 6, 24, 120];
  function visit(dice: number[], face: number) {
    if (dice.length === count) { const counts = countsOf(dice); result.push({ dice, weight: factorial[count]! / counts.reduce((product, n) => product * factorial[n]!, 1) / 6 ** count }); return; }
    for (let next = face; next <= 6; next++) visit([...dice, next], next);
  }
  visit([], 1); outcomeCache.set(count, result); return result;
}
const hardPlans = new WeakMap<FiveDiceCard, Map<string, boolean[]>>();
/** Allocation-light equivalent of bestOption + utility for the bounded EV loop. */
function utilityEvaluator(card: FiveDiceCard) {
  const available = FIVE_DICE_CATEGORIES.map(category => open(card, category.id));
  const upper = fiveDiceTotals(card).upper, costs = FIVE_DICE_CATEGORIES.map(category => BASELINE[category.id]);
  const lowerOpen = available.slice(6).some(Boolean), bonusEnabled = card.scores['five-kind'] === 50;
  return (dice: readonly number[]) => {
    const counts = [0, 0, 0, 0, 0, 0, 0]; let sum = 0, mask = 0;
    for (const value of dice) { counts[value]!++; sum += value; mask |= 1 << (value - 1); }
    const most = Math.max(...counts), extraFive = bonusEnabled && most === 5;
    const matching = dice[0]! - 1;
    let best = -Infinity;
    for (let index = 0; index < 13; index++) {
      if (!available[index] || extraFive && (available[matching] ? index !== matching : lowerOpen ? index < 6 : index >= 6)) continue;
      let score = 0;
      if (index < 6) score = counts[index + 1]! * (index + 1);
      else if (index === 6) score = most >= 3 ? sum : 0;
      else if (index === 7) score = most >= 4 ? sum : 0;
      else if (index === 8) score = extraFive || counts.includes(3) && counts.includes(2) ? 25 : 0;
      else if (index === 9) score = extraFive || (mask & 15) === 15 || (mask & 30) === 30 || (mask & 60) === 60 ? 30 : 0;
      else if (index === 10) score = extraFive || mask === 31 || mask === 62 ? 40 : 0;
      else if (index === 11) score = most === 5 ? 50 : 0;
      else score = sum;
      const value = score - costs[index]! + (index < 6 && upper < 63 ? Math.min(score, 63 - upper) * .35 : 0) + (extraFive ? 100 : 0);
      if (value > best) best = value;
    }
    return best;
  };
}
function expectedHolds(state: FiveDiceState): boolean[] {
  const card = state.cards[state.turn]!, key = state.dice.join('');
  let plans = hardPlans.get(card);
  if (!plans) { plans = new Map(); hardPlans.set(card, plans); }
  const cached = plans.get(key); if (cached) return cached;
  const unique = new Set<string>(), evaluate = utilityEvaluator(card);
  let best = -Infinity, chosen = Array<boolean>(5).fill(false), keptBest = -1;
  for (let mask = 0; mask < 32; mask++) {
    const held = state.dice.filter((_, index) => mask & (1 << index)), heldKey = [...held].sort().join('');
    if (unique.has(heldKey)) continue; unique.add(heldKey);
    let expected = 0;
    for (const outcome of outcomes(5 - held.length)) expected += outcome.weight * evaluate([...held, ...outcome.dice]);
    if (expected > best + 1e-8 || Math.abs(expected - best) < 1e-8 && held.length > keptBest) { best = expected; keptBest = held.length; chosen = state.dice.map((_, index) => Boolean(mask & (1 << index))); }
  }
  // A scorecard has at most two rolls needing a plan per turn. Weak keys release
  // completed cards; the small cap also bounds artificial, long-lived previews.
  if (plans.size >= 32) plans.clear(); plans.set(key, chosen);
  return chosen;
}

/** Each call emits exactly one legal move; the server remains authoritative. */
export function fiveDiceBotMove(state: FiveDiceState, seat = state.turn, level: Level = 'normal', _random: () => number = Math.random): FiveDiceMove | null {
  if (state.phase !== 'play' || state.turn !== seat || !state.players[seat]?.bot) return null;
  if (state.rolls === 0) return { t: 'roll' };
  const card = state.cards[seat]!, best = bestOption(card, state.dice, level === 'easy');
  if (state.rolls === 3 || isFive(state.dice) || level !== 'easy' && best.score >= 30) return { t: 'score', category: best.category };
  const desired = level === 'hard' ? expectedHolds(state) : simpleHolds(state, level === 'easy');
  if (desired.every(Boolean)) return { t: 'score', category: best.category };
  const change = desired.findIndex((held, index) => held !== state.held[index]);
  return change >= 0 ? { t: 'hold', index: change } : { t: 'roll' };
}
