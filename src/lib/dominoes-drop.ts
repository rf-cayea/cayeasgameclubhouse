import type {DominoEnd} from './dominoes';
export interface DominoDropRect {left:number;top:number;width:number;height:number}
export interface DominoDropPoint {x:number;y:number}
const inside=(p:DominoDropPoint,r:DominoDropRect)=>p.x>=r.left&&p.x<=r.left+r.width&&p.y>=r.top&&p.y<=r.top+r.height;
/** End markers remain precise; the board also accepts natural drops on a tile
 * or beside the chain. Never turn an outside-table drop into a move. Legality
 * is checked after choosing the intended end, so a wrong end stays rejected. */
export function dominoDropEnd(point:DominoDropPoint,board:DominoDropRect|undefined,ends:{end:DominoEnd;rect:DominoDropRect}[]):DominoEnd|null {
 const hits=ends.filter(item=>inside(point,item.rect));
 if(!hits.length&&(!board||!inside(point,board)))return null;
 const choices=hits.length?hits:ends;
 return [...choices].sort((a,b)=>{
  const distance=(r:DominoDropRect)=>Math.hypot(point.x-r.left-r.width/2,point.y-r.top-r.height/2);
  return distance(a.rect)-distance(b.rect);
 })[0]?.end??null;
}
