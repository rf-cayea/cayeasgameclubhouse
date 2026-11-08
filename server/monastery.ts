import type { D1Binding } from './database';
import { RummyError } from '../src/lib/rummy-protocol';
import { memberId } from '../src/lib/rummy-rewards';
import { legacyMonasteryTasks, monasteryProgress, monasteryActivity, MONASTERY_TASKS, type MonasteryProgress, type MonasteryReceipt, type MonasteryActivityReceipt } from '../src/lib/monastery';
import type { PuzzleEconomy } from './puzzle-rewards';
import type { Identity } from './rooms';
import { VILLAGE_JOBS, producerStatus, readVillages, currentVillage, type MonasteryOperation, type VillageId } from '../src/lib/monastery-village';
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
    if (task.requiresOrder && !current.workshop.orders.includes(task.requiresOrder)) throw new RummyError('Complete the related NPC craft order in the workshop first.', 409, 'community_order_needed');
    if (current.stars < task.cost) throw new RummyError(`Earn ${task.cost - current.stars} more restoration ${task.cost - current.stars === 1 ? 'star' : 'stars'} by clearing new levels.`, 409, 'stars_needed');
    const user = memberId(actor.principal)!;
    // One conditional write: simultaneous tabs cannot spend the same stars or
    // complete a later task. Retrying a finished task returns its saved result.
    const changed = await this.db.prepare(`UPDATE gems_monastery SET completed_tasks=completed_tasks+1,updated_at=? WHERE user_id=? AND completed_tasks=? AND ${EARNED_SQL}>=? RETURNING completed_tasks`)
      .bind(this.now(), user, index, current.spentStars + task.cost - current.restorationCredit).first<{ completed_tasks: number }>();
    return { monastery: await this.read(actor), taskId, alreadyRepaired: !changed };
  }
  async activity(actor: Identity, operation: MonasteryOperation, id: string, requestId: string, siteId?: VillageId): Promise<MonasteryActivityReceipt> {
    if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(requestId)) throw new RummyError('Use a valid workshop request ID.');
    const user = memberId(actor.principal);
    if (!user) throw new RummyError('Sign in to save your workshop.', 401);
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.read(actor);
      const row = await this.db.prepare(`SELECT workshop,completed_tasks,${EARNED_SQL} AS earned FROM gems_monastery WHERE user_id=?`).bind(user).first<{ workshop: string; completed_tasks: number; earned: number }>();
      const stored = JSON.parse(row!.workshop) as { receipts?: Record<string, string> }, key = `${operation}:${id}${siteId ? `:${siteId}` : ''}`;
      const receipt = await this.db.prepare('SELECT action_key FROM monastery_requests WHERE user_id=? AND request_id=?').bind(user, requestId).first<{ action_key: string }>();
      const previous = receipt?.action_key ?? stored.receipts?.[requestId];
      if (previous) {
        if (previous !== key) throw new RummyError('This workshop request was already used for another action.', 409, 'request_reused');
        return { monastery: await this.read(actor), alreadyApplied: true };
      }
      // Recalculate from the same JSON revision that the conditional write
      // guards. A simultaneous delivery cannot create stock or supplies.
      const snapshot = monasteryProgress(row!.earned, row!.completed_tasks, stored);
      const now=this.now(), owned=operation==='worker' ? (await this.economy.wallet(actor)).owned : [];
      if(operation==='gather') {
        const job=VILLAGE_JOBS.find(item=>item.id===id),village=readVillages(snapshot.workshop.village)[siteId ?? currentVillage(snapshot.completedTasks)];
        const seconds=job ? producerStatus(village,job.id,now).seconds : 0;
        if(seconds>0) throw new RummyError(`This producer is working. Ready in ${seconds} seconds.`,409,'producer_cooling_down');
      }
      const next = monasteryActivity(snapshot, operation, id, siteId, {now,owned});
      if (!next) throw new RummyError('Check this village’s resources, pantry capacity, unlocked workshops, and available community orders.', 409, 'workshop_unavailable');
      const workshop = JSON.stringify({ ...next.workshop, ...(stored.receipts ? { receipts: stored.receipts } : {}) });
      try {
        await this.db.batch([
          this.db.prepare('INSERT INTO command_guards(valid) SELECT CASE WHEN EXISTS(SELECT 1 FROM gems_monastery WHERE user_id=? AND workshop=? AND completed_tasks=?) AND NOT EXISTS(SELECT 1 FROM monastery_requests WHERE user_id=? AND request_id=?) THEN 1 ELSE 0 END').bind(user, row!.workshop, row!.completed_tasks, user, requestId),
          this.db.prepare('UPDATE gems_monastery SET workshop=?,updated_at=? WHERE user_id=?').bind(workshop, this.now(), user),
          this.db.prepare('INSERT INTO monastery_requests(user_id,request_id,action_key,created_at) VALUES(?,?,?,?)').bind(user, requestId, key, this.now()),
          this.db.prepare('DELETE FROM command_guards'),
        ]);
        return { monastery: await this.read(actor), alreadyApplied: false };
      } catch (cause) { if (!/room_revision_matches|CHECK constraint failed.*command_guards/i.test(String(cause))) throw cause; }
    }
    throw new RummyError('Your workshop changed in another tab. Please retry.', 409, 'workshop_changed');
  }
}
