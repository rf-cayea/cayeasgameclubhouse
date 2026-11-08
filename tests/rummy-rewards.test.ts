import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { RoomStore, type Identity } from '../server/rooms';
import { createGameServer } from '../server/http';
import { rewardWorker, validReceipt } from '../server/rewards';
import { completedReward, memberId, rewardTier, type MatchReward, type RewardReceipt } from '../src/lib/rummy-rewards';
import { WIN_POINTS, type State } from '../src/lib/rummy';
import type { GameOptions, RoomView } from '../src/lib/rummy-protocol';

const user = '11111111-1111-4111-8111-111111111111', peer = '22222222-2222-4222-8222-222222222222';
const member = { principal: `member:${user}`, jokers: false }, rival = { principal: `member:${peer}`, jokers: false };
const options: GameOptions = { mode: 'bot', variant: 'classic', seats: 2, level: 'normal', jokers: false };
const stores: RoomStore[] = [];
afterEach(() => { stores.splice(0).forEach(store => store.close()); });
const open = () => { const store = new RoomStore(':memory:'); stores.push(store); return store; };
type SavedRoom = { state: State; members: { id: string; principal: string }[]; matchId?: string };
const saved = (store: RoomStore, code: string) => JSON.parse(String(store.db.prepare('SELECT data FROM rooms WHERE code=?').get(code)!.data)) as SavedRoom;

/** Arrange a server-owned position one legal discard before a full-match win. */
function winningPosition(store: RoomStore, identity: Identity = member, settings = options) {
  let view = store.command(identity, { operation: 'create', name: 'Alice', options: settings }).view;
  if (settings.mode === 'online') {
    store.command(rival, { operation: 'join', code: view.code, name: 'Bob' });
    view = store.command(rival, { operation: 'ready', code: view.code, ready: true }).view;
    view = store.command(identity, { operation: 'start', code: view.code, revision: view.revision }).view;
  }
  const room = saved(store, view.code);
  Object.assign(room.state, { turn: 0, phase: 'play', scores: [95, 0], hands: [['AS'], ['KH']], deck: ['2C'], discard: ['3D'], mustUse: null, drewDiscard: null });
  store.db.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(room), view.code);
  const command = { operation: 'move', code: view.code, revision: view.revision, requestId: randomUUID(), move: { t: 'discard', card: 'AS' } };
  return { view, room, command, finish: () => store.command(identity, command).view };
}
const receipt = (result: MatchReward): RewardReceipt => {
  const tier = rewardTier(result.mode, result.participants)!;
  return { match_id: result.match_id, user_id: result.participants[result.winner_index]!.user_id!, tier, amount: WIN_POINTS[tier], source: `rummy:win:${result.match_id}`, already_credited: false };
};

describe('verified reward eligibility', () => {
  it('uses fixed tiers and excludes local, guest, duplicate-account, and mixed online tables', () => {
    const human = { user_id: user, bot: false, level: null }, bot = { user_id: null, bot: true, level: 'easy' as const };
    expect(memberId(member.principal)).toBe(user); expect(memberId('guest:any')).toBeNull();
    expect(rewardTier('bot', [human, bot])).toBe('easy');
    expect(rewardTier('bot', [human, bot, { ...bot, level: 'normal' }])).toBe('normal');
    expect(rewardTier('bot', [human, bot, { ...bot, level: 'hard' }])).toBe('hard');
    expect(rewardTier('online', [human, { ...human, user_id: peer }])).toBe('humans');
    for (const [mode, players] of [
      ['local', [human, bot]], ['online', [human, human]], ['online', [human, bot]],
      ['online', [human, { ...human, user_id: null }]], ['bot', [human, { ...bot, level: null }]],
    ] as const) expect(rewardTier(mode, [...players])).toBeNull();
  });
  it('requires a unique canonical full-match human winner and never rewards old or unfinished games', () => {
    const store = open(); const fixture = winningPosition(store); fixture.finish();
    const room = saved(store, fixture.view.code);
    const compute = (state = room.state, id = room.matchId) => completedReward(state, 'bot', room.members, id, new Date().toISOString());
    expect(compute()?.participants[0]?.user_id).toBe(user);
    expect(compute({ ...room.state, phase: 'roundOver' })).toBeNull();
    expect(compute({ ...room.state, target: 5 })).toBeNull();
    expect(compute({ ...room.state, scores: [99, 0] })).toBeNull();
    expect(compute({ ...room.state, scores: [105, 105] })).toBeNull();
    expect(compute({ ...room.state, winner: 1, scores: [0, 105] })).toBeNull();
    expect(completedReward(room.state, 'bot', room.members, undefined, new Date().toISOString())).toBeNull();
  });
});

