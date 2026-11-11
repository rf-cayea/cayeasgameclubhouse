import {describe,it,expect} from 'vitest';
import {rng} from '../src/lib/game';
import {applyDominoMove,newDominoGame,dominoBotMove,dominoOpenEnds,exposedDominoTotal,dominoOptions,dominoPips,DOMINO_SET,type DominoState,type PlacedDomino} from '../src/lib/dominoes';
import {layoutDominoes} from '../src/lib/dominoes-layout';
const players=[{id:'a',name:'A',bot:true},{id:'b',name:'B',bot:true}];
const piece=(a:number,b:number,placement:number,spinner=false):PlacedDomino=>({id:`${Math.min(a,b)}-${Math.max(a,b)}`,a,b,seat:0,placement,...(spinner?{spinner:true}:{})});
describe('physical domino table',()=>{
 it('opens every later hand with its highest dealt double, falling back to the highest tile',()=>{
  for(let seed=1;seed<=40;seed++){
   const old={...newDominoGame(players,'draw',100,rng(seed)),phase:'roundOver' as const,scores:[40,20]};
   const next=applyDominoMove(old,0,{t:'next'},rng(seed+100))!,doubles=next.hands.flat().filter(t=>{const[a,b]=dominoPips(t);return a===b;}).sort().reverse();
   if(doubles.length)expect(next.forcedOpening).toBe(doubles[0]);else expect(next.forcedOpening!.split('-').map(Number).reduce((a,b)=>a+b,0)).toBe(Math.max(...next.hands.flat().map(t=>t.split('-').map(Number).reduce((a,b)=>a+b,0))));
   expect(next.hands[next.turn]).toContain(next.forcedOpening);expect(next.scores).toEqual([40,20]);
  }
 });
 it('unlocks the spinner’s upper and lower arms only after both main sides are covered',()=>{
  const state:DominoState={...newDominoGame(players,'muggins',200,rng(1)),forcedOpening:null,turn:0,board:[piece(6,6,0,true)],hands:[['0-6','1-6','2-6'],['3-6','4-6','5-6']],stock:[]};
  expect(applyDominoMove(state,0,{t:'play',tile:'0-6',end:'up'})).toBeNull();
  const right=applyDominoMove(state,0,{t:'play',tile:'0-6',end:'right'})!;
  expect(dominoOpenEnds(right.board).map(e=>e.end)).toEqual(['left','right']);
  const both=applyDominoMove(right,1,{t:'play',tile:'3-6',end:'left'})!;
  expect(dominoOpenEnds(both.board)).toEqual([{end:'left',pips:3},{end:'right',pips:0},{end:'up',pips:6},{end:'down',pips:6}]);expect(exposedDominoTotal(both.board)).toBe(3);
  const upper=applyDominoMove(both,0,{t:'play',tile:'2-6',end:'up'})!;expect(upper.board.at(-1)).toMatchObject({id:'2-6',a:6,b:2,arm:'up'});expect(upper.scores[0]).toBe(both.scores[0]!+5);expect(exposedDominoTotal(upper.board)).toBe(5);
  const lower=applyDominoMove(upper,1,{t:'play',tile:'5-6',end:'down'})!;expect(exposedDominoTotal(lower.board)).toBe(10);expect(lower.board.at(-1)).toMatchObject({a:6,b:5,arm:'down'});
  expect(dominoOptions({...both,variant:'draw'}).some(o=>o.end==='up'||o.end==='down')).toBe(false);
  const layout=layoutDominoes(lower.board,.7),root=layout.tiles.find(t=>t.tile.spinner)!,up=layout.tiles.find(t=>t.tile.arm==='up')!,down=layout.tiles.find(t=>t.tile.arm==='down')!;
  expect(root.height).toBe(100);expect(root.width).toBe(50);expect(up.y+up.height/2).toBe(root.y-root.height/2);expect(down.y-down.height/2).toBe(root.y+root.height/2);expect(layout.ends).toHaveLength(4);
 });
 it('packs full real matches with touching tiles, crosswise doubles, bends, and no overlaps at phone/tablet aspects',()=>{
  let branches=0,bends=0;
  for(const variant of ['draw','block','muggins'] as const)for(let seed=1;seed<=8;seed++){
   const random=rng(seed);let state=newDominoGame(players,variant,100,random);
   for(let moves=0;moves<1800&&state.phase!=='finished';moves++){
    state=applyDominoMove(state,state.turn,state.phase==='roundOver'?{t:'next'}:dominoBotMove(state,state.turn,'easy',random)!,random)!;
    expect([...state.hands.flat(),...state.stock,...state.board.map(t=>t.id)].sort()).toEqual([...DOMINO_SET].sort());
    if(!state.board.length)continue;
    for(const aspect of [.7,2.2]){
     const layout=layoutDominoes(state.board,aspect);expect(layout.tiles).toHaveLength(state.board.length);
     for(let i=0;i<layout.tiles.length;i++){const a=layout.tiles[i]!;if(a.tile.arm)branches++;if(a.direction%2)bends++;
      expect(a.width*a.height).toBe(5000);
      for(const b of layout.tiles.slice(i+1)){const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);expect(dx>=(a.width+b.width)/2-.1||dy>=(a.height+b.height)/2-.1).toBe(true);}
      // Every added tile must physically touch an earlier tile along an edge.
      if(i)expect(layout.tiles.slice(0,i).some(b=>{const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);return Math.abs(dx-(a.width+b.width)/2)<.1&&dy<(a.height+b.height)/2-.1||Math.abs(dy-(a.height+b.height)/2)<.1&&dx<(a.width+b.width)/2-.1;})).toBe(true);
     }
    }
   }
   expect(state.phase).toBe('finished');
  }
  expect(branches).toBeGreaterThan(0);expect(bends).toBeGreaterThan(0);
 },30000);
});
