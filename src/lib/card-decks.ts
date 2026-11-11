import type { PlayingDeck as SpadesDeck } from './playing-decks';
import { SHARED_DECKS, playingDeck } from './playing-decks';

export const RUMMY_DECK: SpadesDeck = { id: 'rummy-standard', name: 'Clubhouse Heritage', price: 0, description: 'Illuminated ivory faces, painted royal courts and a gilded navy back.', paper: '#fff9eb', ink: '#20383b', red: '#aa3347', back: '#152e40', accent: '#e8c98b', motif: 'classic' };
export const RUMMY_DECKS = SHARED_DECKS;
export const rummyDeck = (id?: string) => playingDeck(id) ?? RUMMY_DECK;
export const DECK_ART_THEMES = { classic: 'heritage', stars: 'atlas', crown: 'ember', leaves: 'grove', deco: 'deco', standard: 'standard', fantasy: 'fantasy', scifi: 'scifi', sultanate: 'sultanate', 'four-color': 'four-color', chinese: 'chinese', egypt: 'egypt', merfolk: 'merfolk' } as const;
export type DeckArtTheme = typeof DECK_ART_THEMES[keyof typeof DECK_ART_THEMES];
export const deckArtUrl = (deck: SpadesDeck) => `/card-art/${DECK_ART_THEMES[deck.motif]}.webp`;

// The paintings have intentionally different row heights. Keep their original
// composition instead of dividing a sheet into an assumed equal grid.
const uniformSheet = { width: 1024, height: 1792, columns: [0,256,512,768,1024], rows: [0,358.4,716.8,1075.2,1433.6,1792] };
export const DECK_ART_SHEETS = {
  standard: uniformSheet, fantasy: uniformSheet, scifi: uniformSheet, sultanate: uniformSheet, 'four-color': uniformSheet, chinese: { width: 948, height: 1659, columns: [0,237,474,711,948], rows: [0,321,664,982,1301,1659] }, egypt: { width: 1060, height: 1484, columns: [0,265,530,795,1060], rows: [0,297,557,825,1123,1484] }, merfolk: { width: 948, height: 1659, columns: [0,237,474,711,948], rows: [0,333,641,968,1286,1659] },
  heritage: { width: 1122, height: 1402, columns: [0, 287, 560, 835, 1122], rows: [0, 257, 523, 800, 1073, 1402] },
  atlas: { width: 1122, height: 1402, columns: [0, 282, 561, 840, 1122], rows: [0, 253, 518, 789, 1052, 1402] },
  ember: { width: 1024, height: 1536, columns: [0, 256, 512, 769, 1024], rows: [0, 280, 558, 857, 1162, 1536] },
  grove: { width: 1122, height: 1402, columns: [0, 287, 560, 834, 1122], rows: [0, 244, 498, 761, 1040, 1402] },
  deco: { width: 1122, height: 1402, columns: [0, 281, 561, 841, 1122], rows: [0, 281, 561, 841, 1122, 1402] },
} as const;

/** Atlas order: four aces, four jacks, four queens, four kings, two jokers,
 * a quiet ornamental number-card frame and a single face-independent back.
 */
export function deckArtIndex(card?: string, back = false) {
  if (back || !card) return 19;
  if (card === 'X1' || card === 'X2') return card === 'X1' ? 16 : 17;
  const suit = 'SHDC'.indexOf(card[1] ?? '');
  if (suit < 0) return 18;
  const row = { A: 0, J: 1, Q: 2, K: 3 }[card[0] as 'A' | 'J' | 'Q' | 'K'];
  return row === undefined ? 18 : row * 4 + suit;
}
