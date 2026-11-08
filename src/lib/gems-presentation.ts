import type { GemCell, GemsAction, GemsFrame, GemsOutcome, GemsState } from './gems-engine';

export interface GemsPlaybackFrame extends GemsFrame {
  phase: 'swap' | 'clear' | 'fall' | 'shuffle' | 'feedback';
  durationMs: number;
  stepId: string;
  reduced: boolean;
  from?: GemCell[];
  removed: number[];
  damaged: number[];
}
const copy = (board: GemCell[]) => board.map(cell => ({ ...cell, gem: cell.gem ? { ...cell.gem } : null }));

/** Readable impacts followed by a separate gravity phase. */
export function gemsFrameDuration(frame: GemsFrame) {
  if (frame.combo) return 1200;
  const effects = frame.effects ?? [];
  if (effects.some(effect => effect.kind === 'shuffle')) return 900;
  if (effects.some(effect => effect.kind === 'orb' || effect.kind === 'lantern')) return 1000;
  if (effects.some(effect => effect.kind.startsWith('hammer'))) return 1000;
  if (effects.some(effect => effect.kind === 'burst' || effect.kind === 'blessing')) return 950;
  if (effects.some(effect => effect.kind === 'row' || effect.kind === 'column')) return 900;
  return effects.length ? 650 : frame.cells.length ? 220 : 260;
}

/** Presentation never mutates the saved state or the replay used for rewards. */
export function buildGemsPlayback(previous: GemsState, outcome: GemsOutcome, action: GemsAction | undefined, sequence: number, reduced: boolean): GemsPlaybackFrame[] {
  const steps: GemsPlaybackFrame[] = [];
  const add = (frame: GemsFrame, phase: GemsPlaybackFrame['phase'], from?: GemCell[]) => {
    const removed = phase === 'clear' ? frame.cells.filter(i => {
      const cell = frame.board[i]!, after = frame.after?.[i];
      return after ? Boolean(cell.gem && !after.gem || cell.crate && !after.crate) : Boolean(cell.gem);
    }) : [];
    steps.push({ ...frame, phase, from, removed, damaged: phase === 'clear' ? frame.cells.filter(i => !removed.includes(i)) : [],
      stepId: `${sequence}:${steps.length}`, durationMs: phase === 'swap' ? 160 : phase === 'shuffle' ? 360 : gemsFrameDuration(frame), reduced });
  };
  if (reduced) {
    const effects = outcome.frames.flatMap(frame => frame.effects ?? []);
    // Keep the meaning of a special visible without moving, shrinking or blinking gems.
    if (effects.length) {
      const kinds = new Set<string>();
      add({ board: outcome.state.board, cells: [], label: outcome.message, combo: outcome.frames.find(frame => frame.combo)?.combo, effects: effects.filter(effect => {
        if (kinds.has(effect.kind)) return false; kinds.add(effect.kind); return true;
      }) }, 'feedback');
      steps[0]!.durationMs = 800;
    }
    return steps;
  }
  let before = previous.board, swapped: GemCell[] | undefined;
  if (action?.type === 'swap') {
    swapped = copy(previous.board);
    [swapped[action.a]!.gem, swapped[action.b]!.gem] = [swapped[action.b]!.gem, swapped[action.a]!.gem];
    add({ board: swapped, cells: [], label: 'A mindful swap' }, 'swap', before);
    before = swapped;
  }
  let afterClear: GemCell[] | undefined, shuffling = false;
  for (const [n, frame] of outcome.frames.entries()) {
    if (frame.cells.length || frame.effects?.length) {
      // Combined specials are consumed by the engine; retain their artwork until impact.
      const board = n === 0 && swapped ? frame.board.map((cell, i) => cell.gem && cell.gem.id === swapped![i]!.gem?.id && !cell.gem.special && swapped![i]!.gem?.special
        ? { ...cell, gem: { ...cell.gem, special: swapped![i]!.gem!.special } } : cell) : frame.board;
      add({ ...frame, board }, 'clear', before);
      shuffling = Boolean(frame.effects?.some(effect => effect.kind === 'shuffle'));
      afterClear = frame.after;
      before = board;
    } else {
      add(frame, shuffling ? 'shuffle' : 'fall', afterClear ?? before);
      before = frame.board; afterClear = undefined; shuffling = false;
    }
  }
  if (JSON.stringify(before) !== JSON.stringify(outcome.state.board)) add({ board: outcome.state.board, cells: [], label: outcome.message }, 'fall', before);
  const span = steps.reduce((total, step) => total + step.durationMs, 0), scale = Math.min(1, 4800 / Math.max(1, span));
  const firstImpact = steps.find(step => step.effects?.length);
  for (const step of steps) step.durationMs = Math.max(step.combo ? 1000 : step === firstImpact ? 800 : step.phase === 'swap' ? 120 : step.phase === 'fall' ? 150 : step.effects?.length ? 550 : 120, Math.round(step.durationMs * scale));
  return steps;
}

/** Gravity stops at crates and gems still held by chains. Clip arrivals to that segment. */
export function gemFallSegment(board: GemCell[], index: number) {
  let top = Math.floor(index / 8), bottom = top;
  const col = index % 8, blocked = (row: number) => Boolean(board[row * 8 + col]?.crate || board[row * 8 + col]?.chain);
  if (!blocked(top)) {
    while (top > 0 && !blocked(top - 1)) top--;
    while (bottom < 7 && !blocked(bottom + 1)) bottom++;
  }
  return { top, bottom };
}
