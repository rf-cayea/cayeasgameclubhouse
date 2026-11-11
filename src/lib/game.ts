export const TOTAL_LEVELS = 280;
export const ORIGINAL_LEVELS = 200;
export const LEVELS_PER_THEME = 20;
export const TRAY_SIZE = 7;
export const FREE_UNDOS = 2;
export const FREE_SHUFFLES = 2;

export interface Theme { name: string; art: string; tiles: string[] }
export const THEMES: Theme[] = [
  { name: "Christianity", art: "The Rose Window", tiles: ["✝", "🕊", "🍞", "🍇", "🔔", "🐟", "👑", "🕯", "⛪", "📜"] },
  { name: "Islam", art: "Dome at Dusk", tiles: ["☪", "🕌", "📿", "🌙", "⭐", "🏺", "🌴", "🐪", "🕋", "🌹"] },
  { name: "Hinduism", art: "Lotus Pond Temple", tiles: ["🕉", "🪷", "🐘", "🦚", "🪔", "🐄", "🐍", "🥥", "🔱", "🌺"] },
  { name: "Buddhism", art: "Temple in the Mist", tiles: ["☸", "🪷", "🛕", "🍃", "📿", "🔔", "🐘", "🦌", "🍵", "🏔"] },
  { name: "Judaism", art: "Menorah of Jerusalem", tiles: ["✡", "🕎", "📜", "🍷", "🍯", "🍎", "🕯", "🌿", "🫒", "🐑"] },
  { name: "Sikhism", art: "Golden Temple Dawn", tiles: ["☬", "⚔", "🛕", "🌾", "🪯", "📖", "🦁", "🌅", "🍛", "💧"] },
  { name: "Taoism", art: "Mountains of the Way", tiles: ["☯", "🏯", "🐉", "🦢", "🍑", "🎋", "🌫", "🐢", "🍶", "🌕"] },
  { name: "Shinto", art: "Torii at Sunrise", tiles: ["⛩", "🌸", "🗻", "🦊", "🎐", "🍙", "🏮", "🐚", "🎎", "🌊"] },
  { name: "Jainism", art: "Marble Sanctuary", tiles: ["🤲", "🪷", "🕊", "🐄", "🌼", "🪔", "🍚", "🦢", "🌳", "☀"] },
  { name: "Bahá'í Faith", art: "Gardens of Carmel", tiles: ["✴", "🌹", "🌳", "⛲", "🕊", "🌍", "📖", "🌟", "🌷", "🤝"] },
];

export interface Tile { id: number; type: number; x: number; y: number; z: number; frost?: number; seal?: number; veiled?: boolean }

export function themeFor(level: number) {
  if (level > ORIGINAL_LEVELS) return Math.floor((level - ORIGINAL_LEVELS - 1) / 8) % THEMES.length;
  return Math.min(THEMES.length - 1, Math.floor((level - 1) / LEVELS_PER_THEME));
}

export function levelConfig(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) throw new RangeError('Choose a Faith 3 level from 1 to 280.');
  // Only the opening tutorial is flat. Build substantial overlapping stacks
  // immediately, then add depth as the obstacle challenges arrive.
  const layers = level === 1 ? 1 : level < 6 ? 2 : level < 31 ? 3 : level < 71 ? 4 : level < 121 ? 5 : level < 181 ? 6 : 7;
  return {
    types: level <= 3 ? 3 + level : Math.min(10, 6 + Math.floor((level - 4) / 20)),
    layers, density: Math.min(.95, .7 + level / 1000),
    triples: level === 1 ? 6 : level <= 6 ? 8 + level * 2 : Math.min(56, 20 + Math.floor((level - 6) / 5)),
    traySize: level < 101 ? 7 : level < 221 ? 6 : 5,
    frostRatio: level < 11 ? 0 : Math.min(.3, .07 + level / 1200),
    frostLayers: level < 101 ? 1 : level < 221 ? 2 : 3,
    sealRatio: level < 31 ? 0 : Math.min(.22, .04 + level / 1600),
    veilRatio: level < 61 ? 0 : Math.min(.3, .06 + level / 1200),
    difficulty: level === 1 ? 'Gentle' : level < 11 ? 'Layered paths' : level < 31 ? 'Frost paths' : level < 61 ? 'Sealed paths' : level < 101 ? 'Veiled paths' : level < 161 ? 'Expert' : level < 221 ? 'Master' : 'Grandmaster',
  };
}

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const COLS = 6;
export const ROWS = 7;

