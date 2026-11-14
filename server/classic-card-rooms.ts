import { randomBytes, randomUUID } from 'node:crypto';
import {
  SUITS, drawEight, eightsBot, eightsLegal, exchangeHearts, heartsBot, heartsLegal,
  playEight, playHeart, seatName, startEights, startHearts, validHeartPass, wild,
  type Eights, type Hearts, type Suit,
} from '../src/lib/classic-cards';
import {
  classicRoomCode, type ClassicKind, type ClassicOptions, type ClassicRequest,
  type ClassicRoomView, type ClassicTableSummary,
} from '../src/lib/classic-card-protocol';
import { containsProfanity } from '../src/lib/moderation';
import { RummyError } from '../src/lib/rummy-protocol';
import { CloudDatabase, type D1Binding } from './database';
import type { Identity } from './rooms';

interface Player { principal: string; name: string; ready: boolean; seat: number }
type Game = { matchId: string; tier: 'normal' | 'humans' | null } & (
  { kind: 'eights'; state: Eights } | { kind: 'hearts'; state: Hearts; passes: Record<number, string[]> }
);
interface Room {
  code: string;
  kind: ClassicKind;
  revision: number;
  updatedAt: number;
  host: string;
  options: ClassicOptions;
  players: Player[];
  game: Game | null;
  nextBotAt?: number;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CARD = /^(?:[A2-9TJQK][CDSH]|X[12])$/;
const SEATS = [0, 1, 2, 3];
const OPEN_FOR = 2 * 60 * 60_000;
const RECEIPT_FOR = 7 * 24 * 60 * 60_000;
const STALE = () => new RummyError('The table changed. Check the latest turn and try again.', 409, 'stale');

function nameFor(input: unknown) {
  const name = typeof input === 'string' ? input.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 24 || /[\p{C}<>]/u.test(name) || containsProfanity(name)) {
    throw new RummyError('Use a friendly name with 2–24 characters.');
  }
  return name;
}

function parse(kind: ClassicKind, input: unknown): ClassicRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RummyError('Choose a table action.');
  const value = input as Record<string, unknown>;
  if (typeof value.requestId !== 'string' || !UUID.test(value.requestId)) throw new RummyError('A unique action ID is required.');
  const requestId = value.requestId.toLowerCase();
  const operation = value.operation;
  if (operation === 'create') {
    const options = value.options as Partial<ClassicOptions> | undefined;
    if (!options || typeof options.listed !== 'boolean' || typeof options.jokers !== 'boolean'
      || (options.capacity !== 1 && options.capacity !== 2 && options.capacity !== 3 && options.capacity !== 4)) throw new RummyError('Choose valid table options.');
    return { operation, requestId, name: nameFor(value.name), options: { listed: options.capacity !== 1 && options.listed, capacity: options.capacity, jokers: kind === 'eights' || options.jokers } };
  }
  if (!classicRoomCode(value.code)) throw new RummyError('Enter an eight-character table code.');
  const code = value.code;
  if (operation === 'join') return { operation, requestId, code, name: nameFor(value.name) };
  if (operation === 'leave') return { operation, requestId, code };
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 1) throw STALE();
  const base = { requestId, code, revision: Number(value.revision) };
  if (operation === 'ready' && typeof value.ready === 'boolean') return { ...base, operation, ready: value.ready };
  if (operation === 'start' || operation === 'rematch' || operation === 'next' || operation === 'draw') return { ...base, operation };
  if (operation === 'play' && typeof value.card === 'string' && CARD.test(value.card)
    && (value.suit === undefined || SUITS.includes(value.suit as Suit))) {
    return { ...base, operation, card: value.card, suit: value.suit as Suit | undefined };
  }
  if (operation === 'pass' && Number.isSafeInteger(value.round) && Number(value.round) >= 0 && Array.isArray(value.cards) && value.cards.length === 3
    && value.cards.every(card => typeof card === 'string' && CARD.test(card))) return { ...base, operation, cards: value.cards, round: Number(value.round) };
  throw new RummyError('That table action is invalid.');
}

function member(room: Room, principal: string) {
  const player = room.players.find(value => value.principal === principal);
  if (!player) throw new RummyError('Join this table before playing.', 403);
  return player;
}

function automaticTurn(room: Room) {
  const game = room.game;
  if (!game || !room.players.length) return false;
  const human = room.players.some(player => player.seat === game.state.turn);
  return game.kind === 'eights' ? !game.state.winners.length && !human
    : game.state.phase === 'play' && (game.state.trick.length === 4 || !human);
}

