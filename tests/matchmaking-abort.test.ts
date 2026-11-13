import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchRequest, MatchAbortedError } from '../src/lib/matchmaking-api';

// Mirrors real fetch semantics: reject at once if the signal is already aborted,
// otherwise reject when it aborts, and never resolve on its own.
const hangingFetch = () => vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => new Promise((_, reject) => {
  const abort = () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
  const signal = init?.signal as AbortSignal | undefined;
  if (signal?.aborted) { abort(); return; }
  signal?.addEventListener('abort', abort);
}));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Match Making request cancellation', () => {
  it('treats a caller abort as a superseded attempt, not a failure to report', async () => {
    hangingFetch();
    const controller = new AbortController();
    const pending = matchRequest('/api/rummy/matchmaking', null, undefined, controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(MatchAbortedError);
  });

  it('treats an already-aborted signal as superseded without touching the network', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(matchRequest('/api/rummy/matchmaking', null, undefined, AbortSignal.abort())).rejects.toBeInstanceOf(MatchAbortedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('still reports the interrupted message when nobody else aborted (the 15s stall)', async () => {
    vi.useFakeTimers();
    hangingFetch();
    const pending = matchRequest('/api/rummy/matchmaking', null);
    const assertion = expect(pending).rejects.toThrow('Connection interrupted. Check your saved table before trying again.');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    await expect(pending).rejects.not.toBeInstanceOf(MatchAbortedError);
  });
});
