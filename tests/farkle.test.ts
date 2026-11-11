import { describe, expect, it } from 'vitest';
import { applyFarkleMove, canBankFarkle, farkleBotMove, farklePlays, newFarkle, parseFarkleMove, scoreFarkleDice, type FarkleState, type FarkleMove } from '../src/lib/farkle';
const players = [{ id: 'a', name: 'Alice', bot: false }, { id: 'b', name: 'Computer', bot: true }];
const roll = (state: FarkleState, faces: number[]) => { let index = 0; return applyFarkleMove(state, state.turn, { t: 'roll' }, () => (faces[index++]! - .5) / 6)!; };
const ready = (turnPoints: number, scores = [0, 0]): FarkleState => ({ ...newFarkle(players), turnPoints, rolls: 1, scores });
const seeded = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };

describe('classic six-dice Farkle scoring', () => {
  it.each([[1,100],[5,50],[2,0],[3,0],[4,0],[6,0]])('scores a single %i as %i', (face, points) => expect(scoreFarkleDice([face])?.score ?? 0).toBe(points));
  it.each([1,2,3,4,5,6])('scores three through six %is with explicit kind multipliers', face => {
    const base = face === 1 ? 1000 : face * 100;
    for (let count = 3; count <= 6; count++) expect(scoreFarkleDice(Array(count).fill(face))?.score).toBe(base * (count - 2));
  });
  it.each([
    [[1,2,3,4,5,6],1500], [[2,2,3,3,4,4],1500], [[2,2,2,3,3,3],2500],
    [[4,4,4,4,6,6],1500], [[1,1,1,1,5,5],2100], [[1,1,5],250], [[6,6,6,1,5],750],
  ] as const)('finds the best complete score for %j', (dice, score) => expect(scoreFarkleDice(dice)?.score).toBe(score));
  it.each([[],[0,0,0,0,0,0],[7],[1,2],[2,2],[1,1,2],[1,2,3,4,5],[1,1,1,1,1,1,1]].map(dice => ({dice})))('refuses incomplete or invalid scoring selections $dice', ({dice}) => expect(scoreFarkleDice(dice)).toBeNull());
  it('finds every scoring subset, only in the current unkept dice, without changing results', () => {
    const dice = [1,5,3,3,3,2], snapshot = [...dice], plays = farklePlays(dice);
    expect(plays[0]).toMatchObject({ score: 450, dice: [0,1,2,3,4] });
    expect(new Set(plays.flatMap(play => play.dice))).toEqual(new Set([0,1,2,3,4]));
    for (const play of plays) expect(scoreFarkleDice(play.dice.map(index => dice[index]!))?.score).toBe(play.score);
    expect(farklePlays([2,2,3,3,4,6])).toEqual([]);
    expect(farklePlays(dice, [true,true,false,false,false,false])[0]).toMatchObject({ score:300, dice:[2,3,4] });
    expect(dice).toEqual(snapshot);
  });
});
describe('turns, hot dice, banking and immediate wins', () => {
  it('requires a scoring keep before another roll and rerolls exactly the remaining dice', () => {
    const initial=newFarkle(players), first=roll(initial,[1,5,2,3,4,6]);
    expect(initial.dice).toEqual(Array(6).fill(0));
    expect(applyFarkleMove(first,0,{t:'roll'})).toBeNull();
    expect(applyFarkleMove(first,0,{t:'keep',dice:[2]})).toBeNull();
    const kept=applyFarkleMove(first,0,{t:'keep',dice:[0]})!;let rolls=0;
    const second=applyFarkleMove(kept,0,{t:'roll'},()=>{rolls++;return 0;})!;
    expect(rolls).toBe(5);expect(second.dice).toEqual([1,1,1,1,1,1]);
    expect(scoreFarkleDice(second.dice.filter((_,i)=>!second.kept[i]))?.score).toBe(3000);
    expect(applyFarkleMove(second,0,{t:'keep',dice:[0,1,2]})).toBeNull();
  });
  it('does not combine held dice across rolls into triples', () => {
    const first=roll(newFarkle(players),[1,2,3,4,6,2]),kept=applyFarkleMove(first,0,{t:'keep',dice:[0]})!;
    const second=roll(kept,[1,1,2,3,4]);
    const saved=applyFarkleMove(second,0,{t:'keep',dice:[1,2]})!;
    expect(saved.turnPoints).toBe(300);
  });
  it('requires 300 to enter, then permits any positive bank and atomic keep-and-bank', () => {
    expect(canBankFarkle(ready(250))).toBe(false);
    expect(applyFarkleMove(ready(250),0,{t:'bank'})).toBeNull();
    const banked=applyFarkleMove(ready(300),0,{t:'bank'})!;expect(banked.scores).toEqual([300,0]);expect(banked.turn).toBe(1);
    expect(canBankFarkle(ready(50,[300,0]))).toBe(true);
    const mixed=roll(newFarkle(players),[1,1,1,2,3,4]);
    expect(applyFarkleMove(mixed,0,{t:'bank',dice:[0,1,2]})?.scores[0]).toBe(1000);
    expect(applyFarkleMove(mixed,0,{t:'bank',dice:[0,1,2,3]})).toBeNull();
  });
  it('scores all six for hot dice, preserves risk, and makes all six roll again', () => {
    const straight=roll(newFarkle(players),[1,2,3,4,5,6]),hot=applyFarkleMove(straight,0,{t:'keep',dice:[0,1,2,3,4,5]})!;
    expect(hot.turnPoints).toBe(1500);expect(hot.hotDice).toEqual([1,0]);
    const next=roll(hot,[1,2,3,4,5,6]);expect(next.kept).toEqual(Array(6).fill(false));expect(next.turnPoints).toBe(1500);expect(next.activity.at(-1)?.hot).toBe(true);
  });
  it('a Farkle loses the complete unbanked turn, preserves the bank, and records the actual roll for animation', () => {
    const before=ready(850,[500,1000]),next=roll(before,[2,2,3,3,4,6]);
    expect(next).toMatchObject({turn:1,turnPoints:0,scores:[500,1000],busts:[1,0]});
    expect(next.activity.at(-1)).toMatchObject({kind:'roll',seat:0,dice:[2,2,3,3,4,6],bust:true,points:-850,turnPoints:850});
    expect(next.dice).toEqual(Array(6).fill(0));
  });
  for(const target of [5000,10000])for(const seats of [2,3,4])for(let winner=0;winner<seats;winner++){
    it(`ends immediately at ${target} for seat ${winner+1} of ${seats}, with no other turn`,()=>{
      const table=Array.from({length:seats},(_,n)=>({id:`p${n}`,name:`Player ${n}`,bot:n===winner}));
      const before={...newFarkle(table,target),turn:winner,scores:table.map(()=>target-100),turnPoints:100,rolls:1};
      const state=applyFarkleMove(before,winner,{t:'bank'})!;
      expect(state).toMatchObject({phase:'finished',turn:winner,winners:[winner],finalTurns:[],round:1});
      expect(state.scores).toEqual(table.map((_,n)=>n===winner?target:target-100));expect(state.activity).toHaveLength(1);expect(state.scoreHistory?.at(-1)).toMatchObject({seat:winner,banked:100,total:target});
      for(let seat=0;seat<seats;seat++)for(const move of [{t:'roll'},{t:'bank'},{t:'keep',dice:[0]}] as FarkleMove[])expect(applyFarkleMove(state,seat,move)).toBeNull();
    });
  }
  it('requires a bank to reach the goal and ends immediately on an atomic keep-and-bank',()=>{
    let state=roll({...newFarkle(players,5000),scores:[4900,100],turnPoints:0},[1,2,3,4,6,2]);
    const kept=applyFarkleMove(state,0,{t:'keep',dice:[0]})!;expect(kept.phase).toBe('play');expect(kept.scores[0]).toBe(4900);expect(applyFarkleMove(kept,0,{t:'bank'})?.winners).toEqual([0]);
    expect(applyFarkleMove(state,0,{t:'bank',dice:[0]})).toMatchObject({phase:'finished',winners:[0],scores:[5000,100]});
  });
  it('rejects forged scores, duplicates, strangers and malformed randomness', () => {
    const state=newFarkle(players);
    for(const move of [{t:'roll',dice:[1,1,1,1,1,1]},{t:'keep',dice:[0,0]},{t:'keep',dice:[6]},{t:'bank',score:10000},{t:'keep',dice:[]},{t:'roll',score:900}])expect(parseFarkleMove(move)).toBeNull();
    expect(applyFarkleMove(state,1,{t:'roll'})).toBeNull();
    expect(()=>applyFarkleMove(state,0,{t:'roll'},()=>1)).toThrow();
  });
  it.each(['easy','normal','hard'] as const)('completes a fair %s match through legal decisions only', level => {
    for(let seed=1;seed<=4;seed++){
      const random=seeded(seed),bots=players.map(player=>({...player,bot:true,level}));let state=newFarkle(bots),moves=0;
      while(state.phase==='play'&&moves++<5000){const move=farkleBotMove(state,state.turn,level,random);expect(move).not.toBeNull();const next=applyFarkleMove(state,state.turn,move!,random);expect(next).not.toBeNull();state=next!;}
      expect(state.phase).toBe('finished');expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(10000);expect(state.finalTurns).toEqual([]);
    }
  });
});
