import {CarromRoomStore} from '../server/carrom-rooms';
import {CollectiblesStore} from '../server/collectibles';
import {BackgammonRoomStore} from '../server/backgammon-rooms';
import { CrownCourtRoomStore } from '../server/crown-court-rooms';
import { CrownChanceRoomStore } from '../server/crown-chance-rooms';
import { FarkleRoomStore } from '../server/farkle-rooms';
import { MatchmakingStore, matchGame } from '../server/matchmaking';
import { DominoRoomStore } from '../server/dominoes-rooms';
import { FiveDiceRoomStore } from '../server/five-dice-rooms';
import { createClient } from '@supabase/supabase-js';
import { CloudRoomStore } from '../server/cloud-rooms';
import { CloudSpadesRoomStore } from '../server/cloud-spades-rooms';
import { checkSpadesPartnershipAccess } from '../server/cloud-spades-rooms';
import { RummyError } from '../src/lib/rummy-protocol';
import { validReceipt } from '../server/rewards';
import { validSpadesReceipt } from '../src/lib/spades-rewards';
import type { Identity } from '../server/rooms';
import type { MatchReward, RewardReceipt } from '../src/lib/rummy-rewards';
import type { SpadesMatchReward, SpadesReceipt } from '../src/lib/spades-rewards';
import assets from 'clubhouse:assets';
import { SocialStore } from '../server/social';
import { namedGameCommand, mirrorLoungeName, seedLoungeName } from '../server/social-members';
import { EconomyStore } from '../server/economy';
import { canonicalMemberIdentity } from '../server/economy-members';
import { ECONOMY_CATALOG } from '../src/lib/economy-protocol';
import { settleCashAllowances } from '../server/economy-allowances';
import { PuzzleRewardStore } from '../server/puzzle-rewards';

export interface Environment {
  DB: any;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  CLUBHOUSE_REWARD_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
}
interface Context { waitUntil(promise: Promise<unknown>): void }
const publicConfig = (env: Environment) => ({ supabaseUrl: env.SUPABASE_URL || '', supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '' });
function json(data: unknown, status = 200, headers = new Headers()) {
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(data), { status, headers });
}
async function identify(request: Request, env: Environment, store: CloudRoomStore, headers: Headers, economy: EconomyStore, social: SocialStore): Promise<Identity> {
  const authorization = request.headers.get('authorization');
  if (authorization) {
    if (!authorization.startsWith('Bearer ') || authorization.length > 8192) throw new RummyError('Invalid authorization.', 401);
    const { supabaseUrl, supabaseKey } = publicConfig(env);
    if (!supabaseUrl || !supabaseKey) throw new RummyError('Member verification is not configured. Sign out to play as a guest.', 503, 'auth_unavailable');
    const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user) throw new RummyError('Your sign-in expired. Sign in again.', 401, 'unauthorized');
    const permissions = await client.rpc('lounge_permissions');
    if (permissions.error) throw new RummyError('Could not verify player profile. Please try again.', 503, 'auth_unavailable');
    const { identity: actor, firstVisit } = await canonicalMemberIdentity(economy, client, data.user.id, permissions.data?.name_flagged === true, data.user.created_at);
    if (firstVisit) await seedLoungeName(social, client, actor, data.user.id);
    return actor;
  }
  const token = request.headers.get('cookie')?.split(';').map(item => item.trim()).find(item => item.startsWith('cayea_rummy='))?.slice(12);
  const guest = await store.guest(token);
  if (guest.cookie) headers.set('Set-Cookie', `cayea_rummy=${guest.cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`);
  return { principal: guest.principal, jokers: false };
}
async function readCommand(request: Request, maxBytes = 16384): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new RummyError('Use JSON for game commands.', 415);
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new RummyError('Request too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RummyError('Send a valid JSON command.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RummyError('Request too large.', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RummyError('Send a valid JSON command.'); }
}

