import {CARROM_COLLECTIBLES,CARROM_BOARD_SLOT} from './carrom-sets';
import {BG_COLLECTIBLES} from './backgammon-sets';
import {D6_DICE_SETS} from './d6-dice';
import {DOMINO_SKINS} from './dominoes-skins';
import {SHARED_DECKS} from './playing-decks';
export type RewardCrateCollection='dice'|'dominoes'|'cards'|'backgammon'|'carrom';
export const REWARD_CRATE_POOLS={backgammon:BG_COLLECTIBLES,dice:D6_DICE_SETS,dominoes:DOMINO_SKINS,cards:SHARED_DECKS,carrom:CARROM_COLLECTIBLES};
export const REWARD_CRATE_META={
 carrom:{name:'Carrom',games:'Carrom + Disc Pool',item:'board, puck set or striker',included:'Classic Maple, Pucks and Jade Striker',slot:CARROM_BOARD_SLOT,earned:'carrom-crate-earned:',opened:'carrom-crate-open:'},
 backgammon:{name:'Backgammon',games:'Backgammon + Nackgammon',item:'board or checker set',included:'Clubhouse Walnut and Classic Brass & Ivory',slot:'bg_board',earned:'backgammon-crate-earned:',opened:'backgammon-crate-open:'},
 dice:{name:'Dice',games:'Quintsee + Farkle',item:'D6 set',included:'Classic Ivory',slot:'d6_dice',earned:'dice-crate-earned:',opened:'dice-crate-open:'},
 dominoes:{name:'Dominoes',games:'Draw, Block + Muggins',item:'domino set',included:'Ivory dots and colored numbers',slot:'domino_skin',earned:'domino-crate-earned:',opened:'domino-crate-open:'},
 cards:{name:'Card-deck',games:'Rummy+ + Spades',item:'card deck',included:'Starter card decks',slot:'spades_deck',earned:'card-crate-earned:',opened:'card-crate-open:'},
} as const;
export function crateCollectionForGame(game:string):RewardCrateCollection|undefined {return game==='carrom'?'carrom':game==='backgammon'?'backgammon':game==='five-dice'||game==='farkle'?'dice':game==='dominoes'?'dominoes':game==='rummy'||game==='spades'?'cards':undefined;}
