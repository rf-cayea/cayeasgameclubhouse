import { profileFrameItem, customProfileImage } from '../src/lib/profile-image';
import { randomUUID } from 'node:crypto';
import type { D1Binding } from './database';
import { RummyError } from '../src/lib/rummy-protocol';
import { memberId } from '../src/lib/rummy-rewards';
import { containsProfanity } from '../src/lib/moderation';
import { PROFILE_AVATARS, type PlayerProfile, type FriendsView, type InvitesView, type GameInvite, type WaitingTable, type FriendActivity, type SocialCommandResult, type SocialGame } from '../src/lib/social-protocol';

export interface SocialIdentity { principal: string; nameFlagged?: boolean }
const VIEWER = '(SELECT id FROM viewer)';
const CTE = 'WITH viewer(id) AS (VALUES (?)) ';
const uid = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : null;
const blocked = (a: string, b: string) => `EXISTS(SELECT 1 FROM social_blocks WHERE (blocker_id=${a} AND blocked_id=${b}) OR (blocker_id=${b} AND blocked_id=${a}))`;
const linked = (a: string, b: string) => `EXISTS(SELECT 1 FROM social_friends WHERE low_id=min(${a},${b}) AND high_id=max(${a},${b}) AND status='accepted')`;
const memberPrincipal = (id: string) => `('member:' || ${id})`;
const relationship = (p: string) => `CASE WHEN ${p}.user_id=${VIEWER} THEN 'self'
  WHEN EXISTS(SELECT 1 FROM social_blocks WHERE blocker_id=${VIEWER} AND blocked_id=${p}.user_id) THEN 'blocked'
  WHEN ${linked(VIEWER, `${p}.user_id`)} THEN 'friends'
  WHEN EXISTS(SELECT 1 FROM social_friends WHERE low_id=min(${VIEWER},${p}.user_id) AND high_id=max(${VIEWER},${p}.user_id) AND requester_id=${VIEWER}) THEN 'outgoing'
  WHEN EXISTS(SELECT 1 FROM social_friends WHERE low_id=min(${VIEWER},${p}.user_id) AND high_id=max(${VIEWER},${p}.user_id)) THEN 'incoming' ELSE 'none' END`;
const spadesWinner = (id: string) => `EXISTS(SELECT 1 FROM json_each(sw.payload,'$.players') winner WHERE json_extract(winner.value,'$.user_id')=${id} AND json_extract(winner.value,'$.bot')=0 AND
  CASE WHEN json_extract(sw.payload,'$.variant')='teams' THEN CAST(winner.key AS INTEGER)%2 ELSE CAST(winner.key AS INTEGER) END=json_extract(sw.payload,'$.winner'))`;
const profileJSON = (p: string) => `json_object('userId',${p}.user_id,'gamerName',CASE WHEN ${p}.name_flagged=1 THEN 'Player' ELSE ${p}.gamer_name END,
  'bio',CASE WHEN ${p}.name_flagged=1 THEN '' ELSE ${p}.bio END,'avatar',${p}.avatar,'joinedAt',${p}.created_at,'updatedAt',${p}.updated_at,'nameFlagged',${p}.name_flagged,
  'relationship',${relationship(p)},'stats',json_object('rummyWins',(SELECT count(*) FROM reward_outbox rw WHERE rw.user_id=${p}.user_id),
  'spadesWins',(SELECT count(*) FROM spades_rewards sw WHERE ${spadesWinner(`${p}.user_id`)})))`;
const roomTable = (game: SocialGame) => game === 'rummy' ? 'rooms' : 'spades_rooms';
const capacity = (game: SocialGame) => `json_extract(r.data,'$.options.${game === 'rummy' ? 'seats' : 'humans'}')`;
const roomEligible = (game: SocialGame, code: string, sender: string, recipient?: string) => `EXISTS(SELECT 1 FROM ${roomTable(game)} r WHERE r.code=${code}
  AND json_extract(r.data,'$.owner')=${memberPrincipal(sender)} AND json_extract(r.data,'$.status')='waiting' AND json_extract(r.data,'$.options.mode')='online'
  AND json_array_length(r.data,'$.members')<${capacity(game)} ${recipient ? `AND NOT EXISTS(SELECT 1 FROM json_each(r.data,'$.members') seated WHERE json_extract(seated.value,'$.principal')=${memberPrincipal(recipient)})` : ''})`;
