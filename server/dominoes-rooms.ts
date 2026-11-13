import { COMPUTER_STEP_MS,type ComputerStates } from '../src/lib/computer-turns';
import { settlePresence, touchSeat, type PresenceSeat } from './room-presence';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { D1Binding, D1Statement } from './database';
import type { Identity } from './rooms';
import { RummyError } from '../src/lib/rummy-protocol';
import { containsProfanity } from '../src/lib/moderation';
import { memberId, type RewardView } from '../src/lib/rummy-rewards';
import { CARD_WIN_POINTS } from '../src/lib/reward-rates';
import { applyDominoMove, dominoBotMove, newDominoGame, parseDominoMove, dominoOptions, canDrawDomino, canPassDomino, DOMINO_VARIANTS, type DominoState } from '../src/lib/dominoes';
import type { DominoCommand, DominoOptions, DominoRoomView } from '../src/lib/dominoes-protocol';
import { dominoRewardTier, dominoWinner, type DominoMatchReward } from '../src/lib/dominoes-rewards';

interface Member extends PresenceSeat { id: string; name: string; ready: boolean; seat: number }
interface Room { cratePolicy?:number; presentation?:ComputerStates<DominoState>; code: string; matchId: string; owner: string; options: DominoOptions; members: Member[]; state: DominoState | null; revision: number; status: DominoRoomView['status']; createdAt: number; updatedAt: number }
interface StoredRequest { payload: string; response: string }
export interface DominoCommandResult { view: DominoRoomView; changed: boolean }
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
function settings(input: unknown): DominoOptions {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new RummyError('Choose Dominoes settings.');
  const v=input as Record<string,unknown>;
  if(!own(v,['mode','variant','level','target'])||typeof v.mode!=='string'||typeof v.variant!=='string'||typeof v.level!=='string'||!['bot','online'].includes(String(v.mode))||!Object.hasOwn(DOMINO_VARIANTS,String(v.variant))||!['easy','normal','hard'].includes(String(v.level))||![100,150,200].includes(Number(v.target))||typeof v.target!=='number')throw new RummyError('Choose Draw, Block or Muggins, a difficulty and a match target.');
  return {mode:v.mode as DominoOptions['mode'],variant:v.variant as DominoOptions['variant'],level:v.level as DominoOptions['level'],target:v.target as DominoOptions['target']};
}
function commandFor(input: unknown): DominoCommand {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new RummyError('Choose a Dominoes action.');
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
  if(value.operation==='start'&&own(value,['operation','code','revision','requestId']))return {operation:'start',code,revision,requestId};
  if(value.operation==='move'&&own(value,['operation','code','revision','move','requestId'])) {
    const move=parseDominoMove(value.move);if(move)return {operation:'move',code,revision,move,requestId};
  }
  throw new RummyError('That Dominoes action is invalid.');
}
function pump(state: DominoState,frames:DominoState[]) {
  frames.push(state);
  // Drawing stops at the first legal tile, then the bot plays or passes.
  // One computer turn therefore needs at most two actions.
  for(let moves=0;moves<8&&state.phase==='play'&&state.players[state.turn]!.bot;moves++) {
    const player=state.players[state.turn]!,move=dominoBotMove(state,state.turn,player.level??'normal',rand);
    const next=move&&applyDominoMove(state,state.turn,move,rand);
    if(!next)throw new Error('Dominoes computer could not choose a legal action.');
    state=next;frames.push(state);
  }
  if(state.phase==='play'&&state.players[state.turn]!.bot)throw new Error('Dominoes computer exceeded its turn limit.');
  return state;
}
/** One asynchronous implementation serves both SQLite and hosted D1. Every
 * deal and command receipt commits in the same revision-guarded batch. */
