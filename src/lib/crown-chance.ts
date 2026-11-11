import type { Level } from './rummy';

export const CHANCE_TARGETS = { fast: 4000, long: 12000 } as const;
export const CHANCE_LIMITS = { casual: 15, standard: 10, expert: 7, marathon: 0, attack: 10 } as const;
export type ChanceLength = keyof typeof CHANCE_TARGETS;
export type ChanceChallenge = keyof typeof CHANCE_LIMITS;
export interface ChancePlayer { id: string; name: string; bot: boolean; level?: Level }
interface Score { points: number; turns: number; busts: number; hot: number; best: number }
export interface CrownChanceState {
  players: ChancePlayer[]; scores: Score[]; length: ChanceLength; challenge: ChanceChallenge | null;
  minimum: number; dice: number[]; claimed: boolean[]; available: boolean; pending: number; qualified: boolean;
  turn: number; order: number[]; finalRound: boolean; phase: 'play' | 'finished'; winners: number[]; notice: string;
}
export type CrownChanceMove = { t: 'roll' } | { t: 'bank' } | { t: 'claim'; mask: number };
export interface ChanceHand { mask: number; name: string; points: number; size: number }

function scoreHand(values: number[]): Pick<ChanceHand, 'name' | 'points'> | null {
  const counts = Array.from({length: 6}, (_, index) => values.filter(value => value === index + 1).length);
  const groups = counts.filter(Boolean).sort((a, b) => b - a).join('');
  switch (groups) {
    case '1': return values[0] === 1 ? {name:'Single 9',points:50} : values[0] === 6 ? {name:'Single Ace',points:100} : null;
    case '2': return values[0] === 6 ? {name:'Pair of Aces',points:250} : {name:'Pair',points:200};
    case '22': return {name:'Two Pair',points:450};
    case '222': return {name:'Three Pair',points:900};
    case '3': return {name:'Three of a Kind',points:450 + values[0]! * 50};
    case '32': return {name:'Full House',points:1600};
    case '4': return {name:'Four of a Kind',points:2000};
    case '5': return {name:'Five of a Kind',points:3000};
    case '6': return {name:'Six of a Kind',points:5000};
    case '111111': return {name:'Six-Dice Straight',points:2700};
    case '11111':
      if (counts[5] === 0) return {name:'Low Straight',points:1200};
      if (counts[0] === 0) return {name:'High Straight',points:1400};
  }
  return null;
}

export function chanceHands(state: CrownChanceState): ChanceHand[] {
  if (state.phase === 'finished') return [];
  const hands: ChanceHand[] = [];
  for (let mask = 1; mask < 64; mask++) {
    const dice = state.dice.flatMap((value, i) => mask & (1 << i) ? [state.claimed[i] ? 0 : value] : []);
    if (dice.includes(0)) continue;
    const hand = scoreHand(dice);
    if (hand) hands.push({...hand, mask, size:dice.length});
  }
  return hands.sort((a, b) => b.points - a.points || a.mask - b.mask);
}

export function newCrownChance(players: ChancePlayer[], length: ChanceLength, challenge: ChanceChallenge | null = null, minimum = 0): CrownChanceState {
  return { players, length, challenge, minimum, scores:players.map(() => ({points:0,turns:0,busts:0,hot:0,best:0})),
    dice:Array(6).fill(0), claimed:Array(6).fill(false), available:true, pending:0, qualified:false, turn:0,
    order:players.map((_, i) => i), finalRound:false, phase:'play', winners:[], notice:'Roll six poker dice.' };
}

export function chanceCanBank(state: CrownChanceState) {
  return state.phase === 'play' && state.available && state.pending > 0 &&
    (state.scores[state.turn]!.points > 0 || state.qualified && state.pending >= state.minimum);
}