function pump(room: Room, now: number) {
  const game = room.game;
  if (!game || !room.players.length) return;
  if (game.kind === 'hearts' && game.state.phase === 'pass' && room.players.every(player => game.passes[player.seat])) {
    game.state = exchangeHearts(game.state, SEATS.map(seat => game.passes[seat]));
    game.passes = {};
  }
  // Persist a deadline rather than running every computer turn in one response.
  room.nextBotAt = automaticTurn(room)
    ? now + (game.kind === 'hearts' && game.state.trick.length === 4 ? 1600 : 1100)
    : undefined;
}

function start(room: Room, now: number) {
  const matchId = randomUUID();
  const tier = room.players.every(player => player.principal.startsWith('member:'))
    ? room.options.capacity === 1 ? 'normal' : 'humans'
    : null;
  room.game = room.kind === 'eights'
    ? { matchId, tier, kind: 'eights', state: startEights() }
    : { matchId, tier, kind: 'hearts', state: startHearts(room.options.jokers), passes: {} };
  pump(room, now);
}

function winners(game: Game) {
  if (game.kind === 'eights') return game.state.winners;
  if (game.state.phase !== 'match') return [];
  const lowest = Math.min(...game.state.totals);
  return SEATS.filter(seat => game.state.totals[seat] === lowest);
}

function view(room: Room, principal: string): ClassicRoomView {
  const me = member(room, principal), game = room.game;
  const players = room.players.map(({ seat, name, ready }) => ({ seat, name, ready })).sort((a, b) => a.seat - b.seat);
  const common = {
    code: room.code, revision: room.revision, host: room.host === principal, seat: me.seat,
    options: room.options, players, hand: game?.state.hands[me.seat] ?? [],
    counts: game?.state.hands.map(hand => hand.length) ?? [],
    rewardMatchId: game?.tier && winners(game).length === 1 && winners(game)[0] === me.seat ? game.matchId : null,
    legal: [] as string[], waitingForPass: false,
  };
  if (!game) return { ...common, game: null };
  const message = game.state.message.replace(/^(You|West|North|East)(?= )/, value => {
    const seat = SEATS.find(index => seatName(index) === value)!;
    return seat === me.seat ? 'You' : players.find(player => player.seat === seat)?.name ?? `Computer ${seat + 1}`;
  });
  if (game.kind === 'eights') {
    const { active, turn, winners, pile, stock, drew } = game.state;
    const legal = turn === me.seat && !winners.length ? common.hand.filter(card => eightsLegal(game.state, card)) : [];
    return { ...common, legal, game: { kind: 'eights', active, turn, winners, message,
      top: pile.at(-1)!, stockCount: stock.length, canDraw: turn === me.seat && !winners.length && !legal.length && !drew } };
  }
  const { phase, turn, round, trick, lastTrick, taken, totals, kitty, jokers } = game.state;
  const waitingForPass = phase === 'pass' && !game.passes[me.seat];
  const legal = waitingForPass ? common.hand : turn === me.seat ? heartsLegal(game.state) : [];
  return { ...common, legal, waitingForPass, game: { kind: 'hearts', phase, turn, round, trick, lastTrick, taken, totals, kitty, jokers, message } };
}

function move(room: Room, player: Player, command: ClassicRequest, now: number) {
  const game = room.game;
  if (!game) throw new RummyError('Start the game from the table lobby.');
  if (game.kind === 'eights') {
    const previous = game.state;
    if (previous.turn !== player.seat || previous.winners.length) throw new RummyError('Wait for your turn.');
    if (command.operation === 'play' && (!wild(command.card) || command.suit)) {
      game.state = playEight(previous, command.card, command.suit ?? previous.active);
    } else if (command.operation === 'draw') game.state = drawEight(previous);
    if (game.state === previous) throw new RummyError('That card or draw is unavailable.');
  } else if (command.operation === 'pass' && game.state.phase === 'pass' && command.round === game.state.round) {
    if (game.passes[player.seat] || !validHeartPass(game.state.hands[player.seat]!, command.cards)) throw new RummyError('Choose three different cards from your hand.');
    game.passes[player.seat] = command.cards;
  } else if (command.operation === 'play' && game.state.turn === player.seat && heartsLegal(game.state).includes(command.card)) {
    game.state = playHeart(game.state, command.card);
  } else if (command.operation === 'next' && game.state.phase === 'round') {
    game.state = startHearts(room.options.jokers, game.state.round + 1, game.state.totals);
  } else throw new RummyError('That action is unavailable on this turn.');
  pump(room, now);
}

