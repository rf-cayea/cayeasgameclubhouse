/** Games that seat a computer opponent, keyed by the slug the home page already
 * lists. Faith 3 and 3 Gems are absent on purpose: their levels are the
 * challenge, not a rival. */
export const COMPUTER_OPPONENTS = {
  rummy: { route: '/games/rummy' },
  spades: { route: '/games/spades' },
  farkle: { route: '/games/farkle' },
  dominoes: { route: '/games/dominoes' },
  'five-dice': { route: '/games/quintsee' },
  backgammon: { route: '/games/backgammon' },
  carrom: { route: '/games/carrom' },
  'crown-court': { route: '/games/crown-court' },
  'crown-chance': { route: '/games/crown-chance' },
} as const;

export type ComputerOpponent = (typeof COMPUTER_OPPONENTS)[keyof typeof COMPUTER_OPPONENTS];

/** The computer opponent for a home-page slug, or null for the solo campaigns. */
export function computerOpponent(slug: string): ComputerOpponent | null {
  return (COMPUTER_OPPONENTS as Record<string, ComputerOpponent | undefined>)[slug] ?? null;
}

export type ComputerLevel = 'easy' | 'normal' | 'hard';

const STORAGE_KEY = 'clubhouse-computer-levels';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const isLevel = (value: unknown): value is ComputerLevel => value === 'easy' || value === 'normal' || value === 'hard';
export const levelLabel = (level: ComputerLevel) => `${level[0]!.toUpperCase()}${level.slice(1)}`;

function defaultStorage(): StorageLike | null {
  try { return globalThis.localStorage ?? null; } catch { return null; } // Storage can throw in private modes.
}

function read(store: StorageLike | null): Record<string, unknown> {
  try {
    const saved = store?.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

/** The difficulty last chosen for a game, so its setup opens the way the player
 * left it. Falls back to normal when nothing valid is stored. */
export function rememberedComputerLevel(slug: string, fallback: ComputerLevel = 'normal', store: StorageLike | null = defaultStorage()): ComputerLevel {
  const saved = read(store)[slug];
  return isLevel(saved) ? saved : fallback;
}

/** Stores a chosen difficulty; invalid values and unavailable storage are ignored. */
export function rememberComputerLevel(slug: string, level: unknown, store: StorageLike | null = defaultStorage()): void {
  if (!isLevel(level)) return;
  try { store?.setItem(STORAGE_KEY, JSON.stringify({ ...read(store), [slug]: level })); } catch { /* Preferences are optional. */ }
}
