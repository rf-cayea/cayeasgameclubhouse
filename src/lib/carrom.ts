import type {Level} from './rummy';
export type CarromSeat=0|1;
export type CarromVariant='carrom'|'disc-pool';
export type DiscKind='white'|'black'|'queen'|'striker';
export interface Disc{id:string;kind:DiscKind;x:number;y:number;vx:number;vy:number;r:number;mass:number;gone?:boolean}
export interface CarromShot{x:number;angle:number;power:number}
export interface CarromPlayer{id:string;name:string;bot:boolean;level?:Level}
export interface CarromReplay{sequence:number;seat:CarromSeat;shot:CarromShot;before:Disc[];duration:number;physicsVersion?:2;pocketed:string[]}
export interface CarromState{variant:CarromVariant;players:CarromPlayer[];balls:Disc[];turn:CarromSeat;potted:[string[],string[]];queenOwner:CarromSeat|null;pendingQueen:CarromSeat|null;winner:CarromSeat|null;phase:'aiming'|'finished';sequence:number;lastShot:CarromReplay|null;log:string[]}
export const CARROM={min:80,max:920,puckRadius:18,strikerRadius:25,pocketRadius:43,captureRadius:38,base0:815,base1:185,lineMin:220,lineMax:780,maxSpeed:1900,dt:1/240,friction:180,drag:.25,wallRestitution:.82,discRestitution:.94,maxSteps:2400}as const;
export const CARROM_POCKETS=[[80,80],[920,80],[80,920],[920,920]]as const;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const cloneBalls=(balls:readonly Disc[])=>balls.map(b=>({...b}));
export const strikerY=(seat:CarromSeat)=>seat===0?CARROM.base0:CARROM.base1;
export const colorFor=(seat:CarromSeat)=>seat===0?'white':'black';
export function makeDisc(id:string,kind:DiscKind,x:number,y:number):Disc{return{id,kind,x,y,vx:0,vy:0,r:kind==='striker'?CARROM.strikerRadius:CARROM.puckRadius,mass:kind==='striker'?1.65:1};}
export function newCarrom(players:CarromPlayer[],variant:CarromVariant='carrom'):CarromState{
 const balls:Disc[]=[],positions:{x:number;y:number;angle:number;ring:number}[]=[];let white=0,black=0;
 for(let q=-2;q<=2;q++)for(let r=-2;r<=2;r++){const ring=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r));if(!ring||ring>2)continue;const x=(q+r/2)*37.4,y=r*Math.sqrt(3)/2*37.4;positions.push({x,y,angle:Math.atan2(y,x),ring});}
 positions.sort((a,b)=>a.ring-b.ring||a.angle-b.angle).forEach((p,i)=>{const kind=i%2?'black':'white',n=kind==='white'?++white:++black;balls.push(makeDisc(`${kind}-${n}`,kind,500+p.x,500+p.y));});
 if(variant==='carrom')balls.push(makeDisc('queen','queen',500,500));
 return{variant,players:players.map(p=>({...p})),balls,turn:0,potted:[[],[]],queenOwner:null,pendingQueen:null,winner:null,phase:'aiming',sequence:0,lastShot:null,log:[variant==='carrom'?'White breaks. Cover the red queen with your own color.':'White breaks. Pocket your nine discs to win.']};
}
export function parseCarromShot(value:unknown):CarromShot|null{if(!value||typeof value!=='object'||Array.isArray(value))return null;const v=value as Record<string,unknown>;if(Object.keys(v).length!==3||!['x','angle','power'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))||Number(v.x)<CARROM.lineMin||Number(v.x)>CARROM.lineMax||Number(v.angle)<-Math.PI||Number(v.angle)>Math.PI||Number(v.power)<.05||Number(v.power)>1)return null;return{x:Number(v.x),angle:Number(v.angle),power:Number(v.power)};}
export function canPlaceStriker(balls:readonly Disc[],x:number,seat:CarromSeat){return Number.isFinite(x)&&x>=CARROM.lineMin&&x<=CARROM.lineMax&&balls.every(b=>b.gone||b.kind==='striker'||Math.hypot(b.x-x,b.y-strikerY(seat))>=b.r+CARROM.strikerRadius+1);}
export function nearestStrikerX(balls:readonly Disc[],wanted:number,seat:CarromSeat):number|null{wanted=clamp(wanted,CARROM.lineMin,CARROM.lineMax);for(let distance=0;distance<=560;distance+=2)for(const sign of[1,-1]){const x=clamp(wanted+sign*distance,CARROM.lineMin,CARROM.lineMax);if(canPlaceStriker(balls,x,seat))return x;}return null;}
export interface PhysicsWorld{balls:Disc[];pocketed:string[];steps:number;done:boolean;collisions:number;rails:number;physicsVersion:1|2}
export function shotWorld(before:readonly Disc[],seat:CarromSeat,shot:CarromShot,physicsVersion:1|2=2):PhysicsWorld{const balls=cloneBalls(before).filter(b=>b.kind!=='striker'&&!b.gone),striker=makeDisc('striker','striker',shot.x,strikerY(seat));striker.vx=Math.cos(shot.angle)*CARROM.maxSpeed*shot.power;striker.vy=Math.sin(shot.angle)*CARROM.maxSpeed*shot.power;balls.push(striker);return{balls,pocketed:[],steps:0,done:false,collisions:0,rails:0,physicsVersion};}
/** Mass-weighted impulse along the contact normal. Tangential velocity is
 * preserved, and positional correction is separate from the energy response. */