const inviteRoomEligible = (alias: string) => `(CASE WHEN ${alias}.game='rummy' THEN ${roomEligible('rummy', `${alias}.room_code`, `${alias}.sender_id`, `${alias}.recipient_id`)} ELSE ${roomEligible('spades', `${alias}.room_code`, `${alias}.sender_id`, `${alias}.recipient_id`)} END)`;
const normalizeProfile = (profile: PlayerProfile): PlayerProfile => ({ ...profile, nameFlagged: Boolean(profile.nameFlagged) });
const normalizeInvite = (invite: GameInvite): GameInvite => ({ ...invite, sender: normalizeProfile(invite.sender), recipient: normalizeProfile(invite.recipient), available: Boolean(invite.available) });

/** All identity and authorization is derived from a verified member principal.
 * Conditional SQL repeats authorization at the write, including block/room races. */
export class SocialStore {
  constructor(readonly binding: D1Binding) {}
  private async first<T = Record<string, unknown>>(sql: string, ...values: unknown[]) { return this.binding.prepare(sql).bind(...values).first<T>(); }
  private async rows<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    const result = await this.first<{ data: string }>(sql, ...values);
    return JSON.parse(result?.data ?? '[]') as T[];
  }
  private actor(identity: SocialIdentity) {
    const id = memberId(identity.principal);
    if (!id) throw new RummyError('Sign in to use player profiles and friends.', 401, 'sign_in_required');
    return id;
  }
  async ensureProfile(identity: SocialIdentity): Promise<PlayerProfile> {
    const id = this.actor(identity), compact = id.replace(/-/g, ''), now = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      const fallback = `player_${attempt ? compact.slice(16) : compact.slice(0, 16)}${attempt === 2 ? 'x' : ''}`;
      await this.binding.prepare('INSERT OR IGNORE INTO social_profiles(user_id,gamer_name,name_key,bio,avatar,name_flagged,created_at,updated_at) VALUES(?,?,?,\'\',\'jade\',?,?,?)')
        .bind(id, fallback, fallback, identity.nameFlagged ? 1 : 0, now, now).run();
      if (await this.first('SELECT user_id FROM social_profiles WHERE user_id=?', id)) break;
      if (attempt === 2) throw new RummyError('Could not reserve a gamer name. Please try again.', 409, 'name_unavailable');
    }
    if (identity.nameFlagged !== undefined) await this.binding.prepare('UPDATE social_profiles SET name_flagged=? WHERE user_id=? AND name_flagged<>?').bind(identity.nameFlagged ? 1 : 0, id, identity.nameFlagged ? 1 : 0).run();
    return this.profile(id, id);
  }
  async gamerName(identity: SocialIdentity) { return (await this.ensureProfile(identity)).gamerName; }
  private async profile(viewer: string, target: string): Promise<PlayerProfile> {
    const row = await this.first<{ data: string }>(CTE + `SELECT ${profileJSON('p')} AS data FROM social_profiles p WHERE p.user_id=?
      AND NOT EXISTS(SELECT 1 FROM social_blocks WHERE blocker_id=p.user_id AND blocked_id=${VIEWER})`, viewer, target);
    if (!row) throw new RummyError('Player profile not found.', 404, 'not_found');
    return normalizeProfile(JSON.parse(row.data));
  }
  private async friends(viewer: string): Promise<FriendsView> {
    const profiles = (await this.rows<PlayerProfile>(CTE + `SELECT json_group_array(json(profile)) AS data FROM (SELECT ${profileJSON('p')} AS profile
      FROM social_profiles p WHERE p.user_id<>${VIEWER} AND (EXISTS(SELECT 1 FROM social_friends WHERE low_id=min(${VIEWER},p.user_id) AND high_id=max(${VIEWER},p.user_id))
      OR EXISTS(SELECT 1 FROM social_blocks WHERE blocker_id=${VIEWER} AND blocked_id=p.user_id)) ORDER BY p.name_key LIMIT 500)`, viewer)).map(normalizeProfile);
    return { friends: profiles.filter(p => p.relationship === 'friends'), incoming: profiles.filter(p => p.relationship === 'incoming'), outgoing: profiles.filter(p => p.relationship === 'outgoing'), blocked: profiles.filter(p => p.relationship === 'blocked') };
  }
  private inviteSelect() {
    return `json_object('id',i.id,'sender',${profileJSON('s')},'recipient',${profileJSON('t')},'game',i.game,'code',i.room_code,'createdAt',i.created_at,'expiresAt',i.expires_at,
      'status',CASE WHEN i.status='pending' AND i.expires_at<=? THEN 'expired' ELSE i.status END,
      'available',CASE WHEN i.expires_at>? AND i.status IN ('pending','accepted') AND ${linked('i.sender_id', 'i.recipient_id')} AND NOT ${blocked('i.sender_id', 'i.recipient_id')} AND ${inviteRoomEligible('i')} THEN 1 ELSE 0 END,
      'reason',CASE WHEN i.expires_at<=? THEN 'This invitation expired.' WHEN i.status IN ('declined','cancelled') THEN 'This invitation is closed.' WHEN NOT ${linked('i.sender_id', 'i.recipient_id')} THEN 'This friend connection ended.'
      WHEN NOT ${inviteRoomEligible('i')} THEN 'This table is full, has started, or is no longer available.' ELSE '' END,
      'href','/games/' || i.game || '?room=' || i.room_code)`;
  }
  private async invite(viewer: string, id: string): Promise<GameInvite> {
    const now = Date.now();
    const row = await this.first<{ data: string }>(CTE + `SELECT ${this.inviteSelect()} AS data FROM social_invites i JOIN social_profiles s ON s.user_id=i.sender_id JOIN social_profiles t ON t.user_id=i.recipient_id
      WHERE i.id=? AND ${VIEWER} IN (i.sender_id,i.recipient_id) AND NOT ${blocked('i.sender_id', 'i.recipient_id')}`, viewer, now, now, now, id);
    if (!row) throw new RummyError('Invitation not found.', 404, 'not_found');
    return normalizeInvite(JSON.parse(row.data));
  }
  private async invites(viewer: string): Promise<InvitesView> {
    const now = Date.now();
    const invites = (await this.rows<GameInvite>(CTE + `SELECT json_group_array(json(invite)) AS data FROM (SELECT ${this.inviteSelect()} AS invite FROM social_invites i
      JOIN social_profiles s ON s.user_id=i.sender_id JOIN social_profiles t ON t.user_id=i.recipient_id
      WHERE ${VIEWER} IN (i.sender_id,i.recipient_id) AND NOT ${blocked('i.sender_id', 'i.recipient_id')} ORDER BY i.created_at DESC LIMIT 100)`, viewer, now, now, now)).map(normalizeInvite);
    const rooms: WaitingTable[] = [];
    for (const game of ['rummy', 'spades'] as const) {
      const found = await this.rows<WaitingTable>(CTE + `SELECT json_group_array(json_object('game','${game}','code',code,'title',title,'occupied',occupied,'capacity',capacity)) AS data FROM
        (SELECT r.code AS code,'${game === 'rummy' ? 'Rummy+' : 'Spades'} · ' || json_extract(r.data,'$.options.variant') AS title,
        json_array_length(r.data,'$.members') AS occupied,${capacity(game)} AS capacity FROM ${roomTable(game)} r WHERE json_extract(r.data,'$.owner')=${memberPrincipal(VIEWER)}
        AND json_extract(r.data,'$.status')='waiting' AND json_extract(r.data,'$.options.mode')='online' AND json_array_length(r.data,'$.members')<${capacity(game)} ORDER BY r.updated_at DESC LIMIT 10)`, viewer);
      rooms.push(...found);
    }
    return { incoming: invites.filter(i => i.recipient.userId === viewer), outgoing: invites.filter(i => i.sender.userId === viewer), rooms };
  }
  async read(identity: SocialIdentity, url: URL): Promise<unknown> {
    const viewer = this.actor(identity); await this.ensureProfile(identity);
    const path = url.pathname.replace(/\/$/, '');
    if (path === '/api/social/me') return this.profile(viewer, viewer);
    if (path === '/api/social/friends') return this.friends(viewer);
    if (path === '/api/social/invites') return this.invites(viewer);
    if (path === '/api/social/players') {
      const query = (url.searchParams.get('q') ?? '').normalize('NFKC').trim().toLowerCase();
      if (query.length < 2) return { players: [] };
      if (!/^[a-z0-9_]{2,24}$/.test(query)) throw new RummyError('Search for a gamer name using letters, numbers or underscores.');
      const escaped = query.replace(/_/g, '\\_') + '%';
      const profiles = await this.rows<PlayerProfile>(CTE + `SELECT json_group_array(json(profile)) AS data FROM (SELECT ${profileJSON('p')} AS profile FROM social_profiles p
        WHERE p.name_key LIKE ? ESCAPE '\\' AND p.name_flagged=0 AND NOT ${blocked(VIEWER, 'p.user_id')} ORDER BY p.name_key LIMIT 20)`, viewer, escaped);
      return { players: profiles.map(normalizeProfile) };
    }
    const match = /^\/api\/social\/players\/([^/]+)$/.exec(path);
    if (match) { const target = uid(match[1]); if (!target) throw new RummyError('Invalid player link.'); return this.profile(viewer, target); }
    if (path === '/api/social/activity') {
      const rows = await this.rows<FriendActivity>(CTE + `SELECT json_group_array(json(activity)) AS data FROM (SELECT json_object('id',wins.game||':'||wins.match_id||':'||p.user_id,
        'game',wins.game,'player',${profileJSON('p')},'completedAt',wins.completed_at) AS activity FROM (
        SELECT 'rummy' AS game,rw.match_id,rw.user_id,json_extract(rw.payload,'$.completed_at') AS completed_at FROM reward_outbox rw
        UNION ALL SELECT 'spades',sw.match_id,json_extract(winner.value,'$.user_id'),json_extract(sw.payload,'$.completed_at') FROM spades_rewards sw,json_each(sw.payload,'$.players') winner
        WHERE json_extract(winner.value,'$.bot')=0 AND CASE WHEN json_extract(sw.payload,'$.variant')='teams' THEN CAST(winner.key AS INTEGER)%2 ELSE CAST(winner.key AS INTEGER) END=json_extract(sw.payload,'$.winner')
        UNION ALL SELECT 'five-dice',dw.match_id,json_extract(winner.value,'$.user_id'),json_extract(dw.payload,'$.completed_at') FROM five_dice_rewards dw,json_each(dw.payload,'$.players') winner
        WHERE json_type(dw.payload,'$.winner')='integer' AND CAST(winner.key AS INTEGER)=json_extract(dw.payload,'$.winner') AND json_extract(winner.value,'$.bot')=0
        UNION ALL SELECT 'crown-court',dw.match_id,json_extract(winner.value,'$.user_id'),json_extract(dw.payload,'$.completed_at') FROM crown_court_rewards dw,json_each(dw.payload,'$.players') winner
        WHERE json_type(dw.payload,'$.winner')='integer' AND CAST(winner.key AS INTEGER)=json_extract(dw.payload,'$.winner') AND json_extract(winner.value,'$.bot')=0
        UNION ALL SELECT 'backgammon',dw.match_id,json_extract(winner.value,'$.user_id'),json_extract(dw.payload,'$.completed_at') FROM backgammon_rewards dw,json_each(dw.payload,'$.players') winner
        WHERE json_type(dw.payload,'$.winner')='integer' AND CAST(winner.key AS INTEGER)=json_extract(dw.payload,'$.winner') AND json_extract(winner.value,'$.bot')=0
        UNION ALL SELECT 'carrom',dw.match_id,json_extract(winner.value,'$.user_id'),json_extract(dw.payload,'$.completed_at') FROM carrom_rewards dw,json_each(dw.payload,'$.players') winner
        WHERE json_type(dw.payload,'$.winner')='integer' AND CAST(winner.key AS INTEGER)=json_extract(dw.payload,'$.winner') AND json_extract(winner.value,'$.bot')=0
        UNION ALL SELECT 'farkle',dw.match_id,json_extract(winner.value,'$.user_id'),json_extract(dw.payload,'$.completed_at') FROM farkle_rewards dw,json_each(dw.payload,'$.players') winner
        WHERE json_type(dw.payload,'$.winner')='integer' AND CAST(winner.key AS INTEGER)=json_extract(dw.payload,'$.winner') AND json_extract(winner.value,'$.bot')=0
        UNION ALL SELECT 'dominoes',dm.match_id,json_extract(winner.value,'$.user_id'),json_extract(dm.payload,'$.completed_at') FROM domino_rewards dm,json_each(dm.payload,'$.players') winner
        WHERE json_type(dm.payload,'$.winner')='integer' AND CAST(winner.key AS INTEGER)=json_extract(dm.payload,'$.winner') AND json_extract(winner.value,'$.bot')=0
        ) wins JOIN social_profiles p ON p.user_id=wins.user_id WHERE ${linked(VIEWER, 'p.user_id')} AND NOT ${blocked(VIEWER, 'p.user_id')} ORDER BY wins.completed_at DESC LIMIT 20)`, viewer);
      return { activity: rows.map(row => ({ ...row, player: normalizeProfile(row.player) })) };
    }
    throw new RummyError('Social endpoint not found.', 404, 'not_found');
  }
  async command(identity: SocialIdentity, input: unknown): Promise<SocialCommandResult> {
    const viewer = this.actor(identity), own = await this.ensureProfile(identity);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RummyError('Choose a player action.');
    const value = input as Record<string, unknown>, operation = value.operation;
    if (operation === 'profile') {
      if (own.nameFlagged) throw new RummyError('Your gamer name is under moderation review. Contact the Clubhouse team.', 403, 'name_flagged');
      const gamerName = typeof value.gamerName === 'string' ? value.gamerName.normalize('NFKC').trim() : '';
      const bio = typeof value.bio === 'string' ? value.bio.normalize('NFKC').trim() : '';
      if (!/^[A-Za-z0-9_]{3,24}$/.test(gamerName) || containsProfanity(gamerName.replace(/_/g, ' ')) || ['admin', 'administrator', 'moderator', 'support', 'system'].includes(gamerName.toLowerCase())) throw new RummyError('Use a friendly gamer name with 3–24 letters, numbers or underscores.');
      if (gamerName.toLowerCase().startsWith('player_') && gamerName.toLowerCase() !== own.gamerName.toLowerCase()) throw new RummyError('Choose a personal gamer name; player_ names are reserved for new accounts.');
      if (bio.length > 160 || /[\p{C}<>]/u.test(bio) || containsProfanity(bio)) throw new RummyError('Keep your bio friendly and at most 160 characters.');
      const custom = customProfileImage(value.avatar);
      if (!PROFILE_AVATARS.includes(value.avatar as never) && !custom) throw new RummyError('Choose a profile emblem or a valid small profile image.');
      if (custom) {
        const wallet = await this.first<{ owned: string }>('SELECT owned FROM economy_wallets WHERE user_id=?', viewer);
        if (!wallet || !JSON.parse(wallet.owned).includes(profileFrameItem(custom.shape))) throw new RummyError('Collect this profile image frame in the store before saving it.', 403, 'not_owned');
      }
      try {
        await this.binding.prepare('UPDATE social_profiles SET gamer_name=?,name_key=?,bio=?,avatar=?,updated_at=? WHERE user_id=? AND name_flagged=0').bind(gamerName, gamerName.toLowerCase(), bio, value.avatar, Date.now(), viewer).run();
      } catch (error) { if (/UNIQUE|social_profiles_name_key_unique/i.test(String(error))) throw new RummyError('That gamer name is already taken. Please choose another.', 409, 'name_taken'); throw error; }
      return { ok: true, profile: await this.profile(viewer, viewer) };
    }
    if (['accept_invite', 'decline_invite', 'cancel_invite'].includes(String(operation))) {
      if (typeof value.inviteId !== 'string' || !uid(value.inviteId)) throw new RummyError('Choose a valid invitation.');
      const invite = await this.invite(viewer, value.inviteId);
      const sender = operation === 'cancel_invite';
      if ((sender ? invite.sender : invite.recipient).userId !== viewer) throw new RummyError('You cannot change this invitation.', 403, 'forbidden');
      if (operation === 'accept_invite' && (!invite.available || !['pending', 'accepted'].includes(invite.status))) throw new RummyError(invite.reason || 'This invitation is closed.', 409, 'invite_unavailable');
      const status = operation === 'accept_invite' ? 'accepted' : sender ? 'cancelled' : 'declined';
      await this.binding.prepare(CTE + `UPDATE social_invites AS i SET status=? WHERE i.id=? AND ${sender ? 'i.sender_id' : 'i.recipient_id'}=${VIEWER} AND i.status ${operation === 'accept_invite' ? "='pending'" : "IN ('pending','accepted')"}
        ${operation === 'accept_invite' ? `AND i.expires_at>? AND ${linked('i.sender_id', 'i.recipient_id')} AND NOT ${blocked('i.sender_id', 'i.recipient_id')} AND ${inviteRoomEligible('i')}` : ''}`)
        .bind(viewer, status, value.inviteId, ...(operation === 'accept_invite' ? [Date.now()] : [])).run();
      const next = await this.invite(viewer, value.inviteId);
      if (operation === 'accept_invite' && next.status !== 'accepted') throw new RummyError('The invitation changed. Refresh before trying again.', 409, 'invite_unavailable');
      return { ok: true, invite: next, invites: await this.invites(viewer) };
    }
    const target = uid(value.targetUserId);
    if (!target || target === viewer) throw new RummyError('Choose another Clubhouse player.');
    if (!await this.first('SELECT user_id FROM social_profiles WHERE user_id=?', target)) throw new RummyError('Player profile not found.', 404, 'not_found');
    const low = viewer < target ? viewer : target, high = viewer < target ? target : viewer, now = Date.now();
    const revoke = this.binding.prepare("UPDATE social_invites SET status='cancelled' WHERE status IN ('pending','accepted') AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?))").bind(viewer, target, target, viewer);
    if (operation === 'block') {
      await this.binding.batch([
        this.binding.prepare('INSERT OR IGNORE INTO social_blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').bind(viewer, target, now),
        this.binding.prepare('DELETE FROM social_friends WHERE low_id=? AND high_id=?').bind(low, high), revoke,
      ]);
      return { ok: true, friends: await this.friends(viewer) };
    }
    if (operation === 'unblock') { await this.binding.prepare('DELETE FROM social_blocks WHERE blocker_id=? AND blocked_id=?').bind(viewer, target).run(); return { ok: true, friends: await this.friends(viewer) }; }
    if (operation === 'remove') {
      await this.binding.batch([this.binding.prepare('DELETE FROM social_friends WHERE low_id=? AND high_id=?').bind(low, high), revoke]);
      return { ok: true, friends: await this.friends(viewer) };
    }
    if (await this.first('SELECT blocker_id FROM social_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', viewer, target, target, viewer)) throw new RummyError('This connection is unavailable.', 403, 'connection_unavailable');
    if (operation === 'invite') {
      if (!['rummy', 'spades'].includes(String(value.game)) || typeof value.code !== 'string' || !/^[A-F0-9]{8}$/i.test(value.code)) throw new RummyError('Choose a waiting online table.');
      const game = value.game as SocialGame, code = value.code.toUpperCase();
      const authorized = await this.first(CTE + `SELECT 1 AS valid WHERE ${linked(VIEWER, '?')} AND ${roomEligible(game, '?', VIEWER, '?')}`, viewer, target, target, code, target);
      if (!authorized) throw new RummyError('Invite an accepted friend to your own waiting online table with an open seat.', 403, 'invite_unavailable');
      await this.binding.prepare(CTE + `INSERT INTO social_invites(id,sender_id,recipient_id,game,room_code,status,created_at,expires_at)
        SELECT ?,${VIEWER},?, ?,?,'pending',?,? WHERE ${linked(VIEWER, '?')} AND NOT ${blocked(VIEWER, '?')} AND ${roomEligible(game, '?', VIEWER, '?')}
        ON CONFLICT(sender_id,recipient_id,game,room_code) DO UPDATE SET status='pending',created_at=excluded.created_at,expires_at=excluded.expires_at WHERE social_invites.status<>'pending' OR social_invites.expires_at<=?`)
        .bind(viewer, randomUUID(), target, game, code, now, now + 30 * 60_000, target, target, target, target, code, target, now).run();
      const stored = await this.first<{ id: string }>("SELECT id FROM social_invites WHERE sender_id=? AND recipient_id=? AND game=? AND room_code=? AND status='pending'", viewer, target, game, code);
      if (!stored) throw new RummyError('The table or friend connection changed. Please refresh.', 409, 'invite_unavailable');
      const invite = await this.invite(viewer, stored.id);
      if (!invite.available) throw new RummyError(invite.reason || 'This invitation is unavailable.', 409, 'invite_unavailable');
      return { ok: true, invite, invites: await this.invites(viewer) };
    }
    if (operation === 'request') {
      await this.binding.prepare(CTE + `INSERT INTO social_friends(low_id,high_id,requester_id,status,created_at,updated_at)
        SELECT ?,?,${VIEWER},'pending',?,? WHERE NOT ${blocked(VIEWER, '?')}
        ON CONFLICT(low_id,high_id) DO UPDATE SET status=CASE WHEN social_friends.status='pending' AND social_friends.requester_id<>${VIEWER} THEN 'accepted' ELSE social_friends.status END,updated_at=excluded.updated_at`)
        .bind(viewer, low, high, now, now, target, target).run();
    } else if (operation === 'accept') {
      const edge = await this.first<{ requester_id: string; status: string }>('SELECT requester_id,status FROM social_friends WHERE low_id=? AND high_id=?', low, high);
      if (!edge || (edge.requester_id === viewer && edge.status !== 'accepted')) throw new RummyError('Only the recipient can accept a friend request.', 403, 'forbidden');
      await this.binding.prepare(CTE + `UPDATE social_friends SET status='accepted',updated_at=? WHERE low_id=? AND high_id=? AND requester_id=? AND status='pending' AND NOT ${blocked(VIEWER, '?')}`)
        .bind(viewer, now, low, high, target, target, target).run();
    } else if (operation === 'decline' || operation === 'cancel') {
      await this.binding.prepare('DELETE FROM social_friends WHERE low_id=? AND high_id=? AND status=\'pending\' AND requester_id=?').bind(low, high, operation === 'cancel' ? viewer : target).run();
    } else throw new RummyError('Unknown player action.');
    if (operation === 'request' || operation === 'accept') {
      const edge = await this.first<{ status: string }>('SELECT status FROM social_friends WHERE low_id=? AND high_id=?', low, high);
      if (!edge || (operation === 'accept' && edge.status !== 'accepted')) throw new RummyError('This friend request changed. Refresh before trying again.', 409, 'connection_changed');
    }
    return { ok: true, friends: await this.friends(viewer) };
  }
}