function endTurn(state: CrownChanceState, bust: boolean) {
  const score = state.scores[state.turn]!;
  score.turns++;
  if (bust) {
    score.busts++;
    state.notice = `Bust. ${state.pending.toLocaleString()} unbanked points lost.`;
  } else {
    score.points += state.pending;
    score.best = Math.max(score.best, state.pending);
    state.notice = `Banked ${state.pending.toLocaleString()} points.`;
  }
  state.dice = Array(6).fill(0); state.claimed = Array(6).fill(false);
  state.pending = 0; state.qualified = false; state.available = true;
  const target = CHANCE_TARGETS[state.length];
  if (state.challenge) {
    const limit = CHANCE_LIMITS[state.challenge];
    const reached = state.challenge !== 'attack' && score.points >= target;
    if (reached || limit && score.turns >= limit) {
      state.phase = 'finished';
      state.winners = reached ? [0] : [];
    }
    return;
  }
  state.finalRound ||= score.points >= target;
  const next = state.order.indexOf(state.turn) + 1;
  if (next < state.order.length) { state.turn = state.order[next]!; return; }
  if (!state.finalRound) { state.turn = state.order[0]!; return; }
  const high = Math.max(...state.order.map(seat => state.scores[seat]!.points));
  const leaders = state.order.filter(seat => state.scores[seat]!.points === high);
  if (leaders.length === 1) {
    state.phase = 'finished'; state.winners = leaders; return;
  }
  state.order = leaders;
  state.turn = leaders[0]!;
  state.notice += ' Tied leaders take another turn each.';
}

export function parseCrownChanceMove(input: unknown): CrownChanceMove | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const {t, mask} = input as Record<string, unknown>;
  if (Object.keys(input).length === 1 && (t === 'roll' || t === 'bank')) return {t};
  if (Object.keys(input).length === 2 && t === 'claim' && typeof mask === 'number' && Number.isInteger(mask) && mask > 0 && mask < 64) return {t, mask};
  return null;
}

export function applyCrownChanceMove(previous: CrownChanceState, seat: number, move: CrownChanceMove, random = Math.random): CrownChanceState | null {
  if (previous.phase !== 'play' || seat !== previous.turn) return null;
  const state = structuredClone(previous);
  if (move.t === 'bank') {
    if (!chanceCanBank(state)) return null;
    endTurn(state, false); return state;
  }
  if (move.t === 'roll') {
    if (!state.available) return null;
    if (state.claimed.every(Boolean)) state.claimed.fill(false);
    state.dice = state.dice.map((value, i) => state.claimed[i] ? value : 1 + Math.floor(random() * 6));
    state.available = false;
    state.notice = 'Claim a scoring hand before rolling again.';
    if (!chanceHands(state).length) endTurn(state, true);
    return state;
  }
  const hand = chanceHands(state).find(hand => hand.mask === move.mask);
  if (!hand) return null;
  state.claimed = state.claimed.map((claimed, i) => claimed || Boolean(hand.mask & (1 << i)));
  state.pending += hand.points;
  state.qualified ||= hand.size >= 2;
  state.available = true;
  state.notice = `${hand.name} · +${hand.points.toLocaleString()}`;
  if (state.claimed.every(Boolean)) {
    state.scores[seat]!.hot++;
    state.notice += ' · Hot Dice!';
  }
  return state;
}

export function crownChanceBotMove(state: CrownChanceState, level: Level): CrownChanceMove {
  const hands = chanceHands(state), best = hands[0], score = state.scores[state.turn]!;
  if (state.available && chanceCanBank(state)) {
    const remaining = state.claimed.filter(claimed => !claimed).length || 6;
    const safe = remaining <= 2 || state.pending >= (level === 'easy' ? 350 : level === 'normal' ? 600 : 850);
    if (score.points + state.pending >= CHANCE_TARGETS[state.length] || safe && (!best || state.claimed.every(Boolean))) return {t:'bank'};
  }
  if (best) return {t:'claim', mask:best.mask};
  return {t:'roll'};
}
