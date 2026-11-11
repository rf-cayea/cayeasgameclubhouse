import type {D1Binding} from './database';
import type {Identity} from './rooms';
import {RummyError} from '../src/lib/rummy-protocol';
import {memberId} from '../src/lib/rummy-rewards';
import {MATCH_GAMES,type MatchGame,type MatchListing,type MatchList} from '../src/lib/matchmaking';

const TABLES:Record<MatchGame,string>={carrom:'carrom_rooms',backgammon:'backgammon_rooms',rummy:'rooms',spades:'spades_rooms','five-dice':'five_dice_rooms',farkle:'farkle_rooms','crown-court':'crown_court_rooms',dominoes:'domino_rooms'};
export const MATCH_TTL=120_000;
interface PublicRoom {code:string;owner:string;status:string;options:{mode:string;variant?:string;seats?:number;humans?:number;target?:number;jokers?:boolean;crawford?:boolean;length?:string};members:{principal:string;name:string;ready:boolean}[]}
const codeFor=(value:unknown)=>{if(typeof value!=='string'||!/^[A-F0-9]{8}$/.test(value))throw new RummyError('Choose an open table.',400);return value;};
const capacity=(game:MatchGame,r:PublicRoom)=>game==='dominoes'?2:game==='spades'?r.options.humans??4:r.options.seats??2;
const variant=(game:MatchGame,r:PublicRoom)=>game==='crown-court'?r.options.length??'short':(game==='five-dice'||game==='farkle')?String(capacity(game,r)):r.options.variant??'classic';
function requirement(game:MatchGame,r:PublicRoom){return game==='farkle'&&capacity(game,r)>2?'farkle-party':game==='five-dice'&&capacity(game,r)>2?'five-dice-party':game==='spades'&&r.options.variant==='teams'?'spades-partnerships':game==='rummy'&&r.options.jokers?'rummy-jokers':null;}
const REQUIRES:Record<string,string>={'farkle-party':'Farkle Party unlock','five-dice-party':'Quintsee Party unlock','spades-partnerships':'Spades Partnerships unlock','rummy-jokers':'Rummy+ Joker Mode unlock'};
const MODES:Record<string,string>={classic:'Classic Rummy',gin:'Gin Rummy','500':'Rummy 500',rummy500:'Rummy 500',r500:'Rummy 500',solo:'Solo Spades',teams:'Partnerships',draw:'Draw',block:'Block',muggins:'Muggins / All Fives'};
/** Discovery stores only explicit listings. Seats, entitlement checks, deals and
 * private hands continue through the existing authoritative room stores. */
