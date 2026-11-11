import { describe, expect, it } from 'vitest';
import { applyGemsAction, findGemMatches, startGems, type GemSpecial } from '../src/lib/gems-engine';
import { GEM_COMBINATIONS, type GemComboKind } from '../src/lib/gems-combos';
import { newGemsJourney, playGemsJourney, readGemsJourney } from '../src/lib/gems-progress';
import { buildGemsPlayback } from '../src/lib/gems-presentation';

const pairings: [GemSpecial, GemSpecial, GemComboKind][] = [
  ['row', 'row', 'cross'], ['row', 'column', 'cross'], ['column', 'column', 'cross'],
  ['row', 'burst', 'lotus-lines'], ['column', 'burst', 'lotus-lines'], ['burst', 'burst', 'double-lotus'],
  ['orb', 'row', 'orb-lines'], ['orb', 'column', 'orb-lines'], ['orb', 'burst', 'orb-lotus'],
  ['orb', 'lantern', 'orb-lantern'], ['orb', 'orb', 'double-orb'], ['lantern', 'row', 'lantern-lines'],
  ['lantern', 'column', 'lantern-lines'], ['lantern', 'burst', 'lantern-lotus'], ['lantern', 'lantern', 'double-lantern'],
];
function garden(first: GemSpecial, second: GemSpecial) {
  const state = startGems(1);
  state.board = Array.from({ length: 64 }, (_, i) => ({ gem: { id: i + 1, color: (Math.floor(i / 8) * 2 + i % 8) % 6 }, crate: 0, frost: 0, chain: false }));
  state.nextId = 65;
  for (const [index, special, color] of [[27, first, 2], [28, second, 3]] as const) {
    state.board[index]!.gem = { id: index + 1, color: special === 'orb' ? -1 : color, special };
    state.board[index]!.frost = 3;
  }
  state.board[20] = { gem: null, crate: 3, frost: 0, chain: false };
  return state;
}

describe('all 15 special pairings combine abilities and increase obstacle power', () => {
  it.each(pairings)('%s + %s creates %s in either swap direction, hits two layers, and spends one move', (first, second, kind) => {
    for (const [one, two] of [[first, second], [second, first]] as const) {
      const state = garden(one, two), original = structuredClone(state), action = { type: 'swap', a: 27, b: 28 } as const;
      const outcome = applyGemsAction(state, action)!, impact = outcome.frames[0]!;
      expect(impact.combo?.kind).toBe(kind);
      expect(impact.label).toContain(GEM_COMBINATIONS[kind].title);
      expect(impact.after![27]!.frost).toBe(1);
      expect(impact.after![28]!.frost).toBe(1);
      expect(impact.after![20]!.crate).toBe(1);
      expect(outcome.state.movesLeft).toBe(state.movesLeft - 1);
      expect(outcome.state.turns).toBe(1);
      expect(outcome.state.board.every(cell => cell.crate >= 0 && cell.frost >= 0 && (cell.crate || cell.gem))).toBe(true);
      expect(findGemMatches(outcome.state.board)).toEqual([]);
      expect(applyGemsAction(state, action)).toEqual(outcome);
      expect(state).toEqual(original);
      const playback = buildGemsPlayback(state, outcome, action, 3, false);
      expect(playback[1]!.combo?.kind).toBe(kind);
      expect(playback[1]!.durationMs).toBeGreaterThanOrEqual(700);
    }
  });

  it('leaves an orb swapped with a normal gem at ordinary one-layer power', () => {
    const state = garden('orb', 'row'); delete state.board[28]!.gem!.special;
    const outcome = applyGemsAction(state, { type: 'swap', a: 27, b: 28 })!;
    expect(outcome.frames[0]!.combo).toBeUndefined();
    expect(outcome.frames[0]!.after![27]!.frost).toBe(2);
    expect(outcome.frames[0]!.after![20]!.crate).toBe(2);
  });

  it('consumes one move without spending boosters or persisting visual combination metadata', () => {
    const journey = newGemsJourney(); journey.play = garden('row', 'burst');
    const result = playGemsJourney(journey, { type: 'swap', a: 27, b: 28 })!;
    expect(result.journey.inventory).toEqual(journey.inventory);
    expect(result.journey.play.movesLeft).toBe(journey.play.movesLeft - 1);
    expect(readGemsJourney(JSON.stringify(result.journey))).toEqual(result.journey);
    expect(JSON.stringify(result.journey)).not.toMatch(/combo|effects|stepId/);
  });
});
