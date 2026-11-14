import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { EconomyView, EconomyWallet } from '../src/lib/economy-protocol';

const mocks = vi.hoisted(() => ({
  listeners: [] as ((event: AuthChangeEvent, session: Session | null) => void)[],
  unmount: [] as (() => void)[],
  getSession: vi.fn(),
  economyRead: vi.fn(),
  onAuthStateChange: vi.fn((listener: (event: AuthChangeEvent, session: Session | null) => void) => {
    mocks.listeners.push(listener);
  }),
}));

vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useSyncExternalStore(subscribe: (listener: () => void) => () => void, snapshot: () => unknown) {
    mocks.unmount.push(subscribe(() => {}));
    return snapshot();
  },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mocks.getSession, onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock('../src/lib/economy-api', () => ({
  economyRead: mocks.economyRead,
  economyError: (error: Error) => error.message,
}));

const session = (id: string) => ({ user: { id, email: `${id}@example.test` } }) as Session;
const wallet = (points: number): EconomyWallet => ({
  points, rummy_points: 0, f3_points: 0, spades_points: 0, gems_points: 0, dice_points: 0,
  domino_points: 0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {},
});
const view = (points: number) => ({ wallet: wallet(points), sources: [], humanWinSources: [], achievements: [] }) as unknown as EconomyView;
const emit = (event: AuthChangeEvent, value: Session | null) => mocks.listeners.forEach(listener => listener(event, value));
const unmountAll = () => mocks.unmount.splice(0).forEach(unsubscribe => unsubscribe());
const tick = () => vi.advanceTimersByTimeAsync(1);

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T00:00:00Z'));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  mocks.listeners.length = 0;
});
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('shared Clubhouse sign-in and wallet', () => {
  it('recovers a failed store balance automatically and stops retrying once healthy', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { useClubhouse, useClubhouseAccount } = await import('../src/lib/clubhouse-account');
    mocks.economyRead.mockRejectedValueOnce(new Error('The game service could not complete that request.'))
      .mockResolvedValue({ wallet: wallet(900) });
    useClubhouse();
    emit('INITIAL_SESSION', session('member'));
    await tick();
    expect(useClubhouseAccount()).toMatchObject({ user: { id: 'member' } });
    expect(mocks.economyRead).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(useClubhouse()).toMatchObject({ user: { id: 'member' }, wallet: { points: 900 }, error: null });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.economyRead).toHaveBeenCalledTimes(2);
  });

  it('reuses the same signed-in account and wallet when the player opens a new page or game', async () => {
    const { useClubhouse, useClubhouseAccount } = await import('../src/lib/clubhouse-account');
    mocks.economyRead.mockResolvedValue(view(250));
    expect(useClubhouseAccount()).toMatchObject({ ready: false, user: null });
    emit('INITIAL_SESSION', session('member'));
    expect(useClubhouseAccount()).toMatchObject({ ready: true, user: { id: 'member' } });
    await tick();
    expect(mocks.economyRead).not.toHaveBeenCalled();
    useClubhouse();
    useClubhouse();
    await tick();
    expect(useClubhouse().wallet?.points).toBe(250);
    unmountAll();

    emit('TOKEN_REFRESHED', session('member'));
    expect(useClubhouse()).toMatchObject({ ready: true, user: { id: 'member' }, wallet: { points: 250 } });
    await tick();
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.economyRead).toHaveBeenCalledTimes(1);
    expect(mocks.economyRead).toHaveBeenCalledWith('/api/economy/wallet', 'member', expect.any(AbortSignal));
  });

  it('loads full rewards only when a rewards screen subscribes', async () => {
    const { useClubhouse, useEconomy } = await import('../src/lib/clubhouse-account');
    mocks.economyRead.mockResolvedValueOnce({ wallet: wallet(250) }).mockResolvedValueOnce(view(250));
    useClubhouse();
    emit('INITIAL_SESSION', session('member'));
    await tick();
    expect(useClubhouse().wallet?.points).toBe(250);
    expect(useEconomy('member').data).toBeNull();
    await tick();
    expect(mocks.economyRead.mock.calls.map(call => call[0])).toEqual(['/api/economy/wallet', '/api/economy']);
    expect(useEconomy('member').data?.achievements).toEqual([]);
  });

  it('keeps a member signed in when the wallet service is unavailable', async () => {
    const { useClubhouse } = await import('../src/lib/clubhouse-account');
    useClubhouse();
    mocks.economyRead.mockRejectedValue(new Error('Rewards are temporarily unavailable.'));
    emit('INITIAL_SESSION', session('member'));
    await tick();
    expect(useClubhouse()).toMatchObject({ ready: true, user: { id: 'member' }, error: 'Rewards are temporarily unavailable.' });
  });

  it('recovers a saved session when the browser reconnects after a failed startup check', async () => {
    const { useClubhouseAccount } = await import('../src/lib/clubhouse-account');
    useClubhouseAccount();
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: new Error('Connection interrupted') })
      .mockResolvedValueOnce({ data: { session: session('member') }, error: null });
    emit('INITIAL_SESSION', null);
    await tick();
    expect(useClubhouseAccount().error).toContain('couldn’t reconnect');
    window.dispatchEvent(new Event('online'));
    await tick();
    expect(useClubhouseAccount()).toMatchObject({ ready: true, user: { id: 'member' }, error: null });
  });

  it('ignores old wallet reads and clears member state on account switch or sign-out', async () => {
    const { useClubhouse } = await import('../src/lib/clubhouse-account');
    let completeOldRead!: (value: EconomyView) => void;
    mocks.economyRead.mockReturnValueOnce(new Promise(resolve => { completeOldRead = resolve; }))
      .mockResolvedValueOnce(view(500));
    useClubhouse();
    emit('INITIAL_SESSION', session('first'));
    await tick();
    const signal = mocks.economyRead.mock.calls[0][2] as AbortSignal;
    emit('SIGNED_IN', session('second'));
    expect(signal.aborted).toBe(true);
    expect(useClubhouse()).toMatchObject({ user: { id: 'second' }, wallet: null });
    await tick();
    completeOldRead(view(100));
    await tick();
    expect(useClubhouse().wallet?.points).toBe(500);
    useClubhouse().applyWallet('first', wallet(50));
    expect(useClubhouse().wallet?.points).toBe(500);
    emit('SIGNED_OUT', null);
    expect(useClubhouse()).toMatchObject({ ready: true, user: null, wallet: null, sources: [] });
  });
});
