import { supabase } from '@/integrations/supabase/client';

type Actor = { user: { id: string }; access_token: string };
let refreshing: Promise<Actor | null> | undefined;

/** Retry a rejected token once, sharing rotation across concurrent requests.
 * Never turn a signed-in request into a guest request or another member's write. */
export async function fetchWithSession(url: string, init: RequestInit, actor: Actor): Promise<Response> {
  const send = (token: string) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  const response = await send(actor.access_token);
  if (response.status !== 401 || !supabase || init.signal?.aborted) return response;
  const current = await supabase.auth.getSession();
  if (current.error) throw current.error;
  if (!current.data.session || current.data.session.user.id !== actor.user.id) return response;
  let session: Actor | null = current.data.session;
  if (session.access_token === actor.access_token) {
    if (!refreshing) {
      refreshing = supabase.auth.refreshSession().then(({ data, error }) => {
        if (error) throw error;
        return data.session;
      }).finally(() => { refreshing = undefined; });
    }
    session = await refreshing;
  }
  if (!session || session.user.id !== actor.user.id || init.signal?.aborted) return response;
  // Account changes can happen while refresh is in flight.
  const latest = await supabase.auth.getSession();
  if (latest.error) throw latest.error;
  if (!latest.data.session || latest.data.session.user.id !== actor.user.id) return response;
  return send(latest.data.session.access_token);
}
