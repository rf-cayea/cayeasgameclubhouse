import { gemsLevel, gemsBarrierCells, GEMS_RULES, GEMS_SIZE, type GemsRules, type Booster } from './gems-levels';
import { GEM_COMBINATIONS, gemCombination, type GemCombination } from './gems-combos';

export type GemSpecial = 'row' | 'column' | 'burst' | 'orb' | 'lantern';
export interface Gem { id: number; color: number; special?: GemSpecial }
export interface GemCell { gem: Gem | null; crate: number; frost: number; chain: boolean }
export interface GemsState {
  rules?: GemsRules; level: number; board: GemCell[]; seed: number; nextId: number; movesLeft: number;
  score: number; collected: number[]; frostCleared: number; cratesCleared: number; chainsCleared: number;
  turns: number; status: 'play' | 'won' | 'lost';
}
export type GemsAction = { type: 'swap'; a: number; b: number } | { type: 'booster'; kind: Booster; target?: number };
export interface GemMatch { cells: number[]; special?: GemSpecial }
export interface GemEffect {
  kind: GemSpecial | 'hammer-row' | 'hammer-column' | 'blessing' | 'shuffle' | 'bloom';
  origin: number; targets: number[]; color?: number; special?: GemSpecial; power?: 2;
}
export interface GemsFrame { board: GemCell[]; after?: GemCell[]; cells: number[]; label: string; effects?: GemEffect[]; combo?: GemCombination; cascade?: number }
export interface GemsOutcome { state: GemsState; frames: GemsFrame[]; message: string }
const SIZE = GEMS_SIZE, COUNT = SIZE * SIZE;
const indexOK = (value: number) => Number.isInteger(value) && value >= 0 && value < COUNT;
const adjacent = (a: number, b: number) => Math.abs(a % SIZE - b % SIZE) + Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) === 1;
const movable = (cell: GemCell | undefined) => Boolean(cell?.gem && !cell.crate && !cell.chain);
const copyBoard = (board: GemCell[]) => board.map(cell => ({ ...cell, gem: cell.gem ? { ...cell.gem } : null }));
function random(state: { seed: number }) { state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0; return state.seed / 4294967296; }
function shuffle<T>(items: T[], state: { seed: number }) {
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random(state) * (i + 1)); [items[i], items[j]] = [items[j]!, items[i]!]; }
  return items;
}
const newGem = (state: GemsState): Gem => ({ id: state.nextId++, color: Math.floor(random(state) * gemsLevel(state.level, state.rules ?? 1).colors) });

/** Connected runs form a single special; overlapping T/L runs become a burst. */
export function findGemMatches(board: GemCell[]): GemMatch[] {
  type Run = { cells: number[]; direction: 'row' | 'column' | 'square' };
  const runs: Run[] = [];
  for (const direction of ['row', 'column'] as const) for (let axis = 0; axis < SIZE; axis++) {
    let cells: number[] = [], previous = -2;
    for (let n = 0; n <= SIZE; n++) {
      const index = direction === 'row' ? axis * SIZE + n : n * SIZE + axis;
      const color = n < SIZE && !board[index]?.crate ? board[index]?.gem?.color ?? -1 : -1;
      if (color < 0 || color !== previous) { if (cells.length >= 3) runs.push({ cells, direction }); cells = []; }
      if (color >= 0) cells.push(index);
      previous = color;
    }
  }
  for (let r = 0; r < SIZE - 1; r++) for (let c = 0; c < SIZE - 1; c++) {
    const cells = [r * SIZE + c, r * SIZE + c + 1, (r + 1) * SIZE + c, (r + 1) * SIZE + c + 1];
    const color = board[cells[0]!]!.gem?.color ?? -1;
    if (color >= 0 && cells.every(i => !board[i]!.crate && board[i]!.gem?.color === color)) runs.push({ cells, direction: 'square' });
  }
  const groups: Run[][] = [];
  for (const run of runs) {
    const touching = groups.filter(group => group.some(other => other.cells.some(i => run.cells.includes(i))));
    if (!touching.length) groups.push([run]);
    else { const target = touching[0]!; target.push(run); for (const group of touching.slice(1)) { target.push(...group); groups.splice(groups.indexOf(group), 1); } }
  }
  return groups.map(group => {
    const cells = [...new Set(group.flatMap(run => run.cells))];
    const lines = group.filter(run => run.direction !== 'square');
    const long = lines.find(run => run.cells.length >= 5);
    const cross = lines.some(run => run.direction === 'row') && lines.some(run => run.direction === 'column');
    const four = lines.find(run => run.cells.length === 4);
    const special: GemSpecial | undefined = long ? 'orb' : cross ? 'burst' : four ? four.direction as 'row' | 'column' : group.some(run => run.direction === 'square') ? 'lantern' : undefined;
    return { cells, special };
  });
}

