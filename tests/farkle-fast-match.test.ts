import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {RoomStore,type Identity} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeFarkleNode} from '../server/farkle-node';
import {initializeMatchmakingNode} from '../server/matchmaking-node';
import {EconomyStore} from '../server/economy';
import {FarkleRoomStore} from '../server/farkle-rooms';
import {MatchmakingStore} from '../server/matchmaking';
import {farkleWinner,type FarkleMatchReward} from '../src/lib/farkle-rewards';
import {FARKLE_PARTY} from '../src/lib/farkle';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()));
const member=(n=0,owned:string[]=[]):Identity=>({principal:`member:${n+1}1111111-1111-4111-8111-111111111111`,jokers:false,owned});
const guest:Identity={principal:'guest:fast-test',jokers:false},options={mode:'online',seats:2,level:'normal',target:5000};
const send=(store:FarkleRoomStore,actor:Identity,input:Record<string,unknown>)=>store.command(actor,{...input,requestId:randomUUID()});
async function setup(backend:'node'|'d1'){
 const cloud=backend==='d1'?new TestD1():null,local=cloud?null:new RoomStore(':memory:'),raw=cloud?.sqlite??local!.db;
 if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);initializeFarkleNode(raw);initializeMatchmakingNode(raw);}cleanup.push(()=>raw.close());
 const binding=cloud??nodeSocialBinding(raw),store=new FarkleRoomStore(binding,Date.now,()=>.25),economy=new EconomyStore(binding),discovery=new MatchmakingStore(binding);
 const init=async(actor:Identity)=>economy.ensureMember(actor,{wallet:{dice_points:1200,points:1000,owned:[...actor.owned??[]],equipped:{}},awards:[]});
 return{store,economy,discovery,raw,init};
}
describe.each(['node','d1'] as const)('Fast Farkle and Party on %s',backend=>{
 it.each(['easy','normal','hard'] as const)('starts a 5,000-point %s computer match without requiring Party',async level=>{
  const{store}=await setup(backend);const room=(await send(store,guest,{operation:'create',name:'Player',options:{...options,mode:'bot',level}})).view;expect(room.state?.target).toBe(5000);expect(room.state?.players[1]).toMatchObject({bot:true,level});expect(room.options.target).toBe(5000);
 });
 it('defaults old options to 10,000 and rejects unsupported target values',async()=>{
  const{store}=await setup(backend),old={mode:'bot',seats:2,level:'normal'};expect((await send(store,guest,{operation:'create',name:'Player',options:old})).view.state?.target).toBe(10000);
  for(const target of [0,1000,5001,20000,'5000',null])await expect(send(store,guest,{operation:'create',name:'Player',options:{...old,target}})).rejects.toMatchObject({status:400});
 });
 it('finishes Fast Match on the winning bank and awards trusted points and crate progress once',async()=>{
  const{store,economy,raw,init}=await setup(backend),host=member(),peer=member(1);await init(host);await init(peer);
  let room=(await send(store,host,{operation:'create',name:'Host',options})).view;await send(store,peer,{operation:'join',code:room.code,name:'Peer'});await send(store,peer,{operation:'ready',code:room.code,ready:true});room=await store.get(room.code,host.principal);room=(await send(store,host,{operation:'start',code:room.code,revision:room.revision})).view;
  function seed(points:number,scores?:number[]){const row=JSON.parse(raw.prepare('SELECT data FROM farkle_rooms WHERE code=?').get(room.code)!.data as string);row.state.turnPoints=points;row.state.rolls=1;if(scores)row.state.scores=scores;raw.prepare('UPDATE farkle_rooms SET data=? WHERE code=?').run(JSON.stringify(row),room.code);}
  seed(300,[4950,0]);room=(await send(store,host,{operation:'move',code:room.code,revision:room.revision,move:{t:'bank'}})).view;expect(room.status).toBe('finished');expect(room.state).toMatchObject({target:5000,scores:[5250,0],winners:[0],finalTurns:[],turn:0});
  await expect(send(store,peer,{operation:'move',code:room.code,revision:room.revision,move:{t:'roll'}})).rejects.toMatchObject({code:'table_closed'});
  const evidence=JSON.parse(raw.prepare('SELECT payload FROM farkle_rewards').get()!.payload as string) as FarkleMatchReward;expect(evidence.target).toBe(5000);expect(farkleWinner(evidence)).toBe(host.principal.slice(7));expect(farkleWinner({...evidence,target:10000})).toBeNull();
  await economy.syncTrustedRewards(host);await economy.syncTrustedRewards(host);const data=await economy.read(host);expect(data.wallet.dice_points).toBe(1250);expect(data.diceCrates?.totalEarned).toBe(0);expect(data.diceCrates?.progress?.humanWins).toBe(1);expect(data.stats.farkleWins).toBe(1);await expect(economy.claimFarkleReward({...evidence,target:10000})).rejects.toMatchObject({code:'reward_unverified'});
 });
 it.each([3,4])('requires durable Party ownership to host and join %i-player tables, including public matchmaking',async seats=>{
  const{store,economy,discovery,init}=await setup(backend),host=member(0,['farkle-party']),peer=member(1),claimed=member(2,['farkle-party']),quintsee=member(3,['five-dice-party']);for(const p of [host,peer,quintsee])await init(p);await init(member(2));
  for(const p of [guest,peer,claimed,quintsee])await expect(send(store,p,{operation:'create',name:'Player',options:{...options,seats}})).rejects.toMatchObject({code:'farkle_party_locked'});
  const room=(await send(store,host,{operation:'create',name:'Host',options:{...options,seats}})).view;await discovery.command('farkle',host,{operation:'publish',code:room.code},async()=>null);
  expect((await discovery.list('farkle',peer)).rooms[0]).toMatchObject({locked:true,requirement:'Farkle Party unlock',target:5000,details:'Six dice · 5,000 target · 300 to enter'});
  await expect(send(store,peer,{operation:'join',code:room.code,name:'Peer'})).rejects.toMatchObject({code:'farkle_party_locked'});await expect(discovery.command('farkle',peer,{operation:'join',code:room.code,name:'Peer'},c=>store.command(peer,c))).rejects.toMatchObject({code:'match_unlock_required'});
  const purchase=await economy.command(peer,{operation:'purchase',itemId:FARKLE_PARTY.id});expect(purchase.wallet.dice_points).toBe(450);expect((await economy.command(peer,{operation:'purchase',itemId:FARKLE_PARTY.id})).receipt.alreadyApplied).toBe(true);const fresh={...peer,owned:purchase.wallet.owned};expect((await send(store,fresh,{operation:'join',code:room.code,name:'Peer'})).view.mySeat).toBe(1);
 });
 it('rechecks every seat at start, rechecks streams after revocation, and always allows leaving',async()=>{
  const{store,raw,init}=await setup(backend),people=[0,1,2].map(n=>member(n,['farkle-party']));for(const p of people)await init(p);let room=(await send(store,people[0]!,{operation:'create',name:'Host',options:{...options,seats:3}})).view;
  for(const p of people.slice(1)){await send(store,p,{operation:'join',code:room.code,name:'Peer'});await send(store,p,{operation:'ready',code:room.code,ready:true});}room=await store.get(room.code,people[0]!.principal);raw.prepare('UPDATE economy_wallets SET owned=? WHERE user_id=?').run('[]',people[1]!.principal.slice(7));
  await expect(send(store,people[0]!,{operation:'start',code:room.code,revision:room.revision})).rejects.toMatchObject({code:'farkle_party_locked'});await expect(store.get(room.code,people[1]!.principal,people[1]!.owned)).rejects.toMatchObject({code:'farkle_party_locked'});expect((await send(store,people[1]!,{operation:'leave',code:room.code})).view.status).toBe('abandoned');
 });
 it('sells the permanent unlock for 578 Cash while preserving the separate Quintsee unlock',async()=>{
  const{economy,init}=await setup(backend),p=member(0,['five-dice-party']);await init(p);const result=await economy.command(p,{operation:'purchase',itemId:FARKLE_PARTY.id,payment:'cash'});expect(result.receipt).toMatchObject({amount:578,currency:'points'});expect(result.wallet).toMatchObject({points:422,dice_points:1200,owned:expect.arrayContaining(['farkle-party','five-dice-party'])});
 });
});
