import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { EconomyCommand, EconomyCommandResult, EconomyView } from './economy-protocol';

export const ECONOMY_CHANGED = 'clubhouse-economy-changed';
export class EconomyRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export const economyError = (cause: unknown) => cause instanceof Error ? cause.message : 'Your rewards could not load. Please try again.';

async function request<T>(path: string, command?: EconomyCommand, expectedUserId?: string, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new EconomyRequestError('Sign in to save points and collect your rewards.', 401);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session || (expectedUserId && data.session.user.id !== expectedUserId)) throw new EconomyRequestError('Your account changed. Please sign in again.', 401);
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(cancel, 15000);
  try {
    const response = await fetch(path, { method: command ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(command ? { 'Content-Type': 'application/json' } : {}) },
      ...(command ? { body: JSON.stringify(command) } : {}) });
    let result: unknown;
    try { result = await response.json(); } catch { throw new EconomyRequestError('Rewards are unavailable. Please try again.', response.status); }
    if (!response.ok) throw new EconomyRequestError(result && typeof result === 'object' && 'error' in result ? String(result.error) : 'The reward request could not be completed.', response.status);
    return result as T;
  } catch (cause) {
    if (controller.signal.aborted) throw new EconomyRequestError('The request was interrupted. Refresh before retrying. A conversion retry uses the same receipt and cannot charge twice.', 0);
    throw cause;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
export function economyRequest<T = EconomyView>(command?: EconomyCommand, expectedUserId?: string, signal?: AbortSignal): Promise<T> { return request('/api/economy', command, expectedUserId, signal); }
export function economyRead<T>(path: string, userId: string, signal?: AbortSignal): Promise<T> { return request(path, undefined, userId, signal); }

export function notifyEconomy() {
  window.dispatchEvent(new Event(ECONOMY_CHANGED));
  window.dispatchEvent(new Event('clubhouse-wallet'));
  try { localStorage.setItem('clubhouse-wallet-refresh', crypto.randomUUID()); } catch { /* Focus refresh works when storage is unavailable. */ }
}

/** Read data is keyed to the actor immediately, including before effect cleanup. */
export function useEconomyResource<T>(path: string, userId: string | null) {
  const key = `${userId ?? ''}:${path}`, current = useRef(key), mounted = useRef(false), generation = useRef(0);
  const inFlight = useRef(false), queued = useRef(false), controller = useRef<AbortController | null>(null);
  const [record, setRecord] = useState<{ key: string; data: T } | null>(null), [failure, setFailure] = useState<{ key: string; error: string } | null>(null), [loading, setLoading] = useState(false);
  current.current = key;
  const refresh = useCallback(async function reload() {
    if (!userId) return;
    if (inFlight.current) { queued.current = true; return; }
    const wanted = `${userId}:${path}`, version = ++generation.current, abort = new AbortController();
    inFlight.current = true; controller.current = abort; setLoading(true);
    try {
      const data = await economyRead<T>(path, userId, abort.signal);
      if (mounted.current && version === generation.current && current.current === wanted) { setRecord({ key: wanted, data }); setFailure(null); }
    } catch (cause) {
      if (mounted.current && version === generation.current && current.current === wanted) setFailure({ key: wanted, error: economyError(cause) });
    } finally {
      if (version === generation.current) {
        inFlight.current = false; controller.current = null;
        if (mounted.current) { setLoading(false); if (queued.current) { queued.current = false; void reload(); } }
      }
    }
  }, [path, userId]);
  useEffect(() => {
    mounted.current = true; ++generation.current; inFlight.current = false; queued.current = false;
    setRecord(null); setFailure(null); setLoading(false); void refresh();
    const changed = () => void refresh(), stored = (event: StorageEvent) => { if (event.key === 'clubhouse-wallet-refresh') void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', changed); window.addEventListener(ECONOMY_CHANGED, changed); window.addEventListener('clubhouse-wallet', changed); window.addEventListener('clubhouse-social-changed', changed); window.addEventListener('storage', stored); document.addEventListener('visibilitychange', visible);
    const timer = userId ? setInterval(visible, 15000) : null;
    return () => { mounted.current = false; ++generation.current; controller.current?.abort(); controller.current = null; inFlight.current = false; queued.current = false; if (timer) clearInterval(timer); window.removeEventListener('focus', changed); window.removeEventListener(ECONOMY_CHANGED, changed); window.removeEventListener('clubhouse-wallet', changed); window.removeEventListener('clubhouse-social-changed', changed); window.removeEventListener('storage', stored); document.removeEventListener('visibilitychange', visible); };
  }, [refresh, userId]);
  return { data: record?.key === key ? record.data : null, error: failure?.key === key ? failure.error : '', loading, refresh };
}
export const useEconomy = (userId: string | null) => useEconomyResource<EconomyView>('/api/economy', userId);

export function useEconomyAction(userId: string | null) {
  const account = useRef(userId), mounted = useRef(false), generation = useRef(0), pending = useRef(false);
  account.current = userId;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => { mounted.current = true; ++generation.current; pending.current = false; setBusy(false); setError(''); setNotice(''); return () => { mounted.current = false; ++generation.current; }; }, [userId]);
  async function run(command: EconomyCommand, success: string): Promise<EconomyCommandResult | null> {
    if (!userId || pending.current) return null;
    const actor = userId, version = generation.current;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await economyRequest<EconomyCommandResult>(command, actor);
      if (!mounted.current || version !== generation.current || account.current !== actor) return null;
      if (result.ok !== true || !result.wallet || !result.receipt) throw new Error('The reward change could not be confirmed. Refresh before trying again.');
      setNotice(success); notifyEconomy(); return result;
    } catch (cause) { if (mounted.current && version === generation.current && account.current === actor) setError(economyError(cause)); return null; }
    finally { if (version === generation.current) { pending.current = false; if (mounted.current) setBusy(false); } }
  }
  return { run, busy, error, notice };
}
