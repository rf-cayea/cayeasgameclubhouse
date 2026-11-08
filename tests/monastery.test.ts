import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { EconomyStore } from '../server/economy';
import { MonasteryStore } from '../server/monastery';
import { PuzzleRewardStore } from '../server/puzzle-rewards';
import { gemsMonastery, newGemsJourney, readGemsJourney, repairGemsMonastery, craftGemsMonastery, playGemsJourney, enterGemsLevel } from '../src/lib/gems-progress';
import { MONASTERY_TASKS, monasteryProgress, mergeMonastery } from '../src/lib/monastery';
import { MONASTERY_ORDERS } from '../src/lib/monastery-community';
import { activeMonastery, MONASTERY_SITES } from '../src/lib/monastery-story';
import type { EconomyWallet } from '../src/lib/economy-protocol';

const databases: TestD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));
const user = '11111111-1111-4111-8111-111111111111', actor = { principal: `member:${user}`, jokers: false };
const wallet: EconomyWallet = { points: 3000, f3_points: 0, gems_points: 0, rummy_points: 0, spades_points: 0,dice_points:0, lifetime_points: 0, owned: [], equipped: {}, pending_perks: {} };
async function setup(earned = 0, legacy = false) {
  const db = new TestD1(); databases.push(db); const economy = new EconomyStore(db);
  await economy.ensureMember(actor, { wallet, awards: [] });
  const monastery = new MonasteryStore(db, economy);
  if (!legacy) await monastery.read(actor);
  for (let level = 1; level <= earned; level++) db.sqlite.prepare(level > 150 ? "INSERT INTO gems_extended_progress VALUES(?,?,3,0)" : "INSERT INTO economy_progress VALUES(?,'3-gems',?,3,0)").run(user, level);
  return { db, economy, monastery, puzzles: new PuzzleRewardStore(db, economy) };
}
function guest(earned = 0) {
  const journey = newGemsJourney(); journey.stars = Object.fromEntries(Array.from({ length: earned }, (_, i) => [String(i + 1), 3])); journey.unlocked = Math.min(200, earned + 1); return journey;
}

describe('star-funded monastery and community progression', () => {
  it('budgets exactly 200 stars across fifty missions and four complete monasteries', () => {
    expect(MONASTERY_TASKS).toHaveLength(50);
    expect(MONASTERY_TASKS.reduce((sum, task) => sum + task.cost, 0)).toBe(200);
    expect(MONASTERY_SITES.map(site => site.end - site.start).reduce((a, b) => a + b)).toBe(50);
    expect(activeMonastery(monasteryProgress(150, 0)).id).toBe('theravada');
    expect(activeMonastery(monasteryProgress(150, 10)).id).toBe('mahayana');
    expect(activeMonastery(monasteryProgress(150, 30)).id).toBe('vajrayana');
    expect(activeMonastery(monasteryProgress(150, 40)).id).toBe('zen');
  });
  it('a first guest clear grants one spendable star, and replay ratings cannot farm it', () => {
    const before = newGemsJourney(); before.play.collected = Array(6).fill(1000); before.play.board[0]!.frost = 1;
    const win = playGemsJourney(before, { type: 'booster', kind: 'row', target: 0 })!.journey;
    expect(gemsMonastery(win)).toMatchObject({ earnedStars: 1, stars: 1, completedTasks: 0, supplies: 3 });
    const repaired = repairGemsMonastery(win, MONASTERY_TASKS[0]!.id)!;
    expect(gemsMonastery(repaired)).toMatchObject({ stars: 0, completedTasks: 1, supplies: 5 });
    const replay = enterGemsLevel(repaired, 1)!; replay.play.collected = Array(6).fill(1000); replay.play.board[0]!.frost = 1;
    const again = playGemsJourney(replay, { type: 'booster', kind: 'row', target: 0 })!.journey;
    expect(gemsMonastery(again).stars).toBe(0);
    expect(readGemsJourney(JSON.stringify(again))).toEqual(again);
  });
  it('preserves legacy restored areas and credits unspent clears without automatic future repairs', () => {
    const saved = JSON.parse(JSON.stringify(guest(19))) as Record<string, unknown>; delete saved.monastery;
    const migrated = readGemsJourney(JSON.stringify(saved));
    expect(gemsMonastery(migrated)).toMatchObject({ earnedStars: 19, spentStars: 15, stars: 4, completedTasks: 5 });
    migrated.stars['20'] = 3; migrated.unlocked = 21;
    expect(gemsMonastery(readGemsJourney(JSON.stringify(migrated)))).toMatchObject({ stars: 5, completedTasks: 5 });
  });
  it('requires real stock for NPC orders, unlocks the workshop through star missions, and saves stock', () => {
    let journey = guest(30);
    expect(craftGemsMonastery(journey, 'craft', 'beads')).toBeNull();
    for (const task of MONASTERY_TASKS.slice(0, 4)) journey = repairGemsMonastery(journey, task.id)!;
    expect(gemsMonastery(journey)).toMatchObject({ monks: 1, lessons: 1, completedTasks: 4 });
    expect(craftGemsMonastery(journey, 'deliver', 'theravada-beads')).toBeNull();
    journey = craftGemsMonastery(journey, 'craft', 'beads')!;
    journey = craftGemsMonastery(journey, 'deliver', 'theravada-beads')!;
    expect(craftGemsMonastery(journey, 'deliver', 'theravada-beads')).toBeNull();
    expect(gemsMonastery(journey).stock.beads).toBe(0);
    expect(readGemsJourney(JSON.stringify(journey))).toEqual(journey);
  });
  it('merges late account reads without undoing completed missions, crafted stock or NPC orders', () => {
    const crafted = monasteryProgress(30, 4, { made: { beads: 1, cover: 0, cushion: 0 }, orders: [] });
    const sold = monasteryProgress(30, 4, { made: { beads: 1, cover: 0, cushion: 0 }, orders: ['theravada-beads'] });
    expect(mergeMonastery(sold, crafted)).toEqual(sold);
    expect(mergeMonastery(sold, monasteryProgress(29, 3)).completedTasks).toBe(4);
  });
});

