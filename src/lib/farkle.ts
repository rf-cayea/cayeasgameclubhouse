import type { Level } from './rummy';

export const FARKLE_TARGET = 10_000;
export const FARKLE_FAST_TARGET = 5_000;
export const FARKLE_PARTY = {id:'farkle-party',name:'Farkle Party Tables',price:600,cashPrice:462,currency:'dice_points'} as const;
export const farkleMatchName = (target:number) => target===FARKLE_FAST_TARGET?'Fast Match':'Classic Match';
export const FARKLE_ENTRY = 300;
export interface FarklePlayer { id: string; name: string; bot: boolean; level?: Level }
export interface FarklePlay { dice: number[]; score: number; label: string }
export type FarkleMove = { t: 'roll' } | { t: 'keep'; dice: number[] } | { t: 'bank'; dice?: number[] };
export interface FarkleActivity {
  id: number; seat: number; kind: FarkleMove['t']; dice: number[]; kept: boolean[]; rolled: boolean[];
  round: number; points: number; turnPoints: number; scores: number[]; bust: boolean; hot: boolean; label: string;
}
export interface FarkleTurnRecord { id:number;round:number;seat:number;banked:number;lost:number;total:number;rolls:number }
export interface FarkleState {
  scoreHistory?:FarkleTurnRecord[];
  players: FarklePlayer[]; scores: number[]; turn: number; dice: number[]; kept: boolean[];
  step: 'roll' | 'choose'; turnPoints: number; rolls: number; round: number; target: number;
  finalTurns: number[] | null; phase: 'play' | 'finished'; winners: number[];
  busts: number[]; hotDice: number[]; activity: FarkleActivity[]; actionSequence: number;
}
const facesValid = (dice: readonly number[]) => dice.length > 0 && dice.length <= 6 && dice.every(value => Number.isInteger(value) && value >= 1 && value <= 6);
/** Every selected die must score in this roll. Dice kept on earlier rolls cannot join a new combination. */
export function scoreFarkleDice(dice: readonly number[]): { score: number; label: string } | null {
  if (!facesValid(dice)) return null;
  const counts = Array.from({ length: 7 }, (_, face) => dice.filter(value => value === face).length);
  const candidates: { score: number; label: string }[] = [];
  if (dice.length === 6) {
    if (counts.slice(1).every(count => count === 1)) candidates.push({ score: 1500, label: 'Straight · 1–6' });
    if (counts.filter(count => count === 2).length === 3) candidates.push({ score: 1500, label: 'Three pairs' });
    if (counts.filter(count => count === 3).length === 2) candidates.push({ score: 2500, label: 'Two triplets' });
    if (counts.includes(4) && counts.includes(2)) candidates.push({ score: 1500, label: 'Four of a kind + a pair' });
  }
  let total = 0, valid = true; const labels: string[] = [];
  for (let face = 1; face <= 6; face++) {
    const count = counts[face]!;
    if (count >= 3) { total += (face === 1 ? 1000 : face * 100) * (count - 2); labels.push(`${['', '', '', 'Three', 'Four', 'Five', 'Six'][count]} ${face}s`); }
    else if (count && (face === 1 || face === 5)) { total += count * (face === 1 ? 100 : 50); labels.push(`${count === 1 ? 'One' : 'Two'} ${face}${count > 1 ? 's' : ''}`); }
    else if (count) valid = false;
  }
  if (valid && total) candidates.push({ score: total, label: labels.join(' + ') });
  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}
