import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { applyCrownChanceMove, chanceCanBank, chanceHands, newCrownChance, type CrownChanceMove, type CrownChanceState } from '../src/lib/crown-chance';
import { CrownChanceRoomStore } from '../server/crown-chance-rooms';
import { EconomyStore } from '../server/economy';
import { TestD1 } from './helpers/d1';

const players = ['Ava','Ben','Cat'].map(name=>({id:name,name,bot:false}));
const make = (seats=1) => newCrownChance(players.slice(0,seats),'fast',seats===1?'attack':null);
const act = (state:CrownChanceState, move:CrownChanceMove, values:number[] = []) =>
  applyCrownChanceMove(state,state.turn,move,()=>((values.shift() ?? 6)-.5)/6)!;

describe('Crown & Chance rulebook',()=>{
  it.each([
    [[1],50],[[6],100],[[2,2],200],[[6,6],250],[[1,1,2,2],450],[[1,1,2,2,3,3],900],
    [[1,1,1],500],[[6,6,6],750],[[1,2,3,4,5],1200],[[2,3,4,5,6],1400],
    [[2,2,2,4,4],1600],[[2,2,2,2],2000],[[1,2,3,4,5,6],2700],[[3,3,3,3,3],3000],[[5,5,5,5,5,5],5000],
  ] as const)('scores %j as %i', (ranks,points)=>{
    const state = make();
    state.dice = [...ranks,...Array(6-ranks.length).fill(0)];
    expect(chanceHands(state).find(hand=>hand.mask===(1<<ranks.length)-1)?.points).toBe(points);
  });

  it('requires a pair on the first bank and prevents combining with an earlier roll',()=>{
    let state = act(make(),{t:'roll'},[1,2,3,4,5,6]);
    expect(applyCrownChanceMove(state,0,{t:'roll'})).toBeNull();
    state = act(state,{t:'claim',mask:1});
    expect(chanceCanBank(state)).toBe(false);
    state = act(state,{t:'roll'},[1,2,2,3,4]);
    expect(chanceHands(state).some(hand=>hand.mask===3)).toBe(false);
    state = act(state,{t:'claim',mask:12});
    expect(chanceCanBank(state)).toBe(true);
    state = act(state,{t:'bank'});
    expect(state.scores[0]!.points).toBe(250);
    state = act(act(state,{t:'roll'},[6,2,3,4,5,1]),{t:'claim',mask:1});
    expect(chanceCanBank(state)).toBe(true);
  });

  it('scores Hot Dice, then loses the whole unbanked turn on a later bust',()=>{
    let state = act(act(make(),{t:'roll'},[1,2,3,4,5,6]),{t:'claim',mask:63});
    expect(state.scores[0]!.hot).toBe(1);
    state = act(state,{t:'roll'},[1,2,3,4,5,6]);
    state = act(state,{t:'claim',mask:1});
    state = act(state,{t:'claim',mask:32});
    // Leave a single die that cannot score after a later matching claim.
    state = act(state,{t:'roll'},[2,2,2,3]);
    state = act(state,{t:'claim',mask:14});
    state = act(state,{t:'roll'},[4]);
    expect(state.scores[0]).toMatchObject({points:0,busts:1,turns:1,hot:1});
    expect(state.pending).toBe(0);
  });

  it('finishes equal turns and then gives only tied leaders extra turns',()=>{
    let state = make(3);
    for (const points of [4000,4000,200]) {
      state = {...state, pending:points, qualified:true};
      state = act(state,{t:'bank'});
    }
    expect(state.phase).toBe('play');
    expect(state.order).toEqual([0,1]);
    state = act({...state,pending:50},{t:'bank'});
    state = act({...state,pending:100},{t:'bank'});
    expect(state.winners).toEqual([1]);
    expect(state.scores.map(score=>score.turns)).toEqual([2,2,1]);
  });

  it('ends Score Attack after exactly ten turns even after passing the target',()=>{
    let state = make();
    for(let i=0;i<10;i++) {
      expect(state.phase).toBe('play');
      state = act({...state,pending:500,qualified:true},{t:'bank'});
    }
    expect(state.phase).toBe('finished');
    expect(state.scores[0]).toMatchObject({points:5000,turns:10});
  });
});

it('credits a verified computer win once and shares the poker crate progress',async()=>{
  const db = new TestD1();
  const actor = {principal:'member:11111111-1111-4111-8111-111111111111',jokers:false};
  const economy = new EconomyStore(db);
  let roll = 0;
  const store = new CrownChanceRoomStore(db,Date.now,()=>roll < 6 ? (++roll,.99) : ((roll++ % 6)+.5)/6);
  const send = (input:Record<string,unknown>)=>store.command(actor,{...input,requestId:randomUUID()});
  try {
    await economy.ensureMember(actor);
    let {view} = await send({operation:'create',name:'Player',options:{mode:'bot',seats:2,level:'hard',length:'fast',minimum:0}});
    for (const move of [{t:'roll'},{t:'claim',mask:63},{t:'bank'}]) {
      ({view} = await send({operation:'move',code:view.code,revision:view.revision,move}));
    }
    expect(view.status).toBe('finished');
    await economy.syncTrustedRewards(actor);
    await economy.syncTrustedRewards(actor);
    const data = await economy.read(actor);
    expect(data.stats).toMatchObject({chanceWins:1,chanceHardWins:1,crownWins:0});
    expect(data.rewardCrates?.poker.progress?.computerWins).toBe(1);
    expect(data.achievements.find(item=>item.id==='crown-chance-victory-1')?.unlocked).toBe(true);
  } finally { db.sqlite.close(); }
});
