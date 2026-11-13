import { describe, expect, it } from 'vitest';
import { PRESENCE_MS, settlePresence, touchSeat, type PresenceSeat } from '../server/room-presence';

/** The write throttle is private to the helper; this is its documented value. */
const STAMP_MS = 20_000;
const seat = (principal: string, seenAt?: number): PresenceSeat => ({ principal, ...(seenAt === undefined ? {} : { seenAt }) });
const table = (members: PresenceSeat[], owner = members[0]!.principal) => ({ members, owner, status: 'waiting' });

describe('touchSeat', () => {
  it('stamps a seat once and then stays quiet for twenty seconds', () => {
    const alice = seat('alice');
    expect(touchSeat([alice], 'alice', 1_000)).toBe(true);
    expect(alice.seenAt).toBe(1_000);
    expect(touchSeat([alice], 'alice', 1_000 + STAMP_MS - 1)).toBe(false);
    expect(alice.seenAt).toBe(1_000);
    expect(touchSeat([alice], 'alice', 1_000 + STAMP_MS)).toBe(true);
    expect(alice.seenAt).toBe(1_000 + STAMP_MS);
  });
});

describe('settlePresence', () => {
  it('counts a seat with no stamp as just seen', () => {
    const now = 10 * PRESENCE_MS;
    const caller = seat('caller', now - 1_000), legacy = seat('legacy'), gone = seat('gone', 1_000);
    const room = table([caller, legacy, gone]);
    expect(settlePresence(room, 'caller', now)).toBe(true);
    expect(room.members.map(member => member.principal)).toEqual(['caller', 'legacy']);
    expect(legacy.seenAt).toBeUndefined();
  });

  it('never frees the player making the request, even when their own stamp is stale', () => {
    const now = 10 * PRESENCE_MS;
    const caller = seat('caller', 1), peer = seat('peer', now - 1_000);
    const room = table([caller, peer], 'peer');
    expect(settlePresence(room, 'caller', now)).toBe(true);
    expect(room.members.map(member => member.principal)).toEqual(['caller', 'peer']);
    expect(room.status).toBe('waiting');
    expect(room.owner).toBe('peer');
    expect(caller.seenAt).toBe(now);
  });

  it('frees a silent seat and hands the table to the earliest remaining player', () => {
    const now = 10 * PRESENCE_MS;
    const host = seat('host', 1), guest = seat('guest', now - 1_000), other = seat('other', now - 2_000);
    const room = table([host, guest, other], 'host');
    expect(settlePresence(room, 'guest', now)).toBe(true);
    expect(room.members.map(member => member.principal)).toEqual(['guest', 'other']);
    expect(room.owner).toBe('guest');
  });

  it('keeps the owner when a guest is the one who went quiet', () => {
    const now = 10 * PRESENCE_MS;
    const host = seat('host', now - 1_000), guest = seat('guest', 1);
    const room = table([host, guest], 'host');
    expect(settlePresence(room, 'host', now)).toBe(true);
    expect(room.members.map(member => member.principal)).toEqual(['host']);
    expect(room.owner).toBe('host');
  });

  it('frees a seat exactly at the presence window and reports no change otherwise', () => {
    const now = 100 * PRESENCE_MS;
    const edge = seat('edge', now - PRESENCE_MS), caller = seat('caller', now - 1_000);
    const room = table([caller, edge]);
    expect(settlePresence(room, 'caller', now)).toBe(true);
    expect(room.members.map(member => member.principal)).toEqual(['caller']);
    expect(settlePresence(room, 'caller', now + 1_000)).toBe(false);
  });
});
