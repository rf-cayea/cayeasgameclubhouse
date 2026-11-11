import {useComputerTurns} from './use-computer-turns';
import type {ComputerPlayback} from './computer-turns';
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

export async function gameRequest<T>(path: string, command?: unknown, signal?: AbortSignal): Promise<T> {
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
      response = await fetch(path, { method: command !== undefined ? 'POST' : 'GET', credentials: 'same-origin', signal: controller.signal,
        headers: { ...await headers(), ...(command !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(command !== undefined ? { body: JSON.stringify(command) } : {}) });
    } catch { throw connectionError(); }
    let data: unknown;
    try { data = await response.json(); } catch { if (controller.signal.aborted) throw connectionError(); throw new GameRequestError('The game server is unavailable. Reconnect to check your table before moving again.', response.status); }
    if (!response.ok) throw new GameRequestError(typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : 'The game request failed.', response.status);
    return data as T;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

const message = (error: unknown) => typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : 'The game request failed.';
function savedRoom(storageKey: string) { try { const code = sessionStorage.getItem(storageKey); return code && /^[A-F0-9]{8}$/.test(code) ? code : null; } catch { return null; } }
function saveRoom(storageKey: string, code: string | null) { try { if (code) sessionStorage.setItem(storageKey, code); else sessionStorage.removeItem(storageKey); } catch { /* Private browsing may disable storage. */ } }

export const useRummyRoom = () => useCardRoom<RoomView, RoomCommand>('rummy');
export const useSpadesRoom = () => useCardRoom<SpadesRoomView, SpadesCommand>('spades');

function useCardRoom<View extends { code: string; revision: number; reward: RoomView['reward'];playback?:ComputerPlayback<View> }, Command extends RoomCommand | SpadesCommand>(game: 'rummy' | 'spades') {
  const storageKey = `cayea-${game}-room`;
  const [code, setCode] = useState<string | null>(() => savedRoom(storageKey));
  const [room, setRoom] = useState<View | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [healthy, setHealthy] = useState(false);
  const [live, setLive] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [transportEpoch, setTransportEpoch] = useState(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const epoch = useRef(0);
  const currentCode = useRef(code);
  const authUser = useRef<string | null | undefined>(undefined);
  const readRequest = useRef<{ code: string; version: number; controller: AbortController; promise: Promise<void> } | null>(null);
  const commandRequest = useRef<AbortController | null>(null), commandSequence = useRef(0);
  const observedCredits = useRef(new Set<string>());
  currentCode.current = code;
  const accept = useCallback((next: View) => {
    setRoom(previous => previous?.code === next.code && (previous.revision > next.revision ||
      (previous.revision === next.revision && previous.reward?.status === 'credited' && next.reward?.status !== 'credited')) ? previous : next);
    setHealthy(true);
    setLastSync(Date.now());
  }, []);

  const refresh = useCallback(async () => {
    const selected = currentCode.current;
    if (!selected) return;
    const version = epoch.current;
    const existing = readRequest.current;
    if (existing?.code === selected && existing.version === version) return existing.promise;
    existing?.controller.abort();
    const controller = new AbortController();
    const run = async () => {
      try {
        const next = await gameRequest<View>(`/api/${game}/room/${selected}`, undefined, controller.signal);
        if (!mounted.current || version !== epoch.current || selected !== currentCode.current) return;
        accept(next); setError('');
      } catch (cause) {
        if (!mounted.current || version !== epoch.current || selected !== currentCode.current || controller.signal.aborted) return;
        setHealthy(false); setError(message(cause));
        if (cause instanceof GameRequestError && [401, 403, 404].includes(cause.status)) {
          saveRoom(storageKey, null); currentCode.current = null; setCode(null); setRoom(null); setLive(false); setLastSync(null);
        }
      } finally {
        if (readRequest.current?.controller === controller) readRequest.current = null;
      }
    };
    const promise = run();
    readRequest.current = { code: selected, version, controller, promise };
    return promise;
  }, [accept, game, storageKey]);

  useEffect(() => {
    mounted.current = true;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const sub = supabase?.auth.onAuthStateChange((event, session) => {
      if (!['INITIAL_SESSION', 'SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED', 'TOKEN_REFRESHED'].includes(event)) return;
      const nextUser = session?.user.id ?? null, previousUser = authUser.current;
      authUser.current = nextUser;
      if (event === 'INITIAL_SESSION') return;
      const changed = previousUser !== undefined && previousUser !== nextUser || event === 'SIGNED_OUT' && previousUser !== null;
      if (changed) {
        // Clear private state before another account can render or an old
        // request can complete. Same-account SIGNED_IN events are common on
        // browser focus and must not discard an in-flight move response.
        ++epoch.current; ++commandSequence.current;
        readRequest.current?.controller.abort(); readRequest.current = null;
        commandRequest.current?.abort(); commandRequest.current = null;
        busy.current = false; setPending(false); observedCredits.current.clear();
        setRoom(null); setHealthy(false); setLive(false); setLastSync(null); setError('');
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        // Reopen push transport with current credentials, outside Supabase's
        // auth lock. Polling remains available while the stream reconnects.
        setTransportEpoch(value => value + 1); void refresh();
      }, 0);
      timers.add(timer);
    });
    return () => {
      mounted.current = false; ++epoch.current; ++commandSequence.current;
      readRequest.current?.controller.abort(); readRequest.current = null;
      commandRequest.current?.abort(); commandRequest.current = null;
      busy.current = false;
      sub?.data.subscription.unsubscribe(); for (const timer of timers) clearTimeout(timer);
    };
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
          if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw new Error('Stream unavailable.');
          if (!active) break;
          setLive(true);
          const reader = response.body.getReader();
          const decoder = new TextDecoder(); let buffer = '';
          while (active) {
            const part = await reader.read();
            if (part.done) break;
            buffer = (buffer + decoder.decode(part.value, { stream: true })).replace(/\r\n/g, '\n');
            if (buffer.length > 65536) throw new Error('Invalid stream frame.');
            let index: number;
            while ((index = buffer.indexOf('\n\n')) >= 0) {
              const event = buffer.slice(0, index); buffer = buffer.slice(index + 2);
              if (event.split('\n').some(line => line.startsWith('data:'))) void refresh();
            }
          }
          await reader.cancel();
        } catch { /* Polling remains available while the push connection reconnects. */ }
        if (active) {
          setLive(false);
          await new Promise<void>(resolve => {
            const finished = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finished); resolve(); };
            const timer = setTimeout(finished, 1500);
            controller.signal.addEventListener('abort', finished, { once: true });
            if (controller.signal.aborted) finished();
          });
        }
      }
    };
    void stream();
    return () => { active = false; controller.abort(); clearInterval(timer); window.removeEventListener('focus', focused); };
  }, [code, game, refresh, transportEpoch]);

  const command = useCallback(async (input: Command): Promise<boolean> => {
    if (busy.current) return false;
    if(currentCode.current&&(input.operation==='create'||input.operation==='join'&&input.code!==currentCode.current)){
      setError('Leave your saved table before joining or creating another match.');return false;
    }
    const version = epoch.current;
    const sequence = ++commandSequence.current, controller = new AbortController();
    commandRequest.current = controller;
    busy.current = true; setPending(true); setError('');
    try {
      const next = await gameRequest<View>(`/api/${game}`, input, controller.signal);
      if (!mounted.current || version !== epoch.current) return false;
      if (input.operation === 'leave') {
        ++epoch.current; readRequest.current?.controller.abort(); readRequest.current = null;
        saveRoom(storageKey, null); currentCode.current = null; setCode(null); setRoom(null); setHealthy(false); setLive(false); setLastSync(null);
      } else {
        if (next.code !== currentCode.current) { ++epoch.current; setRoom(null); }
        currentCode.current = next.code; saveRoom(storageKey, next.code); setCode(next.code); accept(next);
      }
      return true;
    } catch (cause) {
      if (mounted.current && version === epoch.current) { setError(message(cause)); if (cause instanceof GameRequestError && cause.status === 0) setHealthy(false); void refresh(); }
      return false;
    } finally {
      if (sequence === commandSequence.current) {
        commandRequest.current = null; busy.current = false; if (mounted.current) setPending(false);
      }
    }
  }, [accept, game, refresh, storageKey]);

  const paced=useComputerTurns<View>(room);
  useEffect(()=>{const reward=paced.room?.reward;if(reward?.status==='credited'&&reward.source&&!observedCredits.current.has(reward.source)){observedCredits.current.add(reward.source);notifyWallet();}},[paced.room?.reward?.source,paced.room?.reward?.status]);
  return { room:paced.room, code, error, pending:pending||paced.pacing, pacing:paced.pacing, healthy, live, lastSync, command, refresh };
}
