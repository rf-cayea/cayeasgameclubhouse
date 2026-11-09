import { createClient } from '@supabase/supabase-js';
import type { Identity } from './rooms';
import { CloudRoomStore } from './cloud-rooms';
import { checkSpadesPartnershipAccess, CloudSpadesRoomStore } from './cloud-spades-rooms';
import type { D1Database } from './d1';
import { RummyError } from '../src/lib/rummy-protocol';
import { validReceipt } from './rewards';
import { validSpadesReceipt } from '../src/lib/spades-rewards';
import type { SpadesRoomView } from '../src/lib/spades-protocol';
import type { MatchReward, RewardReceipt } from '../src/lib/rummy-rewards';
import type { SpadesMatchReward, SpadesReceipt } from '../src/lib/spades-rewards';
import { assertSameOrigin, guestCookie, parseCommand, verifyMemberToken } from './api';

/** Bindings supplied by the hosting platform. */
export interface Env {
  DB?: D1Database;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  RUMMY_ORIGIN?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  CLUBHOUSE_REWARD_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
}
interface Ctx { waitUntil(promise: Promise<unknown>): void }

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

let cached: { db: D1Database; store: CloudRoomStore; spades: CloudSpadesRoomStore } | null = null;
function stores(env: Env) {
  if (!env.DB) throw new RummyError('The game database is not configured for this deployment.', 503, 'storage_unavailable');
  if (!cached || cached.db !== env.DB) cached = { db: env.DB, store: new CloudRoomStore(env.DB), spades: new CloudSpadesRoomStore(env.DB) };
  return cached;
}

const memberUrl = (env: Env) => env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const memberKey = (env: Env) => env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
/** Credits a verified match through the member project's RPC; the key never reaches the browser. */
async function creditReward(env: Env, rpc: 'credit_rummy_match' | 'credit_spades_match', result: unknown): Promise<unknown> {
  const url = memberUrl(env);
  const key = env.CLUBHOUSE_REWARD_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('reward_unconfigured');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.rpc(rpc, { _result: result }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw new Error('reward_sync_failed');
  return data;
}

function cookieValue(header: string | null, name: string): string | undefined {
  return header?.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * A short-lived push stream. The client already polls every three seconds and
 * reconnects when the stream ends, so this only shortens visible latency.
 */
function eventStream(view: { revision: number }, read: () => Promise<{ revision: number }>): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => { if (closed) return; try { controller.enqueue(encoder.encode(text)); } catch { closed = true; } };
      const finish = () => { if (closed) return; closed = true; try { controller.close(); } catch { /* Already closed. */ } };
      void (async () => {
        send(`data: ${JSON.stringify({ revision: view.revision })}\n\n`);
        for (let poll = 0; poll < 6 && !closed; poll++) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          if (closed) return;
          try {
            const next = await read();
            if (next.revision !== view.revision) { view.revision = next.revision; send(`data: ${JSON.stringify({ revision: next.revision })}\n\n`); }
          } catch { break; }
        }
        finish();
      })();
    },
    cancel() { closed = true; },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}

async function identity(request: Request, env: Env): Promise<{ actor: Identity; cookie?: string }> {
  const authorization = request.headers.get('authorization');
  if (authorization) {
    if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw new RummyError('Invalid authorization.', 401);
    return { actor: await verifyMemberToken(authorization.slice(7), { url: memberUrl(env), key: memberKey(env) }) };
  }
  const { store } = stores(env);
  const guest = await store.guest(cookieValue(request.headers.get('cookie'), 'cayea_rummy'));
  return { actor: { principal: guest.principal, jokers: false }, cookie: guest.cookie };
}

