import {CarromRoomStore} from '../server/carrom-rooms';
import {BackgammonRoomStore} from '../server/backgammon-rooms';
import {CrownCourtRoomStore} from '../server/crown-court-rooms';
import {FarkleRoomStore} from '../server/farkle-rooms';
import {initializeFarkleNode} from '../server/farkle-node';
import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {TestD1} from './helpers/d1';
import {RoomStore,type Identity} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {CloudRoomStore} from '../server/cloud-rooms';
import {CloudSpadesRoomStore} from '../server/cloud-spades-rooms';
import {FiveDiceRoomStore} from '../server/five-dice-rooms';
import {DominoRoomStore} from '../server/dominoes-rooms';
import {initializeEconomyNode} from '../server/economy-node';
import {initializeFiveDiceNode} from '../server/five-dice-node';
import {initializeMatchmakingNode} from '../server/matchmaking-node';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {EconomyStore} from '../server/economy';
import {SocialStore} from '../server/social';
import {MatchmakingStore,MATCH_TTL} from '../server/matchmaking';
import {MATCH_GAMES,type MatchGame} from '../src/lib/matchmaking';

const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()));
const actors:Identity[]=Array.from({length:6},(_,i)=>({principal:`member:${i+1}1111111-1111-4111-8111-111111111111`,jokers:true,owned:['rummy-jokers','spades-partnerships','five-dice-party']}));
const defaults=(g:MatchGame)=>g==='carrom'?{mode:'online',seats:2,level:'normal',variant:'carrom'}:g==='backgammon'?{mode:'online',seats:2,level:'normal',variant:'standard',target:3,crawford:true}:g==='crown-court'?{mode:'online',seats:2,level:'normal',length:'short'}:g==='rummy'?{mode:'online',variant:'classic',seats:2,level:'normal',jokers:false}:g==='spades'?{mode:'online',variant:'solo',target:100,humans:4,level:'normal',table:'spades-table-classic',deck:'spades-deck-classic'}:(g==='five-dice'||g==='farkle')?{mode:'online',seats:2,level:'normal'}:{mode:'online',variant:'draw',target:100,level:'normal'};
function view(result:any){return result.view??result;}
async function setup(backend:'node'|'d1'){
 const hosted=backend==='d1'?new TestD1():null,local=hosted?null:new RoomStore(':memory:'),raw=hosted?.sqlite??local!.db;
 if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);initializeFiveDiceNode(raw);initializeFarkleNode(raw);initializeMatchmakingNode(raw);initializeMatchmakingNode(raw);}
 cleanup.push(()=>raw.close());const db=hosted??nodeSocialBinding(raw);
 const stores={carrom:new CarromRoomStore(db),backgammon:new BackgammonRoomStore(db),rummy:hosted?new CloudRoomStore(db):local!,spades:hosted?new CloudSpadesRoomStore(db):new SpadesRoomStore(raw),'five-dice':new FiveDiceRoomStore(db),farkle:new FarkleRoomStore(db),'crown-court':new CrownCourtRoomStore(db),dominoes:new DominoRoomStore(db)};
 const social=new SocialStore(db),economy=new EconomyStore(db);
 for(const actor of actors){await social.ensureProfile(actor);await economy.ensureMember(actor,{wallet:{owned:[...actor.owned!],equipped:{}},awards:[]});}
 let now=Date.now();const discovery=new MatchmakingStore(db,()=>now);
 const run=async(game:MatchGame,actor:Identity,command:unknown)=>stores[game].command(actor,command);
 const create=async(game:MatchGame,actor=actors[0]!,options:Record<string,unknown>=defaults(game))=>view(await run(game,actor,{operation:'create',name:'Friendly player',options,...(game==='carrom'||game==='backgammon'||game==='dominoes'||game==='five-dice'||game==='farkle'||game==='crown-court'?{requestId:randomUUID()}:{})}));
 const command=(game:MatchGame,actor:Identity,input:unknown)=>discovery.command(game,actor,input,c=>run(game,actor,c).then(r=>game==='rummy'||game==='spades'?view(r):r));
 const join=(game:MatchGame,actor:Identity,code:string,requestId=randomUUID())=>command(game,actor,{operation:'join',code,name:'New player',requestId});
 return {db,raw,stores,discovery,run,create,command,join,advance:(n:number)=>{now+=n;}};
}

