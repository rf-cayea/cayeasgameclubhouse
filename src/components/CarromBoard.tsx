import {useEffect,useRef,useState,useId,type PointerEvent} from 'react';
import {CARROM,CARROM_POCKETS,canPlaceStriker,carromAimGuide,nearestStrikerX,makeDisc,shotWorld,stepCarrom,strikerY,type CarromReplay,type CarromSeat,type CarromShot,type Disc} from '@/lib/carrom';
import {BoardEmblem} from './BoardEmblem';
import {CarromDisc} from './CarromDisc';
import {CLASSIC_CARROM_BOARD,CLASSIC_CARROM_PUCKS,CLASSIC_CARROM_STRIKER} from '@/lib/carrom-sets';
interface Props{turn?:CarromSeat;preview?:boolean;finished?:boolean;boardDesign?:typeof CLASSIC_CARROM_BOARD;puckDesign?:typeof CLASSIC_CARROM_PUCKS;strikerDesign?:typeof CLASSIC_CARROM_STRIKER;balls:Disc[];replay:CarromReplay|null;seat:CarromSeat;shot:CarromShot;canShoot:boolean;onShot:(shot:CarromShot)=>void;onAim:(shot:CarromShot)=>void;onAnimation:(active:boolean)=>void;onReplayComplete:(sequence:number)=>void;onSound:(kind:'shot'|'disc'|'rail'|'pocket',power?:number)=>void}
const PULL_LIMIT=175;
const PRE_SHOT_MS=180;
type Gesture={
 id:number;kind:'striker'|'aim'|'place';fromStriker:boolean;x:number;y:number;initial:CarromShot;current:CarromShot;distance:number;
};

