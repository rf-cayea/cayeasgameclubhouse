import type { D1Binding } from './database';
import type { Identity } from './rooms';
import { RummyError } from '../src/lib/rummy-protocol';
import { memberId } from '../src/lib/rummy-rewards';
import { applyAction, initPlay, MAX_MAGIC_PER_WIN, type Action } from '../src/lib/engine';
import { FREE_SHUFFLES, FREE_UNDOS, TOTAL_LEVELS } from '../src/lib/game';
import { applyGemsAction, gemsStars, startGems, type GemsAction } from '../src/lib/gems-engine';
import { GEMS_LEVEL_COUNT, GEMS_RULES, type GemsRules } from '../src/lib/gems-levels';
import { villageTheme, type MonasteryOperation, type VillageId } from '../src/lib/monastery-village';
import { MonasteryStore } from './monastery';
import type { MonasteryProgress, MonasteryReceipt, MonasteryActivityReceipt } from '../src/lib/monastery';
import type { PuzzleProgress, EconomyWallet } from '../src/lib/economy-protocol';
import { PUZZLE_MAX_ACTIONS, PUZZLE_RUN_BOOSTERS, type PuzzleGame, type PuzzleRun, type PuzzleReceipt } from '../src/lib/puzzle-rewards-protocol';

export interface PuzzleEconomy {
  wallet(actor: Identity): Promise<EconomyWallet>;
  puzzleProgress(actor: Identity, game: PuzzleGame): Promise<PuzzleProgress>;
  creditPuzzle(actor: Identity, game: PuzzleGame, level: number, metadata?: { stars?: number; flawless?: boolean; completionId?: string }): Promise<{ amount: number; alreadyCredited: boolean; wallet: EconomyWallet }>;
}
interface StoredRun { id: string; user_id: string; game: PuzzleGame; level: number; attempt: number; expires_at: number; status: string; proof: string | null; rules_version: GemsRules; created_at: number }
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

/** Replay every move from a server-issued board; scores and won flags are never inputs. */
export function verifyPuzzleReplay(game: PuzzleGame, level: number, attempt: number, input: unknown, rules: GemsRules = GEMS_RULES): { stars?: number; flawless?: boolean } | null {
  if (!Array.isArray(input) || !input.length || input.length > PUZZLE_MAX_ACTIONS) return null;
  if (game === 'faith-3') {
    let state = initPlay(level);
    for (const raw of input) {
      if (!object(raw) || typeof raw.t !== 'string' || !exact(raw, raw.t === 'pick' ? ['t', 'id'] : ['t'])) return null;
      if (raw.t === 'pick' ? !Number.isSafeInteger(raw.id) : !['undo', 'shuffle', 'magic'].includes(raw.t)) return null;
      if (state.status === 'won' || (raw.t === 'undo' && state.undoUsed >= FREE_UNDOS) || (raw.t === 'shuffle' && state.shuffleCount >= FREE_SHUFFLES) || (raw.t === 'magic' && state.magicUsed >= MAX_MAGIC_PER_WIN)) return null;
      const next = applyAction(level, state, raw as unknown as Action);
      if (!next) return null;
      state = next;
    }
    return state.status === 'won' ? { flawless: !state.helped } : null;
  }
  let state = startGems(level, attempt, rules);
  const remaining = { ...PUZZLE_RUN_BOOSTERS };
  for (const raw of input) {
    if (!object(raw) || state.status !== 'play') return null;
    if (raw.type === 'swap') {
      if (!exact(raw, ['type', 'a', 'b']) || !Number.isInteger(raw.a) || !Number.isInteger(raw.b)) return null;
    } else if (raw.type === 'booster') {
      if (!exact(raw, ['type', 'kind', 'target']) || typeof raw.kind !== 'string' || !Object.hasOwn(remaining, raw.kind)) return null;
      const kind = raw.kind as keyof typeof remaining;
      if (remaining[kind] <= 0 || (kind !== 'shuffle' && (!Number.isInteger(raw.target) || Number(raw.target) < 0 || Number(raw.target) >= 64)) || (kind === 'shuffle' && raw.target !== undefined)) return null;
      remaining[kind]--;
    } else return null;
    const next = applyGemsAction(state, raw as unknown as GemsAction);
    if (!next) return null;
    state = next.state;
  }
  return state.status === 'won' ? { stars: gemsStars(state) } : null;
}

