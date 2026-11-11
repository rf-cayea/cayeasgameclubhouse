import { describe, expect, it } from "vitest";
import { applyAction, initPlay, verifyWin, type Action, type PlayState } from "../src/lib/engine";
import { generateLevel, isBlocked, levelConfig, themeFor, THEMES, TOTAL_LEVELS, type Tile } from "../src/lib/game";

function pick(state: PlayState, id: number) {
  const next = applyAction(1, state, { t: "pick", id });
  if (!next) throw new Error(`Rejected test pick ${id}`);
  return next;
}

// Level one has no covering layers, so grouping by type is a complete legitimate solution.
function finishLevelOne(state = initPlay(1), prefix: Action[] = []) {
  const actions = [...prefix];
  for (const tile of [...state.board].sort((a, b) => a.type - b.type || a.id - b.id)) {
    const action: Action = { t: "pick", id: tile.id };
    const next = applyAction(1, state, action);
    if (!next) throw new Error("Level one solution was rejected");
    state = next;
    actions.push(action);
  }
  expect(state.status).toBe("won");
  return actions;
}

describe("Faith 3 level generation", () => {
  it("generates all 280 levels deterministically with complete triples and distinct positions", () => {
    expect(THEMES).toHaveLength(10);
    for (let level = 1; level <= TOTAL_LEVELS; level++) {
      const board = generateLevel(level);
      expect(board, `deterministic level ${level}`).toEqual(generateLevel(level));
      expect(board.length).toBeGreaterThan(0);
      expect(board.length % 3).toBe(0);
      expect(new Set(board.map(tile => tile.id)).size).toBe(board.length);
      expect(new Set(board.map(tile => `${tile.x},${tile.y},${tile.z}`)).size).toBe(board.length);
      const counts = new Map<number, number>();
      for (const tile of board) {
        expect(tile.type).toBeGreaterThanOrEqual(0);
        expect(tile.type).toBeLessThan(levelConfig(level).types);
        counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
      }
      expect([...counts.values()].every(count => count % 3 === 0)).toBe(true);
    }
  });

  it("uses 20-level themes in the original worlds and eight-level themes in the bonus worlds", () => {
    expect([1, 20, 21, 200, 201, 208, 209, 280].map(themeFor)).toEqual([0, 0, 1, 9, 0, 0, 1, 9]);
  });

  it("blocks overlapping lower tiles and frees them after the cover is removed", () => {
    const lower: Tile = { id: 1, type: 0, x: 0, y: 0, z: 0 };
    const cover: Tile = { id: 2, type: 0, x: 1, y: 1, z: 1 };
    const distant: Tile = { id: 3, type: 0, x: 2, y: 2, z: 1 };
    expect(isBlocked(lower, [lower, cover])).toBe(true);
    expect(isBlocked(lower, [lower, distant])).toBe(false);
    expect(isBlocked(cover, [lower, cover])).toBe(false);
    const state = { ...initPlay(1), board: [lower, cover] };
    expect(applyAction(1, state, { t: "pick", id: lower.id })).toBeNull();
    expect(pick(pick(state, cover.id), lower.id).board).toEqual([]);
  });
});