/** At most 63 subsets. Smart hints inspect genuine results; they never alter a roll. */
export function farklePlays(dice: readonly number[], kept: readonly boolean[] = Array(6).fill(false)): FarklePlay[] {
  const available = dice.flatMap((value, index) => !kept[index] && value >= 1 && value <= 6 ? [index] : []);
  const result: FarklePlay[] = [];
  for (let mask = 1; mask < 1 << available.length; mask++) {
    const indices = available.filter((_, index) => mask & 1 << index), scored = scoreFarkleDice(indices.map(index => dice[index]!));
    if (scored) result.push({ dice: indices, ...scored });
  }
  return result.sort((a, b) => b.score - a.score || b.dice.length - a.dice.length || a.dice.join('').localeCompare(b.dice.join('')));
}
export function newFarkle(players: FarklePlayer[], target = FARKLE_TARGET): FarkleState {
  if (players.length < 2 || players.length > 4 || !Number.isSafeInteger(target) || target < 1000 || target > 100_000) throw new Error('Invalid Farkle table.');
  return { players: players.map(player => ({ ...player })), scores: players.map(() => 0), turn: 0, dice: Array(6).fill(0), kept: Array(6).fill(false), step: 'roll', turnPoints: 0, rolls: 0, round: 1, target, finalTurns: null, phase: 'play', winners: [], busts: players.map(() => 0), hotDice: players.map(() => 0), activity: [], actionSequence: 0, scoreHistory: [] };
}
function advance(state: FarkleState, scores = state.scores): FarkleState {
  const finished = scores[state.turn]! >= state.target, next = (state.turn + 1) % state.players.length;
  // Keep the legacy field readable in saved rooms; new matches have no final-round turns.
  return { ...state, scores, finalTurns:finished?[]:null, phase:finished?'finished':'play', winners:finished?[state.turn]:[], turn:finished?state.turn:next, round:state.round+Number(!finished&&next===0), dice:Array(6).fill(0), kept:Array(6).fill(false), step:'roll', turnPoints:0, rolls:0 };
}
function record(before: FarkleState, after: FarkleState, kind: FarkleActivity['kind'], details: Partial<FarkleActivity> = {}): FarkleState {
  const id = before.actionSequence + 1;
  const event: FarkleActivity = { id, seat: before.turn, kind, dice: [...after.dice], kept: [...after.kept], rolled: Array(6).fill(false), round: before.round, points: 0, turnPoints: after.turnPoints, scores: [...after.scores], bust: false, hot: false, label: '', ...details };
  const scoreHistory=before.scoreHistory??before.activity.filter(e=>e.kind==='bank'||e.bust).map(e=>({id:e.id,round:e.round,seat:e.seat,banked:e.kind==='bank'?e.points:0,lost:e.bust?e.turnPoints:0,total:e.scores[e.seat]??0,rolls:0}));
  const completed=kind==='bank'||event.bust;
  return { ...after, scoreHistory:completed?[...scoreHistory,{id,round:before.round,seat:before.turn,banked:kind==='bank'?event.points:0,lost:event.bust?event.turnPoints:0,total:event.scores[before.turn]??0,rolls:before.rolls+Number(kind==='roll')}]:scoreHistory, actionSequence: id, activity: [...before.activity, event].slice(-80) };
}
function selectedPlay(state: FarkleState, indices: readonly number[]) {
  if (state.step !== 'choose' || !indices.length || indices.length > 6 || new Set(indices).size !== indices.length || indices.some(index => !Number.isInteger(index) || index < 0 || index > 5 || state.kept[index])) return null;
  return scoreFarkleDice(indices.map(index => state.dice[index]!));
}
export function canBankFarkle(state: FarkleState, selection = 0) { return state.turnPoints + selection >= (state.scores[state.turn] === 0 ? FARKLE_ENTRY : 1); }
export function applyFarkleMove(state: FarkleState, seat: number, move: FarkleMove, random = Math.random): FarkleState | null {
  if (state.phase !== 'play' || seat !== state.turn || !parseFarkleMove(move)) return null;
  if (move.t === 'roll') {
    if (state.step !== 'roll') return null;
    const hot = state.kept.every(Boolean), kept = hot ? Array(6).fill(false) : [...state.kept];
    const dice = state.dice.map((value, index) => {
      if (kept[index]) return value;
      const n = random(); if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error('Invalid dice randomness.'); return Math.floor(n * 6) + 1;
    });
    const rolled = kept.map(value => !value), bust = farklePlays(dice, kept).length === 0;
    let next: FarkleState = { ...state, dice, kept, step: 'choose', rolls: state.rolls + 1 };
    if (bust) { next = { ...next, busts: state.busts.map((value, index) => value + Number(index === seat)) }; next = advance(next); }
    return record(state, next, 'roll', { dice, kept, rolled, bust, hot, turnPoints: state.turnPoints, points: bust && state.turnPoints > 0 ? -state.turnPoints : 0, label: bust ? `Farkle · ${state.turnPoints} turn points lost` : hot ? 'Hot dice · all six roll again' : 'Choose scoring dice' });
  }
  let next = state, scored = 0, label = '';
  const indices = move.t === 'keep' ? move.dice : move.dice ?? [];
  if (indices.length) {
    const play = selectedPlay(state, indices); if (!play) return null;
    scored = play.score; label = play.label;
    const kept = state.kept.map((value, index) => value || indices.includes(index)), hot = kept.every(Boolean);
    next = { ...state, kept, turnPoints: state.turnPoints + scored, step: 'roll', hotDice: state.hotDice.map((value, index) => value + Number(hot && index === seat)) };
  } else if (move.t === 'keep' || state.step !== 'roll') return null;
  if (!Number.isSafeInteger(next.turnPoints) || next.turnPoints > 1_000_000) return null;
  if (move.t === 'keep') return record(state, next, 'keep', { points: scored, hot: next.kept.every(Boolean), label });
  if (!canBankFarkle(next)) return null;
  const scores = next.scores.map((value, index) => value + (index === seat ? next.turnPoints : 0));
  return record(state, advance(next, scores), 'bank', { dice: [...next.dice], kept: [...next.kept], turnPoints: next.turnPoints, points: next.turnPoints, hot: next.kept.every(Boolean), label: `Banked ${next.turnPoints.toLocaleString()}` });
}
export function parseFarkleMove(value: unknown): FarkleMove | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>, keys = Object.keys(v);
  if (v.t === 'roll' && keys.length === 1) return { t: 'roll' };
  if ((v.t === 'keep' || v.t === 'bank') && keys.every(key => key === 't' || key === 'dice')) {
    if (v.t === 'bank' && v.dice === undefined) return { t: 'bank' };
    if (Array.isArray(v.dice) && v.dice.length > 0 && v.dice.length <= 6 && new Set(v.dice).size === v.dice.length && v.dice.every(index => Number.isInteger(index) && index >= 0 && index < 6)) return { t: v.t, dice: [...v.dice].sort((a, b) => a - b) };
  }
  return null;
}
export function farkleBotMove(state: FarkleState, seat: number, level: Level = 'normal', random = Math.random): FarkleMove | null {
  if (state.phase !== 'play' || seat !== state.turn) return null;
  if (state.step === 'choose') {
    const plays = farklePlays(state.dice, state.kept); if (!plays.length) return null;
    const play = level === 'easy' && plays.length > 1 && random() < .25 ? plays[Math.min(plays.length - 1, 2)]! : plays[0]!;
    return { t: 'keep', dice: play.dice };
  }
  const remaining = state.kept.every(Boolean) ? 6 : state.kept.filter(value => !value).length;
  if (!canBankFarkle(state)) return { t: 'roll' };
  const total = state.scores[seat]! + state.turnPoints, leader = Math.max(...state.scores);
  if (total >= state.target) return { t: 'bank' };
  const threshold = level === 'easy' ? 350 : level === 'normal' ? 650 : Math.max(550, Math.min(1500, 850 + (leader - state.scores[seat]!) * .08));
  const bank = state.turnPoints >= threshold || remaining <= (level === 'easy' ? 3 : 2) && state.turnPoints >= (level === 'hard' ? 400 : 300) || state.rolls >= 12;
  return { t: bank ? 'bank' : 'roll' };
}
export const FARKLE_ROLL_MS = 850;
export const farkleActivityDuration = (event:FarkleActivity,opponent=true) => event.kind==='roll' ? event.bust?4000:opponent?1900:FARKLE_ROLL_MS : event.kind==='keep'?opponent?1200:450:opponent?2000:1000;
