import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { RoomStore } from '../server/rooms';
import { FiveDiceRoomStore } from '../server/five-dice-rooms';
import { initializeEconomyNode } from '../server/economy-node';
import { nodeSocialBinding } from '../server/social-node';
import { TestD1 } from './helpers/d1';
import { FIVE_DICE_PARTY, fiveDiceWinner } from '../src/lib/five-dice-rewards';
import { FIVE_DICE_CATEGORIES, fiveDiceTotals, type FiveDiceCategory, type FiveDiceState } from '../src/lib/five-dice';
import type { Identity } from '../server/rooms';
import type { FiveDiceRoomView } from '../src/lib/five-dice-protocol';

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const member=(seat=0,party=false):Identity=>({principal:`member:${ids[seat]}`,jokers:false,owned:party?[FIVE_DICE_PARTY.id]:[]});
const guest=(seat=0):Identity=>({principal:`guest:dice-${seat}`,jokers:false});
const closes:(()=>void)[]=[];
afterEach(()=>closes.splice(0).forEach(close=>close()));
function setup(kind:'node'|'d1') {
  const d1=kind==='d1'?new TestD1():null,node=d1?null:new RoomStore(':memory:'),raw=d1?.sqlite??node!.db;
  if(node)initializeEconomyNode(raw);
  closes.push(()=>raw.close());
  const binding=d1??nodeSocialBinding(raw),store=()=>new FiveDiceRoomStore(binding);
  const command=(actor:Identity,body:Record<string,unknown>)=>store().command(actor,{requestId:randomUUID(),...body});
  const seed=(actor:Identity)=>raw.prepare('INSERT OR REPLACE INTO economy_wallets(user_id,import_token,created_at,updated_at,owned) VALUES(?,?,?,?,?)').run(actor.principal.slice(7),randomUUID(),Date.now(),Date.now(),JSON.stringify(actor.owned??[]));
  async function online(seats:2|3|4=2,actors=Array.from({length:seats},(_,i)=>member(i,seats>2))) {
    if(seats>2)actors.forEach(seed);
    let view=(await command(actors[0]!,{operation:'create',name:'Host',options:{mode:'online',seats,level:'normal'}})).view;
    for(let seat=1;seat<seats;seat++){await command(actors[seat]!,{operation:'join',code:view.code,name:`Player ${seat+1}`});await command(actors[seat]!,{operation:'ready',code:view.code,ready:true});}
    view=await store().get(view.code,actors[0]!.principal,actors[0]!.owned);
    return {actors,view:(await command(actors[0]!,{operation:'start',code:view.code,revision:view.revision})).view};
  }
  function save(code:string,change:(room:any)=>void) {
    const room=JSON.parse(String(raw.prepare('SELECT data FROM five_dice_rooms WHERE code=?').get(code)!.data));change(room);
    raw.prepare('UPDATE five_dice_rooms SET data=? WHERE code=?').run(JSON.stringify(room),code);
  }
  /** Server-owned final turn fixture. All scores are values legitimate scorecards
   * can contain; a final chance score completes the thirteenth round. */
  function finalTurn(view:FiveDiceRoomView,tie=false) {
    save(view.code,room=>{
      const state=room.state as FiveDiceState,last=state.players.length-1;
      state.round=13;state.turn=last;state.rolls=1;state.dice=[1,2,3,4,5];state.held=[false,false,false,false,false];state.phase='play';state.winners=[];
      const zero=Object.fromEntries(FIVE_DICE_CATEGORIES.map(category=>[category.id,0])) as Record<FiveDiceCategory,number>;
      state.cards=state.players.map((_,seat)=>({scores:{...zero,chance:seat===0?15:0},fiveKindBonuses:0}));
      if(!tie)state.cards[0]!.scores['five-kind']=50;
      delete state.cards[last]!.scores.chance;
    });
  }
  return {raw,binding,store,command,seed,online,save,finalTurn};
}

