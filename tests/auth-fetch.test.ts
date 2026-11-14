import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: mocks } }));
const actor = (token = 'old', id = 'member') => ({ access_token: token, user: { id } });
const session = (token = 'old', id = 'member') => ({ data: { session: actor(token, id) }, error: null });
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => vi.unstubAllGlobals());

describe('session renewal for account and card requests', () => {
  it('renews once for concurrent unauthorized requests and retries the identical body', async () => {
    const { fetchWithSession } = await import('../src/lib/auth-fetch');
    let token = 'old';
    mocks.getSession.mockImplementation(async () => session(token));
    mocks.refreshSession.mockImplementation(async () => { token = 'renewed'; return session(token); });
    vi.mocked(fetch).mockImplementation(async (_url, init) => new Response('{}', { status: new Headers(init?.headers).get('Authorization') === 'Bearer old' ? 401 : 200 }));
    const request = { method: 'POST', body: JSON.stringify({ requestId: 'same-id', operation: 'play' }) };
    const result = await Promise.all([fetchWithSession('/table', request, actor()), fetchWithSession('/wallet', request, actor())]);
    expect(result.map(value => value.status)).toEqual([200, 200]);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls.every(call => call[1]?.body === request.body)).toBe(true);
  });
  it('uses an already rotated token without another refresh', async () => {
    const { fetchWithSession } = await import('../src/lib/auth-fetch');
    mocks.getSession.mockResolvedValue(session('new'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('{}'));
    expect((await fetchWithSession('/wallet', {}, actor())).status).toBe(200);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });
  it('does not replay writes for another member or sign back in after sign-out', async () => {
    const { fetchWithSession } = await import('../src/lib/auth-fetch');
    vi.mocked(fetch).mockImplementation(async () => new Response('{}', { status: 401 }));
    mocks.getSession.mockResolvedValueOnce(session('new', 'other')).mockResolvedValueOnce({ data: { session: null }, error: null });
    await fetchWithSession('/table', { method: 'POST' }, actor());
    await fetchWithSession('/table', { method: 'POST' }, actor());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });
  it('never refreshes for service failures and never loops on a second 401', async () => {
    const { fetchWithSession } = await import('../src/lib/auth-fetch');
    mocks.getSession.mockResolvedValue(session('new'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 })).mockResolvedValueOnce(new Response('{}', { status: 401 }));
    expect((await fetchWithSession('/wallet', {}, actor())).status).toBe(503);
    expect((await fetchWithSession('/wallet', {}, actor())).status).toBe(401);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });
});
