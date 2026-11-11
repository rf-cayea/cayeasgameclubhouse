import { validCardRewardAmount } from './reward-rates';
import { memberId, type RewardTier } from './rummy-rewards';
import { unitFor, type SpadesState } from './spades';
import type { Level } from './rummy';
export interface SpadesRewardPlayer { user_id: string | null; bot: boolean; level: Level | null }
export interface SpadesMatchReward {
  version: 1; match_id: string; mode: 'bot' | 'online'; variant: 'solo' | 'teams'; target: number;
  players: SpadesRewardPlayer[]; scores: number[]; winner: number; completed_at: string;
}
export interface SpadesReceipt { match_id: string; user_ids: string[]; amount: number; tier: RewardTier; source: string; already_credited: boolean }
export function spadesRewardTier(mode: 'bot' | 'online', players: SpadesRewardPlayer[]): RewardTier | null {
  if (players.length !== 4) return null;
  const humans = players.filter(player => !player.bot), bots = players.filter(player => player.bot);
  if (humans.some(player => !player.user_id) || new Set(humans.map(player => player.user_id)).size !== humans.length) return null;
  if (mode === 'online') return humans.length === 4 ? 'humans' : null;
  if (humans.length !== 1 || bots.length !== 3 || bots.some(player => !player.level || !['easy', 'normal', 'hard'].includes(player.level))) return null;
  return bots.some(player => player.level === 'hard') ? 'hard' : bots.some(player => player.level === 'normal') ? 'normal' : 'easy';
}
export const spadesWinners = (result: SpadesMatchReward) => result.players.flatMap((player, seat) => !player.bot && player.user_id && unitFor(result.variant, seat) === result.winner ? [player.user_id] : []).sort();
export function spadesMatchReward(state: SpadesState, mode: 'bot' | 'online', members: { principal: string; seat: number }[], matchId: string): SpadesMatchReward | null {
  if (state.phase !== 'gameOver' || state.winner === null) return null;
  const players = state.players.map((player, seat) => ({ user_id: player.bot ? null : memberId(members.find(member => member.seat === seat)?.principal ?? ''), bot: player.bot, level: player.bot ? player.level ?? 'normal' : null }));
  const result: SpadesMatchReward = { version: 1, match_id: matchId, mode, variant: state.mode, target: state.target, players, scores: state.scores, winner: state.winner, completed_at: new Date().toISOString() };
  return spadesRewardTier(mode, players) && spadesWinners(result).length ? result : null;
}
export function validSpadesReceipt(result: SpadesMatchReward, receipt: SpadesReceipt): boolean {
  const tier = spadesRewardTier(result.mode, result.players);
  return Boolean(tier && receipt && receipt.match_id === result.match_id && receipt.tier === tier && validCardRewardAmount(tier, receipt.amount) &&
    receipt.source === `spades:win:${result.match_id}` && typeof receipt.already_credited === 'boolean' && Array.isArray(receipt.user_ids) &&
    [...receipt.user_ids].sort().join(',') === spadesWinners(result).join(','));
}
