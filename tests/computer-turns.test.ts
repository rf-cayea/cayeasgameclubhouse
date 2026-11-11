import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {computerFrame,COMPUTER_STEP_MS} from '../src/lib/computer-turns';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {CloudRoomStore} from '../server/cloud-rooms';
import {CloudSpadesRoomStore} from '../server/cloud-spades-rooms';
import {DominoRoomStore} from '../server/dominoes-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {nodeSocialBinding} from '../server/social-node';
import {newGame} from '../src/lib/rummy';
import {applyMove} from '../src/lib/rummy-engine';
import {TestD1} from './helpers/d1';
import {CLASSIC_DECK,CLASSIC_VENUE} from '../src/lib/spades-cosmetics';
const close:(()=>void)[]=[];afterEach(()=>close.splice(0).forEach(f=>f()));
const actor={principal:'guest:pace-player',jokers:false},peer={principal:'guest:pace-peer',jokers:false};
function setup(backend:'node'|'d1'){
 const d1=backend==='d1'?new TestD1():null,local=d1?null:new RoomStore(':memory:'),raw=d1?.sqlite??local!.db;if(local)initializeEconomyNode(raw);close.push(()=>raw.close());
 return {raw,rummy:d1?new CloudRoomStore(d1):local!,spades:d1?new CloudSpadesRoomStore(d1):new SpadesRoomStore(raw),domino:new DominoRoomStore(d1??nodeSocialBinding(raw))};
}
describe('computer presentation clock',()=>{
 it('holds the player’s play, then shows one verified computer action per interval and unlocks only at the final state',()=>{
  const frames=[{move:'human'},{move:'bot1'},{move:'bot2'},{move:'bot3'}],room={move:'bot3',playback:{id:'turn',startedAt:1000,stepMs:COMPUTER_STEP_MS,frames}};
  expect(computerFrame(room,1000)).toMatchObject({room:frames[0],pacing:true,nextIn:1200});
  expect(computerFrame(room,2199).room).toBe(frames[0]);expect(computerFrame(room,2200).room).toBe(frames[1]);expect(computerFrame(room,3400).room).toBe(frames[2]);
  expect(computerFrame(room,4600)).toMatchObject({room,pacing:false});
 });
 it('does not restart on repeated polls or reconnects, and skips old playback on return to the tab',()=>{
  const room={move:2,playback:{id:'same',startedAt:1000,stepMs:1200,frames:[{move:0},{move:1},{move:2}]}};
  expect(computerFrame({...room},2500).room.move).toBe(1);expect(computerFrame({...room},2700).nextIn).toBe(700);expect(computerFrame(room,10000).pacing).toBe(false);
  expect(computerFrame({move:4},1000)).toMatchObject({room:{move:4},pacing:false});
 });
});
describe.each(['node','d1'] as const)('private computer turns on %s',backend=>{
 it('captures Rummy draws, melds and discards without exposing another hand or stock identities',async()=>{
  const{raw,rummy}=setup(backend);let view=(await rummy.command(actor,{operation:'create',name:'Player',options:{mode:'bot',variant:'classic',seats:2,level:'normal',jokers:false}})).view;
  const row=JSON.parse(String(raw.prepare('SELECT data FROM rooms WHERE code=?').get(view.code)!.data));let state=newGame('classic',row.state.players,()=>.5);state.turn=0;state.opening=null;state=applyMove(state,0,{t:'draw',from:'stock'})!;row.state=state;delete row.presentation;raw.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(row),view.code);
  const request={operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'discard',card:state.hands[0]![0]!}};
  view=(await rummy.command(actor,request)).view;const frames=view.playback!.frames;expect(frames.length).toBeGreaterThanOrEqual(3);expect(frames[0]!.turn).toBe(1);expect(frames[0]!.activity!.at(-1)?.kind).toBe('discard');
  for(const frame of frames){expect(frame).not.toHaveProperty('playback');expect(frame).not.toHaveProperty('hands');expect(frame).not.toHaveProperty('deck');if(frame.phase==='play'||frame.phase==='draw')expect(frame.revealedHands).toBeNull();expect(frame.hand).toEqual(frames[0]!.hand);expect(frame.activity?.filter(a=>a.kind==='stock').every(a=>a.cards.length===0)).toBe(true);}
  expect((await rummy.command(actor,request)).view.playback?.id).toBe(view.playback?.id);
 });
 it('shares Spades pacing in a mixed online table while projecting each viewer’s own hand',async()=>{
  const{spades}=setup(backend);let view=(await spades.command(actor,{operation:'create',name:'Player',options:{mode:'online',variant:'solo',target:100,humans:2,level:'normal',table:CLASSIC_VENUE.id,deck:CLASSIC_DECK.id}})).view;
  await spades.command(peer,{operation:'join',code:view.code,name:'Peer',seat:1});view=(await spades.command(peer,{operation:'ready',code:view.code,ready:true})).view;view=(await spades.command(actor,{operation:'start',code:view.code,revision:view.revision})).view;
  expect(view.turn).toBe(0);view=(await spades.command(actor,{operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'bid',bid:2}})).view;expect(view.turn).toBe(1);view=(await spades.command(peer,{operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'bid',bid:2}})).view;
  expect(view.playback?.frames).toHaveLength(3);const own=await spades.get(view.code,actor.principal);expect(own.playback?.id).toBe(view.playback?.id);
  expect(own.playback!.frames[0]!.hand).not.toEqual(view.playback!.frames[0]!.hand);
  expect(own.playback!.frames.map(f=>f.bids.filter(b=>b!==null).length)).toEqual([2,3,4]);
  for(const frame of own.playback!.frames){expect(frame).not.toHaveProperty('hands');expect(frame).not.toHaveProperty('playback');expect(frame.hand).toHaveLength(13);}
 });
 it('captures a Dominoes response once and keeps live opposing tiles hidden until the hand ends',async()=>{
  const{domino}=setup(backend);let view=(await domino.command(actor,{operation:'create',name:'Player',requestId:randomUUID(),options:{mode:'bot',variant:'draw',level:'normal',target:100}})).view;
  for(let n=0;n<10;n++){
   const option=view.legal[0],request={operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:view.phase==='roundOver'?{t:'next'}:option?{t:'play',tile:option.tile,end:option.end}:view.canDraw?{t:'draw'}:{t:'pass'}};
   view=(await domino.command(actor,request)).view;if(!view.playback)continue;
   for(const frame of view.playback.frames){expect(frame).not.toHaveProperty('state');expect(frame).not.toHaveProperty('hands');expect(frame).not.toHaveProperty('stock');expect(frame).not.toHaveProperty('playback');if(frame.phase==='play')expect(frame.revealedHands).toBeNull();}
   expect((await domino.command(actor,request)).view.playback?.id).toBe(view.playback.id);return;
  }
  throw new Error('No computer response captured');
 });
});
