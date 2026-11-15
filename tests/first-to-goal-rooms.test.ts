import {afterEach,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {EconomyStore} from '../server/economy';
import {CrownChanceRoomStore} from '../server/crown-chance-rooms';
import {FarkleRoomStore} from '../server/farkle-rooms';
const close:(()=>void)[]=[];afterEach(()=>close.splice(0).forEach(fn=>fn()));
const actors=Array.from({length:4},(_,i)=>({principal:`member:${String(i+1).repeat(8)}-1111-4111-8111-111111111111`,jokers:false}));
describe.each(['node','d1'] as const)('first-to-goal authoritative rooms on %s',backend=>{
 for(const game of ['chance','farkle'] as const)for(const fast of [true,false])for(const scenario of ['human-v-bot','bot-v-human','online-2','online-4'] as const){
  it(`${game} ${fast?'fast':'long'} / ${scenario} commits the winning bank and permits no opponent response`,async()=>{
   const cloud=backend==='d1'?new TestD1():null,local=cloud?null:new RoomStore(':memory:'),raw=cloud?.sqlite??local!.db;
   if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);}close.push(()=>raw.close());
   const db=cloud??nodeSocialBinding(raw),economy=new EconomyStore(db);
   for(const actor of actors)await economy.ensureMember(actor,{wallet:{points:0,owned:['farkle-party'],equipped:{}},awards:[]});
   let rolls=0;const random=()=>{rolls++;return .99;};
   const store=game==='chance'?new CrownChanceRoomStore(db,Date.now,random):new FarkleRoomStore(db,Date.now,random);
   const send=(actor:typeof actors[number],value:Record<string,unknown>)=>store.command(actor,{...value,requestId:randomUUID()});
   const online=scenario.startsWith('online'),seats=scenario==='online-4'?4:2,target=game==='chance'?(fast?4000:12000):(fast?5000:10000);
   const options={mode:online?'online':'bot',seats,level:'hard',...(game==='chance'?{length:fast?'fast':'long',minimum:0}:{target})};
   let room=(await send(actors[0]!,{operation:'create',name:'Host',options})).view;
   if(online){
    for(let i=1;i<seats;i++){await send(actors[i]!,{operation:'join',code:room.code,name:`Player ${i}`});await send(actors[i]!,{operation:'ready',code:room.code,ready:true});}
    room=await store.get(room.code,actors[0]!.principal);
    room=(await send(actors[0]!,{operation:'start',code:room.code,revision:room.revision})).view;
   }
   const table=game==='chance'?'crown_chance_rooms':'farkle_rooms';
   const row=JSON.parse(String(raw.prepare(`SELECT data FROM ${table} WHERE code=?`).get(room.code)!.data));
   // Server-owned endgame fixture: all players are within one bank of the goal.
   const botWins=scenario==='bot-v-human',winner=botWins?1:online?seats-2:0;
   row.state.turn=botWins?0:winner;
   if(game==='chance'){
    row.state.scores.forEach((score:{points:number})=>score.points=target-100);
    row.state.pending=botWins?50:100;row.state.qualified=true;
   }else{
    row.state.scores=Array(seats).fill(target-100);row.state.turnPoints=botWins?50:100;row.state.rolls=1;
   }
   if(botWins){
    if(game==='chance'){row.state.scores[1].points=target-100;row.state.pending=50;}
    // Prime the bot's next deterministic six-of-a-kind roll to pass the target.
   }
   raw.prepare(`UPDATE ${table} SET data=? WHERE code=?`).run(JSON.stringify(row),room.code);
   const command={operation:'move',code:room.code,revision:room.revision,move:{t:'bank'},requestId:randomUUID()};
   const won=await store.command(actors[botWins?0:winner]!,command);
   expect(won.view.status).toBe('finished');
   expect(won.view.state).toMatchObject({phase:'finished',turn:winner,winners:[winner]});
   expect(won.view.state?.activity?.at(-1)).toMatchObject({kind:'bank',seat:winner});
   if(!botWins)expect(rolls).toBe(0);
   expect((await store.command(actors[botWins?0:winner]!,command)).changed).toBe(false);
   for(let i=0;i<(online?seats:1);i++){
    expect((await store.get(room.code,actors[i]!.principal)).status).toBe('finished');
    await expect(send(actors[i]!,{operation:'move',code:room.code,revision:won.view.revision,move:{t:'roll'}})).rejects.toMatchObject({code:'table_closed'});
   }
  });
 }
});
