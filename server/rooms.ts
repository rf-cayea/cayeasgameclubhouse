import { COMPUTER_STEP_MS,type ComputerStates } from '../src/lib/computer-turns';
import { validCardRewardAmount } from '../src/lib/reward-rates';
import { canonicalDeckId } from '../src/lib/playing-decks';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { applyMove, botMove, parseMove, waitingForRummy } from '../src/lib/rummy-engine';
import { newGame, VARIANTS, type Player, type State } from '../src/lib/rummy';
import { containsProfanity } from '../src/lib/moderation';
import { RummyError, type GameOptions, type RoomCommand, type RoomView } from '../src/lib/rummy-protocol';
import { completedReward, memberId, rewardParticipants, rewardTier, type MatchReward, type RewardReceipt, type RewardView } from '../src/lib/rummy-rewards';
import { WIN_POINTS } from '../src/lib/rummy';
import { RUMMY_DESIGNS, rummyAppearanceView, type RummyAppearanceView } from '../src/lib/rummy-cosmetics';

export interface Identity { principal: string; jokers: boolean; owned?: string[]; nameFlagged?: boolean }
interface Member { principal: string; id: string; name: string; ready: boolean }
interface Room { cratePolicy?:number; presentation?:ComputerStates<State>; code: string; owner: string; options: GameOptions; members: Member[]; state: State | null; status: RoomView['status']; revision: number; matchId?: string }
const secureRandom = () => randomInt(0, 0x100000000) / 0x100000000;
const cleanName = (value: unknown, fallback = 'Player') => {
  if (typeof value !== 'string') return fallback;
  const name = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24 || /[\p{C}<>]/u.test(name) || containsProfanity(name)) throw new RummyError('Use a friendly player name with 2–24 characters.');
  return name;
};

function options(value: unknown): GameOptions {
  if (!value || typeof value !== 'object') throw new RummyError('Choose game settings.');
  const input = value as Record<string, unknown>;
  if (!['bot', 'local', 'online'].includes(String(input.mode)) || !Object.hasOwn(VARIANTS, String(input.variant)) ||
    !['easy', 'normal', 'hard'].includes(String(input.level)) || typeof input.jokers !== 'boolean' || !Number.isInteger(input.seats)) throw new RummyError('Invalid game settings.');
  const seats = Number(input.seats);
  const variant = input.variant as GameOptions['variant'];
  if (seats < 2 || seats > VARIANTS[variant].max) throw new RummyError('Choose 2 players for Gin, or 2–4 for Classic and Rummy 500.');
  return { mode: input.mode as GameOptions['mode'], variant, seats, level: input.level as GameOptions['level'], jokers: input.jokers,
    names: Array.isArray(input.names) ? input.names.slice(0, 4).map((name, i) => cleanName(name, `Player ${i + 1}`)) : [] };
}

function pumpBots(state: State,frames:State[]): State {
  frames.push(state);
  for (let steps = 0; steps < 250 && ['draw', 'play'].includes(state.phase) && state.players[state.turn]!.bot; steps++) {
    if(waitingForRummy(state))break;
    const actor = state.turn;
    const move = botMove(state, actor, state.players[actor]!.level, secureRandom);
    if (!move) throw new Error('Computer could not choose a legal move.');
    const next = applyMove(state, actor, move, secureRandom);
    if (!next) throw new Error('Computer chose an illegal move.');
    state = next;frames.push(state);
  }
  if (['draw', 'play'].includes(state.phase) && state.players[state.turn]!.bot && !waitingForRummy(state)) throw new Error('Computer turn exceeded its action limit.');
  return state;
}

