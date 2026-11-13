import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { settlePresence, touchSeat, type PresenceSeat } from './room-presence';
import type { D1Binding, D1Statement } from './database';
import type { Identity } from './rooms';
import { RummyError } from '../src/lib/rummy-protocol';
import { containsProfanity } from '../src/lib/moderation';
import { memberId, type RewardView } from '../src/lib/rummy-rewards';
import { CARD_WIN_POINTS } from '../src/lib/reward-rates';
import {applyBGMove,bgBotMove,newBackgammon,parseBGMove,type BGState,type BGSeat} from '../src/lib/backgammon';
import type { BGCommand, BGOptions, BGRoomView } from '../src/lib/backgammon-protocol';
import { bgRewardTier, bgWinner, type BGMatchReward } from '../src/lib/backgammon-rewards';

interface Member extends PresenceSeat { id: string; name: string; ready: boolean; seat: number }
interface Room { cratePolicy?:number; code: string; matchId: string; owner: string; options: BGOptions; members: Member[]; state: BGState | null; revision: number; status: BGRoomView['status']; createdAt: number; updatedAt: number }
interface StoredRequest { payload: string; response: string }
export interface BGCommandResult { view: BGRoomView; changed: boolean }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CODE = /^[A-F0-9]{8}$/;
const rand = () => randomInt(0,0x100000000)/0x100000000;
const own = (object: Record<string,unknown>, names: string[]) => Object.keys(object).length===names.length&&names.every(name=>Object.hasOwn(object,name));
function nameFor(input: unknown) {
  if(typeof input!=='string')throw new RummyError('Enter a friendly player name.');
  const name=input.normalize('NFKC').trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>24||/[\p{C}<>]/u.test(name)||containsProfanity(name))throw new RummyError('Use a friendly name with 2–24 characters.');
  return name;
}
function settings(input:unknown):BGOptions{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new RummyError('Choose Backgammon settings.');const v=input as Record<string,unknown>;
 if(!own(v,['mode','seats','level','target','crawford','variant'])||!['bot','online'].includes(String(v.mode))||v.seats!==2||!['easy','normal','hard'].includes(String(v.level))||![1,3,5,7,9].includes(Number(v.target))||typeof v.target!=='number'||typeof v.crawford!=='boolean'||!['standard','nackgammon'].includes(String(v.variant)))throw new RummyError('Choose standard or Nackgammon, two players and a 1, 3, 5, 7 or 9 point match.');return v as unknown as BGOptions;
}
function commandFor(input: unknown): BGCommand {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new RummyError('Choose a Backgammon action.');
  const value=input as Record<string,unknown>;
  if(typeof value.requestId!=='string'||!UUID.test(value.requestId))throw new RummyError('A unique action ID is required.');
  const requestId=value.requestId.toLowerCase();
  if(value.operation==='create'&&own(value,['operation','name','options','requestId']))return {operation:'create',name:nameFor(value.name),options:settings(value.options),requestId};
  if(typeof value.code!=='string'||!CODE.test(value.code))throw new RummyError('Enter an eight-character room code.');
  const code=value.code;
  if(value.operation==='join'&&own(value,['operation','code','name','requestId']))return {operation:'join',code,name:nameFor(value.name),requestId};
  if(value.operation==='ready'&&own(value,['operation','code','ready','requestId'])&&typeof value.ready==='boolean')return {operation:'ready',code,ready:value.ready,requestId};
  if(value.operation==='leave'&&own(value,['operation','code','requestId']))return {operation:'leave',code,requestId};
  if(!Number.isSafeInteger(value.revision)||Number(value.revision)<1)throw new RummyError('Refresh the table before this action.',409,'stale');
  const revision=Number(value.revision);
  if((value.operation==='start'||value.operation==='tick')&&own(value,['operation','code','revision','requestId']))return {operation:value.operation,code,revision,requestId};
  if(value.operation==='move'&&own(value,['operation','code','revision','move','requestId'])) {
    const move=parseBGMove(value.move);if(move)return {operation:'move',code,revision,move,requestId};
  }
  throw new RummyError('That Backgammon action is invalid.');
}
/** One asynchronous implementation serves both SQLite and hosted D1. Every
 * random roll and command receipt commits in the same revision-guarded batch. */