describe('authoritative member monastery persistence and concurrency', () => {
  it('derives stars only from once-credited levels while keeping Clubhouse Cash unchanged', async () => {
    const { economy, monastery } = await setup();
    await economy.creditPuzzle(actor, '3-gems', 1, { stars: 3 });
    await economy.creditPuzzle(actor, '3-gems', 1, { stars: 3 });
    expect(await monastery.read(actor)).toMatchObject({ earnedStars: 1, stars: 1, supplies: 3 });
    expect((await economy.wallet(actor)).points).toBe(3000);
    expect((await economy.wallet(actor)).gems_points).toBe(10);
  });
  it('migrates old automatic restoration only once and persists member repairs across new store instances', async () => {
    const { db, economy, monastery } = await setup(19, true);
    expect(await monastery.read(actor)).toMatchObject({ completedTasks: 5, stars: 4 });
    await expect(monastery.repair(actor, MONASTERY_TASKS[5]!.id)).rejects.toMatchObject({ code: 'stars_needed' });
    await economy.creditPuzzle(actor, '3-gems', 20);
    await monastery.repair(actor, MONASTERY_TASKS[5]!.id);
    expect(await new MonasteryStore(db, economy).read(actor)).toMatchObject({ completedTasks: 6, stars: 0 });
  });
  it('simultaneous repair clicks spend once, reject skipping, and cannot create a negative balance', async () => {
    const { monastery } = await setup(1), id = MONASTERY_TASKS[0]!.id;
    const results = await Promise.all([monastery.repair(actor, id), monastery.repair(actor, id)]);
    expect(results.map(result => result.alreadyRepaired).sort()).toEqual([false, true]);
    expect(await monastery.read(actor)).toMatchObject({ stars: 0, completedTasks: 1 });
    await expect(monastery.repair(actor, MONASTERY_TASKS[1]!.id)).rejects.toMatchObject({ code: 'stars_needed' });
    await expect(monastery.repair(actor, MONASTERY_TASKS[5]!.id)).rejects.toMatchObject({ code: 'repair_locked' });
  });
  it('craft requests are idempotent, competing deliveries cannot duplicate items, and missions require orders', async () => {
    const { monastery } = await setup(50);
    for (const task of MONASTERY_TASKS.slice(0, 8)) await monastery.repair(actor, task.id);
    await expect(monastery.repair(actor, MONASTERY_TASKS[8]!.id)).rejects.toMatchObject({ code: 'community_order_needed' });
    const request = randomUUID();
    const crafted = await Promise.all([monastery.activity(actor, 'craft', 'beads', request), monastery.activity(actor, 'craft', 'beads', request)]);
    expect(crafted.map(result => result.alreadyApplied).sort()).toEqual([false, true]);
    expect((await monastery.read(actor)).stock.beads).toBe(1);
    await expect(monastery.activity(actor, 'craft', 'cover', request)).rejects.toMatchObject({ code: 'request_reused' });
    const deliveries = await Promise.allSettled([monastery.activity(actor, 'deliver', 'theravada-beads', randomUUID()), monastery.activity(actor, 'deliver', 'theravada-beads', randomUUID())]);
    expect(deliveries.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await monastery.read(actor)).toMatchObject({ stock: { beads: 0 }, workshop: { orders: ['theravada-beads'] } });
    expect((await monastery.repair(actor, MONASTERY_TASKS[8]!.id)).monastery.completedTasks).toBe(9);
  });
  it('can complete all fifty missions and all four monastery chapters with exactly the available stars', async () => {
    const { monastery } = await setup(200);
    for (const task of MONASTERY_TASKS) {
      if (task.requiresOrder) {
        const order = MONASTERY_ORDERS.find(item => item.id === task.requiresOrder)!;
        await monastery.activity(actor, 'craft', order.itemId, randomUUID());
        await monastery.activity(actor, 'deliver', order.id, randomUUID());
      }
      await monastery.repair(actor, task.id);
    }
    expect(await monastery.read(actor)).toMatchObject({ earnedStars: 200, stars: 0, spentStars: 200, completedTasks: 50, monks: 4, lessons: 4 });
  });
  it('requires identity and ignores attempts to select an owner or award resources through the API', async () => {
    const { puzzles, monastery } = await setup(10);
    await expect(monastery.read({ principal: 'guest:abc', jokers: false })).rejects.toMatchObject({ status: 401 });
    for (const input of [{ operation: 'monastery', userId: user }, { operation: 'repair', taskId: MONASTERY_TASKS[0]!.id, stars: 1000 }, { operation: 'craft', id: 'beads', requestId: randomUUID(), supplies: 1000 }]) await expect(puzzles.command(actor, input)).rejects.toThrow();
    expect(await monastery.read(actor)).toMatchObject({ stars: 10, completedTasks: 0 });
  });
});
