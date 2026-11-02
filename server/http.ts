import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { RoomStore, type Identity } from './rooms';
import { RummyError } from '../src/lib/rummy-protocol';
import { deliveryWorker, rewardWorker, supabaseRewardWriter, type RewardWriter } from './rewards';
import { checkSpadesPartnershipAccess, SpadesRoomStore } from './spades-rooms';
import type { SpadesRoomView } from '../src/lib/spades-protocol';
import { supabaseSpadesWriter, type SpadesRewardWriter } from './spades-rewards';
import { validSpadesReceipt } from '../src/lib/spades-rewards';

interface ServerOptions { store: RoomStore; dist?: string; origin?: string; secureCookie?: boolean; verifyMember?: (token: string) => Promise<Identity>; rewardWriter?: RewardWriter; spadesRewardWriter?: SpadesRewardWriter }

async function verifyMember(token: string): Promise<Identity> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new RummyError('Member verification is not configured on the game server. Sign out to play as a guest, or configure the server’s Supabase project.', 503, 'auth_unavailable');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new RummyError('Your sign-in expired. Sign in again.', 401, 'unauthorized');
  const wallet = await client.from('wallets').select('owned').eq('user_id', data.user.id).maybeSingle();
  if (wallet.error) throw new RummyError('Could not verify Joker ownership. Please try again.', 503, 'auth_unavailable');
  return { principal: `member:${data.user.id}`, jokers: Array.isArray(wallet.data?.owned) && wallet.data.owned.includes('rummy-jokers'), owned: Array.isArray(wallet.data?.owned) ? wallet.data.owned : [] };
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage) {
  let text = '';
  for await (const chunk of request) {
    text += chunk.toString();
    if (Buffer.byteLength(text) > 16_384) throw new RummyError('Request too large.', 413);
  }
  try { return JSON.parse(text); } catch { throw new RummyError('Send a valid JSON command.'); }
}

