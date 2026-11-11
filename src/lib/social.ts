import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { PlayerProfile, SocialCommand, SocialCommandResult } from './social-protocol';

export const SOCIAL_CHANGED = 'clubhouse-social-changed';
export class SocialRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export const socialError = (cause: unknown) => cause instanceof Error ? cause.message : 'Your player information could not load. Please try again.';

export async function socialRequest<T>(path: string, userId: string, command?: SocialCommand, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new SocialRequestError('Sign in to use player profiles and friends.', 401);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session || data.session.user.id !== userId) throw new SocialRequestError('Your account changed. Please sign in again.', 401);
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const timeout = setTimeout(cancel, 12000);
  try {
    const response = await fetch(path, { method: command ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(command ? { 'Content-Type': 'application/json' } : {}) },
      ...(command ? { body: JSON.stringify(command) } : {}) });
    let next: unknown;
    try { next = await response.json(); } catch { throw new SocialRequestError('Player services are unavailable. Please try again.', response.status); }
    if (!response.ok) throw new SocialRequestError(next && typeof next === 'object' && 'error' in next ? String(next.error) : 'The player request could not be completed.', response.status);
    return next as T;
  } catch (cause) {
    if (controller.signal.aborted) throw new SocialRequestError('The request timed out. Refresh before trying again.', 0);
    throw cause;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel); }
}

/** Account-keyed state prevents a previous member's data flashing after sign-out. */
export function useSocialResource<T>(path: string | null, userId: string | null, poll = true) {
  const key = `${userId ?? ''}:${path ?? ''}`;
  const current = useRef(key), mounted = useRef(false), generation = useRef(0), inFlight = useRef(false), queued = useRef(false);
  current.current = key;
  const [record, setRecord] = useState<{ key: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null), [loading, setLoading] = useState(false);
  const refresh = useCallback(async function reload() {
    if (!path || !userId) return;
    if (inFlight.current) { queued.current = true; return; }
    const version = ++generation.current, wanted = `${userId}:${path}`;
    inFlight.current = true; setLoading(true);
    try {
      const data = await socialRequest<T>(path, userId);
      if (mounted.current && version === generation.current && current.current === wanted) { setRecord({ key: wanted, data }); setFailure(null); }
    } catch (cause) { if (mounted.current && version === generation.current && current.current === wanted) setFailure({ key: wanted, message: socialError(cause) }); }
    finally { if (version === generation.current) { inFlight.current = false; if (mounted.current) { setLoading(false); if (queued.current) { queued.current = false; void reload(); } } } }
  }, [path, userId]);
  useEffect(() => {
    mounted.current = true; ++generation.current; inFlight.current = false; queued.current = false; setRecord(null); setFailure(null); setLoading(false);
    void refresh();
    const focused = () => void refresh(), changed = () => void refresh();
    window.addEventListener('focus', focused); window.addEventListener(SOCIAL_CHANGED, changed);
    const timer = poll && userId && path ? setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 10000) : null;
    return () => { mounted.current = false; ++generation.current; inFlight.current = false; if (timer) clearInterval(timer); window.removeEventListener('focus', focused); window.removeEventListener(SOCIAL_CHANGED, changed); };
  }, [refresh, poll, path, userId]);
  return { data: record?.key === key ? record.data : null, error: failure?.key === key ? failure.message : '', loading, refresh };
}
export const usePlayerProfile = (userId: string | null) => useSocialResource<PlayerProfile>('/api/social/me', userId);

export function useSocialAction(userId: string | null) {
  const actor = useRef(userId), mounted = useRef(false), generation = useRef(0), pending = useRef(false);
  actor.current = userId;
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => {
    mounted.current = true; ++generation.current; pending.current = false; setBusy(false); setError(''); setNotice('');
    return () => { mounted.current = false; ++generation.current; };
  }, [userId]);
  async function run(command: SocialCommand, success = ''): Promise<SocialCommandResult | null> {
    if (!userId || pending.current) return null;
    const owner = userId, version = generation.current;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await socialRequest<SocialCommandResult>('/api/social', owner, command);
      if (!mounted.current || version !== generation.current || actor.current !== owner) return null;
      if (result.ok !== true) throw new Error('Could not confirm this change. Refresh your player information.');
      setNotice(success); window.dispatchEvent(new Event(SOCIAL_CHANGED)); return result;
    } catch (cause) { if (mounted.current && version === generation.current && actor.current === owner) setError(socialError(cause)); return null; }
    finally { if (version === generation.current) { pending.current = false; if (mounted.current) setBusy(false); } }
  }
  return { run, busy, error, notice };
}

/** Labels for server-provided award sources; unknown award types stay generic. */
export function describeActivity(source: string): string {
  const level = /^faith3:level:(\d+)$/.exec(source);
  if (level) return `cleared Faith 3 level ${Number(level[1])}`;
  if (source.startsWith("faith3:ms:")) return "claimed a Faith 3 milestone";
  if (source.startsWith("rummy:win:")) return "won a Rummy+ game";
  if (source.startsWith("crown-court:win:")) return "won a Crown & Court game";
  if(source.startsWith("carrom:win:"))return "won a Carrom / Disc Pool match";
  if(source.startsWith("backgammon:win:"))return "won a Backgammon match";
  if (source.startsWith("farkle:win:")) return "won a Farkle game";
  if (source.startsWith("five-dice:win:")) return "won a Quintsee game";
  if (source.startsWith("dominoes:win:")) return "won a Dominoes game";
  if (source.startsWith("badge:")) return "earned a Clubhouse badge";
  return "earned Clubhouse points";
}