export function legalGemSwaps(state: Pick<GemsState, 'board'>): [number, number][] {
  const board = [...state.board], result: [number, number][] = [];
  for (let a = 0; a < COUNT; a++) if (movable(board[a])) for (const b of [a % SIZE < SIZE - 1 ? a + 1 : -1, a + SIZE]) {
    if (!indexOK(b) || !movable(board[b])) continue;
    const ga = board[a]!.gem!, gb = board[b]!.gem!;
    if (ga.special === 'orb' || gb.special === 'orb' || (ga.special && gb.special)) { result.push([a, b]); continue; }
    [board[a], board[b]] = [board[b]!, board[a]!];
    if (findGemMatches(board).some(match => match.cells.includes(a) || match.cells.includes(b))) result.push([a, b]);
    [board[a], board[b]] = [board[b]!, board[a]!];
  }
  return result;
}

function fill(state: GemsState, fresh = false) {
  // Crates split gravity into independent columns; floor layers stay in place.
  for (let col = 0; col < SIZE; col++) {
    let segment: number[] = [];
    const fall = () => {
      const gems = segment.map(i => state.board[i]!.gem).filter((gem): gem is Gem => gem !== null);
      const missing = segment.length - gems.length;
      const next = [...Array.from({ length: missing }, () => newGem(state)), ...gems];
      segment.forEach((i, n) => { state.board[i]!.gem = next[n]!; }); segment = [];
    };
    for (let row = 0; row < SIZE; row++) {
      const i = row * SIZE + col;
      if (state.board[i]!.crate || (!fresh && state.board[i]!.chain && state.board[i]!.gem)) { fall(); }
      else segment.push(i);
    }
    fall();
  }
}

function reshuffle(state: GemsState) {
  const indices = state.board.flatMap((cell, i) => movable(cell) ? [i] : []);
  const gems = indices.map(i => state.board[i]!.gem!);
  for (let attempt = 0; attempt < 350; attempt++) {
    shuffle(gems, state); indices.forEach((index, n) => { state.board[index]!.gem = gems[n]!; });
    if (!findGemMatches(state.board).length && legalGemSwaps(state).length) return;
  }
  // Pathological distributions get fresh normal colors. All special identities,
  // blockers, layers, inventory, and remaining moves are retained.
  for (let attempt = 0; attempt < 500; attempt++) {
    for (const i of indices) { const gem = state.board[i]!.gem!; if (gem.special !== 'orb') gem.color = Math.floor(random(state) * gemsLevel(state.level, state.rules ?? 1).colors); }
    if (!findGemMatches(state.board).length && legalGemSwaps(state).length) return;
  }
  throw new Error('Could not arrange a playable gem board.');
}