async function handleApi(request: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/rummy/health') return json(200, { app: 'cayea-rummy', version: 1 });
  if (path === '/api/spades/health') return json(200, { app: 'cayea-spades', version: 1 });

  const { store, spades } = stores(env);
  const rewards = {
    flush: async () => {
      // Each outbox leases its work in the database, so a retry after a crash cannot credit twice.
      async function deliver<M extends { match_id: string }, R>(outbox: {
        claimReward(now: number): Promise<{ result: M; lease: string; roomCode: string } | null>;
        finishReward(id: string, lease: string, receipt: R): Promise<void>;
        retryReward(id: string, lease: string, now: number): Promise<void>;
      }, rpc: 'credit_rummy_match' | 'credit_spades_match', validate: (result: M, receipt: R) => boolean) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const job = await outbox.claimReward(Date.now());
          if (!job) return;
          try {
            const receipt = await creditReward(env, rpc, job.result) as R;
            if (!validate(job.result, receipt)) throw new Error('reward_invalid_receipt');
            await outbox.finishReward(job.result.match_id, job.lease, receipt);
          } catch { await outbox.retryReward(job.result.match_id, job.lease, Date.now()); }
        }
      }
      await Promise.all([
        deliver<MatchReward, RewardReceipt>(store, 'credit_rummy_match', validReceipt),
        deliver<SpadesMatchReward, SpadesReceipt>(spades, 'credit_spades_match', validSpadesReceipt),
      ]);
    },
  };

  if (request.method === 'POST') {
    assertSameOrigin(request.headers.get('origin'), [url.origin, ...(env.RUMMY_ORIGIN ? [env.RUMMY_ORIGIN] : [])]);
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RummyError('Use JSON for game commands.', 415);
    if (Number(request.headers.get('content-length') ?? 0) > 16_384) throw new RummyError('Request too large.', 413);
  }

  const { actor, cookie } = await identity(request, env);
  const secureCookie = url.protocol === 'https:';
  const withCookie = (response: Response) => {
    if (cookie) response.headers.append('Set-Cookie', guestCookie(cookie, secureCookie));
    return response;
  };

  if ((path === '/api/rummy/session' || path === '/api/spades/session') && request.method === 'GET') {
    return withCookie(json(200, { member: actor.principal.startsWith('member:'), jokers: actor.jokers }));
  }

  const game = path.startsWith('/api/spades') ? 'spades' : 'rummy';
  const gameStore = game === 'spades' ? spades : store;
  const match = /^\/api\/(?:rummy|spades)\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
  if (match && request.method === 'GET') {
    const code = match[1]!.toUpperCase();
    const view = await gameStore.get(code, actor.principal);
    if (game === 'spades') checkSpadesPartnershipAccess(actor, (view as SpadesRoomView).options.variant);
    ctx.waitUntil(rewards.flush().catch(() => { /* Rewards retry on the next request. */ }));
    if (match[2]) {
      const read = async () => await gameStore.get(code, actor.principal);
      return withCookie(eventStream(view, read));
    }
    return withCookie(json(200, view));
  }

  if ((path === '/api/rummy' || path === '/api/spades') && request.method === 'POST') {
    const text = await request.text();
    if (text.length > 16_384) throw new RummyError('Request too large.', 413);
    const result = await gameStore.command(actor, parseCommand(text));
    ctx.waitUntil(rewards.flush().catch(() => { /* Rewards retry on the next request. */ }));
    return withCookie(json(200, result.view));
  }

  throw new RummyError('Endpoint not found.', 404);
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/clubhouse-config.js') {
      const supabaseUrl = memberUrl(env);
      const supabaseKey = memberKey(env);
      if (supabaseUrl && supabaseKey) {
        return new Response(`window.__CLUBHOUSE_CONFIG__ = ${JSON.stringify({ supabaseUrl, supabaseKey })};\n`, {
          headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        });
      }
    }
    if (!url.pathname.startsWith('/api/')) {
      if (!env.ASSETS) return new Response('Not found', { status: 404 });
      return env.ASSETS.fetch(request);
    }
    try {
      return await handleApi(request, env, ctx);
    } catch (error) {
      if (error instanceof RummyError) return json(error.status, { error: error.message, code: error.code });
      console.error('Unexpected game service error.', error);
      return json(500, { error: 'The game service could not complete that request. Your previous table state is preserved.', code: 'server_error' });
    }
  },
};
