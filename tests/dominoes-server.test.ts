import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RoomStore, type Identity } from '../server/rooms';
import { DominoRoomStore } from '../server/dominoes-rooms';
import { initializeEconomyNode } from '../server/economy-node';
import { nodeSocialBinding, initializeSocialNode } from '../server/social-node';
import { SpadesRoomStore } from '../server/spades-rooms';
import { TestD1 } from './helpers/d1';
import { EconomyStore } from '../server/economy';
import { dominoValue, type DominoMove, type DominoVariant } from '../src/lib/dominoes';
import { dominoWinner, type DominoMatchReward } from '../src/lib/dominoes-rewards';
import type { DominoRoomView } from '../src/lib/dominoes-protocol';

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const guest=(seat=0):Identity=>({principal:`guest:domino-${seat}`,jokers:false});
const member=(seat=0):Identity=>({principal:`member:${ids[seat]}`,jokers:false,owned:[]});
const settings={mode:'online',variant:'draw',level:'normal',target:100};
const closes:(()=>void)[]=[];
afterEach(()=>closes.splice(0).forEach(close=>close()));
function setup(kind:'node'|'d1') {
  const d1=kind==='d1'?new TestD1():null,node=d1?null:new RoomStore(':memory:'),raw=d1?.sqlite??node!.db;
  if(node){initializeEconomyNode(raw);initializeSocialNode(raw);new SpadesRoomStore(raw);}
  closes.push(()=>raw.close());
  const binding=d1??nodeSocialBinding(raw),store=()=>new DominoRoomStore(binding);
  const command=(actor:Identity,input:Record<string,unknown>)=>store().command(actor,{requestId:randomUUID(),...input});
  async function online(actors=[guest(),guest(1)],variant:DominoVariant='draw') {
    let view=(await command(actors[0]!,{operation:'create',name:'Host',options:{...settings,variant}})).view;
    await command(actors[1]!,{operation:'join',code:view.code,name:'Peer'});
    view=(await command(actors[1]!,{operation:'ready',code:view.code,ready:true})).view;
    view=(await command(actors[0]!,{operation:'start',code:view.code,revision:view.revision})).view;
    return {actors,view};
  }
  async function finish(actors:Identity[],initial:DominoRoomView) {
    let view=initial;
    for(let n=0;n<2500&&view.phase!=='finished';n++) {
      const seat=view.phase==='roundOver'?0:view.turn;
      view=await store().get(view.code,actors[seat]!.principal);
      const best=[...view.legal].sort((a,b)=>b.points-a.points||dominoValue(b.tile)-dominoValue(a.tile))[0];
      const move:DominoMove=view.phase==='roundOver'?{t:'next'}:best?{t:'play',tile:best.tile,end:best.end}:view.canDraw?{t:'draw'}:{t:'pass'};
      view=(await command(actors[seat]!,{operation:'move',code:view.code,revision:view.revision,move})).view;
    }
    expect(view.phase).toBe('finished');return view;
  }
  return {raw,binding,store,command,online,finish};
}

