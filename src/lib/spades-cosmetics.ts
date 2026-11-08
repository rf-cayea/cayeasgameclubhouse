import { SHARED_DECKS, playingDeck, canonicalDeckId, type PlayingDeck } from './playing-decks';
import { CARD_TABLE_THEMES } from './card-table-themes';
export interface SpadesVenue { id: string; name: string; price: number; description: string; felt: string; rail: string; accent: string; room: string; surface: string; backgroundSize?: string }
export type SpadesDeck = PlayingDeck;
const surface = (image: string) => `linear-gradient(#10231d18, #10231d18), url("${image}")`;
export const CLASSIC_VENUE: SpadesVenue = { id: 'spades-table-classic', name: 'Clubhouse Green', price: 0, description: 'Emerald felt, polished walnut rails for full-screen play.', felt: '#175644', rail: '#76502e', accent: '#d6b477', room: '', surface: surface('/rummy-art/table-classic.webp') };
export const SPADES_VENUES: SpadesVenue[] = [
  ...CARD_TABLE_THEMES.map(theme => ({ id: `spades-table-${theme.key}`, name: theme.name, price: 100, description: 'A full-screen artist table surface with matching rails.', felt: theme.felt, rail: theme.rail, accent: theme.accent, room: '', surface: theme.surface, backgroundSize: theme.size })),
  { id: 'spades-table-atlas', name: 'Moonlit Observatory', price: 100, description: 'Sapphire felt and brass-trimmed walnut with celestial blue felt.', felt: '#233864', rail: '#725932', accent: '#b4d5ff', room: '', surface: surface('/rummy-art/table-sapphire.webp') },
  { id: 'spades-table-ember', name: 'Rosewood Parlour', price: 100, description: 'Burgundy felt and carved rosewood with richly woven velvet.', felt: '#682f3f', rail: '#753d27', accent: '#f5c88d', room: '', surface: surface('/rummy-art/table-burgundy.webp') },
  { id: 'spades-table-grove', name: 'Emerald Conservatory', price: 100, description: 'Teal felt, olivewood rails and a sunlit painted botanical glasshouse.', felt: '#125456', rail: '#6d633b', accent: '#b9dbaa', room: '', surface: surface('/rummy-art/table-riviera.webp') },
  { id: 'spades-table-deco', name: 'Gilded Grand Hall', price: 100, description: 'Plum velvet and gilded rails with an Art Deco finish.', felt: '#493454', rail: '#8c7141', accent: '#f0d79b', room: '', surface: `linear-gradient(#35254870, #35254870), url("/rummy-art/table-burgundy.webp")` },
];
export const CLASSIC_DECK: SpadesDeck = { id: 'spades-deck-classic', name: 'Clubhouse Standard', price: 0, description: 'Illuminated ivory faces, painted royal courts and an ornate Heritage back.', paper: '#fff8e8', ink: '#18342d', red: '#a62b3b', back: '#174b3c', accent: '#e9c77d', motif: 'classic' };
export const SPADES_DECKS = SHARED_DECKS;
export const spadesVenue = (id?: string) => SPADES_VENUES.find(item => item.id === id) ?? CLASSIC_VENUE;
export const spadesDeck = (id?: string) => playingDeck(id) ?? CLASSIC_DECK;
export const spadesCosmetic = (id: string) => [...SPADES_VENUES, ...SPADES_DECKS].find(item => item.id === canonicalDeckId(id));
