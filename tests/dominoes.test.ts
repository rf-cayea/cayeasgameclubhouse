import { describe,expect,it } from 'vitest';
import { rng } from '../src/lib/game';
import { DOMINO_SET,applyDominoMove,canDrawDomino,canPassDomino,dominoBotMove,dominoOptions,dominoPips,exposedDominoTotal,newDominoGame,dominoMain,dominoOpenEnds,parseDominoMove,type DominoId,type DominoState,type PlacedDomino } from '../src/lib/dominoes';
const players=[{id:'a',name:'Alice',bot:true,level:'normal' as const},{id:'b',name:'Bob',bot:true,level:'normal' as const}];
const tile=(a:number,b:number):PlacedDomino=>({id:`${Math.min(a,b)}-${Math.max(a,b)}`,a,b,seat:0});
function position(variant:'draw'|'block'|'muggins'='draw'):DominoState{return{...newDominoGame(players,variant,100,()=>.5),turn:0,starter:0,forcedOpening:null,board:[tile(2,4)],hands:[['1-2','3-4'],['5-6']],stock:[],scores:[0,0]};}
describe('double-six Dominoes rules',()=>{
 it('deals 28 distinct physical tiles and forces the highest dealt double to open',()=>{
  expect(DOMINO_SET).toHaveLength(28);expect(new Set(DOMINO_SET).size).toBe(28);
  for(let seed=1;seed<=30;seed++){
   const state=newDominoGame(players,'draw',100,rng(seed));expect(state.hands.map(h=>h.length)).toEqual([7,7]);expect(state.stock).toHaveLength(14);
   const all=[...state.hands.flat(),...state.stock];expect([...all].sort()).toEqual([...DOMINO_SET].sort());
   const doubles=state.hands.flat().filter(id=>{const[a,b]=dominoPips(id);return a===b;}).sort().reverse();if(doubles.length)expect(state.forcedOpening).toBe(doubles[0]);
   expect(dominoOptions(state)).toEqual([expect.objectContaining({tile:state.forcedOpening,end:'right'})]);
  }
 });
 it('orients either end correctly and rejects unowned, incompatible, out-of-turn and injected plays',()=>{
  const state=position(),left=applyDominoMove(state,0,{t:'play',tile:'1-2',end:'left'})!;
  expect(left.board.map(t=>[t.a,t.b])).toEqual([[1,2],[2,4]]);expect(left.turn).toBe(1);expect(state.hands[0]).toHaveLength(2);
  const right=applyDominoMove(state,0,{t:'play',tile:'3-4',end:'right'})!;expect(right.board.at(-1)).toMatchObject({a:4,b:3});
  expect(applyDominoMove(state,1,{t:'play',tile:'5-6',end:'right'})).toBeNull();
  expect(applyDominoMove(state,0,{t:'play',tile:'5-6',end:'left'})).toBeNull();
  for(const bad of [null,{t:'play',tile:'6-2',end:'left'},{t:'draw',tiles:['6-6']},{t:'play',tile:'1-2',end:'left',points:99},{t:'play',tile:'1-2',end:'middle'}])expect(parseDominoMove(bad)).toBeNull();
 });
 it('draws only while blocked, stops at the first playable tile, and keeps drawn identities out of public activity',()=>{
  const state={...position(),hands:[['5-6'],['0-0']] as DominoId[][],stock:['2-3','4-6','1-1'] as DominoId[]};
  expect(canPassDomino(state)).toBe(false);expect(canDrawDomino(state)).toBe(true);
  const next=applyDominoMove(state,0,{t:'draw'})!;expect(next.hands[0]).toEqual(['5-6','1-1','4-6']);expect(next.stock).toEqual(['2-3']);expect(next.turn).toBe(0);
  expect(next.activity.at(-1)).toMatchObject({kind:'draw',count:2});expect(next.activity.at(-1)?.tile).toBeUndefined();
  expect(applyDominoMove(next,0,{t:'draw'})).toBeNull();expect(applyDominoMove(next,0,{t:'pass'})).toBeNull();
 });
 it('never draws in Block and resolves blocked ties or pip differences fairly',()=>{
  let state={...position('block'),hands:[['1-1'],['5-6']] as DominoId[][],stock:['2-2'] as DominoId[]};
  expect(canDrawDomino(state)).toBe(false);expect(canPassDomino(state)).toBe(true);expect(applyDominoMove(state,0,{t:'draw'})).toBeNull();
  state=applyDominoMove(state,0,{t:'pass'})!;state=applyDominoMove(state,1,{t:'pass'})!;expect(state.result).toMatchObject({reason:'blocked',winner:0,awards:[9,0]});
  const tied={...position('block'),hands:[['1-1'],['0-2']] as DominoId[][],board:[tile(3,4)],passes:1,turn:1};
  expect(applyDominoMove(tied,1,{t:'pass'})!.result).toMatchObject({winner:null,awards:[0,0]});
 });
 it('scores All Fives with double ends counted twice, and never scores a non-multiple',()=>{
  expect(exposedDominoTotal([tile(5,5)])).toBe(10);expect(exposedDominoTotal([tile(2,3)])).toBe(5);
  expect(exposedDominoTotal([tile(5,5),tile(5,3)])).toBe(13);expect(exposedDominoTotal([tile(2,5),tile(5,5)])).toBe(12);
  const state={...position('muggins'),board:[tile(5,5)],hands:[['0-5','1-5'],['3-3']] as DominoId[][]};
  expect(dominoOptions(state).find(o=>o.tile==='0-5'&&o.end==='right')?.points).toBe(10);
  expect(dominoOptions(state).find(o=>o.tile==='1-5'&&o.end==='right')?.points).toBe(0);
  const target=applyDominoMove({...state,scores:[90,40]},0,{t:'play',tile:'0-5',end:'right'})!;expect(target).toMatchObject({phase:'finished',winner:0,scores:[100,40]});
 });
 it('scores a domino-out, rounds Muggins hand bonuses, and redeals without resetting match scores',()=>{
  const state={...position(),hands:[['1-2'],['5-6']] as DominoId[][]};
  const out=applyDominoMove(state,0,{t:'play',tile:'1-2',end:'left'})!;expect(out.result).toMatchObject({winner:0,awards:[11,0],reason:'out'});
  const next=applyDominoMove(out,0,{t:'next'},rng(9))!;expect(next.scores).toEqual([11,0]);expect(next.round).toBe(2);expect(next.board).toEqual([]);expect(next.forcedOpening).not.toBeNull();expect(next.hands[next.turn]).toContain(next.forcedOpening);
  const muggins=applyDominoMove({...state,variant:'muggins'},0,{t:'play',tile:'1-2',end:'left'})!;expect(muggins.result?.awards).toEqual([10,0]);
 });
 it('keeps hard decisions independent of the opponent’s hidden tiles',()=>{
  const state=position('muggins');expect(dominoBotMove(state,0,'hard')).toEqual(dominoBotMove({...state,hands:[state.hands[0]!,['0-0','6-6']]},0,'hard'));
 });
 it('completes full matches at all three difficulties and variants without losing or duplicating tiles',()=>{
  for(const variant of ['draw','block','muggins'] as const)for(const level of ['easy','normal','hard'] as const)for(const seed of [1,5,23]){
   const random=rng(seed);let state=newDominoGame(players.map(p=>({...p,level})),variant,100,random),moves=0;
   while(state.phase!=='finished'&&moves<2500){
    const move=state.phase==='roundOver'?{t:'next' as const}:dominoBotMove(state,state.turn,level,random);expect(move).not.toBeNull();
    const next=applyDominoMove(state,state.turn,move!,random);expect(next).not.toBeNull();state=next!;moves++;
    const all=[...state.hands.flat(),...state.stock,...state.board.map(t=>t.id)];expect([...all].sort()).toEqual([...DOMINO_SET].sort());
    const main=dominoMain(state.board);main.slice(1).forEach((t,i)=>expect(main[i]!.b).toBe(t.a));for(const end of ['up','down'] as const){const arm=state.board.filter(t=>t.arm===end),spinner=main.find(t=>t.spinner);if(arm.length){expect(arm[0]!.a).toBe(spinner!.a);arm.slice(1).forEach((t,i)=>expect(arm[i]!.b).toBe(t.a));}}
   }
   expect(state.phase).toBe('finished');expect(state.scores[state.winner!]).toBeGreaterThanOrEqual(100);
  }
 },30000);
});
