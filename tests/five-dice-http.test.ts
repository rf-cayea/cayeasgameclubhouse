import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { RoomStore, type Identity } from '../server/rooms';
import { createGameServer } from '../server/http';
import type { FiveDiceRoomView } from '../src/lib/five-dice-protocol';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const settings = { mode:'online', seats:2, level:'normal' };
type Auth = {cookie:string}|{token:string};
function authHeaders(auth:Auth):Record<string,string> { return 'cookie' in auth?{cookie:auth.cookie}:{Authorization:`Bearer ${auth.token}`}; }
async function app() {
 const root=new RoomStore(':memory:');
 const instance=createGameServer({store:root,verifyMember:async token=>{
  const id=ids[Number(token)];if(!id)throw new Error('Isolated test identity missing');return {principal:`member:${id}`,jokers:false,owned:[]} as Identity;
 }});
 await new Promise<void>(resolve=>instance.server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(instance.server.address() as AddressInfo).port}`;
 cleanup.push(async()=>{instance.closeStreams();await instance.rewards.stop();await new Promise<void>(resolve=>instance.server.close(()=>resolve()));root.close();});
 const get=(path:string,auth?:Auth,signal?:AbortSignal)=>fetch(base+path,{headers:auth?authHeaders(auth):{},signal});
 const post=(path:string,auth:Auth,data:unknown,origin?:string)=>fetch(base+path,{method:'POST',headers:{...authHeaders(auth),'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
 const command=async(auth:Auth,data:Record<string,unknown>)=>{
  const response=await post('/api/five-dice',auth,{requestId:randomUUID(),...data});
  const result=await response.json() as {view:FiveDiceRoomView;changed:boolean;error?:string};
  expect(response.status,result.error).toBe(200);expect(result.view?.code).toMatch(/^[A-F0-9]{8}$/);return result.view;
 };
 const guest=async():Promise<Auth>=>{const response=await get('/api/five-dice/session');expect(response.status).toBe(200);const cookie=response.headers.get('set-cookie');expect(cookie).toContain('HttpOnly');return {cookie:cookie!.split(';')[0]!};};
 return {root,instance,base,get,post,command,guest};
}

describe('Quintsee real HTTP boundary',()=>{
 it('plays with distinct guest sessions, publishes live revisions and rejects forged, stale and stranger actions',async()=>{
  const {get,post,command,guest}=await app();const one=await guest(),two=await guest(),stranger=await guest();expect(one).not.toEqual(two);
  let room=await command(one,{operation:'create',name:'Alice',options:settings});
  expect(room.status).toBe('waiting');expect(room.players.filter(player=>player.occupied)).toHaveLength(1);
  const second=await command(two,{operation:'join',code:room.code,name:'Bob'});expect(second.mySeat).toBe(1);
  room=await command(two,{operation:'ready',code:room.code,ready:true});
  const controller=new AbortController();const stream=await get(`/api/five-dice/room/${room.code}/events`,one,controller.signal);
  expect(stream.headers.get('content-type')).toContain('text/event-stream');const reader=stream.body!.getReader();await reader.read();
  try{
   room=await command(one,{operation:'start',code:room.code,revision:room.revision});expect(room.status).toBe('playing');
   expect(new TextDecoder().decode((await reader.read()).value)).toContain('revision');
   expect((await get(`/api/five-dice/room/${room.code}`,stranger)).status).toBe(403);
   const illegalTurn=await post('/api/five-dice',two,{operation:'move',code:room.code,revision:room.revision,requestId:randomUUID(),move:{t:'roll'}});expect(illegalTurn.status).toBeGreaterThanOrEqual(400);
   const forged=await post('/api/five-dice',one,{operation:'move',code:room.code,revision:room.revision,requestId:randomUUID(),move:{t:'roll',dice:[6,6,6,6,6]}});expect(forged.status).toBeGreaterThanOrEqual(400);
   const roll={operation:'move',code:room.code,revision:room.revision,requestId:randomUUID(),move:{t:'roll'}};
   const rolled=await post('/api/five-dice',one,roll);expect(rolled.status).toBe(200);const first=await rolled.json() as {view:FiveDiceRoomView};
   expect(first.view.state?.rolls).toBe(1);expect(first.view.state?.dice.every(value=>Number.isInteger(value)&&value>=1&&value<=6)).toBe(true);
   const replay=await post('/api/five-dice',one,roll);expect(replay.status).toBe(200);const duplicate=await replay.json() as {view:FiveDiceRoomView;changed:boolean};
   expect(duplicate.changed).toBe(false);expect(duplicate.view).toEqual(first.view);
   const stale=await post('/api/five-dice',one,{...roll,requestId:randomUUID()});expect(stale.status).toBe(409);
   const reused=await post('/api/five-dice',one,{...roll,move:{t:'score',category:'chance'}});expect(reused.status).toBeGreaterThanOrEqual(400);
   const held=await command(one,{operation:'move',code:room.code,revision:first.view.revision,move:{t:'hold',index:0}});expect(held.state?.held[0]).toBe(true);
   const scored=await command(one,{operation:'move',code:room.code,revision:held.revision,move:{t:'score',category:'chance'}});
   expect(scored.state?.turn).toBe(1);expect(scored.state?.cards[0]?.scores.chance).toBe(first.view.state!.dice.reduce((sum,value)=>sum+value,0));
   const peer=await (await get(`/api/five-dice/room/${room.code}`,two)).json() as FiveDiceRoomView;expect(peer.state).toEqual(scored.state);expect(peer.mySeat).toBe(1);
   const races=await Promise.all([0,1].map(()=>post('/api/five-dice',two,{operation:'move',code:room.code,revision:scored.revision,requestId:randomUUID(),move:{t:'roll'}})));
   expect(races.map(response=>response.status).sort()).toEqual([200,409]);
   const afterRace=await (await get(`/api/five-dice/room/${room.code}`,two)).json() as FiveDiceRoomView;expect(afterRace.state?.rolls).toBe(1);
   expect((await post('/api/five-dice',one,{operation:'leave',code:room.code,requestId:randomUUID()},'https://cross-site.invalid')).status).toBe(403);
  }finally{controller.abort();await reader.cancel().catch(()=>{});}
 },20000);
 it.each(['easy','normal','hard'])('starts a free %s computer match with no group purchase',async level=>{
  const {command,guest}=await app();const actor=await guest();const room=await command(actor,{operation:'create',name:'Alice',options:{mode:'bot',seats:2,level}});
  expect(room.status).toBe('playing');expect(room.players.filter(player=>player.bot)).toHaveLength(1);expect(room.options.level).toBe(level);expect(room.reward.status).toBe('ineligible');
 });
 it.each([3,4])('requires the 750-point unlock for every human at a %i-player table and ignores client ownership claims',async seats=>{
  const {root,get,post,command}=await app();const actors:Auth[]=ids.slice(0,seats).map((_,index)=>({token:String(index)}));
  const catalog=await (await get('/api/economy/catalog')).json() as {items:{id:string;price:number;cashPrice:number;currency:string}[]};
  expect(catalog.items.find(item=>item.id==='five-dice-party')).toMatchObject({price:750,cashPrice:578,currency:'dice_points'});
  for(const actor of actors)expect((await get('/api/economy',actor)).status).toBe(200);
  const blocked=await post('/api/five-dice',actors[0]!,{operation:'create',requestId:randomUUID(),name:'Alice',options:{...settings,seats},owned:['five-dice-party']});expect(blocked.status).toBeGreaterThanOrEqual(400);
  const unlock=async(index:number)=>{root.db.prepare('UPDATE economy_wallets SET dice_points=750 WHERE user_id=?').run(ids[index]!);const result=await post('/api/economy',actors[index]!,{operation:'purchase',itemId:'five-dice-party'});expect(result.status).toBe(200);const value=await result.json() as {wallet:{dice_points:number;owned:string[]}};expect(value.wallet.dice_points).toBe(0);expect(value.wallet.owned).toContain('five-dice-party');};
  await unlock(0);let room=await command(actors[0]!,{operation:'create',name:'Alice',options:{...settings,seats}});
  expect((await post('/api/five-dice',actors[1]!,{operation:'join',requestId:randomUUID(),code:room.code,name:'Bob'})).status).toBe(403);
  for(const index of Array.from({length:seats-1},(_,i)=>i+1)){await unlock(index);await command(actors[index]!,{operation:'join',code:room.code,name:`Player ${index+1}`});room=await command(actors[index]!,{operation:'ready',code:room.code,ready:true});}
  room=await command(actors[0]!,{operation:'start',code:room.code,revision:room.revision});expect(room.status).toBe('playing');expect(room.state?.players).toHaveLength(seats);
  root.db.prepare('UPDATE economy_wallets SET owned=? WHERE user_id=?').run('[]',ids[1]!);
  expect((await get(`/api/five-dice/room/${room.code}`,actors[1])).status).toBe(403);
 },20000);
});
