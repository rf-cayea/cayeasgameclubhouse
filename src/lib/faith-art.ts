/** Illustrated faces keep matching independent of a device's emoji fonts. */
export const FAITH_ATLASES = ['christianity-islam', 'hinduism-buddhism', 'judaism-sikhism', 'taoism-shinto', 'jainism-bahai'] as const;
export const FAITH_MOTIFS: readonly (readonly string[])[] = [
  ['Ornamental cross', 'Dove and olive branch', 'Bread', 'Grapes', 'Church bell', 'Fish', 'Crown', 'Candle', 'Church', 'Parchment'],
  ['Crescent', 'Mosque', 'Prayer beads', 'Moon', 'Star', 'Glazed vessel', 'Date palm', 'Camel', 'Kaaba', 'Rose'],
  ['Om', 'Lotus', 'Elephant', 'Peacock', 'Diya lamp', 'Cow', 'Cobra', 'Coconut', 'Trident', 'Hibiscus'],
  ['Dharma wheel', 'Lotus', 'Monastery', 'Bodhi leaves', 'Prayer beads', 'Temple bell', 'Elephant', 'Deer', 'Tea bowl', 'Mountain'],
  ['Star of David', 'Hanukkah menorah', 'Scroll', 'Wine goblet', 'Honey', 'Apple', 'Candle', 'Herbs', 'Olive branch', 'Lamb'],
  ['Khanda', 'Kirpans', 'Golden Temple', 'Wheat', 'Sunburst Khanda', 'Sacred scripture', 'Lion', 'Sunrise', 'Shared meal', 'Water'],
  ['Yin and yang', 'Mountain pavilion', 'Dragon', 'Crane', 'Peach', 'Bamboo', 'Mountain mist', 'Turtle', 'Ceramic flask', 'Full moon'],
  ['Torii gate', 'Cherry blossom', 'Mount Fuji', 'Fox', 'Wind chime', 'Rice ball', 'Paper lantern', 'Shell', 'Hina dolls', 'Ocean wave'],
  ['Caring hands', 'Lotus', 'Dove', 'Cow', 'Marigold', 'Oil lamp', 'Rice bowl', 'Swan', 'Tree', 'Sun'],
  ['Nine-pointed star', 'Rose', 'Cypress', 'Garden fountain', 'Dove', 'Globe', 'Open book', 'Radiant star', 'Tulip', 'Friendship'],
];
export const FAITH_PALETTES = ['#bb7c79', '#7bb8bf', '#dda355', '#91b49a', '#8dacca', '#dbb96b', '#a6b8ad', '#d6978c', '#d2c290', '#a9ba8b'];
export const faithMotif = (collection: number, type: number) => FAITH_MOTIFS[collection]?.[type] ?? 'Illustrated tile';
