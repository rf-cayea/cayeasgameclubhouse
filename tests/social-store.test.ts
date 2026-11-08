import { initializeFiveDiceNode } from '../server/five-dice-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RoomStore } from '../server/rooms';
import { SpadesRoomStore } from '../server/spades-rooms';
import { SocialStore, type SocialIdentity } from '../server/social';
import { initializeSocialNode, nodeSocialBinding } from '../server/social-node';
import { namedGameCommand } from '../server/social-members';
import type { D1Binding } from '../server/database';
import type { FriendActivity, FriendsView, InvitesView, PlayerProfile, SocialGame } from '../src/lib/social-protocol';
import { TestD1 } from './helpers/d1';

// Fixtures are server-owned positions and identities, never live account data.
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const d = '44444444-4444-4444-8444-444444444444';
const actor = (id: string): SocialIdentity => ({ principal: `member:${id}` });
const close: (() => void)[] = [];
afterEach(() => { vi.restoreAllMocks(); close.splice(0).forEach(fn => fn()); });

function setup(backend: 'node' | 'd1') {
  const hosted = backend === 'd1' ? new TestD1() : null;
  const local = hosted ? null : new RoomStore(':memory:');
  const raw = hosted?.sqlite ?? local!.db;
  if (local) { initializeFiveDiceNode(raw); new SpadesRoomStore(raw); initializeSocialNode(raw); initializeSocialNode(raw); }
  close.push(() => raw.close());
  const binding = hosted ?? nodeSocialBinding(raw), store = new SocialStore(binding);
  const read = <T>(id: string, path: string) => store.read(actor(id), new URL('https://clubhouse.test/api/social/' + path)) as Promise<T>;
  const command = (id: string, input: unknown) => store.command(actor(id), input);
  const initialize = async (...ids: string[]) => { for (const id of ids) await store.ensureProfile(actor(id)); };
  const friends = async (one = a, two = b) => {
    await initialize(one, two);
    await command(one, { operation: 'request', targetUserId: two });
    await command(two, { operation: 'accept', targetUserId: one });
  };
  const room = (game: SocialGame, code = 'ABC123DE', owner = a) => {
    const value = { code, owner: `member:${owner}`, status: 'waiting', options: { mode: 'online', variant: game === 'rummy' ? 'classic' : 'solo', seats: 2, humans: 2 },
      members: [{ principal: `member:${owner}`, id: owner, seat: 0, name: 'Host', ready: true }], revision: 1, state: null };
    raw.prepare(`INSERT INTO ${game === 'rummy' ? 'rooms' : 'spades_rooms'}(code,data,updated_at) VALUES(?,?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`).run(code, JSON.stringify(value), Date.now());
    return value;
  };
  return { raw, binding, store, read, command, initialize, friends, room };
}

/** Force a real competing write after a command's authorization read but before
 * its mutation. The production statement must repeat the authorization check. */
function beforeWrite(binding: D1Binding, matches: (sql: string) => boolean, effect: () => void): D1Binding {
  let armed = true;
  return {
    prepare(sql) {
      const statement = binding.prepare(sql), run = statement.run.bind(statement);
      statement.run = async () => { if (armed && matches(sql)) { armed = false; effect(); } return run(); };
      return statement;
    },
    batch: statements => binding.batch(statements),
  };
}

