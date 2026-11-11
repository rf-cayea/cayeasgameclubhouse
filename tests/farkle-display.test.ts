import {describe,it,expect} from 'vitest';
import {newFarkle,applyFarkleMove,farkleActivityDuration,type FarkleState} from '../src/lib/farkle';
import {farkleKeptRows,farkleScoreHistory} from '../src/lib/farkle-display';
const players=[{id:'a',name:'One',bot:false},{id:'b',name:'Two',bot:false}];
const roll=(s:FarkleState,d:number[])=>{let i=0;return applyFarkleMove(s,s.turn,{t:'roll'},()=>(d[i++]!-.5)/6)!;};
describe('Farkle scoring rows and permanent turn record',()=>{
 it('uses consecutive rows after keeping several dice, then keeps a single die in the next row',()=>{
  let s=roll(newFarkle(players),[1,1,1,5,2,3]);s=applyFarkleMove(s,0,{t:'keep',dice:[0,1,2,3]})!;
  s=roll(s,[5,1]);s=applyFarkleMove(s,0,{t:'keep',dice:[4]})!;
  s=roll(s,[1]);s=applyFarkleMove(s,0,{t:'keep',dice:[5]})!;
  const rows=farkleKeptRows(s.activity,0);expect(rows.map(r=>r.dice)).toEqual([[1,1,1,5],[5],[1]]);expect(rows.map(r=>r.score)).toEqual([1050,50,100]);
  const kept=s.activity.filter(e=>e.kind==='keep');expect(farkleKeptRows(s.activity,0,kept[1]!.id)).toHaveLength(2);
 });
 it('clears only the hot-dice cycle and assigns a bank-and-keep row just its newly scored points',()=>{
  let s=roll(newFarkle(players),[1,2,3,4,5,6]);s=applyFarkleMove(s,0,{t:'keep',dice:[0,1,2,3,4,5]})!;
  s=roll(s,[1,5,2,3,4,2]);expect(farkleKeptRows(s.activity,0)).toEqual([]);
  s=applyFarkleMove(s,0,{t:'keep',dice:[0]})!;s=roll(s,[5,2,3,4,2]);s=applyFarkleMove(s,0,{t:'bank',dice:[1]})!;
  expect(farkleKeptRows(s.activity,0).map(r=>r.score)).toEqual([100,50]);expect(farkleScoreHistory(s)).toMatchObject([{banked:1650,total:1650,rolls:3}]);
 });
 it('records banks and zero-score Farkles, preserves earlier bank totals, and conceals future playback records',()=>{
  let s=roll(newFarkle(players),[1,1,1,2,3,4]);s=applyFarkleMove(s,0,{t:'bank',dice:[0,1,2]})!;const bank=s.actionSequence;
  s=roll(s,[2,2,3,3,4,6]);expect(farkleScoreHistory(s)).toMatchObject([{seat:0,round:1,banked:1000,lost:0,total:1000},{seat:1,round:1,banked:0,lost:0,total:0}]);expect(farkleScoreHistory(s,bank)).toHaveLength(1);
  expect(farkleKeptRows(s.activity,1)).toEqual([]);
 });
 it('persists the full score record after the short activity window has rolled over and through JSON resume',()=>{
  let s=newFarkle(players);for(let i=0;i<100;i++)s=roll(s,[2,2,3,3,4,6]);expect(s.activity).toHaveLength(80);expect(s.scoreHistory).toHaveLength(100);expect(farkleScoreHistory(JSON.parse(JSON.stringify(s)))).toHaveLength(100);
 });
 it('slows opponent rolls, keeps and banks while allowing the dice to settle before the next decision',()=>{
  let s=roll(newFarkle(players),[1,1,1,2,3,4]);const r=s.activity.at(-1)!;s=applyFarkleMove(s,0,{t:'keep',dice:[0,1,2]})!;const k=s.activity.at(-1)!;s=applyFarkleMove(s,0,{t:'bank'})!;const b=s.activity.at(-1)!;
  expect(farkleActivityDuration(r,true)).toBe(1900);expect(farkleActivityDuration(k,true)).toBe(1200);expect(farkleActivityDuration(b,true)).toBe(2000);expect(farkleActivityDuration(r,false)).toBe(850);
 });
});