describe.each(['node','d1'] as const)('authoritative Dominoes on %s',kind=>{
  it('keeps hands and stock identities private, with only played tiles and counts public',async()=>{
    const {store,online,raw}=setup(kind),{actors,view}=await online();
    const peer=await store().get(view.code,actors[1]!.principal);
    const stored=JSON.parse(String(raw.prepare('SELECT data FROM domino_rooms WHERE code=?').get(view.code)!.data));
    expect(view.hand).toEqual(stored.state.hands[0]);expect(peer.hand).toEqual(stored.state.hands[1]);
    expect(view).not.toHaveProperty('state');expect(view).not.toHaveProperty('stock');expect(view).not.toHaveProperty('hands');
    expect(view.revealedHands).toBeNull();expect(view.stockCount).toBe(14);
    expect(view.players.map(p=>p.count)).toEqual([7,7]);
    expect(JSON.stringify(view)).not.toContain('guest:domino');
    const notTurn=view.turn===0?view:peer;expect(notTurn.legal.length).toBeGreaterThan(0);
    expect((view.turn===0?peer:view).legal).toEqual([]);
    await expect(store().get(view.code,guest(3).principal)).rejects.toMatchObject({status:403});
  });
  it('requires two ready players and host authority, including the next hand',async()=>{
    const {command,store,online}=setup(kind),a=guest(),b=guest(1);
    let {view}=await command(a,{operation:'create',name:'Host',options:settings});
    await expect(command(a,{operation:'start',code:view.code,revision:view.revision})).rejects.toMatchObject({code:'not_ready'});
    await command(b,{operation:'join',code:view.code,name:'Peer'});view=await store().get(view.code,a.principal);
    await expect(command(b,{operation:'start',code:view.code,revision:view.revision})).rejects.toMatchObject({code:'not_host'});
    await expect(command(a,{operation:'start',code:view.code,revision:view.revision})).rejects.toMatchObject({code:'not_ready'});
    const table=await online();view=table.view;
    const wrong=table.actors[1-view.turn]!;
    await expect(command(wrong,{operation:'move',code:view.code,revision:view.revision,move:{t:'pass'}})).rejects.toMatchObject({code:'illegal_move'});
    await expect(command(table.actors[1]!,{operation:'move',code:view.code,revision:view.revision,move:{t:'next'}})).rejects.toMatchObject({code:'not_host'});
  });
  it('commits retries and concurrent actions once, rejects stale revisions and action-ID reuse',async()=>{
    const {online,store,raw}=setup(kind),{actors,view}=await online();
    const actor=actors[view.turn]!,own=await store().get(view.code,actor.principal),best=own.legal[0]!;
    const request={operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'play',tile:best.tile,end:best.end}};
    const result=await Promise.all([store().command(actor,request),store().command(actor,request)]);
    expect(result.map(r=>r.changed).sort()).toEqual([false,true]);
    expect(result[0]!.view.board).toHaveLength(1);expect(result[1]!.view.board).toEqual(result[0]!.view.board);
    await expect(store().command(actor,{...request,move:{t:'pass'}})).rejects.toMatchObject({code:'request_reused'});
    await expect(store().command(actor,{...request,requestId:randomUUID()})).rejects.toMatchObject({code:'stale'});
    let next=await store().get(view.code,actors[1-view.turn]!.principal);
    const nextMove=next.legal[0]?{t:'play',tile:next.legal[0].tile,end:next.legal[0].end}:next.canDraw?{t:'draw'}:{t:'pass'};
    const race=await Promise.allSettled([0,1].map(()=>store().command(actors[next.turn]!,{operation:'move',code:next.code,revision:next.revision,requestId:randomUUID(),move:nextMove})));
    expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(race.find(r=>r.status==='rejected')).toMatchObject({reason:{code:'stale'}});
    expect((await store().command(actor,request)).view.revision).toBe(next.revision+1);
    expect(raw.prepare('SELECT count(*) n FROM domino_requests WHERE request_id=?').get(request.requestId)!.n).toBe(1);
  });
  it('rejects forged tiles, scores, random sources, options and creation-ID reuse',async()=>{
    const {store,command}=setup(kind),a=guest();
    for(const options of [{...settings,variant:'constructor'},{...settings,target:'100'},{...settings,level:{}},{...settings,random:0},{...settings,seats:4}])await expect(command(a,{operation:'create',name:'Host',options})).rejects.toMatchObject({status:400});
    const request={operation:'create',requestId:randomUUID(),name:'Host',options:{...settings,mode:'bot'}};
    const {view}=await store().command(a,request);expect((await store().command(a,request)).view.code).toBe(view.code);
    await expect(store().command(a,{...request,name:'Changed'})).rejects.toMatchObject({code:'request_reused'});
    for(const move of [{t:'play',tile:'6-7',end:'right'},{t:'draw',tiles:['6-6']},{t:'play',tile:'6-6',end:'right',points:1000}])await expect(command(a,{operation:'move',code:view.code,revision:view.revision,move})).rejects.toMatchObject({status:400});
  });
  it.each(['draw','block','muggins'] as const)('completes a full %s online match and credits only its member winner, once',async variant=>{
    const {online,finish,raw,binding,store}=setup(kind),actors=[member(),member(1)],table=await online(actors,variant),end=await finish(actors,table.view);
    const row=raw.prepare('SELECT payload FROM domino_rewards').get()!,result=JSON.parse(String(row.payload)) as DominoMatchReward,winner=dominoWinner(result)!;
    expect(winner).toBe(ids[end.winner!]);expect(result.variant).toBe(variant);expect(result.players.map(p=>p.user_id)).toEqual(ids);
    expect(end.revealedHands).toHaveLength(2);expect(result).not.toHaveProperty('hands');
    const economy=new EconomyStore(binding);await Promise.all(actors.map(actor=>economy.ensureMember(actor)));
    const receipt=await economy.claimDominoReward(result);expect(receipt).toMatchObject({amount:50,already_credited:false,tier:'humans'});
    expect(await economy.claimDominoReward(result)).toMatchObject({amount:50,already_credited:true});
    const won=await economy.read(actors[end.winner!]!),lost=await economy.read(actors[1-end.winner!]!);
    expect(won.wallet.domino_points).toBe(50);expect(won.stats).toMatchObject({dominoWins:1,dominoHumanWins:1,gamesPlayed:1});expect(lost.wallet.domino_points).toBe(0);
    expect((await store().get(end.code,actors[end.winner!]!.principal)).reward.status).toBe('credited');
    await expect(economy.claimDominoReward({...result,scores:[999,0]})).rejects.toMatchObject({code:'reward_unverified'});
    const achievement=won.achievements.find(a=>a.id==='dominoes-victory-1');expect(achievement?.unlocked).toBe(true);
    const winnerActor=actors[end.winner!]!;
    await economy.command(winnerActor,{operation:'claim_achievement',achievementId:'dominoes-victory-1'});
    const collected=await economy.read(winnerActor);
    expect(collected.wallet.domino_points).toBe(70);expect(collected.wallet.points).toBe(2);
    await economy.command(winnerActor,{operation:'claim_achievement',achievementId:'dominoes-victory-1'});
    expect(await economy.wallet(winnerActor)).toMatchObject({domino_points:70,points:2});
    expect(collected.achievements.find(badge=>badge.id==='dominoes-victory-1')?.claimed).toBe(true);

    expect(raw.prepare("SELECT count(*) n FROM economy_ledger WHERE source LIKE 'dominoes:win:%'").get()!.n).toBe(1);
  });
  it('completes all three computer difficulties without leaving a bot turn pending',async()=>{
    const {command,store}=setup(kind),actor=guest();
    for(const level of ['easy','normal','hard'])for(const variant of ['draw','block','muggins']) {
      let view=(await command(actor,{operation:'create',name:'Player',options:{...settings,mode:'bot',level,variant}})).view;
      for(let n=0;n<1500&&view.phase!=='finished';n++) {
        if(view.phase==='play')expect(view.turn).toBe(0);
        const best=[...view.legal].sort((a,b)=>b.points-a.points||dominoValue(b.tile)-dominoValue(a.tile))[0];
        const move:DominoMove=view.phase==='roundOver'?{t:'next'}:best?{t:'play',tile:best.tile,end:best.end}:view.canDraw?{t:'draw'}:{t:'pass'};
        view=(await command(actor,{operation:'move',code:view.code,revision:view.revision,move})).view;
      }
      expect(view.phase).toBe('finished');expect(view.reward.status).toBe('ineligible');
      expect(await store().get(view.code,actor.principal)).toEqual(view);
    }
  },20000);
  it('transfers a waiting host, blocks extra seats, and abandons active departures without rewards or private receipts',async()=>{
    const {command,store,online,raw}=setup(kind),a=guest(),b=guest(1);
    const {view}=await command(a,{operation:'create',name:'Host',options:settings});await command(b,{operation:'join',code:view.code,name:'Peer'});
    await expect(command(guest(2),{operation:'join',code:view.code,name:'Third'})).rejects.toMatchObject({code:'table_full'});
    const request={operation:'leave',code:view.code,requestId:randomUUID()};const left=await store().command(a,request);
    expect(left.view).toMatchObject({players:[],hand:[],board:[],revealedHands:null,phase:null});expect((await store().command(a,request)).changed).toBe(false);
    expect((await store().get(view.code,b.principal)).owner).toBe(true);await expect(store().get(view.code,a.principal)).rejects.toMatchObject({status:403});
    const table=await online([a,b]);const abandoned=(await command(a,{operation:'leave',code:table.view.code})).view;
    expect(abandoned.hand).toEqual([]);expect((await store().get(table.view.code,b.principal)).status).toBe('abandoned');
    expect(raw.prepare('SELECT count(*) n FROM domino_rewards').get()!.n).toBe(0);
  });
});
