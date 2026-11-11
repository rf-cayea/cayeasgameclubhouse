import {useEffect,useState} from 'react';
import {computerFrame,type ComputerPlayback} from './computer-turns';
export function useComputerTurns<View>(latest:(View & {playback?:ComputerPlayback<View>})|null) {
 const [now,setNow]=useState(Date.now);
 // A fresh server update must use the current clock rather than an old render's time.
 const time=Math.max(now,Date.now()),frame=latest?computerFrame(latest,time):{room:null,pacing:false,nextIn:0};
 useEffect(()=>{
  if(!frame.pacing)return;
  const timer=setTimeout(()=>setNow(Date.now()),Math.max(10,frame.nextIn+5));
  const wake=()=>setNow(Date.now());window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);};
 },[latest,frame.pacing,frame.nextIn]);
 return {room:frame.room,pacing:frame.pacing};
}
