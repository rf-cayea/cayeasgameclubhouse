import type { BGDesign } from './backgammon-sets';
import type { CollectionDice } from './d6-collections';
import { D6_DICE_SETS } from './d6-dice';
import type { EconomyWallet } from './economy-protocol';

export const CARROM_BOARD_SLOT = 'carrom_board';
export const CARROM_PUCK_SLOT = 'carrom_pucks';

const themes = [
  { key: 'ruby', name: 'Ruby Red', surface: '#f3c6b3', shade: '#ba7769', ink: '#792738' },
  { key: 'sapphire', name: 'Sapphire Blue', surface: '#c5e2f3', shade: '#77a2c8', ink: '#203e70' },
  { key: 'emerald', name: 'Emerald Green', surface: '#d4ebc8', shade: '#83ac81', ink: '#225344' },
  { key: 'amethyst', name: 'Amethyst Purple', surface: '#e6d4f2', shade: '#b09bc6', ink: '#523074' },
  { key: 'onyx', name: 'Onyx', surface: '#e3e1dc', shade: '#9696a1', ink: '#363a46' },
  { key: 'sunburst', name: 'Solar Ivory', surface: '#fff0c6', shade: '#d9aa57', ink: '#79521c' },
] as const;

export interface CarromBoardDesign {
  id: string; name: string; price: number; slot: typeof CARROM_BOARD_SLOT;
  frame: string; trim: string; surface: string; shade: string; ink: string; motif?: BGDesign['motif'];
}
export const CLASSIC_CARROM_BOARD: CarromBoardDesign = {
  id: 'carrom-board-classic', name: 'Classic Maple', price: 0, slot: CARROM_BOARD_SLOT,
  frame: '#66321a', trim: '#bd8247', surface: '#f9e7b6', shade: '#cb995a', ink: '#8d473a',
};
export interface CarromPuckDesign {
  id: string; name: string; price: number; slot: typeof CARROM_PUCK_SLOT;
  light: string; white: string; rim: string; dark: string; darkLight: string;
  accent?: string; finish?: CollectionDice; collection?: CollectionDice['collection'] | 'nautical';
}
export const CLASSIC_CARROM_PUCKS: CarromPuckDesign = {
  id: 'carrom-pucks-classic', name: 'Classic Pucks', price: 0, slot: CARROM_PUCK_SLOT,
  light: '#fffef4', white: '#eee2bc', rim: '#a79162', dark: '#292f2d', darkLight: '#646865',
};
const newBoards = [
  ['volcanic','Volcanic Glass','#382732','#904b46','#f0c8b1','#b97f72','#642f33','flame'],
  ['glacier','Glacier Ridge','#23465b','#5f9cb5','#e2f4f6','#99c6d6','#264a69','peak'],
  ['orchid','Orchid House','#4b2f58','#925791','#f2dcf1','#cda1cb','#663567','rose'],
  ['reef','Coral Reef','#1c4c50','#4a928b','#e3f0d8','#9dc6b3','#225c59','shell'],
  ['winter','Winter Lodge','#343852','#6e809d','#e2e7f6','#a8b8d4','#3f4f7f','snow'],
  ['dockside','Dockside Brass','#233a45','#786a51','#f6e1ae','#c6ab75','#4f4e38','anchor'],
  ['autumn','Autumn Orchard','#5e3426','#a56536','#f7d9a2','#d0a16b','#733f28','leaf'],
  ['plume','Kingfisher Plume','#254a56','#417f96','#d1ecdf','#8ebcbb','#295e6c','feather'],
  ['dunes','Dune Mosaic','#5b4335','#a77c50','#f4e2bd','#d1b086','#6c4b37','hourglass'],
  ['obsidian','Obsidian Courtyard','#303047','#66637d','#e8e4ec','#b7afc9','#4e4264','gate'],
] as const;
export const CARROM_BOARDS: CarromBoardDesign[] = [...themes.map<CarromBoardDesign>(theme => {
  const finish = D6_DICE_SETS.find(item => item.id === `farkle-dice-${theme.key}`)!;
  return { ...theme, id: `carrom-board-${theme.key}`, name: `${theme.name} Board`, price: 300,
    slot: CARROM_BOARD_SLOT, frame: finish.edge, trim: finish.face };
}), ...newBoards.map<CarromBoardDesign>(([key,name,frame,trim,surface,shade,ink,motif])=>({
  id: `carrom-board-${key}`, name, price:300, slot:CARROM_BOARD_SLOT, frame, trim, surface, shade, ink, motif,
}))];
function tint(hex: string, target: number, fraction: number) {
  const channels = [1, 3, 5].map(index => {
    const channel = parseInt(hex.slice(index, index + 2), 16);
    return Math.round(channel + (target - channel) * fraction).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

export const CARROM_PUCKS: CarromPuckDesign[] = D6_DICE_SETS.map(die => {
  const key = die.id.slice('farkle-dice-'.length);
  const original = themes.find(theme => theme.key === key);
  const finish = 'collection' in die ? die : undefined;
  return {
    id: `carrom-pucks-${key}`, name: `${original?.name ?? die.name} Pucks`, price: 150, slot: CARROM_PUCK_SLOT,
    light: '#fffdf6', white: original?.surface ?? tint(die.face, 255, .72),
    rim: original?.shade ?? die.edge, dark: original?.ink ?? tint(die.face, 0, .67),
    darkLight: original?.ink ? die.light : tint(die.light, 0, .46), accent: die.pip, finish,
    collection: finish?.collection ?? (key.startsWith('nautical-') ? 'nautical' : undefined),
  };
});

export function equippedCarrom(wallet: Pick<EconomyWallet, 'equipped' | 'owned'> | null) {
  return {
    boardDesign: CARROM_BOARDS.find(item => wallet?.equipped[CARROM_BOARD_SLOT] === item.id && wallet.owned.includes(item.id)) ?? CLASSIC_CARROM_BOARD,
    strikerDesign: CARROM_STRIKERS.find(item => wallet?.equipped[CARROM_STRIKER_SLOT] === item.id && wallet.owned.includes(item.id)) ?? CLASSIC_CARROM_STRIKER,
    puckDesign: CARROM_PUCKS.find(item => wallet?.equipped[CARROM_PUCK_SLOT] === item.id && wallet.owned.includes(item.id)) ?? CLASSIC_CARROM_PUCKS,
  };
}

export const CARROM_STRIKER_SLOT = 'carrom_striker';
export const CLASSIC_CARROM_STRIKER = {
  id: 'carrom-striker-classic', name: 'Classic Jade Striker', price: 0, slot: CARROM_STRIKER_SLOT,
  face: '#55a9a2', light: '#fcf3a7', edge: '#15554e', accent: '#f8dda1', engraving: 'star',
};
const strikerThemes = [
  'ruby', 'sapphire', 'emerald', 'amethyst', 'onyx', 'sunburst',
  'rainbow-rose', 'rainbow-aqua', 'rainbow-spectrum', 'dessert-chocolate', 'dessert-waffle',
  'fruit-apple', 'fruit-orange', 'fabric-silk', 'fabric-denim', 'animal-cat',
  'material-glass', 'material-gold', 'material-marble', 'sport-bowling',
] as const;
export const CARROM_STRIKERS = strikerThemes.map((key, index) => {
  const finish = D6_DICE_SETS.find(item => item.id === `farkle-dice-${key}`)!;
  return { id: `carrom-striker-${key}`, name: `${finish.name.replace('Onyx Skulls', 'Onyx')} Striker`,
    price: 120, slot: CARROM_STRIKER_SLOT, face: finish.face, light: finish.light,
    edge: finish.edge, accent: finish.pip, engraving: ['star', 'diamond', 'rings', 'flower', 'compass'][index % 5]! };
});
export const CARROM_COLLECTIBLES = [...CARROM_BOARDS, ...CARROM_PUCKS, ...CARROM_STRIKERS];
