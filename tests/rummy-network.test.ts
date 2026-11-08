import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/integrations/supabase/client', () => ({ supabase: null }));
import { gameRequest } from '../src/lib/rummy-network';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('shared game and social HTTP transport', () => {
  it.each([null, false, 0, '', { operation: 'friend_request', playerId: 'fixture' }])('sends explicitly supplied payload %j as JSON POST', async command => {
    const fetch = vi.fn(async (_path: unknown, _options?: RequestInit) => Response.json({ ok: true }));vi.stubGlobal('fetch', fetch);
    expect(await gameRequest('/api/social', command)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('/api/social', expect.objectContaining({ method: 'POST', body: JSON.stringify(command), credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }));
  });
  it('uses GET only when the command is omitted and preserves server error status', async () => {
    const fetch = vi.fn(async (_path: unknown, _options?: RequestInit) => Response.json({ error: 'Friend request no longer exists.' }, { status: 409 }));vi.stubGlobal('fetch', fetch);
    await expect(gameRequest('/api/social/friends')).rejects.toMatchObject({ message: 'Friend request no longer exists.', status: 409 });
    expect(fetch).toHaveBeenCalledWith('/api/social/friends', expect.objectContaining({ method: 'GET' }));
    expect(fetch.mock.calls[0]![1]).not.toHaveProperty('body');
  });
  it('cancels a timed-out request and reports a recoverable connection error', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal;
    vi.stubGlobal('fetch', vi.fn((_path, options: RequestInit) => new Promise((_resolve, reject) => {
      signal = options.signal!;signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const result = expect(gameRequest('/api/rummy')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('timed out') });
    await vi.advanceTimersByTimeAsync(15000);await result;
    expect(signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