export class DominoRoomStore {
  constructor(readonly binding: D1Binding,private readonly now=Date.now) {}
  private stmt(sql:string,...values:unknown[]) {return this.binding.prepare(sql).bind(...values);}
  private first<T=Record<string,unknown>>(sql:string,...values:unknown[]) {return this.stmt(sql,...values).first<T>();}
  private advance(room:Room,state:DominoState) {
    const frames:DominoState[]=[];const next=pump(state,frames);
    room.presentation=frames.length>1?{id:randomUUID(),startedAt:Date.now(),states:frames}:undefined;
    return next;
  }
  private async load(code:string):Promise<Room> {
    if(!CODE.test(code))throw new RummyError('Enter an eight-character room code.');
    const row=await this.first<{data:string}>('SELECT data FROM domino_rooms WHERE code=?',code);
    if(!row)throw new RummyError('Dominoes table not found.',404,'not_found');
    return JSON.parse(row.data) as Room;
  }
  private member(room:Room,principal:string) {
    const value=room.members.find(member=>member.principal===principal);
    if(!value)throw new RummyError('You are not a player at this Dominoes table.',403,'not_a_player');
    return value;
  }
  private start(room:Room) {
    const players=room.members.slice().sort((a,b)=>a.seat-b.seat).map(member=>({id:member.id,name:member.name,bot:false}));
    if(room.options.mode==='bot')players.push({id:randomUUID(),name:`${room.options.level[0]!.toUpperCase()+room.options.level.slice(1)} Computer`,bot:true,...{level:room.options.level}});
    room.state=this.advance(room,newDominoGame(players,room.options.variant,room.options.target,rand));room.status='playing';
  }
  private evidence(room:Room):DominoMatchReward|null {
    const state=room.state;
    if(room.status!=='finished'||!state||state.winner===null)return null;
    const winner=state.winner!,players=state.players.map(player=>({user_id:player.bot?null:memberId(room.members.find(member=>member.id===player.id)?.principal??''),bot:player.bot,level:player.bot?player.level??'normal':null}));
    if(players[winner]!.bot||!players[winner]!.user_id)return null;
    const humans=players.filter(player=>!player.bot);
    if(humans.some(player=>!player.user_id)||new Set(humans.map(player=>player.user_id)).size!==humans.length)return null;
    if(room.options.mode==='online'&&(players.some(player=>player.bot)||humans.length!==2))return null;
    if(room.options.mode==='bot'&&(humans.length!==1||players.length!==2))return null;
    const result:DominoMatchReward={version:1,match_id:room.matchId,mode:room.options.mode,variant:room.options.variant,players,winner,scores:[...state.scores],completed_at:new Date(this.now()).toISOString()};
    return dominoRewardTier(result.mode,result.players)&&dominoWinner(result)?result:null;
  }
  private async reward(room:Room,principal:string):Promise<RewardView> {
    const none=(message:string):RewardView=>({status:'ineligible',tier:null,amount:0,message});
    const id=memberId(principal);
    if(!id)return none('Guest games are free to play. Sign in before starting a game to earn Dominoes points.');
    if(room.status==='abandoned')return none('This match ended without a reward.');
    const eligible=room.options.mode==='bot'||room.members.length===2&&room.members.every(member=>memberId(member.principal));
    if(!eligible)return none('Online reward games require every player to be signed in.');
    const tier=room.options.mode==='bot'?room.options.level:'humans',amount=CARD_WIN_POINTS[tier];
    if(room.status==='finished') {
      const evidence=this.evidence(room);
      if(!evidence)return none(room.state?.winner===null?'The match is a tie. No win points are awarded.':'Only an eligible human winner earns Dominoes points.');
      if(evidence.players[evidence.winner!]!.user_id!==id)return none('Only the match winner earns Dominoes points.');
      const source=`dominoes:win:${room.matchId}`,paid=await this.first<{amount:number}>('SELECT amount FROM economy_ledger WHERE user_id=? AND source=?',id,source);
      return paid?{status:'credited',tier,amount:paid.amount,source,message:`${paid.amount} Dominoes points credited to your wallet.`}:{status:'pending',tier,amount,source,message:`Match won! ${amount} Dominoes points are being saved.`};
    }
    return {status:'eligible',tier,amount,message:`Win the full match to earn ${amount} Dominoes points.`};
  }
  private async view(room:Room,principal:string,rewardOverride?:RewardView):Promise<DominoRoomView> {
    const me=this.member(room,principal),state=room.state,playing=room.status==='playing'&&state?.phase==='play';
    const result:DominoRoomView = {code:room.code,revision:room.revision,owner:room.owner===principal,status:room.status,options:{...room.options},mySeat:me.seat,
      players:Array.from({length:2},(_,seat)=>{const member=room.members.find(m=>m.seat===seat),player=state?.players[seat];return {id:player?.id??member?.id??`seat-${seat}`,name:player?.name??member?.name??'Open seat',bot:player?.bot??false,ready:member?.ready??Boolean(player?.bot),you:me.seat===seat,occupied:Boolean(member||player),count:state?.hands[seat]?.length??0,score:state?.scores[seat]??0};}),
      hand:state?.hands[me.seat]??[],board:state?.board??[],stockCount:state?.stock.length??0,turn:state?.turn??0,round:state?.round??1,phase:state?.phase??null,scores:state?.scores??[0,0],
      legal:state&&playing?dominoOptions(state,me.seat):[],canDraw:Boolean(state&&playing&&canDrawDomino(state,me.seat)),canPass:Boolean(state&&playing&&canPassDomino(state,me.seat)),forcedOpening:state?.forcedOpening??null,
      activity:state?.activity??[],result:state?.result??null,winner:state?.winner??null,revealedHands:state&&state.phase!=='play'?state.hands:null,reward:rewardOverride??await this.reward(room,principal)};

    if(room.presentation&&room.status!=='abandoned'){
      const frameReward:RewardView=result.reward.status==='credited'||result.reward.status==='pending'?{status:'eligible',tier:result.reward.tier,amount:result.reward.amount,message:'Computer turn in progress.'}:result.reward;
      const frames:DominoRoomView[]=[];
      for(const snapshot of room.presentation.states) frames.push(await this.view({...room,state:snapshot,presentation:undefined,status:snapshot.phase==='finished'? 'finished':'playing'},principal,frameReward));
      result.playback={id:room.presentation.id,startedAt:room.presentation.startedAt,stepMs:COMPUTER_STEP_MS,frames};
    }
    return result;
  }
  async get(code:string,principal:string,owned?:readonly string[]) {
    const room=await this.load(code);this.member(room,principal);
    if(settlePresence(room,principal,this.now()))await this.stmt("UPDATE domino_rooms SET data=? WHERE code=? AND json_extract(data,'$.revision')=?",JSON.stringify(room),code,room.revision).run();
    return this.view(room,principal);
  }
  private prior(principal:string,requestId:string) {return this.first<StoredRequest>('SELECT payload,response FROM domino_requests WHERE principal=? AND request_id=?',principal,requestId);}
  private async repeated(identity:Identity,command:DominoCommand,payload:string,prior:StoredRequest):Promise<DominoCommandResult> {
    if(prior.payload!==payload)throw new RummyError('That action ID already belongs to another action.',409,'request_reused');
    const saved=JSON.parse(prior.response) as DominoCommandResult;
    if(command.operation==='leave')return {...saved,changed:false};
    return {view:await this.get(saved.view.code,identity.principal,identity.owned),changed:false};
  }
  async command(identity:Identity,input:unknown):Promise<DominoCommandResult> {
    const command=commandFor(input),payload=JSON.stringify(command),prior=await this.prior(identity.principal,command.requestId);
    if(prior)return this.repeated(identity,command,payload,prior);
    let room:Room,oldRevision:number,leaving:DominoRoomView|null=null;
    if(command.operation==='create') {
      const active=await this.first<{n:number}>("SELECT count(*) AS n FROM domino_rooms WHERE json_extract(data,'$.updatedAt')>?",this.now()-86400000);
      if(Number(active?.n??0)>=5000)throw new RummyError('Dominoes is busy. Please try again later.',503);
      let code:string;do {code=randomBytes(4).toString('hex').toUpperCase();}while(await this.first('SELECT code FROM domino_rooms WHERE code=?',code));
      oldRevision=0;room={code,cratePolicy:2,matchId:randomUUID(),owner:identity.principal,options:command.options,members:[{id:randomUUID(),principal:identity.principal,name:command.name,seat:0,ready:true,seenAt:this.now()}],state:null,revision:1,status:'waiting',createdAt:this.now(),updatedAt:this.now()};
      if(command.options.mode==='bot')this.start(room);
    } else {
      room=await this.load(command.code);oldRevision=room.revision;
      touchSeat(room.members,identity.principal,this.now());
      if(command.operation==='join') {
        const present=room.members.find(member=>member.principal===identity.principal);
        if(!present) {
          if(room.options.mode!=='online'||room.status!=='waiting')throw new RummyError('This table is no longer accepting players.',409,'table_closed');
          if(room.members.length>=2)throw new RummyError('This table is full.',409,'table_full');
          const seat=Array.from({length:2},(_,seat)=>seat).find(seat=>!room.members.some(member=>member.seat===seat))!;
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
          if(room.members.length!==2||!room.members.every(member=>member.ready))throw new RummyError('Fill every seat and have every player ready up first.',409,'not_ready');
          // Fill contiguous seats after lobby departures before creating the state.
          room.members.sort((a,b)=>a.seat-b.seat).forEach((member,seat)=>member.seat=seat);
          this.start(room);
        } else if(command.operation==='move') {
          if(room.status!=='playing'||!room.state)throw new RummyError('This match is not in progress.',409,'table_closed');
          if(command.revision!==room.revision)throw new RummyError('The table changed. Refresh before playing.',409,'stale');
          const next=applyDominoMove(room.state,me.seat,command.move,rand);
          if(!next)throw new RummyError('That action is not legal on this turn.',409,'illegal_move');
          room.state=this.advance(room,next);if(room.state.phase==='finished')room.status='finished';
        } else if(command.operation==='leave') {
          // A member can always leave, even if an entitlement was revoked.
          // The acknowledgement contains no fresh table state or other seats.
          leaving={code:room.code,revision:room.revision,owner:false,status:'abandoned',options:{...room.options},mySeat:me.seat,players:[],hand:[],board:[],stockCount:0,turn:0,round:1,phase:null,scores:[],legal:[],canDraw:false,canPass:false,forcedOpening:null,activity:[],result:null,winner:null,revealedHands:null,reward:{status:'ineligible',tier:null,amount:0,message:'You left this Dominoes table.'}};
          if(room.status==='waiting') {
            room.members=room.members.filter(member=>member.principal!==identity.principal);
            if(!room.members.length)room.status='abandoned';
            else if(room.owner===identity.principal)room.owner=room.members[0]!.principal;
          } else if(room.status==='playing')room.status='abandoned';
        }
      }
      room.revision++;room.updatedAt=this.now();
    }
    const result:DominoCommandResult={view:leaving?{...leaving,revision:room.revision}:await this.view(room,identity.principal),changed:true};
    const statements:D1Statement[]=[this.stmt("INSERT INTO command_guards(valid) SELECT CASE WHEN COALESCE((SELECT json_extract(data,'$.revision') FROM domino_rooms WHERE code=?),0)=? THEN 1 ELSE 0 END",room.code,oldRevision),
      this.stmt('INSERT INTO domino_rooms(code,data) VALUES(?,?) ON CONFLICT(code) DO UPDATE SET data=excluded.data',room.code,JSON.stringify(room)),
      this.stmt('INSERT INTO domino_requests(principal,request_id,payload,response,created_at) VALUES(?,?,?,?,?)',identity.principal,command.requestId,payload,JSON.stringify(result),this.now())];
    const evidence=this.evidence(room);
    if(evidence)statements.push(this.stmt('INSERT OR IGNORE INTO domino_rewards(match_id,room_code,payload,created_at) VALUES(?,?,?,?)',room.matchId,room.code,JSON.stringify(evidence),this.now()));
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
