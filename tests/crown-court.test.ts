import { describe, expect, it } from 'vitest';
import { applyCrownCourtMove, CROWN_COURT_CATEGORIES, courtCategories, courtRank, COURT_LENGTHS, crownCourtBotMove, crownCourtScoreOptions, crownCourtTotals, newCrownCourt, parseCrownCourtMove, scoreCrownCourt, type CourtLength, type CrownCourtCategory } from '../src/lib/crown-court';
import { crownCourtPresentationCards, crownCourtActivityText } from '../src/lib/crown-court-activity';
const people = [{ id:'one', name:'One', bot:false }, { id:'two', name:'Two', bot:false }];
const fixtures: [CrownCourtCategory, number[], number][] = [
 ['one-pair',[6,6,1,2,3],16],['two-pair',[6,6,5,5,1],29],['three-kind',[6,6,6,1,2],34],['straight',[1,2,3,4,5],40],['straight',[2,3,4,5,6],45],['full-house',[5,5,5,6,6],60],['four-kind',[6,6,6,6,1],77],['five-kind',[6,6,6,6,6],103],
 ['nines',[1,1,1,4,6],3],['tens',[2,2,2,4,6],6],['jacks',[3,3,3,4,6],9],['queens',[4,4,4,4,6],16],['kings',[5,5,5,4,6],15],['aces',[6,6,6,4,6],24],['free-roll',[1,2,3,4,6],16],
 ['five-different',[1,2,3,5,6],30],['low-run',[1,2,3,4,5],45],['royal-run',[2,3,4,5,6],55],['council-four',[3,4,5,6,6],40],['high-court',[4,4,5,6,6],30],['twin-crowns',[5,5,6,6,1],55],['court-majority',[4,4,4,1,2],40],['court-majority',[6,6,6,1,2],40],
];
describe('Cayea’s original Crown & Court scorecard', () => {
 it.each(fixtures)('%s follows its printed scoring rule (%j → %i)', (category,dice,score) => expect(scoreCrownCourt(dice,category)).toBe(score));
 it('covers all twenty-one categories, with poker ranks rather than numeric pip labels', () => {
  expect(new Set(fixtures.map(f=>f[0])).size).toBe(21);expect([1,2,3,4,5,6].map(courtRank)).toEqual(['9','10','J','Q','K','A']);
  expect(CROWN_COURT_CATEGORIES).toHaveLength(21);
 });
 it.each([
  ['one-pair',[6,6,6,1,2]],['one-pair',[6,6,1,1,2]],['one-pair',[6,6,6,6,1]],['three-kind',[6,6,6,1,1]],['three-kind',[6,6,6,6,1]],['three-kind',[6,6,6,6,6]],['four-kind',[6,6,6,6,6]],
  ['court-majority',[3,3,3,1,2]],['court-majority',[4,4,4,1,1]],['court-majority',[4,4,4,4,1]],['five-different',[1,2,3,4,4]],['low-run',[2,3,4,5,6]],['royal-run',[1,2,3,4,5]],['council-four',[2,3,4,5,5]],['high-court',[3,4,5,6,6]],['twin-crowns',[5,5,5,6,1]],['straight',[6,1,2,3,4]],
 ] as [CrownCourtCategory,number[]][])('rejects a nonqualifying exact %s hand: %j', (category,dice)=>expect(scoreCrownCourt(dice,category)).toBe(0));
 it('requires 63 in the six rank rows alone, awards +30 once, and includes Free Roll only in the subtotal', () => {
  const scores={nines:3,tens:6,jacks:9,queens:12,kings:15,aces:17,'free-roll':30};
  expect(crownCourtTotals({scores})).toMatchObject({ranks:62,B:92,bonus:0,total:92});
  expect(crownCourtTotals({scores:{...scores,aces:18}})).toMatchObject({ranks:63,B:123,bonus:30,total:123});
 });
 it('enforces turns, real random rolls, reversible holds, three-roll limit and single-use categories', () => {
  let state=newCrownCourt(people,'short');expect(applyCrownCourtMove(state,1,{t:'roll'})).toBeNull();expect(applyCrownCourtMove(state,0,{t:'score',category:'one-pair'})).toBeNull();
  state=applyCrownCourtMove(state,0,{t:'roll'},()=>0)!;state=applyCrownCourtMove(state,0,{t:'hold',index:0})!;
  state=applyCrownCourtMove(state,0,{t:'roll'},()=>.99)!;expect(state.dice).toEqual([1,6,6,6,6]);
  state=applyCrownCourtMove(state,0,{t:'hold',index:0})!;expect(state.held[0]).toBe(false);
  state=applyCrownCourtMove(state,0,{t:'roll'},()=>.99)!;expect(state.dice).toEqual([6,6,6,6,6]);expect(applyCrownCourtMove(state,0,{t:'roll'})).toBeNull();expect(applyCrownCourtMove(state,0,{t:'hold',index:0})).toBeNull();
  expect(crownCourtScoreOptions(state).find(o=>o.category==='five-kind')?.score).toBe(103);
  expect(applyCrownCourtMove(state,0,{t:'score',category:'aces'})).toBeNull();
  state=applyCrownCourtMove(state,0,{t:'score',category:'five-kind'})!;expect(state.turn).toBe(1);expect(state.rolls).toBe(0);expect(state.cards[0]!.scores['five-kind']).toBe(103);
 });
 it.each(['short','medium','long'] as CourtLength[])('finishes exactly %s turns per player, accepts zeros and determines all tied winners', length=>{
  let state=newCrownCourt(people,length);const categories=courtCategories(length);
  for(const {id} of categories)for(let seat=0;seat<2;seat++){state=applyCrownCourtMove(state,seat,{t:'roll'},()=>.99)!;state=applyCrownCourtMove(state,seat,{t:'score',category:id})!;}
  expect(state.phase).toBe('finished');expect(state.winners).toEqual([0,1]);expect(crownCourtTotals(state.cards[0]!).filled).toBe(COURT_LENGTHS[length].turns);expect(applyCrownCourtMove(state,0,{t:'roll'})).toBeNull();
  expect(crownCourtTotals(state.cards[0]!).total).toBe(length==='short'?103:length==='medium'?163:193); // No repeat-five bonuses or joker scoring.
 });
 it('strictly rejects forged or malformed commands and bad random values',()=>{
  expect(parseCrownCourtMove({t:'roll',dice:[6,6,6,6,6]})).toBeNull();expect(parseCrownCourtMove({t:'score',category:'small-straight'})).toBeNull();expect(parseCrownCourtMove({t:'hold',index:5})).toBeNull();
  expect(()=>applyCrownCourtMove(newCrownCourt(people),0,{t:'roll'},()=>1)).toThrow();
  expect(()=>newCrownCourt(people,'invalid' as CourtLength)).toThrow();expect(scoreCrownCourt([0,6,6,6,6],'five-kind')).toBe(0);
 });
 it.each(['easy','normal','hard'] as const)('a %s computer completes a long game legally using only shared random rolls', level=>{
  const bots=people.map(p=>({...p,bot:true,level}));let state=newCrownCourt(bots,'long'),seed=13,moves=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  while(state.phase==='play'&&moves++<1000){const move=crownCourtBotMove(state,state.turn,level);expect(move).not.toBeNull();const next=applyCrownCourtMove(state,state.turn,move!,random);expect(next).not.toBeNull();state=next!;}
  expect(state.phase).toBe('finished');expect(state.cards.every(c=>crownCourtTotals(c).filled===21)).toBe(true);expect(state.activity.length).toBeLessThanOrEqual(64);
 });
 it('shows committed poker ranks during opponent playback and conceals future category choices',()=>{
  let state=newCrownCourt(people);state=applyCrownCourtMove(state,0,{t:'roll'},()=>.99)!;const frame=state.activity[0]!;state=applyCrownCourtMove(state,0,{t:'score',category:'five-kind'})!;
  expect(crownCourtActivityText(frame)).toContain('A · A · A · A · A');expect(crownCourtPresentationCards(state,frame)[0]!.scores['five-kind']).toBeUndefined();expect(crownCourtPresentationCards(state,null)[0]!.scores['five-kind']).toBe(103);
 });
});
