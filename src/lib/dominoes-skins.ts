import type { D6Collection } from './d6-collections';
import type { EconomyWallet } from './economy-protocol';
import { FARKLE_DICE_SETS } from './farkle-dice';
export const DOMINO_SKIN_SLOT='domino_skin';
export const DOMINO_GUEST_SKIN_KEY='clubhouse-domino-included-skin';
export const DOMINO_SKIN_CHANGED='clubhouse-domino-skin-changed';
export interface DominoSkin {id:string;name:string;price:number;face:string;light:string;edge:string;pip:string;symbol:'dot'|'skull'|'sun'|'number'|'seahorse'|'starfish'|'clownfish'|'trident';shade?:string;collection?:D6Collection;motif?:string;accent?:string;description?:string}
export const CLASSIC_DOMINO_SKIN:DominoSkin={id:'domino-skin-classic',name:'Clubhouse Standard · Ivory',price:0,face:'#f2e5c4',light:'#fffdf3',edge:'#8e7649',shade:'#d2bb88',pip:'#173c31',symbol:'dot'};
export const NUMBERED_DOMINO_SKIN:DominoSkin={...CLASSIC_DOMINO_SKIN,id:'domino-skin-numbers',name:'Clubhouse Standard · Color Numbers',symbol:'number'};
export const DOMINO_INCLUDED_SKINS=[CLASSIC_DOMINO_SKIN,NUMBERED_DOMINO_SKIN];
export const DOMINO_SKINS:DominoSkin[]=FARKLE_DICE_SETS.map(design=>({...design,id:design.id.replace('farkle-dice-','domino-skin-')}));
/** The familiar red, green, blue, orange, purple and teal numeral palette. */
export const DOMINO_NUMBER_COLORS=['#354348','#c1273a','#12703b','#1e54b4','#b45604','#713b9b','#007b81'];
export function equippedDominoSkin(wallet:Pick<EconomyWallet,'owned'|'equipped'>|null):DominoSkin {
 const selected=wallet?.equipped[DOMINO_SKIN_SLOT];
 return DOMINO_INCLUDED_SKINS.find(skin=>skin.id===selected)??DOMINO_SKINS.find(skin=>skin.id===selected&&wallet?.owned.includes(skin.id))??CLASSIC_DOMINO_SKIN;
}
