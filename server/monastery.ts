import type { D1Binding } from './database';
import { RummyError } from '../src/lib/rummy-protocol';
import { memberId } from '../src/lib/rummy-rewards';
import { legacyMonasteryTasks, monasteryProgress, MONASTERY_TASKS, type MonasteryProgress, type MonasteryReceipt } from '../src/lib/monastery';
import type { PuzzleEconomy } from './puzzle-rewards';
import type { Identity } from './rooms';
const EARNED_SQL = "((SELECT count(*) FROM economy_progress WHERE user_id=gems_monastery.user_id AND game='3-gems') + (SELECT count(*) FROM gems_extended_progress WHERE user_id=gems_monastery.user_id))";

/** Stars derive from verified first clears. Only completed repairs are stored. */
export class MonasteryStore {
  constructor(readonly db: D1Binding, readonly economy: PuzzleEconomy, readonly now = Date.now) {}
  async read(actor: Identity): Promise<MonasteryProgress> {
    const user = memberId(actor.principal);
    if (!user) throw new RummyError('Sign in to save your monastery.', 401, 'sign_in_required');
    const progress = await this.economy.puzzleProgress(actor, '3-gems'), earned = progress.levels.length;
    // Runs initialize this row before a new clear is credited. Existing players
    // retain their previously completed automatic restoration areas once.
    await this.db.prepare('INSERT OR IGNORE INTO gems_monastery(user_id,completed_tasks,updated_at) VALUES(?,?,?)')
      .bind(user, legacyMonasteryTasks(earned), this.now()).run();
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await this.db.prepare(`SELECT completed_tasks,workshop,${EARNED_SQL} AS earned FROM gems_monastery WHERE user_id=?`).bind(user).first<{ completed_tasks: number; workshop: string; earned: number }>();
      const stored = JSON.parse(row!.workshop), result = monasteryProgress(row!.earned, row!.completed_tasks, stored);
      if (stored.campaign) return {...result,serverTime:this.now()};
      // Freeze the legacy credit at the existing repair count before any new spend.
      const changed = await this.db.prepare('UPDATE gems_monastery SET workshop=?,updated_at=? WHERE user_id=? AND workshop=? AND completed_tasks=? RETURNING user_id')
        .bind(JSON.stringify({ ...stored, ...result.workshop }), this.now(), user, row!.workshop, row!.completed_tasks).first();
      if (changed) return {...result,serverTime:this.now()};
    }
    throw new RummyError('Your monastery changed in another tab. Please retry.', 409, 'workshop_changed');
  }
  async repair(actor: Identity, taskId: string): Promise<MonasteryReceipt> {
    const current = await this.read(actor), index = MONASTERY_TASKS.findIndex(task => task.id === taskId);
    if (index < 0) throw new RummyError('Choose a monastery repair task.');
    if (index < current.completedTasks) return { monastery: current, taskId, alreadyRepaired: true };
    if (index !== current.completedTasks) throw new RummyError('Finish the earlier repair tasks first.', 409, 'repair_locked');
    const task = MONASTERY_TASKS[index]!;
    if (current.stars < task.cost) throw new RummyError(`Earn ${task.cost - current.stars} more restoration ${task.cost - current.stars === 1 ? 'star' : 'stars'} by clearing new levels.`, 409, 'stars_needed');
    const user = memberId(actor.principal)!;
    // One conditional write: simultaneous tabs cannot spend the same stars or
    // complete a later task. Retrying a finished task returns its saved result.
    const changed = await this.db.prepare(`UPDATE gems_monastery SET completed_tasks=completed_tasks+1,updated_at=? WHERE user_id=? AND completed_tasks=? AND ${EARNED_SQL}>=? RETURNING completed_tasks`)
      .bind(this.now(), user, index, current.spentStars + task.cost - current.restorationCredit).first<{ completed_tasks: number }>();
    return { monastery: await this.read(actor), taskId, alreadyRepaired: !changed };
  }
}
