import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DominoFace} from '../src/components/DominoArtwork';
import {DieFace} from '../src/components/FarkleDice';
import {afterEach,describe,it,expect} from 'vitest';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {EconomyStore} from '../server/economy';
import {TestD1} from './helpers/d1';
import {DOMINO_SKINS,DOMINO_INCLUDED_SKINS,DOMINO_SKIN_SLOT,NUMBERED_DOMINO_SKIN,equippedDominoSkin} from '../src/lib/dominoes-skins';
import {ECONOMY_CATALOG} from '../src/lib/economy-protocol';
import {FARKLE_DICE_SETS} from '../src/lib/farkle-dice';
const closes:(()=>void)[]=[];afterEach(()=>closes.splice(0).forEach(f=>f()));
const actors=[{principal:'member:11111111-1111-4111-8111-111111111111'},{principal:'member:22222222-2222-4222-8222-222222222222'}];
async function setup(backend:'node'|'d1'){
 const d1=backend==='d1'?new TestD1():null,node=d1?null:new RoomStore(':memory:'),raw=d1?.sqlite??node!.db;
 if(node){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);}closes.push(()=>raw.close());
 const store=new EconomyStore(d1??nodeSocialBinding(raw));
 for(const actor of actors)await store.ensureMember(actor,{wallet:{points:1000,domino_points:2000,dice_points:500,lifetime_points:3000,owned:[],equipped:{},pending_perks:{}},awards:[]});
 return {store,raw};
}
describe.each(['node','d1'] as const)('Dominoes collections on %s',backend=>{
 it('equips both included standards without a purchase and rejects cross-game equipment',async()=>{
  const{store}=await setup(backend);const before=await store.wallet(actors[0]!);
  for(const skin of DOMINO_INCLUDED_SKINS){const result=await store.command(actors[0]!,{operation:'equip',slot:DOMINO_SKIN_SLOT,itemId:skin.id});expect(equippedDominoSkin(result.wallet).id).toBe(skin.id);expect(result.wallet.domino_points).toBe(before.domino_points);expect(result.wallet.points).toBe(before.points);expect(result.wallet.owned).toEqual([]);}
  expect(equippedDominoSkin({owned:[],equipped:{[DOMINO_SKIN_SLOT]:NUMBERED_DOMINO_SKIN.id}}).id).toBe(NUMBERED_DOMINO_SKIN.id);
  await expect(store.command(actors[0]!,{operation:'equip',slot:'farkle_dice',itemId:NUMBERED_DOMINO_SKIN.id})).rejects.toMatchObject({status:400});
  await expect(store.command(actors[0]!,{operation:'equip',slot:DOMINO_SKIN_SLOT,itemId:'farkle-dice-ruby'})).rejects.toMatchObject({status:400});
 });
 it.each(DOMINO_SKINS)('purchases $name at its dice-equivalent price once, with points or Cash, then equips persistently',async skin=>{
  const{store,raw}=await setup(backend),price=Math.ceil(skin.price*1.25),cash=Math.ceil(Math.ceil(skin.price*10/13)*1.25);
  const counterpart=FARKLE_DICE_SETS.find(d=>d.id.replace('farkle-dice-','domino-skin-')===skin.id)!;expect(counterpart.price).toBe(skin.price);
  expect(ECONOMY_CATALOG.find(i=>i.id===skin.id)).toMatchObject({price,cashPrice:cash,currency:'domino_points',slot:DOMINO_SKIN_SLOT});
  await expect(store.command(actors[0]!,{operation:'equip',slot:DOMINO_SKIN_SLOT,itemId:skin.id})).rejects.toMatchObject({code:'not_owned'});
  const paid=await store.command(actors[0]!,{operation:'purchase',itemId:skin.id});expect(paid.wallet).toMatchObject({domino_points:2000-price,points:1000,dice_points:500,lifetime_points:3000});
  expect((await store.command(actors[0]!,{operation:'purchase',itemId:skin.id,payment:'cash'})).receipt.alreadyApplied).toBe(true);
  const equipped=await store.command(actors[0]!,{operation:'equip',slot:DOMINO_SKIN_SLOT,itemId:skin.id});expect(equippedDominoSkin(equipped.wallet).id).toBe(skin.id);expect((await store.read(actors[0]!)).wallet.equipped[DOMINO_SKIN_SLOT]).toBe(skin.id);
  const boughtCash=await store.command(actors[1]!,{operation:'purchase',itemId:skin.id,payment:'cash'});expect(boughtCash.wallet).toMatchObject({points:1000-cash,domino_points:2000,dice_points:500});
  expect(raw.prepare('SELECT count(*) n FROM economy_ledger WHERE user_id=? AND source=?').get(actors[0]!.principal.slice(7),'purchase:'+skin.id)!.n).toBe(1);
  expect(equippedDominoSkin({owned:[],equipped:{[DOMINO_SKIN_SLOT]:skin.id}}).id).toBe('domino-skin-classic');
 });
});

describe('recognizable domino artwork',()=>{
 it('prints explicit colored numerals including zero for every value in the standard set',()=>{
  const markup=(['0-1','2-3','4-5','6-6'] as const).map(id=>renderToStaticMarkup(createElement(DominoFace,{id,design:NUMBERED_DOMINO_SKIN}))).join('');
  expect(new Set([...markup.matchAll(/data-domino-numeral="([0-6])"/g)].map(m=>m[1])).size).toBe(7);
  expect(markup).toContain('data-domino-numeral="0">0</text>');expect(markup).not.toContain('data-domino-symbol');
 });
 it('keeps the correct pip count in both games when using the shared special pip artwork',()=>{
  for(const symbol of ['skull','sun','seahorse','starfish','clownfish','trident'] as const){
   const skin=DOMINO_SKINS.find(s=>s.symbol===symbol)!,dice=FARKLE_DICE_SETS.find(s=>s.symbol===symbol)!;
   const domino=renderToStaticMarkup(createElement(DominoFace,{id:'6-6',design:skin})),die=renderToStaticMarkup(createElement(DieFace,{value:6,design:dice}));
   expect([...domino.matchAll(new RegExp('data-domino-symbol="'+symbol+'"','g'))]).toHaveLength(12);expect([...die.matchAll(new RegExp('data-pip="'+symbol+'"','g'))]).toHaveLength(6);
  }
 });
});
