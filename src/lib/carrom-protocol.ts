import type {Level} from './rummy';
import type {CarromShot,CarromState,CarromVariant} from './carrom';
import type {RewardView} from './rummy-rewards';
export interface CarromOptions{mode:'bot'|'online';seats:2;level:Level;variant:CarromVariant}
export interface CarromRoomView{code:string;revision:number;owner:boolean;status:'waiting'|'playing'|'finished'|'abandoned';options:CarromOptions;mySeat:number;players:{id:string;name:string;bot:boolean;ready:boolean;you:boolean;occupied:boolean}[];state:CarromState|null;reward:RewardView;shotReadyAt:number;serverTime:number}
export type CarromCommand={operation:'create';requestId:string;name:string;options:CarromOptions}|{operation:'join';requestId:string;code:string;name:string}|{operation:'ready';requestId:string;code:string;ready:boolean}|{operation:'start'|'tick';requestId:string;code:string;revision:number}|{operation:'shot';requestId:string;code:string;revision:number;shot:CarromShot}|{operation:'leave';requestId:string;code:string};
