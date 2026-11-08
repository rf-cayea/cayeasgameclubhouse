import { generateLevel, isBlocked, levelConfig, rng, touches, TOTAL_LEVELS, TRAY_SIZE, type Tile } from "./game";

export type Action = { t: "pick"; id: number } | { t: "undo" } | { t: "shuffle" } | { t: "magic" };
interface Snapshot { board: Tile[]; tray: Tile[]; matches: number }
export interface PlayState {
  board: Tile[];
  tray: Tile[];
  trayCapacity: number;
  history: Snapshot[];
  matches: number;
  shuffleCount: number;
  magicUsed: number;
  undoUsed: number;
  helped: boolean;
  status: "play" | "won" | "lost";
}

export const MAX_UNDOS_PER_WIN = 12;
export const MAX_SHUFFLES_PER_WIN = 12;
export const MAX_MAGIC_PER_WIN = 3;

export function initPlay(level: number): PlayState {
  return {
    board: generateLevel(level), tray: [], trayCapacity: levelConfig(level).traySize, history: [], matches: 0,
    shuffleCount: 0, magicUsed: 0, undoUsed: 0, helped: false, status: "play",
  };
}

function settle(state: PlayState): PlayState {
  return {
    ...state,
    status: state.board.length === 0 && state.tray.length === 0 ? "won" : state.tray.length >= (state.trayCapacity ?? TRAY_SIZE) ? "lost" : "play",
  };
}

/** Apply collection effects together, so undo restores every lock and ice layer. */
function releaseObstacles(board: Tile[], collected: Tile[], matches: number) {
  return board.map(tile => {
    const frost = Math.max(0, (tile.frost ?? 0) - collected.filter(other => touches(tile, other)).length);
    const seal = tile.seal && matches < tile.seal ? tile.seal : 0;
    return frost === (tile.frost ?? 0) && seal === (tile.seal ?? 0) ? tile : { ...tile, frost, seal };
  });
}

export function applyAction(level: number, state: PlayState, action: Action): PlayState | null {
  // Replays can originate outside TypeScript. Unknown actions must never act as magic.
  if (!action || typeof action !== "object") return null;
  if (action.t === "undo") {
    const last = state.history.at(-1);
    if (!last) return null;
    return {
      ...state, ...last, history: state.history.slice(0, -1),
      undoUsed: state.undoUsed + 1, helped: true, status: "play",
    };
  }
  if (state.status !== "play") return null;

  if (action.t === "pick") {
    const tile = state.board.find((candidate) => candidate.id === action.id);
    if (!tile || isBlocked(tile, state.board)) return null;
    const history = [...state.history, { board: state.board, tray: state.tray, matches: state.matches }];
    if (tile.veiled) return {
      ...state, history, board: state.board.map(candidate => candidate.id === tile.id ? { ...candidate, veiled: false } : candidate),
    };
    const board = state.board.filter((candidate) => candidate.id !== tile.id);
    let tray = [...state.tray];
    const lastSame = tray.map((candidate) => candidate.type).lastIndexOf(tile.type);
    tray.splice(lastSame < 0 ? tray.length : lastSame + 1, 0, tile);
    let matches = state.matches;
    if (tray.filter((candidate) => candidate.type === tile.type).length >= 3) {
      tray = tray.filter((candidate) => candidate.type !== tile.type);
      matches++;
    }
    return settle({ ...state, board: releaseObstacles(board, [tile], matches), tray, history, matches });
  }

  if (action.t === "shuffle") {
    if (state.board.length === 0) return null;
    const random = rng(level * 7919 + (state.shuffleCount + 1) * 104729 + state.board.length);
    const types = state.board.map((tile) => tile.type);
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [types[i], types[j]] = [types[j]!, types[i]!];
    }
    return {
      ...state, board: state.board.map((tile, i) => ({ ...tile, type: types[i]!, frost: 0, seal: 0, veiled: false })),
      shuffleCount: state.shuffleCount + 1, helped: true,
    };
  }

  if (action.t === "magic") {
    const counts = new Map<number, number>();
    for (const tile of state.tray) counts.set(tile.type, (counts.get(tile.type) ?? 0) + 1);
    const top = [...counts].sort(([a, countA], [b, countB]) => countB - countA || a - b)[0];
    const type = top?.[0] ?? state.board[0]?.type;
    if (type === undefined) return null;
    const need = 3 - (counts.get(type) ?? 0);
    const candidates = state.board.filter((tile) => tile.type === type)
      .sort((a, b) => b.z - a.z || a.id - b.id).slice(0, need);
    // A magic action consumes one complete triple. Corrupt or incomplete state cannot win.
    if (need < 0 || candidates.length !== need) return null;
    const removeIds = new Set(candidates.map((tile) => tile.id));
    return settle({
      ...state, helped: true, magicUsed: state.magicUsed + 1, matches: state.matches + 1,
      board: releaseObstacles(state.board.filter((tile) => !removeIds.has(tile.id)), candidates, state.matches + 1),
      tray: state.tray.filter((tile) => tile.type !== type), history: [],
    });
  }
  return null;
}

/** Replay validation is local only; awarding account rewards requires trusted server verification. */
export function verifyWin(level: number, actions: Action[], opts: { infiniteShuffle?: boolean } = {}) {
  if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS || !Array.isArray(actions) || actions.length > 2000) return null;
  let state = initPlay(level);
  for (const action of actions) {
    const next = applyAction(level, state, action);
    if (!next) return null;
    state = next;
  }
  if (state.status !== "won" || state.undoUsed > MAX_UNDOS_PER_WIN ||
    state.shuffleCount > (opts?.infiniteShuffle === true ? 2000 : MAX_SHUFFLES_PER_WIN) || state.magicUsed > MAX_MAGIC_PER_WIN) return null;
  return { matches: state.matches, flawless: !state.helped, magicUsed: state.magicUsed };
}
