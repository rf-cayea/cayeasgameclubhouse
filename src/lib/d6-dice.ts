import { COLLECTION_D6_DICE } from './d6-collections';
import { NAUTICAL_FINISHES } from './nautical-sets';
import type { EconomyWallet } from './economy-protocol';
export const D6_DICE_SLOT = 'd6_dice';
export const CLASSIC_D6_DICE = { id: 'farkle-dice-classic', name: 'Classic Ivory', price: 0, face: '#fff9e9', light: '#ffffff', edge: '#d6c7a3', pip: '#20372f', symbol: 'dot' } as const;
export const D6_DICE_SETS = [
  { id: 'farkle-dice-ruby', name: 'Ruby Red', price: 150, face: '#9f1634', light: '#ee6076', edge: '#651026', pip: '#fff9eb', symbol: 'dot' },
  { id: 'farkle-dice-sapphire', name: 'Sapphire Blue', price: 150, face: '#1745a0', light: '#659aef', edge: '#102d67', pip: '#fff9eb', symbol: 'dot' },
  { id: 'farkle-dice-emerald', name: 'Emerald Green', price: 150, face: '#126b50', light: '#56be91', edge: '#124736', pip: '#fff9eb', symbol: 'dot' },
  { id: 'farkle-dice-amethyst', name: 'Amethyst Purple', price: 150, face: '#69369d', light: '#b486dc', edge: '#432166', pip: '#fff9eb', symbol: 'dot' },
  { id: 'farkle-dice-onyx', name: 'Onyx Skulls', price: 250, face: '#101218', light: '#555e6b', edge: '#747c88', pip: '#fffaf0', symbol: 'skull' },
  { id: 'farkle-dice-sunburst', name: 'Solar Ivory', price: 250, face: '#fffdf5', light: '#ffffff', edge: '#c9a35a', pip: '#a36d12', symbol: 'sun' },
  ...COLLECTION_D6_DICE,
  ...NAUTICAL_FINISHES.map(({key,...design})=>({...design,id:`farkle-dice-nautical-${key}`})),
] as const;
export type D6DiceDesign = typeof CLASSIC_D6_DICE | typeof D6_DICE_SETS[number];
export function equippedD6Dice(wallet: Pick<EconomyWallet, 'owned' | 'equipped'> | null): D6DiceDesign {
  return D6_DICE_SETS.find(item => item.id === (wallet?.equipped[D6_DICE_SLOT] ?? wallet?.equipped.farkle_dice) && wallet?.owned.includes(item.id)) ?? CLASSIC_D6_DICE;
}