describe.each(['node','d1'] as const)('public Match Making on %s',backend=>{
 for(const game of MATCH_GAMES){
  it(`${game}: private by default, host-only publishing, safe summaries and real seats`,async()=>{
   const t=await setup(backend),room=await t.create(game),code=room.code;
   expect((await t.discovery.list(game,actors[1]!)).rooms).toEqual([]);
   await expect(t.command(game,actors[1]!,{operation:'publish',code})).rejects.toMatchObject({code:'not_host'});
   expect(await t.command(game,actors[0]!,{operation:'publish',code})).toMatchObject({listed:true});
   const listing=(await t.discovery.list(game,actors[1]!)).rooms[0]!;expect(listing).toMatchObject({code,occupied:1,seats:game==='spades'?4:2,locked:false});
   const safe=JSON.stringify(listing);expect(safe).not.toContain('principal');expect(safe).not.toContain('hand');expect(safe).not.toContain(actors[0]!.principal);expect(safe).not.toContain('state');
   const result=view(await t.join(game,actors[1]!,code));expect(result.code).toBe(code);expect(result.players.filter((p:any)=>p.occupied!==false)).toHaveLength(2);
   expect(result.players.find((p:any)=>p.you).ready).toBe(false);expect(view(await t.join(game,actors[1]!,code)).code).toBe(code);
   expect((await t.discovery.list(game==='dominoes'?'rummy':'dominoes',actors[2]!)).rooms).toEqual([]);
  });
  it(`${game}: concurrent joins cannot overfill the last seat; full and started matches disappear`,async()=>{
   const t=await setup(backend),room=await t.create(game);await t.command(game,actors[0]!,{operation:'publish',code:room.code});
   if(game==='spades'){await t.join(game,actors[1]!,room.code);await t.join(game,actors[2]!,room.code);}
   const racers=game==='spades'?[actors[3]!,actors[4]!]:[actors[1]!,actors[2]!];
   const results=await Promise.allSettled(racers.map(actor=>t.join(game,actor,room.code)));
   expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
   expect((await t.discovery.list(game,actors[5]!)).rooms).toEqual([]);
   const full=view(await t.stores[game].get(room.code,actors[0]!.principal));expect(full.players.filter((p:any)=>p.occupied!==false)).toHaveLength(game==='spades'?4:2);
   expect((await t.discovery.list(game,actors[0]!)).rooms).toHaveLength(1);
   const all=game==='spades'?[actors[0]!,actors[1]!,actors[2]!,racers[results.findIndex(r=>r.status==='fulfilled')]!]:[actors[0]!,racers[results.findIndex(r=>r.status==='fulfilled')]!];
   for(const actor of all)await t.run(game,actor,{operation:'ready',code:room.code,ready:true,...(game==='carrom'||game==='backgammon'||game==='dominoes'||game==='five-dice'||game==='farkle'||game==='crown-court'?{requestId:randomUUID()}:{})});
   const fresh=view(await t.stores[game].get(room.code,actors[0]!.principal));
   await t.run(game,actors[0]!,{operation:'start',code:room.code,revision:fresh.revision,...(game==='carrom'||game==='backgammon'||game==='dominoes'||game==='five-dice'||game==='farkle'||game==='crown-court'?{requestId:randomUUID()}:{})});
   expect((await t.discovery.list(game,actors[0]!)).rooms).toEqual([]);
  });
  it(`${game}: leases expire, host heartbeats renew only existing listings and unlisting is immediate`,async()=>{
   const t=await setup(backend),room=await t.create(game);
   expect(await t.command(game,actors[0]!,{operation:'heartbeat',code:room.code})).toMatchObject({listed:false});
   await t.command(game,actors[0]!,{operation:'publish',code:room.code});t.advance(MATCH_TTL+1);expect((await t.discovery.list(game,actors[1]!)).rooms).toEqual([]);
   await t.command(game,actors[0]!,{operation:'heartbeat',code:room.code});expect((await t.discovery.list(game,actors[1]!)).rooms).toHaveLength(1);
   await t.command(game,actors[0]!,{operation:'unpublish',code:room.code});await t.command(game,actors[0]!,{operation:'heartbeat',code:room.code});expect((await t.discovery.list(game,actors[1]!)).rooms).toEqual([]);
  });
  it(`${game}: respects blocks in both directions, including direct room-code joins`,async()=>{
   const t=await setup(backend),room=await t.create(game);await t.command(game,actors[0]!,{operation:'publish',code:room.code});
   for(const [a,b] of [[actors[0]!,actors[1]!],[actors[1]!,actors[0]!]]){
    t.raw.prepare('INSERT INTO social_blocks VALUES(?,?,?)').run(a.principal.slice(7),b.principal.slice(7),Date.now());
    expect((await t.discovery.list(game,actors[1]!)).rooms).toEqual([]);
    await expect(t.join(game,actors[1]!,room.code)).rejects.toMatchObject({code:'connection_unavailable'});
    await expect(t.discovery.checkPublicJoin(game,actors[1]!,{operation:'join',code:room.code})).rejects.toMatchObject({code:'connection_unavailable'});
    t.raw.prepare('DELETE FROM social_blocks').run();
   }
  });
 }
 it.each(['rummy','spades','five-dice'] as const)('%s: displays locked tables but enforces paid-mode ownership on join',async game=>{
  const t=await setup(backend),options={...defaults(game),...(game==='rummy'?{jokers:true}:game==='spades'?{variant:'teams'}:{seats:3})};
  const room=await t.create(game,actors[0]!,options);await t.command(game,actors[0]!,{operation:'publish',code:room.code});
  const outsider={...actors[1]!,owned:[],jokers:false};expect((await t.discovery.list(game,outsider)).rooms[0]).toMatchObject({locked:true});
  await expect(t.join(game,outsider,room.code)).rejects.toMatchObject({code:'match_unlock_required'});
 });
 it('only lists one room per host per game and rejects computer/practice tables',async()=>{
  const t=await setup(backend),a=await t.create('dominoes'),b=await t.create('dominoes');
  await t.command('dominoes',actors[0]!,{operation:'publish',code:a.code});await t.command('dominoes',actors[0]!,{operation:'publish',code:b.code});
  expect((await t.discovery.list('dominoes',actors[1]!)).rooms.map(r=>r.code)).toEqual([b.code]);
  const bot=await t.create('dominoes',actors[0]!,{...defaults('dominoes'),mode:'bot'});
  await expect(t.command('dominoes',actors[0]!,{operation:'publish',code:bot.code})).rejects.toMatchObject({code:'table_closed'});
 });
});