describe('durable match reward outbox', () => {
  it('queues only once on the winning transaction and credits only the winner view', () => {
    const store = open(); const fixture = winningPosition(store, member, { ...options, mode: 'online' });
    expect(fixture.view.reward).toMatchObject({ status: 'eligible', amount: 50 });
    const won = fixture.finish();
    expect(won).toMatchObject({ status: 'finished', reward: { status: 'pending', amount: 50 } });
    expect(store.get(won.code, rival.principal).reward.status).toBe('ineligible');
    expect(store.command(member, fixture.command).changed).toBe(false);
    expect(store.db.prepare('SELECT count(*) AS n FROM reward_outbox').get()!.n).toBe(1);
    const job = store.claimReward(0)!;
    expect(store.claimReward(0)).toBeNull();
    store.finishReward(job.result.match_id, 'wrong-lease', receipt(job.result));
    expect(store.get(won.code, member.principal).reward.status).toBe('pending');
    store.finishReward(job.result.match_id, job.lease, receipt(job.result));
    expect(store.get(won.code, member.principal).reward).toMatchObject({ status: 'credited', amount: 50, source: `rummy:win:${job.result.match_id}` });
  });
  it.each([70,35])('shows an already committed %i-point reward at its original amount after the rate change', amount => {
    const store=open(),fixture=winningPosition(store,member,options);fixture.finish();
    const job=store.claimReward(0)!,historical={...receipt(job.result),amount,already_credited:true};
    expect(validReceipt(job.result,historical)).toBe(true);
    store.finishReward(job.result.match_id,job.lease,historical);
    expect(store.get(fixture.view.code,member.principal).reward).toMatchObject({status:'credited',amount});
  });
  it.each(['guest', 'local', 'legacy', 'round', 'abandoned'])('never queues a reward for %s games', kind => {
    const store = open(); const actor = kind === 'guest' ? { principal: 'guest:opaque', jokers: false } : member;
    const fixture = winningPosition(store, actor, { ...options, mode: kind === 'local' ? 'local' : 'bot' });
    if (kind === 'abandoned') store.command(actor, { operation: 'leave', code: fixture.view.code });
    else {
      const room = saved(store, fixture.view.code);
      if (kind === 'legacy') delete room.matchId;
      if (kind === 'round') room.state.scores = [0, 0];
      store.db.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(room), fixture.view.code);
      fixture.finish();
    }
    expect(store.claimReward(Date.now())).toBeNull();
  });
  it('retains pending rewards across restart, recovers expired leases, and ignores obsolete lease receipts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rewards-')); const file = join(directory, 'games.sqlite');
    let store = new RoomStore(file);
    try {
      const fixture = winningPosition(store); fixture.finish();
      const original = store.claimReward(1000)!; store.close(); store = new RoomStore(file);
      expect(store.get(fixture.view.code, member.principal).reward.status).toBe('pending');
      expect(store.claimReward(30_999)).toBeNull();
      const retry = store.claimReward(31_000)!;
      expect(retry.result).toEqual(original.result); expect(retry.lease).not.toBe(original.lease);
      store.finishReward(original.result.match_id, original.lease, receipt(original.result));
      expect(store.get(fixture.view.code, member.principal).reward.status).toBe('pending');
      store.finishReward(retry.result.match_id, retry.lease, receipt(retry.result));
      expect(store.get(fixture.view.code, member.principal).reward.status).toBe('credited');
    } finally { store.close(); rmSync(directory, { recursive: true }); }
  });
});