describe.each(['node','d1'] as const)('authoritative Quintsee rooms on %s',kind=>{
  it('persists the computer’s real rolls, holds and scoring choice exactly once for playback', async () => {
    const { command, store } = setup(kind), actor = guest();
    let view = (await command(actor, { operation: 'create', name: 'Player', options: { mode: 'bot', seats: 2, level: 'normal' } })).view;
    view = (await command(actor, { operation: 'move', code: view.code, revision: view.revision, move: { t: 'roll' } })).view;
    const request = { operation: 'move', requestId: randomUUID(), code: view.code, revision: view.revision, move: { t: 'score', category: 'chance' } };
    const result = await store().command(actor, request), events = result.view.state!.activity!;
    const opponent = events.filter(event => event.seat === 1);
    expect(opponent.some(event => event.kind === 'roll')).toBe(true);
    const scored = opponent.at(-1)!;
    expect(scored.kind).toBe('score');
    expect(scored.dice.every(value => value >= 1 && value <= 6)).toBe(true);
    expect(scored.score).toBe(result.view.state!.cards[1]!.scores[scored.category!]);
    expect(scored.total).toBe(fiveDiceTotals(result.view.state!.cards[1]!).total);
    expect(result.view.state).toMatchObject({ turn: 0, rolls: 0, dice: [0, 0, 0, 0, 0] });
    expect((await store().command(actor, request)).view.state!.activity).toEqual(events);
  });
  it('starts a free guest computer game and persists the public dice without exposing principals',async()=>{
    const {store,command}=setup(kind);
    const created=await command(guest(),{operation:'create',name:'Guest Ace',options:{mode:'bot',seats:2,level:'hard'}});
    expect(created.view).toMatchObject({status:'playing',mySeat:0,owner:true,state:{rolls:0,round:1},reward:{status:'ineligible'}});
    expect(created.view.players).toHaveLength(2);expect(created.view.players[1]).toMatchObject({bot:true,occupied:true});
    const rolled=(await command(guest(),{operation:'move',code:created.view.code,revision:created.view.revision,move:{t:'roll'}})).view;
    expect(rolled.state!.dice.every(value=>value>=1&&value<=6)).toBe(true);
    expect(await store().get(rolled.code,guest().principal)).toEqual(rolled);
    expect(JSON.stringify(rolled)).not.toContain('guest:dice-0');
    await expect(store().get(rolled.code,guest(1).principal)).rejects.toMatchObject({status:403});
    await expect(command(guest(1),{operation:'move',code:rolled.code,revision:rolled.revision,move:{t:'roll'}})).rejects.toMatchObject({status:403});
  });
  it('requires the 600-point permanent unlock for every member of larger tables and private reads',async()=>{
    const {command,store,seed,raw}=setup(kind);
    await expect(command(guest(),{operation:'create',name:'Guest',options:{mode:'online',seats:3,level:'normal'}})).rejects.toMatchObject({code:'five_dice_party_locked'});
    await expect(command(member(),{operation:'create',name:'Host',options:{mode:'online',seats:4,level:'normal'},owned:[FIVE_DICE_PARTY.id]})).rejects.toMatchObject({status:400});
    const actor=member(0,true);seed(actor);
    const {view}=await command(actor,{operation:'create',name:'Host',options:{mode:'online',seats:3,level:'normal'}});
    await expect(command(member(1),{operation:'join',code:view.code,name:'Peer'})).rejects.toMatchObject({code:'five_dice_party_locked'});
    const peer=member(1,true);seed(peer);await command(peer,{operation:'join',code:view.code,name:'Peer'});
    await expect(store().get(view.code,peer.principal,[])).rejects.toMatchObject({code:'five_dice_party_locked'});
    expect((await store().get(view.code,peer.principal)).players[1]!.name).toBe('Peer');
    raw.prepare('UPDATE economy_wallets SET owned=? WHERE user_id=?').run('[]',ids[1]!);
    await expect(store().get(view.code,peer.principal,peer.owned)).rejects.toMatchObject({code:'five_dice_party_locked'});
  });
  it('lets a revoked Party player leave without revealing the private table',async()=>{
    const {online,command,store}=setup(kind),{actors,view}=await online(3);
    const revoked={...actors[1]!,owned:[]};
    await expect(store().get(view.code,revoked.principal,revoked.owned)).rejects.toMatchObject({status:403});
    const left=await command(revoked,{operation:'leave',code:view.code});
    expect(left.view).toMatchObject({status:'abandoned',state:null,players:[]});
    expect((await store().get(view.code,actors[0]!.principal,actors[0]!.owned)).status).toBe('abandoned');
  });
  it('runs free two-person lobbies, requires ready players and host authority, and rejects out-of-turn actions',async()=>{
    const {store,command}=setup(kind);const a=guest(),b=guest(1);
    let view=(await command(a,{operation:'create',name:'Host',options:{mode:'online',seats:2,level:'normal'}})).view;
    await expect(command(a,{operation:'start',code:view.code,revision:view.revision})).rejects.toMatchObject({code:'not_ready'});
    await command(b,{operation:'join',code:view.code,name:'Peer'});view=await store().get(view.code,a.principal);
    await expect(command(b,{operation:'start',code:view.code,revision:view.revision})).rejects.toMatchObject({code:'not_host'});
    await expect(command(a,{operation:'start',code:view.code,revision:view.revision})).rejects.toMatchObject({code:'not_ready'});
    await command(b,{operation:'ready',code:view.code,ready:true});view=await store().get(view.code,a.principal);
    view=(await command(a,{operation:'start',code:view.code,revision:view.revision})).view;
    await expect(command(b,{operation:'move',code:view.code,revision:view.revision,move:{t:'roll'}})).rejects.toMatchObject({code:'illegal_move'});
    await expect(command(a,{operation:'move',code:view.code,revision:view.revision,move:{t:'score',category:'chance'}})).rejects.toMatchObject({code:'illegal_move'});
  });
  it('commits a concurrent duplicate roll once and recovers its latest view instead of rolling again',async()=>{
    const {command,store,raw}=setup(kind);const a=guest();let view=(await command(a,{operation:'create',name:'Host',options:{mode:'bot',seats:2,level:'easy'}})).view;
    const request={operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'roll'}};
    const results=await Promise.all([store().command(a,request),store().command(a,request)]);
    expect(results.map(result=>result.changed).sort()).toEqual([false,true]);expect(results[0]!.view.state!.dice).toEqual(results[1]!.view.state!.dice);
    view=await store().get(view.code,a.principal);expect(view.state!.rolls).toBe(1);
    await expect(store().command(a,{...request,move:{t:'score',category:'chance'}})).rejects.toMatchObject({code:'request_reused'});
    await expect(command(a,{...request,requestId:randomUUID()})).rejects.toMatchObject({code:'stale'});
    const held=(await command(a,{operation:'move',code:view.code,revision:view.revision,move:{t:'hold',index:0}})).view;
    expect((await store().command(a,request)).view.revision).toBe(held.revision);
    expect(Number(raw.prepare('SELECT count(*) n FROM five_dice_requests WHERE request_id=?').get(request.requestId)!.n)).toBe(1);
  });
  it('allows only one of two distinct actions using the same room revision',async()=>{
    const {command,store,raw}=setup(kind),actor=guest();
    const {view}=await command(actor,{operation:'create',name:'Host',options:{mode:'bot',seats:2,level:'normal'}});
    const requests=[0,1].map(()=>({operation:'move',code:view.code,revision:view.revision,requestId:randomUUID(),move:{t:'roll'}}));
    const results=await Promise.allSettled(requests.map(request=>store().command(actor,request)));
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect(results.find(result=>result.status==='rejected')).toMatchObject({reason:{status:409,code:'stale'}});
    expect((await store().get(view.code,actor.principal)).state!.rolls).toBe(1);
    expect(raw.prepare('SELECT count(*) n FROM five_dice_requests').get()!.n).toBe(2);
  });
  it('rechecks every Party wallet before the host starts a larger online match',async()=>{
    const {command,store,seed,raw}=setup(kind),actors=[member(0,true),member(1,true),member(2,true)];actors.forEach(seed);
    let {view}=await command(actors[0]!,{operation:'create',name:'Host',options:{mode:'online',seats:3,level:'normal'}});
    for(const actor of actors.slice(1)){await command(actor,{operation:'join',code:view.code,name:'Peer'});await command(actor,{operation:'ready',code:view.code,ready:true});}
    view=await store().get(view.code,actors[0]!.principal,actors[0]!.owned);
    raw.prepare('UPDATE economy_wallets SET owned=? WHERE user_id=?').run('[]',ids[2]!);
    await expect(command(actors[0]!,{operation:'start',code:view.code,revision:view.revision})).rejects.toMatchObject({code:'five_dice_party_locked'});
    expect((await store().get(view.code,actors[0]!.principal,actors[0]!.owned)).status).toBe('waiting');
  });
  it('rejects injected random values, forged scores, extra options and reused creation IDs',async()=>{
    const {command,store}=setup(kind),a=guest();
    for(const options of [{mode:{toString:'bot'},seats:2,level:'normal'},{mode:'bot',seats:2,level:{toString:'normal'}},{mode:'bot',seats:3,level:'normal'},{mode:'bot',seats:2,level:'impossible'},{mode:'bot',seats:2,level:'normal',owned:[FIVE_DICE_PARTY.id]}])await expect(command(a,{operation:'create',name:'Host',options})).rejects.toMatchObject({status:400});
    const create={operation:'create',requestId:randomUUID(),name:'Host',options:{mode:'bot',seats:2,level:'normal'}};
    const created=await store().command(a,create);expect((await store().command(a,create)).view.code).toBe(created.view.code);
    await expect(store().command(a,{...create,name:'Other Name'})).rejects.toMatchObject({code:'request_reused'});
    await expect(command(a,{operation:'move',code:created.view.code,revision:created.view.revision,move:{t:'roll',dice:[6,6,6,6,6]}})).rejects.toMatchObject({status:400});
    await expect(command(a,{operation:'move',code:created.view.code,revision:created.view.revision,move:{t:'score',category:'chance',score:999}})).rejects.toMatchObject({status:400});
  });
  it('executes a bounded computer turn after scoring, and completes all thirteen rounds',async()=>{
    const {command}=setup(kind),a=guest();let view=(await command(a,{operation:'create',name:'Host',options:{mode:'bot',seats:2,level:'hard'}})).view;
    for(const category of FIVE_DICE_CATEGORIES){
      view=(await command(a,{operation:'move',code:view.code,revision:view.revision,move:{t:'roll'}})).view;
      view=(await command(a,{operation:'move',code:view.code,revision:view.revision,move:{t:'score',category:category.id}})).view;
      if(view.status==='playing'){expect(view.state!.turn).toBe(0);expect(view.state!.rolls).toBe(0);}
    }
    expect(view.status).toBe('finished');expect(view.state!.cards.map(card=>fiveDiceTotals(card).filled)).toEqual([13,13]);
  });
  it('keeps online scores synchronized for four distinct purchased seats and records a sole winner atomically',async()=>{
    const {online,finalTurn,command,store,raw}=setup(kind),{actors,view}=await online(4);
    finalTurn(view);
    const result=(await command(actors[3]!,{operation:'move',code:view.code,revision:view.revision,move:{t:'score',category:'chance'}})).view;
    expect(result.status).toBe('finished');
    const evidence=raw.prepare('SELECT payload FROM five_dice_rewards').get()!;
    expect(evidence).toBeTruthy();const match=JSON.parse(String(evidence.payload));expect(fiveDiceWinner(match)).toBe(ids[0]);
    expect(match.players.map((player:{user_id:string})=>player.user_id)).toEqual(ids);
    for(const actor of actors){const visible=await store().get(view.code,actor.principal,actor.owned);expect(visible.state!.cards).toEqual(result.state!.cards);}
    expect((await store().get(view.code,actors[0]!.principal,actors[0]!.owned)).reward).toMatchObject({status:'pending',amount:50});
    expect((await store().get(view.code,actors[1]!.principal,actors[1]!.owned)).reward.status).toBe('ineligible');
  });
  it('does not create reward evidence for tied or guest online games',async()=>{
    const {online,finalTurn,command,raw}=setup(kind),{actors,view}=await online(2);
    finalTurn(view,true);
    const tie=(await command(actors[1]!,{operation:'move',code:view.code,revision:view.revision,move:{t:'score',category:'chance'}})).view;
    expect(tie.state!.winners).toHaveLength(2);expect(tie.reward.status).toBe('ineligible');
    expect(raw.prepare('SELECT count(*) n FROM five_dice_rewards').get()!.n).toBe(0);
    const guestTable=await online(2,[guest(),guest(1)]);finalTurn(guestTable.view);
    await command(guest(1),{operation:'move',code:guestTable.view.code,revision:guestTable.view.revision,move:{t:'score',category:'chance'}});
    expect(raw.prepare('SELECT count(*) n FROM five_dice_rewards').get()!.n).toBe(0);
  });
  it('transfers a waiting host, resumes an existing seat, and abandons active departures without farming wins',async()=>{
    const {command,store,raw}=setup(kind),a=guest(),b=guest(1);
    let view=(await command(a,{operation:'create',name:'Host',options:{mode:'online',seats:2,level:'normal'}})).view;
    await command(b,{operation:'join',code:view.code,name:'Peer'});await command(a,{operation:'leave',code:view.code});
    expect((await store().get(view.code,b.principal)).owner).toBe(true);
    await expect(store().get(view.code,a.principal)).rejects.toMatchObject({status:403});
    await command(a,{operation:'join',code:view.code,name:'Host'});await command(a,{operation:'ready',code:view.code,ready:true});await command(b,{operation:'ready',code:view.code,ready:true});
    view=await store().get(view.code,b.principal);view=(await command(b,{operation:'start',code:view.code,revision:view.revision})).view;
    expect((await command(a,{operation:'join',code:view.code,name:'Changed Name'})).view.players.some(player=>player.name==='Changed Name')).toBe(false);
    await command(a,{operation:'leave',code:view.code});expect((await store().get(view.code,b.principal)).status).toBe('abandoned');
    expect(raw.prepare('SELECT count(*) n FROM five_dice_rewards').get()!.n).toBe(0);
  });
});
