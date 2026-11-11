import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {EconomyStore} from '../server/economy';
import {DICE_CRATE_DESIGNS} from '../src/lib/dice-crates';
import type {FarkleMatchReward} from '../src/lib/farkle-rewards';
import type {FiveDiceMatchReward} from '../src/lib/five-dice-rewards';
const close:(()=>void)[]=[];afterEach(()=>close.splice(0).forEach(f=>f()));
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',actor={principal:`member:${id}`};
async function setup(backend:'node'|'d1',random=(n:number)=>0,owned:string[]=[],points=0){
 const cloud=backend==='d1'?new TestD1():null,local=cloud?null:new RoomStore(':memory:'),raw=cloud?.sqlite??local!.db;
 if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);}close.push(()=>raw.close());
 const store=new EconomyStore(cloud??nodeSocialBinding(raw),Date.now,random);
 await store.ensureMember(actor,{wallet:{points,owned,equipped:{}},awards:[]});await store.ensureMember({principal:`member:${other}`});
 async function singleWin(game:'five-dice'|'farkle',user=id){const match_id=randomUUID(),payload:FiveDiceMatchReward|FarkleMatchReward={version:1,match_id,mode:'bot',players:[{user_id:user,bot:false,level:null},{user_id:null,bot:true,level:'normal'}],winner:0,scores:game==='farkle'?[10000,9000]:[200,100],completed_at:new Date().toISOString()};
  raw.prepare(`INSERT INTO ${game==='farkle'?'farkle':'five_dice'}_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)`).run(match_id,'A1B2C3D4',JSON.stringify(payload),Date.now());
  if(game==='farkle')await store.claimFarkleReward(payload);else await store.claimFiveDiceReward(payload);
  return {crateId:`${game}:${match_id}`,payload};
 }
 async function win(game:'five-dice'|'farkle',user=id){let result;for(let n=0;n<9;n++)result=await singleWin(game,user);return result!;}
 return {store,raw,win};
}
describe.each(['node','d1'] as const)('shared dice reward crates on %s',backend=>{
 it('awards one crate atomically for each nine verified computer games across either game, without retroactive or duplicate grants',async()=>{
  const{store,win,raw}=await setup(backend);const a=await win('five-dice'),b=await win('farkle');
  await store.syncTrustedRewards(actor);await store.syncTrustedRewards(actor);const data=await store.read(actor);
  expect(data.diceCrates).toMatchObject({unopened:2,totalEarned:2,fragments:{}});expect(data.diceCrates?.available.map(c=>c.id).sort()).toEqual([a.crateId,b.crateId].sort());expect(data.wallet.points).toBe(0);expect(data.wallet.dice_points).toBe(450);
  // Represent a win credited before crates existed. Replaying its trusted evidence cannot mint a new crate.
  raw.prepare("DELETE FROM economy_ledger WHERE user_id=? AND source=?").run(id,`dice-crate-earned:${a.crateId}`);await store.syncTrustedRewards(actor);expect((await store.read(actor)).diceCrates?.totalEarned).toBe(1);
  await expect(store.claimFiveDiceReward({...a.payload,scores:[999,0]})).rejects.toMatchObject({code:'reward_unverified'});
 });
 it('pays 10–75 Cash plus one fragment, shares three-fragment progress and unlocks/equips the full set',async()=>{
  const{store,win}=await setup(backend);let last:any;
  for(const game of ['five-dice','farkle','five-dice'] as const){const{crateId}=await win(game);last=await store.command(actor,{operation:'open_dice_crate',crateId});}
  const design=DICE_CRATE_DESIGNS[0]!;expect(last.receipt.crate).toMatchObject({cash:3,itemId:design.id,fragments:3,unlocked:true,spare:false});expect(last.wallet.points).toBe(9);expect(last.wallet.owned).toContain(design.id);expect(last.diceCrates).toMatchObject({unopened:0,totalEarned:3,fragments:{[design.id]:3}});expect(last.diceCrates.recent[0].crateId).toBe(last.receipt.crate.crateId);
  const equipped=await store.command(actor,{operation:'equip',slot:'d6_dice',itemId:design.id});expect(equipped.wallet.equipped).toMatchObject({d6_dice:design.id,farkle_dice:design.id});
  const next=await win('farkle');const nextOpen=await store.command(actor,{operation:'open_dice_crate',crateId:next.crateId});expect(nextOpen.receipt.crate?.itemId).toBe(DICE_CRATE_DESIGNS[1]!.id);
 });
 it('cannot pay or consume a crate twice, including concurrent/repeated opens and later reloads',async()=>{
  const{store,win,raw}=await setup(backend,n=>n-1);const{crateId}=await win('farkle');const results=await Promise.all([store.command(actor,{operation:'open_dice_crate',crateId}),store.command(actor,{operation:'open_dice_crate',crateId})]);
  expect(results.map(r=>r.receipt.alreadyApplied).sort()).toEqual([false,true]);expect(results[0]!.receipt.crate).toEqual(results[1]!.receipt.crate);expect(results[0]!.receipt.crate?.cash).toBe(20);
  const repeated=await store.command(actor,{operation:'open_dice_crate',crateId});expect(repeated.wallet.points).toBe(20);expect(Object.values(repeated.diceCrates!.fragments)).toEqual([1]);expect(repeated.diceCrates?.unopened).toBe(0);expect(raw.prepare("SELECT count(*) n FROM economy_ledger WHERE user_id=? AND source=?").get(id,`dice-crate-open:${crateId}`)!.n).toBe(1);
 });
 it('rejects unearned crates, other players’ crates, guest opens and forged Cash/fragment selections',async()=>{
  const{store,win}=await setup(backend);const{crateId}=await win('five-dice',other);
  await expect(store.command(actor,{operation:'open_dice_crate',crateId})).rejects.toMatchObject({code:'crate_not_earned'});
  await expect(store.command(actor,{operation:'open_dice_crate',crateId:`farkle:${randomUUID()}`})).rejects.toMatchObject({code:'crate_not_earned'});
  await expect(store.command({principal:'guest:one'},{operation:'open_dice_crate',crateId})).rejects.toMatchObject({status:401});
  await expect(store.command(actor,{operation:'open_dice_crate',crateId,cash:30000,itemId:'farkle-dice-onyx'})).rejects.toMatchObject({status:400});expect((await store.wallet(actor)).points).toBe(0);
 });
 it('merges concurrent different crate openings without losing Cash or fragments',async()=>{
  const{store,win}=await setup(backend);const a=await win('five-dice'),b=await win('farkle');await Promise.all([a,b].map(({crateId})=>store.command(actor,{operation:'open_dice_crate',crateId})));const data=await store.read(actor);expect(data.wallet.points).toBe(6);expect(data.diceCrates).toMatchObject({unopened:0,fragments:{[DICE_CRATE_DESIGNS[0]!.id]:2}});
 });
 it('does not accept imported historical award sources as crate entitlements',async()=>{
  const{store,win,raw}=await setup(backend);const{crateId}=await win('five-dice');raw.prepare("UPDATE economy_ledger SET kind='legacy' WHERE user_id=? AND source=?").run(id,`dice-crate-earned:${crateId}`);expect((await store.read(actor)).diceCrates?.unopened).toBe(0);await expect(store.command(actor,{operation:'open_dice_crate',crateId})).rejects.toMatchObject({code:'crate_not_earned'});
 });
 it('keeps all paid designs eligible, prevents owned duplicates until complete and preserves spare fragments afterward',async()=>{
  const wanted=DICE_CRATE_DESIGNS.find(d=>d.id.includes('material-water'))!;
  const{store,win}=await setup(backend,()=>0,DICE_CRATE_DESIGNS.filter(d=>d.id!==wanted.id).map(d=>d.id));
  for(let n=1;n<=4;n++){const{crateId}=await win('five-dice');const data=await store.command(actor,{operation:'open_dice_crate',crateId});if(n<=3){expect(data.receipt.crate).toMatchObject({itemId:wanted.id,fragments:n,unlocked:n===3,spare:false});}else{expect(data.receipt.crate?.spare).toBe(true);expect(data.receipt.crate?.cash).toBe(3);expect(data.wallet.owned).toHaveLength(DICE_CRATE_DESIGNS.length);}}
 });
 it('rolls back the full opening if a wallet limit prevents the Cash credit',async()=>{
  const{store,win}=await setup(backend,()=>0,[],2000000000);const{crateId}=await win('farkle');await expect(store.command(actor,{operation:'open_dice_crate',crateId})).rejects.toMatchObject({code:'wallet_limit'});const data=await store.read(actor);expect(data.diceCrates).toMatchObject({unopened:1,fragments:{},recent:[]});
 });
});
