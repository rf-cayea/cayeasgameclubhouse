import {describe,it,expect} from 'vitest';
import {dominoDropEnd} from '../src/lib/dominoes-drop';
const board={left:0,top:0,width:400,height:300};
const ends=[{end:'left' as const,rect:{left:22,top:122,width:56,height:56}},{end:'right' as const,rect:{left:322,top:122,width:56,height:56}}];
describe('natural Dominoes drop targets',()=>{
 it('accepts an opening anywhere inside the board instead of requiring a precise center hit',()=>{
  const opening=[{end:'right' as const,rect:{left:130,top:105,width:140,height:90}}];
  expect(dominoDropEnd({x:50,y:40},board,opening)).toBe('right');expect(dominoDropEnd({x:370,y:260},board,opening)).toBe('right');
 });
 it('chooses the end near the visible tile half as well as its numbered marker',()=>{
  expect(dominoDropEnd({x:50,y:150},board,ends)).toBe('left');expect(dominoDropEnd({x:130,y:150},board,ends)).toBe('left');expect(dominoDropEnd({x:270,y:150},board,ends)).toBe('right');
 });
 it('keeps outside drops canceled and does not invent an end when none is available',()=>{
  expect(dominoDropEnd({x:-50,y:150},board,ends)).toBeNull();expect(dominoDropEnd({x:100,y:350},board,ends)).toBeNull();expect(dominoDropEnd({x:100,y:100},board,[])).toBeNull();expect(dominoDropEnd({x:200,y:50},undefined,ends)).toBeNull();
 });
 it('supports spinner branches and returns the intended end even if the rules will reject that tile there',()=>{
  const spinner=[...ends,{end:'up' as const,rect:{left:172,top:12,width:56,height:56}},{end:'down' as const,rect:{left:172,top:232,width:56,height:56}}];
  expect(dominoDropEnd({x:200,y:90},board,spinner)).toBe('up');expect(dominoDropEnd({x:200,y:210},board,spinner)).toBe('down');expect(dominoDropEnd({x:335,y:150},board,spinner)).toBe('right');
 });
 it('uses the latest board and marker geometry after a resize',()=>{
  const shifted=ends.map(item=>({...item,rect:{...item.rect,left:item.rect.left+500}}));
  expect(dominoDropEnd({x:630,y:150},{...board,left:500},shifted)).toBe('left');expect(dominoDropEnd({x:130,y:150},{...board,left:500},shifted)).toBeNull();
 });
});
