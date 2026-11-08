import { GEMS_LEVEL_COUNT, MONASTERY_PROJECTS } from './gems-levels';
import { emptyWorkshop, readWorkshop, monasteryCommunity, monasteryMission, MONASTERY_CRAFTS, MONASTERY_ORDERS, type MonasteryWorkshop } from './monastery-community';
import { currentVillage, mergeVillages, readVillages, spendVillageMaterials, villageAction, villageTheme, type MonasteryOperation, type VillageContext } from './monastery-village';

export interface MonasteryProgress { serverTime?: number; earnedStars: number; spentStars: number; restorationCredit: number; stars: number; completedTasks: number; workshop: MonasteryWorkshop; supplies: number; monks: number; nuns: number; lessons: number; stock: ReturnType<typeof monasteryCommunity>['stock'] }
export interface MonasteryReceipt { monastery: MonasteryProgress; taskId: string; alreadyRepaired: boolean }
export interface MonasteryActivityReceipt { monastery: MonasteryProgress; alreadyApplied: boolean }
const TASKS = [
  ['Clear the fallen stones and weeds', 'Welcome resident monks and nuns', 'Host the first Dharma lesson', 'Open the community craft workshop', 'Repair the courtyard and tend the lotus planters'],
  ['Clear the overgrown Bodhi garden', 'Prepare and tend the garden beds', 'Care for the Bodhi tree', 'Deliver the first mala-bead order', 'Clean the meditation Buddha shrine'],
  ['Clear the lantern path', 'Welcome visiting monks and nuns', 'Craft the lantern frames', 'Hang the silk lanterns', 'Share a wisdom and compassion lesson'],
  ['Clear the pond basin', 'Repair the water channels', 'Restore the lotus beds', 'Rebuild the little bridge', 'Return the flowing water'],
  ['Clear the old entrance', 'Repair the gate foundations', 'Raise the carved pillars', 'Restore the tiled arch', 'Open the monastery gate'],
  ['Clear the hall ruins', 'Repair the stone foundation', 'Rebuild the timber walls', 'Restore the gilded Buddha shrine', 'Supply the Dharma study group'],
  ['Clear the broken roof tiles', 'Welcome mountain monks and nuns', 'Strengthen the roof beams', 'Repair the gilded roof details', 'Offer a mountain Dharma lesson'],
  ['Clear the stupa terrace', 'Restore the earth-touching Buddha shrine', 'Tend the mountain garden', 'Prepare community prayer beads', 'Complete the golden stupa'],
  ['Clean the meditation hall', 'Welcome meditation teachers', 'Clean the bronze meditation Buddha', 'Rake and tend the dry landscape garden', 'Share a quiet meditation lesson'],
  ['Sweep the monastery paths', 'Arrange the welcome flowers', 'Hang the celebration banners', 'Provide cushions for the community gathering', 'Welcome all four communities'],
] as const;
const TEN_COSTS = [1, 2, 3, 4, 5, 5, 6, 7, 8, 9];
const COSTS = [...TEN_COSTS, 1, 2, 2, 3, 4, 1, 2, 3, 3, 4, 1, 2, 2, 3, 4, 1, 2, 3, 3, 4, ...TEN_COSTS, ...TEN_COSTS];
export const MONASTERY_TASKS = TASKS.flatMap((titles, project) => titles.map((title, step) => ({
  id: `monastery-${project + 1}-${step + 1}`, title, project, step, cost: COSTS[project * 5 + step]!, ...monasteryMission(project * 5 + step),
})));
export const MONASTERY_TASK_COUNT = MONASTERY_TASKS.length;
export function monasteryProgress(earnedStars: number, completedTasks = 0, input: unknown = emptyWorkshop()): MonasteryProgress {
  const earned = Math.min(GEMS_LEVEL_COUNT, Math.max(0, Math.floor(earnedStars))), count = Math.min(MONASTERY_TASK_COUNT, Math.max(0, Math.floor(completedTasks)));
  const spentStars = MONASTERY_TASKS.slice(0, count).reduce((total, task) => total + task.cost, 0);
  const workshop = readWorkshop(input);
  // Convert paid repairs once. Existing players retain their exact unspent stars.
  workshop.campaign ??= { version: 2, credit: spentStars - MONASTERY_TASKS.slice(0, count).reduce((total, task) => total + task.step + 1, 0) };
  const restorationCredit = workshop.campaign.credit;
  if (spentStars > earned + restorationCredit) throw new Error('Monastery repairs exceed the stars earned from completed levels.');
  return { earnedStars: earned, completedTasks: count, spentStars, restorationCredit, stars: earned + restorationCredit - spentStars, workshop, ...monasteryCommunity(earned, count, workshop) };
}
/** Honor areas already restored by the old automatic fifteen-level milestones. */
export function legacyMonasteryTasks(cleared: number) { return Math.min(10, Math.floor(Math.max(0, cleared) / 15)) * 5; }
export function monasteryView(progress: MonasteryProgress) {
  const stage = Math.floor(progress.completedTasks / 5), reopened = stage === 10;
  return { stage, reopened, project: MONASTERY_PROJECTS[Math.min(9, stage)]!, inProject: reopened ? 5 : progress.completedTasks % 5,
    nextTask: MONASTERY_TASKS[progress.completedTasks] ?? null };
}
/** Counts only increase; a slower read cannot undo a more recent repair/clear. */
export function mergeMonastery(previous: MonasteryProgress | null, next: MonasteryProgress) {
  const workshop = { made: Object.fromEntries(MONASTERY_CRAFTS.map(item => [item.id, Math.max(previous?.workshop.made[item.id] ?? 0, next.workshop.made[item.id])])), orders: [...new Set([...(previous?.workshop.orders ?? []), ...next.workshop.orders])], village: mergeVillages(previous?.workshop.village, next.workshop.village), campaign: next.workshop.campaign ?? previous?.workshop.campaign };
  const result = monasteryProgress(Math.max(previous?.earnedStars ?? 0, next.earnedStars), Math.max(previous?.completedTasks ?? 0, next.completedTasks), workshop);
  const serverTime=Math.max(previous?.serverTime ?? 0,next.serverTime ?? 0);
  return serverTime ? {...result,serverTime} : result;
}

