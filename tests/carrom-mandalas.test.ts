import {afterEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {EconomyStore} from '../server/economy';
import {CARROM_MANDALAS,CARROM_MANDALA_BUNDLES} from '../src/lib/carrom-mandalas';
import {CARROM_COLLECTIBLES,equippedCarrom} from '../src/lib/carrom-sets';
import {REWARD_CRATE_POOLS} from '../src/lib/reward-crates';
import {ECONOMY_CATALOG} from '../src/lib/economy-protocol';
const id='11111111-1111-4111-8111-111111111111',actor={principal:`member:${id}`};
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(close=>close()));
async function setup(backend:'node'|'d1',owned:string[]=[],random=(n:number)=>0){
 const cloud=backend==='d1'?new TestD1():null,local=cloud?null:new RoomStore(':memory:'),raw=cloud?.sqlite??local!.db;
 if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);}cleanup.push(()=>raw.close());
 const store=new EconomyStore(cloud??nodeSocialBinding(raw),Date.now,random);
 await store.ensureMember(actor,{wallet:{points:10000,owned,equipped:{}},awards:[]});
 raw.prepare('UPDATE economy_wallets SET dice_points=10000 WHERE user_id=?').run(id);
 return{store,raw};
}
const item=(id:string)=>ECONOMY_CATALOG.find(item=>item.id===id)!;
describe('original Carrom mandala collections',()=>{
 it('contains six unique three-piece themes, independent slots and discounted bundles',()=>{
  expect(CARROM_MANDALAS).toHaveLength(6);
  expect(new Set(CARROM_MANDALAS.map(theme=>theme.art)).size).toBe(6);
  const pieces=CARROM_COLLECTIBLES.filter(piece=>piece.mandala!==undefined);
  expect(pieces).toHaveLength(18);
  expect(new Set(pieces.map(piece=>piece.id)).size).toBe(18);
  for(const bundle of CARROM_MANDALA_BUNDLES){
   expect(bundle.items).toHaveLength(bundle.id.includes('complete')?18:3);
   expect(item(bundle.id).slot).toBeNull();
   expect(item(bundle.id).price).toBeLessThan(bundle.items.reduce((sum,id)=>sum+item(id).price,0));
   expect(item(bundle.id).cashPrice).toBeLessThan(bundle.items.reduce((sum,id)=>sum+item(id).cashPrice,0));
   expect(REWARD_CRATE_POOLS.carrom.some(piece=>piece.id===bundle.id)).toBe(false);
   for(const id of bundle.items){expect(REWARD_CRATE_POOLS.carrom.some(piece=>piece.id===id)).toBe(true);}
  }
 });
});
describe.each(['node','d1'] as const)('Carrom mandala economy on %s',backend=>{
 it.each(['game','cash'] as const)('buys a matching trio with %s, equips all parts independently, and never charges twice',async payment=>{
  const{store}=await setup(backend),bundle=CARROM_MANDALA_BUNDLES[0]!,currency=payment==='cash'?'points':'dice_points';
  const purchase={operation:'purchase',itemId:bundle.id,payment};
  const result=await store.command(actor,purchase);
  expect(result.wallet[currency]).toBe(10000-(payment==='cash'?item(bundle.id).cashPrice:item(bundle.id).price));
  expect(result.wallet.owned).toEqual(expect.arrayContaining([bundle.id,...bundle.items]));
  for(const id of bundle.items)await store.command(actor,{operation:'equip',itemId:id,slot:item(id).slot});
  const equipped=equippedCarrom(await store.wallet(actor));
  expect([equipped.boardDesign.id,equipped.puckDesign.id,equipped.strikerDesign.id]).toEqual(bundle.items);
  const repeated=await store.command(actor,purchase);
  expect(repeated.receipt.alreadyApplied).toBe(true);
  expect(repeated.wallet[currency]).toBe(result.wallet[currency]);
 });
 it('unlocks all six themes in the complete bundle and recognizes separately collected pieces',async()=>{
  const{store}=await setup(backend),all=CARROM_MANDALA_BUNDLES.at(-1)!;
  const result=await store.command(actor,{operation:'purchase',itemId:all.id});
  expect(result.wallet.owned).toEqual(expect.arrayContaining(all.items));
  const before=result.wallet.dice_points;
  const trio=await store.command(actor,{operation:'purchase',itemId:CARROM_MANDALA_BUNDLES[1]!.id});
  expect(trio.receipt.alreadyApplied).toBe(true);
  expect(trio.wallet.dice_points).toBe(before);
 });
 it('keeps all 18 individual pieces purchasable and rejects mismatched equip slots',async()=>{
  const{store}=await setup(backend);
  for(const design of CARROM_COLLECTIBLES.filter(piece=>piece.mandala!==undefined)){
   const result=await store.command(actor,{operation:'purchase',itemId:design.id,payment:'cash'});
   expect(result.wallet.owned).toContain(design.id);
   await store.command(actor,{operation:'equip',itemId:design.id,slot:design.slot});
  }
  await expect(store.command(actor,{operation:'equip',itemId:'carrom-striker-mandala-lotus',slot:'carrom_board'})).rejects.toMatchObject({status:400});
 });
 it.each(['board','pucks','striker'])('opens a %s fragment from a real Carrom crate and completes it with two store fragments',async part=>{
  const target=`carrom-${part}-mandala-tide`,owned=CARROM_COLLECTIBLES.filter(piece=>piece.id!==target).map(piece=>piece.id);
  const{store,raw}=await setup(backend,owned),crateId=`carrom:${randomUUID()}`;
  raw.prepare("INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,'reward','points',0,0,'Earned crate',?,?)").run(randomUUID(),id,`carrom-crate-earned:${crateId}`,JSON.stringify({game:'carrom',channel:'human'}),Date.now());
  const open=await store.command(actor,{operation:'open_reward_crate',collection:'carrom',crateId});
  expect(open.receipt.crate).toMatchObject({itemId:target,fragments:1,cash:28,unlocked:false});
  for(let i=0;i<2;i++)await store.command(actor,{operation:'buy_fragments',itemId:target,count:1,payment:'game',requestId:randomUUID()});
  const data=await store.read(actor);
  expect(data.wallet.owned).toContain(target);
  expect(data.rewardCrates?.carrom.fragments[target]).toBe(3);
  await store.command(actor,{operation:'equip',itemId:target,slot:item(target).slot});
  await expect(store.command(actor,{operation:'buy_fragments',itemId:target,count:1,payment:'cash',requestId:randomUUID()})).rejects.toMatchObject({status:409});
 });
});