export class ClassicCardRooms {
  constructor(private readonly binding: D1Binding, private readonly now = Date.now) {}

  private async load(kind: ClassicKind, code: string) {
    const row = await this.binding.prepare('SELECT data FROM classic_card_rooms WHERE code=?').bind(code).first<{ data: string }>();
    const room = row ? JSON.parse(row.data) as Room : null;
    if (!room || room.kind !== kind) throw new RummyError('Table not found.', 404);
    return room;
  }

  async get(kind: ClassicKind, code: string, actor: Identity, attempts = 4): Promise<ClassicRoomView> {
    const room = await this.load(kind, code);
    member(room, actor.principal);
    const now = this.now();
    if (!automaticTurn(room)) return view(room, actor.principal);
    // Older saved tables have no deadline; recover them on their next read.
    if (room.nextBotAt !== undefined && now < room.nextBotAt) return view(room, actor.principal);
    const hadWinner = winners(room.game!).length > 0;
    const game = room.game!;
    if (game.kind === 'eights') game.state = eightsBot(game.state);
    else game.state = heartsBot(game.state);
    pump(room, now);
    const db = new CloudDatabase(this.binding);
    await db.exec('BEGIN IMMEDIATE');
    db.expectRoom('classic_card_rooms', code, room.revision);
    room.revision++;
    room.updatedAt = now;
    await db.prepare('UPDATE classic_card_rooms SET data=? WHERE code=?').run(JSON.stringify(room), code);
    await this.recordWin(db, room, hadWinner);
    try { await db.exec('COMMIT'); }
    catch (cause) {
      if (attempts > 1 && cause instanceof RummyError && cause.status === 409) return this.get(kind, code, actor, attempts - 1);
      throw cause;
    }
    return view(room, actor.principal);
  }

  private async recordWin(db: CloudDatabase, room: Room, hadWinner: boolean) {
    const game = room.game;
    if (!game?.tier || hadWinner) return;
    const seats = winners(game);
    const victor = seats.length === 1 ? room.players.find(player => player.seat === seats[0]) : null;
    if (victor?.principal.startsWith('member:')) {
      await db.prepare('INSERT INTO classic_card_rewards (match_id,user_id,game,tier) VALUES (?,?,?,?)')
        .run(game.matchId, victor.principal.slice(7), room.kind === 'eights' ? 'crazy-eights' : 'hearts', game.tier);
    }
  }

  async list(kind: ClassicKind, actor?: Identity): Promise<ClassicTableSummary[]> {
    const viewer = actor?.principal.startsWith('member:') ? actor.principal.slice(7) : '';
    const row = await this.binding.prepare(`SELECT json_group_array(json(data)) AS rooms FROM (
      SELECT data FROM classic_card_rooms
      WHERE json_extract(data, '$.kind')=? AND json_extract(data, '$.options.listed')=1
        AND json_extract(data, '$.game') IS NULL AND json_extract(data, '$.updatedAt')>?
        AND json_array_length(data, '$.players') BETWEEN 1 AND json_extract(data, '$.options.capacity')-1
        AND NOT EXISTS (SELECT 1 FROM json_each(data, '$.players') p JOIN social_blocks b
          ON (b.blocker_id=? AND b.blocked_id=substr(json_extract(p.value,'$.principal'),8))
          OR (b.blocked_id=? AND b.blocker_id=substr(json_extract(p.value,'$.principal'),8)))
      ORDER BY json_extract(data, '$.updatedAt') DESC LIMIT 30
    )`).bind(kind, this.now() - OPEN_FOR, viewer, viewer).first<{ rooms: string }>();
    return (JSON.parse(row?.rooms ?? '[]') as Room[]).map(room => ({
      code: room.code, host: room.players.find(player => player.principal === room.host)!.name,
      humans: room.players.length, capacity: room.options.capacity, jokers: room.options.jokers,
    }));
  }