export function isCovered(tile: Tile, tiles: Tile[]) {
  return tiles.some(other => other.z > tile.z && Math.abs(other.x - tile.x) < 2 && Math.abs(other.y - tile.y) < 2);
}
export function isBlocked(tile: Tile, tiles: Tile[]) {
  return Boolean(tile.frost || tile.seal || isCovered(tile, tiles));
}
/** A collected tile affects ice touching its footprint, including nearby layers. */
export function touches(a: Tile, b: Tile) {
  return Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2;
}

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Topological removal order: every tile is uncovered when its turn arrives. */
function removalOrder(board: Tile[], random: () => number) {
  const covers = board.map(top => board.filter(lower => top.z > lower.z && Math.abs(top.x - lower.x) < 2 && Math.abs(top.y - lower.y) < 2).map(tile => tile.id));
  const above = board.map(() => 0);
  for (const ids of covers) for (const id of ids) above[id]++;
  const available = board.filter(tile => above[tile.id] === 0).map(tile => tile.id), order: number[] = [];
  while (available.length) {
    const index = Math.floor(random() * available.length), id = available[index]!;
    available.splice(index, 1); order.push(id);
    for (const lower of covers[id]!) if (--above[lower] === 0) available.push(lower);
  }
  if (order.length !== board.length) throw new Error('Invalid covering layout.');
  return order;
}

/** Build a seeded board together with a constructive, unassisted winning path.
 * The path is used to place obstacles safely, not to choose a player's moves.
 */
export function generateLevelPlan(level: number): { board: Tile[]; solution: number[] } {
  const cfg = levelConfig(level), random = rng(level * 7919);
  const layers: Tile[][] = [];
  for (let z = 0; z < cfg.layers; z++) {
    const offset = z % 2, slots: (Tile & { priority: number })[] = [];
    for (let row = 0; row < ROWS - offset; row++) for (let column = 0; column < COLS - offset; column++) {
      if (z === 0 || random() < cfg.density) {
        const x = 2 * column + offset, y = 2 * row + offset;
        slots.push({ id: 0, type: 0, x, y, z, priority: Math.hypot(x - 5, y - 6) + random() * 4 });
      }
    }
    slots.sort((a, b) => a.priority - b.priority);
    layers.push(slots.map(({ priority: _priority, ...tile }) => tile));
  }
  const count = Math.min(cfg.triples * 3, Math.floor(layers.flat().length / 3) * 3);
  const chosen: Tile[] = [];
  for (let round = 0; chosen.length < count; round++) {
    for (const layer of layers) {
      const tile = layer[round];
      if (tile && chosen.length < count) chosen.push({ ...tile, id: chosen.length });
    }
  }
  const order = removalOrder(chosen, random);
  const groupTypes = shuffle(Array.from({ length: count / 3 }, (_, index) => index % cfg.types), random);
  const sequence: number[] = [];
  // Interleaving triples requires planning while always respecting tray capacity.
  const parallel = Math.min(Math.floor((cfg.traySize - 1) / 2), level < 11 ? 1 : level < 61 ? 2 : 3);
  while (groupTypes.length) {
    const group = groupTypes.splice(0, Math.min(parallel, groupTypes.length));
    for (let repeat = 0; repeat < 3; repeat++) sequence.push(...group);
  }
  for (let i = 0; i < order.length; i++) chosen[order[i]!]!.type = sequence[i]!;
  const before: number[] = [], counts = new Map<number, number>(); let matches = 0;
  for (const type of sequence) {
    before.push(matches);
    counts.set(type, (counts.get(type) ?? 0) + 1);
    if (counts.get(type) === 3) { counts.set(type, 0); matches++; }
  }
  const candidates = shuffle(order.map((id, index) => ({ id, index })), random);
  let frozen = 0, sealed = 0, veiled = 0;
  for (const { id, index } of candidates) {
    const tile = chosen[id]!;
    if (frozen >= Math.floor(count * cfg.frostRatio)) break;
    const priorNeighbors = order.slice(0, index).filter(earlier => touches(tile, chosen[earlier]!)).length;
    if (!priorNeighbors) continue;
    tile.frost = Math.min(cfg.frostLayers, priorNeighbors); frozen++;
  }
  for (const { id, index } of candidates) {
    if (sealed >= Math.floor(count * cfg.sealRatio)) break;
    if (!before[index]) continue;
    chosen[id]!.seal = 1 + Math.floor(random() * Math.min(before[index]!, 2 + Math.floor(level / 35))); sealed++;
  }
  for (const { id } of candidates) {
    if (veiled >= Math.floor(count * cfg.veilRatio)) break;
    chosen[id]!.veiled = true; veiled++;
  }
  return { board: chosen, solution: order };
}

export function generateLevel(level: number): Tile[] { return generateLevelPlan(level).board; }
