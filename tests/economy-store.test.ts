import { D6_DICE_SETS, D6_DICE_SLOT, equippedD6Dice } from '../src/lib/d6-dice';
import { NAUTICAL_BUNDLES } from '../src/lib/nautical-sets';
import { type FiveDiceMatchReward, validFiveDiceReceipt, fiveDiceRewardTier } from '../src/lib/five-dice-rewards';
import { LEGACY_CUSTOM_PROFILE_IMAGE, PROFILE_IMAGE_SHAPES, profileFrameItem, profileImageAvatar } from '../src/lib/profile-image';
import { PROFILE_TEST_JPEG } from './helpers/profile-image';
import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RoomStore } from '../server/rooms';
import { SpadesRoomStore } from '../server/spades-rooms';
import { initializeSocialNode, nodeSocialBinding } from '../server/social-node';
import { SocialStore } from '../server/social';
import { EconomyStore, type LegacyEconomy } from '../server/economy';
import { initializeEconomyNode } from '../server/economy-node';
import { TestD1 } from './helpers/d1';
import { ACHIEVEMENTS } from '../src/lib/achievement-catalog';
import { FAITH_SKINS, equippedFaithSkin } from '../src/lib/faith-skins';
import { FARKLE_DICE_SETS, FARKLE_DICE_SLOT, equippedFarkleDice } from '../src/lib/farkle-dice';
import { ECONOMY_CATALOG, POINT_FIELDS, POINT_GAMES, puzzleLevelPoints, type EconomyWallet } from '../src/lib/economy-protocol';
import type { MatchReward } from '../src/lib/rummy-rewards';
import type { SpadesMatchReward } from '../src/lib/spades-rewards';
import type { D1Binding } from '../server/database';

const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
const actor=(id=a)=>({principal:`member:${id}`});
const wallet=(overrides:Partial<EconomyWallet>={}):EconomyWallet=>({points:1000,f3_points:1000,gems_points:1000,rummy_points:1000,spades_points:1000,dice_points:1000,domino_points:1000,lifetime_points:5000,owned:[],equipped:{},pending_perks:{},...overrides});
const legacy=(overrides:Partial<EconomyWallet>={},awards:LegacyEconomy['awards']=[]):LegacyEconomy=>({wallet:wallet(overrides),awards});
const cleanup:(()=>void)[]=[];
afterEach(()=>cleanup.splice(0).forEach(f=>f()));
function setup(backend:'node'|'d1',now?:()=>number){
 const hosted=backend==='d1'?new TestD1():null,local=hosted?null:new RoomStore(':memory:'),raw=hosted?.sqlite??local!.db;
 if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);initializeEconomyNode(raw);}
 cleanup.push(()=>raw.close());
 const binding=hosted??nodeSocialBinding(raw),store=new EconomyStore(binding,now),social=new SocialStore(binding);
 const initialize=async(id=a,prior:LegacyEconomy=legacy())=>{await social.ensureProfile(actor(id));return store.ensureMember(actor(id),prior);};
 const rummy=(id=randomUUID(),userId=a):MatchReward=>{
  const result:MatchReward={version:1,match_id:id,variant:'classic',mode:'bot',winner_index:0,participants:[{user_id:userId,bot:false,level:null,score:100},{user_id:null,bot:true,level:'normal',score:20}],completed_at:new Date().toISOString()};
  raw.prepare('INSERT INTO reward_outbox(match_id,room_code,user_id,payload) VALUES(?,?,?,?)').run(id,'ABC123DE',userId,JSON.stringify(result));return result;
 };
 const spades=(teams=false):SpadesMatchReward=>{
  const result:SpadesMatchReward={version:1,match_id:randomUUID(),mode:teams?'online':'bot',variant:teams?'teams':'solo',target:100,winner:0,scores:teams?[200,100]:[200,100,80,70],players:teams?[a,'33333333-3333-4333-8333-333333333333',b,'44444444-4444-4444-8444-444444444444'].map(user_id=>({user_id,bot:false,level:null})):[{user_id:a,bot:false,level:null},...Array.from({length:3},()=>({user_id:null,bot:true,level:'hard' as const}))],completed_at:new Date().toISOString()};
  raw.prepare('INSERT INTO spades_rewards(match_id,room_code,payload) VALUES(?,?,?)').run(result.match_id,'DEF123AB',JSON.stringify(result));return result;
 };
 return {store,social,raw,binding,initialize,rummy,spades};
}

