import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {DominoFace,DominoBoard} from '../src/components/DominoArtwork';
import {DOMINO_SET,type DominoId,type PlacedDomino} from '../src/lib/dominoes';
import {DOMINO_INCLUDED_SKINS,DOMINO_SKINS} from '../src/lib/dominoes-skins';

describe('fixed domino printing rotates with the tile',()=>{
 it.each([...DOMINO_INCLUDED_SKINS,...DOMINO_SKINS])('$name keeps identical printed faces when laid sideways',design=>{
  for(const id of DOMINO_SET){
   const vertical=renderToStaticMarkup(<DominoFace id={id} vertical design={design}/>),horizontal=renderToStaticMarkup(<DominoFace id={id} design={design}/>);
   const print=(s:string)=>s.slice(s.indexOf('<g data-domino-print='),s.lastIndexOf('</g></svg>')).replace(/url\(#[^)]+\)/g,'url(#gradient)');
   expect(print(horizontal)).toBe(print(vertical));expect(horizontal).toContain('translate(0 52) rotate(-90)');expect(vertical).not.toContain('rotate(-90)');
  }
 });
 it('keeps the six as two columns / three rows in portrait, then turns it to three columns / two rows sideways',()=>{
  const markup=renderToStaticMarkup(<DominoFace id="0-6"/>);
  expect(markup).toContain('translate(0 52) rotate(-90)');expect(markup).toContain('translate(2 54)');
  const pipCenters=[...markup.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="4.3"/g)].map(m=>[Number(m[1]),Number(m[2])]);
  expect(new Set(pipCenters.map(([x])=>x)).size).toBe(2);expect(new Set(pipCenters.map(([,y])=>y)).size).toBe(3);
  const sideways=pipCenters.map(([x,y])=>[y,52-x]);expect(new Set(sideways.map(([x])=>x)).size).toBe(3);expect(new Set(sideways.map(([,y])=>y)).size).toBe(2);
 });
 it('flips the whole printed tile instead of repainting upright halves',()=>{
  const markup=renderToStaticMarkup(<DominoFace id="2-6" flip/>);
  expect(markup).toContain('data-first-pips="6" data-second-pips="2"');expect(markup).toContain('translate(52 104) rotate(180)');
  expect(markup.indexOf('data-domino-value="2"')).toBeLessThan(markup.indexOf('data-domino-value="6"'));
 });
 it('retains board directions and connected end values through doubles, bends and reversed tiles',()=>{
  const board:PlacedDomino[]=[{id:'6-6',a:6,b:6,seat:0,placement:0},{id:'2-6',a:6,b:2,seat:1,placement:1}];
  const markup=renderToStaticMarkup(<DominoBoard board={board}/>);expect(markup).toContain('data-double="true"');expect(markup).toContain('data-first-pips="6" data-second-pips="2"');expect(markup).toContain('data-domino-print="fixed"');
 });
});