export class MatchmakingStore {
 constructor(readonly db:D1Binding,private readonly now=Date.now){}
 private stmt(sql:string,...values:unknown[]){return this.db.prepare(sql).bind(...values);}
 private async room(game:MatchGame,code:string):Promise<PublicRoom>{
  const row=await this.stmt(`SELECT data FROM ${TABLES[game]} WHERE code=?`,code).first<{data:string}>();
  if(!row)throw new RummyError('This table is no longer available.',404,'table_closed');
  return JSON.parse(row.data);
 }
 private async blocked(actor:Identity,r:PublicRoom){
  const id=memberId(actor.principal);if(!id)return false;
  return Boolean(await this.stmt(`SELECT 1 AS blocked FROM social_blocks b JOIN json_each(?) m ON (b.blocker_id=? AND b.blocked_id=m.value) OR (b.blocked_id=? AND b.blocker_id=m.value) LIMIT 1`,JSON.stringify(r.members.map(m=>memberId(m.principal)).filter(Boolean)),id,id).first());
 }
 private checkAccess(actor:Identity,game:MatchGame,r:PublicRoom){
  const perk=requirement(game,r);
  if(perk&&!actor.owned?.includes(perk))throw new RummyError(`This table requires the ${REQUIRES[perk]}.`,403,'match_unlock_required');
  if(actor.nameFlagged)throw new RummyError('Update your gamer name before joining a public table.',403,'name_flagged');
 }
 async list(game:MatchGame,actor:Identity):Promise<MatchList>{
  const viewer=memberId(actor.principal)??'';
  const row=await this.stmt(`SELECT json_group_array(json_object('data',data,'createdAt',created_at)) AS data FROM (
   SELECT r.data,p.created_at FROM matchmaking_listings p JOIN ${TABLES[game]} r ON r.code=p.code
   WHERE p.game=? AND p.expires_at>? AND json_extract(r.data,'$.owner')=p.owner
   AND json_extract(r.data,'$.status')='waiting' AND json_extract(r.data,'$.options.mode')='online'
   AND (p.owner=? OR json_array_length(json_extract(r.data,'$.members')) < ${game==='dominoes'?'2':game==='spades'?"json_extract(r.data,'$.options.humans')":"json_extract(r.data,'$.options.seats')"})
   AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(r.data,'$.members')) m JOIN social_blocks b
    ON (b.blocker_id=? AND b.blocked_id=substr(json_extract(m.value,'$.principal'),8)) OR (b.blocked_id=? AND b.blocker_id=substr(json_extract(m.value,'$.principal'),8)))
   ORDER BY p.created_at LIMIT 40)`,game,this.now(),actor.principal,viewer,viewer).first<{data:string}>();
  const rooms:MatchListing[]=[];
  for(const value of JSON.parse(row?.data??'[]') as {data:string;createdAt:number}[]){
   const r=JSON.parse(value.data) as PublicRoom,seats=capacity(game,r),mine=r.owner===actor.principal;
   if(r.members.length>=seats&&!mine)continue;
   const v=variant(game,r),perk=requirement(game,r);
   rooms.push({code:r.code,host:r.members.find(m=>m.principal===r.owner)?.name??'Clubhouse player',variant:v,mode:game==='carrom'?(r.options.variant==='disc-pool'?'Disc Pool':'Carrom'):game==='backgammon'?`${r.options.variant==='nackgammon'?'Nackgammon':'Backgammon'}`:game==='crown-court'?`${r.options.length==='long'?'Long':r.options.length==='medium'?'Medium':'Short'} Crown & Court`:game==='farkle'?`${seats}-player Farkle · ${r.options.target===5000?'Fast':'Classic'}`:game==='five-dice'?`${seats}-player Quintsee`:MODES[v]??v,seats,occupied:r.members.length,ready:r.members.filter(m=>m.ready).length,details:game==='carrom'?'Two players · striker aiming & bank shots':game==='backgammon'?`${r.options.target}-point match · Crawford ${r.options.crawford?'on':'off'}`:game==='crown-court'?`${r.options.length==='long'?21:r.options.length==='medium'?14:7} turns · five poker dice · ${seats} players`:game==='farkle'?`Six dice · ${(r.options.target??10000).toLocaleString()} target · 300 to enter`:game==='spades'?`${seats} human seats${seats<4?` + ${4-seats} computers`:''} · ${r.options.target} point target`:game==='dominoes'?`First to ${r.options.target} match points`:game==='rummy'?r.options.jokers?'Joker Mode':'Standard deck':'13 rounds · five dice',mine,locked:Boolean(perk&&!actor.owned?.includes(perk)),requirement:perk?REQUIRES[perk]:null,createdAt:value.createdAt,jokers:Boolean(r.options.jokers),...(game==='farkle'?{target:r.options.target??10000}:typeof r.options.target==='number'?{target:r.options.target}:{})});
  }
  return {rooms,serverTime:this.now()};
 }
 /** Also guards ordinary code-based joins to a listed room. Knowing its code
  * must not bypass player blocks used by the public browser. */
 async checkPublicJoin(game:MatchGame,actor:Identity,input:unknown){
  const v=input as {operation?:unknown;code?:unknown}|null;
  if(v?.operation!=='join'||typeof v.code!=='string')return;
  const code=v.code.toUpperCase();if(!/^[A-F0-9]{8}$/.test(code))return;
  if(!await this.stmt('SELECT code FROM matchmaking_listings WHERE game=? AND code=?',game,code).first())return;
  const r=await this.room(game,code);
  if(await this.blocked(actor,r))throw new RummyError('This table is unavailable.',403,'connection_unavailable');
  this.checkAccess(actor,game,r);
 }
 async command(game:MatchGame,actor:Identity,input:unknown,join:(command:unknown)=>Promise<unknown>){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new RummyError('Choose a Match Making action.');
  const v=input as Record<string,unknown>,code=codeFor(v.code),r=await this.room(game,code);
  if(v.operation==='join'){
   // A repeated join can recover an accepted seat even after the listing closes.
   if(!r.members.some(m=>m.principal===actor.principal)){
    const listed=await this.stmt('SELECT code FROM matchmaking_listings WHERE game=? AND code=? AND owner=? AND expires_at>?',game,code,r.owner,this.now()).first();
    if(!listed||r.status!=='waiting'||r.options.mode!=='online'||r.members.length>=capacity(game,r))throw new RummyError('That seat has just been taken or the table closed. Refresh to choose another.',409,'table_closed');
   }
   if(await this.blocked(actor,r))throw new RummyError('This table is unavailable.',403,'connection_unavailable');
   this.checkAccess(actor,game,r);
   return join({operation:'join',code,name:v.name,...(game==='carrom'||game==='backgammon'||game==='five-dice'||game==='farkle'||game==='crown-court'||game==='dominoes'?{requestId:v.requestId}:{})});
  }
  if(!['publish','heartbeat','unpublish'].includes(String(v.operation)))throw new RummyError('Choose a Match Making action.');
  if(r.owner!==actor.principal)throw new RummyError('Only the host can list or hide this table.',403,'not_host');
  if(v.operation==='unpublish'){
   await this.stmt('DELETE FROM matchmaking_listings WHERE game=? AND code=? AND owner=?',game,code,actor.principal).run();return {listed:false};
  }
  if(r.status!=='waiting'||r.options.mode!=='online'){
   if(v.operation==='heartbeat')return {listed:false};
   throw new RummyError('Only waiting online tables can be listed.',409,'table_closed');
  }
  this.checkAccess(actor,game,r);
  if(v.operation==='publish'){
   await this.db.batch([
    this.stmt('DELETE FROM matchmaking_listings WHERE game=? AND owner=? AND code<>?',game,actor.principal,code),
    this.stmt(`INSERT INTO matchmaking_listings(game,code,owner,created_at,expires_at)
     SELECT ?,code,?, ?,? FROM ${TABLES[game]} WHERE code=? AND json_extract(data,'$.owner')=? AND json_extract(data,'$.status')='waiting' AND json_extract(data,'$.options.mode')='online'
     ON CONFLICT(game,code) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at`,game,actor.principal,this.now(),this.now()+MATCH_TTL,code,actor.principal),
   ]);
  }else{
   await this.stmt(`UPDATE matchmaking_listings SET expires_at=? WHERE game=? AND code=? AND owner=? AND EXISTS(SELECT 1 FROM ${TABLES[game]} r WHERE r.code=? AND json_extract(r.data,'$.owner')=? AND json_extract(r.data,'$.status')='waiting')`,this.now()+MATCH_TTL,game,code,actor.principal,code,actor.principal).run();
  }
  const listing=await this.stmt('SELECT code FROM matchmaking_listings WHERE game=? AND code=? AND owner=? AND expires_at>?',game,code,actor.principal,this.now()).first();
  return {listed:Boolean(listing)};
 }
}
export function matchGame(path:string):MatchGame|null{const match=/^\/api\/(carrom|backgammon|rummy|spades|five-dice|farkle|crown-court|dominoes)\/matchmaking$/.exec(path);return match&&MATCH_GAMES.includes(match[1] as MatchGame)?match[1] as MatchGame:null;}