describe.each(['node','d1'] as const)('authoritative economy on %s',backend=>{
 it.each(NAUTICAL_BUNDLES)('purchases $id atomically once and equips all four sets',async bundle=>{
  const {store,initialize}=setup(backend);await initialize(a,legacy({points:2000,dice_points:3000,domino_points:3000}));
  await expect(store.command(actor(),{operation:'equip',slot:bundle.currency==='dice_points'?'farkle_dice':'domino_skin',itemId:bundle.items[0]})).rejects.toMatchObject({code:'not_owned'});
  const buys=await Promise.all([1,2].map(()=>store.command(actor(),{operation:'purchase',itemId:bundle.id})));
  expect(buys.map(b=>b.receipt.alreadyApplied).sort()).toEqual([false,true]);
  let w=await store.wallet(actor());expect(w[bundle.currency]).toBe(2000);expect(w.points).toBe(2000);
  expect(w.owned).toEqual(expect.arrayContaining([bundle.id,...bundle.items]));
  expect(w.owned.some(id=>NAUTICAL_BUNDLES.find(b=>b.id!==bundle.id)!.items.includes(id))).toBe(false);
  for(const id of bundle.items){
   const result=await store.command(actor(),{operation:'equip',slot:bundle.currency==='dice_points'?'farkle_dice':'domino_skin',itemId:id});expect(Object.values(result.wallet.equipped)).toContain(id);
   await store.command(actor(),{operation:'purchase',itemId:id});
  }
  w=await store.wallet(actor());expect(w[bundle.currency]).toBe(2000);
 });
 it.each(NAUTICAL_BUNDLES)('supports $id Cash payment and rejects insufficient funds without partial ownership',async bundle=>{
  const {store,initialize}=setup(backend);await initialize(a,legacy({points:769}));
  await expect(store.command(actor(),{operation:'purchase',itemId:bundle.id,payment:'cash'})).rejects.toMatchObject({code:'insufficient_points'});
  expect((await store.wallet(actor())).owned).toEqual([]);
  await initialize(b,legacy({points:1000}));await store.command(actor(b),{operation:'purchase',itemId:bundle.id,payment:'cash'});
  expect(await store.wallet(actor(b))).toMatchObject({points:230,owned:expect.arrayContaining(bundle.items)});
 });
 it('shares D6 ownership and selection while preserving old dice saves and clients',async()=>{
  const {store,initialize}=setup(backend),design=D6_DICE_SETS[0]!;
  await initialize(a,legacy({owned:[design.id],equipped:{farkle_dice:design.id}}));
  expect(equippedD6Dice(await store.wallet(actor())).id).toBe(design.id);
  const first=await store.command(actor(),{operation:'equip',slot:D6_DICE_SLOT,itemId:design.id});
  expect(first.wallet.equipped).toMatchObject({d6_dice:design.id,farkle_dice:design.id});
  const other=D6_DICE_SETS.find(d=>d.symbol==='skull')!;
  await store.command(actor(),{operation:'purchase',itemId:other.id});
  const oldClient=await store.command(actor(),{operation:'equip',slot:'farkle_dice',itemId:other.id});
  expect(equippedD6Dice(oldClient.wallet).id).toBe(other.id);
  expect(oldClient.wallet.equipped).toMatchObject({d6_dice:other.id,farkle_dice:other.id});
  const duplicate=await store.command(actor(),{operation:'purchase',itemId:other.id});
  expect(duplicate.receipt.alreadyApplied).toBe(true);expect(duplicate.wallet.dice_points).toBe(oldClient.wallet.dice_points);
 });
 it('buys new Faith skins once with Cash and immediately equips them',async()=>{
  const {store,initialize}=setup(backend);await initialize(a,legacy({points:2000}));
  let cash=2000;
  for(const design of FAITH_SKINS.slice(3)){
   await expect(store.command(actor(),{operation:'equip',slot:'faith3_skin',itemId:design.id})).rejects.toMatchObject({code:'not_owned'});
   const first=await store.command(actor(),{operation:'purchase',itemId:design.id});
   cash-=Math.ceil(design.price*1.25);expect(first.wallet.points).toBe(cash);expect(first.wallet.f3_points).toBe(1000);
   const repeat=await store.command(actor(),{operation:'purchase',itemId:design.id});expect(repeat.wallet.points).toBe(cash);expect(repeat.receipt.alreadyApplied).toBe(true);
   const result=await store.command(actor(),{operation:'equip',slot:'faith3_skin',itemId:design.id});
   expect(equippedFaithSkin(result.wallet)).toBe(design.id);
  }
 });
 it('prices, purchases and equips each Quintsee dice set with permanent ownership',async()=>{
  const {store,initialize}=setup(backend),budget=FARKLE_DICE_SETS.reduce((sum,item)=>sum+Math.ceil(item.price*1.25),1000);await initialize(a,legacy({dice_points:budget}));await initialize(b);
  let spent=0;
  for(const design of FARKLE_DICE_SETS){
   const item=ECONOMY_CATALOG.find(item=>item.id===design.id)!;
   expect(item).toMatchObject({price:Math.ceil(design.price*1.25),currency:'dice_points',slot:FARKLE_DICE_SLOT,cashPrice:Math.ceil(Math.ceil(design.price*10/13)*1.25)});
   await expect(store.command(actor(b),{operation:'equip',slot:FARKLE_DICE_SLOT,itemId:design.id})).rejects.toMatchObject({code:'not_owned'});
   const buys=await Promise.all([1,2].map(()=>store.command(actor(),{operation:'purchase',itemId:design.id})));
   expect(buys.map(x=>x.receipt.alreadyApplied).sort()).toEqual([false,true]);spent+=item.price;
   const equipped=await store.command(actor(),{operation:'equip',slot:FARKLE_DICE_SLOT,itemId:design.id});
   expect(equipped.wallet.dice_points).toBe(budget-spent);expect(equipped.wallet.points).toBe(1000);
   expect(equippedFarkleDice(equipped.wallet).id).toBe(design.id);
   expect((await store.wallet(actor())).equipped[FARKLE_DICE_SLOT]).toBe(design.id);
  }
  expect(equippedFarkleDice({owned:[],equipped:{[FARKLE_DICE_SLOT]:'farkle-dice-onyx'}}).id).toBe('farkle-dice-classic');
  const restored=await store.command(actor(),{operation:'equip',slot:FARKLE_DICE_SLOT,itemId:'farkle-dice-classic'});
  expect(equippedFarkleDice(restored.wallet).id).toBe('farkle-dice-classic');
  const paid=await store.command(actor(b),{operation:'purchase',itemId:'farkle-dice-onyx',payment:'cash'});
  expect(paid.wallet.points).toBe(758);expect(paid.wallet.dice_points).toBe(1000);
  await expect(store.command(actor(),{operation:'equip',slot:FARKLE_DICE_SLOT,itemId:'card-deck-fantasy'})).rejects.toMatchObject({status:400});
 });
 it.each(POINT_GAMES)('charges 125 %s points for each frame separately and saves only owned shapes',async game=>{
  const {store,social,initialize}=setup(backend);await initialize();await initialize(b);
  const profile={operation:'profile',gamerName:'ImageTester',bio:'Ready for a game'};
  for(const [index,shape] of PROFILE_IMAGE_SHAPES.entries()){
   const avatar=profileImageAvatar(shape,PROFILE_TEST_JPEG);
   await expect(social.command(actor(),{...profile,avatar})).rejects.toMatchObject({code:'not_owned'});
   const purchases=await Promise.all([1,2].map(()=>store.command(actor(),{operation:'purchase',itemId:profileFrameItem(shape),game})));
   expect(purchases.map(p=>p.receipt.alreadyApplied).sort()).toEqual([false,true]);
   const paid=await store.wallet(actor());expect(paid[POINT_FIELDS[game]]).toBe(1000-(index+1)*125);expect(paid.points).toBe(1000);
   for(const otherGame of POINT_GAMES.filter(g=>g!==game))expect(paid[POINT_FIELDS[otherGame]]).toBe(1000);
   expect(paid.owned.filter(id=>id.startsWith('profile-image-'))).toHaveLength(index+1);
   const saved=await social.command(actor(),{...profile,avatar});expect(saved.profile?.avatar).toBe(avatar);
   const viewed=await social.read(actor(b),new URL('https://clubhouse.test/api/social/players/'+a)) as {avatar:string};expect(viewed.avatar).toBe(avatar);
   await expect(social.command(actor(b),{...profile,gamerName:'OtherTester',avatar})).rejects.toMatchObject({code:'not_owned'});
  }
  await expect(store.command(actor(),{operation:'purchase',itemId:LEGACY_CUSTOM_PROFILE_IMAGE,game})).rejects.toThrow('unavailable');
 });
 it.each(PROFILE_IMAGE_SHAPES)('keeps an existing %s image when converting one old purchase to one frame',async shape=>{
  const {store,social,initialize,raw}=setup(backend);await initialize();
  const avatar=profileImageAvatar(shape,PROFILE_TEST_JPEG);raw.prepare('UPDATE social_profiles SET avatar=? WHERE user_id=?').run(avatar,a);
  raw.prepare('UPDATE economy_wallets SET owned=? WHERE user_id=?').run(JSON.stringify([LEGACY_CUSTOM_PROFILE_IMAGE,'rummy-jokers']),a);
  await Promise.all([store.wallet(actor()),store.wallet(actor())]);
  const result=await store.wallet(actor());expect(result.owned.sort()).toEqual([profileFrameItem(shape),'rummy-jokers'].sort());expect(result.rummy_points).toBe(1000);expect(result.points).toBe(1000);
  expect(raw.prepare('SELECT count(*) n FROM economy_ledger WHERE source=?').get('legacy:custom-profile-frame')!.n).toBe(1);
  const saved=await social.command(actor(),{operation:'profile',gamerName:'KeepMyImage',bio:'Ready to play',avatar});expect(saved.profile?.avatar).toBe(avatar);
  const other=PROFILE_IMAGE_SHAPES.find(value=>value!==shape)!;
  await expect(social.command(actor(),{operation:'profile',gamerName:'KeepMyImage',bio:'Ready to play',avatar:profileImageAvatar(other,PROFILE_TEST_JPEG)})).rejects.toMatchObject({code:'not_owned'});
 });
 it('gives unused old custom-image purchases one circle frame without changing balances',async()=>{
  const {store,initialize}=setup(backend);const result=await initialize(a,legacy({owned:[LEGACY_CUSTOM_PROFILE_IMAGE]}));
  expect(result.owned).toEqual([profileFrameItem('circle')]);expect(result.rummy_points).toBe(1000);expect(result.points).toBe(1000);
 });
 it('prices every paid card table at 125 points and retires room backgrounds',async()=>{
  const {store,initialize}=setup(backend);await initialize(a,legacy({rummy_points:1500,spades_points:1500}));
  expect(ECONOMY_CATALOG.some(item=>item.id.startsWith('rummy-room-'))).toBe(false);
  const tables=ECONOMY_CATALOG.filter(item=>['rummy_table','spades_table'].includes(item.slot ?? ''));expect(tables.length).toBeGreaterThan(8);
  for(const item of tables){expect(item.price).toBe(125);expect(item.cashPrice).toBe(97);const purchase=await store.command(actor(),{operation:'purchase',itemId:item.id});expect(purchase.receipt.alreadyApplied).toBe(false);}
  const result=await store.wallet(actor());expect(result.rummy_points).toBe(1500-125*tables.filter(item=>item.currency==='rummy_points').length);expect(result.spades_points).toBe(1500-125*tables.filter(item=>item.currency==='spades_points').length);
  await expect(store.command(actor(),{operation:'purchase',itemId:'rummy-room-riviera'})).rejects.toThrow('unavailable');
  await expect(store.command(actor(),{operation:'purchase',itemId:tables[0]!.id,game:'3-gems'})).rejects.toThrow('supported game');
 });

 it('imports an existing wallet, ownership, award IDs and Faith progression once without resets',async()=>{
  const {store,initialize}=setup(backend),old=legacy({owned:['faith3-skin-jade'],equipped:{faith3_skin:'faith3-skin-jade'},pending_perks:{undo:2}},[{source:'faith3:level:1',amount:5},{source:'faith3:level:2',amount:5},{source:'rummy:win:old',rummy_tier:'humans',amount:150}]);
  expect(await initialize(a,old)).toEqual(old.wallet);
  expect(await store.ensureMember(actor(),legacy({points:999999,owned:['rummy-jokers']}))).toEqual(old.wallet);
  const view=await store.read(actor());expect(view.progress['faith-3']).toMatchObject({levels:[1,2],unlocked:3});expect(view.stats).toMatchObject({faithLevels:2,rummyWins:1,rummyHumanWins:1});
  expect(view.sources).toContain('rummy:win:old');
 });
 it('concurrent imports choose exactly one consistent wallet and its matching award history',async()=>{
  const {store,raw}=setup(backend);
  await Promise.all([store.ensureMember(actor(),legacy({points:100},[{source:'first-source'}])),store.ensureMember(actor(),legacy({points:200},[{source:'second-source'}]))]);
  const w=await store.wallet(actor()),sources=(await store.read(actor())).sources;
  expect([100,200]).toContain(w.points);expect(sources).toEqual(w.points===100?['first-source']:['second-source']);expect(raw.prepare('SELECT count(*) n FROM economy_wallets').get()!.n).toBe(1);
 });
 it('rejects guests, malformed legacy balances and commands that attempt direct awards',async()=>{
  const {store,initialize}=setup(backend);await initialize();
  await expect(store.read({principal:'guest:test'})).rejects.toMatchObject({status:401});
  await expect(store.ensureMember(actor(b),legacy({points:-1}))).rejects.toMatchObject({code:'wallet_import_failed'});
  for(const input of [null,[],{operation:'award',amount:10000},{operation:'claim_achievement',achievementId:'missing'},{operation:'purchase',itemId:'arbitrary'}])await expect(store.command(actor(),input)).rejects.toMatchObject({status:400});
  expect(await store.wallet(actor())).toEqual(wallet());
 });
 it.each(POINT_GAMES)('converts %s at13to10 exactly once, keeps lifetime, and rejects ID reuse',async game=>{
  const {store,initialize}=setup(backend);await initialize();const requestId=randomUUID(),command={operation:'convert',game,amount:130,requestId};
  const results=await Promise.all([store.command(actor(),command),store.command(actor(),command)]);
  expect(results.map(r=>r.receipt.alreadyApplied).sort()).toEqual([false,true]);
  const w=await store.wallet(actor());expect(w[POINT_FIELDS[game]]).toBe(870);expect(w.points).toBe(1100);expect(w.lifetime_points).toBe(5000);
  await expect(store.command(actor(),{...command,amount:110})).rejects.toMatchObject({code:'request_reused'});
  expect((await store.read(actor())).history.filter(r=>r.source===`convert:${requestId}`)).toHaveLength(1);
 });
 it('prevents competing conversions from overspending the same game points',async()=>{
  const {store,initialize}=setup(backend);await initialize(a,legacy({gems_points:130}));
  const settled=await Promise.allSettled(Array.from({length:5},()=>store.command(actor(),{operation:'convert',game:'3-gems',amount:130,requestId:randomUUID()})));
  expect(settled.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await store.wallet(actor())).gems_points).toBe(0);expect((await store.wallet(actor())).points).toBe(1100);
 });
 it('rejects invalid conversion amounts and leaves all balances unchanged',async()=>{
  const {store,initialize}=setup(backend);await initialize();
  for(const amount of [0,-10,1,11,NaN,Infinity,1.5,2**53])await expect(store.command(actor(),{operation:'convert',game:'rummy',amount,requestId:randomUUID()})).rejects.toMatchObject({status:400});
  await expect(store.command(actor(),{operation:'convert',game:'unknown',amount:10,requestId:randomUUID()})).rejects.toMatchObject({status:400});
  expect(await store.wallet(actor())).toEqual(wallet());
 });
 it('credits sequential first clears, preserves the larger star result, and refuses replay farming',async()=>{
  const {store,initialize}=setup(backend);await initialize();
  await expect(store.creditPuzzle(actor(),'faith-3',2)).rejects.toMatchObject({code:'level_locked'});
  const results=await Promise.all([store.creditPuzzle(actor(),'faith-3',1),store.creditPuzzle(actor(),'faith-3',1)]);
  expect(results.map(r=>r.amount).sort()).toEqual([0,puzzleLevelPoints('faith-3',1)]);
  await store.creditPuzzle(actor(),'3-gems',1,{stars:1});await store.creditPuzzle(actor(),'3-gems',1,{stars:3});await store.creditPuzzle(actor(),'3-gems',1,{stars:2});
  expect((await store.wallet(actor())).gems_points).toBe(1010);expect(await store.puzzleProgress(actor(),'3-gems')).toMatchObject({levels:[1],stars:{'1':3},unlocked:2});
 });
 it('only credits real stored card receipts and never recredits an imported match',async()=>{
  const {store,initialize,rummy}=setup(backend),id=randomUUID();await initialize(a,legacy({},[{source:`rummy:win:${id}`,amount:70,rummy_tier:'normal'}]));const old=rummy(id);
  expect((await store.claimRummyReward(old)).already_credited).toBe(true);expect((await store.wallet(actor())).rummy_points).toBe(1000);
  const next=rummy();await Promise.all([store.claimRummyReward(next),store.claimRummyReward(next)]);expect((await store.wallet(actor())).rummy_points).toBe(1025);
  await expect(store.claimRummyReward({...next,match_id:randomUUID()})).rejects.toMatchObject({code:'reward_unverified'});
  await expect(store.claimRummyReward({...next,winner_index:1})).rejects.toMatchObject({code:'reward_unverified'});
 });
 it('credits only actual Spades team winners and synchronizes pending match rewards from reads',async()=>{
  const {store,initialize,spades}=setup(backend);await initialize();await initialize(b);const result=spades(true);
  expect(await store.claimSpadesReward(result)).toMatchObject({user_ids:[a,b],amount:50,already_credited:false});
  expect((await store.wallet(actor())).spades_points).toBe(1050);expect((await store.wallet(actor(b))).spades_points).toBe(1050);
  expect((await store.claimSpadesReward(result)).already_credited).toBe(true);
  expect((await store.read(actor())).stats).toMatchObject({spadesWins:1,spadesHumanWins:1});
 });
 it('blocks card delivery until legacy wallet import is complete',async()=>{
  const {store,rummy}=setup(backend);const result=rummy();
  await expect(store.claimRummyReward(result)).rejects.toMatchObject({code:'wallet_unavailable'});
  expect(await store.hasMember(actor())).toBe(false);
 });
 it('unlocks verified achievements, awards once under competing claims, and never trusts client amount',async()=>{
  const {store,initialize}=setup(backend);await initialize();await store.creditPuzzle(actor(),'faith-3',1);
  await expect(store.command(actor(),{operation:'claim_achievement',achievementId:'faith-clear-10',amount:99999})).rejects.toMatchObject({code:'achievement_locked'});
  const input={operation:'claim_achievement',achievementId:'faith-clear-1',amount:99999,userId:b};await Promise.all([store.command(actor(),input),store.command(actor(),input)]);
  expect((await store.wallet(actor())).f3_points).toBe(1022);expect((await store.read(actor())).achievements.find(a=>a.id==='faith-clear-1')).toMatchObject({claimed:true,progress:1,unlocked:true,reward:10});
  expect(await store.hasMember(actor(b))).toBe(false);
 });
 it('uses server catalog prices and charges permanent unlocks once under concurrent purchases',async()=>{
  const {store,initialize}=setup(backend);await initialize(a,legacy({rummy_points:1200}));
  await Promise.all([store.command(actor(),{operation:'purchase',itemId:'rummy-jokers',price:0}),store.command(actor(),{operation:'purchase',itemId:'rummy-jokers',price:0})]);
  expect((await store.wallet(actor())).rummy_points).toBe(700);expect((await store.wallet(actor())).owned).toEqual(['rummy-jokers']);
  await expect(store.command(actor(),{operation:'equip',slot:'spades_deck',itemId:'card-deck-atlas'})).rejects.toMatchObject({code:'not_owned'});
  await store.command(actor(),{operation:'purchase',itemId:'card-deck-atlas'});await store.command(actor(),{operation:'equip',slot:'spades_deck',itemId:'card-deck-atlas'});
  expect((await store.wallet(actor())).equipped.spades_deck).toBe('card-deck-atlas');
  await store.command(actor(),{operation:'equip',slot:'spades_deck',itemId:'spades-deck-classic'});expect((await store.wallet(actor())).equipped.spades_deck).toBe('spades-deck-classic');
 });
 it.each(['easy','normal','hard','humans'] as const)('credits one verified Quintsee %s win once, using the stored evidence and server rate',async tier=>{
  const {store,initialize,raw}=setup(backend);await initialize();
  const result:FiveDiceMatchReward={version:1,match_id:randomUUID(),mode:tier==='humans'?'online':'bot',players:[{user_id:a,bot:false,level:null},tier==='humans'?{user_id:b,bot:false,level:null}:{user_id:null,bot:true,level:tier}],winner:0,scores:[220,140],completed_at:new Date().toISOString()};
  const points={easy:15,normal:25,hard:35,humans:50}[tier];
  await expect(store.claimFiveDiceReward(result)).rejects.toMatchObject({code:'reward_unverified'});
  raw.prepare('INSERT INTO five_dice_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)').run(result.match_id,'D1CEABCD',JSON.stringify(result),Date.now());
  await expect(store.claimFiveDiceReward({...result,scores:[9999,140]})).rejects.toMatchObject({code:'reward_unverified'});
  const receipts=await Promise.all([store.claimFiveDiceReward(result),store.claimFiveDiceReward(result)]);
  expect(receipts.map(receipt=>receipt.already_credited).sort()).toEqual([false,true]);
  for(const receipt of receipts){expect(validFiveDiceReceipt(result,receipt)).toBe(true);expect(receipt.amount).toBe(points);}
  const after=await store.read(actor());expect(after.wallet).toMatchObject({dice_points:1000+points,rummy_points:1000,spades_points:1000,points:1000,lifetime_points:5000+points});
  expect(after.stats).toMatchObject({diceWins:1,diceHardWins:tier==='hard'?1:0,diceHumanWins:tier==='humans'?1:0,gamesPlayed:1});
  expect(after.achievements.find(badge=>badge.id==='five-dice-victory-1')).toMatchObject({unlocked:true,reward:20,currency:'dice_points',cashReward:2});
  await store.command(actor(),{operation:'claim_achievement',achievementId:'five-dice-victory-1'});
  expect(await store.wallet(actor())).toMatchObject({dice_points:1020+points,points:1002,lifetime_points:5022+points});
 });
 it.each([3,4])('synchronizes one 50-point online win from a %i-player completed table on wallet reads',async seats=>{
  const {store,initialize,raw}=setup(backend);await initialize();
  const ids=[a,b,'33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
  const result:FiveDiceMatchReward={version:1,match_id:randomUUID(),mode:'online',players:ids.slice(0,seats).map(user_id=>({user_id,bot:false,level:null})),winner:0,scores:[220,150,140,130].slice(0,seats),completed_at:new Date().toISOString()};
  raw.prepare('INSERT INTO five_dice_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)').run(result.match_id,'D1CEABCD',JSON.stringify(result),Date.now());
  await Promise.all([store.read(actor()),store.read(actor())]);
  expect(await store.wallet(actor())).toMatchObject({dice_points:1050,domino_points:1000,lifetime_points:5050});
  expect((await store.read(actor())).stats).toMatchObject({diceWins:1,diceHumanWins:1,gamesPlayed:1});
 });
 it('rejects tied, duplicate-account and guest-mixed Quintsee reward evidence',async()=>{
  const {store,initialize,raw}=setup(backend);await initialize();
  for(const [players,scores,winner] of [
   [[{user_id:a,bot:false,level:null},{user_id:b,bot:false,level:null}],[200,200],0],
   [[{user_id:a,bot:false,level:null},{user_id:a,bot:false,level:null}],[200,100],0],
   [[{user_id:a,bot:false,level:null},{user_id:null,bot:false,level:null}],[200,100],0],
  ] as const){
   const result={version:1,match_id:randomUUID(),mode:'online',players:[...players],scores:[...scores],winner,completed_at:new Date().toISOString()} as FiveDiceMatchReward;
   raw.prepare('INSERT INTO five_dice_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)').run(result.match_id,'D1CEABCD',JSON.stringify(result),Date.now());
   await expect(store.claimFiveDiceReward(result)).rejects.toMatchObject({code:'reward_unverified'});
  }
  expect((await store.wallet(actor())).dice_points).toBe(1000);
  expect(fiveDiceRewardTier('bot',[{user_id:a,bot:false,level:null},{user_id:null,bot:true,level:'invented' as never}])).toBeNull();
 });
 it('charges 750 Quintsee points or 578 Cash for party tables exactly once and converts Quintsee points normally',async()=>{
  const {store,initialize}=setup(backend);await initialize();
  const paid=await store.command(actor(),{operation:'purchase',itemId:'five-dice-party'});
  expect(paid.receipt).toMatchObject({amount:750,currency:'dice_points',alreadyApplied:false});expect(paid.wallet).toMatchObject({dice_points:250,domino_points:1000,points:1000,rummy_points:1000});
  const before=await store.wallet(actor());
  expect((await store.command(actor(),{operation:'purchase',itemId:'five-dice-party',payment:'cash'})).receipt.alreadyApplied).toBe(true);
  expect(await store.wallet(actor())).toEqual(before);
  const converted=await store.command(actor(),{operation:'convert',game:'five-dice',amount:13,requestId:randomUUID()});expect(converted.wallet).toMatchObject({dice_points:237,domino_points:1000,points:1010});
  await initialize(b);const cash=await store.command(actor(b),{operation:'purchase',itemId:'five-dice-party',payment:'cash'});expect(cash.wallet).toMatchObject({dice_points:1000,domino_points:1000,points:422});
 });
 it('imports an older wallet without resetting balances and creates an empty Dice balance',async()=>{
  const {store,initialize}=setup(backend);const prior=legacy({points:437,rummy_points:92});delete prior.wallet!.dice_points;delete prior.wallet!.domino_points;
  expect(await initialize(a,prior)).toMatchObject({points:437,rummy_points:92,dice_points:0,domino_points:0,lifetime_points:5000});
 });
 it('counts separate UTC visit days, membership age, friends, profile and game exploration from stored facts',async()=>{
  let now=Date.parse('2026-11-03T12:00:00Z');const {store,initialize,social}=setup(backend,()=>now);
  await initialize(a,{...legacy(),joinedAt:now-31*86400000});await initialize(b);
  await social.command(actor(),{operation:'profile',gamerName:'JadeCaptain',bio:'A friendly player',avatar:'jade'});
  await social.command(actor(),{operation:'request',targetUserId:b});await social.command(actor(b),{operation:'accept',targetUserId:a});
  await store.read(actor());now+=86400000;await store.read(actor());now+=86400000;const view=await store.read(actor());
  expect(view.stats).toMatchObject({visits:3,memberDays:33,friends:1,profileComplete:1});
  for(const id of ['member-visits-3','member-days-30','member-friends-1','member-profile-1'])expect(view.achievements.find(a=>a.id===id)?.unlocked).toBe(true);
 });
 it('reveals only earned badges and aggregate stats on player pages, respecting blocks',async()=>{
  const {store,initialize,social}=setup(backend);await initialize();await initialize(b);await store.creditPuzzle(actor(),'faith-3',1);await store.command(actor(),{operation:'claim_achievement',achievementId:'faith-clear-1'});
  const publicView=await store.publicProfile(actor(b),a);expect(publicView.badges.map(b=>b.id)).toEqual(['faith-clear-1']);expect(publicView).not.toHaveProperty('wallet');expect(publicView).not.toHaveProperty('history');expect(publicView).not.toHaveProperty('sources');
  await social.command(actor(),{operation:'block',targetUserId:b});await expect(store.publicProfile(actor(b),a)).rejects.toMatchObject({status:404});
 });
 it('lets every catalog item use Cash and keeps all artist decks and modes at their new prices',async()=>{
  const {store,initialize}=setup(backend);await initialize(a,legacy({points:100000,rummy_points:0,spades_points:0}));
  for(const item of ECONOMY_CATALOG) {
    const before=await store.wallet(actor());
    const result=await store.command(actor(),{operation:'purchase',itemId:item.id,payment:'cash',cashPrice:0});
    const alreadyOwned=before.owned.includes(item.id);
    expect(result.receipt).toMatchObject({currency:'points',amount:item.cashPrice,alreadyApplied:alreadyOwned});
    expect(result.wallet.points).toBe(before.points-(alreadyOwned?0:item.cashPrice));
    expect(result.wallet.rummy_points).toBe(0);expect(result.wallet.spades_points).toBe(0);
    if(item.slot?.endsWith('_deck'))expect(item).toMatchObject({price:563,cashPrice:434});
    if(['rummy-jokers','spades-partnerships'].includes(item.id))expect(item).toMatchObject({price:500,cashPrice:385});
  }
 });
 it('serializes cross-currency purchases so points and Cash cannot both be charged',async()=>{
  const {store,initialize}=setup(backend);await initialize();
  const results=await Promise.all(['game','cash'].map(payment=>store.command(actor(),{operation:'purchase',itemId:'card-deck-atlas',payment})));
  expect(results.map(result=>result.receipt.alreadyApplied).sort()).toEqual([false,true]);
  const current=await store.wallet(actor());
  expect(current.rummy_points===437&&current.points===1000 || current.rummy_points===1000&&current.points===566).toBe(true);
  await expect(store.command(actor(),{operation:'purchase',itemId:'card-deck-atlas',payment:'invented'})).rejects.toMatchObject({status:400});
 });
 it('preserves freely earned Rummy designs without charging a checkout',async()=>{
  const {store,initialize,rummy}=setup(backend);rummy();await initialize();
  const before=await store.wallet(actor());
  const result=await store.command(actor(),{operation:'purchase',itemId:'card-deck-atlas',payment:'cash'});
  expect(result.receipt.alreadyApplied).toBe(true);expect(result.wallet.owned).toContain('card-deck-atlas');
  // The genuine match reward may synchronize, but no Cash is charged.
  expect(result.wallet.points).toBe(before.points);
 });
 it('shares a single purchase between both games and never charges a second points source or Cash',async()=>{
  const {store,initialize}=setup(backend);await initialize();
  const first=await store.command(actor(),{operation:'purchase',itemId:'card-deck-fantasy',game:'spades'});
  expect(first.receipt).toMatchObject({amount:563,currency:'spades_points',alreadyApplied:false});
  const before=await store.wallet(actor());
  for(const input of [{payment:'cash'},{game:'rummy'},{game:'spades'}]) {
   expect((await store.command(actor(),{operation:'purchase',itemId:'card-deck-fantasy',...input})).receipt.alreadyApplied).toBe(true);
   expect(await store.wallet(actor())).toEqual(before);
  }
  await store.command(actor(),{operation:'equip',slot:'spades_deck',itemId:'card-deck-fantasy'});
  expect((await store.wallet(actor())).equipped.spades_deck).toBe('card-deck-fantasy');
  await expect(store.command(actor(),{operation:'purchase',itemId:'card-deck-scifi',game:'faith-3'})).rejects.toMatchObject({status:400});
  await expect(store.command(actor(),{operation:'equip',slot:'spades_table',itemId:'card-deck-fantasy'})).rejects.toMatchObject({status:400});
 });
 it('combines legacy purchases and earned decks exactly once without changing balances or lifetime',async()=>{
  const {store,initialize,rummy,raw}=setup(backend);for(let i=0;i<5;i++)rummy();
  const imported=legacy({owned:['rummy-deck-atlas','spades-deck-atlas','spades-deck-deco','rummy-jokers'],equipped:{spades_deck:'spades-deck-atlas'}});
  await initialize(a,imported);const current=await store.wallet(actor());
  expect(current).toMatchObject({points:1000,rummy_points:1000,spades_points:1000,lifetime_points:5000,equipped:{spades_deck:'card-deck-atlas'}});
  expect([...current.owned].sort()).toEqual(['card-deck-atlas','card-deck-ember','card-deck-grove','card-deck-deco','rummy-jokers'].sort());
  for(let i=0;i<5;i++)rummy(); // Completing more matches after migration never grants another collectible.
  await Promise.all([store.wallet(actor()),store.wallet(actor())]);expect(await store.wallet(actor())).toEqual(current);
  expect(raw.prepare("SELECT count(*) n FROM economy_ledger WHERE source='legacy:shared-playing-decks'").get()?.n).toBe(1);
  expect((await store.read(actor())).history.some(row=>row.source==='legacy:shared-playing-decks')).toBe(false);
  await expect(store.command(actor(),{operation:'purchase',itemId:'rummy-deck-ember'})).rejects.toMatchObject({status:400});
 });
 it('does not grant shared decks from wins earned after a new wallet was initialized',async()=>{
  const {store,initialize,rummy}=setup(backend);await initialize();for(let i=0;i<10;i++)rummy();
  expect((await store.wallet(actor())).owned).toEqual([]);
  const result=await store.command(actor(),{operation:'purchase',itemId:'card-deck-atlas'});
  expect(result.receipt).toMatchObject({alreadyApplied:false,amount:563});expect(result.wallet.rummy_points).toBe(687);
 });
 it('retains paid game rewards and their historical achievement amounts without re-crediting',async()=>{
  const {store,initialize,rummy,raw}=setup(backend);await initialize();
  const match=rummy();
  const source=`rummy:win:${match.match_id}`;
  raw.prepare('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),a,source,'reward','rummy_points',70,0,'Earlier win',JSON.stringify({tier:'normal'}),Date.now());
  raw.prepare('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),a,'badge:rummy-victory-1','achievement','rummy_points',100,0,'Earlier badge','{}',Date.now());
  raw.prepare('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),a,'badge-cash:rummy-victory-1','achievement','points',15,0,'Earlier bonus','{}',Date.now());
  const before=await store.wallet(actor());
  expect(await store.claimRummyReward(match)).toMatchObject({amount:70,already_credited:true});
  const result=await store.command(actor(),{operation:'claim_achievement',achievementId:'rummy-victory-1'});
  expect(result.receipt).toMatchObject({alreadyApplied:true,amount:100,cash:15});expect(result.wallet).toEqual(before);
  expect(result.achievements.find(badge=>badge.id==='rummy-victory-1')).toMatchObject({reward:100,cashReward:15,claimed:true});
  await store.read(actor());expect(await store.wallet(actor())).toEqual(before);
 });
 it('catches up a missing earlier badge Cash bonus using its original paid amount',async()=>{
  const {store,initialize,raw}=setup(backend);await initialize();
  raw.prepare('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),a,'badge:faith-clear-1','achievement','f3_points',50,0,'Earlier badge','{}',Date.now());
  await Promise.all([store.read(actor()),store.read(actor())]);
  expect(await store.wallet(actor())).toMatchObject({points:1008,f3_points:1000,lifetime_points:5008});
  const again=await store.read(actor());expect(again.achievements.find(badge=>badge.id==='faith-clear-1')).toMatchObject({reward:50,cashReward:8});
  expect(again.wallet.points).toBe(1008);
 });
 it('completes an older partially delivered Spades partnership at the original match rate',async()=>{
  const {store,initialize,spades,raw}=setup(backend);await initialize();await initialize(b);const match=spades(true),source=`spades:win:${match.match_id}`;
  raw.prepare('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),a,source,'reward','spades_points',150,0,'Earlier team win',JSON.stringify({tier:'humans'}),Date.now());
  const result=await store.claimSpadesReward(match);expect(result).toMatchObject({amount:150,already_credited:false});
  expect((await store.wallet(actor())).spades_points).toBe(1000);expect((await store.wallet(actor(b))).spades_points).toBe(1150);
  expect(await store.claimSpadesReward(match)).toMatchObject({amount:150,already_credited:true});
  expect((await store.wallet(actor(b))).spades_points).toBe(1150);
 });
 it('pays game achievement Cash bonuses once and catches up older claimed badges fairly',async()=>{
  const {store,initialize,raw}=setup(backend);await initialize();await store.creditPuzzle(actor(),'faith-3',1);
  const before=await store.wallet(actor()),badge=ACHIEVEMENTS.find(item=>item.id==='faith-clear-1')!;
  await Promise.all([store.command(actor(),{operation:'claim_achievement',achievementId:badge.id}),store.command(actor(),{operation:'claim_achievement',achievementId:badge.id})]);
  expect((await store.wallet(actor())).points).toBe(before.points+badge.cashReward);
  expect((await store.wallet(actor())).f3_points).toBe(before.f3_points+badge.reward);
  // Restore the exact pre-upgrade state: primary badge paid, new Cash bonus absent.
  raw.prepare('DELETE FROM economy_ledger WHERE user_id=? AND source=?').run(a,`badge-cash:${badge.id}`);
  raw.prepare('UPDATE economy_wallets SET points=points-?,lifetime_points=lifetime_points-? WHERE user_id=?').run(badge.cashReward,badge.cashReward,a);
  await Promise.all([store.read(actor()),store.read(actor())]);
  const after=await store.wallet(actor());expect(after.points).toBe(before.points+badge.cashReward);expect(after.f3_points).toBe(before.f3_points+badge.reward);
  await store.read(actor());expect(await store.wallet(actor())).toEqual(after);
 });
 it('confirms a pre-upgrade conversion receipt at its original rate without another debit',async()=>{
  const {store,initialize,raw}=setup(backend);await initialize();const requestId=randomUUID();
  raw.prepare('INSERT INTO economy_ledger(id,user_id,source,kind,currency,amount,cash,label,detail,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),a,`convert:${requestId}`,'conversion','rummy_points',-10,7,'Earlier conversion',JSON.stringify({game:'rummy',amount:10}),Date.now());
  const before=await store.wallet(actor());
  const result=await store.command(actor(),{operation:'convert',game:'rummy',amount:10,requestId});
  expect(result.receipt).toMatchObject({alreadyApplied:true,amount:10,cash:7});expect(result.wallet).toEqual(before);
 });
 it('sets a trusted tester allowance to a total once while preserving earned points and lifetime',async()=>{
  const {store,initialize,raw}=setup(backend);await initialize(a,legacy({points:650,rummy_points:91,lifetime_points:100}));
  raw.prepare('INSERT INTO economy_allowances(id,user_id,target_cash,reason,created_at) VALUES(?,?,?,?,?)').run('test-allowance',a,3000,'Tester allowance',Date.now());
  await Promise.all([store.read(actor()),store.read(actor())]);
  expect(await store.wallet(actor())).toMatchObject({points:3000,rummy_points:91,lifetime_points:100});
  expect(raw.prepare('SELECT amount FROM economy_ledger WHERE source=?').get('allowance:test-allowance')?.amount).toBe(2350);
  expect(raw.prepare('SELECT applied_at FROM economy_allowances WHERE id=?').get('test-allowance')?.applied_at).toBeTypeOf('number');
  await store.command(actor(),{operation:'convert',game:'rummy',amount:13,requestId:randomUUID()});
  await store.read(actor());expect((await store.wallet(actor())).points).toBe(3010);
  await expect(store.command(actor(),{operation:'set_cash',amount:999999})).rejects.toMatchObject({status:400});
 });
 it('keeps an unmigrated tester allowance pending until the original wallet is safely imported',async()=>{
  const {store,raw}=setup(backend);
  raw.prepare('INSERT INTO economy_allowances(id,user_id,target_cash,reason,created_at) VALUES(?,?,?,?,?)').run('later-allowance',b,3000,'Tester allowance',Date.now());
  expect(await store.hasMember(actor(b))).toBe(false);
  await expect(store.read(actor(b))).rejects.toMatchObject({code:'wallet_unavailable'});
  await store.ensureMember(actor(b),legacy({points:125,lifetime_points:50,rummy_points:77,owned:['faith3-skin-jade']}));
  const view=await store.read(actor(b));
  expect(view.wallet).toMatchObject({points:3000,lifetime_points:50,rummy_points:77,owned:['faith3-skin-jade']});
  expect(view.achievements.find(item=>item.id==='member-points-100')?.unlocked).toBe(false);
 });
 it('rolls wallet updates back when a ledger insertion fails',async()=>{
  const {store,initialize,binding}=setup(backend);await initialize();let armed=true;
  const sabotaged:D1Binding={prepare:sql=>binding.prepare(sql),batch:async statements=>{if(armed){armed=false;return binding.batch([...statements,binding.prepare('INSERT INTO command_guards(valid) VALUES(0)')]);}return binding.batch(statements);}};
  const failing=new EconomyStore(sabotaged); // First batch rolls back, then the guarded retry succeeds once.
  await failing.command(actor(),{operation:'convert',game:'rummy',amount:130,requestId:randomUUID()});
  expect((await store.wallet(actor())).rummy_points).toBe(870);expect((await store.wallet(actor())).points).toBe(1100);
 });
});

describe('reward catalog coverage',()=>{
 it('has unique achievement IDs and increasing major milestone rewards for every game and members',()=>{
  expect(new Set(ACHIEVEMENTS.map(a=>a.id)).size).toBe(ACHIEVEMENTS.length);expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(55);
  for(const group of [...POINT_GAMES,'clubhouse'])expect(ACHIEVEMENTS.filter(a=>a.group===group).length).toBeGreaterThanOrEqual(7);
  for(const prefix of ['faith-clear','gems-clear','rummy-victory','spades-victory']){const items=ACHIEVEMENTS.filter(a=>a.id.startsWith(prefix));expect(items.at(-1)!.reward).toBeGreaterThan(items[0]!.reward*10);}
  for(const badge of ACHIEVEMENTS)expect(badge.cashReward).toBeGreaterThan(0);
  expect(ECONOMY_CATALOG.find(i=>i.id==='rummy-jokers')).toMatchObject({price:500,currency:'rummy_points'});
 });
});
