import { describe, expect, it } from 'vitest';
import { applyAction, initPlay, verifyWin, type Action } from '../src/lib/engine';
import { generateLevelPlan, isBlocked, isCovered, levelConfig, TOTAL_LEVELS, type Tile } from '../src/lib/game';

const tile = (id: number, type = 0, extra: Partial<Tile> = {}): Tile => ({ id, type, x: id * 2, y: 0, z: 0, ...extra });

describe('Faith 3 progressive obstacles', () => {
  it('uses larger, genuinely overlapping boards from level two without later shrinking the rounds', () => {
    const introduction = generateLevelPlan(1).board;
    expect(new Set(introduction.map(value => value.z)).size).toBe(1);
    let previousCount = introduction.length;
    for (let level = 2; level <= TOTAL_LEVELS; level++) {
      const board = generateLevelPlan(level).board;
      expect(board.length, `round length at level ${level}`).toBeGreaterThanOrEqual(previousCount);
      expect(board.length).toBeGreaterThan(introduction.length);
      expect(board.length).toBe(levelConfig(level).triples * 3);
      expect(new Set(board.map(value => value.z)).size).toBeGreaterThanOrEqual(2);
      const covered = board.filter(value => isCovered(value, board));
      expect(covered.length, `covering at level ${level}`).toBeGreaterThanOrEqual(Math.floor(board.length / 3));
      expect(applyAction(level, initPlay(level), { t: 'pick', id: covered[0]!.id })).toBeNull();
      previousCount = board.length;
    }
  });

  it('keeps an unassisted winning path for every level, including all combined obstacles', () => {
    for (let level = 1; level <= TOTAL_LEVELS; level++) {
      const plan = generateLevelPlan(level), actions: Action[] = [];
      let state = initPlay(level);
      expect(plan.board).toEqual(state.board);
      for (const id of plan.solution) {
        const current = state.board.find(value => value.id === id)!;
        expect(isBlocked(current, state.board), `blocked planned move ${id} at level ${level}`).toBe(false);
        if (current.veiled) {
          const reveal: Action = { t: 'pick', id }; actions.push(reveal);
          state = applyAction(level, state, reveal)!;
        }
        const action: Action = { t: 'pick', id }; actions.push(action);
        const next = applyAction(level, state, action);
        expect(next, `rejected planned move ${id} at level ${level}`).not.toBeNull();
        state = next!;
        expect(state.tray.length).toBeLessThan(state.trayCapacity);
      }
      expect(state.status, `unwinnable level ${level}`).toBe('won');
      expect(verifyWin(level, actions)).toEqual({ matches: plan.board.length / 3, flawless: true, magicUsed: 0 });
    }
  }, 30000);

  it('introduces obstacles gradually and increases stack, ice, tile and tray pressure', () => {
    expect(levelConfig(1)).toMatchObject({ layers: 1, frostRatio: 0, sealRatio: 0, veilRatio: 0, traySize: 7 });
    expect(levelConfig(11).frostRatio).toBeGreaterThan(0);
    expect(levelConfig(31).sealRatio).toBeGreaterThan(0);
    expect(levelConfig(61).veilRatio).toBeGreaterThan(0);
    expect(levelConfig(101)).toMatchObject({ traySize: 6, frostLayers: 2 });
    expect(levelConfig(280)).toMatchObject({ layers: 7, traySize: 5, frostLayers: 3, difficulty: 'Grandmaster' });
    for (let level = 2; level <= TOTAL_LEVELS; level++) {
      const previous = levelConfig(level - 1), current = levelConfig(level);
      for (const key of ['types', 'layers', 'triples', 'frostRatio', 'sealRatio', 'veilRatio', 'frostLayers'] as const) expect(current[key], `${key} at level ${level}`).toBeGreaterThanOrEqual(previous[key]);
      expect(current.traySize).toBeLessThanOrEqual(previous.traySize);
    }
    const hardest = generateLevelPlan(280).board;
    expect(hardest.some(value => value.frost === 3)).toBe(true);
    expect(hardest.some(value => value.seal)).toBe(true);
    expect(hardest.some(value => value.veiled)).toBe(true);
    expect(new Set(hardest.map(value => value.z)).size).toBe(7);
  });

  it('melts one frost layer per neighboring collection and undo restores the ice', () => {
    const frozen = tile(0, 2, { frost: 2 });
    const start = { ...initPlay(1), board: [frozen, tile(1, 0), tile(2, 1, { x: 0, y: 2 })] };
    expect(applyAction(1, start, { t: 'pick', id: 0 })).toBeNull();
    const once = applyAction(1, start, { t: 'pick', id: 1 })!;
    expect(once.board.find(value => value.id === 0)?.frost).toBe(1);
    const twice = applyAction(1, once, { t: 'pick', id: 2 })!;
    expect(twice.board[0]?.frost).toBe(0);
    expect(applyAction(1, twice, { t: 'pick', id: 0 })?.tray).toHaveLength(3);
    const undo = applyAction(1, twice, { t: 'undo' })!;
    expect(undo.board).toEqual(once.board);
    expect(start.board[0]?.frost).toBe(2);
  });

  it('opens seals on complete triples, not individual picks, and undo relocks them', () => {
    let state = { ...initPlay(1), board: [tile(0), tile(1), tile(2), tile(3, 1, { seal: 1 })] };
    expect(applyAction(1, state, { t: 'pick', id: 3 })).toBeNull();
    state = applyAction(1, state, { t: 'pick', id: 0 })!;
    state = applyAction(1, state, { t: 'pick', id: 1 })!;
    expect(state.board.find(value => value.id === 3)?.seal).toBe(1);
    state = applyAction(1, state, { t: 'pick', id: 2 })!;
    expect(state.board[0]?.seal).toBe(0);
    expect(state.matches).toBe(1);
    const undo = applyAction(1, state, { t: 'undo' })!;
    expect(undo.board.find(value => value.id === 3)?.seal).toBe(1);
    expect(undo.matches).toBe(0);
  });

  it('reveals a veiled face before collecting it, without melting neighboring ice on reveal', () => {
    const start = { ...initPlay(1), board: [tile(0, 0, { veiled: true }), tile(1, 1, { frost: 1 })] };
    const reveal = applyAction(1, start, { t: 'pick', id: 0 })!;
    expect(reveal.board).toHaveLength(2); expect(reveal.tray).toHaveLength(0);
    expect(reveal.board[0]?.veiled).toBe(false); expect(reveal.board[1]?.frost).toBe(1);
    const collect = applyAction(1, reveal, { t: 'pick', id: 0 })!;
    expect(collect.tray).toHaveLength(1); expect(collect.board[0]?.frost).toBe(0);
    expect(applyAction(1, reveal, { t: 'undo' })?.board).toEqual(start.board);
  });

  it('uses the reduced tray limit and supports undo after a full-tray loss', () => {
    let state = { ...initPlay(280), board: Array.from({ length: 7 }, (_, id) => tile(id, id)) };
    for (let id = 0; id < 5; id++) state = applyAction(280, state, { t: 'pick', id })!;
    expect(state.status).toBe('lost'); expect(state.tray).toHaveLength(5);
    const undo = applyAction(280, state, { t: 'undo' })!;
    expect(undo.status).toBe('play'); expect(undo.tray).toHaveLength(4);
  });

  it('lets assists release obstacles while preserving every remaining motif count', () => {
    const start = initPlay(280), before = structuredClone(start);
    const shuffled = applyAction(280, start, { t: 'shuffle' })!;
    expect(shuffled.board.every(value => !value.frost && !value.seal && !value.veiled)).toBe(true);
    expect(shuffled.board.map(value => value.type).sort()).toEqual(start.board.map(value => value.type).sort());
    expect(shuffled.board.map(({ id, x, y, z }) => ({ id, x, y, z }))).toEqual(start.board.map(({ id, x, y, z }) => ({ id, x, y, z })));
    const magic = applyAction(280, start, { t: 'magic' })!;
    expect(magic.board.length).toBe(start.board.length - 3); expect(magic.matches).toBe(1);
    expect(start).toEqual(before);
  });
});
