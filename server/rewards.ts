import { validCardRewardAmount } from '../src/lib/reward-rates';
import { createClient } from '@supabase/supabase-js';
import { rewardTier, type MatchReward, type RewardReceipt } from '../src/lib/rummy-rewards';
import type { RoomStore } from './rooms';

export interface RewardWriter { configured: () => boolean; deliver: (result: MatchReward) => Promise<RewardReceipt> }

/** Server-only key; never imported by a browser entry point. */
export function supabaseRewardWriter(): RewardWriter {
  const config = () => ({ url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    key: process.env.CLUBHOUSE_REWARD_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY });
  return {
    configured: () => Boolean(config().url && config().key),
    deliver: async result => {
      const { url, key } = config();
      if (!url || !key) throw new Error('reward_unconfigured');
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.rpc('credit_rummy_match', { _result: result }).abortSignal(AbortSignal.timeout(15_000));
      if (error) throw new Error('reward_sync_failed');
      return data as RewardReceipt;
    },
  };
}

export function validReceipt(result: MatchReward, receipt: RewardReceipt): boolean {
  const tier = rewardTier(result.mode, result.participants);
  return Boolean(tier && receipt && receipt.match_id === result.match_id && receipt.user_id === result.participants[result.winner_index]?.user_id &&
    receipt.tier === tier && validCardRewardAmount(tier, receipt.amount) && receipt.source === `rummy:win:${result.match_id}` && typeof receipt.already_credited === 'boolean');
}

/** A leased outbox survives process restarts and ambiguous network responses. */
export function rewardWorker(store: RoomStore, writer: RewardWriter, publish: (code: string) => void = () => {}, now = Date.now) {
  return deliveryWorker(store, writer, validReceipt, publish, now);
}

export interface DeliveryStore<M, R> {
  claimReward(now: number): { result: M; lease: string; roomCode: string } | null;
  finishReward(id: string, lease: string, receipt: R): void;
  retryReward(id: string, lease: string, now: number): void;
}
export function deliveryWorker<M extends { match_id: string }, R>(store: DeliveryStore<M, R>, writer: { configured: () => boolean; deliver: (result: M) => Promise<R> }, validate: (result: M, receipt: R) => boolean, publish: (code: string) => void = () => {}, now = Date.now) {
  let running: Promise<void> | null = null;
  let stopped = false;
  const flush = (): Promise<void> => {
    if (running) return running;
    if (stopped || !writer.configured()) return Promise.resolve();
    running = (async () => {
      for (let count = 0; count < 20 && !stopped; count++) {
        const job = store.claimReward(now());
        if (!job) break;
        try {
          const receipt = await writer.deliver(job.result);
          if (!validate(job.result, receipt)) throw new Error('reward_invalid_receipt');
          store.finishReward(job.result.match_id, job.lease, receipt);
          publish(job.roomCode);
        } catch {
          store.retryReward(job.result.match_id, job.lease, now());
        }
      }
    })().catch(() => { console.error('Reward outbox is unavailable; synchronization will retry.'); }).finally(() => { running = null; });
    return running;
  };
  const timer = setInterval(() => void flush(), 5000);
  timer.unref();
  void flush();
  return { flush, stop: async () => { stopped = true; clearInterval(timer); await running; } };
}
