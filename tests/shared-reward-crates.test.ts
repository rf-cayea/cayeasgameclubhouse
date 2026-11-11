import {afterEach,describe,it,expect} from 'vitest';
import {TestD1} from './helpers/d1';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {EconomyStore} from '../server/economy';
import {REWARD_CRATE_POOLS} from '../src/lib/reward-crates';
import {verifiedCrateWin} from './helpers/reward-crate-fixture';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',actor={principal:`member:${id}`};
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()));
async function setup(backend:'node'|'d1',random=(n:number)=>0,owned:string[]=[]){
 const db=backend==='d1'?new TestD1():null,local=db?null:new RoomStore(':memory:'),raw=db?.sqlite??local!.db;
 if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);}cleanup.push(()=>raw.close());
 const store=new EconomyStore(db??nodeSocialBinding(raw),Date.now,random);await store.ensureMember(actor,{wallet:{points:0,owned,equipped:{}},awards:[]});await store.ensureMember({principal:`member:${other}`});
 return{store,raw,win:async(game:'dominoes'|'rummy'|'spades',user=id,teams?:string[])=>{let id='';for(let n=0;n<(teams?6:9);n++)id=await verifiedCrateWin(store,raw,game,user,teams);return id;}};
}
describe.each(['node','d1'] as const)('domino and shared card crates on %s',backend=>{
 it.each(['dominoes','cards'] as const)('unlocks three fragments in %s, credits Cash and preserves existing Dice crates',async collection=>{
  const{store,win}=await setup(backend);const games=collection==='cards'?['rummy','spades','rummy'] as const:['dominoes','dominoes','dominoes'] as const;
  for(let n=0;n<3;n++){const crateId=await win(games[n]!);const data=await store.command(actor,{operation:'open_reward_crate',collection,crateId});expect(data.receipt.crate).toMatchObject({cash:3,itemId:REWARD_CRATE_POOLS[collection][0]!.id,fragments:n+1,unlocked:n===2});expect(data.wallet.points).toBe((n+1)*3);}
  const data=await store.read(actor),itemId=REWARD_CRATE_POOLS[collection][0]!.id;expect(data.wallet.owned).toContain(itemId);expect(data.rewardCrates?.[collection]).toMatchObject({unopened:0,totalEarned:3,fragments:{[itemId]:3}});expect(data.diceCrates?.totalEarned).toBe(0);
  const equipped=await store.command(actor,{operation:'equip',itemId,slot:collection==='cards'?'spades_deck':'domino_skin'});expect(Object.values(equipped.wallet.equipped)).toContain(itemId);
  const next=await win(games[0]);expect((await store.command(actor,{operation:'open_reward_crate',collection,crateId:next})).receipt.crate?.itemId).toBe(REWARD_CRATE_POOLS[collection][1]!.id);
 });
 it('grants Spades team crates to each winner once, never losers or replayed wins',async()=>{
  const{store,win,raw}=await setup(backend);const loser='33333333-3333-4333-8333-333333333333',fourth='44444444-4444-4444-8444-444444444444';await store.ensureMember({principal:`member:${loser}`});await store.ensureMember({principal:`member:${fourth}`});
  const crateId=await win('spades',id,[id,loser,other,fourth]);await store.syncTrustedRewards(actor);expect((await store.read(actor)).rewardCrates?.cards.unopened).toBe(1);expect((await store.read({principal:`member:${other}`})).rewardCrates?.cards.unopened).toBe(1);expect((await store.read({principal:`member:${loser}`})).rewardCrates?.cards.unopened).toBe(0);
  raw.prepare("DELETE FROM economy_ledger WHERE user_id=? AND source=?").run(id,`card-crate-earned:${crateId}`);await store.syncTrustedRewards(actor);expect((await store.read(actor)).rewardCrates?.cards.totalEarned).toBe(0);
 });
 it('rejects forged categories, amounts and other members; repeated concurrent opens pay once',async()=>{
  const{store,win}=await setup(backend,n=>n-1),crateId=await win('dominoes');
  for(const collection of ['cards','dice','__proto__'])await expect(store.command(actor,{operation:'open_reward_crate',collection,crateId})).rejects.toMatchObject({status:400});
  await expect(store.command(actor,{operation:'open_reward_crate',collection:'dominoes',crateId,cash:999})).rejects.toMatchObject({status:400});await expect(store.command({principal:`member:${other}`},{operation:'open_reward_crate',collection:'dominoes',crateId})).rejects.toMatchObject({code:'crate_not_earned'});
  const results=await Promise.all([1,2].map(()=>store.command(actor,{operation:'open_reward_crate',collection:'dominoes',crateId})));expect(results.map(r=>r.receipt.alreadyApplied).sort()).toEqual([false,true]);const data=await store.read(actor);expect(data.wallet.points).toBe(20);expect(data.rewardCrates?.dominoes.unopened).toBe(0);expect(Object.values(data.rewardCrates!.dominoes.fragments)).toEqual([1]);
 });
 it('includes all matching domino designs and all shared decks, honors purchases, and keeps spare fragments',async()=>{
  const wanted=REWARD_CRATE_POOLS.dominoes.find(d=>d.id.endsWith('material-water'))!;expect(wanted).toBeDefined();expect(REWARD_CRATE_POOLS.dominoes).toHaveLength(66);expect(REWARD_CRATE_POOLS.cards).toHaveLength(12);
  const{store,win}=await setup(backend,()=>0,REWARD_CRATE_POOLS.dominoes.filter(d=>d.id!==wanted.id).map(d=>d.id));
  for(let n=1;n<=4;n++){const crateId=await win('dominoes'),data=await store.command(actor,{operation:'open_reward_crate',collection:'dominoes',crateId});if(n<=3)expect(data.receipt.crate).toMatchObject({itemId:wanted.id,fragments:n,unlocked:n===3});else expect(data.receipt.crate?.spare).toBe(true);}
 });
});
