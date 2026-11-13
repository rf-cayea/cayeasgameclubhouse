import { validCardRewardAmount } from '../src/lib/reward-rates';
import { rewardTier, type MatchReward, type RewardReceipt } from '../src/lib/rummy-rewards';
import type { RoomStore } from './rooms';

export interface RewardWriter { configured: () => boolean; deliver: (result: MatchReward) => Promise<RewardReceipt> }

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
/** Best stable signal for a failed delivery: a Node error code, an abort or
 * type name, or the message our writers raise in place of a code. */
function failureCode(error: unknown): string {
  const value = error as { code?: unknown; name?: unknown; message?: unknown } | null | undefined;
  if (typeof value?.code === 'string' && value.code) return value.code;
  if (typeof value?.name === 'string' && value.name && value.name !== 'Error') return value.name;
  if (typeof value?.message === 'string' && value.message) return value.message.slice(0, 120);
  return 'unknown';
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
        } catch (error) {
          console.error('Reward delivery failed; the reward stays pending for retry.', { matchId: job.result.match_id, code: failureCode(error) });
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
