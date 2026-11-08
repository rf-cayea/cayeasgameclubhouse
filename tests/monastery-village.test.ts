import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { EconomyStore } from '../server/economy';
import { MonasteryStore } from '../server/monastery';
import { PuzzleRewardStore } from '../server/puzzle-rewards';
import { GEMS_CHAPTERS, GEMS_LEVEL_COUNT, gemsLevel } from '../src/lib/gems-levels';
import { MONASTERY_TASKS, monasteryActivity, monasteryProgress, mergeMonastery } from '../src/lib/monastery';
import { newGemsJourney, readGemsJourney } from '../src/lib/gems-progress';
import { emptyVillages, readVillages, villageInventory, VILLAGE_THEMES, type MonasteryOperation } from '../src/lib/monastery-village';

const databases: TestD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));
const user = '11111111-1111-4111-8111-111111111111', actor = { principal: `member:${user}`, jokers: false };
async function account(earned = 30, tasks = 4, legacy = false) {
  const db = new TestD1(); databases.push(db); const economy = new EconomyStore(db); let time=Date.now(); const monastery = new MonasteryStore(db,economy,()=>time);
  await economy.ensureMember(actor);
  if (!legacy) await monastery.read(actor);
  for (let level = 1; level <= earned; level++) db.sqlite.prepare(level > 150 ? 'INSERT INTO gems_extended_progress VALUES(?,?,3,0)' : "INSERT INTO economy_progress VALUES(?,'3-gems',?,3,0)").run(user, level);
  if (legacy) db.sqlite.prepare("INSERT INTO gems_monastery VALUES(?,?,0,'{}')").run(user, tasks);
  else db.sqlite.prepare('UPDATE gems_monastery SET completed_tasks=? WHERE user_id=?').run(tasks, user);
  return { db, economy, monastery, advance:()=>{time+=100000;}, puzzles: new PuzzleRewardStore(db, economy,()=>time) };
}
let actionTime=1000000;
// These inventory scenarios allow a full production cycle between actions.
const act = (progress: ReturnType<typeof monasteryProgress>, operation: MonasteryOperation, id: string) => monasteryActivity(progress, operation, id, 'theravada', {now:actionTime+=100000,owned:[]})!;

