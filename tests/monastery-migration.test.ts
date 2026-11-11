import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { EconomyStore } from '../server/economy';
import { MonasteryStore } from '../server/monastery';
import { PuzzleRewardStore } from '../server/puzzle-rewards';
import { GEMS_CHAPTERS, GEMS_LEVEL_COUNT, gemsLevel } from '../src/lib/gems-levels';
import { MONASTERY_TASKS, monasteryProgress, mergeMonastery } from '../src/lib/monastery';
import { newGemsJourney, readGemsJourney } from '../src/lib/gems-progress';
import { MONASTERY_SITES } from '../src/lib/monastery-story';

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

describe('four monastery chapters and preserved campaign progress', () => {
  it('has exactly 200 sequential levels, four fifty-level chapters, and fifty stars of repairs per monastery', () => {
    expect(GEMS_LEVEL_COUNT).toBe(200); expect(GEMS_CHAPTERS).toHaveLength(4);
    MONASTERY_SITES.forEach((site, index) => {
      for (let level = index * 50 + 1; level <= (index + 1) * 50; level++) expect(gemsLevel(level).chapter).toBe(index);
      const end = MONASTERY_SITES[index + 1]?.start ?? 50;
      expect(MONASTERY_TASKS.slice(site.start, end).reduce((sum, task) => sum + task.cost, 0)).toBe(50);
    });
    expect(() => gemsLevel(201)).toThrow();
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
});
