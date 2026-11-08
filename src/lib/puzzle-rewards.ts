import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { notifyWallet } from './clubhouse';
import type { PuzzleAction, PuzzleGame, PuzzleReceipt, PuzzleRun } from './puzzle-rewards-protocol';
import { mergeMonastery, type MonasteryProgress, type MonasteryReceipt, type MonasteryActivityReceipt } from './monastery';
import type { MonasteryOperation, VillageId } from './monastery-village';

async function puzzleRequest<T>(userId: string, body: unknown): Promise<T> {
  if (!supabase) throw new Error('Sign in to earn saved puzzle points.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) throw new Error('Your account changed. Start a new reward run.');
  const result = await fetch('/api/puzzles', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const value = await result.json();
  if (!result.ok) throw new Error(value.error || 'Puzzle rewards could not sync. Try again.');
  return value as T;
}

/** Keep proofs and late reward responses bound to the current member and board. */
export function usePuzzleRewards(userId: string | null, game: PuzzleGame) {
  const [run, setRun] = useState<PuzzleRun | null>(null), [receipt, setReceipt] = useState<PuzzleReceipt | null>(null);
  const [starting, setStarting] = useState(false), [submitting, setSubmitting] = useState(false), [error, setError] = useState('');
  const [monastery, setMonastery] = useState<MonasteryProgress | null>(null), [repairing, setRepairing] = useState(false), [monasteryError, setMonasteryError] = useState('');
  const repairPending = useRef(false);
  const actor = useRef(userId), mounted = useRef(false), epoch = useRef(0), active = useRef<PuzzleRun | null>(null), actions = useRef<PuzzleAction[]>([]), submitted = useRef(false), failedProof = useRef(false), runOwner = useRef<string | null>(null);
  actor.current = userId;
  const start = useCallback(async (level?: number) => {
    const version = ++epoch.current, owner = userId;
    active.current = null; runOwner.current = null; actions.current = []; submitted.current = false; failedProof.current = false;
    setRun(null); setReceipt(null); setError(''); setSubmitting(false);
    if (!owner) { setStarting(false); return null; }
    setStarting(true);
    try {
      const next = await puzzleRequest<PuzzleRun>(owner, { operation: 'start', game, ...(level === undefined ? {} : { level }) });
      if (!mounted.current || epoch.current !== version || actor.current !== owner) return null;
      active.current = next; runOwner.current = owner; setRun(next);
      if (next.monastery) setMonastery(previous => mergeMonastery(previous, next.monastery!));
      return next;
    } catch (cause) {
      if (mounted.current && epoch.current === version && actor.current === owner) setError(cause instanceof Error ? cause.message : 'Puzzle rewards are unavailable. Restart to try again.');
      return null;
    } finally { if (mounted.current && epoch.current === version && actor.current === owner) setStarting(false); }
  }, [game, userId]);
  useEffect(() => {
    setMonastery(null); setMonasteryError(''); setRepairing(false); repairPending.current = false;
    mounted.current = true; void start();
    return () => { mounted.current = false; ++epoch.current; active.current = null; actions.current = []; };
  }, [start]);
  function record(action: PuzzleAction) {
    if (active.current && runOwner.current === userId && !submitted.current && actor.current === userId) actions.current.push(action);
  }
  async function complete() {
    const current = active.current, owner = userId, version = epoch.current;
    if (!owner || !current || submitted.current) return null;
    submitted.current = true; failedProof.current = false; setSubmitting(true); setError('');
    try {
      const result = await puzzleRequest<PuzzleReceipt>(owner, { operation: 'complete', runId: current.runId, actions: actions.current });
      if (!mounted.current || actor.current !== owner || version !== epoch.current) return null;
      setReceipt(result); setRun(previous => previous?.runId === current.runId ? { ...previous, progress: result.progress } : previous);
      if (result.monastery) setMonastery(previous => mergeMonastery(previous, result.monastery!));
      notifyWallet(); return result;
    } catch (cause) {
      if (mounted.current && actor.current === owner && version === epoch.current) { failedProof.current = true; setError(cause instanceof Error ? cause.message : 'Your clear could not sync. Retry before starting another level.'); }
      return null;
    } finally { if (mounted.current && actor.current === owner && version === epoch.current) setSubmitting(false); }
  }
  function retry() { if (failedProof.current) { submitted.current = false; void complete(); } }
  async function refreshMonastery() {
    const owner = userId, version = epoch.current;
    if (!owner || game !== '3-gems' || repairPending.current) return;
    try {
      const result = await puzzleRequest<{ monastery: MonasteryProgress }>(owner, { operation: 'monastery' });
      if (mounted.current && actor.current === owner && version === epoch.current) { setMonastery(previous => mergeMonastery(previous, result.monastery)); setMonasteryError(''); }
    } catch (cause) { if (mounted.current && actor.current === owner && version === epoch.current) setMonasteryError(cause instanceof Error ? cause.message : 'Your monastery could not load. Please retry.'); }
  }
  async function repairMonastery(taskId: string) {
    const owner = userId, version = epoch.current;
    if (!owner || game !== '3-gems' || repairPending.current) return null;
    repairPending.current = true; setRepairing(true); setMonasteryError('');
    try {
      const result = await puzzleRequest<MonasteryReceipt>(owner, { operation: 'repair', taskId });
      if (!mounted.current || actor.current !== owner || version !== epoch.current) return null;
      setMonastery(previous => mergeMonastery(previous, result.monastery)); return result;
    } catch (cause) {
      if (mounted.current && actor.current === owner && version === epoch.current) setMonasteryError(cause instanceof Error ? cause.message : 'This repair could not save. Please retry.');
      return null;
    } finally { if (mounted.current && actor.current === owner && version === epoch.current) { repairPending.current = false; setRepairing(false); } }
  }
  async function monasteryActivity(operation: MonasteryOperation, id: string, requestId: string, siteId?: VillageId) {
    const owner = userId, version = epoch.current;
    if (!owner || game !== '3-gems' || repairPending.current) return null;
    repairPending.current = true; setRepairing(true); setMonasteryError('');
    try {
      const result = await puzzleRequest<MonasteryActivityReceipt>(owner, { operation, id, requestId, ...(siteId ? { siteId } : {}) });
      if (!mounted.current || actor.current !== owner || version !== epoch.current) return null;
      setMonastery(previous => mergeMonastery(previous, result.monastery)); return result;
    } catch (cause) {
      if (mounted.current && actor.current === owner && version === epoch.current) setMonasteryError(cause instanceof Error ? cause.message : 'Your workshop could not save. Please retry.');
      return null;
    } finally { if (mounted.current && actor.current === owner && version === epoch.current) { repairPending.current = false; setRepairing(false); } }
  }
  return { run: userId && runOwner.current === userId ? run : null, receipt: userId && runOwner.current === userId ? receipt : null, starting, submitting, error, start, record, complete, retry,
    monastery, repairing, monasteryError, refreshMonastery, repairMonastery, monasteryActivity };
}
