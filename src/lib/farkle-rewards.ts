import type { Level } from './rummy';
import type { RewardTier } from './rummy-rewards';
import { CARD_WIN_POINTS } from './reward-rates';

export interface FarkleRewardPlayer { user_id: string | null; bot: boolean; level: Level | null }
export interface FarkleMatchReward {
  version: 1; match_id: string; target?:5000|10000; mode: 'bot' | 'online'; players: FarkleRewardPlayer[];
  winner: number | null; scores: number[]; completed_at: string;
}
export interface FarkleReceipt { match_id: string; user_id: string; amount: number; tier: RewardTier; source: string; already_credited: boolean }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
/** Eligibility is derived only from the server-created completed-match evidence. */
export function farkleRewardTier(mode: 'bot' | 'online', players: FarkleRewardPlayer[]): RewardTier | null {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4 || players.some(player=>!player||typeof player!=='object'||typeof player.bot!=='boolean')) return null;
  const people = players.filter(player => !player.bot), bots = players.filter(player => player.bot);
  if (people.some(player => !player.user_id || !UUID.test(player.user_id)) || new Set(people.map(player => player.user_id)).size !== people.length) return null;
  if (mode === 'online') return !bots.length ? 'humans' : null;
  if (mode !== 'bot' || players.length !== 2 || people.length !== 1 || bots.length !== 1 || !['easy','normal','hard'].includes(bots[0]?.level ?? '')) return null;
  return bots[0]!.level!;
}
export function farkleWinner(result: FarkleMatchReward): string | null {
  if (!result || typeof result!=='object' || result.version !== 1 || result.target!==undefined&&![5000,10000].includes(result.target) || !UUID.test(result.match_id) || !farkleRewardTier(result.mode,result.players) || !Number.isInteger(result.winner) || result.winner === null || result.winner < 0 || result.winner >= result.players.length || !Array.isArray(result.scores) || result.scores.length !== result.players.length || result.scores.some(score => !Number.isSafeInteger(score) || score < 0 || score > 2000000)) return null;
  const winner=result.players[result.winner]!;
  if (winner.bot || !winner.user_id || result.scores[result.winner]! < (result.target??10000) || result.scores.some((score,seat)=>seat!==result.winner && score>=result.scores[result.winner!]!)) return null;
  return winner.user_id;
}
export function validFarkleReceipt(result: FarkleMatchReward, receipt: FarkleReceipt) {
  const tier=farkleRewardTier(result.mode,result.players),winner=farkleWinner(result);
  return Boolean(tier && winner && receipt && receipt.match_id===result.match_id && receipt.user_id===winner && receipt.tier===tier && receipt.amount===CARD_WIN_POINTS[tier] && receipt.source===`farkle:win:${result.match_id}` && typeof receipt.already_credited==='boolean');
}
