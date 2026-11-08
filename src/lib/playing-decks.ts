/** Shared collection for games using a French-suited, 52-card poker deck.
 * Jokers are artwork, not a rules unlock: each game still chooses its legal pack. */
export const PLAYING_DECK_FAMILY = 'french-52' as const;
export const PLAYING_CARDS = [...'SHDC'].flatMap(suit => [...'A23456789TJQK'].map(rank => rank + suit));
export const PLAYING_CARDS_WITH_JOKERS = [...PLAYING_CARDS, 'X1', 'X2'];
export interface PlayingDeck {
  id: string; name: string; price: number; description: string; paper: string; ink: string; red: string; back: string; accent: string;
  motif: 'classic' | 'stars' | 'crown' | 'leaves' | 'deco' | 'standard' | 'fantasy' | 'scifi' | 'sultanate' | 'four-color' | 'chinese' | 'egypt' | 'merfolk';
  suitColors?: Record<'S' | 'H' | 'D' | 'C', string>;
  plain?: boolean;
}
export const SHARED_DECKS: PlayingDeck[] = [
  { id: 'card-deck-standard', name: 'Everyday Standard', price: 450, description: 'Clean white faces, traditional double-ended courts, black and red suits, two jokers and a simple woven back.', paper: '#ffffff', ink: '#16191f', red: '#b71e32', back: '#163e79', accent: '#a9b1bc', motif: 'standard', plain: true },
  { id: 'card-deck-fantasy', name: 'Realms of Legend', price: 450, description: 'Epic painted paladins, elven queens and sovereigns, enchanted aces and two travelling jesters.', paper: '#fff5df', ink: '#23383b', red: '#ab263d', back: '#202f46', accent: '#d2ae68', motif: 'fantasy' },
  { id: 'card-deck-scifi', name: 'Stellar Dominion', price: 450, description: 'Starship officers and cosmic royalty, luminous technological aces, two spacefaring jokers and a geometric starfield back.', paper: '#edf5ff', ink: '#182d4d', red: '#b02752', back: '#10213f', accent: '#78bfd8', motif: 'scifi' },
  { id: 'card-deck-sultanate', name: 'Sultan’s Court', price: 450, description: 'Arabesque palace ornament, embroidered royal robes and miniature-inspired Sultanate courts, with two entertainers and an intricate geometric back.', paper: '#fff7e7', ink: '#183d43', red: '#a72c3e', back: '#123e4c', accent: '#caa154', motif: 'sultanate' },
  { id: 'card-deck-four-color', name: 'Four-Suit Regalia', price: 450, description: 'Black spades, red hearts, blue diamonds and green clubs. Every court wears its suit’s color, with coordinated aces, two jokers and a four-color back.', paper: '#fffdf5', ink: '#15191f', red: '#bc2039', back: '#1d2943', accent: '#c4a365', motif: 'four-color', suitColors: { S: '#15191f', H: '#bc2039', D: '#1955c6', C: '#167541' } },
  { id: 'card-deck-chinese', name: 'Chinese Imperial Courts', price: 450, description: 'Imperial guards, empresses and emperors in embroidered silk, jade and gilded palace ornament, with two court entertainers.', paper: '#fff5e0', ink: '#202c38', red: '#ae2935', back: '#263d42', accent: '#c8a052', motif: 'chinese' },
  { id: 'card-deck-egypt', name: 'Pharaoh’s Court', price: 450, description: 'Pharaoh kings, royal queens and temple guards amid lapis, turquoise and gold, with lotus aces and two Nile entertainers.', paper: '#fff4dd', ink: '#173a4c', red: '#ab293c', back: '#133e55', accent: '#d0aa58', motif: 'egypt' },
  { id: 'card-deck-merfolk', name: 'Merfolk Kingdoms', price: 450, description: 'Merfolk knights, mermaid queens and ocean kings, pearl and coral crowns, nautical aces and two underwater jesters.', paper: '#edf9f5', ink: '#153c4b', red: '#b22d52', back: '#123f53', accent: '#b4d9d2', motif: 'merfolk' },
  { id: 'card-deck-atlas', name: 'Midnight Atlas', price: 450, description: 'Silver celestial engraving, sapphire royal portraits, star-map aces and an intricate midnight back.', paper: '#e9f0ff', ink: '#203c6c', red: '#81446d', back: '#12264f', accent: '#9edbff', motif: 'stars' },
  { id: 'card-deck-ember', name: 'Ember Crown', price: 450, description: 'Ruby-and-gold painted courts, phoenix ornament, copper filigree and a lavish royal back.', paper: '#fff0d5', ink: '#4a2525', red: '#ab253c', back: '#622137', accent: '#efbd72', motif: 'crown' },
  { id: 'card-deck-grove', name: 'Verdant Grove', price: 450, description: 'Botanical Art Nouveau portraits, illuminated aces, fine gold foliage and a verdant patterned back.', paper: '#ecf4df', ink: '#174d40', red: '#9b4540', back: '#133f35', accent: '#b8d497', motif: 'leaves' },
  { id: 'card-deck-deco', name: 'Ivory Deco', price: 450, description: 'Sculpted Art Deco court paintings, champagne-gold ornament and an intricate black-lacquer back.', paper: '#fff9ed', ink: '#292631', red: '#9e3549', back: '#24202e', accent: '#e8c77f', motif: 'deco' },
];
/** Read old purchases and saved looks without offering old, cheaper SKUs for sale. */
export function canonicalDeckId(id: string) {
  return /^(rummy|spades)-deck-(atlas|ember|grove|deco)$/.test(id) ? id.replace(/^(rummy|spades)-deck-/, 'card-deck-') : id;
}
export const playingDeck = (id?: string) => SHARED_DECKS.find(deck => deck.id === canonicalDeckId(id ?? ''));
export const isSharedDeck = (id: string) => SHARED_DECKS.some(deck => deck.id === id);
export const ownsPlayingDeck = (owned: readonly string[], id: string) => owned.some(item => canonicalDeckId(item) === canonicalDeckId(id));
/** These thresholds apply only to the one-time migration of existing rewards. */
export const LEGACY_DECK_WINS = { 'card-deck-atlas': 1, 'card-deck-ember': 3, 'card-deck-grove': 5, 'card-deck-deco': 10 } as const;