describe('four fifty-level monastery villages', () => {
  it('has exactly 200 sequential levels, four fifty-level chapters, and fifty stars of repairs per community', () => {
    expect(GEMS_LEVEL_COUNT).toBe(200); expect(GEMS_CHAPTERS).toHaveLength(4);
    VILLAGE_THEMES.forEach((site, index) => {
      for (let level = index * 50 + 1; level <= (index + 1) * 50; level++) expect(gemsLevel(level).chapter).toBe(index);
      const end = VILLAGE_THEMES[index + 1]?.start ?? 50;
      expect(MONASTERY_TASKS.slice(site.start, end).reduce((sum, task) => sum + task.cost, 0)).toBe(50);
    });
    expect(() => gemsLevel(201)).toThrow();
  });
  it('harvests into separate capped village pantries and spends wood and fiber on beads', () => {
    let progress = monasteryProgress(30, 4);
    expect(monasteryActivity(progress, 'gather', 'woodlot', 'mahayana')).toBeNull();
    progress = act(progress, 'craft', 'beads');
    expect(villageInventory(readVillages(progress.workshop.village), 'theravada').resources).toMatchObject({ wood: 2, fiber: 5 });
    expect(villageInventory(readVillages(progress.workshop.village), 'mahayana').resources.wood).toBe(4);
    for (let n = 0; n < 10; n++) progress = act(progress, 'gather', 'woodlot');
    expect(villageInventory(readVillages(progress.workshop.village), 'theravada').resources.wood).toBe(32);
    expect(monasteryActivity(progress, 'gather', 'woodlot', 'theravada')).toBeNull();
    expect(progress.stars).toBe(20);
  });
  it('cooks with real ingredients and consumes meals for monks, nuns and lay families with bounded bonuses', () => {
    let progress = monasteryProgress(30, 4), supplies = progress.supplies;
    expect(monasteryActivity(progress, 'alms', 'monks', 'theravada')).toBeNull();
    progress = act(progress, 'village_craft', 'meal');
    progress = act(progress, 'alms', 'monks');
    progress = act(progress, 'village_craft', 'meal');
    progress = act(progress, 'alms', 'nuns');
    expect(progress.supplies).toBe(supplies + 4);
    expect(villageInventory(readVillages(progress.workshop.village), 'theravada').goods.meal).toBe(0);
    expect(monasteryActivity(progress, 'village_craft', 'meal', 'theravada')).toBeNull();
    for (const id of ['farm', 'herbs']) progress = act(progress, 'gather', id);
    progress = act(progress, 'village_craft', 'meal'); progress = act(progress, 'alms', 'monks');
    expect(progress.supplies).toBe(supplies + 4);
    for (const id of ['farm', 'herbs', 'woodlot']) progress = act(progress, 'gather', id);
    progress = act(progress, 'village_craft', 'meal'); progress = act(progress, 'support', 'families');
    expect(progress.supplies).toBe(supplies + 6);
    expect(monasteryActivity(progress, 'support', 'families', 'theravada')).toBeNull();
    expect(readVillages(progress.workshop.village).theravada.alms).toEqual({ monks: 2, nuns: 1 });
  });
  it('gates woodcraft and monastic offerings and consumes wooden goods in one-time community missions', () => {
    expect(monasteryActivity(monasteryProgress(10), 'village_craft', 'bench', 'theravada')).toBeNull();
    let progress = monasteryProgress(30, 4);
    progress = act(progress, 'village_craft', 'bowl'); progress = act(progress, 'support', 'kitchen');
    progress = act(progress, 'gather', 'woodlot'); progress = act(progress, 'village_craft', 'bench'); progress = act(progress, 'support', 'study');
    expect(villageInventory(readVillages(progress.workshop.village), 'theravada').goods).toEqual({ meal: 0, bowl: 0, bench: 0 });
    expect(progress.supplies).toBe(monasteryProgress(30, 4).supplies + 7);
    const waiting = act(monasteryProgress(10), 'village_craft', 'meal');
    expect(monasteryActivity(waiting, 'alms', 'nuns', 'theravada')).toBeNull();
  });
  it('rejects malformed inventories and preserves the latest harvest and consumed goods across late responses', () => {
    const ledger = emptyVillages(); ledger.theravada.used.wood = 5;
    expect(() => readVillages(ledger)).toThrow();
    ledger.theravada.used.wood = 0; ledger.theravada.prepared.meal = 13;
    expect(() => readVillages(ledger)).toThrow();
    const before = monasteryProgress(30, 4), cooked = act(before, 'village_craft', 'meal'), offered = act(cooked, 'alms', 'nuns');
    expect(mergeMonastery(offered, cooked)).toEqual(offered);
  });
  it('migrates the old level-150 guest cap and paid repairs once without resetting stock or ratings', () => {
    const journey = newGemsJourney(); journey.stars = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [String(i + 1), 3])); journey.unlocked = 150;
    journey.monastery = { completedTasks: 50, workshop: { made: { beads: 2, cover: 1, cushion: 1 }, orders: ['theravada-beads', 'mahayana-cover', 'vajrayana-beads', 'zen-cushion'] } };
    const next = readGemsJourney(JSON.stringify(journey));
    expect(next.unlocked).toBe(151); expect(Object.keys(next.stars)).toHaveLength(150);
    expect(next.monastery.workshop?.campaign).toEqual({ version: 2, credit: 50 });
    expect(monasteryProgress(150, 50, next.monastery.workshop)).toMatchObject({ stars: 0, restorationCredit: 50 });
    expect(readGemsJourney(JSON.stringify(next))).toEqual(next);
  });
});

