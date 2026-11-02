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

export interface Tile { id: number; type: number; x: number; y: number; z: number }

export function themeFor(level: number) {
  if (level > ORIGINAL_LEVELS) return Math.floor((level - ORIGINAL_LEVELS - 1) / 8) % THEMES.length;
  return Math.min(THEMES.length - 1, Math.floor((level - 1) / LEVELS_PER_THEME));
}

export function levelConfig(level: number) {
  if (level <= 3) return { types: 4 + level - 1, layers: 1, density: 1, triples: 5 + level };
  const d = level - 3;
  return {
    types: Math.min(10, 6 + Math.floor(d / 15)),
    layers: Math.min(5, 2 + Math.floor(d / 30)),
    density: Math.min(1, .55 + d * .004),
    triples: Math.min(40, 10 + Math.floor(d / 4)),
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

export function isBlocked(tile: Tile, tiles: Tile[]) {
  return tiles.some((other) => other.z > tile.z && Math.abs(other.x - tile.x) < 2 && Math.abs(other.y - tile.y) < 2);
}

/** Seeded Fisher–Yates keeps generated boards identical across JS engines. */
function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export function generateLevel(level: number): Tile[] {
  const cfg = levelConfig(level);
  const random = rng(level * 7919);
  const slots: { x: number; y: number; z: number }[] = [];
  for (let z = 0; z < cfg.layers; z++) {
    const offset = z % 2;
    for (let row = 0; row < ROWS - offset; row++) {
      for (let column = 0; column < COLS - offset; column++) {
        if (z === 0 || random() < cfg.density - z * .08) {
          slots.push({ x: 2 * column + offset, y: 2 * row + offset, z });
        }
      }
    }
  }
  const target = Math.min(cfg.triples * 3, slots.length - slots.length % 3);
  const chosen = cfg.layers === 1 ? shuffle(slots, random).slice(0, target) : slots.slice(slots.length - target);
  const types: number[] = [];
  for (let i = 0; i < target / 3; i++) {
    const type = i % cfg.types;
    types.push(type, type, type);
  }
  shuffle(types, random);
  return chosen.map((slot, i) => ({ id: i, type: types[i]!, ...slot }));
}
