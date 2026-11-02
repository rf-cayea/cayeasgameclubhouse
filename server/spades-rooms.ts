import type { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { containsProfanity } from '../src/lib/moderation';
import { RummyError } from '../src/lib/rummy-protocol';
import type { Identity } from './rooms';
import { applySpadesMove, legalSpadesCards, newSpades, parseSpadesMove, SPADES_POINTS, SPADES_TARGETS, spadesBotMove, type SpadesPlayer, type SpadesState } from '../src/lib/spades';
import { CLASSIC_DECK, CLASSIC_VENUE, SPADES_DECKS, SPADES_VENUES } from '../src/lib/spades-cosmetics';
import type { SpadesCommand, SpadesOptions, SpadesRoomView } from '../src/lib/spades-protocol';
import { spadesMatchReward, spadesRewardTier, spadesWinners, type SpadesMatchReward, type SpadesReceipt } from '../src/lib/spades-rewards';
import { memberId, type RewardView } from '../src/lib/rummy-rewards';
import { ownsSpadesPartnerships, SPADES_PARTNERSHIPS } from '../src/lib/spades-perks';

const rand = () => randomInt(0, 0x100000000) / 0x100000000;
interface Member { id: string; principal: string; name: string; seat: number; ready: boolean }
interface Room { code: string; matchId: string; owner: string; options: SpadesOptions; members: Member[]; state: SpadesState | null; revision: number; status: SpadesRoomView['status'] }
const nameFor = (input: unknown) => {
  if (typeof input !== 'string') throw new RummyError('Enter a friendly name.');
  const name = input.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 24 || /[\p{C}<>]/u.test(name) || containsProfanity(name)) throw new RummyError('Use a friendly name with 2–24 characters.');
  return name;
};
function settings(input: unknown): SpadesOptions {
  if (!input || typeof input !== 'object') throw new RummyError('Choose table settings.');
  const value = input as SpadesOptions;
  if (!['bot', 'online'].includes(value.mode) || !['solo', 'teams'].includes(value.variant) || !SPADES_TARGETS.includes(value.target as 500) ||
    !['easy', 'normal', 'hard'].includes(value.level) || !Number.isInteger(value.humans) || value.humans < 2 || value.humans > 4 ||
    ![CLASSIC_VENUE, ...SPADES_VENUES].some(item => item.id === value.table) || ![CLASSIC_DECK, ...SPADES_DECKS].some(item => item.id === value.deck)) throw new RummyError('Invalid Spades settings.');
  return { mode: value.mode, variant: value.variant, target: value.target, humans: value.humans, level: value.level, table: value.table, deck: value.deck };
}
function checkLook(identity: Identity, options: SpadesOptions) {
  for (const id of [options.table, options.deck]) if (![CLASSIC_VENUE.id, CLASSIC_DECK.id].includes(id) && !identity.owned?.includes(id)) throw new RummyError('Collect this Spades design in the store before using it at a table.', 403);
}
export function checkSpadesPartnershipAccess(identity: Identity, variant: SpadesOptions['variant']) {
  if (variant === 'teams' && (!memberId(identity.principal) || !ownsSpadesPartnerships(identity.owned))) {
    throw new RummyError(`Unlock ${SPADES_PARTNERSHIPS.name} in the Store for ${SPADES_PARTNERSHIPS.price} Spades points first. Every human player needs this permanent unlock.`, 403, 'partnerships_locked');
  }
}
function pump(state: SpadesState) {
  for (let count = 0; count < 12 && ['bid', 'play'].includes(state.phase) && state.players[state.turn]!.bot; count++) {
    const move = spadesBotMove(state, state.turn, state.players[state.turn]!.level, rand);
    const next = move && applySpadesMove(state, state.turn, move, rand);
    if (!next) throw new Error('Spades computer could not choose a legal move.');
    state = next;
  }
  if (['bid', 'play'].includes(state.phase) && state.players[state.turn]!.bot) throw new Error('Spades computer turn exceeded its limit.');
  return state;
}
export class SpadesRoomStore {
  constructor(readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS spades_rooms(code TEXT PRIMARY KEY,data TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS spades_requests(code TEXT NOT NULL,actor TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,PRIMARY KEY(code,actor,id));
      CREATE TABLE IF NOT EXISTS spades_rewards(match_id TEXT PRIMARY KEY,room_code TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,receipt TEXT);`);
  }
  private load(code: string): Room {
    if (!/^[A-F0-9]{8}$/.test(code)) throw new RummyError('Enter an eight-character room code.');
    const row = this.db.prepare('SELECT data FROM spades_rooms WHERE code=?').get(code);
    if (!row) throw new RummyError('Spades room not found.', 404);
    return JSON.parse(String(row.data)) as Room;
  }
  private save(room: Room) { this.db.prepare('INSERT INTO spades_rooms(code,data,updated_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').run(room.code, JSON.stringify(room), Date.now()); }
  private member(room: Room, principal: string) {
    const member = room.members.find(value => value.principal === principal);
    if (!member) throw new RummyError('You are not a member of this Spades room.', 403);
    return member;
  }
  private start(room: Room) {
    const players: SpadesPlayer[] = Array.from({ length: 4 }, (_, seat) => {
      const member = room.members.find(value => value.seat === seat);
      return member ? { id: member.id, name: member.name, bot: false } : { id: randomUUID(), name: `Computer ${seat + 1}`, bot: true, level: room.options.level };
    });
    room.state = pump(newSpades(room.options.variant, players, room.options.target, rand)); room.status = 'playing';
  }
  private reward(room: Room, principal: string): RewardView {
    const none = (message: string): RewardView => ({ status: 'ineligible', amount: 0, tier: null, message });
    const user = memberId(principal);
    if (!user) return none('Guest Spades is free to play. Sign in before starting a reward match.');
    const row = this.db.prepare('SELECT status,payload FROM spades_rewards WHERE match_id=?').get(room.matchId);
    if (row) {
      const result = JSON.parse(String(row.payload)) as SpadesMatchReward;
      if (spadesWinners(result).includes(user)) {
        const tier = spadesRewardTier(result.mode, result.players)!, amount = SPADES_POINTS[tier];
        return row.status === 'credited' ? { status: 'credited', tier, amount, source: `spades:win:${room.matchId}`, message: `${amount} Spades points credited to your wallet.` }
          : { status: 'pending', tier, amount, message: `Match won! ${amount} Spades points are queued and will sync automatically.` };
      }
    }
    if (room.status === 'abandoned') return none('This match ended without a reward.');
    if (room.status === 'finished') return none('Only eligible human winners earn Spades points.');
    const eligible = room.options.mode === 'bot' ? room.options.level : room.members.length === 4 && room.members.every(value => memberId(value.principal)) ? 'humans' : null;
    return eligible ? { status: 'eligible', tier: eligible, amount: SPADES_POINTS[eligible], message: `Win this match to earn ${SPADES_POINTS[eligible]} Spades points${room.options.variant === 'teams' ? ' for each eligible teammate' : ''}.` }
      : none('Online rewards require four distinct signed-in human players. Mixed computer tables are unranked.');
  }
  private view(room: Room, principal: string): SpadesRoomView {
    const me = this.member(room, principal), state = room.state;
    return { code: room.code, revision: room.revision, owner: room.owner === principal, status: room.status, options: room.options, mySeat: me.seat,
      players: Array.from({ length: 4 }, (_, seat) => {
        const member = room.members.find(value => value.seat === seat), player = state?.players[seat];
        return { id: player?.id ?? member?.id ?? `seat-${seat}`, name: player?.name ?? member?.name ?? 'Open seat', bot: player?.bot ?? false, occupied: Boolean(player || member), ready: member?.ready ?? false, you: seat === me.seat, count: state?.hands[seat]?.length ?? 0 };
      }),
      hand: [...(state?.hands[me.seat] ?? [])], legal: state ? legalSpadesCards(state, me.seat) : [], bids: state?.bids ?? [null, null, null, null], taken: state?.taken ?? [0, 0, 0, 0], scores: state?.scores ?? Array(room.options.variant === 'teams' ? 2 : 4).fill(0), bags: state?.bags ?? Array(room.options.variant === 'teams' ? 2 : 4).fill(0), phase: state?.phase ?? null, turn: state?.turn ?? 0, dealer: state?.dealer ?? 3, round: state?.round ?? 1, broken: state?.broken ?? false,
      trick: state?.trick ?? [], completed: state?.completed ?? [], result: state?.result ?? null, winner: state?.winner ?? null, log: state?.log ?? [], reward: this.reward(room, principal) };
  }
  get(code: string, principal: string) { return this.view(this.load(code), principal); }
  command(identity: Identity, input: unknown): { view: SpadesRoomView; changed: boolean } {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RummyError('Invalid Spades command.');
    const command = input as SpadesCommand;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let room: Room;
      if (command.operation === 'create') {
        const options = settings(command.options); checkSpadesPartnershipAccess(identity, options.variant); checkLook(identity, options);
        if (Number(this.db.prepare('SELECT count(*) AS n FROM spades_rooms WHERE updated_at>?').get(Date.now() - 86400000)?.n) >= 5000) throw new RummyError('The Spades service is busy. Try again later.', 503);
        let code: string; do { code = randomBytes(4).toString('hex').toUpperCase(); } while (this.db.prepare('SELECT code FROM spades_rooms WHERE code=?').get(code));
        room = { code, matchId: randomUUID(), options, owner: identity.principal, revision: 0, status: 'waiting', state: null,
          members: [{ id: randomUUID(), principal: identity.principal, name: nameFor(command.name), seat: 0, ready: true }] };
        if (options.mode === 'bot') this.start(room);
      } else {
        if (typeof command.code !== 'string') throw new RummyError('Enter a room code.');
        room = this.load(command.code.trim().toUpperCase());
        if (command.operation !== 'leave') checkSpadesPartnershipAccess(identity, room.options.variant);
        if (command.operation === 'join' && !room.members.some(value => value.principal === identity.principal)) {
          if (room.status !== 'waiting' || room.options.mode !== 'online' || room.members.length >= room.options.humans) throw new RummyError('This Spades room is not accepting players.');
          const seat = command.seat ?? [0, 1, 2, 3].find(value => !room.members.some(member => member.seat === value));
          if (!Number.isInteger(seat) || seat! < 0 || seat! > 3 || room.members.some(value => value.seat === seat)) throw new RummyError('That seat is unavailable.');
          room.members.push({ id: randomUUID(), principal: identity.principal, name: nameFor(command.name), seat: seat!, ready: false });
        } else {
          const member = this.member(room, identity.principal);
          if (command.operation === 'join') { /* Rejoin your existing seat. */ }
          else if (command.operation === 'ready') {
            if (room.status !== 'waiting' || typeof command.ready !== 'boolean') throw new RummyError('Readiness can only change in the lobby.');
            member.ready = command.ready;
          } else if (command.operation === 'start') {
            if (room.owner !== identity.principal || room.status !== 'waiting') throw new RummyError('Only the host can start a waiting table.', 403);
            if (command.revision !== room.revision) throw new RummyError('The table changed. Refresh first.', 409);
            if (room.members.length !== room.options.humans || room.members.some(value => !value.ready)) throw new RummyError('Wait for every human seat to be filled and ready.');
            checkLook(identity, room.options); this.start(room);
          } else if (command.operation === 'move') {
            const move = parseSpadesMove(command.move);
            if (!move || typeof command.requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(command.requestId)) throw new RummyError('Invalid Spades move.');
            const fingerprint = JSON.stringify(move), prior = this.db.prepare('SELECT fingerprint FROM spades_requests WHERE code=? AND actor=? AND id=?').get(room.code, identity.principal, command.requestId);
            if (prior) {
              if (prior.fingerprint !== fingerprint) throw new RummyError('A move ID cannot be reused for a different move.', 409);
              this.db.exec('COMMIT'); return { view: this.view(room, identity.principal), changed: false };
            }
            if (room.status !== 'playing' || !room.state) throw new RummyError('This table is not accepting moves.');
            if (command.revision !== room.revision) throw new RummyError('The table changed. Your move was not applied; try the current hand.', 409);
            if (move.t === 'next' && room.owner !== identity.principal) throw new RummyError('The host deals the next hand.', 403);
            const next = applySpadesMove(room.state, member.seat, move, rand);
            if (!next) throw new RummyError('That move is not legal. Follow suit and wait for your turn.');
            room.state = pump(next); if (room.state.phase === 'gameOver') room.status = 'finished';
            this.db.prepare('INSERT INTO spades_requests(code,actor,id,fingerprint) VALUES(?,?,?,?)').run(room.code, identity.principal, command.requestId, fingerprint);
          } else if (command.operation === 'leave') {
            if (room.status === 'waiting') {
              room.members = room.members.filter(value => value.id !== member.id);
              if (!room.members.length) room.status = 'abandoned';
              else if (room.owner === identity.principal) { room.owner = room.members[0]!.principal; room.options.table = CLASSIC_VENUE.id; room.options.deck = CLASSIC_DECK.id; }
            } else if (room.status === 'playing') room.status = 'abandoned';
            room.revision++; this.save(room); this.db.exec('COMMIT');
            return { view: { code: room.code, revision: room.revision } as SpadesRoomView, changed: true };
          } else throw new RummyError('Unknown Spades command.');
        }
      }
      room.revision++; this.save(room);
      if (room.status === 'finished' && room.state) {
        const reward = spadesMatchReward(room.state, room.options.mode, room.members, room.matchId);
        if (reward) this.db.prepare('INSERT OR IGNORE INTO spades_rewards(match_id,room_code,payload) VALUES(?,?,?)').run(room.matchId, room.code, JSON.stringify(reward));
      }
      this.db.exec('COMMIT'); return { view: this.view(room, identity.principal), changed: true };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  claimReward(now: number): { result: SpadesMatchReward; lease: string; roomCode: string } | null {
    const lease = randomUUID();
    const row = this.db.prepare(`UPDATE spades_rewards SET lease=?,lease_until=?,attempts=attempts+1 WHERE match_id=(SELECT match_id FROM spades_rewards WHERE status='pending' AND next_attempt<=? AND lease_until<=? ORDER BY rowid LIMIT 1) RETURNING payload,room_code`).get(lease, now + 30000, now, now);
    return row ? { result: JSON.parse(String(row.payload)), lease, roomCode: String(row.room_code) } : null;
  }
  finishReward(id: string, lease: string, receipt: SpadesReceipt) { this.db.prepare("UPDATE spades_rewards SET status='credited',receipt=?,lease=NULL,lease_until=0 WHERE match_id=? AND lease=? AND status='pending'").run(JSON.stringify(receipt), id, lease); }
  retryReward(id: string, lease: string, now: number) { this.db.prepare("UPDATE spades_rewards SET lease=NULL,lease_until=0,next_attempt=?+min(300000,5000*(1 << min(attempts,6))) WHERE match_id=? AND lease=? AND status='pending'").run(now, id, lease); }
}
