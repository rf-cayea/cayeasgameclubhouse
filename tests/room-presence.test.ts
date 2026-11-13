import { describe, expect, it } from 'vitest';
import { PRESENCE_MS, settlePresence, touchSeat, type PresenceSeat } from '../server/room-presence';

interface Seat extends PresenceSeat { name: string }
/** The write throttle is private to the helper; this is its documented value. */
const STAMP_MS = 20_000;
const seat = (principal: string, seenAt?: number): Seat => ({ principal, name: principal, ...(seenAt === undefined ? {} : { seenAt }) });
const room = (members: Seat[], status = 'waiting', owner = members[0]!.principal) => ({ members, owner, status });

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

  it('ignores someone who is not seated and never adds a seat', () => {
    const members = [seat('alice')];
    expect(touchSeat(members, 'stranger', 1_000)).toBe(false);
    expect(members).toHaveLength(1);
    expect(members[0]!.seenAt).toBeUndefined();
  });
});

describe('settlePresence', () => {
  it('leaves a room that is already playing completely alone', () => {
    const alice = seat('alice', 1), bob = seat('bob', 1);
    const table = room([alice, bob], 'playing');
    expect(settlePresence(table, 'alice', 10 * PRESENCE_MS)).toBe(false);
    expect(table.members.map(member => member.principal)).toEqual(['alice', 'bob']);
    expect(table.owner).toBe('alice');
    expect([alice.seenAt, bob.seenAt]).toEqual([1, 1]);
  });

  it('ignores a request from someone who is not seated', () => {
    const table = room([seat('host', 1)]);
    expect(settlePresence(table, 'stranger', 10 * PRESENCE_MS)).toBe(false);
    expect(table.members).toHaveLength(1);
    expect(table.status).toBe('waiting');
  });

  it('counts a seat with no stamp as just seen', () => {
    const now = 10 * PRESENCE_MS;
    const caller = seat('caller', now - 1_000), legacy = seat('legacy'), gone = seat('gone', 1_000);
    const table = room([caller, legacy, gone], 'waiting', 'caller');
    expect(settlePresence(table, 'caller', now)).toBe(true);
    expect(table.members.map(member => member.principal)).toEqual(['caller', 'legacy']);
    expect(legacy.seenAt).toBeUndefined();
    expect(caller.seenAt).toBe(now - 1_000); // already inside the stamp throttle
  });

  it('never frees the player making the request, even when their own stamp is stale', () => {
    const now = 10 * PRESENCE_MS;
    const caller = seat('caller', 1), peer = seat('peer', now - 1_000);
    const table = room([caller, peer], 'waiting', 'peer');
    expect(settlePresence(table, 'caller', now)).toBe(true);
    expect(table.members.map(member => member.principal)).toEqual(['caller', 'peer']);
    expect(table.owner).toBe('peer');
    expect(caller.seenAt).toBe(now);
  });

  it('never abandons a room the caller is still sitting in', () => {
    const caller = seat('caller', 1);
    const table = room([caller]);
    expect(settlePresence(table, 'caller', 10 * PRESENCE_MS)).toBe(true);
    expect(table.status).toBe('waiting');
    expect(table.members).toHaveLength(1);
  });

  it('frees a silent seat and hands the table to the earliest remaining player', () => {
    const now = 10 * PRESENCE_MS;
    const host = seat('host', 1), guest = seat('guest', now - 1_000), other = seat('other', now - 2_000);
    const table = room([host, guest, other], 'waiting', 'host');
    expect(settlePresence(table, 'guest', now)).toBe(true);
    expect(table.members.map(member => member.principal)).toEqual(['guest', 'other']);
    expect(table.owner).toBe('guest');
  });

  it('keeps the owner when a guest is the one who went quiet', () => {
    const host = seat('host', 5_000), guest = seat('guest', 1);
    const table = room([host, guest], 'waiting', 'host');
    expect(settlePresence(table, 'host', 10 * PRESENCE_MS)).toBe(true);
    expect(table.members.map(member => member.principal)).toEqual(['host']);
    expect(table.owner).toBe('host');
  });

  it('frees a seat exactly at the presence window and reports no change within the throttle', () => {
    const now = 100 * PRESENCE_MS;
    const edge = seat('edge', now - PRESENCE_MS), caller = seat('caller', now - 1_000);
    const table = room([caller, edge], 'waiting', 'caller');
    expect(settlePresence(table, 'caller', now)).toBe(true);
    expect(table.members.map(member => member.principal)).toEqual(['caller']);
    expect(settlePresence(table, 'caller', now + 1_000)).toBe(false);
  });
});