export function collideDiscs(a:Disc,b:Disc,restitution:number=CARROM.discRestitution){if(a.gone||b.gone)return false;let dx=b.x-a.x,dy=b.y-a.y;const radius=a.r+b.r,d2=dx*dx+dy*dy;if(d2>radius*radius)return false;let distance=Math.sqrt(d2);if(distance<1e-9){dx=1;dy=0;distance=1;}const nx=dx/distance,ny=dy/distance,inverse=1/a.mass+1/b.mass,overlap=Math.max(0,radius-(d2<1e-18?0:distance));if(overlap>0){const amount=(overlap+.001)/inverse*.85;a.x-=amount*nx/a.mass;a.y-=amount*ny/a.mass;b.x+=amount*nx/b.mass;b.y+=amount*ny/b.mass;}const relative=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(relative>=0)return false;const impulse=-(1+restitution)*relative/inverse;a.vx-=impulse*nx/a.mass;a.vy-=impulse*ny/a.mass;b.vx+=impulse*nx/b.mass;b.vy+=impulse*ny/b.mass;return true;}
function pocket(world:PhysicsWorld,b:Disc){if(b.gone)return true;if(CARROM_POCKETS.some(([x,y])=>(b.x-x)**2+(b.y-y)**2<CARROM.captureRadius**2)){b.gone=true;b.vx=0;b.vy=0;world.pocketed.push(b.id);return true;}return false;}
/** Fixed 240 Hz substeps keep the fastest disc movement smaller than a radius;
 * broad-phase squared-distance rejection avoids tunnelling at maximum power. */
