import { afterEach,describe,it,expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { applyMove,rummyCallOptions,waitingForRummy,parseMove } from '../src/lib/rummy-engine';
import { newGame,cardValue,type State } from '../src/lib/rummy';
import { RoomStore } from '../server/rooms';
import { CloudRoomStore } from '../server/cloud-rooms';
import { TestD1 } from './helpers/d1';
const players=[{id:'one',name:'Alice',bot:false},{id:'two',name:'Bob',bot:false},{id:'three',name:'Cleo',bot:false}];
function fixture():State {return {...newGame('r500',players,Math.random),phase:'play',turn:1,deck:['KH','9C','TD','2D'],hands:[['2S','9D'],['6S','8D'],['4H','8C']],discard:['AC'],melds:[{cards:['3S','4S','5S'].map(c=>({c,by:0}))}],laid:[15,0,0],mustUse:null,drewDiscard:null};}
const closes:(()=>void)[]=[];afterEach(()=>closes.splice(0).forEach(f=>f()));
describe('Call Rummy rule',()=>{
 it.each(['classic','r500'] as const)('claims another player’s playable discard in %s without changing turn or hands',variant=>{
  const initial=fixture();initial.variant=variant;const discarded=applyMove(initial,1,{t:'discard',card:'6S'})!;
  expect(discarded).toMatchObject({turn:2,phase:'draw',rummyClaim:{card:'6S',discarder:1,declined:[]}});
  expect(rummyCallOptions(discarded,0)).toEqual([0]);expect(rummyCallOptions(discarded,1)).toEqual([]);
  const called=applyMove(discarded,0,{t:'rummy',meld:0})!;
  expect(called.hands).toEqual(discarded.hands);expect(called.turn).toBe(2);expect(called.phase).toBe('draw');expect(called.discard).toEqual(['AC']);expect(called.melds[0]!.cards.at(-1)).toEqual({c:'6S',by:0});expect(called.laid[0]).toBe(15+cardValue('6S',variant));expect(called.activity!.at(-1)).toMatchObject({kind:'rummy',seat:0,cards:['6S']});expect(applyMove(called,2,{t:'rummy',meld:0})).toBeNull();expect(initial.hands[1]).toContain('6S');
 });
 it('closes the claim on the next draw, rejects own discards, illegal targets, stale cards and Gin',()=>{
  const state=applyMove(fixture(),1,{t:'discard',card:'6S'})!;
  expect(applyMove(state,1,{t:'rummy',meld:0})).toBeNull();expect(applyMove(state,0,{t:'rummy',meld:20})).toBeNull();
  const drawn=applyMove(state,2,{t:'draw',from:'stock'})!;expect(drawn.rummyClaim).toBeNull();expect(applyMove(drawn,0,{t:'rummy',meld:0})).toBeNull();
  expect(applyMove({...state,variant:'gin'},0,{t:'rummy',meld:0})).toBeNull();expect(applyMove({...state,discard:['7S']},0,{t:'rummy',meld:0})).toBeNull();expect(parseMove({t:'rummy',meld:0,points:999})).toBeNull();
 });
 it('lets an eligible player pass without losing their normal draw, and does not repeat that offer',()=>{
  const state=applyMove(fixture(),1,{t:'discard',card:'6S'})!,passed=applyMove(state,0,{t:'pass-rummy'})!;
  expect(passed.rummyClaim!.declined).toEqual([0]);expect(passed.hands).toEqual(state.hands);expect(rummyCallOptions(passed,0)).toEqual([]);expect(waitingForRummy(passed)).toBe(true);
  expect(applyMove(passed,0,{t:'pass-rummy'})).toBeNull();expect(applyMove(passed,2,{t:'draw',from:'stock'})!.phase).toBe('play');
 });
 it('does not offer claims on an unplayable discard or after a hand is over',()=>{
  const state=fixture();expect(applyMove(state,1,{t:'discard',card:'8D'})!.rummyClaim).toBeNull();state.hands[1]=['6S'];const ended=applyMove(state,1,{t:'discard',card:'6S'})!;expect(ended.phase).toBe('roundOver');expect(rummyCallOptions(ended,0)).toEqual([]);
 });
});
describe.each(['node','d1'] as const)('Call Rummy room persistence on %s',backend=>{
 it('accepts an out-of-turn online caller once and rejects a competing stale call',async()=>{
  const d1=backend==='d1'?new TestD1():null,local=d1?null:new RoomStore(':memory:'),raw=d1?.sqlite??local!.db,store=d1?new CloudRoomStore(d1):local!;closes.push(()=>raw.close());
  const actors=[0,1,2].map(seat=>({principal:`guest:online-${seat}`,jokers:false}));
  let view=(await store.command(actors[0]!,{operation:'create',name:'Alice',options:{mode:'online',variant:'r500',seats:3,level:'normal',jokers:false}})).view;
  for(const seat of [1,2]){await store.command(actors[seat]!,{operation:'join',code:view.code,name:players[seat]!.name});view=(await store.command(actors[seat]!,{operation:'ready',code:view.code,ready:true})).view;}
  view=(await store.command(actors[0]!,{operation:'start',code:view.code,revision:view.revision})).view;
  const row=JSON.parse(String(raw.prepare('SELECT data FROM rooms WHERE code=?').get(view.code)!.data)),state=fixture();state.players=row.state.players;row.state=applyMove(state,1,{t:'discard',card:'6S'});raw.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(row),view.code);
  const request={operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'rummy',meld:0}};
  const called=await store.command(actors[0]!,request);expect(called.view.turn).toBe(2);expect(called.view.melds[0]!.cards.at(-1)).toEqual({c:'6S',by:0});
  await expect(Promise.resolve().then(()=>store.command(actors[2]!,{...request,requestId:randomUUID()}))).rejects.toMatchObject({code:'stale'});
  const peer=await store.get(view.code,actors[2]!.principal);expect(peer.melds).toEqual(called.view.melds);expect(peer.hand).toEqual(['4H','8C']);expect(peer.hand).not.toEqual(called.view.hand);expect(peer.activity!.at(-1)?.kind).toBe('rummy');
 });
 it.each(['rummy','pass-rummy'] as const)('pauses the bot sequence for a human, accepts %s and resumes once',async action=>{
  const d1=backend==='d1'?new TestD1():null,local=d1?null:new RoomStore(':memory:'),raw=d1?.sqlite??local!.db,store=d1?new CloudRoomStore(d1):local!;closes.push(()=>raw.close());
  const actor={principal:'guest:test-caller',jokers:false};
  let view=(await store.command(actor,{operation:'create',name:'Alice',options:{mode:'bot',variant:'r500',seats:3,level:'normal',jokers:false}})).view;
  const row=JSON.parse(String(raw.prepare('SELECT data FROM rooms WHERE code=?').get(view.code)!.data));
  const state=fixture();state.players=row.state.players;row.state=applyMove(state,1,{t:'discard',card:'6S'});raw.prepare('UPDATE rooms SET data=? WHERE code=?').run(JSON.stringify(row),view.code);
  view=await store.get(view.code,actor.principal);expect(view.rummyClaim?.card).toBe('6S');expect(view.turn).toBe(2);expect(view.hand).toEqual(['2S','9D']);expect(view).not.toHaveProperty('hands');
  const command={operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:action==='rummy'?{t:action,meld:0}:{t:action}};
  const result=await store.command(actor,command);expect(result.view.turn).toBe(0);expect(result.view.rummyClaim).toBeNull();
  if(action==='rummy')expect(result.view.melds[0]!.cards.at(-1)).toEqual({c:'6S',by:0});
  const retry=await store.command(actor,command);expect(retry.changed).toBe(false);expect(retry.view.melds).toEqual(result.view.melds);
 });
});