export function monasteryActivity(progress: MonasteryProgress, operation: MonasteryOperation, id: string, siteId = currentVillage(progress.completedTasks), context?: VillageContext) {
  const workshop = structuredClone(progress.workshop);
  const site = villageTheme(siteId);
  if (!site || progress.completedTasks < site.start) return null;
  if (operation !== 'craft' && operation !== 'deliver') {
    const village = villageAction(readVillages(workshop.village), progress.completedTasks, operation, id, siteId, context, progress.supplies);
    return village ? monasteryProgress(progress.earnedStars, progress.completedTasks, { ...workshop, village }) : null;
  }
  if (progress.completedTasks < 4) return null;
  if (operation === 'craft') {
    const item = MONASTERY_CRAFTS.find(craft => craft.id === id);
    if (!item || progress.supplies < item.cost) return null;
    const demand = MONASTERY_ORDERS.filter(order => order.itemId === item.id && !workshop.orders.includes(order.id)).length;
    if (progress.stock[item.id] >= demand) return null;
    const village = readVillages(workshop.village);
    if (!spendVillageMaterials(village, site.id, item.materials)) return null;
    workshop.village = village;
    workshop.made[item.id]++;
  } else {
    const order = MONASTERY_ORDERS.find(item => item.id === id);
    if (!order || order.unlock > progress.completedTasks || workshop.orders.includes(id) || progress.stock[order.itemId] < 1) return null;
    workshop.orders.push(id);
  }
  return monasteryProgress(progress.earnedStars, progress.completedTasks, workshop);
}
