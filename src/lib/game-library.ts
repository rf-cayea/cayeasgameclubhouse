import type { Game } from './clubhouse';

export const LIBRARY_FILTERS = ['All games', 'Cards', 'Dice', 'Board & skill', 'Puzzles', 'Favorites'] as const;
export type LibraryFilter = typeof LIBRARY_FILTERS[number];
export const GAME_LIBRARY: Record<string, { category: LibraryFilter; label: string; symbol: string; color: string; art: string; mode: string }> = {
  carrom: { category: 'Board & skill', label: 'Carrom & Disc Pool', symbol: '◉', color: 'mint', art: 'carrom', mode: 'Solo · Online' },
  backgammon: { category: 'Board & skill', label: 'Backgammon', symbol: '◈', color: 'rose', art: 'board', mode: 'Solo · Online' },
  'crown-chance': { category: 'Dice', label: 'Crown & Chance', symbol: '♠', color: 'violet', art: 'poker', mode: 'Solo · Online' },
  'crown-court': { category: 'Dice', label: 'Crown & Court', symbol: '♛', color: 'gold', art: 'poker', mode: 'Solo · Online' },
  farkle: { category: 'Dice', label: 'Farkle', symbol: '⚅', color: 'mint', art: 'dice', mode: 'Solo · Online' },
  dominoes: { category: 'Board & skill', label: 'Dominoes', symbol: '⠿', color: 'blue', art: 'domino', mode: 'Solo · Online' },
  'five-dice': { category: 'Dice', label: 'Quintsee', symbol: '⚄', color: 'rose', art: 'dice', mode: 'Solo · Online' },
  'faith-3': { category: 'Puzzles', label: 'Faith 3 Tile Match', symbol: '✦', color: 'violet', art: 'tiles', mode: '280 levels · Solo' },
  rummy: { category: 'Cards', label: 'Rummy+', symbol: '♦', color: 'rose', art: 'cards', mode: 'Solo · Online' },
  spades: { category: 'Cards', label: 'Spades', symbol: '♠', color: 'blue', art: 'cards', mode: 'Solo · Online' },
  'crazy-eights': { category: 'Cards', label: 'Crazy 8’s', symbol: '8', color: 'gold', art: 'cards', mode: 'Solo · Online' },
  hearts: { category: 'Cards', label: 'Hearts', symbol: '♥', color: 'rose', art: 'cards', mode: 'Solo · Online' },
  '3-gems': { category: 'Puzzles', label: '3 Gems of Buddhism', symbol: '◆', color: 'mint', art: 'gems', mode: '200 levels · Solo' },
};
export function gamePath(slug: string) { return `/games/${slug === 'five-dice' ? 'quintsee' : slug}`; }
export function filterGames(games: Game[], filter: LibraryFilter, query: string, favorites: string[]) {
  const term = query.trim().toLocaleLowerCase();
  return games.filter(g => (filter === 'All games' || (filter === 'Favorites' ? favorites.includes(g.slug) : GAME_LIBRARY[g.slug]?.category === filter)) && `${g.name} ${g.tagline} ${GAME_LIBRARY[g.slug]?.label ?? ''}`.toLocaleLowerCase().includes(term));
}
export function readGameList(key: string): string[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string' && x in GAME_LIBRARY) : []; } catch { return []; }
}
export function writeGameList(key: string, value: string[]) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* The library still works for this visit. */ } }
