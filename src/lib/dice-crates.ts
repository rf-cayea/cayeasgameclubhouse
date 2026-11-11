import { D6_DICE_SETS } from './d6-dice';
export const DICE_FRAGMENTS_REQUIRED = 3;
export const CRATE_POLICY={human:{wins:6,min:28,max:65},bot:{wins:9,min:3,max:20}} as const;
export const DICE_CRATE_CASH={min:3,max:65} as const;
export const DICE_CRATE_DESIGNS = D6_DICE_SETS;
export type DiceCrateGame = 'carrom' | 'backgammon' | 'five-dice' | 'farkle' | 'dominoes' | 'rummy' | 'spades';
export interface DiceCrateReward {
  crateId:string; channel?:'human'|'bot'; cash:number; itemId:string; fragments:number; unlocked:boolean; spare:boolean;
}
export interface DiceCrateView {
  unopened:number; totalEarned:number; progress?:{humanWins:number;computerWins:number};
  available:{id:string;game:DiceCrateGame;earnedAt:number}[];
  fragments:Record<string,number>;
  recent:DiceCrateReward[];
}