describe.each(['node', 'd1'] as const)('social persistence and race guards on %s', backend => {
  it('reserves stable unique default names even when account UUID prefixes collide', async () => {
    const { store, raw } = setup(backend);
    const collisions = [a, '11111111-1111-4111-8222-222222222222', '11111111-1111-4111-8333-333333333333'];
    const profiles = await Promise.all(collisions.map(id => store.ensureProfile(actor(id))));
    expect(new Set(profiles.map(profile => profile.gamerName.toLowerCase())).size).toBe(3);
    for (let n = 0; n < profiles.length; n++) {
      expect(profiles[n]!.gamerName).toMatch(/^[A-Za-z0-9_]{3,24}$/);
      expect(await store.ensureProfile(actor(collisions[n]!))).toEqual(profiles[n]);
    }
    expect(raw.prepare('SELECT count(*) AS n FROM social_profiles').get()!.n).toBe(3);
  });

  it('does not let profile input remove a moderation flag or spoof a member seat name', async () => {
    const { store, command, read } = setup(backend);
    await command(a, { operation: 'profile', gamerName: 'JadeCaptain', avatar: 'jade', bio: 'Friendly card player.' });
    expect((await store.ensureProfile({ ...actor(a), nameFlagged: true })).gamerName).toBe('Player');
    await expect(command(a, { operation: 'profile', gamerName: 'FlagBypass', avatar: 'moon', bio: '', nameFlagged: false })).rejects.toMatchObject({ status: 403, code: 'name_flagged' });
    expect(await read<PlayerProfile>(a, 'me')).toMatchObject({ gamerName: 'Player', bio: '', nameFlagged: true });
    const commandInput = { operation: 'join', code: 'ABC123DE', name: 'Spoofed caller name' };
    expect(await namedGameCommand(store, { ...actor(a), jokers: false }, commandInput)).toMatchObject({ name: 'Player' });
    const restored = await store.ensureProfile({ ...actor(a), nameFlagged: false });
    expect(restored).toMatchObject({ gamerName: 'JadeCaptain', nameFlagged: false });
    expect(await namedGameCommand(store, { ...actor(a), jokers: false }, commandInput)).toMatchObject({ name: 'JadeCaptain' });
    expect(await namedGameCommand(store, { principal: 'guest:fixture', jokers: false }, commandInput)).toEqual(commandInput);
  });

  it('rejects reserved names, unsafe bios and invalid mutations without editing another account', async () => {
    const { command, initialize, read } = setup(backend); await initialize(a, b);
    const before = await read<PlayerProfile>(b, 'me');
    for (const gamerName of ['admin', 'moderator', 'system', 'player_reserved', 'bad_<tag>', 'bad name', 'a'.repeat(25), 'shit_player']) {
      await expect(command(a, { operation: 'profile', gamerName, avatar: 'jade', bio: '' })).rejects.toMatchObject({ status: 400 });
    }
    for (const change of [{ bio: 'x'.repeat(161) }, { bio: '<script>text</script>' }, { bio: '\u0000' }, { avatar: 'missing-preset' }]) {
      await expect(command(a, { operation: 'profile', gamerName: 'ValidGamer', bio: '', avatar: 'jade', ...change })).rejects.toMatchObject({ status: 400 });
    }
    for (const input of [null, [], { operation: 'unknown', targetUserId: b }, { operation: 'block', targetUserId: a }, { operation: 'request', targetUserId: 'not-a-uuid' }]) {
      await expect(command(a, input)).rejects.toMatchObject({ status: 400 });
    }
    await command(a, { operation: 'profile', gamerName: 'ActualOwner', bio: '', avatar: 'jade', userId: b });
    expect(await read<PlayerProfile>(b, 'me')).toEqual(before);
    expect((await read<PlayerProfile>(a, 'me')).gamerName).toBe('ActualOwner');
  });

  it('makes crossed requests mutually accepted once, and honors cancel/decline direction', async () => {
    const { initialize, command, read, raw } = setup(backend); await initialize(a, b);
    await Promise.all([command(a, { operation: 'request', targetUserId: b }), command(b, { operation: 'request', targetUserId: a })]);
    expect((await read<FriendsView>(a, 'friends')).friends.map(profile => profile.userId)).toEqual([b]);
    expect(raw.prepare('SELECT count(*) AS n FROM social_friends').get()!.n).toBe(1);
    await command(a, { operation: 'remove', targetUserId: b });
    await command(a, { operation: 'request', targetUserId: b });
    await command(b, { operation: 'cancel', targetUserId: a });
    await command(a, { operation: 'decline', targetUserId: b });
    expect((await read<FriendsView>(b, 'friends')).incoming.map(profile => profile.userId)).toEqual([a]);
    await command(b, { operation: 'decline', targetUserId: a });
    expect((await read<FriendsView>(a, 'friends')).outgoing).toEqual([]);
    await command(a, { operation: 'request', targetUserId: b });
    await command(a, { operation: 'cancel', targetUserId: b });
    expect((await read<FriendsView>(b, 'friends')).incoming).toEqual([]);
  });

  it.each(['request', 'accept'] as const)('prevents a competing block from being bypassed by %s', async operation => {
    const { raw, binding, initialize, command, read } = setup(backend); await initialize(a, b);
    if (operation === 'accept') await command(b, { operation: 'request', targetUserId: a });
    const blockedBinding = beforeWrite(binding, sql => operation === 'request' ? sql.includes('INSERT INTO social_friends') : sql.includes('UPDATE social_friends SET status='), () => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        raw.prepare('INSERT INTO social_blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').run(b, a, Date.now());
        raw.prepare('DELETE FROM social_friends WHERE low_id=? AND high_id=?').run(a, b);
        raw.exec('COMMIT');
      } catch (error) { raw.exec('ROLLBACK'); throw error; }
    });
    await expect(new SocialStore(blockedBinding).command(actor(a), { operation, targetUserId: b })).rejects.toMatchObject({ status: 409 });
    expect(raw.prepare('SELECT count(*) AS n FROM social_friends').get()!.n).toBe(0);
    expect((await read<FriendsView>(b, 'friends')).blocked.map(profile => profile.userId)).toEqual([a]);
    await expect(read(a, 'players/' + b)).rejects.toMatchObject({ status: 404 });
    await command(a, { operation: 'unblock', targetUserId: b });
    expect(raw.prepare('SELECT count(*) AS n FROM social_blocks').get()!.n).toBe(1);
    await expect(command(a, { operation: 'request', targetUserId: b })).rejects.toMatchObject({ status: 403 });
  });

  it.each(['rummy', 'spades'] as const)('expires and cancels %s invitations, including already accepted ones', async game => {
    const { friends, room, command, read, raw } = setup(backend); await friends();
    const now = Date.now(); const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    room(game);
    const first = (await command(a, { operation: 'invite', game, code: 'ABC123DE', targetUserId: b, senderId: c })).invite!;
    const repeated = (await command(a, { operation: 'invite', game, code: 'ABC123DE', targetUserId: b })).invite!;
    expect(first.sender.userId).toBe(a); expect(repeated.id).toBe(first.id); expect(repeated.expiresAt).toBe(first.expiresAt);
    await expect(command(a, { operation: 'accept_invite', inviteId: first.id })).rejects.toMatchObject({ status: 403 });
    clock.mockReturnValue(first.expiresAt + 1);
    const expired = (await read<InvitesView>(b, 'invites')).incoming[0]!;
    expect(expired).toMatchObject({ id: first.id, status: 'expired', available: false });
    await expect(command(b, { operation: 'accept_invite', inviteId: first.id })).rejects.toMatchObject({ status: 409 });
    const renewed = (await command(a, { operation: 'invite', game, code: 'ABC123DE', targetUserId: b })).invite!;
    expect(renewed).toMatchObject({ id: first.id, status: 'pending', available: true });
    expect(renewed.expiresAt).toBeGreaterThan(first.expiresAt);
    expect(raw.prepare('SELECT count(*) AS n FROM social_invites').get()!.n).toBe(1);
    await command(b, { operation: 'accept_invite', inviteId: first.id });
    const cancelled = await command(a, { operation: 'cancel_invite', inviteId: first.id });
    expect(cancelled.invite).toMatchObject({ status: 'cancelled', available: false });
    await expect(command(b, { operation: 'accept_invite', inviteId: first.id })).rejects.toMatchObject({ status: 409 });
    await command(a, { operation: 'invite', game, code: 'ABC123DE', targetUserId: b });
    await command(b, { operation: 'accept_invite', inviteId: first.id });
    expect((await command(b, { operation: 'decline_invite', inviteId: first.id })).invite).toMatchObject({ status: 'declined', available: false });
  });

  it.each((['rummy', 'spades'] as const).flatMap(game => (['owner', 'capacity'] as const).map(change => ({ game, change }))))('rechecks $game table $change after the invitation authorization read', async ({ game, change }) => {
    const { raw, binding, friends, room, read } = setup(backend); await friends();
    const table = room(game);
    const competing = beforeWrite(binding, sql => sql.includes('INSERT INTO social_invites'), () => {
      if (change === 'owner') table.owner = `member:${c}`;
      else table.members.push({ principal: `member:${c}`, id: c, seat: 1, name: 'Competing seat', ready: true });
      raw.prepare(`UPDATE ${game === 'rummy' ? 'rooms' : 'spades_rooms'} SET data=? WHERE code=?`).run(JSON.stringify(table), table.code);
    });
    await expect(new SocialStore(competing).command(actor(a), { operation: 'invite', game, code: table.code, targetUserId: b })).rejects.toMatchObject({ status: 409 });
    expect(raw.prepare('SELECT count(*) AS n FROM social_invites').get()!.n).toBe(0);
    expect((await read<InvitesView>(a, 'invites')).rooms).toEqual([]);
  });

  it('rolls back all relationship changes if any statement in a block transaction fails', async () => {
    const { raw, binding, friends, room, command, read } = setup(backend); await friends(); room('rummy');
    const invitation = (await command(a, { operation: 'invite', game: 'rummy', code: 'ABC123DE', targetUserId: b })).invite!;
    const broken: D1Binding = { prepare: sql => binding.prepare(sql), batch: statements => binding.batch([...statements, binding.prepare('INSERT INTO no_such_test_table VALUES(1)')]) };
    await expect(new SocialStore(broken).command(actor(a), { operation: 'block', targetUserId: b })).rejects.toThrow();
    expect(raw.prepare('SELECT count(*) AS n FROM social_blocks').get()!.n).toBe(0);
    expect((await read<FriendsView>(a, 'friends')).friends.map(profile => profile.userId)).toEqual([b]);
    expect((await read<InvitesView>(b, 'invites')).incoming[0]).toMatchObject({ id: invitation.id, status: 'pending', available: true });
  });

  it('derives profile wins and private friend activity only from trusted match records', async () => {
    const { raw, initialize, friends, command, read } = setup(backend); await initialize(a, b, c, d); await friends();
    await command(c, { operation: 'request', targetUserId: b });
    for (const [n, userId] of [a, a, b, c].entries()) {
      const matchId = randomUUID(), payload = { completed_at: `2026-11-03T10:0${n}:00.000Z` };
      raw.prepare('INSERT INTO reward_outbox(match_id,room_code,user_id,payload,status) VALUES(?,?,?,?,?)').run(matchId, 'ABC123DE', userId, JSON.stringify(payload), n % 2 ? 'credited' : 'pending');
    }
    const base = [a, b, c, d].map(user_id => ({ user_id, bot: false, level: null }));
    const wins = [
      { variant: 'solo', winner: 0, players: base },
      { variant: 'teams', winner: 0, players: base },
      { variant: 'teams', winner: 1, players: [base[0], base[1], base[2], { user_id: a, bot: true, level: 'normal' }] },
    ];
    wins.forEach((win, n) => raw.prepare('INSERT INTO spades_rewards(match_id,room_code,payload) VALUES(?,?,?)').run(randomUUID(), 'ABC123DE', JSON.stringify({ ...win, completed_at: `2026-11-03T11:0${n}:00.000Z` })));
    expect((await read<PlayerProfile>(a, 'me')).stats).toEqual({ rummyWins: 2, spadesWins: 2 });
    expect((await read<PlayerProfile>(b, 'me')).stats).toEqual({ rummyWins: 1, spadesWins: 1 });
    expect((await read<PlayerProfile>(c, 'me')).stats).toEqual({ rummyWins: 1, spadesWins: 1 });
    const activity = (await read<{ activity: FriendActivity[] }>(b, 'activity')).activity;
    expect(activity).toHaveLength(4);
    expect(activity.every(event => event.player.userId === a)).toBe(true);
    expect(activity.map(event => event.completedAt)).toEqual([...activity.map(event => event.completedAt)].sort().reverse());
    expect(JSON.stringify(activity)).not.toMatch(/participants|payload|email|wallet|points|access_token/);
    await command(b, { operation: 'remove', targetUserId: a });
    expect((await read<{ activity: FriendActivity[] }>(b, 'activity')).activity).toEqual([]);
  });
  it('includes only a friend’s trusted Farkle win, excluding ties, computer wins, outsiders and blocked players', async () => {
    const {raw,initialize,friends,command,read}=setup(backend);await initialize(a,b,c);await friends(a,b);
    const insert=(winner:number|null,participants:{user_id:string|null;bot:boolean}[],minute:number)=>{
      const id=randomUUID(),payload={version:1,match_id:id,mode:'online',players:participants,winner,scores:participants.map((_,seat)=>seat===winner?250:100),completed_at:`2026-11-03T12:0${minute}:00.000Z`};
      raw.prepare('INSERT INTO five_dice_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)').run(id,'ABC123DE',JSON.stringify(payload),Date.now());return id;
    };
    const match=insert(0,[{user_id:a,bot:false},{user_id:b,bot:false}],1);
    insert(null,[{user_id:a,bot:false},{user_id:b,bot:false}],2);
    insert(1,[{user_id:a,bot:false},{user_id:null,bot:true}],3);
    insert(0,[{user_id:c,bot:false},{user_id:b,bot:false}],4);
    const view=(await read<{activity:FriendActivity[]}>(b,'activity')).activity;
    expect(view).toHaveLength(1);expect(view[0]).toMatchObject({id:`five-dice:${match}:${a}`,game:'five-dice',player:{userId:a}});
    expect(JSON.stringify(view)).not.toMatch(/payload|scores|"dice"|email|wallet|points|access_token/);
    await command(b,{operation:'block',targetUserId:a});expect((await read<{activity:FriendActivity[]}>(b,'activity')).activity).toEqual([]);
  });

});
