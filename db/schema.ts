import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// The hosted room service uses these names directly in its D1 statements.
export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  data: text('data').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('rooms_updated').on(table.updatedAt)]);

export const requests = sqliteTable('requests', {
  code: text('code').notNull(),
  actor: text('actor').notNull(),
  id: text('id').notNull(),
  fingerprint: text('fingerprint').notNull(),
}, table => [primaryKey({ columns: [table.code, table.actor, table.id] })]);

export const sessions = sqliteTable('sessions', {
  hash: text('hash').primaryKey(),
  seen: integer('seen').notNull(),
});

export const rewardOutbox = sqliteTable('reward_outbox', {
  matchId: text('match_id').primaryKey(),
  roomCode: text('room_code').notNull(),
  userId: text('user_id').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttempt: integer('next_attempt').notNull().default(0),
  lease: text('lease'),
  leaseUntil: integer('lease_until').notNull().default(0),
  receipt: text('receipt'),
}, table => [index('rummy_reward_due').on(table.status, table.nextAttempt, table.leaseUntil), index('rummy_wins_by_user').on(table.userId)]);

export const rummyAppearance = sqliteTable('rummy_appearance', {
  principal: text('principal').primaryKey(),
  background: text('background').notNull(),
  tableId: text('table_id').notNull(),
  deckId: text('deck_id').notNull().default('rummy-standard'),
  updatedAt: integer('updated_at').notNull(),
});

export const spadesRooms = sqliteTable('spades_rooms', {
  code: text('code').primaryKey(),
  data: text('data').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('spades_rooms_updated').on(table.updatedAt)]);

export const spadesRequests = sqliteTable('spades_requests', {
  code: text('code').notNull(),
  actor: text('actor').notNull(),
  id: text('id').notNull(),
  fingerprint: text('fingerprint').notNull(),
}, table => [primaryKey({ columns: [table.code, table.actor, table.id] })]);

export const spadesRewards = sqliteTable('spades_rewards', {
  matchId: text('match_id').primaryKey(),
  roomCode: text('room_code').notNull(),
  payload: text('payload').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttempt: integer('next_attempt').notNull().default(0),
  lease: text('lease'),
  leaseUntil: integer('lease_until').notNull().default(0),
  receipt: text('receipt'),
}, table => [index('spades_reward_due').on(table.status, table.nextAttempt, table.leaseUntil)]);

export const commandGuards = sqliteTable('command_guards', {
  valid: integer('valid').notNull(),
}, table => [check('room_revision_matches', sql`${table.valid}=1`)]);

export const apiLimits = sqliteTable('api_limits', {
  identity: text('identity').primaryKey(),
  bucket: integer('bucket').notNull(),
  count: integer('count').notNull(),
});

export const socialProfiles = sqliteTable('social_profiles', {
  userId: text('user_id').primaryKey(),
  gamerName: text('gamer_name').notNull(),
  nameKey: text('name_key').notNull().unique(),
  bio: text('bio').notNull().default(''),
  avatar: text('avatar').notNull().default('jade'),
  nameFlagged: integer('name_flagged').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [check('social_profile_name_key', sql`${table.nameKey}=lower(${table.gamerName})`)]);

export const socialFriends = sqliteTable('social_friends', {
  lowId: text('low_id').notNull().references(() => socialProfiles.userId),
  highId: text('high_id').notNull().references(() => socialProfiles.userId),
  requesterId: text('requester_id').notNull().references(() => socialProfiles.userId),
  status: text('status').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [primaryKey({ columns: [table.lowId, table.highId] }), check('social_friend_pair_order', sql`${table.lowId}<${table.highId}`), check('social_friend_status', sql`${table.status} in ('pending','accepted')`), check('social_requester_in_pair', sql`${table.requesterId} in (${table.lowId},${table.highId})`)]);

export const socialBlocks = sqliteTable('social_blocks', {
  blockerId: text('blocker_id').notNull().references(() => socialProfiles.userId),
  blockedId: text('blocked_id').notNull().references(() => socialProfiles.userId),
  createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.blockerId, table.blockedId] }), check('social_block_not_self', sql`${table.blockerId}<>${table.blockedId}`)]);

export const socialInvites = sqliteTable('social_invites', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').notNull().references(() => socialProfiles.userId),
  recipientId: text('recipient_id').notNull().references(() => socialProfiles.userId),
  game: text('game').notNull(),
  roomCode: text('room_code').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('social_invites_recipient').on(table.recipientId, table.createdAt), index('social_invites_sender').on(table.senderId, table.createdAt),
  index('social_invite_room').on(table.game, table.roomCode), uniqueIndex('social_invites_pair_room').on(table.senderId, table.recipientId, table.game, table.roomCode),
  check('social_invite_not_self', sql`${table.senderId}<>${table.recipientId}`),
  check('social_invite_game', sql`${table.game} in ('rummy','spades')`),
  check('social_invite_status', sql`${table.status} in ('pending','accepted','declined','cancelled')`)]);

