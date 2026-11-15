import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {useLocation} from '@tanstack/react-router';
import {WINNER_EVENT,WINNER_REVEAL_MS,winnerMessage,type WinnerNotice} from '@/lib/winner-celebration';
import {playWinnerAudio,primeWinnerAudio,stopWinnerVoice,winnerSoundsOff} from '@/lib/winner-audio';
import '@/styles/winner-celebration.css';
export function WinnerCelebration(){
 const [notice,setNotice]=useState<WinnerNotice|null>(null),[revealed,setRevealed]=useState(false),[muted,setMuted]=useState(winnerSoundsOff);
 const dialog=useRef<HTMLDialogElement>(null),pending=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const pathname=useLocation({select:location=>location.pathname});
 useEffect(()=>{
  const unlock=()=>{if(!winnerSoundsOff())primeWinnerAudio();};
  const receive=(event:Event)=>{clearTimeout(pending.current);const result=(event as CustomEvent<WinnerNotice>).detail;
   // Existing result panels open first; the celebration then occupies the top layer.
   pending.current=setTimeout(()=>{setRevealed(false);setMuted(result.muted||winnerSoundsOff());setNotice(result);},850);};
  window.addEventListener(WINNER_EVENT,receive);window.addEventListener('pointerdown',unlock,{passive:true});window.addEventListener('keydown',unlock);
  return()=>{clearTimeout(pending.current);window.removeEventListener(WINNER_EVENT,receive);window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);stopWinnerVoice();};
 },[]);
 useEffect(()=>{clearTimeout(pending.current);setNotice(null);stopWinnerVoice();},[pathname]);
 useEffect(()=>{
  if(!notice)return;
  dialog.current?.showModal();
  const quiet=notice.muted||winnerSoundsOff();if(!quiet)playWinnerAudio();
  const timer=setTimeout(()=>setRevealed(true),matchMedia('(prefers-reduced-motion: reduce)').matches?300:WINNER_REVEAL_MS);
  return()=>{clearTimeout(timer);dialog.current?.close();stopWinnerVoice();};
 },[notice]);
 if(!notice)return null;
 function close(){setNotice(null);}
 function toggle(){const next=!muted;setMuted(next);try{localStorage.setItem('clubhouse-winner-muted',String(next));}catch{}if(next)stopWinnerVoice();else playWinnerAudio();}
 return <dialog ref={dialog} className="winner-celebration" aria-label="Winner celebration" onCancel={event=>{event.preventDefault();close();}}>
  <div className="winner-burst" aria-hidden="true"><i/><i/><i/>{Array.from({length:36},(_,i)=><span key={i} style={{'--x':`${(i*37)%100}%`,'--y':`${(i*23)%100}%`,'--delay':`${(i%9)*.12}s`,'--rotation':`${i*29}deg`,'--size':`${8+i%5*4}px`} as CSSProperties}>✦</span>)}</div>
  <div className="winner-content"><p className="winner-eyebrow">CAYEA’S GAME CLUBHOUSE</p>
   <svg className="winner-crown" viewBox="0 0 100 70" aria-hidden="true"><path d="M12 17 32 31 50 7 68 31 88 17 79 58H21Z"/><path d="M22 65H78M25 50H75"/><circle cx="50" cy="41" r="5"/></svg>
   <h2 className="winner-title">Winner</h2><div className="winner-name" data-revealed={revealed} role="status" aria-live="polite">{revealed&&<><p>{winnerMessage(notice.names)}</p>{notice.detail&&<small>{notice.detail}</small>}</>}</div>
   <div className="winner-actions"><button onClick={close} autoFocus className="winner-continue">Continue</button><button onClick={toggle} aria-pressed={!muted}>{muted?'Sound off':'Sound on'}</button>{!muted&&<button onClick={playWinnerAudio} aria-label="Replay Winner voice">Hear Winner</button>}</div>
  </div>
 </dialog>;
}
