import { applyGemsAction, gemsGoalsMet, gemsStars, startGems, type GemsAction, type GemsOutcome, type GemsState } from './gems-engine';
import { BOOSTERS, GEMS_LEVEL_COUNT, GEMS_SIZE, gemsClearReward, type Inventory } from './gems-levels';
import { legacyMonasteryTasks, monasteryProgress, MONASTERY_TASKS } from './monastery';
import { emptyWorkshop, type MonasteryWorkshop } from './monastery-community';

export const GEMS_SAVE_KEY = 'clubhouse-three-gems-v1';
export interface GemsJourney {
  version: 1; revision: number; unlocked: number; attempts: number;
  stars: Record<string, number>; inventory: Inventory; play: GemsState;
  reward: { level: number; items: Inventory } | null;
  monastery: { completedTasks: number; workshop?: MonasteryWorkshop };
}
export function newGemsJourney(): GemsJourney {
  return { version: 1, revision: 0, unlocked: 1, attempts: 0, stars: {},
    inventory: { row: 2, column: 2, burst: 1, shuffle: 1 }, play: startGems(1), reward: null, monastery: { completedTasks: 0, workshop: emptyWorkshop() } };
}
const whole = (n: unknown, max = 1_000_000): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= max;
function validInventory(value: unknown): value is Inventory {
  return Boolean(value && typeof value === 'object' && Object.keys(BOOSTERS).every(key => whole((value as Inventory)[key as keyof Inventory])));
}
function validPlay(value: unknown): value is GemsState {
  if (!value || typeof value !== 'object') return false;
  const p = value as GemsState;
  if (p.rules !== undefined && p.rules !== 1 && p.rules !== 2) return false;
  if (!whole(p.level, GEMS_LEVEL_COUNT) || p.level < 1 || !whole(p.seed, 0xffffffff) || !whole(p.nextId) || p.nextId < 1 || !whole(p.movesLeft, 100) || !whole(p.score, 1_000_000_000) ||
    !whole(p.turns, 10000) || !whole(p.cratesCleared, 64) || !whole(p.chainsCleared, 64) || !whole(p.frostCleared, 192) || !['play', 'won', 'lost'].includes(p.status) ||
    !Array.isArray(p.collected) || p.collected.length !== 6 || !p.collected.every(count => whole(count, 100000)) || !Array.isArray(p.board) || p.board.length !== GEMS_SIZE ** 2) return false;
  const ids = new Set<number>();
  for (const cell of p.board) {
    if (!cell || !whole(cell.crate, 3) || !whole(cell.frost, 3) || typeof cell.chain !== 'boolean' || (cell.crate && (cell.gem || cell.chain))) return false;
    const gem = cell.gem;
    if (!gem) { if (!cell.crate) return false; continue; }
    if (!whole(gem.id) || gem.id < 1 || gem.id >= p.nextId || ids.has(gem.id) ||
      (gem.special !== undefined && !['row', 'column', 'burst', 'orb', 'lantern'].includes(gem.special)) ||
      (gem.special === 'orb' ? gem.color !== -1 : !whole(gem.color, 5))) return false;
    ids.add(gem.id);
  }
  return p.status === 'won' ? gemsGoalsMet(p) : p.status === 'lost' ? p.movesLeft === 0 && !gemsGoalsMet(p) : p.movesLeft > 0 && !gemsGoalsMet(p);
}
export function readGemsJourney(raw: string | null): GemsJourney {
  if (!raw) return newGemsJourney();
  try {
    const value = JSON.parse(raw) as GemsJourney;
    if (value.version !== 1 || !whole(value.revision, Number.MAX_SAFE_INTEGER) || !whole(value.attempts) || !whole(value.unlocked, GEMS_LEVEL_COUNT) || value.unlocked < 1 ||
      !validInventory(value.inventory) || !value.stars || typeof value.stars !== 'object' || Array.isArray(value.stars) ||
      Object.entries(value.stars).some(([key, stars]) => !/^[1-9]\d{0,2}$/.test(key) || Number(key) > GEMS_LEVEL_COUNT || !whole(stars, 3) || stars < 1) ||
      !validPlay(value.play) || value.play.level > value.unlocked ||
      (value.reward !== null && (!value.reward || !whole(value.reward.level, GEMS_LEVEL_COUNT) || value.reward.level < 1 || !validInventory(value.reward.items)))) return newGemsJourney();
    // Saved progress advances sequentially; stale or incomplete saves cannot
    // silently skip a chapter when the game is restored.
    let unlocked = 1;
    while (unlocked < GEMS_LEVEL_COUNT && value.stars[String(unlocked)]) unlocked++;
    if (value.unlocked === 150 && unlocked === 151) value.unlocked = unlocked;
    if (unlocked !== value.unlocked) return newGemsJourney();
    const earned = Object.keys(value.stars).length;
    if (value.monastery === undefined) value.monastery = { completedTasks: legacyMonasteryTasks(earned) };
    if (!value.monastery || !whole(value.monastery.completedTasks, MONASTERY_TASKS.length)) return newGemsJourney();
    value.monastery.workshop = monasteryProgress(earned, value.monastery.completedTasks, value.monastery.workshop ?? {}).workshop;
    return value;
  } catch { return newGemsJourney(); }
}

export function playGemsJourney(journey: GemsJourney, action: GemsAction): { journey: GemsJourney; outcome: GemsOutcome } | null {
  if (action.type === 'booster' && (!Object.hasOwn(BOOSTERS, action.kind) || journey.inventory[action.kind] <= 0)) return null;
  const outcome = applyGemsAction(journey.play, action);
  if (!outcome) return null;
  const next: GemsJourney = { ...journey, revision: journey.revision + 1, play: outcome.state, inventory: { ...journey.inventory }, stars: { ...journey.stars }, reward: null };
  if (action.type === 'booster') next.inventory[action.kind]--;
  if (outcome.state.status === 'won') {
    const level = outcome.state.level, first = !next.stars[String(level)];
    next.stars[String(level)] = Math.max(next.stars[String(level)] ?? 0, gemsStars(outcome.state));
    next.unlocked = Math.min(GEMS_LEVEL_COUNT, Math.max(next.unlocked, level + 1));
    if (first) {
      const items = gemsClearReward(level);
      for (const kind of Object.keys(BOOSTERS) as (keyof Inventory)[]) next.inventory[kind] += items[kind];
      next.reward = { level, items };
    }
  }
  return { journey: next, outcome };
}

export function enterGemsLevel(journey: GemsJourney, level: number): GemsJourney | null {
  if (!Number.isInteger(level) || level < 1 || level > journey.unlocked) return null;
  return { ...journey, revision: journey.revision + 1, attempts: journey.attempts + 1, play: startGems(level, journey.attempts + 1), reward: null };
}

export function gemsMonastery(journey: GemsJourney) { return monasteryProgress(Object.keys(journey.stars).length, journey.monastery.completedTasks, journey.monastery.workshop ?? {}); }
export function repairGemsMonastery(journey: GemsJourney, taskId: string): GemsJourney | null {
  const progress = gemsMonastery(journey), task = MONASTERY_TASKS[progress.completedTasks];
  if (!task || task.id !== taskId || progress.stars < task.cost) return null;
  return { ...journey, revision: journey.revision + 1, monastery: { completedTasks: progress.completedTasks + 1, workshop: progress.workshop } };
}
