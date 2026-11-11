import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { RoomStore, type Identity } from '../server/rooms';
import { createGameServer } from '../server/http';
import { dominoValue } from '../src/lib/dominoes';
import type { DominoRoomView } from '../src/lib/dominoes-protocol';
import type { EconomyView } from '../src/lib/economy-protocol';

const cleanup:(()=>Promise<void>)[]=[];
afterEach(async()=>{for(const close of cleanup.splice(0))await close();});
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
type Auth={cookie:string}|{token:string};
const headers=(auth:Auth):Record<string,string>=>'cookie'in auth?{cookie:auth.cookie}:{Authorization:`Bearer ${auth.token}`};
const options={mode:'online',variant:'muggins',level:'normal',target:100};
async function app(){
  const root=new RoomStore(':memory:');
  const instance=createGameServer({store:root,verifyMember:async token=>{
    const id=ids[Number(token)];if(!id)throw new Error('Missing isolated identity');return{principal:`member:${id}`,jokers:false,owned:[]} as Identity;
  }});
  await new Promise<void>(resolve=>instance.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(instance.server.address() as AddressInfo).port}`;
  cleanup.push(async()=>{instance.closeStreams();await instance.rewards.stop();await new Promise<void>(resolve=>instance.server.close(()=>resolve()));root.close();});
  const get=(path:string,auth?:Auth,signal?:AbortSignal)=>fetch(base+path,{headers:auth?headers(auth):{},signal});
  const post=(auth:Auth,data:unknown,origin?:string)=>fetch(base+'/api/dominoes',{method:'POST',headers:{...headers(auth),'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
  const command=async(auth:Auth,data:Record<string,unknown>)=>{
    const response=await post(auth,{requestId:randomUUID(),...data}),result=await response.json() as {view:DominoRoomView;changed:boolean;error?:string};
    expect(response.status,result.error).toBe(200);return result.view;
  };
  const guest=async():Promise<Auth>=>{const response=await get('/api/dominoes/session'),cookie=response.headers.get('set-cookie');expect(response.status).toBe(200);expect(cookie).toContain('HttpOnly');return{cookie:cookie!.split(';')[0]!};};
  async function table(actors:Auth[]){
    let view=await command(actors[0]!,{operation:'create',name:'Alice',options});
    await command(actors[1]!,{operation:'join',name:'Bob',code:view.code});
    view=await command(actors[1]!,{operation:'ready',code:view.code,ready:true});return view;
  }
  return{root,instance,get,post,command,guest,table};
}

describe('Dominoes real HTTP boundary',()=>{
  it('runs private guest lobbies, revision-only events, idempotent moves and reconnects',async()=>{
    const{get,post,command,guest,table}=await app(),actors=[await guest(),await guest()],stranger=await guest();
    expect(actors[0]).not.toEqual(actors[1]);expect((await(await get('/api/dominoes/health')).json()).app).toBe('clubhouse-dominoes');
    let view=await table(actors);
    const controller=new AbortController(),stream=await get(`/api/dominoes/room/${view.code}/events`,actors[0],controller.signal);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');const reader=stream.body!.getReader();
    try{
      const first=new TextDecoder().decode((await reader.read()).value);expect(first).toContain('revision');expect(first).not.toContain('hand');
      view=await command(actors[0]!,{operation:'start',code:view.code,revision:view.revision});
      const event=new TextDecoder().decode((await reader.read()).value);expect(event).toContain('revision');expect(event).not.toContain('hand');
      expect((await get(`/api/dominoes/room/${view.code}`,stranger)).status).toBe(403);
      expect((await get(`/api/dominoes/room/${view.code}/events`,stranger)).status).toBe(403);
      const actor=actors[view.turn]!,own=await(await get(`/api/dominoes/room/${view.code}`,actor)).json() as DominoRoomView,best=own.legal[0]!;
      expect(own.hand).toHaveLength(7);expect(own.revealedHands).toBeNull();expect(own).not.toHaveProperty('state');
      expect((await post(actors[1-view.turn]!,{operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'play',tile:best.tile,end:best.end}})).status).toBe(409);
      const request={operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'play',tile:best.tile,end:best.end}};
      expect((await post(actor,{...request,move:{...request.move,points:500}})).status).toBe(400);
      const played=await post(actor,request);expect(played.status).toBe(200);const saved=await played.json() as{view:DominoRoomView};
      const replay=await post(actor,request);expect(replay.status).toBe(200);expect(await replay.json()).toMatchObject({changed:false,view:saved.view});
      expect((await post(actor,{...request,requestId:randomUUID()})).status).toBe(409);
      const peer=await(await get(`/api/dominoes/room/${view.code}`,actors[1-view.turn])).json() as DominoRoomView;
      expect(peer.board).toEqual(saved.view.board);expect(peer.hand).not.toEqual(saved.view.hand);expect(peer.players[view.turn]?.count).toBe(6);
      expect((await post(actor,{operation:'leave',code:view.code,requestId:randomUUID()},'https://cross-site.invalid')).status).toBe(403);
    }finally{controller.abort();await reader.cancel().catch(()=>{});}
  },20000);
  it('pays a complete member online match automatically and exposes Dominoes balances and achievements on the profile',async()=>{
    const{get,command,table}=await app(),actors:Auth[]=[{token:'0'},{token:'1'}];
    let view=await table(actors);view=await command(actors[0]!,{operation:'start',code:view.code,revision:view.revision});
    for(let n=0;n<1500&&view.phase!=='finished';n++){
      const seat=view.phase==='roundOver'?0:view.turn;
      view=await(await get(`/api/dominoes/room/${view.code}`,actors[seat])).json() as DominoRoomView;
      const best=[...view.legal].sort((a,b)=>b.points-a.points||dominoValue(b.tile)-dominoValue(a.tile))[0];
      view=await command(actors[seat]!,{operation:'move',code:view.code,revision:view.revision,move:view.phase==='roundOver'?{t:'next'}:best?{t:'play',tile:best.tile,end:best.end}:view.canDraw?{t:'draw'}:{t:'pass'}});
    }
    expect(view.phase).toBe('finished');const winner=actors[view.winner!]!;
    const done=await(await get(`/api/dominoes/room/${view.code}`,winner)).json() as DominoRoomView;expect(done.reward).toMatchObject({status:'credited',amount:50});
    for(let n=0;n<2;n++){
      const economy=await(await get('/api/economy',winner)).json() as EconomyView;
      expect(economy.wallet.domino_points).toBe(50);expect(economy.stats).toMatchObject({dominoWins:1,dominoHumanWins:1,gamesPlayed:1});
      expect(economy.achievements.find(a=>a.id==='dominoes-victory-1')?.unlocked).toBe(true);
      expect(economy.history.filter(h=>h.source.startsWith('dominoes:win:'))).toHaveLength(1);
    }
    const loser=await(await get('/api/economy',actors[1-view.winner!])).json() as EconomyView;expect(loser.wallet.domino_points).toBe(0);
    expect((await get(`/api/economy/players/${ids[view.winner!]}`,actors[1-view.winner!])).status).toBe(200);
  },20000);
});