// Canonical earned points, virtual Clubhouse Cash and server-verified badges.
export const economyWallets = sqliteTable('economy_wallets', {
  userId: text('user_id').primaryKey(),
  points: integer('points').notNull().default(0), f3Points: integer('f3_points').notNull().default(0),
  gemsPoints: integer('gems_points').notNull().default(0), rummyPoints: integer('rummy_points').notNull().default(0), spadesPoints: integer('spades_points').notNull().default(0), dicePoints: integer('dice_points').notNull().default(0), dominoPoints: integer('domino_points').notNull().default(0),
  lifetimePoints: integer('lifetime_points').notNull().default(0), owned: text('owned').notNull().default('[]'),
  equipped: text('equipped').notNull().default('{}'), pendingPerks: text('pending_perks').notNull().default('{}'),
  revision: integer('revision').notNull().default(0), importToken: text('import_token').notNull(), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, table => [check('economy_balances_nonnegative',sql`${table.points}>=0 and ${table.f3Points}>=0 and ${table.gemsPoints}>=0 and ${table.rummyPoints}>=0 and ${table.spadesPoints}>=0 and ${table.lifetimePoints}>=0`)]);
export const economyLedger = sqliteTable('economy_ledger', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(()=>economyWallets.userId), source: text('source').notNull(),
  kind: text('kind').notNull(), currency: text('currency').notNull(), amount: integer('amount').notNull(), cash: integer('cash').notNull().default(0),
  label: text('label').notNull(), detail: text('detail').notNull().default('{}'), createdAt: integer('created_at').notNull(),
},table=>[uniqueIndex('economy_award_source').on(table.userId,table.source),index('economy_history').on(table.userId,table.createdAt)]);
export const economyProgress = sqliteTable('economy_progress',{
  userId:text('user_id').notNull().references(()=>economyWallets.userId),game:text('game').notNull(),level:integer('level').notNull(),stars:integer('stars').notNull().default(1),createdAt:integer('created_at').notNull(),
},table=>[primaryKey({columns:[table.userId,table.game,table.level]}),check('economy_progress_range',sql`${table.game} in ('faith-3','3-gems') and ${table.level} between 1 and case when ${table.game}='faith-3' then 280 else 150 end and ${table.stars} between 1 and 3`)]);
export const economyVisits = sqliteTable('economy_visits',{
  userId:text('user_id').notNull().references(()=>economyWallets.userId),day:text('day').notNull(),
},table=>[primaryKey({columns:[table.userId,table.day]})]);
// Additive expansion keeps the original 1–150 progress table and paid rewards intact.
export const gemsExtendedProgress = sqliteTable('gems_extended_progress', {
  userId: text('user_id').notNull().references(() => economyWallets.userId), level: integer('level').notNull(), stars: integer('stars').notNull().default(1), createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.level] }), check('gems_extended_range', sql`${table.level} between 151 and 200 and ${table.stars} between 1 and 3`)]);
export const puzzleRuns = sqliteTable('puzzle_runs',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),game:text('game').notNull(),level:integer('level').notNull(),attempt:integer('attempt').notNull(),expiresAt:integer('expires_at').notNull(),status:text('status').notNull().default('open'),proof:text('proof'),createdAt:integer('created_at').notNull(),rulesVersion:integer('rules_version').notNull().default(1),
},table=>[index('puzzle_runs_member_game').on(table.userId,table.game)]);

export const gemsMonastery = sqliteTable('gems_monastery', {
  userId: text('user_id').primaryKey(), completedTasks: integer('completed_tasks').notNull().default(0), updatedAt: integer('updated_at').notNull(), workshop: text('workshop').notNull().default('{}'),
}, table => [check('monastery_task_range', sql`${table.completedTasks} between 0 and 50`)]);
export const monasteryRequests = sqliteTable('monastery_requests', {
  userId: text('user_id').notNull(), requestId: text('request_id').notNull(), actionKey: text('action_key').notNull(), createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.userId, table.requestId] })]);

// Trusted, one-time account allowances. No browser command can create these rows.
export const economyAllowances = sqliteTable('economy_allowances', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), targetCash: integer('target_cash').notNull(),
  reason: text('reason').notNull(), createdAt: integer('created_at').notNull(), appliedAt: integer('applied_at'),
}, table => [index('economy_allowances_member').on(table.userId, table.appliedAt), check('economy_allowance_target', sql`${table.targetCash} between 0 and 2000000000`)]);

// Server-owned Quintsee tables and idempotent command receipts.
export const fiveDiceRooms = sqliteTable('five_dice_rooms', {
  code: text('code').primaryKey(), data: text('data').notNull(),
});
export const fiveDiceRequests = sqliteTable('five_dice_requests', {
  principal: text('principal').notNull(), requestId: text('request_id').notNull(), payload: text('payload').notNull(), response: text('response').notNull(), createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.principal, table.requestId] })]);
