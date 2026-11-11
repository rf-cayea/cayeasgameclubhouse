import { describe, expect, it } from 'vitest';
import { rng } from '../src/lib/game';
import { FIVE_DICE_CATEGORIES, applyFiveDiceMove, fiveDiceBotMove, fiveDiceScoreOptions, fiveDiceTotals, newFiveDice, parseFiveDiceMove, scoreFiveDice, type FiveDiceCard, type FiveDiceCategory, type FiveDiceState } from '../src/lib/five-dice';

const players = [{ id: 'alice', name: 'Alice', bot: false }, { id: 'computer', name: 'Computer', bot: true, level: 'normal' as const }];
const blank = (): FiveDiceCard => ({ scores: {}, fiveKindBonuses: 0 });
const position = (dice: number[], card: FiveDiceCard = blank()): FiveDiceState => ({ ...newFiveDice(players), dice, rolls: 1, cards: [card, blank()] });
const allowed = (state: FiveDiceState) => fiveDiceScoreOptions(state).filter(option => option.legal);

describe('five-dice scorecard rules', () => {
  it('has thirteen distinct score slots and starts with five unrolled, unheld dice', () => {
    expect(new Set(FIVE_DICE_CATEGORIES.map(category => category.id)).size).toBe(13);
    const state = newFiveDice(players);
    expect(state).toMatchObject({ turn: 0, round: 1, phase: 'play', rolls: 0, dice: [0,0,0,0,0], held: [false,false,false,false,false], winners: [] });
    expect(allowed(state)).toEqual([]);
    expect(applyFiveDiceMove(state,0,{ t:'score',category:'chance' })).toBeNull();
    expect(applyFiveDiceMove(state,0,{ t:'hold',index:0 })).toBeNull();
    expect(() => newFiveDice(players.slice(0,1))).toThrow();
    expect(() => newFiveDice([...players,players[0]!])).toThrow();
    expect(() => newFiveDice(Array.from({length:5},(_,i)=>({id:String(i),name:'Player',bot:false})))).toThrow();
  });

  it('scores every ordered five-die roll against independent combination rules', () => {
    const check = (dice: number[]) => {
      const values = new Set(dice), counts = [...values].map(value => dice.filter(die => die===value).length), sum=dice.reduce((a,b)=>a+b,0);
      const straight4 = [[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(run=>run.every(value=>values.has(value)));
      const straight5 = [[1,2,3,4,5],[2,3,4,5,6]].some(run=>run.every(value=>values.has(value)));
      const expected = [1,2,3,4,5,6].map(face=>dice.filter(die=>die===face).length*face);
      expected.push(Math.max(...counts)>=3?sum:0,Math.max(...counts)>=4?sum:0,counts.includes(3)&&counts.includes(2)?25:0,straight4?30:0,straight5?40:0,values.size===1?50:0,sum);
      for(let index=0;index<13;index++) if(scoreFiveDice(dice,FIVE_DICE_CATEGORIES[index]!.id)!==expected[index]) throw new Error(`Scoring error: ${dice} in ${FIVE_DICE_CATEGORIES[index]!.id}`);
    };
    for(let value=0;value<6**5;value++){let n=value;const dice=[];for(let i=0;i<5;i++){dice.push(n%6+1);n=Math.floor(n/6);}check(dice);}
    expect(scoreFiveDice([1,2,3,4,7],'chance')).toBe(0);
    expect(scoreFiveDice([1,2,3,4],'chance')).toBe(0);
    expect(scoreFiveDice([1,1,1,1,1],'full-house')).toBe(0);
    expect(scoreFiveDice([1,2,2,3,4],'small-straight')).toBe(30);
  });

  it('awards a fixed upper bonus at 63, adds repeated-five bonuses, and counts zero-filled slots', () => {
    const card: FiveDiceCard = { scores: {ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18,'five-kind':50,chance:0}, fiveKindBonuses:2 };
    expect(fiveDiceTotals(card)).toEqual({upper:63,upperBonus:35,lower:50,fiveKindBonus:200,total:348,filled:8});
    expect(fiveDiceTotals({...card,scores:{...card.scores,sixes:17}})).toMatchObject({upper:62,upperBonus:0,total:312});
    expect(fiveDiceTotals(blank())).toEqual({upper:0,upperBonus:0,lower:0,fiveKindBonus:0,total:0,filled:0});
  });

  it('forces the matching upper slot for a bonus five, even if another lower score is better', () => {
    const state=position([4,4,4,4,4],{scores:{'five-kind':50},fiveKindBonuses:0});
    expect(allowed(state)).toEqual([{category:'fours',score:20,bonus:100,legal:true}]);
    expect(applyFiveDiceMove(state,0,{t:'score',category:'large-straight'})).toBeNull();
    const result=applyFiveDiceMove(state,0,{t:'score',category:'fours'})!;
    expect(result.cards[0]).toEqual({scores:{'five-kind':50,fours:20},fiveKindBonuses:1});
    expect(fiveDiceTotals(result.cards[0]!)).toMatchObject({total:170});
    expect(state.cards[0]!.fiveKindBonuses).toBe(0);
  });

  it('uses lower joker scores when the matching upper slot is filled, before permitting other upper slots', () => {
    const state=position([2,2,2,2,2],{scores:{'five-kind':50,twos:6},fiveKindBonuses:1});
    expect(allowed(state).map(option=>option.category)).toEqual(['three-kind','four-kind','full-house','small-straight','large-straight','chance']);
    for(const [category,score] of [['full-house',25],['small-straight',30],['large-straight',40]] as const){
      const result=applyFiveDiceMove(state,0,{t:'score',category})!;
      expect(result.cards[0]!.scores[category]).toBe(score);
      expect(result.cards[0]!.fiveKindBonuses).toBe(2);
    }
    expect(applyFiveDiceMove(state,0,{t:'score',category:'ones'})).toBeNull();
    const lowerFilled=Object.fromEntries(FIVE_DICE_CATEGORIES.filter(category=>category.section==='lower').map(category=>[category.id,category.id==='five-kind'?50:0]));
    const upperOnly=position([2,2,2,2,2],{scores:{...lowerFilled,twos:6},fiveKindBonuses:0});
    expect(allowed(upperOnly).map(option=>option.category)).toEqual(['ones','threes','fours','fives','sixes']);
    expect(allowed(upperOnly).every(option=>option.score===0&&option.bonus===100)).toBe(true);
  });

  it('does not grant joker privileges or a bonus after five-of-a-kind was scratched', () => {
    const state=position([6,6,6,6,6],{scores:{'five-kind':0},fiveKindBonuses:0});
    expect(allowed(state)).toHaveLength(12);
    expect(allowed(state).every(option=>option.bonus===0)).toBe(true);
    expect(allowed(state).find(option=>option.category==='full-house')?.score).toBe(0);
    expect(allowed(state).find(option=>option.category==='four-kind')?.score).toBe(30);
    const next=applyFiveDiceMove(state,0,{t:'score',category:'large-straight'})!;
    expect(next.cards[0]!.scores['large-straight']).toBe(0);expect(next.cards[0]!.fiveKindBonuses).toBe(0);
  });

  it('lets a player release an earlier hold after the second roll, then rerolls only released dice',()=>{
    let state=applyFiveDiceMove(newFiveDice(players),0,{t:'roll'},()=>.4)!;
    state=applyFiveDiceMove(state,0,{t:'hold',index:0})!;
    state=applyFiveDiceMove(state,0,{t:'hold',index:3})!;
    state=applyFiveDiceMove(state,0,{t:'roll'},()=>.9)!;
    expect(state.dice).toEqual([3,6,6,3,6]);
    state=applyFiveDiceMove(state,0,{t:'hold',index:0})!;
    expect(state.held).toEqual([false,false,false,true,false]);
    state=applyFiveDiceMove(state,0,{t:'roll'},()=>0)!;
    expect(state.dice).toEqual([1,1,1,3,1]);expect(state.rolls).toBe(3);
    expect(applyFiveDiceMove(state,0,{t:'roll'})).toBeNull();
  });

  it('allows three rolls, rerolls only released dice, and rejects out-of-turn or injected moves', () => {
    const original=newFiveDice(players);let calls=0;
    const random=()=>{calls++;return .4;};
    const first=applyFiveDiceMove(original,0,{t:'roll'},random)!;expect(calls).toBe(5);expect(first.dice).toEqual([3,3,3,3,3]);
    let held=applyFiveDiceMove(first,0,{t:'hold',index:0})!;held=applyFiveDiceMove(held,0,{t:'hold',index:3})!;
    const second=applyFiveDiceMove(held,0,{t:'roll'},()=>.9)!;expect(second.dice).toEqual([3,6,6,3,6]);
    const third=applyFiveDiceMove(second,0,{t:'roll'},()=>0)!;expect(third.dice).toEqual([3,1,1,3,1]);expect(third.rolls).toBe(3);
    expect(applyFiveDiceMove(third,0,{t:'roll'})).toBeNull();expect(applyFiveDiceMove(third,0,{t:'hold',index:0})).toBeNull();
    expect(applyFiveDiceMove(first,1,{t:'score',category:'chance'})).toBeNull();
    expect(applyFiveDiceMove(first,0,{t:'score',category:'chance',score:999} as never)).toBeNull();
    expect(applyFiveDiceMove({...first,held:[true,true,true,true,true]},0,{t:'roll'})).toBeNull();
    expect(original).toMatchObject({rolls:0,dice:[0,0,0,0,0],held:[false,false,false,false,false]});
    for(const move of [null,[],{t:'roll',actor:0},{t:'hold',index:5},{t:'hold',index:-1},{t:'hold',index:1.5},{t:'hold',index:0,held:true},{t:'score',category:'invented'},{t:'score',category:'chance',amount:999}])expect(parseFiveDiceMove(move)).toBeNull();
  });

  it('locks a chosen zero, advances the round only after every player scores, and completes exactly thirteen rounds', () => {
    for(const size of [2,3,4]){
      let state=newFiveDice(Array.from({length:size},(_,i)=>({id:String(i),name:'Player '+i,bot:false})));
      for(let round=1;round<=13;round++)for(let seat=0;seat<size;seat++){
        expect(state.round).toBe(round);expect(state.turn).toBe(seat);
        state=applyFiveDiceMove(state,seat,{t:'roll'},()=>0)!;
        const category=FIVE_DICE_CATEGORIES[round-1]!.id;
        state=applyFiveDiceMove(state,seat,{t:'score',category},()=>0)!;
        expect(state.rolls).toBe(0);expect(state.held.every(value=>!value)).toBe(true);
      }
      expect(state.phase).toBe('finished');expect(state.round).toBe(13);expect(state.cards.every(card=>fiveDiceTotals(card).filled===13)).toBe(true);
      expect(state.winners).toEqual(Array.from({length:size},(_,i)=>i));
      expect(applyFiveDiceMove(state,state.turn,{t:'roll'})).toBeNull();expect(state.log.length).toBeLessThanOrEqual(40);
    }
    const scratched=applyFiveDiceMove(position([1,1,1,1,1]),0,{t:'score',category:'sixes'})!;
    expect(scratched.cards[0]!.scores.sixes).toBe(0);
    const again={...scratched,turn:0,rolls:1,dice:[6,6,6,6,6]};
    expect(applyFiveDiceMove(again,0,{t:'score',category:'sixes'})).toBeNull();
  });
});

describe('computer difficulties', () => {
  const play=(level:'easy'|'normal'|'hard',seed:number)=>{
    const random=rng(seed);let state=newFiveDice([0,1].map(i=>({id:String(i),name:'Computer '+i,bot:true,level})));
    let moves=0;
    while(state.phase==='play'&&moves<365){
      const move=fiveDiceBotMove(state,state.turn,level,random);expect(move).not.toBeNull();
      const next=applyFiveDiceMove(state,state.turn,move!,random);expect(next).not.toBeNull();state=next!;moves++;
    }
    expect(state.phase).toBe('finished');expect(moves).toBeLessThanOrEqual(364);
    return state.cards.reduce((sum,card)=>sum+fiveDiceTotals(card).total,0);
  };
  it('finishes bounded complete games at all difficulties without illegal moves or hold oscillation',()=>{
    for(const level of ['easy','normal','hard'] as const)for(const seed of [1,8,71])play(level,seed);
    expect(fiveDiceBotMove(newFiveDice(players),0,'hard')).toBeNull();
  });
  it('makes normal and hard progressively stronger over the same deterministic campaign',()=>{
    const totals={easy:0,normal:0,hard:0};
    for(const level of ['easy','normal','hard'] as const)for(let seed=1;seed<=12;seed++)totals[level]+=play(level,seed);
    expect(totals.normal).toBeGreaterThan(totals.easy);expect(totals.hard).toBeGreaterThan(totals.normal);
  });
  it('plans a hard turn within a small bounded search and reuses that plan across hold toggles',()=>{
    const state: FiveDiceState={...position([1,2,3,4,6]),players:[{id:'bot',name:'Computer',bot:true,level:'hard' as const},players[0]!]};
    let next=state,moves=0;const started=performance.now();
    while(next.turn===0&&moves<15){const move=fiveDiceBotMove(next,0,'hard')!;next=applyFiveDiceMove(next,0,move,()=>.1)!;moves++;}
    expect(next.turn).toBe(1);expect(moves).toBeLessThanOrEqual(14);
    // The engine enumerates at most 252 unordered outcomes per hold choice,
    // rather than any unbounded simulation or recursive game tree.
    expect(performance.now()-started).toBeLessThan(1000);
  });
});