async function flushRewards(economy: EconomyStore, rummy: CloudRoomStore, spades: CloudSpadesRoomStore) {
  async function deliver<M extends { match_id: string }, R>(store: {
    claimReward(now: number): Promise<{ result: M; lease: string; roomCode: string } | null>;
    finishReward(id: string, lease: string, receipt: R): Promise<void>;
    retryReward(id: string, lease: string, now: number): Promise<void>;
  }, credit: (result: M) => Promise<R>, validate: (result: M, receipt: R) => boolean) {
    for (let n = 0; n < 2; n++) {
      const job = await store.claimReward(Date.now()); if (!job) return;
      try {
        const data = await credit(job.result);
        if (!validate(job.result, data)) throw new Error('reward_sync_failed');
        await store.finishReward(job.result.match_id, job.lease, data as R);
      } catch { await store.retryReward(job.result.match_id, job.lease, Date.now()); }
    }
  }
  await Promise.all([
    deliver<MatchReward, RewardReceipt>(rummy, result => economy.claimRummyReward(result), validReceipt),
    deliver<SpadesMatchReward, SpadesReceipt>(spades, result => economy.claimSpadesReward(result), validSpadesReceipt),
  ]);
}

function events(request: Request, initial: { revision: number }, read: () => Promise<{ revision: number }>, headers: Headers) {
  const encoder = new TextEncoder(); let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false; let close = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const started = Date.now(); let revision = initial.revision;
      close = () => { if (done) return; done = true; clearTimeout(timer); request.signal.removeEventListener('abort', close); try { controller.close(); } catch {} };
      request.signal.addEventListener('abort', close, { once: true });
      if (request.signal.aborted) { close(); return; }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ revision })}\n\n`));
      const tick = async () => {
        if (done) return;
        try {
          const next = await read(); if (done) return;
          // Notify even when only a reward receipt (rather than room revision) changed.
          revision = next.revision;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ revision })}\n\n`));
          if (Date.now() - started >= 25000) close();
          else timer = setTimeout(tick, 3000);
        } catch { close(); }
      };
      timer = setTimeout(tick, 3000);
    },
    cancel() { close(); },
  });
  headers.set('Content-Type', 'text/event-stream'); headers.set('Cache-Control', 'no-cache, no-transform');
  return new Response(stream, { headers });
}
async function api(request: Request, env: Environment, context: Context) {
  const path = new URL(request.url).pathname;
  const headers = new Headers();
  try {
    if (!['GET', 'POST'].includes(request.method)) throw new RummyError('Method not allowed.', 405);
    if (!/^\/api\/(rummy|spades|five-dice|farkle|backgammon|carrom|crown-court|crown-chance|dominoes|social|economy|collectibles|puzzles)(?:\/|$)/.test(path)) throw new RummyError('Endpoint not found.', 404);
    const game = path.startsWith('/api/carrom')?'carrom':path.startsWith('/api/backgammon')?'backgammon':path.startsWith('/api/crown-court') ? 'crown-court' : path.startsWith('/api/farkle') ? 'farkle' : path.startsWith('/api/dominoes') ? 'dominoes' : path.startsWith('/api/five-dice') ? 'five-dice' : path.startsWith('/api/spades') ? 'spades' : 'rummy';
    if (path === '/api/crown-chance/health') return json({ app: 'clubhouse-crown-chance', version: 1 }, 200, headers);
    if (path === `/api/${game}/health`) return json({ app: `cayea-${game}`, version: 1 }, 200, headers);
    if (!env.DB) throw new RummyError('The game database is not connected yet.', 503);
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) throw new RummyError('Cross-site game commands are not allowed.', 403);
    }
    const bucket = Math.floor(Date.now() / 60000);
    const remote = request.headers.get('cf-connecting-ip') || request.headers.get('oai-authenticated-user-id') || 'unknown';
    const key = `${remote}:${request.method === 'POST' ? 'write' : 'read'}`;
    const limit = await env.DB.prepare(`INSERT INTO api_limits(identity,bucket,count) VALUES(?,?,1) ON CONFLICT(identity) DO UPDATE SET count=CASE WHEN bucket=excluded.bucket THEN count+1 ELSE 1 END,bucket=excluded.bucket RETURNING count`).bind(key, bucket).first();
    if (Number(limit?.count) > (request.method === 'POST' ? 180 : 600)) throw new RummyError('Too many requests. Wait a moment and try again.', 429, 'rate_limited');
    if (Math.random() < .01) context.waitUntil(env.DB.prepare('DELETE FROM api_limits WHERE bucket<?').bind(bucket - 60).run().catch(() => {}));
    const rummy = new CloudRoomStore(env.DB), spades = new CloudSpadesRoomStore(env.DB);
    if (path === '/api/economy/catalog' && request.method === 'GET') return json({ items: ECONOMY_CATALOG }, 200, headers);
    const economy = new EconomyStore(env.DB), puzzles = new PuzzleRewardStore(env.DB, economy);
    const social = new SocialStore(env.DB);
    const actor = await identify(request, env, rummy, headers, economy, social);
    if(path==='/api/collectibles'){const collection=new CollectiblesStore(env.DB);if(request.method==='GET')return json(await collection.read(actor),200,headers);const receipt=await collection.command(actor,await readCommand(request));return json({album:await collection.read(actor),wallet:await economy.wallet(actor),receipt},200,headers);}
    if (path === '/api/economy' || path.startsWith('/api/economy/')) {
      if (path === '/api/economy') {
        if (request.method === 'GET') return json(await economy.read(actor), 200, headers);
        return json(await economy.command(actor, await readCommand(request)), 200, headers);
      }
      const player = /^\/api\/economy\/players\/([a-f0-9-]{36})$/i.exec(path);
      if (player && request.method === 'GET') return json(await economy.publicProfile(actor, player[1]), 200, headers);
      throw new RummyError('Endpoint not found.', 404);
    }
    if (path === '/api/puzzles') {
      if (request.method !== 'POST') throw new RummyError('Method not allowed.', 405);
      return json(await puzzles.command(actor, await readCommand(request, 73728)), 200, headers);
    }
    if (path === '/api/social' || path.startsWith('/api/social/')) {
      if (request.method === 'GET') return json(await social.read(actor, new URL(request.url)), 200, headers);
      if (path !== '/api/social') throw new RummyError('Endpoint not found.', 404);
      const result = await social.command(actor, await readCommand(request));
      if (result.profile) context.waitUntil(mirrorLoungeName(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, actor, result.profile.gamerName));
      return json(result, 200, headers);
    }
    const discovery=new MatchmakingStore(env.DB),matchmaking=matchGame(path);
    if(matchmaking){
      if(request.method==='GET')return json(await discovery.list(matchmaking,actor),200,headers);
      const result=await discovery.command(matchmaking,actor,await readCommand(request),async command=>{
        const named=await namedGameCommand(social,actor,command);
        if(matchmaking==='dominoes')return new DominoRoomStore(env.DB).command(actor,named);
        if(matchmaking==='crown-court')return new CrownCourtRoomStore(env.DB).command(actor,named);
        if(matchmaking==='carrom')return new CarromRoomStore(env.DB).command(actor,named);
        if(matchmaking==='backgammon')return new BackgammonRoomStore(env.DB).command(actor,named);
        if(matchmaking==='farkle')return new FarkleRoomStore(env.DB).command(actor,named);
        if(matchmaking==='five-dice')return new FiveDiceRoomStore(env.DB).command(actor,named);
        return (await (matchmaking==='spades'?spades:rummy).command(actor,named)).view;
      });
      return json(result,200,headers);
    }
    if (path === '/api/dominoes/session' && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), dominoes: true }, 200, headers);
    const domino = new DominoRoomStore(env.DB), dominoMatch = /^\/api\/dominoes\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const readDomino = async (code: string) => {
      let view = await domino.get(code, actor.principal, actor.owned);
      if (view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); view = await domino.get(code, actor.principal, actor.owned); }
      return view;
    };
    if (dominoMatch && request.method === 'GET') {
      const code = dominoMatch[1].toUpperCase(), view = await readDomino(code);
      return dominoMatch[2] ? events(request, view, () => readDomino(code), headers) : json(view, 200, headers);
    }
    if (path === '/api/dominoes' && request.method === 'POST') {
      const input=await readCommand(request);await discovery.checkPublicJoin('dominoes',actor,input);
      const result = await domino.command(actor, await namedGameCommand(social, actor, input));
      if (result.view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); result.view = await domino.get(result.view.code, actor.principal, actor.owned); }
      return json(result, 200, headers);
    }
    if (path === '/api/crown-court/session' && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), crownCourt: true }, 200, headers);
    const crownCourt = new CrownCourtRoomStore(env.DB), crownCourtMatch = /^\/api\/crown-court\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const readCrownCourt = async (code: string) => {
      let view = await crownCourt.get(code, actor.principal, actor.owned);
      if (view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); view = await crownCourt.get(code, actor.principal, actor.owned); }
      return view;
    };
    if (crownCourtMatch && request.method === 'GET') {
      const code = crownCourtMatch[1].toUpperCase(), view = await readCrownCourt(code);
      return crownCourtMatch[2] ? events(request, view, () => readCrownCourt(code), headers) : json(view, 200, headers);
    }
    if (path === '/api/crown-court' && request.method === 'POST') {
      const input=await readCommand(request);await discovery.checkPublicJoin('crown-court',actor,input);
      const result = await crownCourt.command(actor, await namedGameCommand(social, actor, input));
      if (result.view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); result.view = await crownCourt.get(result.view.code, actor.principal, actor.owned); }
      return json(result, 200, headers);
    }
    if (path === '/api/crown-chance/session' && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), crownChance: true }, 200, headers);
    const crownChance = new CrownChanceRoomStore(env.DB), crownChanceMatch = /^\/api\/crown-chance\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const readCrownChance = async (code: string) => {
      let view = await crownChance.get(code, actor.principal, actor.owned);
      if (view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); view = await crownChance.get(code, actor.principal, actor.owned); }
      return view;
    };
    if (crownChanceMatch && request.method === 'GET') {
      const code = crownChanceMatch[1].toUpperCase(), view = await readCrownChance(code);
      return crownChanceMatch[2] ? events(request, view, () => readCrownChance(code), headers) : json(view, 200, headers);
    }
    if (path === '/api/crown-chance' && request.method === 'POST') {
      const input=await readCommand(request);
      const result = await crownChance.command(actor, await namedGameCommand(social, actor, input));
      if (result.view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); result.view = await crownChance.get(result.view.code, actor.principal, actor.owned); }
      return json(result, 200, headers);
    }
    if (path === '/api/carrom/session' && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), carrom: true }, 200, headers);
    const carrom = new CarromRoomStore(env.DB), carromMatch = /^\/api\/carrom\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const readCarrom = async (code: string) => {
      let view = await carrom.get(code, actor.principal, actor.owned);
      if (view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); view = await carrom.get(code, actor.principal, actor.owned); }
      return view;
    };
    if (carromMatch && request.method === 'GET') {
      const code = carromMatch[1].toUpperCase(), view = await readCarrom(code);
      return carromMatch[2] ? events(request, view, () => readCarrom(code), headers) : json(view, 200, headers);
    }
    if (path === '/api/carrom' && request.method === 'POST') {
      const input=await readCommand(request);await discovery.checkPublicJoin('carrom',actor,input);
      const result = await carrom.command(actor, await namedGameCommand(social, actor, input));
      if (result.view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); result.view = await carrom.get(result.view.code, actor.principal, actor.owned); }
      return json(result, 200, headers);
    }
    if (path === '/api/backgammon/session' && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), backgammon: true }, 200, headers);
    const backgammon = new BackgammonRoomStore(env.DB), backgammonMatch = /^\/api\/backgammon\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const readBackgammon = async (code: string) => {
      let view = await backgammon.get(code, actor.principal, actor.owned);
      if (view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); view = await backgammon.get(code, actor.principal, actor.owned); }
      return view;
    };
    if (backgammonMatch && request.method === 'GET') {
      const code = backgammonMatch[1].toUpperCase(), view = await readBackgammon(code);
      return backgammonMatch[2] ? events(request, view, () => readBackgammon(code), headers) : json(view, 200, headers);
    }
    if (path === '/api/backgammon' && request.method === 'POST') {
      const input=await readCommand(request);await discovery.checkPublicJoin('backgammon',actor,input);
      const result = await backgammon.command(actor, await namedGameCommand(social, actor, input));
      if (result.view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); result.view = await backgammon.get(result.view.code, actor.principal, actor.owned); }
      return json(result, 200, headers);
    }
    if (path === '/api/farkle/session' && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), farkle: true }, 200, headers);
    const farkle = new FarkleRoomStore(env.DB), farkleMatch = /^\/api\/farkle\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const readFarkle = async (code: string) => {
      let view = await farkle.get(code, actor.principal, actor.owned);
      if (view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); view = await farkle.get(code, actor.principal, actor.owned); }
      return view;
    };
    if (farkleMatch && request.method === 'GET') {
      const code = farkleMatch[1].toUpperCase(), view = await readFarkle(code);
      return farkleMatch[2] ? events(request, view, () => readFarkle(code), headers) : json(view, 200, headers);
    }
    if (path === '/api/farkle' && request.method === 'POST') {
      const input=await readCommand(request);await discovery.checkPublicJoin('farkle',actor,input);
      const result = await farkle.command(actor, await namedGameCommand(social, actor, input));
      if (result.view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); result.view = await farkle.get(result.view.code, actor.principal, actor.owned); }
      return json(result, 200, headers);
    }
    if (path === '/api/five-dice/session' && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), party: actor.owned?.includes('five-dice-party') ?? false }, 200, headers);
    const dice = new FiveDiceRoomStore(env.DB), diceMatch = /^\/api\/five-dice\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const readDice = async (code: string) => {
      let view = await dice.get(code, actor.principal, actor.owned);
      if (view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); view = await dice.get(code, actor.principal, actor.owned); }
      return view;
    };
    if (diceMatch && request.method === 'GET') {
      const code = diceMatch[1].toUpperCase(), view = await readDice(code);
      return diceMatch[2] ? events(request, view, () => readDice(code), headers) : json(view, 200, headers);
    }
    if (path === '/api/five-dice' && request.method === 'POST') {
      const input=await readCommand(request);await discovery.checkPublicJoin('five-dice',actor,input);
      const result = await dice.command(actor, await namedGameCommand(social, actor, input));
      if (result.view.status === 'finished' && actor.principal.startsWith('member:')) { await economy.syncTrustedRewards(actor); result.view = await dice.get(result.view.code, actor.principal, actor.owned); }
      return json(result, 200, headers);
    }
    if (path === '/api/rummy/appearance') {
      if (request.method === 'GET') return json(await rummy.appearance(actor.principal, actor.owned), 200, headers);
      return json(await rummy.equipAppearance(actor.principal, await readCommand(request), actor.owned), 200, headers);
    }
    if (path === `/api/${game}/session` && request.method === 'GET') return json({ member: actor.principal.startsWith('member:'), jokers: actor.jokers }, 200, headers);
    const store = game === 'spades' ? spades : rummy;
    const match = /^\/api\/(?:rummy|spades)\/room\/([A-Fa-f0-9]{8})(\/events)?$/.exec(path);
    const read = async (code: string) => {
      const view = await store.get(code, actor.principal);
      if (game === 'spades') checkSpadesPartnershipAccess(actor, (view as Awaited<ReturnType<CloudSpadesRoomStore['get']>>).options.variant);
      return view;
    };
    if (match && request.method === 'GET') {
      const code = match[1].toUpperCase(), view = await read(code);
      context.waitUntil(flushRewards(economy, rummy, spades).catch(() => console.error('Reward synchronization will retry.')));
      return match[2] ? events(request, view, () => read(code), headers) : json(view, 200, headers);
    }
    if (path === `/api/${game}` && request.method === 'POST') {
      const input=await readCommand(request);await discovery.checkPublicJoin(game,actor,input);
      const result = await store.command(actor, await namedGameCommand(social, actor, input));
      context.waitUntil(flushRewards(economy, rummy, spades).catch(() => console.error('Reward synchronization will retry.')));
      return json(result.view, 200, headers);
    }
    throw new RummyError('Endpoint not found.', 404);
  } catch (error) {
    if (error instanceof RummyError) return json({ error: error.message, code: error.code }, error.status, headers);
    console.error('Unexpected game service error.');
    return json({ error: 'The game service could not complete that request. Reconnect to check your table.', code: 'server_error' }, 500, headers);
  }
}
export default {
  async fetch(request: Request, env: Environment, context: Context): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (['/', '/store', '/rewards', '/profile'].includes(path) && request.method === 'GET' && env.DB) context.waitUntil(settleCashAllowances(env).catch(() => console.error('Tester allowances remain queued for account synchronization.')));
    if (path.startsWith('/api/')) return api(request, env, context);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed.', { status: 405 });
    if (path === '/clubhouse-config.js') {
      const body = `window.__CLUBHOUSE_CONFIG__=${JSON.stringify(publicConfig(env)).replace(/</g, '\\u003c')};`;
      return new Response(request.method === 'HEAD' ? null : body, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const asset = assets[path] || (!path.split('/').at(-1)?.includes('.') ? assets['/index.html'] : undefined);
    if (!asset) return new Response('Not found.', { status: 404 });
    const headers = { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store' };
    return new Response(request.method === 'HEAD' ? null : Uint8Array.from(atob(asset.data), char => char.charCodeAt(0)), { headers });
  },
};