export function startGems(level: number, attempt = 0, rules: GemsRules = GEMS_RULES): GemsState {
  const config = gemsLevel(level, rules);
  const state: GemsState = { rules, level, seed: (Math.imul(level, 104729) + Math.imul(attempt, 7919) + 3456789) >>> 0, nextId: 1,
    board: Array.from({ length: COUNT }, () => ({ gem: null, crate: 0, frost: 0, chain: false })),
    movesLeft: config.moves, score: 0, collected: [0, 0, 0, 0, 0, 0], frostCleared: 0, cratesCleared: 0, chainsCleared: 0, turns: 0, status: 'play' };
  // Ten alternating garden patterns, with seeded placement inside each pattern.
  const positions = shuffle(Array.from({ length: COUNT }, (_, i) => i), state);
  const pattern = (i: number) => {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    switch (level % 5) {
      case 0: return Math.min(r, c, 7 - r, 7 - c) === 1 ? 0 : 1;
      case 1: return Math.abs(r - c) <= 1 || Math.abs(7 - r - c) <= 1 ? 0 : 1;
      case 2: return c === 2 || c === 5 ? 0 : 1;
      case 3: return (r + c) % 2 ? 0 : 1;
      default: return r === 2 || r === 5 ? 0 : 1;
    }
  };
  const patterned = rules === 2 && level >= 4
    ? [...new Set([...gemsBarrierCells(level), ...positions])]
    : [...positions].sort((a, b) => pattern(a) - pattern(b));
  for (const i of patterned.slice(0, config.crates)) state.board[i]!.crate = config.crateLayers;
  const open = positions.filter(i => !state.board[i]!.crate);
  for (const i of open.slice(0, config.frost)) state.board[i]!.frost = config.frostLayers;
  for (const i of open.slice(-config.chains || open.length)) state.board[i]!.chain = true;
  // Rejection-fill the complete board without accidental opening matches.
  for (let i = 0; i < COUNT; i++) if (!state.board[i]!.crate) {
    const candidates = shuffle(Array.from({ length: config.colors }, (_, color) => color), state);
    const color = candidates.find(color => !(i % SIZE > 1 && state.board[i - 1]!.gem?.color === color && state.board[i - 2]!.gem?.color === color)
      && !(i >= SIZE * 2 && state.board[i - SIZE]!.gem?.color === color && state.board[i - SIZE * 2]!.gem?.color === color)
      && !(i >= SIZE && i % SIZE > 0 && state.board[i - 1]!.gem?.color === color && state.board[i - SIZE]!.gem?.color === color && state.board[i - SIZE - 1]!.gem?.color === color));
    state.board[i]!.gem = { id: state.nextId++, color: color ?? candidates[0]! };
  }
  if (findGemMatches(state.board).length || !legalGemSwaps(state).length) reshuffle(state);
  return state;
}

export function gemsGoalsMet(state: GemsState) {
  return gemsLevel(state.level, state.rules ?? 1).collect.every(goal => state.collected[goal.color]! >= goal.count)
    && state.board.every(cell => !cell.crate && !cell.frost && !cell.chain);
}
export function gemsStars(state: GemsState) {
  if (state.status !== 'won') return 0;
  const remaining = state.movesLeft / gemsLevel(state.level, state.rules ?? 1).moves;
  return remaining >= .4 ? 3 : remaining >= .15 ? 2 : 1;
}
const rowAt = (i: number) => Array.from({ length: SIZE }, (_, c) => Math.floor(i / SIZE) * SIZE + c);
const columnAt = (i: number) => Array.from({ length: SIZE }, (_, r) => r * SIZE + i % SIZE);
function areaAt(i: number, radius: number) {
  return Array.from({ length: COUNT }, (_, n) => n).filter(n => Math.abs(n % SIZE - i % SIZE) <= radius && Math.abs(Math.floor(n / SIZE) - Math.floor(i / SIZE)) <= radius);
}
function goalTarget(state: GemsState, excluded: Set<number>): number | undefined {
  const goals = gemsLevel(state.level, state.rules ?? 1).collect;
  return state.board.map((cell, i) => ({ i, priority: cell.crate * 8 + cell.frost * 5 + (cell.chain ? 7 : 0)
    + (goals.some(goal => goal.color === cell.gem?.color && state.collected[goal.color]! < goal.count) ? 3 : 0) }))
    .filter(({ i }) => !excluded.has(i)).sort((a, b) => b.priority - a.priority || a.i - b.i)[0]?.i;
}
function specialCells(state: GemsState, i: number, special: GemSpecial, excluded: Set<number>): number[] {
  if (special === 'row') return rowAt(i);
  if (special === 'column') return columnAt(i);
  if (special === 'burst') return areaAt(i, 1);
  if (special === 'lantern') { const target = goalTarget(state, excluded); return [i, ...(target === undefined ? [] : [target])]; }
  const counts = Array(6).fill(0) as number[];
  state.board.forEach(cell => { if (cell.gem && cell.gem.color >= 0) counts[cell.gem.color]!++; });
  const color = counts.indexOf(Math.max(...counts));
  return [i, ...state.board.flatMap((cell, n) => cell.gem?.color === color ? [n] : [])];
}

