import { dominoMain,dominoOpenEnds,type DominoEnd,type PlacedDomino } from './dominoes';
export interface DominoLayoutTile {tile:PlacedDomino;x:number;y:number;width:number;height:number;angle:number;direction:number}
export interface DominoLayoutEnd {end:DominoEnd;x:number;y:number;pips:number}
export interface DominoLayout {tiles:DominoLayoutTile[];ends:DominoLayoutEnd[];x:number;y:number;width:number;height:number}
const vectors=[[1,0],[0,1],[-1,0],[0,-1]] as const;
const bounds=(tile:DominoLayoutTile)=>({l:tile.x-tile.width/2,r:tile.x+tile.width/2,t:tile.y-tile.height/2,b:tile.y+tile.height/2});
const overlap=(a:DominoLayoutTile,b:DominoLayoutTile)=>{const x=bounds(a),y=bounds(b);return x.l<y.r-.1&&x.r>y.l+.1&&x.t<y.b-.1&&x.b>y.t+.1;};
/** Face-to-face joints, crosswise doubles, and orthogonal turns. The first tile
 * anchors the layout; growing either end never changes its neighbor order. */
export function layoutDominoes(board:readonly PlacedDomino[],aspect=1):DominoLayout {
 if(!board.length)return {tiles:[],ends:[],x:-210,y:-140,width:420,height:280};
 const main=dominoMain(board),anchor=Math.max(0,main.findIndex(tile=>tile.placement===0)),root=main[anchor]!;
 const jobs=[...main.slice(0,anchor).reverse().map(tile=>({tile,end:'left' as DominoEnd})),...main.slice(anchor+1).map(tile=>({tile,end:'right' as DominoEnd})),...board.filter(t=>t.arm).map(tile=>({tile,end:tile.arm! as DominoEnd}))].sort((a,b)=>(a.tile.placement??0)-(b.tile.placement??0));
 const ratio=Math.max(.35,Math.min(3,aspect));
 for(let attempt=0;attempt<24;attempt++) {
  const expansion=1+attempt*.13,halfW=Math.max(290,420*Math.sqrt(ratio))*expansion,halfH=Math.max(290,420/Math.sqrt(ratio))*expansion;
  const double=root.a===root.b,tiles:DominoLayoutTile[]=[{tile:root,x:0,y:0,width:double?50:100,height:double?100:50,angle:double?90:0,direction:0}];
  type Tip={x:number;y:number;direction:number};
  const tips:Partial<Record<DominoEnd,Tip>>={left:{x:double?-25:-50,y:0,direction:2},right:{x:double?25:50,y:0,direction:0}};
  function spinnerTips(placed:DominoLayoutTile,leftward=false){if(!placed.tile.spinner)return;const normal=(placed.direction+(leftward?1:3))%4,[dx,dy]=vectors[normal]!;tips.up={x:placed.x+dx*50,y:placed.y+dy*50,direction:normal};tips.down={x:placed.x-dx*50,y:placed.y-dy*50,direction:(normal+2)%4};}
  spinnerTips(tiles[0]!);let failed=false;
  for(const job of jobs){
   const tip=tips[job.end];if(!tip){failed=true;break;}
   const cross=job.tile.a===job.tile.b,length=cross?50:100,thickness=cross?100:50;
   const clockwise=job.end==='left'||job.end==='up'?3:1;
   const choices=cross?[tip.direction]:[tip.direction,(tip.direction+clockwise)%4,(tip.direction+4-clockwise)%4];
   let placed:DominoLayoutTile|undefined;
   for(const dir of choices){const [dx,dy]=vectors[dir]!,[px,py]=vectors[tip.direction]!,straight=dir===tip.direction;
    const x=tip.x+(straight?dx*length/2:px*thickness/2+dx*(length-thickness)/2),y=tip.y+(straight?dy*length/2:py*thickness/2+dy*(length-thickness)/2);
    const candidate:DominoLayoutTile={tile:job.tile,x,y,width:dir%2?thickness:length,height:dir%2?length:thickness,angle:dir*90+(cross?90:job.end==='left'?180:0),direction:dir};
    const r=bounds(candidate);if(r.l < -halfW||r.r>halfW||r.t < -halfH||r.b>halfH||tiles.some(other=>overlap(candidate,other)))continue;
    placed=candidate;break;
   }
   if(!placed){failed=true;break;}tiles.push(placed);const [dx,dy]=vectors[placed.direction]!;tips[job.end]={x:placed.x+dx*length/2,y:placed.y+dy*length/2,direction:placed.direction};spinnerTips(placed,job.end==='left');
  }
  if(failed)continue;
  const ends=dominoOpenEnds(board).flatMap(open=>{const tip=tips[open.end];if(!tip)return [];const [dx,dy]=vectors[tip.direction]!;return [{...open,x:tip.x+dx*42,y:tip.y+dy*42}];});
  const rects=tiles.map(bounds),xs=[...rects.flatMap(r=>[r.l-18,r.r+18]),...ends.flatMap(e=>[e.x-45,e.x+45])],ys=[...rects.flatMap(r=>[r.t-18,r.b+18]),...ends.flatMap(e=>[e.y-45,e.y+45])];
  let x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y;
  if(width<420){x-=(420-width)/2;width=420;}if(height<280){y-=(280-height)/2;height=280;}
  return {tiles,ends,x,y,width,height};
 }
 throw new Error('Domino chain could not fit without overlaps.');
}
