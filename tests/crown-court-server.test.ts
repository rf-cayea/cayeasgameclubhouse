import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TestD1 } from './helpers/d1';
import { CrownCourtRoomStore } from '../server/crown-court-rooms';
import { EconomyStore } from '../server/economy';
import { MatchmakingStore } from '../server/matchmaking';
import { crownCourtWinner, validCrownCourtReceipt, type CrownCourtMatchReward } from '../src/lib/crown-court-rewards';
import { courtCategories, type CourtLength } from '../src/lib/crown-court';
import { CARD_WIN_POINTS } from '../src/lib/reward-rates';
import type { Identity } from '../server/rooms';
const dbs: TestD1[] = []; afterEach(() => dbs.splice(0).forEach(db => db.sqlite.close()));
const actor: Identity = { principal:'member:11111111-1111-4111-8111-111111111111', jokers:false }, guest = (n:number): Identity => ({ principal:`guest:crown-test-${n}`, jokers:false });
function setup() { const db = new TestD1(); dbs.push(db); return { db, store:new CrownCourtRoomStore(db,Date.now,()=>.99), economy:new EconomyStore(db), discovery:new MatchmakingStore(db) }; }
const send = (store:CrownCourtRoomStore,identity:Identity,input:Record<string,unknown>) => store.command(identity,{ requestId:randomUUID(),...input });
const options = { mode:'online',seats:2,level:'normal',length:'short' };
describe('authoritative Crown & Court rooms and rewards',()=>{
 it.each([2,3,4])('opens a free %i-player lobby with matching scorecard length, stable seats and host-controlled start',async seats=>{
  const {store,discovery}=setup(),host=guest(0),length=(['short','medium','long'] as const)[seats-2]!;
  let room=(await send(store,host,{operation:'create',name:'Host',options:{...options,seats,length}})).view;
  expect(room.status).toBe('waiting');expect((await discovery.list('crown-court',guest(1))).rooms).toEqual([]);
  await discovery.command('crown-court',host,{operation:'publish',code:room.code},async()=>null);
  expect((await discovery.list('crown-court',guest(1))).rooms[0]).toMatchObject({code:room.code,seats,variant:length,locked:false});
  await expect(send(store,host,{operation:'start',code:room.code,revision:room.revision})).rejects.toMatchObject({code:'not_ready'});
  for(let i=1;i<seats;i++) {const peer=guest(i);const joined=await discovery.command('crown-court',peer,{operation:'join',code:room.code,name:`Guest ${i}`,requestId:randomUUID()},command=>store.command(peer,command));expect((joined as any).view.mySeat).toBe(i);await send(store,peer,{operation:'join',code:room.code,name:`Guest ${i}`});await send(store,peer,{operation:'ready',code:room.code,ready:true});}
  room=await store.get(room.code,host.principal);expect(room.players.filter(p=>p.occupied)).toHaveLength(seats);
  await expect(send(store,guest(1),{operation:'start',code:room.code,revision:room.revision})).rejects.toMatchObject({code:'not_host'});
  room=(await send(store,host,{operation:'start',code:room.code,revision:room.revision})).view;
  expect(room.state?.dice).toHaveLength(5);expect(room.state?.length).toBe(length);expect(room.state?.players).toHaveLength(seats);expect((await discovery.list('crown-court',guest(1))).rooms).toEqual([]);
 });
 it('records each random roll once, rejects stale/forged moves and requires a valid length',async()=>{
  const {store,db}=setup(),host=guest(0);let room=(await send(store,host,{operation:'create',name:'Player',options:{...options,mode:'bot'}})).view;
  const command={operation:'move',code:room.code,revision:room.revision,requestId:randomUUID(),move:{t:'roll'}};
  const first=await store.command(host,command),retry=await store.command(host,command);expect(first.view.state?.dice).toEqual([6,6,6,6,6]);expect(retry.changed).toBe(false);expect(retry.view).toEqual(first.view);
  await expect(store.command(host,{...command,requestId:randomUUID()})).rejects.toMatchObject({code:'stale'});
  await expect(store.command(host,{...command,move:{t:'roll',dice:[6,6,6,6,6]}})).rejects.toThrow();
  await expect(store.command(host,{...command,move:{t:'score',category:'five-kind'}})).rejects.toMatchObject({code:'request_reused'});
  await expect(store.get(room.code,guest(9).principal)).rejects.toMatchObject({status:403});
  expect(db.sqlite.prepare('SELECT count(*) n FROM crown_court_requests').get()?.n).toBe(2);
  for(const length of [undefined,'invalid',21])await expect(send(store,host,{operation:'create',name:'Player',options:{...options,length}})).rejects.toThrow();
 });
 it.each(['easy','normal','hard'] as const)('completes a %s opponent turn with readable committed rolls and scoring',async level=>{
  const {store}=setup(),host=guest(0);let room=(await send(store,host,{operation:'create',name:'Player',options:{...options,mode:'bot',level,length:'long'}})).view;
  room=(await send(store,host,{operation:'move',code:room.code,revision:room.revision,move:{t:'roll'}})).view;
  room=(await send(store,host,{operation:'move',code:room.code,revision:room.revision,move:{t:'score',category:'five-kind'}})).view;
  expect(room.state?.turn).toBe(0);expect(room.state?.round).toBe(2);expect(room.state?.cards[1]?.scores['five-kind']).toBe(103);
  expect(room.state?.activity.some(e=>e.seat===1&&e.kind==='roll')).toBe(true);expect(room.state?.activity.at(-1)).toMatchObject({seat:1,kind:'score',score:103});expect(room.reward.status).toBe('ineligible');
 });
 it.each(['short','medium','long'] as CourtLength[])('credits a completed %s member win exactly once to Dice points, with separate badges and profile stats',async length=>{
  const {store,db,economy}=setup();await economy.ensureMember(actor);
  const room=(await send(store,actor,{operation:'create',name:'Member',options:{...options,mode:'bot',level:'hard',length}})).view;
  // A server-only endgame fixture; clients have no operation that accepts scores.
  const row=JSON.parse(db.sqlite.prepare('SELECT data FROM crown_court_rooms WHERE code=?').get(room.code)!.data as string);
  row.state.cards=Array.from({length:2},(_,seat)=>({scores:Object.fromEntries(courtCategories(length).filter(c=>seat===1||c.id!=='five-kind').map(c=>[c.id,0]))}));row.state.dice=[6,6,6,6,6];row.state.rolls=1;
  db.sqlite.prepare('UPDATE crown_court_rooms SET data=? WHERE code=?').run(JSON.stringify(row),room.code);
  const won=await send(store,actor,{operation:'move',code:room.code,revision:room.revision,move:{t:'score',category:'five-kind'}});
  expect(won.view.status).toBe('finished');expect(won.view.state?.winners).toEqual([0]);
  const evidence=JSON.parse(db.sqlite.prepare('SELECT payload FROM crown_court_rewards').get()!.payload as string) as CrownCourtMatchReward;
  expect(crownCourtWinner(evidence)).toBe(actor.principal.slice(7));expect(evidence.length).toBe(length);
  await economy.syncTrustedRewards(actor);await economy.syncTrustedRewards(actor);const receipt=await economy.claimCrownCourtReward(evidence);expect(validCrownCourtReceipt(evidence,receipt)).toBe(true);
  const data=await economy.read(actor);expect(data.wallet.dice_points).toBe(CARD_WIN_POINTS.hard);expect(data.wallet.points).toBe(0);expect(data.stats).toMatchObject({crownWins:1,crownHardWins:1,diceWins:0,farkleWins:0,gamesPlayed:1});
  expect(data.achievements.find(b=>b.id==='crown-court-victory-1')).toMatchObject({unlocked:true,claimed:false,currency:'dice_points'});
  const badge=await economy.command(actor,{operation:'claim_achievement',achievementId:'crown-court-victory-1'});expect(badge.wallet.dice_points).toBeGreaterThan(CARD_WIN_POINTS.hard);expect(badge.wallet.points).toBeGreaterThan(0);
  await expect(economy.claimCrownCourtReward({...evidence,scores:[999,0]})).rejects.toMatchObject({code:'reward_unverified'});
 });
});