function clearWave(state: GemsState, initial: number[], keep: Set<number>, multiplier: number, power = 1) {
  const hits = new Set(initial), queue = [...initial], activated = new Set<number>();
  const effects: GemEffect[] = [];
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n]!, gem = state.board[i]!.gem;
    if (gem?.special && !activated.has(i) && !keep.has(i)) {
      activated.add(i);
      const targets = specialCells(state, i, gem.special, hits);
      effects.push({ kind: gem.special, origin: i, targets, color: gem.color });
      for (const target of targets) if (!hits.has(target)) { hits.add(target); queue.push(target); }
    }
  }
  const crateHits = new Set<number>();
  for (const i of hits) {
    const cell = state.board[i]!;
    if (cell.crate) { crateHits.add(i); continue; }
    if (cell.frost) { const damage = Math.min(power, cell.frost); cell.frost -= damage; state.frostCleared += damage; state.score += 30 * multiplier * damage; }
    for (const other of [i - SIZE, i + SIZE, ...(i % SIZE > 0 ? [i - 1] : []), ...(i % SIZE < SIZE - 1 ? [i + 1] : [])]) if (indexOK(other) && state.board[other]!.crate) crateHits.add(other);
    if (cell.chain) { cell.chain = false; state.chainsCleared++; state.score += 40 * multiplier; }
    if (keep.has(i)) continue;
    if (cell.gem) {
      if (cell.gem.color >= 0) state.collected[cell.gem.color]!++;
      state.score += 60 * multiplier; cell.gem = null;
    }
  }
  for (const i of crateHits) {
    const cell = state.board[i]!, damage = Math.min(power, cell.crate); cell.crate -= damage; state.score += 50 * multiplier * damage;
    if (!cell.crate) state.cratesCleared++;
  }
  return { cells: [...new Set([...hits, ...crateHits])], effects };
}

