import { GEMS_LEVEL_COUNT, MONASTERY_PROJECTS } from './gems-levels';
import { emptyWorkshop, readWorkshop, MONASTERY_CRAFTS, MONASTERY_ORDERS, type MonasteryWorkshop } from './monastery-community';
import { mergeVillages } from './monastery-village';

export interface MonasteryProgress { serverTime?: number; earnedStars: number; spentStars: number; restorationCredit: number; stars: number; completedTasks: number; workshop: MonasteryWorkshop }
export interface MonasteryReceipt { monastery: MonasteryProgress; taskId: string; alreadyRepaired: boolean }
const TASKS = [
  ['Clear the fallen stones and weeds', 'Restore the resident quarters', 'Repair the Dharma teaching pavilion', 'Rebuild the courtyard cloister', 'Repair the courtyard and tend the lotus planters'],
  ['Clear the overgrown Bodhi garden', 'Prepare and tend the garden beds', 'Care for the Bodhi tree', 'Restore the Bodhi garden walkway', 'Clean the meditation Buddha shrine'],
  ['Clear the lantern path', 'Repair the guest quarters', 'Restore the lantern frames', 'Hang the silk lanterns', 'Repair the lantern pavilion'],
  ['Clear the pond basin', 'Repair the water channels', 'Restore the lotus beds', 'Rebuild the little bridge', 'Return the flowing water'],
  ['Clear the old entrance', 'Repair the gate foundations', 'Raise the carved pillars', 'Restore the tiled arch', 'Open the monastery gate'],
  ['Clear the hall ruins', 'Repair the stone foundation', 'Rebuild the timber walls', 'Restore the gilded Buddha shrine', 'Restore the Dharma library'],
  ['Clear the broken roof tiles', 'Rebuild the mountain residential roof', 'Strengthen the roof beams', 'Repair the gilded roof details', 'Restore the rooftop prayer canopy'],
  ['Clear the stupa terrace', 'Restore the earth-touching Buddha shrine', 'Tend the mountain garden', 'Restore the carved prayer-wheel surrounds', 'Complete the golden stupa'],
  ['Clean the meditation hall', 'Repair the meditation teachers’ quarters', 'Clean the bronze meditation Buddha', 'Rake and tend the dry landscape garden', 'Repair the meditation hall floor'],
  ['Sweep the monastery paths', 'Arrange the welcome flowers', 'Hang the celebration banners', 'Restore the gathering seats', 'Reopen all four monasteries'],
] as const;
const TEN_COSTS = [1, 2, 3, 4, 5, 5, 6, 7, 8, 9];
const COSTS = [...TEN_COSTS, 1, 2, 2, 3, 4, 1, 2, 3, 3, 4, 1, 2, 2, 3, 4, 1, 2, 3, 3, 4, ...TEN_COSTS, ...TEN_COSTS];
export const MONASTERY_TASKS = TASKS.flatMap((titles, project) => titles.map((title, step) => ({
  id: `monastery-${project + 1}-${step + 1}`, title, project, step, cost: COSTS[project * 5 + step]!, kind: ([0, 4, 5, 6, 7, 10, 15, 16, 17, 19, 23, 37, 43].includes(project * 5 + step) ? 'garden' : 'repair'),
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
  return { earnedStars: earned, completedTasks: count, spentStars, restorationCredit, stars: earned + restorationCredit - spentStars, workshop };
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