describe('reward delivery', () => {
  it('delivers an authenticated HTTP win and pushes its credited status without another move', async () => {
    const store = open(); const fixture = winningPosition(store);
    let complete!: (receipt: RewardReceipt) => void; let result!: MatchReward;
    const deliver = vi.fn((value: MatchReward) => { result = value; return new Promise<RewardReceipt>(resolve => { complete = resolve; }); });
    const app = createGameServer({ store, verifyMember: async token => token === 'winner' ? member : rival,
      rewardWriter: { configured: () => true, deliver } });
    await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    const headers = { Authorization: 'Bearer winner', 'Content-Type': 'application/json' };
    const controller = new AbortController();
    try {
      const live = await fetch(`${base}/api/rummy/room/${fixture.view.code}/events`, { headers, signal: controller.signal });
      const reader = live.body!.getReader(); await reader.read();
      const response = await fetch(`${base}/api/rummy`, { method: 'POST', headers, body: JSON.stringify(fixture.command) });
      const won = await response.json() as RoomView;
      expect(won.reward).toMatchObject({ status: 'pending', amount: 25 });
      expect(response.status).toBe(200); await reader.read();
      expect(deliver).toHaveBeenCalledTimes(1); complete(receipt(result)); await app.rewards.flush();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(`"revision":${won.revision}`);
      const credited = await (await fetch(`${base}/api/rummy/room/${won.code}`, { headers })).json() as RoomView;
      expect(credited.revision).toBe(won.revision); expect(credited.reward.status).toBe('credited');
      const retried = await (await fetch(`${base}/api/rummy`, { method: 'POST', headers, body: JSON.stringify(fixture.command) })).json() as RoomView;
      expect(retried.reward.status).toBe('credited'); expect(deliver).toHaveBeenCalledTimes(1);
      const outsider = await fetch(`${base}/api/rummy/room/${won.code}`, { headers: { Authorization: 'Bearer other' } });
      expect(outsider.status).toBe(403); await reader.cancel();
    } finally {
      controller.abort(); app.closeStreams(); await app.rewards.stop();
      await new Promise<void>(resolve => app.server.close(() => resolve()));
    }
  }, 15_000);
  it('retries an ambiguous committed response with the same match ID and accepts the existing receipt', async () => {
    const store = open(); const fixture = winningPosition(store); fixture.finish();
    let clock = 1000; const committed = new Map<string, RewardReceipt>(); const publish = vi.fn();
    const deliver = vi.fn(async (result: MatchReward) => {
      const prior = committed.get(result.match_id);
      if (prior) return { ...prior, already_credited: true };
      committed.set(result.match_id, receipt(result)); throw new Error('Connection dropped after commit');
    });
    const worker = rewardWorker(store, { configured: () => true, deliver }, publish, () => clock);
    try {
      await worker.flush(); expect(fixture.finish().reward.status).toBe('pending');
      await worker.flush(); expect(deliver).toHaveBeenCalledTimes(1);
      clock += 10_000; await worker.flush();
      expect(committed.size).toBe(1); expect(deliver).toHaveBeenCalledTimes(2); expect(publish).toHaveBeenCalledWith(fixture.view.code);
      expect(store.get(fixture.view.code, member.principal).reward).toMatchObject({ status: 'credited', amount: 25 });
      await worker.flush(); expect(deliver).toHaveBeenCalledTimes(2);
    } finally { await worker.stop(); }
  });
  it('leaves unconfigured and invalid-receipt credits pending, and validates the entire receipt', async () => {
    const store = open(); const fixture = winningPosition(store); fixture.finish();
    const deliver = vi.fn(async (result: MatchReward) => ({ ...receipt(result), amount: 999 }));
    let configured = false;
    const worker = rewardWorker(store, { configured: () => configured, deliver });
    try {
      await worker.flush(); expect(deliver).not.toHaveBeenCalled(); configured = true; await worker.flush();
      expect(store.get(fixture.view.code, member.principal).reward.status).toBe('pending');
      const result = deliver.mock.calls[0]![0]; const good = receipt(result);
      expect(validReceipt(result, good)).toBe(true);
      for (const bad of [{ amount: 800 }, { tier: 'hard' }, { user_id: peer }, { match_id: randomUUID() }, { source: 'rummy:win:fake' }, { already_credited: undefined }])
        expect(validReceipt(result, { ...good, ...bad } as RewardReceipt)).toBe(false);
    } finally { await worker.stop(); }
  });
  it('coalesces flush calls and waits for in-flight delivery before shutdown', async () => {
    const store = open(); winningPosition(store).finish();
    let resolve!: (receipt: RewardReceipt) => void; let result!: MatchReward;
    const deliver = vi.fn((value: MatchReward) => { result = value; return new Promise<RewardReceipt>(done => { resolve = done; }); });
    const worker = rewardWorker(store, { configured: () => true, deliver });
    const first = worker.flush(); expect(worker.flush()).toBe(first);
    let stopped = false; const stopping = worker.stop().then(() => { stopped = true; });
    await Promise.resolve(); expect(stopped).toBe(false);
    resolve(receipt(result)); await stopping; expect(deliver).toHaveBeenCalledTimes(1);
    await worker.flush(); expect(deliver).toHaveBeenCalledTimes(1);
  });
});
