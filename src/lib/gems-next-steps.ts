import { MONASTERY_TASKS, type MonasteryProgress } from './monastery';
import { MONASTERY_ORDERS } from './monastery-community';
import { readVillages, villageInventory, VILLAGE_SUPPORT, VILLAGE_THEMES } from './monastery-village';

/** Offer only actions the saved account can actually take now. */
export function gemsNextSteps(progress: MonasteryProgress) {
  const task = MONASTERY_TASKS[progress.completedTasks] ?? null;
  const funded = Boolean(task && progress.stars >= task.cost);
  const repairReady = Boolean(funded && (!task!.requiresOrder || progress.workshop.orders.includes(task!.requiresOrder)));
  let villageActions = MONASTERY_ORDERS.filter(order => order.unlock <= progress.completedTasks && !progress.workshop.orders.includes(order.id) && progress.stock[order.itemId] > 0).length;
  const ledger = readVillages(progress.workshop.village);
  for (const village of VILLAGE_THEMES) if (progress.completedTasks >= village.start) {
    const { goods, record } = villageInventory(ledger, village.id);
    villageActions += VILLAGE_SUPPORT.filter(mission => !record.support[mission.id] && goods[mission.item] > 0).length;
    if (progress.completedTasks > village.monastics && goods.meal > 0) villageActions += Number(record.alms.monks === 0) + Number(record.alms.nuns === 0);
  }
  return { task, repairReady, needsOrder: funded && !repairReady, villageActions };
}
