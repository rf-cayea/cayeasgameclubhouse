import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { EconomyStore } from '../server/economy';
import { MonasteryStore } from '../server/monastery';
import { PuzzleRewardStore } from '../server/puzzle-rewards';
import { ECONOMY_CATALOG } from '../src/lib/economy-protocol';
import { emptyVillages, readVillages } from '../src/lib/monastery-village';
import { monasteryProgress, mergeMonastery } from '../src/lib/monastery';
import { gemsMonastery, newGemsJourney, readGemsJourney, repairGemsMonastery } from '../src/lib/gems-progress';

const databases: TestD1[] = [];
afterEach(() => databases.splice(0).forEach(db => db.sqlite.close()));
const user = '11111111-1111-4111-8111-111111111111', actor = { principal: `member:${user}`, jokers: false };

describe('retired villages preserve restoration progress', () => {
  it('rejects every removed action without changing repairs, the saved archive, stars, or wallet balances', async () => {
    const db = new TestD1(); databases.push(db);
    const economy = new EconomyStore(db), monastery = new MonasteryStore(db, economy), puzzles = new PuzzleRewardStore(db, economy);
    await economy.ensureMember(actor);
    await monastery.read(actor);
    await economy.creditPuzzle(actor, '3-gems', 1);
    const before = await monastery.read(actor), wallet = await economy.wallet(actor);
    const archive = db.sqlite.prepare('SELECT workshop FROM gems_monastery WHERE user_id=?').get(user);
    for (const operation of ['gather', 'village_craft', 'craft', 'deliver', 'alms', 'support', 'producer_upgrade', 'housing', 'worker']) {
      await expect(puzzles.command(actor, { operation, id: 'woodlot', siteId: 'theravada', requestId: randomUUID() })).rejects.toMatchObject({ status: 410, code: 'village_removed' });
    }
    const after = await monastery.read(actor);
    expect({ ...after, serverTime: 0 }).toEqual({ ...before, serverTime: 0 });
    expect(db.sqlite.prepare('SELECT workshop FROM gems_monastery WHERE user_id=?').get(user)).toEqual(archive);
    expect(await economy.wallet(actor)).toEqual(wallet);
    expect(after).not.toHaveProperty('supplies');
    expect(after).not.toHaveProperty('stock');
  });

  it('removes worker purchases from the catalog and cannot charge for a retired item', async () => {
    const db = new TestD1(); databases.push(db); const economy = new EconomyStore(db);
    await economy.ensureMember(actor);
    db.sqlite.prepare('UPDATE economy_wallets SET points=1000,gems_points=1000,owned=? WHERE user_id=?').run(JSON.stringify(['gems-worker-woodlot', 'farkle-dice-ruby']), user);
    const before = await economy.wallet(actor);
    expect(ECONOMY_CATALOG.some(item => item.id.startsWith('gems-worker-'))).toBe(false);
    for (const payment of ['game', 'cash']) {
      await expect(economy.command(actor, { operation: 'purchase', itemId: 'gems-worker-farm', payment })).rejects.toThrow('unavailable');
    }
    expect(await economy.wallet(actor)).toEqual(before);
    expect(before.owned).toEqual(['gems-worker-woodlot', 'farkle-dice-ruby']);
  });

  it('reads a guest’s existing village archive while repairs use stars alone and survive reload', () => {
    const village = emptyVillages(); village.theravada.produced.wood = 3;
    const journey = newGemsJourney(); journey.stars = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(i + 1), 3])); journey.unlocked = 51;
    journey.monastery = { completedTasks: 8, workshop: { made: { beads: 0, cover: 0, cushion: 0 }, orders: [], village, campaign: { version: 2, credit: 0 } } };
    const loaded = readGemsJourney(JSON.stringify(journey)), before = gemsMonastery(loaded);
    expect(before).toMatchObject({ completedTasks: 8, stars: 17 });
    const repaired = repairGemsMonastery(loaded, 'monastery-2-4')!;
    expect(gemsMonastery(readGemsJourney(JSON.stringify(repaired)))).toMatchObject({ completedTasks: 9, stars: 9 });
    expect(repaired.monastery.workshop?.village).toEqual(village);
    expect(mergeMonastery(gemsMonastery(repaired), before).completedTasks).toBe(9);
    expect(readVillages(repaired.monastery.workshop?.village).theravada.produced.wood).toBe(3);
  });

  it('normalizes legacy producer records without resetting first-clear stars or repair credits', () => {
    const village = emptyVillages(); delete village.theravada.production; village.theravada.produced.wood = 3;
    const old = monasteryProgress(60, 10, { made: { beads: 1, cover: 0, cushion: 0 }, orders: ['theravada-beads'], village });
    expect(old).toMatchObject({ completedTasks: 10, stars: 30, restorationCredit: 20 });
    expect(old.workshop.village?.theravada.produced.wood).toBe(3);
    expect(monasteryProgress(60, 10, JSON.parse(JSON.stringify(old.workshop)))).toEqual(old);
  });
});
