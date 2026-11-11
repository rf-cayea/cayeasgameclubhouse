import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {EconomyStore} from '../../server/economy';
import type {DominoMatchReward} from '../../src/lib/dominoes-rewards';
import type {MatchReward} from '../../src/lib/rummy-rewards';
import type {SpadesMatchReward} from '../../src/lib/spades-rewards';
export async function verifiedCrateWin(store:EconomyStore,raw:DatabaseSync,game:'dominoes'|'rummy'|'spades',user:string,teams?:string[]){
 const match_id=randomUUID(),completed_at=new Date().toISOString(),players=[{user_id:user,bot:false,level:null},{user_id:null,bot:true,level:'normal' as const}];
 if(game==='dominoes'){
  const payload:DominoMatchReward={version:1,match_id,completed_at,mode:'bot',players,variant:'draw',winner:0,scores:[100,20]};
  raw.prepare('INSERT INTO domino_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)').run(match_id,'ABC123DE',JSON.stringify(payload),Date.now());await store.claimDominoReward(payload);
 }else if(game==='rummy'){
  const payload:MatchReward={version:1,match_id,completed_at,variant:'classic',mode:'bot',winner_index:0,participants:players.map((p,i)=>({...p,score:i===0?100:20}))};
  raw.prepare('INSERT INTO reward_outbox(match_id,room_code,user_id,payload) VALUES(?,?,?,?)').run(match_id,'ABC123DE',user,JSON.stringify(payload));await store.claimRummyReward(payload);
 }else{
  const payload:SpadesMatchReward={version:1,match_id,completed_at,mode:teams?'online':'bot',variant:teams?'teams':'solo',target:100,winner:0,scores:teams?[200,100]:[200,100,80,70],players:teams?teams.map(user_id=>({user_id,bot:false,level:null})):[players[0]!,...Array.from({length:3},()=>players[1]!)]};
  raw.prepare('INSERT INTO spades_rewards(match_id,room_code,payload) VALUES(?,?,?)').run(match_id,'ABC123DE',JSON.stringify(payload));await store.claimSpadesReward(payload);
 }
 return `${game}:${match_id}`;
}
