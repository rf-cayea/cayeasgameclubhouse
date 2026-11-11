import {it,expect} from 'vitest';
import {matchesMatchPreferences,type MatchListing} from '../src/lib/matchmaking';
const table:MatchListing={code:'ABCD1234',host:'Player',mode:'Classic Rummy',variant:'classic',seats:2,occupied:1,ready:1,details:'Standard deck',mine:false,locked:false,requirement:null,createdAt:0,jokers:false,target:100};
it('matches requested player count, Joker Mode and target instead of only the mode name',()=>{
 expect(matchesMatchPreferences(table,{variant:'classic',seats:2,jokers:false})).toBe(true);
 expect(matchesMatchPreferences({...table,jokers:true},{variant:'classic',seats:2,jokers:false})).toBe(false);
 expect(matchesMatchPreferences({...table,seats:4},{variant:'classic',seats:2})).toBe(false);
 expect(matchesMatchPreferences({...table,variant:'draw',target:150},{variant:'draw',target:100})).toBe(false);
 expect(matchesMatchPreferences({...table,variant:'solo',target:500},{variant:'solo',target:500})).toBe(true);
});
