import { MONASTERY_TASKS, type MonasteryProgress } from './monastery';

/** Every restoration depends only on completed repairs and first-clear stars. */
export function gemsNextSteps(progress: MonasteryProgress) {
  const task = MONASTERY_TASKS[progress.completedTasks] ?? null;
  return { task, repairReady: Boolean(task && progress.stars >= task.cost) };
}
