import type { Level } from './rummy';
import type { RewardTier } from './rummy-rewards';
import { CARD_WIN_POINTS } from './reward-rates';

export const FIVE_DICE_PARTY = { id: 'five-dice-party', name: 'Quintsee Party Tables', price: 600, cashPrice: 462, currency: 'dice_points' } as const;
export interface FiveDiceRewardPlayer { user_id: string | null; bot: boolean; level: Level | null }
export interface FiveDiceMatchReward {
  version: 1; match_id: string; mode: 'bot' | 'online'; players: FiveDiceRewardPlayer[];
  winner: number | null; scores: number[]; completed_at: string;
}
export interface FiveDiceReceipt { match_id: string; user_id: string; amount: number; tier: RewardTier; source: string; already_credited: boolean }
export const ownsFiveDiceParty = (owned: readonly string[] = []) => owned.includes(FIVE_DICE_PARTY.id);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Eligibility is derived only from the server-created completed-match evidence. */
export function fiveDiceRewardTier(mode: 'bot' | 'online', players: FiveDiceRewardPlayer[]): RewardTier | null {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4 || players.some(player=>!player||typeof player!=='object'||typeof player.bot!=='boolean')) return null;
  const people = players.filter(player => !player.bot), bots = players.filter(player => player.bot);
  if (people.some(player => !player.user_id || !UUID.test(player.user_id)) || new Set(people.map(player => player.user_id)).size !== people.length) return null;
  if (mode === 'online') return !bots.length ? 'humans' : null;
  if (mode !== 'bot' || players.length !== 2 || people.length !== 1 || bots.length !== 1 || !['easy','normal','hard'].includes(bots[0]?.level ?? '')) return null;
  return bots[0]!.level!;
}
export function fiveDiceWinner(result: FiveDiceMatchReward): string | null {
  if (!result || typeof result!=='object' || result.version !== 1 || !UUID.test(result.match_id) || !fiveDiceRewardTier(result.mode,result.players) || !Number.isInteger(result.winner) || result.winner === null || result.winner < 0 || result.winner >= result.players.length || !Array.isArray(result.scores) || result.scores.length !== result.players.length || result.scores.some(score => !Number.isSafeInteger(score) || score < 0 || score > 10000)) return null;
  const winner=result.players[result.winner]!;
  if (winner.bot || !winner.user_id || result.scores.some((score,seat)=>seat!==result.winner && score>=result.scores[result.winner!]!)) return null;
  return winner.user_id;
}
export function validFiveDiceReceipt(result: FiveDiceMatchReward, receipt: FiveDiceReceipt) {
  const tier=fiveDiceRewardTier(result.mode,result.players),winner=fiveDiceWinner(result);
  return Boolean(tier && winner && receipt && receipt.match_id===result.match_id && receipt.user_id===winner && receipt.tier===tier && receipt.amount===CARD_WIN_POINTS[tier] && receipt.source===`five-dice:win:${result.match_id}` && typeof receipt.already_credited==='boolean');
}
