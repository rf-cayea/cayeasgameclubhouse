import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {D6DieFace} from '../src/components/D6Dice';
import {COLLECTION_D6_DICE,D6_COLLECTIONS} from '../src/lib/d6-collections';
import {D6_DICE_SETS,D6_DICE_SLOT,equippedD6Dice} from '../src/lib/d6-dice';
import {ECONOMY_CATALOG,cashPriceFor} from '../src/lib/economy-protocol';

describe('original themed D6 collections',()=>{
 it('has eight distinct finishes per theme with permanent shared store entries',()=>{
  expect(COLLECTION_D6_DICE).toHaveLength(56);expect(new Set(D6_DICE_SETS.map(d=>d.id)).size).toBe(D6_DICE_SETS.length);
  for(const [key] of D6_COLLECTIONS){const group=COLLECTION_D6_DICE.filter(d=>d.collection===key);expect(group).toHaveLength(8);
   for(const d of group){const price=key==='rainbow'?150:250;expect(d.price).toBe(price);expect(ECONOMY_CATALOG.find(i=>i.id===d.id.replace('farkle-dice-','domino-skin-'))).toMatchObject({price:Math.ceil(price*1.25),cashPrice:Math.ceil(cashPriceFor(price)*1.25),slot:'domino_skin',currency:'domino_points'});expect(ECONOMY_CATALOG.find(i=>i.id===d.id)).toMatchObject({price:Math.ceil(price*1.25),cashPrice:Math.ceil(cashPriceFor(price)*1.25),slot:D6_DICE_SLOT,currency:'dice_points'});
    expect(equippedD6Dice({owned:[d.id],equipped:{[D6_DICE_SLOT]:d.id}}).id).toBe(d.id);
    expect(equippedD6Dice({owned:[],equipped:{[D6_DICE_SLOT]:d.id}}).id).toBe('farkle-dice-classic');
   }
  }
 });
 it.each(COLLECTION_D6_DICE)('$name renders readable, correctly counted pips for all six faces',d=>{
  for(const value of [1,2,3,4,5,6]){const svg=renderToStaticMarkup(<D6DieFace value={value} design={d}/>);
   expect(svg.match(/data-pip-value=/g)).toHaveLength(value);expect(svg).toContain(`data-finish="${d.motif}"`);expect(svg).not.toMatch(/undefined|NaN/);expect(svg).not.toContain('http');
  }
 });
});