export function stepCarrom(world:PhysicsWorld){if(world.done)return;const dt=CARROM.dt;world.steps++;
 for(const b of world.balls){if(b.gone)continue;b.x+=b.vx*dt;b.y+=b.vy*dt;if(pocket(world,b))continue;}
 const settleRails=(b:Disc)=>{
  if(b.gone||pocket(world,b))return;
  const low=CARROM.min+b.r,high=CARROM.max-b.r;
  if(b.x<low){b.x=low;if(b.vx<0){b.vx=-b.vx*CARROM.wallRestitution;world.rails++;}}else if(b.x>high){b.x=high;if(b.vx>0){b.vx=-b.vx*CARROM.wallRestitution;world.rails++;}}
  if(b.y<low){b.y=low;if(b.vy<0){b.vy=-b.vy*CARROM.wallRestitution;world.rails++;}}else if(b.y>high){b.y=high;if(b.vy>0){b.vy=-b.vy*CARROM.wallRestitution;world.rails++;}}
 };
 // Resolve cushions alongside disc contacts so a puck pressed against a rail
 // cannot absorb another impact from a position outside the playing surface.
 const modern=world.physicsVersion===2;
 if(modern)for(const b of world.balls)settleRails(b);
 for(let pass=0;pass<(modern?4:2);pass++){
  const balls=world.balls;
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
   const a=balls[i]!,b=balls[j]!;
   if(collideDiscs(a,b)){
    world.collisions++;
   }
  }
  if(modern)for(const b of balls)settleRails(b);
 }
 let moving=false;
 for(const b of world.balls){
  if(!modern)settleRails(b);
  if(b.gone)continue;
  const speed=Math.hypot(b.vx,b.vy),next=Math.max(0,speed-(CARROM.friction+CARROM.drag*speed)*dt);if(next<2.5){b.vx=0;b.vy=0;}else{b.vx*=next/speed;b.vy*=next/speed;moving=true;}
 }
 if(!moving||world.steps>=CARROM.maxSteps){world.done=true;for(const b of world.balls){b.vx=0;b.vy=0;}}
}
export function simulateCarrom(before:readonly Disc[],seat:CarromSeat,shot:CarromShot){const world=shotWorld(before,seat,shot);while(!world.done)stepCarrom(world);return world;}
export function returnDisc(balls:Disc[],id:string,kind:DiscKind){for(let ring=0;ring<15;ring++){const n=ring?Math.ceil(ring*7):1;for(let i=0;i<n;i++){const angle=i/n*Math.PI*2,x=500+ring*39*Math.cos(angle),y=500+ring*39*Math.sin(angle);if(x<110||x>890||y<110||y>890)continue;if(balls.every(b=>Math.hypot(b.x-x,b.y-y)>=b.r+CARROM.puckRadius+1)){balls.push(makeDisc(id,kind,x,y));return;}}}throw new Error('No legal return position on the carrom board.');}
export function resolveCarromShot(previous:CarromState,seat:CarromSeat,shot:CarromShot,world:PhysicsWorld):CarromState{
 const s:CarromState={...previous,balls:cloneBalls(world.balls).filter(b=>!b.gone&&b.kind!=='striker'),potted:[previous.potted[0].slice(),previous.potted[1].slice()],log:previous.log.slice(),players:previous.players.map(p=>({...p}))},other=(1-seat)as CarromSeat,own=colorFor(seat),enemy=colorFor(other),ownIDs=world.pocketed.filter(id=>id.startsWith(own+'-')),enemyIDs=world.pocketed.filter(id=>id.startsWith(enemy+'-')),queen=world.pocketed.includes('queen'),foul=world.pocketed.includes('striker');
 s.sequence++;s.lastShot={sequence:s.sequence,seat,shot:{...shot},before:cloneBalls(previous.balls),duration:world.steps*CARROM.dt,...(world.physicsVersion===2?{physicsVersion:2 as const}:{}),pocketed:world.pocketed.slice()};
 s.potted[other].push(...enemyIDs);let keep=ownIDs.length>0&&!enemyIDs.length&&!foul,summary=`${s.players[seat]!.name}: ${ownIDs.length?`${ownIDs.length} ${own}`:'no own discs'}${enemyIDs.length?`, ${enemyIDs.length} opponent discs`:''}`;
 if(foul){for(const id of ownIDs)returnDisc(s.balls,id,own);const owed=s.potted[seat].pop();if(owed)returnDisc(s.balls,owed,own);summary+=' · striker foul, turn lost'+(owed?', one disc returned':'');}
 else s.potted[seat].push(...ownIDs);
 if(s.variant==='carrom'){
  if(previous.pendingQueen===seat){s.pendingQueen=null;if(ownIDs.length&&!foul){s.queenOwner=seat;summary+=' · queen covered';}else{returnDisc(s.balls,'queen','queen');summary+=' · cover missed, queen returned';}}
  if(queen){if(foul||!ownIDs.length&&enemyIDs.length){returnDisc(s.balls,'queen','queen');summary+=' · queen returned';}else if(ownIDs.length){s.queenOwner=seat;s.pendingQueen=null;summary+=' · queen covered';}else{s.pendingQueen=seat;keep=true;summary+=' · cover the queen on your next shot';}}
  // The queen must be covered before either color can finish its last disc.
  if(s.queenOwner===null)for(const p of[seat,other])if(s.potted[p].length===9){const last=s.potted[p].pop()!;returnDisc(s.balls,last,colorFor(p));if(p===seat)keep=false;summary+=' · last disc returned: cover the queen first';}
 }
 if(foul)keep=false;
 if(s.potted[seat].length===9){s.winner=seat;s.phase='finished';}else if(s.potted[other].length===9){s.winner=other;s.phase='finished';}
 s.turn=keep?seat:other;s.log.push(summary+(s.phase==='finished'?` · ${s.players[s.winner!]!.name} wins!`:keep?' · shoot again':' · turn over'));s.log=s.log.slice(-40);return s;
}
export function applyCarromShot(s:CarromState,seat:CarromSeat,value:unknown):CarromState|null{const shot=parseCarromShot(value);if(s.phase!=='aiming'||s.turn!==seat||!shot||!canPlaceStriker(s.balls,shot.x,seat))return null;return resolveCarromShot(s,seat,shot,simulateCarrom(s.balls,seat,shot));}
export interface AimGuide{points:{x:number;y:number}[];hit:string|null;normal:{x:number;y:number}|null}
/** Ray-circle intersection for the striker, followed by cushion reflections. */
export function carromAimGuide(balls:readonly Disc[],seat:CarromSeat,shot:CarromShot,bounces=2):AimGuide{let x:number=shot.x,y:number=strikerY(seat),dx=Math.cos(shot.angle),dy=Math.sin(shot.angle);const points=[{x,y}],low=CARROM.min+CARROM.strikerRadius,high=CARROM.max-CARROM.strikerRadius;for(let bounce=0;bounce<=bounces;bounce++){const tx=dx>1e-9?(high-x)/dx:dx<-1e-9?(low-x)/dx:Infinity,ty=dy>1e-9?(high-y)/dy:dy<-1e-9?(low-y)/dy:Infinity;let distance=Math.min(tx,ty),hit:Disc|null=null;for(const b of balls){if(b.gone||b.kind==='striker')continue;const ox=x-b.x,oy=y-b.y,dot=ox*dx+oy*dy,disc=dot*dot-(ox*ox+oy*oy-(b.r+CARROM.strikerRadius)**2);if(disc<0)continue;const t=-dot-Math.sqrt(disc);if(t>.01&&t<distance){distance=t;hit=b;}}if(!Number.isFinite(distance)||distance<-.1)break;x+=dx*distance;y+=dy*distance;points.push({x,y});if(hit){const n=Math.hypot(hit.x-x,hit.y-y);return{points,hit:hit.id,normal:{x:(hit.x-x)/n,y:(hit.y-y)/n}};}if(Math.abs(tx-ty)<1e-6){dx=-dx;dy=-dy;}else if(tx<ty)dx=-dx;else dy=-dy;x+=dx*.001;y+=dy*.001;}return{points,hit:null,normal:null};}
export function carromBotShot(s:CarromState,seat:CarromSeat,level:Level='normal'):CarromShot{
 const targets=s.balls.filter(b=>b.kind===colorFor(seat)||s.variant==='carrom'&&b.kind==='queen'&&s.pendingQueen===null),candidates:{shot:CarromShot;quality:number}[]=[];
 for(const ball of targets)for(const [px,py]of CARROM_POCKETS){const pd=Math.hypot(px-ball.x,py-ball.y),nx=(px-ball.x)/pd,ny=(py-ball.y)/pd,gx=ball.x-nx*(ball.r+CARROM.strikerRadius+.2),gy=ball.y-ny*(ball.r+CARROM.strikerRadius+.2);
  for(const wanted of[235,360,500,640,765]){const x=nearestStrikerX(s.balls,wanted,seat);if(x===null)continue;const startY=strikerY(seat),length=Math.hypot(gx-x,gy-startY),angle=Math.atan2(gy-startY,gx-x),alignment=Math.cos(angle)*nx+Math.sin(angle)*ny;if(alignment<.25)continue;const shot={x,angle,power:clamp(.17+.00038*(length+pd)/Math.max(.5,alignment),.22,.95)},guide=carromAimGuide(s.balls,seat,shot,0);if(guide.hit!==ball.id)continue;const blocked=s.balls.some(b=>{if(b.id===ball.id)return false;const t=((b.x-ball.x)*nx+(b.y-ball.y)*ny);return t>ball.r&&t<pd&&Math.abs((b.x-ball.x)*ny-(b.y-ball.y)*nx)<b.r+ball.r;});candidates.push({shot,quality:alignment*500-length*.1-pd*.15-(blocked?350:0)+(s.pendingQueen===seat&&ball.kind===colorFor(seat)?200:0)+(ball.kind==='queen'&&s.potted[seat].length>=7?550:0)});
  }
 }
 // Difficulties evaluate a bounded number of real physical outcomes. Bank
 // candidates use mirrored targets, then the identical simulation checks them.
 if(level==='hard')for(const ball of targets)for(const wall of[105,895]){const x=nearestStrikerX(s.balls,500,seat);if(x===null)continue;const mirroredX=2*wall-ball.x,angle=Math.atan2(ball.y-strikerY(seat),mirroredX-x);candidates.push({shot:{x,angle,power:.7},quality:-150});}
 candidates.sort((a,b)=>b.quality-a.quality);
 const x=nearestStrikerX(s.balls,500,seat)??CARROM.lineMin,nearest=targets.slice().sort((a,b)=>Math.hypot(a.x-x,a.y-strikerY(seat))-Math.hypot(b.x-x,b.y-strikerY(seat)))[0];
 const fallback={x,angle:nearest?Math.atan2(nearest.y-strikerY(seat),nearest.x-x):seat===0?-Math.PI/2:Math.PI/2,power:s.sequence===0?.94:.64};
 const count=level==='easy'?5:level==='normal'?10:20,choices=[fallback,...candidates.slice(0,count).map(c=>c.shot)];let best=fallback,score=-Infinity;
 for(const shot of choices){const world=simulateCarrom(s.balls,seat,shot),next=resolveCarromShot(s,seat,shot,world);const ours=next.potted[seat].length-s.potted[seat].length,theirs=next.potted[1-seat as CarromSeat].length-s.potted[1-seat as CarromSeat].length;const potential=next.balls.filter(b=>b.kind===colorFor(seat)).reduce((sum,b)=>sum+Math.max(0,250-Math.min(...CARROM_POCKETS.map(([px,py])=>Math.hypot(px-b.x,py-b.y))))*.1,0);const value=ours*1000-theirs*850+(next.winner===seat?100000:next.winner!==null?-100000:0)+(next.queenOwner===seat&&s.queenOwner===null?700:0)+(next.pendingQueen===seat?180:0)-(world.pocketed.includes('striker')?1500:0)+potential+(world.collisions?20:0);if(value>score){score=value;best=shot;}}
 if(level==='easy'&&s.sequence>0&&s.sequence<25&&s.potted[seat].length<7){best={...best,angle:clamp(best.angle+Math.sin(s.sequence*7.13)*.014,-Math.PI,Math.PI),power:clamp(best.power*.98,.05,1)};}
 return best;
}