/** Owner-bound, expiring challenges plus idempotent first-clear economy credit. */
export class PuzzleRewardStore {
  constructor(readonly db: D1Binding, readonly economy: PuzzleEconomy, readonly now = Date.now) {}
  private actor(actor: Identity) {
    const id = memberId(actor.principal);
    if (!id) throw new RummyError('Sign in to earn saved puzzle points.', 401, 'sign_in_required');
    return id;
  }
  async read(actor: Identity) {
    this.actor(actor);
    return { 'faith-3': await this.economy.puzzleProgress(actor, 'faith-3'), '3-gems': await this.economy.puzzleProgress(actor, '3-gems') };
  }
  async command(actor: Identity, input: unknown): Promise<PuzzleRun | PuzzleReceipt | { monastery: MonasteryProgress } | MonasteryReceipt | MonasteryActivityReceipt> {
    const user = this.actor(actor);
    if (!object(input)) throw new RummyError('Send a puzzle command.');
    if (input.operation === 'monastery' && exact(input, ['operation'])) return { monastery: await new MonasteryStore(this.db, this.economy, this.now).read(actor) };
    if (input.operation === 'repair' && exact(input, ['operation', 'taskId']) && typeof input.taskId === 'string') return new MonasteryStore(this.db, this.economy, this.now).repair(actor, input.taskId);
    if (['craft', 'deliver', 'gather', 'village_craft', 'alms', 'support', 'producer_upgrade', 'housing', 'worker'].includes(String(input.operation)) && exact(input, ['operation', 'id', 'requestId', 'siteId']) && typeof input.id === 'string' && typeof input.requestId === 'string' && (input.siteId === undefined || typeof input.siteId === 'string' && villageTheme(input.siteId))) return new MonasteryStore(this.db, this.economy, this.now).activity(actor, input.operation as MonasteryOperation, input.id, input.requestId, input.siteId as VillageId | undefined);
    if (input.operation === 'start') {
      if (!exact(input, ['operation', 'game', 'level']) || !['faith-3', '3-gems'].includes(String(input.game))) throw new RummyError('Choose a supported puzzle game.');
      const game = input.game as PuzzleGame, progress = await this.economy.puzzleProgress(actor, game), level = input.level ?? progress.unlocked;
      const max = game === 'faith-3' ? TOTAL_LEVELS : GEMS_LEVEL_COUNT;
      if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > max || level > progress.unlocked) throw new RummyError('Clear earlier levels to unlock this reward challenge.', 409, 'level_locked');
      const monastery = game === '3-gems' ? await new MonasteryStore(this.db, this.economy, this.now).read(actor) : undefined;
      const now = this.now(), id = crypto.randomUUID(), expiresAt = now + 2 * 60 * 60 * 1000;
      const random = new Uint32Array(1); crypto.getRandomValues(random); const attempt = random[0]! & 0x7fffffff;
      await this.db.batch([
        this.db.prepare("DELETE FROM puzzle_runs WHERE user_id=? AND expires_at<?").bind(user, now),
        this.db.prepare("INSERT INTO puzzle_runs(id,user_id,game,level,attempt,expires_at,status,created_at,rules_version) VALUES(?,?,?,?,?,?,'open',?,?)").bind(id, user, game, level, attempt, expiresAt, now, GEMS_RULES),
      ]);
      return { runId: id, game, level, attempt, expiresAt, rulesVersion: GEMS_RULES, boosters: { ...PUZZLE_RUN_BOOSTERS }, progress, ...(monastery ? { monastery } : {}) };
    }
    if (input.operation !== 'complete' || !exact(input, ['operation', 'runId', 'actions']) || typeof input.runId !== 'string' || !UUID.test(input.runId)) throw new RummyError('Send a valid puzzle completion.');
    const run = await this.db.prepare('SELECT * FROM puzzle_runs WHERE id=? AND user_id=?').bind(input.runId, user).first<StoredRun>();
    if (!run) throw new RummyError('This reward run is no longer available. Restart the level to earn points.', 404, 'run_not_found');
    if (run.expires_at <= this.now()) throw new RummyError('This reward run expired. Restart the level to earn points.', 409, 'run_expired');
    if (!Array.isArray(input.actions) || JSON.stringify(input.actions).length > 65536) throw new RummyError('The puzzle replay is too large.');
    const bytes = new TextEncoder().encode(JSON.stringify(input.actions)), digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
    if (run.status === 'complete' && run.proof !== digest) throw new RummyError('This run already has a different completion.', 409, 'completion_conflict');
    const proof = verifyPuzzleReplay(run.game, run.level, run.attempt, input.actions, run.rules_version ?? 1);
    if (!proof) throw new RummyError('The replay did not clear this board with legal moves and supplies.', 400, 'invalid_replay');
    await this.db.prepare("UPDATE puzzle_runs SET status='complete',proof=? WHERE id=? AND user_id=? AND (status='open' OR proof=?)").bind(digest, run.id, user, digest).run();
    const locked = await this.db.prepare('SELECT proof FROM puzzle_runs WHERE id=? AND user_id=?').bind(run.id, user).first<{ proof: string }>();
    if (locked?.proof !== digest) throw new RummyError('This run was replaced or completed elsewhere. Refresh your progress.', 409, 'completion_conflict');
    const monastery = run.game === '3-gems' ? new MonasteryStore(this.db, this.economy, this.now) : null;
    if (monastery) await monastery.read(actor);
    const credit = await this.economy.creditPuzzle(actor, run.game, run.level, { ...proof, completionId: run.id });
    return { verified: true, game: run.game, level: run.level, ...proof, ...credit, progress: await this.economy.puzzleProgress(actor, run.game), ...(monastery ? { monastery: await monastery.read(actor) } : {}) };
  }
}
