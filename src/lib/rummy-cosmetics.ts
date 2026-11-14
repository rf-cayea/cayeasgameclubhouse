import { SHARED_DECKS, canonicalDeckId, ownsPlayingDeck } from './playing-decks';
import { deckArtUrl } from './card-decks';
import { CARD_TABLE_THEMES, RUMMY_TABLE_SURFACES, ownsCardTable, canonicalCardTable } from './card-table-themes';
import { CLASSIC_VENUE, SPADES_VENUES } from './spades-cosmetics';
export type RummyAppearanceSlot = 'background' | 'table' | 'deck';
export interface RummyDesign { id: string; name: string; slot: RummyAppearanceSlot; wins: number; image: string; surface?: string; backgroundSize?: string; price?: number; purchaseOnly?: boolean }
export const RUMMY_DESIGNS: RummyDesign[] = [
  ...SHARED_DECKS.map(deck => ({ id: deck.id, name: deck.name, slot: 'deck' as const, wins: 0, purchaseOnly: true, price: deck.price, image: deckArtUrl(deck) })),
  ...CARD_TABLE_THEMES.map(theme => ({ id: `rummy-table-${theme.key}`, name: theme.name, slot: 'table' as const, wins: 0, purchaseOnly: true, price: 100, image: theme.image, surface: theme.surface, backgroundSize: theme.size })),
  { id: 'rummy-room-classic', name: 'The Clubhouse', slot: 'background', wins: 0, image: '' },
  { id: 'rummy-table-classic', name: 'Classic Emerald', slot: 'table', wins: 0, image: '/rummy-art/table-classic.webp' },
  { id: CLASSIC_VENUE.id, name: CLASSIC_VENUE.name, slot: 'table', wins: 0, image: '/rummy-art/table-classic.webp', surface: CLASSIC_VENUE.surface },
  ...SPADES_VENUES.filter(item => item.id.startsWith('spades-') && !CARD_TABLE_THEMES.some(theme => item.id === `spades-table-${theme.key}`))
    .map(item => ({ id: item.id, name: item.name, slot: 'table' as const, wins: 0, image: '', surface: item.surface, backgroundSize: item.backgroundSize, purchaseOnly: true, price: item.price })),
  { id: 'rummy-standard', name: 'Clubhouse Heritage', slot: 'deck', wins: 0, image: '/card-art/heritage.webp' },
  ...RUMMY_TABLE_SURFACES.map(item => ({ ...item, slot: 'table' as const })),
  { id: 'rummy-room-riviera', name: 'Riviera Sunset', slot: 'background', wins: 1, image: '' },
  { id: 'rummy-room-moonlit', name: 'Moonlit Conservatory', slot: 'background', wins: 3, image: '' },
  { id: 'rummy-room-library', name: 'The Amber Library', slot: 'background', wins: 7, image: '' },
];
export const DEFAULT_RUMMY_APPEARANCE = { background: 'rummy-room-classic', table: 'rummy-table-classic', deck: 'rummy-standard' };
export interface RummyAppearanceView {
  member: boolean; wins: number; owned: string[];
  equipped: { background: string; table: string; deck: string };
}
export function rummyDesign(id: string, slot: RummyAppearanceSlot) {
  return RUMMY_DESIGNS.find(item => (slot === 'table' ? canonicalCardTable(item.id) === canonicalCardTable(id) : item.id === (slot === 'deck' ? canonicalDeckId(id) : id)) && item.slot === slot) ?? RUMMY_DESIGNS.find(item => item.id === DEFAULT_RUMMY_APPEARANCE[slot])!;
}
export function rummyAppearanceView(member: boolean, wins: number, saved?: { background?: unknown; table_id?: unknown; deck_id?: unknown } | null, purchased: readonly string[] = []): RummyAppearanceView {
  const owned = RUMMY_DESIGNS.filter(item => ((!item.purchaseOnly && item.wins <= wins) || (member && (item.slot === 'deck' ? ownsPlayingDeck(purchased, item.id) : item.slot === 'table' ? ownsCardTable(purchased, item.id) : purchased.includes(item.id))))).map(item => item.id);
  const selected = (slot: RummyAppearanceSlot, value: unknown) => {
    const id = typeof value === 'string' ? (slot === 'deck' ? canonicalDeckId(value) : value) : '';
    const resolved = rummyDesign(id, slot).id;
    return owned.includes(resolved) ? resolved : DEFAULT_RUMMY_APPEARANCE[slot];
  };
  return { member, wins, owned, equipped: { background: selected('background', saved?.background), table: selected('table', saved?.table_id), deck: selected('deck', saved?.deck_id) } };
}