function combinedSpecials(state: GemsState, a: number, b: number): { cells: number[]; label: string; effects: GemEffect[]; combo?: GemCombination } | null {
  const ga = state.board[a]!.gem!, gb = state.board[b]!.gem!;
  const specials = [ga.special, gb.special];
  const combined = (cells: number[], label: string, effects: GemEffect[]) => {
    const combo = specials[0] && specials[1] ? gemCombination(a, b, specials[0], specials[1]) : undefined;
    // These two effects are represented by the combination itself. Triggering
    // them again would add an extra color or an unintended second line.
    state.board[a]!.gem!.special = undefined; state.board[b]!.gem!.special = undefined;
    return { cells, label: combo ? `${GEM_COMBINATIONS[combo.kind].title} · double obstacle power!` : label, effects, ...(combo ? { combo } : {}) };
  };
  if (specials.includes('orb')) {
    if (specials.every(special => special === 'orb')) {
      const targets = Array.from({ length: COUNT }, (_, i) => i);
      return combined(targets, 'Two wisdom orbs · the whole garden!', [{ kind: 'orb', origin: a, targets, power: 2 }, { kind: 'orb', origin: b, targets, power: 2 }]);
    }
    const colorGem = ga.special === 'orb' ? gb : ga;
    const targets = state.board.flatMap((cell, i) => cell.gem?.color === colorGem.color ? [i] : []);
    if (colorGem.special) for (const i of targets) state.board[i]!.gem!.special = colorGem.special === 'row' || colorGem.special === 'column' ? i % 2 ? 'row' : 'column' : colorGem.special;
    return combined([...targets, a, b], colorGem.special ? 'Wisdom orb · special celebration!' : 'Wisdom orb · one color cleared!', [{ kind: 'orb', origin: ga.special === 'orb' ? a : b, targets, color: colorGem.color, ...(colorGem.special ? { power: 2 as const } : {}) }]);
  }
  if (!ga.special || !gb.special) return null;
  if (specials.includes('lantern')) {
    const target = goalTarget(state, new Set([a, b]));
    const other = ga.special === 'lantern' ? gb.special : ga.special;
    if (other === 'lantern') {
      const targets = new Set([a, b]);
      for (let n = 0; n < 3; n++) { const next = goalTarget(state, targets); if (next !== undefined) targets.add(next); }
      return combined([...targets], 'Three guiding lanterns · gifts for your goals!', [{ kind: 'lantern', origin: b, targets: [...targets].filter(i => i !== a && i !== b), power: 2 }]);
    }
    const delivered = target === undefined ? [] : specialCells(state, target, other, new Set([a, b]));
    return combined([a, b, ...delivered], 'Guiding lantern · a gift for your goals!', [
      { kind: 'lantern', origin: ga.special === 'lantern' ? a : b, targets: target === undefined ? [] : [target] },
      ...(target === undefined ? [] : [{ kind: other, origin: target, targets: delivered }]),
    ]);
  }
  if (specials.every(s => s === 'burst')) return combined([...areaAt(a, 2), ...areaAt(b, 2)], 'Double lotus burst!', [a, b].map(origin => ({ kind: 'burst', origin, targets: areaAt(origin, 2), power: 2 })));
  if (specials.includes('burst')) {
    const cells = new Set<number>();
    for (const i of areaAt(b, 1)) { rowAt(i).forEach(n => cells.add(n)); columnAt(i).forEach(n => cells.add(n)); }
    const origins = areaAt(b, 1);
    const rows = [...new Set(origins.map(i => Math.floor(i / SIZE)))].map(row => row * SIZE + b % SIZE);
    const columns = [...new Set(origins.map(i => i % SIZE))].map(col => Math.floor(b / SIZE) * SIZE + col);
    return combined([...cells], 'Lotus + line · three rows and columns!', [
      { kind: 'burst', origin: b, targets: areaAt(b, 1) },
      ...rows.map(origin => ({ kind: 'row' as const, origin, targets: rowAt(origin) })),
      ...columns.map(origin => ({ kind: 'column' as const, origin, targets: columnAt(origin) })),
    ]);
  }
  return combined([...rowAt(b), ...columnAt(b)], 'Crossed lines · row and column!', [{ kind: 'row', origin: b, targets: rowAt(b) }, { kind: 'column', origin: b, targets: columnAt(b) }]);
}

