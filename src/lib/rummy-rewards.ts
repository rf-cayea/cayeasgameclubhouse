import { WIN_POINTS, type Level, type State, type Variant } from './rummy';
import type { GameMode } from './rummy-protocol';

export type RewardTier = keyof typeof WIN_POINTS;
export type RewardStatus = 'ineligible' | 'eligible' | 'pending' | 'credited';
export interface RewardView { status: RewardStatus; amount: number; tier: RewardTier | null; message: string; source?: string }
export interface RewardParticipant { user_id: string | null; bot: boolean; level: Level | null; score: number }
export interface MatchReward {
  version: 1; match_id: string; variant: Variant; mode: 'bot' | 'online'; winner_index: number;
  participants: RewardParticipant[]; completed_at: string;
}
export interface RewardReceipt { match_id: string; user_id: string; amount: number; tier: RewardTier; source: string; already_credited: boolean }
export const memberId = (principal: string): string | null => /^member:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(principal)?.[1]?.toLowerCase() ?? null;

export function rewardTier(mode: GameMode, participants: Pick<RewardParticipant, 'user_id' | 'bot' | 'level'>[]): RewardTier | null {
  const people = participants.filter(player => !player.bot);
  if (mode === 'local' || people.some(player => !player.user_id)) return null;
  if (mode === 'online') return participants.length >= 2 && participants.every(player => !player.bot) && new Set(people.map(player => player.user_id)).size === people.length ? 'humans' : null;
  if (people.length !== 1 || !participants.some(player => player.bot)) return null;
  const levels = participants.filter(player => player.bot).map(player => player.level);
  if (levels.some(level => !level || !['easy', 'normal', 'hard'].includes(level))) return null;
  return levels.includes('hard') ? 'hard' : levels.includes('normal') ? 'normal' : 'easy';
}

export function rewardParticipants(state: State, members: { id: string; principal: string }[]): RewardParticipant[] {
  return state.players.map((player, i) => ({
    user_id: player.bot ? null : memberId(members.find(member => member.id === player.id)?.principal ?? ''),
    bot: player.bot, level: player.bot ? player.level ?? 'normal' : null, score: state.scores[i]!,
  }));
}

export function completedReward(state: State | null, mode: GameMode, members: { id: string; principal: string }[], matchId: string | undefined, completedAt: string): MatchReward | null {
  if (!state || state.phase !== 'gameOver' || state.winner === null || !matchId || mode === 'local') return null;
  const participants = rewardParticipants(state, members);
  const winner = participants[state.winner];
  if (!winner || winner.bot || !winner.user_id || !rewardTier(mode, participants)) return null;
  const target = state.variant === 'r500' ? 500 : 100;
  if (state.target !== target || winner.score < target || participants.some((player, i) => i !== state.winner && player.score >= winner.score)) return null;
  return { version: 1, match_id: matchId, variant: state.variant, mode, winner_index: state.winner, participants, completed_at: completedAt };
}
