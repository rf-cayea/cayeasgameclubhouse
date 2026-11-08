import { describe, expect, it } from 'vitest';
import { applyGemsAction, startGems, type GemsAction, type GemsState } from '../src/lib/gems-engine';
import { buildGemsPlayback, gemFallSegment } from '../src/lib/gems-presentation';

function garden(): GemsState {
  const state = startGems(1);
  state.board = Array.from({ length: 64 }, (_, i) => ({ gem: { id: i + 1, color: (Math.floor(i / 8) * 2 + i % 8) % 6 }, crate: 0, frost: 0, chain: false }));
  state.nextId = 65;
  return state;
}

describe('Gems visual playback without changing gameplay', () => {
  it('keeps damaged neighboring crates visible until their last layer is destroyed', () => {
    const state = garden();
    state.board[17] = { gem: null, crate: 2, frost: 0, chain: false };
    state.board[24] = { gem: null, crate: 1, frost: 0, chain: false };
    const action: GemsAction = { type: 'booster', kind: 'row', target: 27 };
    const outcome = applyGemsAction(state, action)!;
    const frame = buildGemsPlayback(state, outcome, action, 1, false)[0]!;
    expect(frame.after![17]!.crate).toBe(1);
    expect(frame.damaged).toContain(17);
    expect(frame.removed).not.toContain(17);
    expect(frame.removed).toContain(24);
    expect(frame.after![24]!.crate).toBe(0);
  });

  it('preserves surviving gem identities through impacts and gravity, without mutating saved results', () => {
    const state = garden(), original = structuredClone(state);
    const action: GemsAction = { type: 'booster', kind: 'row', target: 27 };
    const outcome = applyGemsAction(state, action)!, durable = structuredClone(outcome);
    const steps = buildGemsPlayback(state, outcome, action, 5, false);
    const impact = steps[0]!, fall = steps[1]!;
    expect([impact.phase, fall.phase]).toEqual(['clear', 'fall']);
    expect(fall.from).toEqual(impact.after);
    for (const [i, cell] of impact.board.entries()) {
      if (cell.gem && !impact.removed.includes(i)) expect(fall.board.some(other => other.gem?.id === cell.gem!.id)).toBe(true);
    }
    expect(steps.at(-1)!.board).toEqual(outcome.state.board);
    expect(state).toEqual(original);
    expect(outcome).toEqual(durable);
    expect(JSON.stringify(outcome.state)).not.toMatch(/effects|after|stepId|phase/);
  });

  it('shows both swapped special gems before their combined impact', () => {
    const state = garden();
    state.board[27]!.gem!.special = 'row'; state.board[28]!.gem!.special = 'column';
    const action: GemsAction = { type: 'swap', a: 27, b: 28 };
    const outcome = applyGemsAction(state, action)!;
    const steps = buildGemsPlayback(state, outcome, action, 3, false);
    expect(steps[0]!.phase).toBe('swap');
    expect(steps[0]!.board[28]!.gem).toEqual(state.board[27]!.gem);
    expect(steps[1]!.board[28]!.gem!.special).toBe('row');
    expect(steps[1]!.board[27]!.gem!.special).toBe('column');
    expect(steps.at(-1)!.board).toEqual(outcome.state.board);
  });

  it('reshuffles whole gems without fading them away or clipping horizontal movement', () => {
    const state = garden(), action: GemsAction = { type: 'booster', kind: 'shuffle' };
    const outcome = applyGemsAction(state, action)!;
    const steps = buildGemsPlayback(state, outcome, action, 4, false);
    expect(steps.map(step => step.phase)).toEqual(['clear', 'shuffle']);
    expect(steps.every(step => step.removed.length === 0)).toBe(true);
    expect(steps[1]!.from).toEqual(state.board);
    expect(new Set(steps[1]!.board.map(cell => cell.gem!.id))).toEqual(new Set(state.board.map(cell => cell.gem!.id)));
  });

  it('keeps arrivals inside their gravity segment, respecting chained gems and crates', () => {
    const state = garden(); state.board[19]!.chain = true;
    state.board[43] = { gem: null, crate: 2, frost: 0, chain: false };
    expect(gemFallSegment(state.board, 3)).toEqual({ top: 0, bottom: 1 });
    expect(gemFallSegment(state.board, 27)).toEqual({ top: 3, bottom: 4 });
    expect(gemFallSegment(state.board, 59)).toEqual({ top: 6, bottom: 7 });
    expect(gemFallSegment(state.board, 19)).toEqual({ top: 2, bottom: 2 });
  });

  it('offers steady special feedback for reduced motion using the identical final board', () => {
    const state = garden(); state.board[27]!.gem!.special = 'orb';
    const action: GemsAction = { type: 'booster', kind: 'burst', target: 27 };
    const outcome = applyGemsAction(state, action)!;
    const steps = buildGemsPlayback(state, outcome, action, 9, true);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ phase: 'feedback', reduced: true, removed: [], damaged: [], board: outcome.state.board });
    expect(steps[0]!.durationMs).toBeGreaterThanOrEqual(800);
    expect(steps[0]!.effects!.some(effect => effect.kind === 'orb')).toBe(true);
    expect(steps[0]!.effects!.some(effect => effect.kind === 'blessing')).toBe(true);
  });

  it('finishes at the exact result even when the engine caps a long cascade, and restarts effects each turn', () => {
    const state = garden(), action: GemsAction = { type: 'booster', kind: 'row', target: 27 };
    const outcome = applyGemsAction(state, action)!;
    outcome.frames = outcome.frames.slice(0, 1);
    const steps = buildGemsPlayback(state, outcome, action, 12, false);
    expect(steps.at(-1)!.phase).toBe('fall');
    expect(steps.at(-1)!.board).toEqual(outcome.state.board);
    const next = buildGemsPlayback(state, outcome, action, 13, false);
    expect(next.every(step => !steps.some(prior => prior.stepId === step.stepId))).toBe(true);
  });
});