/** Pure deterministic action replay, shared by the UI and level/balance checks. */
export function applyGemsAction(previous: GemsState, action: GemsAction): GemsOutcome | null {
  if (previous.status !== 'play' || !action || typeof action !== 'object') return null;
  const state = { ...previous, board: copyBoard(previous.board), collected: [...previous.collected] };
  let initial: number[] | null = null, message = '', preferred: number[] = [];
  let initialEffects: GemEffect[] = [];
  let initialCombo: GemCombination | undefined;
  if (action.type === 'swap') {
    const { a, b } = action;
    if (!indexOK(a) || !indexOK(b) || !adjacent(a, b) || !movable(state.board[a]) || !movable(state.board[b])) return null;
    [state.board[a]!.gem, state.board[b]!.gem] = [state.board[b]!.gem, state.board[a]!.gem];
    const combo = combinedSpecials(state, a, b);
    if (combo) { initial = combo.cells; message = combo.label; initialEffects = combo.effects; initialCombo = combo.combo; }
    else if (!findGemMatches(state.board).some(match => match.cells.includes(a) || match.cells.includes(b))) return null;
    state.movesLeft--; preferred = [b, a];
  } else if (action.type === 'booster') {
    if (action.kind === 'shuffle') {
      reshuffle(state); state.turns++;
      return { state, frames: [
        { board: copyBoard(previous.board), cells: [], label: 'Fresh breeze · a new possibility', effects: [{ kind: 'shuffle', origin: 27, targets: previous.board.flatMap((cell, i) => movable(cell) ? [i] : []) }] },
        { board: copyBoard(state.board), cells: [], label: 'Fresh breeze · a new possibility' },
      ], message: 'Fresh breeze rearranged the gems. No move used.' };
    }
    if (!['row', 'column', 'burst'].includes(action.kind) || !indexOK(action.target!)) return null;
    initial = action.kind === 'row' ? rowAt(action.target!) : action.kind === 'column' ? columnAt(action.target!) : areaAt(action.target!, 1);
    message = action.kind === 'burst' ? 'Lotus blessing!' : action.kind === 'row' ? 'Horizontal hammer!' : 'Vertical hammer!';
    initialEffects = [{ kind: action.kind === 'burst' ? 'blessing' : action.kind === 'row' ? 'hammer-row' : 'hammer-column', origin: action.target!, targets: initial }];
  } else return null;
  const frames: GemsFrame[] = [];
  let wave = 0, matches = initial ? [] : findGemMatches(state.board), specialsMade = 0;
  while (initial || matches.length) {
    const keep = new Set<number>(), cells = initial ?? [...new Set(matches.flatMap(match => match.cells))];
    const blooms: GemEffect[] = [];
    if (!initial) for (const match of matches) if (match.special) {
      const candidates = [...preferred.filter(i => match.cells.includes(i)), ...match.cells];
      const anchor = candidates.find(i => state.board[i]!.gem && !state.board[i]!.gem!.special);
      if (anchor !== undefined) {
        const gem = state.board[anchor]!.gem!;
        state.board[anchor]!.gem = { ...gem, special: match.special, color: match.special === 'orb' ? -1 : gem.color };
        keep.add(anchor); specialsMade++;
        blooms.push({ kind: 'bloom', origin: anchor, targets: [anchor], special: match.special, color: gem.color });
      }
    }
    wave++;
    const before = copyBoard(state.board);
    const hit = clearWave(state, cells, keep, Math.min(4, wave), initialCombo ? 2 : 1);
    const label = wave === 1 ? message || (keep.size ? 'A special gem blooms!' : 'A mindful match') : `Cascade × ${wave}`;
    if (frames.length < 20) frames.push({ board: before, after: copyBoard(state.board), cells: hit.cells.filter(i => !keep.has(i)), label, effects: [...initialEffects, ...hit.effects, ...blooms], ...(initialCombo ? { combo: initialCombo } : {}), cascade: wave });
    fill(state);
    if (frames.length < 20) frames.push({ board: copyBoard(state.board), cells: [], label });
    initial = null; initialEffects = []; initialCombo = undefined; preferred = []; matches = findGemMatches(state.board);
    if (wave >= 80) { reshuffle(state); message = 'A fresh breeze settles the garden.'; break; }
  }
  state.turns++;
  state.status = gemsGoalsMet(state) ? 'won' : state.movesLeft <= 0 ? 'lost' : 'play';
  if (state.status === 'play' && !legalGemSwaps(state).length) {
    const before = copyBoard(state.board);
    reshuffle(state); message += ' No swaps remained, so the garden reshuffled for free.';
    frames.push({ board: before, cells: [], label: 'Free reshuffle · keep going', effects: [{ kind: 'shuffle', origin: 27, targets: before.flatMap((cell, i) => movable(cell) ? [i] : []) }] });
    frames.push({ board: copyBoard(state.board), cells: [], label: 'Free reshuffle · keep going' });
  }
  if (!message) message = `${wave > 1 ? `${wave} cascades! ` : ''}${specialsMade ? `${specialsMade} special ${specialsMade === 1 ? 'gem' : 'gems'} created. ` : ''}${state.score - previous.score} points.`;
  return { state, frames, message };
}
