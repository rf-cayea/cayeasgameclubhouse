import { describe, expect, it } from 'vitest';
import { applyGemsAction, findGemMatches, gemsGoalsMet, legalGemSwaps, startGems, type GemSpecial, type GemsState } from '../src/lib/gems-engine';
import { GEMS_LEVEL_COUNT, gemsClearReward, gemsLevel, monasteryRestoration } from '../src/lib/gems-levels';
import { enterGemsLevel, newGemsJourney, playGemsJourney, readGemsJourney } from '../src/lib/gems-progress';

function garden(): GemsState {
  const state = startGems(1);
  state.board = Array.from({ length: 64 }, (_, i) => ({ gem: { id: i + 1, color: (Math.floor(i / 8) * 2 + i % 8) % 6 }, crate: 0, frost: 0, chain: false }));
  state.nextId = 65;
  return state;
}
const paint = (state: GemsState, cells: number[], color = 1) => { cells.forEach(i => { state.board[i]!.gem!.color = color; }); return state; };
const ids = (state: GemsState) => state.board.flatMap(cell => cell.gem ? [cell.gem.id] : []);
function almostWon(level = 1) {
  const state = garden(); state.level = level;
  state.collected = Array(6).fill(1000) as number[];
  // A single seal still prevents completion; a row hammer finishes it.
  state.board[0]!.frost = 1;
  return state;
}

describe('200 complete match-three levels', () => {
  it('opens every level without matches, with real goals, the exact obstacle layers, and a legal swap', () => {
    for (let level = 1; level <= GEMS_LEVEL_COUNT; level++) {
      const state = startGems(level), config = gemsLevel(level);
      expect(findGemMatches(state.board), `opening matches at ${level}`).toEqual([]);
      expect(legalGemSwaps(state).length, `dead opening at ${level}`).toBeGreaterThan(0);
      expect(state.board.filter(c => c.crate).length).toBe(config.crates);
      expect(state.board.reduce((n, c) => n + c.frost, 0)).toBe(config.frost * config.frostLayers);
      expect(state.board.filter(c => c.chain).length).toBe(config.chains);
      expect(gemsGoalsMet(state)).toBe(false);
      expect(config.collect.every(goal => goal.count > 0 && goal.color < config.colors)).toBe(true);
      expect(new Set(ids(state)).size).toBe(ids(state).length);
    }
    expect(gemsLevel(150).crateLayers).toBeGreaterThan(gemsLevel(4).crateLayers);
    expect(gemsLevel(150).frostLayers).toBeGreaterThan(gemsLevel(7).frostLayers);
  });
  it('replays actions deterministically and never mutates the input', () => {
    const first = startGems(62), before = structuredClone(first), [a, b] = legalGemSwaps(first)[0]!;
    const one = applyGemsAction(first, { type: 'swap', a, b });
    expect(one).toEqual(applyGemsAction(startGems(62), { type: 'swap', a, b }));
    expect(first).toEqual(before);
    expect(one!.state.movesLeft).toBe(first.movesLeft - 1);
    expect(one!.state.score).toBeGreaterThan(0);
    expect(findGemMatches(one!.state.board)).toEqual([]);
  });
  it('does not charge invalid, diagonal, chained, wrapped, or out-of-board swaps', () => {
    const state = garden(); state.board[0]!.chain = true;
    for (const [a, b] of [[0, 1], [7, 8], [1, 10], [-1, 0], [1, 64], [1, 1], [1, 2]]) expect(applyGemsAction(state, { type: 'swap', a: a!, b: b! })).toBeNull();
    expect(applyGemsAction(state, { type: 'booster', kind: 'row', target: 64 })).toBeNull();
    expect(applyGemsAction(state, { type: 'nonsense' } as never)).toBeNull();
  });
});