export class RoomStore {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS requests(code TEXT NOT NULL, actor TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(code,actor,id));
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reward_outbox(match_id TEXT PRIMARY KEY,room_code TEXT NOT NULL,user_id TEXT NOT NULL,payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,receipt TEXT);
      CREATE INDEX IF NOT EXISTS rummy_wins_by_user ON reward_outbox(user_id);
      CREATE TABLE IF NOT EXISTS rummy_appearance(principal TEXT PRIMARY KEY,background TEXT NOT NULL,table_id TEXT NOT NULL,deck_id TEXT NOT NULL DEFAULT 'rummy-standard',updated_at INTEGER NOT NULL);`);
    if (!this.db.prepare('PRAGMA table_info(rummy_appearance)').all().some(column => column.name === 'deck_id')) this.db.exec("ALTER TABLE rummy_appearance ADD COLUMN deck_id TEXT NOT NULL DEFAULT 'rummy-standard'");
  }
  close() { this.db.close(); }
  guest(token: string | undefined): { principal: string; cookie?: string } {
    const hash = token && /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : '';
    if (hash && this.db.prepare('SELECT hash FROM sessions WHERE hash=?').get(hash)) {
      this.db.prepare('UPDATE sessions SET seen=? WHERE hash=?').run(Date.now(), hash);
      return { principal: `guest:${hash}` };
    }
    const cookie = randomBytes(32).toString('hex');
    const next = createHash('sha256').update(cookie).digest('hex');
    this.db.prepare('INSERT INTO sessions(hash,seen) VALUES(?,?)').run(next, Date.now());
    return { principal: `guest:${next}`, cookie };
  }
  appearance(principal: string, purchased: readonly string[] = []): RummyAppearanceView {
    const userId = memberId(principal);
    if (!userId) return rummyAppearanceView(false, 0);
    // Each outbox row is a unique, server-verified full-match win. Cosmetic
    // unlocks do not depend on point delivery, spending or browser storage.
    const count = this.db.prepare('SELECT count(*) AS n FROM reward_outbox WHERE user_id=?').get(userId);
    const saved = this.db.prepare('SELECT background,table_id,deck_id FROM rummy_appearance WHERE principal=?').get(principal);
    return rummyAppearanceView(true, Number(count?.n ?? 0), saved, purchased);
  }
  equipAppearance(principal: string, input: unknown, purchased: readonly string[] = []): RummyAppearanceView {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RummyError('Choose a background and table.');
    const value = input as Record<string, unknown>, current = this.appearance(principal, purchased);
    const selected = { background: value.background, table: value.table, deck: typeof value.deck === 'string' ? canonicalDeckId(value.deck) : value.deck ?? current.equipped.deck };
    for (const slot of ['background', 'table', 'deck'] as const) {
      if (!RUMMY_DESIGNS.some(item => item.id === selected[slot] && item.slot === slot)) throw new RummyError('Choose a valid Rummy+ design.');
      if (!current.owned.includes(String(selected[slot]))) throw new RummyError('Earn this design through Rummy+ wins or collect it in the store.', 403, 'design_locked');
    }
    if (current.member) this.db.prepare('INSERT INTO rummy_appearance(principal,background,table_id,deck_id,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(principal) DO UPDATE SET background=excluded.background,table_id=excluded.table_id,deck_id=excluded.deck_id,updated_at=excluded.updated_at')
      .run(principal, String(selected.background), String(selected.table), String(selected.deck), Date.now());
    return { ...current, equipped: { background: String(selected.background), table: String(selected.table), deck: String(selected.deck) } };
  }
  private advance(room:Room,state:State) {
    const frames:State[]=[];const next=pumpBots(state,frames);
    room.presentation=frames.length>1?{id:randomUUID(),startedAt:Date.now(),states:frames}:undefined;
    return next;
  }
  private load(code: string): Room {
    if (!/^[A-F0-9]{8}$/.test(code)) throw new RummyError('Enter an eight-character room code.');
    const row = this.db.prepare('SELECT data FROM rooms WHERE code=?').get(code);
    if (!row) throw new RummyError('Room not found.', 404, 'not_found');
    return JSON.parse(String(row.data)) as Room;
  }
  private save(room: Room) {
    this.db.prepare('INSERT INTO rooms(code,data,updated_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(room.code, JSON.stringify(room), Date.now());
  }
  private enqueueReward(room: Room) {
    if (room.status !== 'finished') return;
    const result = completedReward(room.state, room.options.mode, room.members, room.matchId, new Date().toISOString());
    if (!result) return;
    this.db.prepare('INSERT OR IGNORE INTO reward_outbox(match_id,room_code,user_id,payload) VALUES(?,?,?,?)')
      .run(result.match_id, room.code, result.participants[result.winner_index]!.user_id!, JSON.stringify(result));
  }
  private rewardView(room: Room, principal: string): RewardView {
    const userId = memberId(principal);
    const ineligible = (message: string): RewardView => ({ status: 'ineligible', amount: 0, tier: null, message });
    if (!userId) return ineligible('Guest games do not earn wallet points. Sign in before starting a reward match.');
    if (room.options.mode === 'local') return ineligible('Pass-and-play is unranked and does not earn wallet points.');
    if (!room.matchId) return ineligible('Start a new match to enable verified wallet rewards.');
    if (room.status === 'abandoned') return ineligible('Abandoned matches do not earn wallet points.');
    const row = this.db.prepare('SELECT user_id,status,payload,receipt FROM reward_outbox WHERE match_id=?').get(room.matchId);
    if (row && row.user_id === userId) {
      const result = JSON.parse(String(row.payload)) as MatchReward;
      const tier = rewardTier(result.mode, result.participants)!;
      const paid = row.status === 'credited' && row.receipt ? JSON.parse(String(row.receipt)) as { amount: number } : null;
      const amount = paid && validCardRewardAmount(tier, paid.amount) ? paid.amount : WIN_POINTS[tier];
      return row.status === 'credited' ? { status: 'credited', tier, amount, source: `rummy:win:${room.matchId}`, message: `${amount} Rummy+ points credited to your wallet.` }
        : { status: 'pending', tier, amount, message: `Your win is verified. ${amount} Rummy+ points are queued and will sync automatically.` };
    }
    if (room.status === 'finished') return ineligible('Only an eligible signed-in match winner earns wallet points.');
    const participants = room.state ? rewardParticipants(room.state, room.members) : room.members.map(member => ({ user_id: memberId(member.principal), bot: false, level: null }));
    const tier = rewardTier(room.options.mode, participants);
    if (!tier) return ineligible(room.options.mode === 'online' ? 'All human players must be signed in before the match starts to earn online win points.' : 'This table is not eligible for wallet points.');
    return { status: 'eligible', tier, amount: WIN_POINTS[tier], message: `Win this match to earn ${WIN_POINTS[tier]} Rummy+ points.` };
  }
  claimReward(now: number): { result: MatchReward; lease: string; roomCode: string } | null {
    const lease = randomUUID();
    const row = this.db.prepare(`UPDATE reward_outbox SET lease=?,lease_until=?,attempts=attempts+1
      WHERE match_id=(SELECT match_id FROM reward_outbox WHERE status='pending' AND next_attempt<=? AND lease_until<=? ORDER BY rowid LIMIT 1)
      RETURNING payload,room_code`).get(lease, now + 30_000, now, now);
    return row ? { result: JSON.parse(String(row.payload)) as MatchReward, lease, roomCode: String(row.room_code) } : null;
  }
  finishReward(matchId: string, lease: string, receipt: RewardReceipt) {
    this.db.prepare("UPDATE reward_outbox SET status='credited',receipt=?,lease=NULL,lease_until=0 WHERE match_id=? AND lease=? AND status='pending'")
      .run(JSON.stringify(receipt), matchId, lease);
  }
  retryReward(matchId: string, lease: string, now: number) {
    this.db.prepare("UPDATE reward_outbox SET lease=NULL,lease_until=0,next_attempt=?+min(300000,5000*(1 << min(attempts,6))) WHERE match_id=? AND lease=? AND status='pending'")
      .run(now, matchId, lease);
  }
  private member(room: Room, principal: string) {
    const member = room.members.find(value => value.principal === principal);
    if (!member) throw new RummyError('You are not a member of this room.', 403, 'not_member');
    return member;
  }
  private view(room: Room, principal: string,rewardOverride?:RewardView): RoomView {
    const member = this.member(room, principal);
    const state = room.state;
    const mySeat = state ? room.options.mode === 'local' ? state.turn : state.players.findIndex(player => player.id === member.id) : room.members.indexOf(member);
    const people: Player[] = state?.players ?? room.members.map(value => ({ id: value.id, name: value.name, bot: false }));
    const result:RoomView = {
      code: room.code, mode: room.options.mode, variant: room.options.variant, capacity: room.options.seats,
      status: room.status, revision: room.revision, owner: room.owner === principal,
      players: people.map((player, i) => ({ id: player.id, name: player.name, bot: player.bot, count: state?.hands[i]?.length ?? 0, score: state?.scores[i] ?? 0,
        ready: room.members.find(value => value.id === player.id)?.ready ?? true,
        you: room.options.mode === 'local' ? true : player.id === member.id })),
      mySeat: mySeat === -1 ? null : mySeat, hand: state && mySeat >= 0 ? [...state.hands[mySeat]!] : [],
      discard: [...(state?.discard ?? [])], stockCount: state?.deck.length ?? 0, melds: structuredClone(state?.melds ?? []),
      phase: state?.phase ?? null, turn: state?.turn ?? 0, dealer: state?.dealer ?? 0, round: state?.round ?? 1,
      target: state?.target ?? VARIANTS[room.options.variant].target, roundResult: state?.roundResult ?? null, winner: state?.winner ?? null,
      mustUse: state && mySeat === state.turn ? state.mustUse : null, drewDiscard: state && mySeat === state.turn ? state.drewDiscard : null,
      opening: state?.opening ?? null, jokers: room.options.jokers, log: state?.log.slice(-12) ?? [],
      activity: structuredClone(state?.activity ?? []),
      rummyClaim: state?.rummyClaim ? structuredClone(state.rummyClaim) : null,
      reward: rewardOverride??this.rewardView(room, principal),
      revealedHands: state && ['roundOver', 'gameOver'].includes(state.phase) ? structuredClone(state.hands) : null,
    };

    if(room.presentation&&room.status!=='abandoned'){
      const frameReward:RewardView=result.reward.status==='credited'||result.reward.status==='pending'?{status:'eligible',tier:result.reward.tier,amount:result.reward.amount,message:'Computer turn in progress.'}:result.reward;
      const frames:RoomView[]=[];
      for(const snapshot of room.presentation.states) frames.push(this.view({...room,state:snapshot,presentation:undefined,status:snapshot.phase==='gameOver'? 'finished':'playing'},principal,frameReward));
      result.playback={id:room.presentation.id,startedAt:room.presentation.startedAt,stepMs:COMPUTER_STEP_MS,frames};
    }
    return result;
  }
  get(code: string, principal: string) { return this.view(this.load(code), principal); }
  command(identity: Identity, input: unknown): { view: RoomView; changed: boolean } {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RummyError('Invalid room command.');
    const command = input as RoomCommand;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let room: Room;
      if (command.operation === 'create') {
        const settings = options(command.options);
        if (settings.jokers && !identity.jokers) throw new RummyError('Unlock Joker Mode in the store for 500 Rummy+ points first.', 403, 'jokers_locked');
        const recent = this.db.prepare('SELECT count(*) AS n FROM rooms WHERE updated_at>?').get(Date.now() - 1000 * 60 * 60 * 24);
        if (Number(recent?.n) > 5000) throw new RummyError('The game service is busy. Try again later.', 503);
        let code: string;
        do { code = randomBytes(4).toString('hex').toUpperCase(); } while (this.db.prepare('SELECT code FROM rooms WHERE code=?').get(code));
        const name = cleanName(command.name);
        const member: Member = { principal: identity.principal, id: randomUUID(), name, ready: true };
        room = { code, owner: identity.principal, options: settings, members: [member], state: null, status: 'waiting', revision: 0, cratePolicy:2,matchId: randomUUID() };
        if (settings.mode !== 'online') {
          const players: Player[] = Array.from({ length: settings.seats }, (_, i) => ({
            id: i === 0 ? member.id : randomUUID(), name: i === 0 ? name : settings.mode === 'bot' ? `Computer ${i}` : settings.names?.[i] || `Player ${i + 1}`,
            bot: settings.mode === 'bot' && i > 0, level: settings.level,
          }));
          room.state = this.advance(room,newGame(settings.variant, players, secureRandom, 1, settings.jokers));
          room.status = room.state.phase === 'gameOver' ? 'finished' : 'playing';
        }
      } else {
        if (typeof command.code !== 'string') throw new RummyError('Enter a room code.');
        room = this.load(command.code.trim().toUpperCase());
        if (command.operation === 'join') {
          if (!room.members.some(member => member.principal === identity.principal)) {
            if (room.options.mode !== 'online' || room.status !== 'waiting') throw new RummyError('This room is not accepting players.');
            if (room.members.length >= room.options.seats) throw new RummyError('This room is full.');
            room.members.push({ principal: identity.principal, id: randomUUID(), name: cleanName(command.name), ready: false });
          }
        } else {
          const member = this.member(room, identity.principal);
          if (command.operation === 'ready') {
            if (room.status !== 'waiting' || typeof command.ready !== 'boolean') throw new RummyError('Readiness can only change in the lobby.');
            member.ready = command.ready;
          } else if (command.operation === 'start') {
            if (room.owner !== identity.principal || room.status !== 'waiting') throw new RummyError('Only the host can start a waiting room.', 403);
            if (command.revision !== room.revision) throw new RummyError('The room changed. Refresh before starting.', 409, 'stale');
            if (room.members.length !== room.options.seats || room.members.some(member => !member.ready)) throw new RummyError('Wait for every seat to be filled and ready.');
            if (room.options.jokers && !identity.jokers) throw new RummyError('The host must own Joker Mode.', 403);
            room.state = newGame(room.options.variant, room.members.map(member => ({ id: member.id, name: member.name, bot: false })), secureRandom, 1, room.options.jokers);
            room.matchId ??= randomUUID();
            room.status = 'playing';
          } else if (command.operation === 'move') {
            const move = parseMove(command.move);
            if (!move || typeof command.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(command.requestId)) throw new RummyError('Invalid move request.');
            const fingerprint = JSON.stringify(move);
            const prior = this.db.prepare('SELECT fingerprint FROM requests WHERE code=? AND actor=? AND id=?').get(room.code, identity.principal, command.requestId);
            if (prior) {
              if (prior.fingerprint !== fingerprint) throw new RummyError('A move ID cannot be reused for a different move.', 409);
              this.db.exec('COMMIT');
              return { view: this.view(room, identity.principal), changed: false };
            }
            if (!room.state || room.status !== 'playing') throw new RummyError('The game is not accepting moves.');
            if (command.revision !== room.revision) throw new RummyError('The table changed. Your move was not applied; try again with the current hand.', 409, 'stale');
            const actor = room.options.mode === 'local' ? room.state.turn : room.state.players.findIndex(player => player.id === member.id);
            if (move.t === 'next' && room.owner !== identity.principal) throw new RummyError('The host starts the next round.', 403);
            const next = applyMove(room.state, actor, move, secureRandom);
            if (!next) throw new RummyError('That move is not legal in the current turn.');
            room.state = this.advance(room,next);
            if (room.state.phase === 'gameOver') room.status = 'finished';
            this.db.prepare('INSERT INTO requests(code,actor,id,fingerprint) VALUES(?,?,?,?)').run(room.code, identity.principal, command.requestId, fingerprint);
          } else if (command.operation === 'leave') {
            if (room.status === 'waiting') {
              room.members = room.members.filter(value => value.principal !== identity.principal);
              if (!room.members.length) room.status = 'abandoned';
              else if (room.owner === identity.principal) room.owner = room.members[0]!.principal;
            } else if (room.status === 'playing') room.status = 'abandoned';
            room.revision++;
            this.save(room);
            this.db.exec('COMMIT');
            return { view: { code: room.code, revision: room.revision } as RoomView, changed: true };
          } else throw new RummyError('Unknown room command.');
        }
      }
      room.revision++;
      this.save(room);
      this.enqueueReward(room);
      this.db.exec('COMMIT');
      return { view: this.view(room, identity.principal), changed: true };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
