import type { FarkleActivity, FarkleState, FarkleTurnRecord } from './farkle';
export interface FarkleKeptRow { id:number; dice:number[]; score:number }
/** Each scoring decision fills the next row, regardless of how many dice it kept. */
export function farkleKeptRows(events:readonly FarkleActivity[],seat:number,through=Infinity):FarkleKeptRow[]{
 let rows:FarkleKeptRow[]=[],previous=Array<boolean>(6).fill(false),ended=false,lastPoints=0;
 for(const event of events){
  if(event.id>through)break;
  if(event.seat!==seat){rows=[];previous=Array(6).fill(false);ended=false;lastPoints=0;continue;}
  if(event.kind==='roll'&&(ended||event.hot||previous.every(Boolean))){rows=[];previous=Array(6).fill(false);ended=false;}
  if(event.kind==='roll')previous=[...event.kept];
  if(event.kind==='keep'){
   rows.push({id:event.id,dice:event.dice.filter((_,i)=>event.kept[i]&&!previous[i]),score:event.points});previous=[...event.kept];
  }
  if(event.kind==='bank'){
   const dice=event.dice.filter((_,i)=>event.kept[i]&&!previous[i]);
   if(dice.length)rows.push({id:event.id,dice,score:event.points-lastPoints});
   ended=true;
  }
  lastPoints=event.turnPoints;
  if(event.bust)ended=true;
 }
 return rows;
}
/** Older saved rooms retain their available terminal events; new matches keep every turn. */
export function farkleScoreHistory(state:FarkleState,through=Infinity):FarkleTurnRecord[]{
 return (state.scoreHistory??state.activity.filter(e=>e.kind==='bank'||e.bust).map(e=>({id:e.id,round:e.round,seat:e.seat,banked:e.kind==='bank'?e.points:0,lost:e.bust?e.turnPoints:0,total:e.scores[e.seat]??0,rolls:0}))).filter(r=>r.id<=through);
}