describe('match shapes and all special combinations', () => {
  it.each<[number[], GemSpecial]>([
    [[0, 1, 2, 3], 'row'], [[0, 8, 16, 24], 'column'], [[0, 1, 2, 3, 4], 'orb'],
    [[9, 10, 11, 2, 18], 'burst'], [[9, 10, 11, 19, 27], 'burst'], [[9, 10, 17, 18], 'lantern'],
  ])('recognizes %j as a %s', (cells, special) => {
    const state = paint(garden(), cells, special === 'lantern' ? 3 : 1);
    expect(findGemMatches(state.board).find(match => cells.every(i => match.cells.includes(i)))?.special).toBe(special);
  });
  it('creates a special at the swapped gem without immediately destroying it', () => {
    const state = paint(garden(), [0, 1, 3, 10]); state.board[2]!.gem!.color = 2;
    const outcome = applyGemsAction(state, { type: 'swap', a: 2, b: 10 })!;
    expect(outcome.frames[0]!.board[2]!.gem?.special).toBe('row');
    expect(outcome.frames[0]!.cells).not.toContain(2);
  });
  it('an orb plus a normal gem clears the chosen color exactly once', () => {
    const state = garden(); state.board[0]!.gem = { id: 1, color: -1, special: 'orb' };
    state.board[1]!.gem!.color = 4;
    const expected = state.board.flatMap((cell, i) => cell.gem?.color === 4 ? [i] : []);
    const outcome = applyGemsAction(state, { type: 'swap', a: 0, b: 1 })!;
    // The orb moves to index 1 and its partner moves to index 0.
    expect(new Set(outcome.frames[0]!.cells)).toEqual(new Set([...expected.filter(i => i !== 1), 0, 1]));
  });
  it('combines two line gems into one cross, without an extra line', () => {
    const state = garden(); state.board[27]!.gem!.special = 'row'; state.board[35]!.gem!.special = 'row';
    const outcome = applyGemsAction(state, { type: 'swap', a: 27, b: 35 })!;
    const cross = [...Array.from({ length: 8 }, (_, col) => 32 + col), ...Array.from({ length: 8 }, (_, row) => row * 8 + 3)];
    expect(new Set(outcome.frames[0]!.cells)).toEqual(new Set(cross));
  });
  it.each<[GemSpecial, GemSpecial]>([
    ['row', 'column'], ['row', 'burst'], ['burst', 'burst'], ['orb', 'row'], ['orb', 'burst'], ['orb', 'lantern'],
    ['orb', 'orb'], ['lantern', 'row'], ['lantern', 'burst'], ['lantern', 'lantern'],
  ])('resolves %s + %s with no stuck cascades or duplicated gem identities', (a, b) => {
    const state = garden();
    state.board[27]!.gem = { id: 28, color: a === 'orb' ? -1 : 3, special: a };
    state.board[28]!.gem = { id: 29, color: b === 'orb' ? -1 : 2, special: b };
    const result = applyGemsAction(state, { type: 'swap', a: 27, b: 28 })!;
    expect(result.state.movesLeft).toBe(25);
    expect(result.state.score).toBeGreaterThan(0);
    expect(result.state.board.every(cell => cell.crate || cell.gem)).toBe(true);
    expect(findGemMatches(result.state.board)).toEqual([]);
    expect(new Set(ids(result.state)).size).toBe(ids(result.state).length);
    if (a === 'orb' && b === 'orb') expect(result.frames[0]!.cells.length).toBe(64);
  });
});

describe('blockers, layers, and consumable boosters', () => {
  it('releases a chained gem when a cascade turns it into a special', () => {
    const state = garden(); state.seed = 307; state.board[0]!.chain = true;
    // Clearing the next row drops fresh matching gems beside the fixed chain.
    const result = applyGemsAction(state, { type: 'booster', kind: 'row', target: 8 })!;
    const frame = result.frames.findIndex(step => step.board[0]!.gem?.id === 1 && step.board[0]!.gem?.special === 'row');
    expect(frame).toBeGreaterThanOrEqual(0);
    expect(result.frames[frame + 1]!.board[0]!.chain).toBe(false);
    expect(result.state.chainsCleared).toBe(1);
  });
  it('removes one floor/crate layer per wave and releases chains without using a move', () => {
    const state = garden();
    state.board[0]!.frost = 3; state.board[1]!.chain = true;
    state.board[3] = { gem: null, crate: 3, chain: false, frost: 0 };
    const result = applyGemsAction(state, { type: 'booster', kind: 'row', target: 0 })!;
    expect(result.frames[1]!.board[0]!.frost).toBe(2);
    expect(result.frames[1]!.board[3]!.crate).toBe(2);
    expect(result.frames[1]!.board[1]!.chain).toBe(false);
    expect(result.state.chainsCleared).toBe(1);
    expect(result.state.movesLeft).toBe(state.movesLeft);
  });
  it('a vertical hammer hits a whole column, and a blessing hits a 3 × 3 area', () => {
    const state = garden();
    expect(new Set(applyGemsAction(state, { type: 'booster', kind: 'column', target: 3 })!.frames[0]!.cells)).toEqual(new Set([3, 11, 19, 27, 35, 43, 51, 59]));
    expect(new Set(applyGemsAction(state, { type: 'booster', kind: 'burst', target: 27 })!.frames[0]!.cells)).toEqual(new Set([18, 19, 20, 26, 27, 28, 34, 35, 36]));
  });
  it('fresh breeze preserves special gems, obstacles, and moves without awarding a collection', () => {
    const state = startGems(125); const at = state.board.find(c => c.gem && !c.chain)!; at.gem!.special = 'burst';
    const result = applyGemsAction(state, { type: 'booster', kind: 'shuffle' })!.state;
    expect(ids(result).sort((a, b) => a - b)).toEqual(ids(state).sort((a, b) => a - b));
    expect(result.board.filter(c => c.gem?.special === 'burst').length).toBe(1);
    expect(result.board.map(c => [c.crate, c.frost, c.chain])).toEqual(state.board.map(c => [c.crate, c.frost, c.chain]));
    expect(result.collected).toEqual(state.collected); expect(result.movesLeft).toBe(state.movesLeft);
    expect(findGemMatches(result.board)).toEqual([]); expect(legalGemSwaps(result).length).toBeGreaterThan(0);
  });
  it('wins on the last move when every objective is done, otherwise loses with no further actions', () => {
    const state = startGems(1); state.movesLeft = 1;
    const goal = gemsLevel(1).collect[0]!;
    state.collected[goal.color] = goal.count - 1;
    const winning = legalGemSwaps(state).map(([a, b]) => applyGemsAction(state, { type: 'swap', a, b })!).find(outcome => outcome.state.status === 'won');
    expect(winning).toBeDefined(); expect(winning!.state.movesLeft).toBe(0);
    // A targeted booster is also legal before the last move and cannot spend it.
    const sealed = almostWon(); sealed.movesLeft = 1;
    expect(applyGemsAction(sealed, { type: 'booster', kind: 'row', target: 0 })!.state.status).toBe('won');
    const ordinary = startGems(3); ordinary.movesLeft = 1;
    const lost = legalGemSwaps(ordinary).map(([a, b]) => applyGemsAction(ordinary, { type: 'swap', a, b })!.state).find(state => state.status === 'lost');
    expect(lost).toBeDefined(); expect(applyGemsAction(lost!, { type: 'booster', kind: 'row', target: 0 })).toBeNull();
  });
});

