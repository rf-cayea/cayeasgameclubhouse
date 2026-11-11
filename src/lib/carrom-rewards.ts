import {bgRewardTier} from './backgammon-rewards';
import type {BGMatchReward,BGReceipt} from './backgammon-rewards';
export type CarromMatchReward=Omit<BGMatchReward,'target'>&{variant:'carrom'|'disc-pool';queenCovered:boolean};
export type CarromReceipt=BGReceipt;
export const carromRewardTier=bgRewardTier;
export function carromWinner(r:CarromMatchReward):string|null{if(!r||r.version!==1||typeof r.match_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(r.match_id)||!carromRewardTier(r.mode,r.players)||![0,1].includes(r.winner)||!['carrom','disc-pool'].includes(r.variant)||typeof r.queenCovered!=='boolean'||r.variant==='carrom'&&!r.queenCovered||!Array.isArray(r.scores)||r.scores.length!==2||r.scores.some(n=>!Number.isSafeInteger(n)||n<0||n>9)||r.scores[r.winner]!==9||r.scores[1-r.winner]!>=9)return null;return r.players[r.winner]!.bot?null:r.players[r.winner]!.user_id;}
