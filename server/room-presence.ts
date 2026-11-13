/** Lobby presence. Every game screen polls its room every few seconds, so a
 * poll is a heartbeat; a player who closed the tab stops producing one. */
export const PRESENCE_MS = 60_000;
/** A read refreshes a seat's heartbeat at most this often, so polling every
 * 2.5s costs one row write per member per 20s instead of one per poll. */
export const PRESENCE_WRITE_MS = 20_000;

export interface PresenceSeat { principal: string; seenAt?: number }
export interface PresenceRoom<M extends PresenceSeat> { members: M[]; owner: string; status: string; createdAt?: number }

/** Records that a seated player was just seen. Returns true when this is worth
 * writing (first sighting or the last stamp is old enough). */
export function touchSeat<M extends PresenceSeat>(members: readonly M[], principal: string, now: number, writeMs = PRESENCE_WRITE_MS): boolean {
  const seat = members.find(member => member.principal === principal);
  if (!seat) return false;
  if (seat.seenAt !== undefined && now - seat.seenAt < writeMs) return false;
  seat.seenAt = now;
  return true;
}

/** Frees seats that have gone quiet in a waiting room and hands the table to
 * the earliest remaining player, so an abandoned host cannot freeze it. Rooms
 * that are already playing are left alone: a seat there is a live match, and
 * the leave path owns that decision. */
export function settlePresence<M extends PresenceSeat>(room: PresenceRoom<M>, principal: string, now: number, presenceMs = PRESENCE_MS, writeMs = PRESENCE_WRITE_MS): boolean {
  if (room.status !== 'waiting') return false;
  let changed = false;
  const silent = room.members.filter(member => now - (member.seenAt ?? room.createdAt ?? now) >= presenceMs);
  if (silent.length) {
    room.members = room.members.filter(member => !silent.includes(member));
    if (!room.members.length) { room.status = 'abandoned'; return true; }
    if (silent.some(member => member.principal === room.owner)) room.owner = room.members[0]!.principal;
    changed = true;
  }
  return touchSeat(room.members, principal, now, writeMs) || changed;
}
