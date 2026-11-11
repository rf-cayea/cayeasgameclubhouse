import {D6_DICE_SETS} from '../src/lib/d6-dice';
import {CARROM_BOARDS,CARROM_PUCKS,CARROM_STRIKERS,equippedCarrom} from '../src/lib/carrom-sets';
import type {CarromMatchReward} from '../src/lib/carrom-rewards';
import {SocialStore} from '../server/social';
import {afterEach,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {RoomStore} from '../server/rooms';
import {SpadesRoomStore} from '../server/spades-rooms';
import {initializeSocialNode,nodeSocialBinding} from '../server/social-node';
import {initializeEconomyNode} from '../server/economy-node';
import {CarromRoomStore} from '../server/carrom-rooms';
import {EconomyStore} from '../server/economy';
import {TestD1} from './helpers/d1';
import {carromBotShot,makeDisc,type CarromState} from '../src/lib/carrom';
const cleanup:(()=>void)[]=[];afterEach(()=>cleanup.splice(0).forEach(f=>f()));
const id='11111111-1111-4111-8111-111111111111',peerID='22222222-2222-4222-8222-222222222222',a={principal:`member:${id}`,jokers:false},b={principal:`member:${peerID}`,jokers:false},opts={mode:'online',seats:2,variant:'disc-pool',level:'normal'};
async function setup(backend:'node'|'d1'){const hosted=backend==='d1'?new TestD1():null,local=hosted?null:new RoomStore(':memory:'),raw=hosted?.sqlite??local!.db;if(local){new SpadesRoomStore(raw);initializeSocialNode(raw);initializeEconomyNode(raw);}cleanup.push(()=>raw.close());const db=hosted??nodeSocialBinding(raw);let now=Date.now();const store=new CarromRoomStore(db,()=>now),economy=new EconomyStore(db,()=>now);await economy.ensureMember(a);await economy.ensureMember(b);return{store,economy,raw,db,advance:()=>{now+=30000;}};}
const send=(store:CarromRoomStore,actor:typeof a,v:Record<string,unknown>)=>store.command(actor,{requestId:randomUUID(),...v});
async function online(store:CarromRoomStore){const room=(await send(store,a,{operation:'create',name:'Host',options:opts})).view;await send(store,b,{operation:'join',name:'Friend',code:room.code});await send(store,b,{operation:'ready',code:room.code,ready:true});const current=await store.get(room.code,a.principal);return(await send(store,a,{operation:'start',code:room.code,revision:current.revision})).view;}
describe.each(['node','d1']as const)('authoritative Carrom on %s',backend=>{
 it('requires readiness, host approval and table membership, then shares identical states',async()=>{const{store}=await setup(backend);let r=(await send(store,a,{operation:'create',name:'Host',options:opts})).view;await expect(send(store,a,{operation:'start',code:r.code,revision:r.revision})).rejects.toMatchObject({code:'not_ready'});await send(store,b,{operation:'join',name:'Friend',code:r.code});r=await store.get(r.code,a.principal);await expect(send(store,b,{operation:'start',code:r.code,revision:r.revision})).rejects.toMatchObject({code:'not_host'});await send(store,b,{operation:'ready',code:r.code,ready:true});r=await store.get(r.code,a.principal);r=(await send(store,a,{operation:'start',code:r.code,revision:r.revision})).view;expect(r.state?.balls).toHaveLength(18);expect((await store.get(r.code,b.principal)).state).toEqual(r.state);await expect(store.get(r.code,'guest:outsider')).rejects.toMatchObject({status:403});});
 it('persists one physical shot under concurrent retries and rejects reused IDs / stale revisions',async()=>{const{store}=await setup(backend),r=await online(store);const command={operation:'shot',requestId:randomUUID(),code:r.code,revision:r.revision,shot:{x:500,angle:-Math.PI/2,power:.8}};const results=await Promise.all([store.command(a,command),store.command(a,command)]);expect(results.map(r=>r.changed).sort()).toEqual([false,true]);expect(results[0]!.view.state?.sequence).toBe(1);expect((await store.get(r.code,b.principal)).state).toEqual(results[0]!.view.state);await expect(store.command(a,{...command,shot:{...command.shot,power:.5}})).rejects.toMatchObject({code:'request_reused'});await expect(store.command(a,{...command,requestId:randomUUID()})).rejects.toMatchObject({code:'stale'});});
 it('enforces whose turn it is, blocks shots in motion and pauses before a computer response',async()=>{const{store,advance}=await setup(backend);let r=(await send(store,a,{operation:'create',name:'Player',options:{...opts,mode:'bot'}})).view;await expect(send(store,a,{operation:'tick',code:r.code,revision:r.revision})).rejects.toMatchObject({code:'illegal_move'});r=(await send(store,a,{operation:'shot',code:r.code,revision:r.revision,shot:{x:500,angle:0,power:.1}})).view;expect(r.state!.turn).toBe(1);await expect(send(store,a,{operation:'tick',code:r.code,revision:r.revision})).rejects.toMatchObject({code:'shot_in_motion'});advance();r=(await send(store,a,{operation:'tick',code:r.code,revision:r.revision})).view;expect(r.state!.sequence).toBe(2);expect(r.state!.lastShot!.seat).toBe(1);});
 it('rejects remote-turn shots and client-supplied outcomes / NaN / out-of-range power',async()=>{const{store}=await setup(backend),r=await online(store);await expect(send(store,b,{operation:'shot',code:r.code,revision:r.revision,shot:{x:500,angle:0,power:.5}})).rejects.toMatchObject({code:'illegal_move'});for(const shot of[{x:5,angle:0,power:.5},{x:500,angle:NaN,power:.5},{x:500,angle:0,power:5},{x:500,angle:0,power:.5,winner:0}])await expect(send(store,a,{operation:'shot',code:r.code,revision:r.revision,shot})).rejects.toMatchObject({status:400});expect((await store.get(r.code,a.principal)).state?.sequence).toBe(0);});
 it('rejects an overlapping striker and allows an unobstructed part of the same baseline',async()=>{const{store,raw}=await setup(backend),r=await online(store);const row=JSON.parse(String(raw.prepare('SELECT data FROM carrom_rooms WHERE code=?').get(r.code)!.data));row.state.balls.push(makeDisc('extra','black',500,815));raw.prepare('UPDATE carrom_rooms SET data=? WHERE code=?').run(JSON.stringify(row),r.code);await expect(send(store,a,{operation:'shot',code:r.code,revision:r.revision,shot:{x:500,angle:-Math.PI/2,power:.5}})).rejects.toMatchObject({code:'illegal_move'});expect((await send(store,a,{operation:'shot',code:r.code,revision:r.revision,shot:{x:300,angle:-Math.PI/2,power:.5}})).view.state?.sequence).toBe(1);});
 it.each(['bot','online']as const)('commits trusted %s win evidence, credits once and unlocks Carrom achievements',async mode=>{const{store,economy,raw,db}=await setup(backend);const r=mode==='online'?await online(store):(await send(store,a,{operation:'create',name:'Player',options:{...opts,mode}})).view;const row=JSON.parse(String(raw.prepare('SELECT data FROM carrom_rooms WHERE code=?').get(r.code)!.data)),s=row.state as CarromState;s.potted[0]=Array.from({length:8},(_,i)=>`white-${i+1}`);s.balls=s.balls.filter(b=>b.kind!=='white');s.balls.push(makeDisc('white-9','white',850,500));const shot=carromBotShot(s,0,'hard');raw.prepare('UPDATE carrom_rooms SET data=? WHERE code=?').run(JSON.stringify(row),r.code);const result=await send(store,a,{operation:'shot',code:r.code,revision:r.revision,shot});expect(result.view.status).toBe('finished');await economy.syncTrustedRewards(a);await economy.syncTrustedRewards(a);const data=await economy.read(a);expect(data.wallet.dice_points).toBe(mode==='online'?50:25);expect(data.stats.carromWins).toBe(1);expect(data.stats.carromHumanWins).toBe(mode==='online'?1:0);expect(data.achievements.find(x=>x.id==='carrom-victory-1')?.unlocked).toBe(true);const evidence=JSON.parse(String(raw.prepare('SELECT payload FROM carrom_rewards').get()!.payload));await expect(economy.claimCarromReward({...evidence,scores:[999,0]})).rejects.toMatchObject({code:'reward_unverified'});expect((await economy.wallet(b)).dice_points).toBe(0);const social=new SocialStore(db);await social.ensureProfile(a);await social.ensureProfile(b);raw.prepare("INSERT INTO social_friends(low_id,high_id,requester_id,status,created_at,updated_at) VALUES(?,?,?,'accepted',1,1)").run(id,peerID,id);const feed=await social.read(b,new URL('https://clubhouse.test/api/social/activity'))as{activity:{game:string}[]};expect(feed.activity[0]!.game).toBe('carrom');});
 it.each(['bot','online'] as const)('earns Carrom crates from verified %s wins and equips collectible designs',async mode=>{
  const {raw,db}=await setup(backend);
  const economy=new EconomyStore(db,Date.now,()=>0);
  const wins=mode==='online'?6:9;
  const board=CARROM_BOARDS[0]!,pucks=CARROM_PUCKS[0]!,striker=CARROM_STRIKERS[0]!;
  expect([CARROM_BOARDS.length,CARROM_PUCKS.length,CARROM_STRIKERS.length]).toEqual([16,D6_DICE_SETS.length,20]);
  expect(CARROM_PUCKS.map(item=>item.id)).toEqual(D6_DICE_SETS.map(die=>die.id.replace('farkle-dice-','carrom-pucks-')));
  let crateId='';
  for(let i=0;i<wins;i++){
   const match_id=randomUUID();
   const reward:CarromMatchReward={version:1,match_id,mode,variant:'disc-pool',queenCovered:false,
    completed_at:new Date().toISOString(),winner:0,scores:[9,1],players:[{user_id:id,bot:false,level:null},
      mode==='online'?{user_id:peerID,bot:false,level:null}:{user_id:null,bot:true,level:'hard'}]};
   raw.prepare('INSERT INTO carrom_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)')
     .run(match_id,'ABC123DE',JSON.stringify(reward),Date.now());
   await economy.claimCarromReward(reward);
   await economy.claimCarromReward(reward);
   crateId=`carrom:${match_id}`;
  }
  expect((await economy.read(a)).rewardCrates?.carrom?.unopened).toBe(1);
  await expect(economy.command(a,{operation:'open_reward_crate',collection:'dice',crateId})).rejects.toMatchObject({status:400});
  const open={operation:'open_reward_crate',collection:'carrom',crateId};
  const [first,retry]=await Promise.all([economy.command(a,open),economy.command(a,open)]);
  expect(first.receipt.crate).toMatchObject({itemId:board.id,fragments:1,cash:mode==='online'?28:3});
  expect(first.receipt.crate).toEqual(retry.receipt.crate);
  expect((await economy.read(a)).rewardCrates?.carrom?.unopened).toBe(0);
  await expect(economy.command(a,{operation:'equip',itemId:striker.id,slot:striker.slot})).rejects.toMatchObject({code:'not_owned'});
  raw.prepare("UPDATE economy_wallets SET dice_points=dice_points+100 WHERE user_id=?").run(id);
  for(const [item,count] of [[board,2],[striker,3]] as const){
   await economy.command(a,{operation:'buy_fragments',itemId:item.id,count,payment:'game',requestId:randomUUID()});
   await economy.command(a,{operation:'equip',itemId:item.id,slot:item.slot});
  }
  const appearance=equippedCarrom(await economy.wallet(a));
  expect(appearance.boardDesign.id).toBe(board.id);
  expect(appearance.strikerDesign.id).toBe(striker.id);
  expect(appearance.puckDesign.id).not.toBe(pucks.id);
  await expect(economy.command(a,{operation:'equip',itemId:striker.id,slot:pucks.slot})).rejects.toMatchObject({status:400});
 });
 it('ends abandoned matches without gifting a win and allows recoverable departure',async()=>{const{store,economy}=await setup(backend),r=await online(store),request={operation:'leave',code:r.code,requestId:randomUUID()};await store.command(a,request);expect((await store.command(a,request)).changed).toBe(false);expect((await store.get(r.code,b.principal)).status).toBe('abandoned');await economy.syncTrustedRewards(a);expect((await economy.wallet(a)).dice_points).toBe(0);});
});
