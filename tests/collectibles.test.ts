import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {EconomyStore} from '../server/economy';
import {CollectiblesStore} from '../server/collectibles';
import {SEASON_CARDS,BOOSTER_PRICES,achievementCardBonus,type AlbumState} from '../src/lib/collectibles';
import {verifiedCrateWin} from './helpers/reward-crate-fixture';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const a={principal:`member:${ids[0]}`},b={principal:`member:${ids[1]}`},c={principal:`member:${ids[2]}`};
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()));
async function setup(backend:'node'|'d1',random=(n:number)=>0){const cloud=backend==='d1'?new TestD1():null,local=cloud?null:new RoomStore(':memory:'),raw=cloud?.sqlite??local!.db;if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);}cleanup.push(()=>raw.close());const binding=cloud??nodeSocialBinding(raw),economy=new EconomyStore(binding,Date.now,random),store=new CollectiblesStore(binding,Date.now,random);for(const [i,actor]of[a,b,c].entries()){await economy.ensureMember(actor,{wallet:{points:2000,owned:[],equipped:{}},awards:[]});raw.prepare('INSERT INTO social_profiles(user_id,gamer_name,name_key,created_at,updated_at) VALUES(?,?,?,?,?)').run(ids[i]!,`Tester${i}`,`tester${i}`,1,1);await store.read(actor);}function seed(index:number,cards:Record<string,number>){const row=raw.prepare('SELECT data FROM collectible_albums WHERE user_id=?').get(ids[index]!)!;const data=JSON.parse(String(row.data))as AlbumState;data.cards=cards;raw.prepare('UPDATE collectible_albums SET data=?,revision=revision+1 WHERE user_id=?').run(JSON.stringify(data),ids[index]!);}return{store,economy,raw,binding,seed};}
const offer=(give='hh-01',want?:string)=>({operation:'offer_trade',recipient:'@Tester1',give,want,requestId:randomUUID()});
describe('season catalog',()=>{it('has exactly 100 distinct illustrations with the agreed seasonal and rarity counts',()=>{expect(SEASON_CARDS).toHaveLength(100);expect(new Set(SEASON_CARDS.map(c=>`${c.art}:${c.panel}`)).size).toBe(100);expect([1,2,3,4].map(n=>SEASON_CARDS.filter(c=>c.stars===n).length)).toEqual([38,26,20,16]);expect(SEASON_CARDS.filter(c=>c.theme==='fall')).toHaveLength(45);expect(SEASON_CARDS.filter(c=>c.theme==='winter')).toHaveLength(55);expect(achievementCardBonus('farkle-victory-10')).toEqual({pack:3});});});
describe.each(['node','d1']as const)('Cayea collectibles on %s',backend=>{
 it('charges each tier once and opens exactly three cards once, with guaranteed first-card rarity',async()=>{const{store,economy}=await setup(backend);let spent=0;for(const stars of[1,2,3,4]as const){const cmd={operation:'buy_booster',stars,requestId:randomUUID()};const purchased=await Promise.all([store.command(a,cmd),store.command(a,cmd)]);expect(purchased[0]!.packId).toBe(purchased[1]!.packId);spent+=BOOSTER_PRICES[stars];expect((await economy.wallet(a)).points).toBe(2000-spent);const packId=purchased[0]!.packId!;const results=await Promise.all([store.command(a,{operation:'open_booster',packId}),store.command(a,{operation:'open_booster',packId})]);expect(results[0]!.cards).toHaveLength(3);expect(results[0]!.cards).toEqual(results[1]!.cards);expect(SEASON_CARDS.find(c=>c.id===results[0]!.cards![0])!.stars).toBeGreaterThanOrEqual(stars);expect((await store.read(a)).packs).toHaveLength(0);}expect(Object.values((await store.read(a)).cards).reduce((a,b)=>a+b,0)).toBe(12);});
 it('rolls 44% once per pack and awards at most one new card',async()=>{
  const {binding,seed}=await setup(backend);
  const owned={'hh-22':1};
  for (const [roll,newCards] of [[43,1],[44,0]] as const) {
   seed(0,owned);
   let rolls=0;
   const store=new CollectiblesStore(binding,Date.now,max=>rolls++===0?roll%max:0);
   const pack=await store.command(a,{operation:'buy_booster',stars:4,requestId:randomUUID()});
   const result=await store.command(a,{operation:'open_booster',packId:pack.packId});
   expect(result.cards).toHaveLength(3);
   expect(new Set(result.cards!.filter(id=>id!=='hh-22')).size).toBe(newCards);
   expect(SEASON_CARDS.find(card=>card.id===result.cards![0])?.stars).toBe(4);
  }
 });
 it('honors the guaranteed tier when an eligible duplicate is unavailable',async()=>{
  const {store,seed}=await setup(backend,max=>max-1);
  seed(0,{'hh-01':1});
  const pack=await store.command(a,{operation:'buy_booster',stars:4,requestId:randomUUID()});
  const result=await store.command(a,{operation:'open_booster',packId:pack.packId});
  expect(SEASON_CARDS.find(card=>card.id===result.cards![0])?.stars).toBe(4);
  expect(new Set(result.cards!.filter(id=>id!=='hh-01')).size).toBe(1);
 });
 it('uses a flexible slot for a new card when the guaranteed tier is complete',async()=>{
  const {store,seed}=await setup(backend);
  const owned=SEASON_CARDS.filter(card=>card.stars===4);
  seed(0,Object.fromEntries(owned.map(card=>[card.id,1])));
  const pack=await store.command(a,{operation:'buy_booster',stars:4,requestId:randomUUID()});
  const result=await store.command(a,{operation:'open_booster',packId:pack.packId});
  expect(owned.some(card=>card.id===result.cards![0])).toBe(true);
  expect(new Set(result.cards!.filter(id=>!owned.some(card=>card.id===id))).size).toBe(1);
 });
 it('draws only duplicates for a complete album',async()=>{
  const {store,seed}=await setup(backend);
  seed(0,Object.fromEntries(SEASON_CARDS.map(card=>[card.id,1])));
  const pack=await store.command(a,{operation:'buy_booster',stars:4,requestId:randomUUID()});
  const result=await store.command(a,{operation:'open_booster',packId:pack.packId});
  expect(result.cards).toHaveLength(3);
  expect((await store.read(a)).unique).toBe(SEASON_CARDS.length);
 });
 it('rejects guests, foreign packs, invalid tiers and insufficient funds without changing the collection',async()=>{const{store,raw}=await setup(backend);await expect(store.read({principal:'guest:qa'})).rejects.toMatchObject({status:401});const p=await store.command(a,{operation:'buy_booster',stars:4,requestId:randomUUID()});await expect(store.command(b,{operation:'open_booster',packId:p.packId})).rejects.toMatchObject({status:404});await expect(store.command(a,{operation:'buy_booster',stars:8,requestId:randomUUID()})).rejects.toMatchObject({status:400});raw.prepare('UPDATE economy_wallets SET points=0 WHERE user_id=?').run(ids[0]!);await expect(store.command(a,{operation:'buy_booster',stars:1,requestId:randomUUID()})).rejects.toMatchObject({status:409});expect((await store.read(a)).packs).toHaveLength(1);});
 it('escrows only duplicates, requires buyer consent, and transfers fixed Cash without minting money',async()=>{const{store,economy,seed}=await setup(backend);seed(0,{'hh-01':2});const cmd=offer(),r=await store.command(a,cmd);expect((await store.read(a)).cards['hh-01']).toBe(1);expect((await store.read(b)).cards['hh-01']).toBeUndefined();expect((await store.command(a,cmd)).tradeId).toBe(r.tradeId);await expect(store.command(a,{operation:'accept_trade',tradeId:r.tradeId})).rejects.toMatchObject({status:403});await expect(store.command(c,{operation:'accept_trade',tradeId:r.tradeId})).rejects.toMatchObject({status:404});await Promise.all([store.command(b,{operation:'accept_trade',tradeId:r.tradeId}),store.command(b,{operation:'accept_trade',tradeId:r.tradeId})]);expect((await store.read(b)).cards['hh-01']).toBe(1);expect((await economy.wallet(a)).points).toBe(2005);expect((await economy.wallet(b)).points).toBe(1995);await expect(store.command(a,offer())).rejects.toMatchObject({status:409});});
 it('swaps same-rarity duplicates only and keeps both first copies',async()=>{const{store,seed,economy}=await setup(backend);seed(0,{'hh-01':2});seed(1,{'hh-02':2});await expect(store.command(a,offer('hh-01','hh-06'))).rejects.toMatchObject({status:400});const r=await store.command(a,offer('hh-01','hh-02'));await store.command(b,{operation:'accept_trade',tradeId:r.tradeId});expect((await store.read(a)).cards).toEqual({'hh-01':1,'hh-02':1});expect((await store.read(b)).cards).toEqual({'hh-01':1,'hh-02':1});expect((await economy.wallet(a)).points).toBe(2000);});
 it('returns escrow after decline/cancel, and concurrent cancel versus accept resolves once',async()=>{const{store,seed,economy}=await setup(backend);seed(0,{'hh-01':4});for(const operation of['cancel_trade','decline_trade']){const r=await store.command(a,offer());await store.command(operation==='cancel_trade'?a:b,{operation,tradeId:r.tradeId});expect((await store.read(a)).cards['hh-01']).toBe(4);}const r=await store.command(a,offer());await Promise.allSettled([store.command(a,{operation:'cancel_trade',tradeId:r.tradeId}),store.command(b,{operation:'accept_trade',tradeId:r.tradeId})]);const left=await store.read(a),right=await store.read(b);expect((left.cards['hh-01']??0)+(right.cards['hh-01']??0)).toBe(4);expect((await economy.wallet(a)).points+(await economy.wallet(b)).points).toBe(4000);expect(left.trades.filter(t=>t.status==='pending')).toHaveLength(0);});
 it('rechecks blocking, duplicate ownership and current Cash at acceptance',async()=>{const{store,seed,raw}=await setup(backend);seed(0,{'hh-01':3});const r=await store.command(a,offer());raw.prepare('INSERT INTO social_blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)').run(ids[1]!,ids[0]!,1);await expect(store.command(b,{operation:'accept_trade',tradeId:r.tradeId})).rejects.toMatchObject({status:403});await store.command(a,{operation:'cancel_trade',tradeId:r.tradeId});raw.prepare('DELETE FROM social_blocks').run();const s=await store.command(a,offer('hh-01','hh-02'));seed(1,{'hh-02':1});await expect(store.command(b,{operation:'accept_trade',tradeId:s.tradeId})).rejects.toMatchObject({status:409});await store.command(b,{operation:'decline_trade',tradeId:s.tradeId});const t=await store.command(a,offer());raw.prepare('UPDATE economy_wallets SET points=0 WHERE user_id=?').run(ids[1]!);await expect(store.command(b,{operation:'accept_trade',tradeId:t.tradeId})).rejects.toMatchObject({status:409});});
 it('grants the 1,000 Cash full-album jackpot once under concurrent retries',async()=>{const{store,seed,economy}=await setup(backend);await expect(store.command(a,{operation:'claim_jackpot'})).rejects.toMatchObject({status:409});seed(0,Object.fromEntries(SEASON_CARDS.map(c=>[c.id,1])));await Promise.all([store.command(a,{operation:'claim_jackpot'}),store.command(a,{operation:'claim_jackpot'})]);expect((await economy.wallet(a)).points).toBe(3000);expect((await store.read(a)).jackpotClaimed).toBe(true);});
 it('adds achievement bonuses once, without awarding their Cash a second time',async()=>{const{store,raw,economy}=await setup(backend);for(const achievement of['farkle-victory-1','farkle-victory-5','farkle-victory-10','farkle-hard-10'])raw.prepare("INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,'reward','points',0,0,'fixture','{}',1)").run(randomUUID(),ids[0]!,`badge:${achievement}`);const first=await store.read(a),second=await store.read(a);expect(second.cards).toEqual(first.cards);expect(second.packs.map(p=>p.stars).sort()).toEqual([2,3,4]);expect((await economy.wallet(a)).points).toBe(2000);});
 it('stacks milestones across crates and guarantees ultra after three failed checkpoints',async()=>{const{store,binding}=await setup(backend,n=>n-1);for(let n=1;n<=20;n++){await binding.batch([...await store.cratePlan(ids[0]!,`test-${n}`),binding.prepare('DELETE FROM command_guards')]);const v=await store.read(a);expect(v.crates).toBe(n);expect(v.packs.filter(p=>p.stars===4)).toHaveLength(n===20?1:0);}const v=await store.read(a);expect(v.packs.filter(p=>p.stars===2)).toHaveLength(10);expect(v.packs.filter(p=>p.stars===3)).toHaveLength(6);expect(v.ultraMisses).toBe(0);});
 it('integrates concurrent real crate openings atomically and never recounts a retry',async()=>{const{store,economy,raw}=await setup(backend);const crates:string[]=[];for(let n=0;n<18;n++){const crate=await verifiedCrateWin(economy,raw,'dominoes',ids[0]!);if(n===8||n===17)crates.push(crate);}await Promise.all(crates.map(crateId=>economy.command(a,{operation:'open_reward_crate',collection:'dominoes',crateId})));await economy.command(a,{operation:'open_reward_crate',collection:'dominoes',crateId:crates[0]!});const v=await store.read(a);expect(v.crates).toBe(2);expect(v.packs.map(p=>p.stars)).toEqual([1]);expect((await economy.wallet(a)).points).toBe(2006);});
});