export const fiveDiceRewards = sqliteTable('five_dice_rewards', {
  matchId: text('match_id').primaryKey(), roomCode: text('room_code').notNull(), payload: text('payload').notNull(), createdAt: integer('created_at').notNull(),
});

export const dominoRooms = sqliteTable('domino_rooms', {
  code: text('code').primaryKey(), data: text('data').notNull(),
});
export const dominoRequests = sqliteTable('domino_requests', {
  principal: text('principal').notNull(), requestId: text('request_id').notNull(), payload: text('payload').notNull(), response: text('response').notNull(), createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.principal, table.requestId] })]);
export const dominoRewards = sqliteTable('domino_rewards', {
  matchId: text('match_id').primaryKey(), roomCode: text('room_code').notNull(), payload: text('payload').notNull(), createdAt: integer('created_at').notNull(),
});

// Public discovery is opt-in; game rooms remain authoritative and private.
export const matchmakingListings = sqliteTable('matchmaking_listings', {
  game: text('game').notNull(), code: text('code').notNull(), owner: text('owner').notNull(), createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, table => [primaryKey({columns:[table.game,table.code]}),uniqueIndex('matchmaking_owner').on(table.game,table.owner),index('matchmaking_available').on(table.game,table.expiresAt)]);

// Classic six-dice Farkle rooms, command receipts, and trusted rewards.
export const farkleRooms = sqliteTable('farkle_rooms', {
  code: text('code').primaryKey(), data: text('data').notNull(),
});
export const farkleRequests = sqliteTable('farkle_requests', {
  principal: text('principal').notNull(), requestId: text('request_id').notNull(), payload: text('payload').notNull(), response: text('response').notNull(), createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.principal, table.requestId] })]);
export const farkleRewards = sqliteTable('farkle_rewards', {
  matchId: text('match_id').primaryKey(), roomCode: text('room_code').notNull(), payload: text('payload').notNull(), createdAt: integer('created_at').notNull(),
});

export const crownCourtRooms = sqliteTable('crown_court_rooms', {
  code: text('code').primaryKey(), data: text('data').notNull(),
});
export const crownCourtRequests = sqliteTable('crown_court_requests', {
  principal: text('principal').notNull(), requestId: text('request_id').notNull(), payload: text('payload').notNull(), response: text('response').notNull(), createdAt: integer('created_at').notNull(),
}, table => [primaryKey({ columns: [table.principal, table.requestId] })]);
export const crownCourtRewards = sqliteTable('crown_court_rewards', {
  matchId: text('match_id').primaryKey(), roomCode: text('room_code').notNull(), payload: text('payload').notNull(), createdAt: integer('created_at').notNull(),
});

export const backgammonRooms = sqliteTable('backgammon_rooms', {code:text('code').primaryKey().notNull(),data:text('data').notNull()});
export const backgammonRequests = sqliteTable('backgammon_requests', {principal:text('principal').notNull(),requestId:text('request_id').notNull(),payload:text('payload').notNull(),response:text('response').notNull(),createdAt:integer('created_at').notNull()},t=>[primaryKey({columns:[t.principal,t.requestId]})]);
export const backgammonRewards = sqliteTable('backgammon_rewards', {matchId:text('match_id').primaryKey().notNull(),roomCode:text('room_code').notNull(),payload:text('payload').notNull(),createdAt:integer('created_at').notNull()});

export const collectibleAlbums=sqliteTable('collectible_albums',{userId:text('user_id').primaryKey().notNull(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const collectibleTrades=sqliteTable('collectible_trades',{id:text('id').primaryKey().notNull(),seller:text('seller').notNull(),buyer:text('buyer').notNull(),giveCard:text('give_card').notNull(),wantCard:text('want_card'),price:integer('price').notNull(),status:text('status').notNull(),createdAt:integer('created_at').notNull()},t=>[index('collectible_trade_seller').on(t.seller,t.status),index('collectible_trade_buyer').on(t.buyer,t.status)]);

export const carromRooms = sqliteTable('carrom_rooms', {code:text('code').primaryKey().notNull(),data:text('data').notNull()});
export const carromRequests = sqliteTable('carrom_requests', {principal:text('principal').notNull(),requestId:text('request_id').notNull(),payload:text('payload').notNull(),response:text('response').notNull(),createdAt:integer('created_at').notNull()},t=>[primaryKey({columns:[t.principal,t.requestId]})]);
export const carromRewards = sqliteTable('carrom_rewards', {matchId:text('match_id').primaryKey().notNull(),roomCode:text('room_code').notNull(),payload:text('payload').notNull(),createdAt:integer('created_at').notNull()});
