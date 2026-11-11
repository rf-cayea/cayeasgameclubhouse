import type {Level} from './rummy';
import type {BGMove,BGState} from './backgammon';
import type {RewardView} from './rummy-rewards';
export interface BGOptions{mode:'bot'|'online';seats:2;level:Level;target:1|3|5|7|9;crawford:boolean;variant:'standard'|'nackgammon'}
export interface BGRoomView{code:string;revision:number;owner:boolean;status:'waiting'|'playing'|'finished'|'abandoned';options:BGOptions;mySeat:number;players:{id:string;name:string;bot:boolean;ready:boolean;you:boolean;occupied:boolean}[];state:BGState|null;reward:RewardView}
export type BGCommand={operation:'create';requestId:string;name:string;options:BGOptions}|{operation:'join';requestId:string;code:string;name:string}|{operation:'ready';requestId:string;code:string;ready:boolean}|{operation:'start';requestId:string;code:string;revision:number}|{operation:'tick';requestId:string;code:string;revision:number}|{operation:'move';requestId:string;code:string;revision:number;move:BGMove}|{operation:'leave';requestId:string;code:string};
