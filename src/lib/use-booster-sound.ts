import {useEffect,useRef,useState} from 'react';
/** Synthesized foil, opening shimmer and rarity chimes; no downloaded audio. */
export function useBoosterSound(){
 const context=useRef<AudioContext|null>(null),[muted,setMuted]=useState(()=>{try{return localStorage.getItem('clubhouse-booster-muted')==='true';}catch{return false;}}),quiet=useRef(muted);quiet.current=muted;
 useEffect(()=>()=>{void context.current?.close();context.current=null;},[]);
 function play(reveal=false,stars=1){if(quiet.current)return;try{const c=context.current??(context.current=new AudioContext());void c.resume();
  const note=(hz:number,start:number,duration:number,volume=.055)=>{const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+start;o.type=reveal?'sine':'triangle';o.frequency.setValueAtTime(hz,t);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.02);};
  if(!reveal){const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*.32),c.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);const source=c.createBufferSource(),filter=c.createBiquadFilter(),g=c.createGain();source.buffer=buffer;filter.type='highpass';filter.frequency.value=1800;g.gain.value=.12;source.connect(filter);filter.connect(g);g.connect(c.destination);source.start(c.currentTime+.48);[174,220,294,440].forEach((hz,i)=>note(hz,i*.14,.3));}
  else{[523,659,784].forEach((hz,i)=>note(hz,i*.18,.55));if(stars>=3)[1047,1319,1568,2093].slice(0,stars===4?4:2).forEach((hz,i)=>note(hz,.52+i*.1,.85,.04));}
 }catch{/* The saved pack result remains available when browser audio is unavailable. */}}
 function toggle(){setMuted(value=>{const next=!value;quiet.current=next;try{localStorage.setItem('clubhouse-booster-muted',String(next));}catch{}if(next&&context.current){void context.current.close();context.current=null;}return next;});}
 return{muted,toggle,play,stop:()=>{void context.current?.close();context.current=null;}};
}
