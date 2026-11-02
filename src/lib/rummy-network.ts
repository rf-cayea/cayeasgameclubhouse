import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { notifyWallet } from './clubhouse';
import type { RoomCommand, RoomView } from './rummy-protocol';
import type { SpadesCommand, SpadesRoomView } from './spades-protocol';

export class GameRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function headers(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function request<T>(path: string, command?: RoomCommand | SpadesCommand, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15_000);
  const connectionError = () => new GameRequestError(controller.signal.aborted
    ? 'The request timed out. Reconnect to check your table before moving again.'
    : 'The game server is unavailable. Reconnect to check your table before moving again.', 0);
  try {
    let response: Response;
    try {
      response = await fetch(path, { method: command ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
        headers: { ...await headers(), ...(command ? { 'Content-Type': 'application/json' } : {}) },
        ...(command ? { body: JSON.stringify(command) } : {}) });
    } catch { throw connectionError(); }
    let data: unknown;
    try { data = await response.json(); } catch { if (controller.signal.aborted) throw connectionError(); throw new GameRequestError('The game server is unavailable. Start the app with npm run dev or npm start.', response.status); }
    if (!response.ok) throw new GameRequestError(typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : 'The game request failed.', response.status);
    return data as T;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

const message = (error: unknown) => typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'The game request failed.';
function savedRoom(storageKey: string) { try { const code = sessionStorage.getItem(storageKey); return code && /^[A-F0-9]{8}$/.test(code) ? code : null; } catch { return null; } }
function saveRoom(storageKey: string, code: string | null) { try { if (code) sessionStorage.setItem(storageKey, code); else sessionStorage.removeItem(storageKey); } catch { /* Private browsing may disable storage. */ } }

export const useRummyRoom = () => useCardRoom<RoomView, RoomCommand>('rummy');
export const useSpadesRoom = () => useCardRoom<SpadesRoomView, SpadesCommand>('spades');

function useCardRoom<View extends { code: string; revision: number; reward: RoomView['reward'] }, Command extends RoomCommand | SpadesCommand>(game: 'rummy' | 'spades') {
  const storageKey = `cayea-${game}-room`;
  const [code, setCode] = useState<string | null>(() => savedRoom(storageKey));
  const [room, setRoom] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [healthy, setHealthy] = useState(false);
  const [live, setLive] = useState(false);
  const mounted = useRef(false);
  const busy = useRef(false);
  const epoch = useRef(0);
  const currentCode = useRef(code);
  const observedCredits = useRef(new Set<string>());
  currentCode.current = code;
  const accept = useCallback((next: View) => {
    if (next.reward?.status === 'credited' && next.reward.source && !observedCredits.current.has(next.reward.source)) {
      observedCredits.current.add(next.reward.source);
      notifyWallet();
    }
    setRoom(previous => previous?.code === next.code && (previous.revision > next.revision ||
      (previous.revision === next.revision && previous.reward?.status === 'credited' && next.reward?.status !== 'credited')) ? previous : next);
    setHealthy(true);
  }, []);

  const refresh = useCallback(async () => {
    const selected = currentCode.current;
    if (!selected) return;
    const version = epoch.current;
    try {
      const next = await request<View>(`/api/${game}/room/${selected}`);
      if (!mounted.current || version !== epoch.current || selected !== currentCode.current) return;
      accept(next); setError('');
    } catch (cause) {
      if (!mounted.current || version !== epoch.current) return;
      setHealthy(false); setError(message(cause));
      if (cause instanceof GameRequestError && [401, 403, 404].includes(cause.status)) {
        saveRoom(storageKey, null); currentCode.current = null; setCode(null); setRoom(null);
      }
    }
  }, [accept, game, storageKey]);

  useEffect(() => {
    mounted.current = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sub = supabase?.auth.onAuthStateChange(event => {
      if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
      const timer = setTimeout(() => {
        timers.delete(timer); ++epoch.current;
        setRoom(null); setHealthy(false); void refresh();
      }, 0);
      timers.add(timer);
    });
    return () => { mounted.current = false; ++epoch.current; sub?.data.subscription.unsubscribe(); for (const timer of timers) clearTimeout(timer); };
  }, [refresh]);

  useEffect(() => {
    if (!code) { setLive(false); return; }
    const controller = new AbortController();
    let active = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    const focused = () => void refresh();
    window.addEventListener('focus', focused);
    const stream = async () => {
      while (active) {
        try {
          const response = await fetch(`/api/${game}/room/${code}/events`, { headers: await headers(), credentials: 'same-origin', signal: controller.signal });
          if (!response.ok || !response.body) throw new Error('Stream unavailable.');
          if (!active) break;
          setLive(true);
          const reader = response.body.getReader();
          const decoder = new TextDecoder(); let buffer = '';
          while (active) {
            const part = await reader.read();
            if (part.done) break;
            buffer += decoder.decode(part.value, { stream: true });
            let index: number;
            while ((index = buffer.indexOf('\n\n')) >= 0) {
              const event = buffer.slice(0, index); buffer = buffer.slice(index + 2);
              if (event.startsWith('data: ')) void refresh();
            }
          }
          await reader.cancel();
        } catch { /* Polling remains available while the push connection reconnects. */ }
        if (active) { setLive(false); await new Promise(resolve => setTimeout(resolve, 1500)); }
      }
    };
    void stream();
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener('focus', focused); };
  }, [code, game, refresh]);

  const command = useCallback(async (input: Command): Promise<boolean> => {
    if (busy.current) return false;
    const version = epoch.current;
    busy.current = true; setPending(true); setError('');
    try {
      const next = await request<View>(`/api/${game}`, input);
      if (!mounted.current || version !== epoch.current) return false;
      if (input.operation === 'leave') {
        ++epoch.current; saveRoom(storageKey, null); currentCode.current = null; setCode(null); setRoom(null); setHealthy(false);
      } else {
        if (next.code !== currentCode.current) { ++epoch.current; setRoom(null); }
        currentCode.current = next.code; saveRoom(storageKey, next.code); setCode(next.code); accept(next);
      }
      return true;
    } catch (cause) {
      if (mounted.current && version === epoch.current) { setError(message(cause)); if (cause instanceof GameRequestError && cause.status === 0) setHealthy(false); void refresh(); }
      return false;
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }, [accept, game, refresh, storageKey]);

  return { room, code, error, pending, healthy, live, command, refresh };
}
