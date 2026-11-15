import {useEffect,useRef} from 'react';
export interface WinnerNotice {game:string;scope:string;names:string[];muted:boolean;detail?:string}
export const WINNER_EVENT='clubhouse-winner';
export const WINNER_REVEAL_MS=1700;
const remembered=new Set<string>();
function firstCelebration(key:string){
 if(remembered.has(key))return false;
 try{const seen=JSON.parse(sessionStorage.getItem('clubhouse-winner-history')??'[]') as string[];if(seen.includes(key))return false;sessionStorage.setItem('clubhouse-winner-history',JSON.stringify([...seen,key].slice(-80)));}catch{/* In-memory deduplication also works when storage is blocked. */}
 remembered.add(key);return true;
}
export function winnerMessage(names:readonly string[]){return `${names.join(' & ')} ${names.length===1&&names[0]?.toLowerCase()!=='you'?'wins':'win'}!`;}
/** Arms only while a match is in progress. Loading an old result never replays it. */
export function useWinnerCelebration({game,scope,finished,names,ready=true,muted=false,persist=true,detail}:{game:string;scope?:string|null;finished:boolean;names:string[];ready?:boolean;muted?:boolean;persist?:boolean;detail?:string}){
 const armed=useRef<string|null>(null);
 const label=names.filter(Boolean).join('\u0000');
 useEffect(()=>{
  if(!scope){armed.current=null;return;}
  if(!finished){armed.current=scope;return;}
  if(!ready||!label||armed.current!==scope)return;
  armed.current=null;
  if(persist&&!firstCelebration(`${game}:${scope}`))return;
  window.dispatchEvent(new CustomEvent<WinnerNotice>(WINNER_EVENT,{detail:{game,scope,names:label.split('\u0000'),muted,detail}}));
 },[game,scope,finished,ready,label,muted,persist,detail]);
}
