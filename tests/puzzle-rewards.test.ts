import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { nodeSocialBinding } from '../server/social-node';
import { PuzzleRewardStore, verifyPuzzleReplay, type PuzzleEconomy } from '../server/puzzle-rewards';
import { generateLevelPlan } from '../src/lib/game';
import { applyGemsAction, legalGemSwaps, startGems, type GemsAction } from '../src/lib/gems-engine';
import type { Identity } from '../server/rooms';
import type { EconomyWallet } from '../src/lib/economy-protocol';
import type { PuzzleGame, PuzzleRun } from '../src/lib/puzzle-rewards-protocol';

const member = (id = '10000000-0000-4000-8000-000000000001'): Identity => ({ principal: `member:${id}`, jokers: false });
const emptyWallet = (): EconomyWallet => ({ points: 0, f3_points: 0, gems_points: 0, rummy_points: 0, spades_points: 0,dice_points:0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {} });
const faithSolution = (level = 1) => generateLevelPlan(level).solution.map(id => ({ t: 'pick' as const, id }));
function gemsSolution(attempt: number): GemsAction[] {
  let state = startGems(1, attempt); const actions: GemsAction[] = [];
  while (state.status === 'play') {
    const next = legalGemSwaps(state).map(([a, b]) => {
      const action: GemsAction = { type: 'swap', a, b }, outcome = applyGemsAction(state, action)!;
      return { action, state: outcome.state };
    }).sort((a, b) => b.state.collected[0]! - a.state.collected[0]! || b.state.score - a.state.score)[0]!;
    actions.push(next.action); state = next.state;
  }
  if (state.status !== 'won') throw new Error('Fixture solver did not win.');
  return actions;
}

describe('trusted puzzle replay verification', () => {
  it('verifies a complete Faith 3 clear and rejects partial, duplicated, unknown and appended moves', () => {
    const actions = faithSolution();
    expect(verifyPuzzleReplay('faith-3', 1, 0, actions)).toEqual({ flawless: true });
    expect(verifyPuzzleReplay('faith-3', 1, 0, actions.slice(0, -1))).toBeNull();
    expect(verifyPuzzleReplay('faith-3', 1, 0, [actions[0], ...actions])).toBeNull();
    expect(verifyPuzzleReplay('faith-3', 1, 0, [{ t: 'award', amount: 999999 }])).toBeNull();
    expect(verifyPuzzleReplay('faith-3', 1, 0, [...actions, { t: 'undo' }])).toBeNull();
    expect(verifyPuzzleReplay('faith-3', 1, 0, actions.map(action => ({ ...action, won: true })))).toBeNull();
  });
  it('uses the issued Gems board and validates every move without trusting score flags', () => {
    const actions = gemsSolution(9);
    expect(verifyPuzzleReplay('3-gems', 1, 9, actions)?.stars).toBeGreaterThan(0);
    expect(verifyPuzzleReplay('3-gems', 1, 10, actions)).toBeNull();
    expect(verifyPuzzleReplay('3-gems', 1, 9, actions.slice(0, -1))).toBeNull();
    expect(verifyPuzzleReplay('3-gems', 1, 9, [{ type: 'swap', a: -1, b: 0 }])).toBeNull();
    expect(verifyPuzzleReplay('3-gems', 1, 9, [{ type: 'booster', kind: 'row', target: 0, score: 9999 }])).toBeNull();
  });
  it('bounds replay size and refuses booster supplies beyond the issued run inventory', () => {
    expect(verifyPuzzleReplay('faith-3', 1, 0, Array(2001).fill({ t: 'shuffle' }))).toBeNull();
    expect(verifyPuzzleReplay('faith-3', 1, 0, Array(30).fill({ t: 'undo' }))).toBeNull();
    expect(verifyPuzzleReplay('3-gems', 1, 0, Array(3).fill({ type: 'booster', kind: 'shuffle' }))).toBeNull();
    expect(verifyPuzzleReplay('3-gems', 1, 0, [{ type: 'booster', kind: 'shuffle', target: 0 }])).toBeNull();
  });
});

const databases: DatabaseSync[] = [];
afterEach(() => { databases.splice(0).forEach(db => db.close()); });
function fixture() {
  const db = new DatabaseSync(':memory:'); databases.push(db);
  db.exec("CREATE TABLE puzzle_runs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,game TEXT NOT NULL,level INTEGER NOT NULL,attempt INTEGER NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',proof TEXT,created_at INTEGER NOT NULL,rules_version INTEGER NOT NULL DEFAULT 1)");
  db.exec("CREATE TABLE gems_monastery(user_id TEXT PRIMARY KEY,completed_tasks INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,workshop TEXT NOT NULL DEFAULT '{}'); CREATE TABLE economy_progress(user_id TEXT,game TEXT,level INTEGER,stars INTEGER,created_at INTEGER,PRIMARY KEY(user_id,game,level))");
  db.exec("CREATE TABLE gems_extended_progress(user_id TEXT,level INTEGER,stars INTEGER,created_at INTEGER,PRIMARY KEY(user_id,level))");
  const credited = new Map<string, Set<number>>(), wallet = emptyWallet();
  const key = (actor: Identity, game: PuzzleGame) => `${actor.principal}:${game}`;
  const economy: PuzzleEconomy = {
    async wallet() { return {...wallet}; },
    async puzzleProgress(actor, game) { const levels = [...(credited.get(key(actor, game)) ?? [])]; return { levels, stars: Object.fromEntries(levels.map(level => [String(level), 3])), unlocked: levels.length + 1 }; },
    async creditPuzzle(actor, game, level) {
      const source = key(actor, game), levels = credited.get(source) ?? new Set<number>(), alreadyCredited = levels.has(level);
      if (!alreadyCredited) { levels.add(level); credited.set(source, levels); wallet[game === 'faith-3' ? 'f3_points' : 'gems_points'] += 25; db.prepare('INSERT INTO economy_progress VALUES(?,?,?,?,?)').run(actor.principal.slice(7),game,level,3,0); }
      return { amount: 25, alreadyCredited, wallet: { ...wallet } };
    },
  };
  let time = 100000;
  return { store: new PuzzleRewardStore(nodeSocialBinding(db), economy, () => time), db, expire: () => { time += 3 * 60 * 60 * 1000; } };
}

