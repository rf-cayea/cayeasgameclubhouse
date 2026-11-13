import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliveryWorker } from '../server/rewards';

const match = { match_id: 'match_stuck_win' };

/** One queued reward, so each flush makes exactly one attempt. */
function pendingStore() {
  const retried: { id: string; lease: string }[] = [];
  let claimed = false;
  return {
    retried,
    claimReward: () => {
      if (claimed) return null;
      claimed = true;
      return { result: match, lease: 'lease-1', roomCode: 'ABCD1234' };
    },
    finishReward: vi.fn(),
    retryReward: (id: string, lease: string) => { retried.push({ id, lease }); },
  };
}

async function flushOnce(deliver: () => Promise<unknown>, validate = () => true) {
  const store = pendingStore();
  const writer = { configured: () => true, deliver };
  const worker = deliveryWorker(store, writer, validate);
  try { await worker.flush(); } finally { await worker.stop(); }
  return store;
}

describe('reward delivery retries', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('logs the match id and writer error code when a reward is retried', async () => {
    const store = await flushOnce(async () => { throw new Error('reward_sync_failed'); });
    expect(store.retried).toEqual([{ id: 'match_stuck_win', lease: 'lease-1' }]);
    expect(store.finishReward).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('stays pending'), { matchId: 'match_stuck_win', code: 'reward_sync_failed' });
  });

  it('prefers a transport error code over the generic message', async () => {
    await flushOnce(async () => { throw Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }); });
    expect(console.error).toHaveBeenCalledWith(expect.any(String), { matchId: 'match_stuck_win', code: 'ECONNREFUSED' });
  });

  it('names a rejected receipt so a misconfigured writer is distinguishable', async () => {
    const store = await flushOnce(async () => ({}), () => false);
    expect(store.retried).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), { matchId: 'match_stuck_win', code: 'reward_invalid_receipt' });
  });
});
