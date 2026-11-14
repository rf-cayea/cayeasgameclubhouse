import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchWithSession } from './auth-fetch';
import {
  classicAPI, classicRoomCode, type ClassicAction, type ClassicKind, type ClassicRequest,
  type ClassicRoomView, type ClassicTableSummary,
} from './classic-card-protocol';

class TableError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'The table connection was interrupted.';
function saved(key: string, value?: string | null) {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch { /* Play can continue without session storage. */ }
  return null;
}

export function useClassicCardRooms(kind: ClassicKind, userId: string | null) {
  const path = classicAPI(kind), scope = `clubhouse:${kind}:${userId ?? 'guest'}`;
  const [code, setCode] = useState(() => {
    const previous = saved(scope);
    return classicRoomCode(previous) ? previous : null;
  });
  const [room, setRoom] = useState<ClassicRoomView | null>(null);
  const [tables, setTables] = useState<ClassicTableSummary[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState<ClassicRequest | null>(() => {
    try { return JSON.parse(saved(scope + ':action') ?? 'null') as ClassicRequest | null; }
    catch { return null; }
  });
  const busy = useRef(false);
  const mounted = useRef(false);
  const currentCode = useRef(code);
  const writes = useRef<AbortController | null>(null);
  const request = useCallback(async <T,>(url: string, action?: ClassicRequest, signal?: AbortSignal): Promise<T> => {
    const headers: Record<string, string> = {};
    let actor;
    if (supabase) {
      const { data, error } = await supabase.auth.getSession();
      if (error || (data.session?.user.id ?? null) !== userId) throw new TableError('Your account changed. Reopen the lobby.', 401);
      if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
      actor = data.session;
    }
    const timeout = AbortSignal.timeout(12000);
    if (action) headers['Content-Type'] = 'application/json';
    const init: RequestInit = {
      method: action ? 'POST' : 'GET', body: action ? JSON.stringify(action) : undefined,
      headers, credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    };
    const response = actor ? await fetchWithSession(url, init, actor) : await fetch(url, init);
    const body = await response.json();
    if (!response.ok) throw new TableError(body?.error || 'The table request failed.', response.status);
    return body as T;
  }, [userId]);
  const select = useCallback((value: ClassicRoomView | null) => {
    currentCode.current = value?.code ?? null;
    saved(scope, currentCode.current);
    setCode(currentCode.current);
    setRoom(previous => previous && previous.code === value?.code && previous.revision > value.revision ? previous : value);
  }, [scope]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; writes.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    async function poll() {
      try {
        if (code) {
          const value = await request<ClassicRoomView>(`${path}/${code}`, undefined, controller.signal);
          if (!controller.signal.aborted && currentCode.current === code) select(value);
        } else {
          const value = await request<ClassicTableSummary[]>(path, undefined, controller.signal);
          if (!controller.signal.aborted) setTables(value);
        }
        if (!controller.signal.aborted) { setConnected(true); setConnection(''); }
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (code && cause instanceof TableError && [403, 404].includes(cause.status) && currentCode.current === code) {
          select(null);
          setError(errorText(cause));
        } else {
          setConnected(false);
          setConnection(errorText(cause));
        }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(poll, code ? 900 : 4200);
      }
    }
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [path, code, request, select]);

  async function send(action: ClassicAction, previous?: ClassicRequest) {
    if (busy.current || (!previous && (!connected || retry))) return false;
    busy.current = true;
    setPending(true);
    setError('');
    const controller = new AbortController();
    writes.current = controller;
    const payload = previous ?? { ...action, requestId: crypto.randomUUID() };
    saved(scope + ':action', JSON.stringify(payload));
    try {
      const value = await request<ClassicRoomView | null>(path, payload, controller.signal);
      if (!mounted.current || controller.signal.aborted) return false;
      saved(scope + ':action', null);
      setRetry(null);
      select(value);
      return true;
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) {
        setError(errorText(cause));
        if (!(cause instanceof TableError) || cause.status >= 500) setRetry(payload);
        else { saved(scope + ':action', null); setRetry(null); }
      }
      return false;
    } finally {
      busy.current = false;
      if (mounted.current && !controller.signal.aborted) setPending(false);
    }
  }

  return { room, code, tables, connected, error, connection, pending, retry, send };
}