describe('owner-bound puzzle reward runs', () => {
  it('requires a member and sequential unlocks, ignoring caller attempts to select an owner or score', async () => {
    const { store } = fixture();
    await expect(store.command({ principal: 'guest:abc', jokers: false }, { operation: 'start', game: 'faith-3', level: 1 })).rejects.toMatchObject({ status: 401 });
    await expect(store.command(member(), { operation: 'start', game: 'faith-3', level: 2 })).rejects.toMatchObject({ code: 'level_locked' });
    await expect(store.command(member(), { operation: 'start', game: 'faith-3', userId: member().principal })).rejects.toThrow();
    const run = await store.command(member(), { operation: 'start', game: 'faith-3', level: 1 }) as PuzzleRun;
    await expect(store.command(member('20000000-0000-4000-8000-000000000002'), { operation: 'complete', runId: run.runId, actions: faithSolution() })).rejects.toMatchObject({ status: 404 });
    await expect(store.command(member(), { operation: 'complete', runId: run.runId, actions: faithSolution(), amount: 99999 })).rejects.toThrow();
  });
  it('credits a verified clear once, permits identical retries and unlocks the next board', async () => {
    const { store } = fixture(), actor = member();
    const run = await store.command(actor, { operation: 'start', game: 'faith-3', level: 1 }) as PuzzleRun;
    const completion = { operation: 'complete', runId: run.runId, actions: faithSolution() };
    expect(await store.command(actor, completion)).toMatchObject({ verified: true, alreadyCredited: false, amount: 25, progress: { unlocked: 2 } });
    expect(await store.command(actor, completion)).toMatchObject({ verified: true, alreadyCredited: true, wallet: { f3_points: 25 } });
    expect(await store.command(actor, { operation: 'start', game: 'faith-3', level: 2 })).toMatchObject({ level: 2 });
  });
  it('rejects expired and invalid proofs while independent same-account runs stay valid', async () => {
    const { store, expire } = fixture(), actor = member();
    const run = await store.command(actor, { operation: 'start', game: 'faith-3', level: 1 }) as PuzzleRun;
    await expect(store.command(actor, { operation: 'complete', runId: run.runId, actions: faithSolution().slice(1) })).rejects.toMatchObject({ code: 'invalid_replay' });
    expect((await store.read(actor))['faith-3'].levels).toEqual([]);
    await store.command(actor, { operation: 'start', game: 'faith-3', level: 1 });
    expect(await store.command(actor, { operation: 'complete', runId: run.runId, actions: faithSolution() })).toMatchObject({ verified: true });
    const latest = await store.command(actor, { operation: 'start', game: 'faith-3', level: 1 }) as PuzzleRun;
    expire();
    await expect(store.command(actor, { operation: 'complete', runId: latest.runId, actions: faithSolution() })).rejects.toMatchObject({ code: 'run_expired' });
  });
  it('binds a complete proof digest so another completion cannot replace it', async () => {
    const { store } = fixture(), actor = member(), run = await store.command(actor, { operation: 'start', game: 'faith-3', level: 1 }) as PuzzleRun;
    await store.command(actor, { operation: 'complete', runId: run.runId, actions: faithSolution() });
    await expect(store.command(actor, { operation: 'complete', runId: run.runId, actions: [...faithSolution(), { t: 'magic' }] })).rejects.toMatchObject({ code: 'completion_conflict' });
  });
  it('verifies a real issued Gems run and awards the separate Gem-point balance', async () => {
    const { store, db } = fixture(), actor = member(), run = await store.command(actor, { operation: 'start', game: '3-gems', level: 1 }) as PuzzleRun;
    // Pin the random seed to a reproducible legitimate issued-board fixture.
    db.prepare('UPDATE puzzle_runs SET attempt=9 WHERE id=?').run(run.runId);
    const completion = { operation: 'complete', runId: run.runId, actions: gemsSolution(9) };
    expect(await store.command(actor, completion)).toMatchObject({ verified: true, game: '3-gems', wallet: { gems_points: 25, f3_points: 0 }, progress: { unlocked: 2 } });
    expect(await store.command(actor, completion)).toMatchObject({ alreadyCredited: true, wallet: { gems_points: 25 } });
  });
});