describe('saved supplies and monastery restoration', () => {
  it('grants the starter kit once, consumes only valid boosters, and never replenishes on restart', () => {
    const journey = newGemsJourney();
    expect(journey.inventory).toEqual({ row: 2, column: 2, burst: 1, shuffle: 1 });
    expect(playGemsJourney(journey, { type: 'booster', kind: 'row', target: -1 })).toBeNull();
    const played = playGemsJourney(journey, { type: 'booster', kind: 'row', target: 0 })!.journey;
    expect(played.inventory.row).toBe(1);
    expect(enterGemsLevel(played, 1)!.inventory.row).toBe(1);
    expect(enterGemsLevel(played, 2)).toBeNull();
    const empty = { ...journey, inventory: { ...journey.inventory, row: 0 } };
    expect(playGemsJourney(empty, { type: 'booster', kind: 'row', target: 0 })).toBeNull();
  });
  it('awards first clears exactly once and saves the level, stars, remaining boosters, and active board together', () => {
    const journey = newGemsJourney(); journey.play = almostWon();
    const first = playGemsJourney(journey, { type: 'booster', kind: 'row', target: 0 })!.journey;
    expect(first.unlocked).toBe(2); expect(first.stars['1']).toBe(3); expect(first.reward?.items).toEqual(gemsClearReward(1));
    expect(first.inventory.row).toBe(2);
    expect(readGemsJourney(JSON.stringify(first))).toEqual(first);
    const again = enterGemsLevel(first, 1)!; again.play = almostWon();
    const replay = playGemsJourney(again, { type: 'booster', kind: 'row', target: 0 })!.journey;
    expect(replay.reward).toBeNull(); expect(replay.inventory.row).toBe(1); expect(replay.unlocked).toBe(2);
    expect(readGemsJourney(JSON.stringify(replay))).toEqual(replay);
  });
  it('provides two of each hammer every fifth level, plus ten-level and chapter gifts', () => {
    expect(gemsClearReward(5)).toEqual({ row: 2, column: 2, burst: 0, shuffle: 0 });
    expect(gemsClearReward(10)).toEqual({ row: 2, column: 2, burst: 1, shuffle: 1 });
    expect(gemsClearReward(15)).toEqual({ row: 2, column: 2, burst: 2, shuffle: 1 });
    expect(gemsClearReward(150)).toEqual({ row: 2, column: 2, burst: 3, shuffle: 2 });
  });
  it('preserves the legacy artwork milestones and advances beyond the old level cap', () => {
    for (let n = 0; n < 150; n++) { expect(monasteryRestoration(n).reopened).toBe(false); expect(monasteryRestoration(n).stage).toBe(Math.floor(n / 15)); }
    expect(monasteryRestoration(15)).toMatchObject({ stage: 1, inProject: 0, project: { name: 'Bodhi Garden' } });
    expect(monasteryRestoration(150)).toMatchObject({ stage: 10, inProject: 15, reopened: true });
    const journey = newGemsJourney(); journey.unlocked = 150; journey.play = almostWon(150);
    journey.stars = Object.fromEntries(Array.from({ length: 149 }, (_, i) => [String(i + 1), 1]));
    const complete = playGemsJourney(journey, { type: 'booster', kind: 'row', target: 0 })!.journey;
    expect(Object.keys(complete.stars).length).toBe(150); expect(complete.unlocked).toBe(151);
    expect(enterGemsLevel(complete, 151)?.play.level).toBe(151); expect(readGemsJourney(JSON.stringify(complete))).toEqual(complete);
  });
  it('recovers from malformed local saves and never loads a partial, impossible board', () => {
    for (const raw of ['{', 'null', '[]', '{}', JSON.stringify({ ...newGemsJourney(), inventory: { row: -2 } }), JSON.stringify({ ...newGemsJourney(), unlocked: 150 })]) expect(readGemsJourney(raw)).toEqual(newGemsJourney());
    const game = newGemsJourney(); game.play.board[0]!.gem = { id: 999, color: 40 };
    expect(readGemsJourney(JSON.stringify(game))).toEqual(newGemsJourney());
  });
});
