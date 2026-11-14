import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserAuthStorage } from '../src/lib/auth-storage';
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: vi.fn((key: string) => { values.delete(key); }) };
};
afterEach(() => vi.unstubAllGlobals());
describe('saved browser sign-in', () => {
  it('restores existing SDK keys after a full page reload and removes them on sign-out', () => {
    const local = storage(), tab = storage();
    vi.stubGlobal('window', { localStorage: local, sessionStorage: tab });
    browserAuthStorage().setItem('sb-project-auth-token', 'session');
    expect(browserAuthStorage().getItem('sb-project-auth-token')).toBe('session');
    browserAuthStorage().removeItem('sb-project-auth-token');
    expect(browserAuthStorage().getItem('sb-project-auth-token')).toBeNull();
  });
  it('survives reloads in the same tab when local storage is blocked', () => {
    const tab = storage();
    vi.stubGlobal('window', { get localStorage() { throw new Error('Blocked'); }, sessionStorage: tab });
    browserAuthStorage().setItem('auth', 'session');
    expect(browserAuthStorage().getItem('auth')).toBe('session');
    browserAuthStorage().removeItem('auth');
    expect(browserAuthStorage().getItem('auth')).toBeNull();
  });
  it('uses rotated tab credentials after persistent storage runs out of space', () => {
    const local = storage(), tab = storage();
    vi.stubGlobal('window', { localStorage: local, sessionStorage: tab });
    const adapter = browserAuthStorage();
    adapter.setItem('auth', 'old');
    local.setItem.mockImplementation(() => { throw new Error('Quota'); });
    adapter.setItem('auth', 'new');
    expect(adapter.getItem('auth')).toBe('new');
    expect(browserAuthStorage().getItem('auth')).toBe('new');
  });
});
