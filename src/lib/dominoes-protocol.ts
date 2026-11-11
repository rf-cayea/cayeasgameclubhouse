import type { ComputerPlayback } from './computer-turns';
import type { Level } from './rummy';
import type { RewardView } from './rummy-rewards';
import type { DominoActivity, DominoId, DominoMove, DominoOption, DominoResult, DominoVariant, PlacedDomino } from './dominoes';
export interface DominoOptions {mode:'bot'|'online';variant:DominoVariant;level:Level;target:100|150|200}
export interface DominoRoomView {
  playback?:ComputerPlayback<DominoRoomView>;
  code:string;revision:number;owner:boolean;status:'waiting'|'playing'|'finished'|'abandoned';options:DominoOptions;mySeat:number;
  players:{id:string;name:string;bot:boolean;ready:boolean;you:boolean;occupied:boolean;count:number;score:number}[];
  hand:DominoId[];board:PlacedDomino[];stockCount:number;turn:number;round:number;phase:'play'|'roundOver'|'finished'|null;
  scores:number[];legal:DominoOption[];canDraw:boolean;canPass:boolean;forcedOpening:DominoId|null;
  activity:DominoActivity[];result:DominoResult|null;winner:number|null;revealedHands:DominoId[][]|null;reward:RewardView;
}
export type DominoCommand = {operation:'create';requestId:string;name:string;options:DominoOptions}
 |{operation:'join';requestId:string;code:string;name:string}
 |{operation:'ready';requestId:string;code:string;ready:boolean}
 |{operation:'start';requestId:string;code:string;revision:number}
 |{operation:'move';requestId:string;code:string;revision:number;move:DominoMove}
 |{operation:'leave';requestId:string;code:string};