export class BackgammonRoomStore {
  constructor(readonly binding: D1Binding,private readonly now=Date.now,private readonly random=rand) {}
  private stmt(sql:string,...values:unknown[]) {return this.binding.prepare(sql).bind(...values);}
  private first<T=Record<string,unknown>>(sql:string,...values:unknown[]) {return this.stmt(sql,...values).first<T>();}
  private async load(code:string):Promise<Room> {
    if(!CODE.test(code))throw new RummyError('Enter an eight-character room code.');
    const row=await this.first<{data:string}>('SELECT data FROM backgammon_rooms WHERE code=?',code);
    if(!row)throw new RummyError('Backgammon table not found.',404,'not_found');
    return JSON.parse(row.data) as Room;
  }
  private member(room:Room,principal:string) {
    const value=room.members.find(member=>member.principal===principal);
    if(!value)throw new RummyError('You are not a player at this Backgammon table.',403,'not_a_player');
    return value;
  }
  private start(room:Room) {
    const players=room.members.slice().sort((a,b)=>a.seat-b.seat).map(member=>({id:member.id,name:member.name,bot:false}));
    if(room.options.mode==='bot')players.push({id:randomUUID(),name:`${room.options.level[0]!.toUpperCase()+room.options.level.slice(1)} Computer`,bot:true,...{level:room.options.level}});
    room.state=newBackgammon(players,room.options.target,room.options.crawford,room.options.variant);room.status='playing';
  }
  private evidence(room:Room):BGMatchReward|null {
    const state=room.state;
    if(room.status!=='finished'||!state||state.winner===null)return null;
    const winner=state.winner!,players=state.players.map(player=>({user_id:player.bot?null:memberId(room.members.find(member=>member.id===player.id)?.principal??''),bot:player.bot,level:player.bot?player.level??'normal':null}));
    if(players[winner]!.bot||!players[winner]!.user_id)return null;
    const humans=players.filter(player=>!player.bot);
    if(humans.some(player=>!player.user_id)||new Set(humans.map(player=>player.user_id)).size!==humans.length)return null;
    if(room.options.mode==='online'&&(players.some(player=>player.bot)||humans.length!==room.options.seats))return null;
    if(room.options.mode==='bot'&&(humans.length!==1||players.length!==2))return null;
    const result:BGMatchReward={version:1,match_id:room.matchId,target:room.options.target,mode:room.options.mode,players,winner,scores:[...state.scores],completed_at:new Date(this.now()).toISOString()};
    return bgRewardTier(result.mode,result.players)&&bgWinner(result)?result:null;
  }
  private async reward(room:Room,principal:string):Promise<RewardView> {
    const none=(message:string):RewardView=>({status:'ineligible',tier:null,amount:0,message});
    const id=memberId(principal);
    if(!id)return none('Guest games are free to play. Sign in before starting a game to earn Dice points.');
    if(room.status==='abandoned')return none('This match ended without a reward.');
    const eligible=room.options.mode==='bot'||room.members.length===room.options.seats&&room.members.every(member=>memberId(member.principal));
    if(!eligible)return none('Online reward games require every player to be signed in.');
    const tier=room.options.mode==='bot'?room.options.level:'humans',amount=CARD_WIN_POINTS[tier];
    if(room.status==='finished') {
      const evidence=this.evidence(room);
      if(!evidence)return none('Only an eligible human winner earns Dice points.');
      if(evidence.players[evidence.winner!]!.user_id!==id)return none('Only the match winner earns Dice points.');
      const source=`backgammon:win:${room.matchId}`,paid=await this.first<{amount:number}>('SELECT amount FROM economy_ledger WHERE user_id=? AND source=?',id,source);
      return paid?{status:'credited',tier,amount:paid.amount,source,message:`${paid.amount} Dice points credited to your wallet. Check Rewards for Backgammon crates.`}:{status:'pending',tier,amount,source,message:`Match won! ${amount} Dice points are being saved.`};
    }
    return {status:'eligible',tier,amount,message:`Win the full ${room.options.target}-point match to earn ${amount} Dice points. Crates: 6 real-player wins or 9 computer wins.`};
  }
  private async view(room:Room,principal:string):Promise<BGRoomView> {
    const me=this.member(room,principal);
    return {code:room.code,revision:room.revision,owner:room.owner===principal,status:room.status,options:{...room.options},mySeat:me.seat,
      players:Array.from({length:room.options.seats},(_,seat)=>{
        const member=room.members.find(member=>member.seat===seat),player=room.state?.players[seat];
        return {id:player?.id??member?.id??`seat-${seat}`,name:player?.name??member?.name??'Open seat',bot:player?.bot??false,ready:member?.ready??Boolean(player?.bot),you:me.seat===seat,occupied:Boolean(member||player)};
      }),state:room.state,reward:await this.reward(room,principal)};
  }
  async get(code:string,principal:string,owned?:readonly string[]) {
    const room=await this.load(code);this.member(room,principal);
    if(settlePresence(room,principal,this.now()))await this.stmt("UPDATE backgammon_rooms SET data=? WHERE code=? AND json_extract(data,'$.revision')=?",JSON.stringify(room),code,room.revision).run();
    return this.view(room,principal);
  }
  private prior(principal:string,requestId:string) {return this.first<StoredRequest>('SELECT payload,response FROM backgammon_requests WHERE principal=? AND request_id=?',principal,requestId);}
  private async repeated(identity:Identity,command:BGCommand,payload:string,prior:StoredRequest):Promise<BGCommandResult> {
    if(prior.payload!==payload)throw new RummyError('That action ID already belongs to another action.',409,'request_reused');
    const saved=JSON.parse(prior.response) as BGCommandResult;
    if(command.operation==='leave')return {...saved,changed:false};
    return {view:await this.get(saved.view.code,identity.principal,identity.owned),changed:false};
  }
  async command(identity:Identity,input:unknown):Promise<BGCommandResult> {
    const command=commandFor(input),payload=JSON.stringify(command),prior=await this.prior(identity.principal,command.requestId);
    if(prior)return this.repeated(identity,command,payload,prior);
    let room:Room,oldRevision:number,leaving:BGRoomView|null=null;
    if(command.operation==='create') {
      const active=await this.first<{n:number}>("SELECT count(*) AS n FROM backgammon_rooms WHERE json_extract(data,'$.updatedAt')>?",this.now()-86400000);
      if(Number(active?.n??0)>=5000)throw new RummyError('Backgammon is busy. Please try again later.',503);
      let code:string;do {code=randomBytes(4).toString('hex').toUpperCase();}while(await this.first('SELECT code FROM backgammon_rooms WHERE code=?',code));
      oldRevision=0;room={code,cratePolicy:2,matchId:randomUUID(),owner:identity.principal,options:command.options,members:[{id:randomUUID(),principal:identity.principal,name:command.name,seat:0,ready:true,seenAt:this.now()}],state:null,revision:1,status:'waiting',createdAt:this.now(),updatedAt:this.now()};
      if(command.options.mode==='bot')this.start(room);
    } else {
      room=await this.load(command.code);oldRevision=room.revision;
      touchSeat(room.members,identity.principal,this.now());
      if(command.operation==='join') {
        const present=room.members.find(member=>member.principal===identity.principal);
        if(!present) {
          if(room.options.mode!=='online'||room.status!=='waiting')throw new RummyError('This table is no longer accepting players.',409,'table_closed');
          if(room.members.length>=room.options.seats)throw new RummyError('This table is full.',409,'table_full');
          const seat=Array.from({length:room.options.seats},(_,seat)=>seat).find(seat=>!room.members.some(member=>member.seat===seat))!;
          room.members.push({id:randomUUID(),principal:identity.principal,name:command.name,seat,ready:false,seenAt:this.now()});
        }
      } else {
        const me=this.member(room,identity.principal);
        if(command.operation==='ready') {
          if(room.status!=='waiting')throw new RummyError('This match has already started.',409,'table_closed');
          me.ready=command.ready;
        } else if(command.operation==='start') {
          if(room.owner!==identity.principal)throw new RummyError('Only the table host can start.',403,'not_host');
          if(room.status!=='waiting'||command.revision!==room.revision)throw new RummyError('The table changed. Refresh before starting.',409,'stale');
          if(room.members.length!==room.options.seats||!room.members.every(member=>member.ready))throw new RummyError('Fill every seat and have every player ready up first.',409,'not_ready');
          // Fill contiguous seats after lobby departures before creating the state.
          room.members.sort((a,b)=>a.seat-b.seat).forEach((member,seat)=>member.seat=seat);
          this.start(room);
        } else if(command.operation==='move'||command.operation==='tick') {
          if(room.status!=='playing'||!room.state)throw new RummyError('This match is not in progress.',409,'table_closed');
          if(command.revision!==room.revision)throw new RummyError('The table changed. Refresh before playing.',409,'stale');
          const active=room.state.phase==='double'?(1-room.state.offeredBy!) as BGSeat:room.state.turn;
          let next:BGState|null;
          if(command.operation==='tick'){
            if(room.state.phase==='opening'||room.state.phase==='gameOver'||!room.state.players[active]?.bot)throw new RummyError('Wait for a computer turn.',409,'illegal_move');
            const move=bgBotMove(room.state,active,room.options.level);next=move?applyBGMove(room.state,active,move,this.random):null;
          }else next=applyBGMove(room.state,me.seat as BGSeat,command.move,this.random);
          if(!next)throw new RummyError('That action is not legal on this turn.',409,'illegal_move');
          room.state=next;if(next.phase==='finished')room.status='finished';
        } else if(command.operation==='leave') {
          // A member can always leave, even if an entitlement was revoked.
          // The acknowledgement contains no fresh table state or other seats.
          leaving={code:room.code,revision:room.revision,owner:false,status:'abandoned',options:{...room.options},mySeat:me.seat,players:[],state:null,reward:{status:'ineligible',tier:null,amount:0,message:'You left this Backgammon table.'}};
          if(room.status==='waiting') {
            room.members=room.members.filter(member=>member.principal!==identity.principal);
            if(!room.members.length)room.status='abandoned';
            else if(room.owner===identity.principal)room.owner=room.members[0]!.principal;
          } else if(room.status==='playing')room.status='abandoned';
        }
      }
      room.revision++;room.updatedAt=this.now();
    }
    const result:BGCommandResult={view:leaving?{...leaving,revision:room.revision}:await this.view(room,identity.principal),changed:true};
    const statements:D1Statement[]=[this.stmt("INSERT INTO command_guards(valid) SELECT CASE WHEN COALESCE((SELECT json_extract(data,'$.revision') FROM backgammon_rooms WHERE code=?),0)=? THEN 1 ELSE 0 END",room.code,oldRevision),
      this.stmt('INSERT INTO backgammon_rooms(code,data) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data',room.code,JSON.stringify(room)),
      this.stmt('INSERT INTO backgammon_requests(principal,request_id,payload,response,created_at) VALUES(?,?,?,?,?)',identity.principal,command.requestId,payload,JSON.stringify(result),this.now())];
    const evidence=this.evidence(room);
    if(evidence)statements.push(this.stmt('INSERT OR IGNORE INTO backgammon_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)',room.matchId,room.code,JSON.stringify(evidence),this.now()));
    statements.push(this.stmt('DELETE FROM command_guards'));
    try {await this.binding.batch(statements);}catch(error) {
      const duplicate=await this.prior(identity.principal,command.requestId);
      if(duplicate)return this.repeated(identity,command,payload,duplicate);
      if(/room_revision_matches|CHECK constraint failed.*command_guards/.test(String(error)))throw new RummyError('The table changed. Refresh before playing.',409,'stale');
      throw error;
    }
    return result;
  }
}