export function CarromBoard({balls,replay,seat,turn=seat,finished=false,shot,canShoot,onShot,onAim,onAnimation,onReplayComplete,onSound,
 preview=false,boardDesign=CLASSIC_CARROM_BOARD,puckDesign=CLASSIC_CARROM_PUCKS,strikerDesign=CLASSIC_CARROM_STRIKER}:Props){
 const id=useId(),svg=useRef<SVGSVGElement>(null),[side,setSide]=useState(0);
 const [playback,setPlayback]=useState<{sequence:number;balls:Disc[]}|null>(null);
 const [completed,setCompleted]=useState(0),[dragging,setDragging]=useState(false);
 const gesture=useRef<Gesture|null>(null),callbacks=useRef({onAnimation,onReplayComplete,onSound});
 callbacks.current={onAnimation,onReplayComplete,onSound};

 useEffect(()=>{
  if(preview)return;
  const parent=svg.current?.parentElement;
  if(!parent)return;
  const measure=()=>{const rect=parent.getBoundingClientRect();setSide(Math.max(0,Math.min(rect.width,rect.height)));};
  const observer=new ResizeObserver(measure);observer.observe(parent);measure();
  return()=>observer.disconnect();
 },[preview]);

 useEffect(()=>{
  if(!replay||replay.sequence<=completed)return;
  const {sequence,seat:shooter,shot:playedShot,before}=replay;
  const world=shotWorld(before,shooter,playedShot,replay.physicsVersion??1);
  let previous=world.balls.map(b=>({...b})),start:number|undefined,frame=0;
  let collisions=0,rails=0,pockets=0,sounded=false;
  setPlayback({sequence,balls:previous});
  callbacks.current.onAnimation(true);
  function animate(now:number){
   start??=now;
   const elapsed=now-start-PRE_SHOT_MS;
   if(elapsed>=0){
    if(!sounded){callbacks.current.onSound('shot',playedShot.power);sounded=true;}
    const tick=elapsed/(CARROM.dt*1000);
    while(!world.done&&world.steps<=tick){
     previous=world.balls.map(b=>({...b}));
     stepCarrom(world);
    }
    if(world.pocketed.length>pockets)callbacks.current.onSound('pocket');
    else if(world.collisions>collisions)callbacks.current.onSound('disc',playedShot.power);
    else if(world.rails>rails)callbacks.current.onSound('rail',playedShot.power);
    collisions=world.collisions;rails=world.rails;pockets=world.pocketed.length;
    if(world.done){
     setCompleted(sequence);setPlayback(null);
     callbacks.current.onAnimation(false);callbacks.current.onReplayComplete(sequence);
     return;
    }
    const blend=tick-Math.floor(tick);
    setPlayback({sequence,balls:world.balls.map((b,index)=>{
     const from=previous[index]!;
     return {...b,x:from.x+(b.x-from.x)*blend,y:from.y+(b.y-from.y)*blend};
    })});
   }
   frame=requestAnimationFrame(animate);
  }
  frame=requestAnimationFrame(animate);
  return()=>cancelAnimationFrame(frame);
 },[replay?.sequence,completed]);

 const activeReplay=replay&&replay.sequence>completed?replay:null;
 const display=activeReplay?(playback?.sequence===activeReplay.sequence?playback.balls:
  [...activeReplay.before,makeDisc('striker','striker',activeReplay.shot.x,strikerY(activeReplay.seat))]):balls;
 const ready=canShoot&&!activeReplay,placement=canPlaceStriker(balls,shot.x,seat);
 const guide=ready&&placement?carromAimGuide(balls,seat,shot):null,base=strikerY(seat),flip=seat===1;
 const idleX=turn===seat?shot.x:nearestStrikerX(balls,500,turn);
 const idleY=strikerY(turn);

 useEffect(()=>{
  if(!ready){gesture.current=null;setDragging(false);}
 },[ready]);

 function point(e:PointerEvent<SVGSVGElement>){
  const rect=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width*1000,y=(e.clientY-rect.top)/rect.height*1000;
  return flip?{x:1000-x,y:1000-y}:{x,y};
 }
 function down(e:PointerEvent<SVGSVGElement>){
  if(!ready||gesture.current||e.button!==0)return;
  const p=point(e),radius=Math.max(40,side?19000/side:40);
  const onStriker=Math.hypot(p.x-shot.x,p.y-base)<=radius;
  if(!onStriker&&(Math.abs(p.y-base)>45||p.x<CARROM.lineMin-45||p.x>CARROM.lineMax+45))return;
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  gesture.current={id:e.pointerId,kind:onStriker?'striker':'place',fromStriker:onStriker,...p,initial:shot,current:shot,distance:0};
  if(!onStriker)move(e);
 }
 function move(e:PointerEvent<SVGSVGElement>){
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  e.preventDefault();
  const p=point(e),dx=g.x-p.x,dy=g.y-p.y,distance=Math.hypot(dx,dy);
  if(g.kind==='striker'&&distance>=12){
   g.kind=Math.abs(dy)<Math.abs(dx)*.42?'place':'aim';
   setDragging(g.kind==='aim');
  }
  if(g.kind==='place'){
   const wanted=g.fromStriker?g.initial.x-dx:p.x;
   const x=nearestStrikerX(balls,wanted,seat);
   if(x!==null){g.current={...g.initial,x};onAim(g.current);}
  }else if(g.kind==='aim'){
   g.distance=distance;
   g.current=distance>=12?{x:g.initial.x,angle:Math.atan2(dy,dx),power:Math.max(.05,Math.min(1,(distance-12)/(PULL_LIMIT-12)))}:g.initial;
   onAim(g.current);
  }
 }
 function up(e:PointerEvent<SVGSVGElement>){
  const g=gesture.current;if(!g||g.id!==e.pointerId)return;
  move(e);gesture.current=null;setDragging(false);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(g.kind==='aim'&&g.distance>=16&&ready)onShot(g.current);
  else if(g.kind==='aim')onAim(g.initial);
 }
 function cancel(e?:PointerEvent<SVGSVGElement>){
  const g=gesture.current;if(!g||(e&&e.pointerId!==g.id))return;
  gesture.current=null;setDragging(false);
  if(g.kind==='aim')onAim(g.initial);
 }
 return <svg ref={svg} className="carrom-board" style={{width:side||'100%',height:side||'100%'}} viewBox="0 0 1000 1000"
 role={preview?'img':'application'} tabIndex={preview?undefined:0}
 aria-label={preview?boardDesign.name:'Carrom board. Slide along the baseline to place the striker. Pull away from the target and release to shoot. Arrow keys move; Enter shoots; Escape cancels.'}
 data-animating={Boolean(activeReplay)} data-can-shoot={ready} onPointerDown={down} onPointerMove={move} onPointerUp={up}
 onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={e=>{
  if(e.key==='Escape'){cancel();return;}
  if(!ready||gesture.current)return;
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
   e.preventDefault();const x=nearestStrikerX(balls,shot.x+(e.key==='ArrowLeft'?-12:12)*(flip?-1:1),seat);
   if(x!==null)onAim({...shot,x});
  }
  if(e.key==='Enter'&&!e.repeat&&placement){e.preventDefault();onShot(shot);}
 }}>
 <defs><linearGradient id={`${id}wood`} x2=".9" y2="1"><stop stopColor={boardDesign.frame}/><stop offset=".3" stopColor={boardDesign.trim}/><stop offset=".56" stopColor={boardDesign.frame}/><stop offset="1" stopColor={boardDesign.trim}/></linearGradient><radialGradient id={`${id}surface`} cx=".4" cy=".35" r=".85"><stop stopColor={boardDesign.surface}/><stop offset=".65" stopColor={boardDesign.surface}/><stop offset="1" stopColor={boardDesign.shade}/></radialGradient><radialGradient id={`${id}hole`}><stop stopColor="#030705"/><stop offset=".8" stopColor="#0c1711"/><stop offset="1" stopColor="#4b331f"/></radialGradient><pattern id={`${id}grain`} width="160" height="74" patternUnits="userSpaceOnUse"><path d="M0 13Q45 1 85 12T160 10M0 55Q65 40 120 56T180 48M0 64Q70 58 160 69" stroke="#29190d" strokeOpacity=".12" strokeWidth="2" fill="none"/></pattern><marker id={`${id}arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10 3 5Z" fill="#215f53"/></marker></defs>
 <g transform={flip?'rotate(180 500 500)':undefined}>
 <rect x="9" y="12" width="982" height="982" rx="52" fill="#080f0c" opacity=".6"/><rect x="9" y="5" width="982" height="982" rx="49" fill={`url(#${id}wood)`} stroke={boardDesign.shade} strokeWidth="7"/><rect x="14" y="10" width="972" height="972" rx="46" fill={`url(#${id}grain)`}/><rect x="54" y="54" width="892" height="892" rx="27" fill={boardDesign.frame} stroke={boardDesign.shade} strokeWidth="5"/><rect x="80" y="80" width="840" height="840" rx="6" fill={`url(#${id}surface)`}/><rect x="80" y="80" width="840" height="840" rx="6" fill={`url(#${id}grain)`} opacity=".28"/>
 {[185,815].map(y=><g key={y} stroke={boardDesign.ink} fill="none"><path d={`M220 ${y-14}H780M220 ${y+14}H780`} strokeWidth="3"/><circle cx="220" cy={y} r="17" strokeWidth="3"/><circle cx="780" cy={y} r="17" strokeWidth="3"/><circle cx="220" cy={y} r="10" fill={boardDesign.ink} stroke="none"/><circle cx="780" cy={y} r="10" fill={boardDesign.ink} stroke="none"/></g>)}
 {[185,815].map(x=><g key={x} stroke={boardDesign.ink} strokeOpacity=".45" fill="none"><path d={`M${x-14} 220V780M${x+14} 220V780`} strokeWidth="2"/><circle cx={x} cy="220" r="15"/><circle cx={x} cy="780" r="15"/></g>)}
 <g fill="none" stroke={boardDesign.ink}><circle cx="500" cy="500" r="115" strokeWidth="2"/><circle cx="500" cy="500" r="107" strokeWidth="1"/>{Array.from({length:16},(_,i)=><path key={i} d="M500 402 512 447 500 434 488 447Z" transform={`rotate(${i*22.5} 500 500)`} fill={boardDesign.ink} fillOpacity=".25" strokeWidth="1"/>)}<circle cx="500" cy="500" r="27" strokeWidth="2"/>{boardDesign.motif&&<g transform="translate(500 500) scale(1.8)" style={{color:boardDesign.ink}}><BoardEmblem motif={boardDesign.motif}/></g>}</g>
 {[[250,250,0],[750,250,90],[750,750,180],[250,750,270]].map(([x,y,a])=><g key={`${x}:${y}`} transform={`translate(${x} ${y}) rotate(${a})`} stroke={boardDesign.ink} strokeWidth="3" fill="none"><path d="m-60-60 95 95-7-24M35 35 11 28"/><path d="M-8-24a28 28 0 1 0 34 32" strokeWidth="2"/></g>)}
 <text x="500" y="292" fill={boardDesign.ink} textAnchor="middle" fontSize="16" fontFamily="Georgia,serif" letterSpacing="6">CAYEA’S CLUBHOUSE</text><text x="500" y="720" fill={boardDesign.ink} textAnchor="middle" fontSize="12" letterSpacing="5">CARROM COLLECTION</text>
 {CARROM_POCKETS.map(([x,y])=><g key={`${x}:${y}`}><circle cx={x} cy={y} r="47" fill={boardDesign.shade} stroke={boardDesign.shade} strokeWidth="3"/><circle cx={x} cy={y} r={CARROM.pocketRadius} fill={`url(#${id}hole)`}/><path d={`M${x-25} ${y+9}q25 27 50 0`} stroke="#c9aa7355" fill="none" strokeWidth="2"/></g>)}
 {ready&&<rect x="212" y={base-37} width="576" height="74" rx="35" fill="#2b9b6b12" stroke="#34776388" strokeWidth="2" strokeDasharray="8 9"/>}
 {guide&&<g pointerEvents="none"><polyline points={guide.points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#fbfff0" strokeOpacity=".85" strokeWidth="5" strokeDasharray="5 12"/>{guide.points.slice(1).map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="7" fill="#2d6e5c"/>)}{guide.hit&&<circle cx={guide.points.at(-1)!.x} cy={guide.points.at(-1)!.y} r={CARROM.strikerRadius} fill="#fff3" stroke="#35755d" strokeWidth="2"/>}{guide.hit&&guide.normal&&(()=>{const b=balls.find(b=>b.id===guide.hit)!;return <line x1={b.x} y1={b.y} x2={b.x+guide.normal!.x*105} y2={b.y+guide.normal!.y*105} stroke="#a55633" strokeWidth="4" strokeDasharray="5 7"/>;})()}</g>}
 {display.filter(b=>!b.gone).map(b=><g key={b.id} data-disc={b.id} data-kind={b.kind}
 data-striker={b.kind==='striker'?true:undefined} transform={`translate(${b.x} ${b.y})`}>
  <CarromDisc kind={b.kind} radius={b.r} pucks={puckDesign} striker={strikerDesign}/>
 </g>)}
 {!preview&&!finished&&!activeReplay&&idleX!==null&&<g data-striker="true" data-striker-seat={turn}
 transform={`translate(${idleX} ${idleY})`}>
  {ready&&<circle r={dragging?43:34} fill="none" stroke={placement?'#326c59':'#bb3d3d'} strokeWidth={dragging?4:2} strokeDasharray={dragging?undefined:'4 5'}/>}
  <CarromDisc kind="striker" radius={CARROM.strikerRadius} striker={strikerDesign}/>
 </g>}
 {ready&&dragging&&<g pointerEvents="none"><line x1={shot.x} y1={base} x2={shot.x-Math.cos(shot.angle)*(12+shot.power*(PULL_LIMIT-12))} y2={base-Math.sin(shot.angle)*(12+shot.power*(PULL_LIMIT-12))} stroke="#b55c2b" strokeWidth="8" strokeLinecap="round"/><line x1={shot.x+Math.cos(shot.angle)*38} y1={base+Math.sin(shot.angle)*38} x2={shot.x+Math.cos(shot.angle)*(100+shot.power*170)} y2={base+Math.sin(shot.angle)*(100+shot.power*170)} stroke="#215f53" strokeWidth="7" markerEnd={`url(#${id}arrow)`}/></g>}
 </g></svg>;
}