describe('saved member villages and extended levels', () => {
  it('persists a legacy repair credit once, then charges new repairs their new cost', async () => {
    const { db, economy, monastery } = await account(60, 10, true);
    expect(await monastery.read(actor)).toMatchObject({ stars: 30, restorationCredit: 20, completedTasks: 10 });
    await monastery.repair(actor, MONASTERY_TASKS[10]!.id);
    expect(await new MonasteryStore(db, economy).read(actor)).toMatchObject({ stars: 29, restorationCredit: 20, completedTasks: 11 });
  });
  it('continues rewards beyond 150, counts new stars, and prevents replaying level 200 for extra points', async () => {
    const { economy, monastery, puzzles } = await account(150);
    for (let level = 151; level <= 200; level++) await economy.creditPuzzle(actor, '3-gems', level, { stars: 2 });
    expect(await economy.puzzleProgress(actor, '3-gems')).toMatchObject({ unlocked: 200 });
    expect((await economy.puzzleProgress(actor, '3-gems')).levels).toHaveLength(200);
    expect(await monastery.read(actor)).toMatchObject({ earnedStars: 200, stars: 190 });
    const balance = (await economy.wallet(actor)).gems_points;
    expect(await economy.creditPuzzle(actor, '3-gems', 200, { stars: 3 })).toMatchObject({ alreadyCredited: true });
    expect((await economy.wallet(actor)).gems_points).toBe(balance);
    expect((await economy.puzzleProgress(actor, '3-gems')).stars['200']).toBe(3);
    expect((await economy.read(actor)).stats).toMatchObject({ gemsLevels: 200, gemsStars: 551, gemsChapters: 4 });
    expect(await puzzles.command(actor, { operation: 'start', game: '3-gems', level: 200 })).toMatchObject({ level: 200 });
    await expect(puzzles.command(actor, { operation: 'start', game: '3-gems', level: 201 })).rejects.toThrow();
  });
  it('serializes simultaneous harvests and retains idempotency across store instances and API retries', async () => {
    const { db, economy, monastery, puzzles, advance } = await account(), requestId = randomUUID();
    const command = { operation: 'gather', id: 'woodlot', siteId: 'theravada', requestId };
    const results = await Promise.all([puzzles.command(actor, command), puzzles.command(actor, command)]);
    expect(results.map(result => 'alreadyApplied' in result && result.alreadyApplied).sort()).toEqual([false, true]);
    await expect(monastery.activity(actor,'gather','woodlot',randomUUID(),'theravada')).rejects.toMatchObject({code:'producer_cooling_down'});
    advance();
    await monastery.activity(actor, 'gather', 'woodlot', randomUUID(), 'theravada');
    const saved = await new MonasteryStore(db, economy).read(actor);
    expect(villageInventory(readVillages(saved.workshop.village), 'theravada').resources.wood).toBe(10);
    expect(await puzzles.command(actor, command)).toMatchObject({ alreadyApplied: true });
    await expect(puzzles.command(actor, { ...command, id: 'farm' })).rejects.toMatchObject({ code: 'request_reused' });
    await expect(puzzles.command(actor, { ...command, requestId: randomUUID(), resources: { wood: 999 } })).rejects.toThrow();
    await expect(puzzles.command(actor, { ...command, siteId: 'zen', requestId: randomUUID() })).rejects.toMatchObject({ code: 'workshop_unavailable' });
  });
  it('persists cooked meals, consumes an offering once, and leaves the real wallet unchanged', async () => {
    const { economy, monastery } = await account(), before = await economy.wallet(actor);
    await monastery.activity(actor, 'village_craft', 'meal', randomUUID(), 'theravada');
    const request = randomUUID();
    await monastery.activity(actor, 'alms', 'nuns', request, 'theravada');
    expect(await monastery.activity(actor, 'alms', 'nuns', request, 'theravada')).toMatchObject({ alreadyApplied: true });
    const progress = await monastery.read(actor), inventory = villageInventory(readVillages(progress.workshop.village), 'theravada');
    expect(inventory.goods.meal).toBe(0); expect(inventory.record.alms.nuns).toBe(1); expect(inventory.resources.wood).toBe(3);
    expect(await economy.wallet(actor)).toEqual(before);
  });
});