describe("Faith 3 play and replay", () => {
  it("clears triples, supports a complete unassisted win, and does not mutate initial state", () => {
    const start = initPlay(1);
    const initial = structuredClone(start);
    const actions = finishLevelOne(start);
    expect(verifyWin(1, actions)).toEqual({ matches: start.board.length / 3, flawless: true, magicUsed: 0 });
    expect(start).toEqual(initial);
  });

  it("undoes a triple's match count along with its board and tray, without undoing assistance usage", () => {
    let state = initPlay(1);
    const type = state.board[0]!.type;
    const group = state.board.filter(tile => tile.type === type).slice(0, 3);
    state = pick(pick(state, group[0]!.id), group[1]!.id);
    const beforeTriple = state;
    state = pick(state, group[2]!.id);
    expect(state.matches).toBe(1);
    expect(state.tray).toEqual([]);
    const undone = applyAction(1, state, { t: "undo" })!;
    expect(undone.matches).toBe(0);
    expect(undone.board).toEqual(beforeTriple.board);
    expect(undone.tray).toEqual(beforeTriple.tray);
    expect(undone.undoUsed).toBe(1);
    expect(undone.helped).toBe(true);
    expect(pick(undone, group[2]!.id).matches).toBe(1);
  });

  it("loses when the tray fills and allows undo to recover", () => {
    const tiles = Array.from({ length: 8 }, (_, id) => ({ id, type: id, x: id * 2, y: 0, z: 0 }));
    let state = { ...initPlay(1), board: tiles };
    for (let id = 0; id < 7; id++) state = pick(state, id);
    expect(state.status).toBe("lost");
    expect(applyAction(1, state, { t: "pick", id: 7 })).toBeNull();
    const undone = applyAction(1, state, { t: "undo" })!;
    expect(undone.status).toBe("play");
    expect(undone.tray).toHaveLength(6);
  });

  it("shuffles deterministically without moving tiles or changing their type counts", () => {
    const start = initPlay(24);
    const after = applyAction(24, start, { t: "shuffle" })!;
    expect(after).toEqual(applyAction(24, start, { t: "shuffle" }));
    expect(after.board.map(({ id, x, y, z }) => ({ id, x, y, z }))).toEqual(start.board.map(({ id, x, y, z }) => ({ id, x, y, z })));
    expect(after.board.map(tile => tile.type).sort()).toEqual(start.board.map(tile => tile.type).sort());
    expect(after.shuffleCount).toBe(1);
    expect(after.helped).toBe(true);
  });

  it("uses magic to finish the most represented tray triple and clears undo history", () => {
    let state = initPlay(1);
    const type = state.board[0]!.type;
    const group = state.board.filter(tile => tile.type === type).slice(0, 2);
    state = pick(pick(state, group[0]!.id), group[1]!.id);
    const after = applyAction(1, state, { t: "magic" })!;
    expect(after.board.length).toBe(state.board.length - 1);
    expect(after.tray).toEqual([]);
    expect(after.matches).toBe(1);
    expect(after.magicUsed).toBe(1);
    expect(after.history).toEqual([]);
    expect(after.helped).toBe(true);
  });

  it("rejects incomplete magic and unknown runtime actions instead of fabricating a win", () => {
    const start = initPlay(1);
    expect(applyAction(1, { ...start, board: [start.board[0]!] }, { t: "magic" })).toBeNull();
    expect(applyAction(1, start, { t: "invented" } as unknown as Action)).toBeNull();
    expect(applyAction(1, start, null as unknown as Action)).toBeNull();
    expect(verifyWin(1, [{ t: "invented" } as unknown as Action])).toBeNull();
    expect(verifyWin(1, [{ t: "pick", id: -1 }])).toBeNull();
    expect(verifyWin(1, [])).toBeNull();
    for (const level of [0, 281, 1.5, NaN]) expect(verifyWin(level, [])).toBeNull();
    expect(verifyWin(1, Array.from({ length: 2001 }, () => ({ t: "shuffle" } as Action)), { infiniteShuffle: true })).toBeNull();
  });

  it("enforces replay assistance limits and only lifts the shuffle limit for the explicit option", () => {
    let state = initPlay(1);
    const shuffles: Action[] = [];
    for (let i = 0; i < 13; i++) {
      state = applyAction(1, state, { t: "shuffle" })!;
      shuffles.push({ t: "shuffle" });
    }
    const shuffledWin = finishLevelOne(state, shuffles);
    expect(verifyWin(1, shuffledWin)).toBeNull();
    expect(verifyWin(1, shuffledWin, { infiniteShuffle: true })).toEqual({ matches: 6, flawless: false, magicUsed: 0 });

    state = initPlay(1);
    const undos: Action[] = [];
    for (let i = 0; i < 13; i++) {
      const id = state.board[0]!.id;
      state = applyAction(1, pick(state, id), { t: "undo" })!;
      undos.push({ t: "pick", id }, { t: "undo" });
    }
    expect(verifyWin(1, finishLevelOne(state, undos))).toBeNull();

    state = initPlay(1);
    const magic: Action[] = [];
    for (let i = 0; i < 4; i++) {
      state = applyAction(1, state, { t: "magic" })!;
      magic.push({ t: "magic" });
    }
    expect(verifyWin(1, finishLevelOne(state, magic))).toBeNull();
  });
});