  async command(kind: ClassicKind, actor: Identity, input: unknown, attempts = 4): Promise<ClassicRoomView | null> {
    const command = parse(kind, input), principal = actor.principal, now = this.now();
    const payload = JSON.stringify([kind, command]);
    const receipt = () => this.binding.prepare('SELECT payload,code FROM classic_card_requests WHERE principal=? AND request_id=?')
      .bind(principal, command.requestId).first<{ payload: string; code: string | null }>();
    const replay = async (prior: { payload: string; code: string | null }) => {
      if (prior.payload !== payload) throw new RummyError('This action ID was already used.', 409);
      return prior.code ? this.get(kind, prior.code, actor) : null;
    };
    const prior = await receipt();
    if (prior) return replay(prior);

    const room: Room = command.operation === 'create'
      ? { kind, code: randomBytes(4).toString('hex').toUpperCase(), revision: 0, updatedAt: now,
          host: principal, options: command.options, players: [{ principal, name: command.name, ready: true, seat: 0 }], game: null }
      : await this.load(kind, command.code);
    const hadWinner = room.game ? winners(room.game).length > 0 : false;
    if (command.operation === 'create' && room.options.listed && actor.nameFlagged) {
      throw new RummyError('Update your gamer name before hosting a public table.', 403);
    }
    if (command.operation === 'create' && room.options.capacity === 1) start(room, now);
    if (command.operation === 'join') {
      if (!room.players.some(player => player.principal === principal)) {
        if (room.game || !room.players.length || room.players.length >= room.options.capacity) throw new RummyError('This table is full or has already started.', 409);
        if (room.options.listed && actor.nameFlagged) throw new RummyError('Update your gamer name before joining a public table.', 403);
        if (principal.startsWith('member:')) {
          const id = principal.slice(7);
          const peers = room.players.filter(player => player.principal.startsWith('member:')).map(player => player.principal.slice(7));
          const blocked = await this.binding.prepare(`SELECT 1 FROM social_blocks b JOIN json_each(?) p
            ON (b.blocker_id=? AND b.blocked_id=p.value) OR (b.blocked_id=? AND b.blocker_id=p.value) LIMIT 1`)
            .bind(JSON.stringify(peers), id, id).first();
          if (blocked) throw new RummyError('This table is unavailable.', 403);
        }
        const seat = SEATS.find(index => index < room.options.capacity && !room.players.some(player => player.seat === index))!;
        room.players.push({ principal, name: command.name, ready: false, seat });
      }
    } else if (command.operation !== 'create') {
      const player = member(room, principal);
      // Pass selections are simultaneous and independent within the same hand.
      if ('revision' in command && command.revision !== room.revision
        && !(command.operation === 'pass' && room.game?.kind === 'hearts' && room.game.state.phase === 'pass' && command.round === room.game.state.round)) throw STALE();
      if (command.operation === 'leave') {
        room.players = room.players.filter(value => value !== player);
        if (room.game) room.game.tier = null;
        if (room.game?.kind === 'hearts') delete room.game.passes[player.seat];
        if (room.host === principal && room.players.length) {
          room.host = room.players[0]!.principal;
          room.players[0]!.ready = true;
        }
        pump(room, now);
      } else if (command.operation === 'ready') {
        if (room.game || room.host === principal) throw new RummyError('Ready is available for guests in the table lobby.');
        player.ready = command.ready;
      } else if (command.operation === 'start') {
        if (room.game || room.host !== principal || room.players.length < 2 || room.players.some(value => !value.ready)) {
          throw new RummyError('The host can start once at least two players are seated and everyone is ready.');
        }
        start(room, now);
      } else if (command.operation === 'rematch') {
        const ended = room.game?.kind === 'eights' ? room.game.state.winners.length > 0 : room.game?.state.phase === 'match';
        if (!ended || room.host !== principal) throw new RummyError('The host can reopen the lobby after the match.');
        if (room.options.capacity === 1) start(room, now);
        else {
          room.game = null;
          for (const value of room.players) value.ready = value.principal === principal;
        }
      } else move(room, player, command, now);
    }

    const db = new CloudDatabase(this.binding);
    await db.exec('BEGIN IMMEDIATE');
    db.expectRoom('classic_card_rooms', room.code, room.revision);
    room.revision++;
    room.updatedAt = now;
    await db.prepare('INSERT INTO classic_card_rooms (code,data) VALUES (?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data').run(room.code, JSON.stringify(room));
    await this.recordWin(db, room, hadWinner && command.operation !== 'rematch');
    const code = command.operation === 'leave' ? null : room.code;
    await db.prepare('INSERT INTO classic_card_requests (principal,request_id,payload,code,created_at) VALUES (?,?,?,?,?)')
      .run(principal, command.requestId, payload, code, now);
    if (command.operation === 'create') await db.prepare('DELETE FROM classic_card_requests WHERE created_at<?').run(now - RECEIPT_FOR);
    try { await db.exec('COMMIT'); }
    catch (cause) {
      const recorded = await receipt();
      if (recorded) return replay(recorded);
      if (attempts > 1 && cause instanceof RummyError && cause.status === 409
        && ['create', 'join', 'pass', 'leave'].includes(command.operation)) return this.command(kind, actor, input, attempts - 1);
      throw cause;
    }
    return code ? view(room, principal) : null;
  }
}