export function createGameServer(options: ServerOptions) {
  const spades = new SpadesRoomStore(options.store.db);
  const streams = new Map<string, Set<{ response: ServerResponse; principal: string }>>();
  const limits = new Map<string, { start: number; count: number }>();
  const identity = async (request: IncomingMessage, response: ServerResponse): Promise<Identity> => {
    const authorization = request.headers.authorization;
    if (authorization) {
      if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw new RummyError('Invalid authorization.', 401);
      return (options.verifyMember ?? verifyMember)(authorization.slice(7));
    }
    const cookie = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('cayea_rummy='))?.slice('cayea_rummy='.length);
    const guest = options.store.guest(cookie);
    if (guest.cookie) response.setHeader('Set-Cookie', `cayea_rummy=${guest.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${options.secureCookie ? '; Secure' : ''}`);
    return { principal: guest.principal, jokers: false };
  };
  const publish = (game: 'rummy' | 'spades', code: string, revision?: number) => {
    for (const stream of streams.get(`${game}:${code}`) ?? []) {
      try { const view = (game === 'spades' ? spades : options.store).get(code, stream.principal); stream.response.write(`data: ${JSON.stringify({ revision: revision ?? view.revision })}\n\n`); }
      catch { stream.response.end(); }
    }
  };
  const rummyRewards = rewardWorker(options.store, options.rewardWriter ?? supabaseRewardWriter(), code => publish('rummy', code));
  const spadesRewards = deliveryWorker(spades, options.spadesRewardWriter ?? supabaseSpadesWriter(), validSpadesReceipt, code => publish('spades', code));
  const rewards = { flush: async () => { await Promise.all([rummyRewards.flush(), spadesRewards.flush()]); }, stop: async () => { await Promise.all([rummyRewards.stop(), spadesRewards.stop()]); } };
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (path === '/api/rummy/health') { json(response, 200, { app: 'cayea-rummy', version: 1 }); return; }
      if (path === '/api/spades/health') { json(response, 200, { app: 'cayea-spades', version: 1 }); return; }
      if (path.startsWith('/api/')) {
        const key = `${request.socket.remoteAddress}:${request.method === 'POST' ? 'write' : 'read'}`;
        const now = Date.now();
        const limit = limits.get(key);
        if (!limit || now - limit.start > 60_000) limits.set(key, { start: now, count: 1 });
        else if (++limit.count > (request.method === 'POST' ? 180 : 600)) throw new RummyError('Too many requests. Wait a moment and try again.', 429, 'rate_limited');
        if (limits.size > 10_000) for (const [key, value] of limits) if (now - value.start > 60_000) limits.delete(key);
        if (request.method === 'POST') {
          const origin = request.headers.origin;
          if (origin && origin !== (options.origin ?? `http://${request.headers.host}`) && origin !== (!options.origin ? `https://${request.headers.host}` : options.origin)) throw new RummyError('Cross-site game commands are not allowed.', 403);
          if (!request.headers['content-type']?.startsWith('application/json')) throw new RummyError('Use JSON for game commands.', 415);
          if (Number(request.headers['content-length'] ?? 0) > 16_384) { request.resume(); throw new RummyError('Request too large.', 413); }
        }
        const actor = await identity(request, response);
        if ((path === '/api/rummy/session' || path === '/api/spades/session') && request.method === 'GET') { json(response, 200, { member: actor.principal.startsWith('member:'), jokers: actor.jokers }); return; }
        const game = path.startsWith('/api/spades') ? 'spades' : 'rummy';
        const store = game === 'spades' ? spades : options.store;
        const match = /^\/api\/(?:rummy|spades)\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
        if (match && request.method === 'GET') {
          const code = match[1]!.toUpperCase();
          const view = store.get(code, actor.principal);
          if (game === 'spades') checkSpadesPartnershipAccess(actor, (view as SpadesRoomView).options.variant);
          void rewards.flush();
          if (match[2]) {
            response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
            response.write(`data: ${JSON.stringify({ revision: view.revision })}\n\n`);
            const stream = { response, principal: actor.principal };
            const streamKey = `${game}:${code}`;
            if (!streams.has(streamKey)) streams.set(streamKey, new Set());
            streams.get(streamKey)!.add(stream);
            const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
            response.on('close', () => { clearInterval(heartbeat); const set = streams.get(streamKey); set?.delete(stream); if (!set?.size) streams.delete(streamKey); });
          } else json(response, 200, view);
          return;
        }
        if ((path === '/api/rummy' || path === '/api/spades') && request.method === 'POST') {
          const result = store.command(actor, await body(request));
          if (result.changed) publish(game, result.view.code, result.view.revision);
          void rewards.flush();
          json(response, 200, result.view);
          return;
        }
        throw new RummyError('Endpoint not found.', 404);
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') throw new RummyError('Method not allowed.', 405);
      if (!options.dist) throw new RummyError('Use the Vite development server for the app.', 404);
      const root = resolve(options.dist);
      const requested = resolve(root, '.' + decodeURIComponent(path));
      if (requested !== root && !requested.startsWith(root + sep)) throw new RummyError('Not found.', 404);
      let file = requested;
      try { if (!(await stat(file)).isFile()) file = resolve(root, 'index.html'); }
      catch { if (extname(path) && !request.headers.accept?.includes('text/html')) throw new RummyError('Not found.', 404); file = resolve(root, 'index.html'); }
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
      const content = await readFile(file);
      response.writeHead(200, { 'Content-Type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': extname(file) === '.html' ? 'no-store' : 'public, max-age=3600' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      if (error instanceof RummyError) json(response, error.status, { error: error.message, code: error.code });
      else { console.error('Unexpected game server error.'); json(response, 500, { error: 'The game service could not complete that request. Your previous table state is preserved.', code: 'server_error' }); }
    }
  });
  server.on('close', () => { void rewards.stop(); for (const set of streams.values()) for (const stream of set) stream.response.end(); });
  return { server, rewards, spades, closeStreams: () => { for (const set of streams.values()) for (const stream of set) stream.response.end(); } };
}
