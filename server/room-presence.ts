/** Lobby presence. Every game screen polls its room every few seconds, so a
 * poll is a heartbeat; a player who closed the tab stops producing one. */
export const PRESENCE_MS = 60_000;
/** One stamp per member per 20s is plenty inside a 60s window, so a lobby that
 * polls every 2.5s writes a row per member per 20s instead of per poll. */
const PRESENCE_WRITE_MS = 20_000;

export interface PresenceSeat { principal: string; seenAt?: number }
interface PresenceRoom<M extends PresenceSeat> { members: M[]; owner: string; status: string }

/** Marks a seated player as seen. Non-members are ignored, and a recent stamp
 * is left alone so a read does not write on every poll. */
export function touchSeat<M extends PresenceSeat>(members: readonly M[], principal: string, now: number): boolean {
  const seat = members.find(member => member.principal === principal);
  if (!seat || (seat.seenAt !== undefined && now - seat.seenAt < PRESENCE_WRITE_MS)) return false;
  seat.seenAt = now;
  return true;
}

/** Settles a waiting room: frees the seats that have gone quiet and hands the
 * table to the earliest remaining player. Returns true when the caller must
 * persist the change.
 *
 * The caller is making a request, so their own seat is never freed and at least
 * one member always remains. A seat with no stamp counts as just seen, so a
 * deploy never prunes a lobby that was already open. Playing rooms are left
 * alone: a seat there is a live match, and the leave path owns that decision. */
export function settlePresence<M extends PresenceSeat>(room: PresenceRoom<M>, principal: string, now: number): boolean {
  if (room.status !== 'waiting') return false;
  const touched = touchSeat(room.members, principal, now);
  const silent = room.members.filter(member => member.principal !== principal && now - (member.seenAt ?? now) >= PRESENCE_MS);
  if (!silent.length) return touched;
  room.members = room.members.filter(member => !silent.includes(member));
  if (silent.some(member => member.principal === room.owner)) room.owner = room.members[0]!.principal;
  return true;
}
