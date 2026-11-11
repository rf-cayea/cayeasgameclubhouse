import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyGemsAction, startGems, type GemsFrame, type GemSpecial } from '../src/lib/gems-engine';
import { newGemsJourney, playGemsJourney, readGemsJourney } from '../src/lib/gems-progress';
import { GemsEffects } from '../src/components/GemsEffects';

function garden() {
  const state = startGems(1);
  state.board = Array.from({ length: 64 }, (_, i) => ({ gem: { id: i + 1, color: (Math.floor(i / 8) * 2 + i % 8) % 6 }, crate: 0, frost: 0, chain: false }));
  state.nextId = 65;
  return state;
}

describe('special gem activation events', () => {
  it.each(['row', 'column', 'burst', 'orb', 'lantern'] as GemSpecial[])('records the actual origin and affected targets for %s', kind => {
    const state = garden(); state.board[27]!.gem!.special = kind;
    if (kind === 'orb') state.board[27]!.gem!.color = -1;
    state.board[0]!.frost = 1;
    const outcome = applyGemsAction(state, { type: 'booster', kind: 'burst', target: 27 })!;
    const first = outcome.frames[0]!, effect = first.effects!.find(effect => effect.kind === kind)!;
    expect(effect.origin).toBe(27);
    expect(effect.targets.every(target => first.cells.includes(target))).toBe(true);
    if (kind === 'row') expect(effect.targets).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
    if (kind === 'column') expect(effect.targets).toEqual([3, 11, 19, 27, 35, 43, 51, 59]);
    if (kind === 'burst') expect(effect.targets).toEqual([18, 19, 20, 26, 27, 28, 34, 35, 36]);
    if (kind === 'lantern') expect(effect.targets).toEqual([27, 0]);
    if (kind === 'orb') expect(new Set(effect.targets.filter(target => target !== 27).map(target => first.board[target]!.gem!.color)).size).toBe(1);
  });
  it('records chained specials once, and keeps newly created specials separate from activations', () => {
    const state = garden(); state.board[27]!.gem!.special = 'row'; state.board[29]!.gem!.special = 'column';
    const effects = applyGemsAction(state, { type: 'booster', kind: 'burst', target: 27 })!.frames[0]!.effects!;
    expect(effects.filter(effect => effect.kind === 'row' && effect.origin === 27)).toHaveLength(1);
    expect(effects.filter(effect => effect.kind === 'column' && effect.origin === 29)).toHaveLength(1);
    const creation = garden(); for (const i of [0, 1, 3, 10]) creation.board[i]!.gem!.color = 1;
    creation.board[2]!.gem!.color = 2;
    const frame = applyGemsAction(creation, { type: 'swap', a: 2, b: 10 })!.frames[0]!;
    expect(frame.effects).toContainEqual(expect.objectContaining({ kind: 'bloom', origin: 2, special: 'row' }));
    expect(frame.effects!.some(effect => effect.kind === 'row' && effect.origin === 2)).toBe(false);
    expect(frame.cells).not.toContain(2);
  });
  it('retains meaningful events when a combination consumes the original specials', () => {
    for (const kinds of [['row', 'column'], ['burst', 'burst'], ['orb', 'row'], ['orb', 'orb'], ['lantern', 'burst'], ['lantern', 'lantern']] as GemSpecial[][]) {
      const state = garden();
      kinds.forEach((kind, n) => { state.board[27 + n]!.gem!.special = kind; if (kind === 'orb') state.board[27 + n]!.gem!.color = -1; });
      const frame = applyGemsAction(state, { type: 'swap', a: 27, b: 28 })!.frames[0]!;
      expect(frame.effects!.length).toBeGreaterThan(0);
      expect(frame.effects!.some(effect => effect.kind === kinds[0])).toBe(true);
      for (const effect of frame.effects!) expect(effect.targets.every(target => frame.cells.includes(target))).toBe(true);
    }
  });
  it('distinguishes hammers, blessing and breeze without persisting transient effects or spending extra supplies', () => {
    for (const [kind, visual] of [['row', 'hammer-row'], ['column', 'hammer-column'], ['burst', 'blessing'], ['shuffle', 'shuffle']] as const) {
      const journey = newGemsJourney(); journey.play = garden();
      const before = structuredClone(journey);
      const result = playGemsJourney(journey, { type: 'booster', kind, target: 27 })!;
      expect(result.outcome.frames[0]!.effects).toContainEqual(expect.objectContaining({ kind: visual, origin: 27 }));
      expect(result.journey.inventory[kind]).toBe(before.inventory[kind] - 1);
      expect(result.journey.play.movesLeft).toBe(before.play.movesLeft);
      expect(readGemsJourney(JSON.stringify(result.journey))).toEqual(result.journey);
      expect(JSON.stringify(result.journey)).not.toContain('effects');
      expect(journey).toEqual(before);
    }
  });
  it('bounds visual work for a board-wide special chain and cannot intercept input', () => {
    const state = garden();
    const frame: GemsFrame = { board: state.board, cells: Array.from({ length: 64 }, (_, i) => i), label: 'Special chain',
      effects: Array.from({ length: 64 }, (_, origin) => ({ kind: 'orb', origin, targets: Array.from({ length: 64 }, (_, i) => i) })) };
    const markup = renderToStaticMarkup(createElement(GemsEffects, { frame }));
    expect(markup.match(/data-effect-kind=/g)).toHaveLength(16);
    expect((markup.match(/data-effect-target=/g) ?? []).length).toBeLessThanOrEqual(64);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
    expect(markup).not.toMatch(/<button|tabindex=/);
  });
});
