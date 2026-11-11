import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {RoomStore} from '../server/rooms';
import {createGameServer} from '../server/http';
import {MATCH_GAMES} from '../src/lib/matchmaking';
const cleanup:(()=>Promise<void>)[]=[];afterEach(async()=>{for(const f of cleanup.splice(0))await f();});
const ids=Array.from({length:5},(_,i)=>`${i+1}2222222-2222-4222-8222-222222222222`);
async function setup(){
 const store=new RoomStore(':memory:'),app=createGameServer({store,verifyMember:async token=>({principal:`member:${ids[Number(token)]}`,jokers:true,owned:['rummy-jokers','spades-partnerships','five-dice-party']})});
 await new Promise<void>(resolve=>app.server.listen(0,'127.0.0.1',resolve));const port=(app.server.address() as {port:number}).port,base=`http://127.0.0.1:${port}`;
 cleanup.push(async()=>{app.closeStreams();await app.rewards.stop();await new Promise<void>(resolve=>app.server.close(()=>resolve()));store.close();});
 const call=async(path:string,actor:number,body?:unknown)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${actor}`,Origin:base,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};};
 return {base,call};
}
const view=(data:any)=>data.view??data;
describe('Match Making HTTP routes with real room stores',()=>{
 it.each(MATCH_GAMES)('%s: publish, discover, join, ready and start through the production-shaped APIs',async game=>{
  const {call}=await setup();
  const options=game==='carrom'?{mode:'online',seats:2,level:'normal',variant:'carrom'}:game==='backgammon'?{mode:'online',seats:2,level:'normal',variant:'standard',target:3,crawford:true}:game==='crown-court'?{mode:'online',seats:2,level:'normal',length:'long'}:game==='rummy'?{mode:'online',variant:'r500',seats:2,level:'normal',jokers:false}:game==='spades'?{mode:'online',variant:'solo',humans:4,level:'normal',target:100,table:'spades-table-classic',deck:'spades-deck-classic'}:(game==='five-dice'||game==='farkle')?{mode:'online',seats:2,level:'normal'}:{mode:'online',variant:'muggins',target:100,level:'normal'};
  const special=game==='carrom'||game==='backgammon'||game==='dominoes'||game==='five-dice'||game==='farkle'||game==='crown-court';
  const created=await call(`/api/${game}`,0,{operation:'create',name:'Host',options,...(special?{requestId:randomUUID()}:{})});expect(created.status).toBe(200);const code=view(created.body).code;
  expect((await call(`/api/${game}/matchmaking`,1)).body.rooms).toEqual([]);
  expect((await call(`/api/${game}/matchmaking`,1,{operation:'publish',code})).status).toBe(403);
  expect((await call(`/api/${game}/matchmaking`,0,{operation:'publish',code})).body).toEqual({listed:true});
  expect((await call(`/api/${game}/matchmaking`,1)).body.rooms[0]).toMatchObject({code,occupied:1});
  const seats=game==='spades'?4:2;
  for(let actor=1;actor<seats;actor++){
   const joined=await call(`/api/${game}/matchmaking`,actor,{operation:'join',code,name:'Guest',requestId:randomUUID()});expect(joined.status).toBe(200);expect(view(joined.body)).toMatchObject({code,status:'waiting'});
   expect((await call(`/api/${game}`,actor,{operation:'ready',code,ready:true,...(special?{requestId:randomUUID()}:{})})).status).toBe(200);
  }
  expect((await call(`/api/${game}/matchmaking`,4)).body.rooms).toEqual([]);
  const before=(await call(`/api/${game}/room/${code}`,0)).body;
  const start=await call(`/api/${game}`,0,{operation:'start',code,revision:before.revision,...(special?{requestId:randomUUID()}:{})});expect(start.status).toBe(200);expect(view(start.body).status).toBe('playing');
  expect((await call(`/api/${game}/matchmaking`,0)).body.rooms).toEqual([]);
  expect((await call(`/api/${game}/room/${code}`,4)).status).toBe(403);
 });
 it('rejects foreign-origin lobby writes and supports public browsing with a stable guest cookie',async()=>{
  const {base}=await setup(),first=await fetch(base+'/api/dominoes/matchmaking');expect(first.status).toBe(200);expect(first.headers.get('set-cookie')).toContain('HttpOnly');
  const response=await fetch(base+'/api/dominoes/matchmaking',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json'},body:JSON.stringify({operation:'publish',code:'ABCDEF12'})});expect(response.status).toBe(403);
 });
});
