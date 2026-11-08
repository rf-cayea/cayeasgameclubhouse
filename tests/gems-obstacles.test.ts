import { TestD1 } from './helpers/d1';
import { EconomyStore } from '../server/economy';
import { PuzzleRewardStore } from '../server/puzzle-rewards';
import { describe, expect, it } from 'vitest';
import { applyGemsAction, startGems, legalGemSwaps, type GemsAction } from '../src/lib/gems-engine';
import { gemsLevel } from '../src/lib/gems-levels';
import { newGemsJourney, readGemsJourney } from '../src/lib/gems-progress';
import { verifyPuzzleReplay } from '../server/puzzle-rewards';
import { monasteryProgress, monasteryActivity } from '../src/lib/monastery';
import { gemsNextSteps } from '../src/lib/gems-next-steps';

function solve(level: number, rules: 1 | 2) {
  let state = startGems(level, 0, rules); const actions: GemsAction[] = [];
  const config = gemsLevel(level, rules);
  const score = (s: typeof state) => s.cratesCleared * 50 + s.frostCleared * 12 + s.chainsCleared * 15 + config.collect.reduce((sum, goal) => sum + Math.min(goal.count, s.collected[goal.color]!) * 5, 0) + s.board.filter(cell => cell.gem?.special).length * 8;
  while (state.status === 'play') {
    const best = legalGemSwaps(state).map(([a,b]) => { const action: GemsAction = {type:'swap',a,b}; return {action,state:applyGemsAction(state,action)!.state}; }).sort((a,b)=>score(b.state)-score(a.state)||b.state.score-a.state.score)[0]!;
    actions.push(best.action);state=best.state;
  }
  return { state, actions };
}

describe('obstacle barriers and safe upgrades', () => {
  it('introduces a complete middle wall in level four while keeping the first three levels clear', () => {
    for(let level=1;level<=3;level++) expect(startGems(level).board.every(cell=>!cell.crate)).toBe(true);
    for(let seed=0;seed<8;seed++) {
      const state=startGems(4,seed);expect(state.board.slice(24,32).every(cell=>cell.crate===1&&!cell.gem)).toBe(true);
      expect(legalGemSwaps(state).every(([a,b])=>a<24&&b<24||a>31&&b>31)).toBe(true);
    }
  });
  it('thickens barriers and requires repeated hits to open a path', () => {
    const start=startGems(14);expect(start.board.slice(24,32).every(cell=>cell.crate===2)).toBe(true);
    const hit=applyGemsAction(start,{type:'booster',kind:'row',target:24})!.state;
    expect(hit.board.slice(24,32).every(cell=>cell.crate===1)).toBe(true);
    const cleared=applyGemsAction(hit,{type:'booster',kind:'row',target:24})!.state;
    expect(cleared.board.slice(24,32).every(cell=>!cell.crate&&cell.gem)).toBe(true);
    expect(cleared.cratesCleared).toBeGreaterThanOrEqual(8);
    expect(gemsLevel(100).crateLayers).toBe(3);expect(gemsLevel(200).crates).toBeGreaterThan(gemsLevel(50).crates);
  });
  it('can win and verify the first barrier level with ordinary legal swaps', () => {
    const result=solve(4,2);expect(result.state.status).toBe('won');expect(verifyPuzzleReplay('3-gems',4,0,result.actions,2)?.stars).toBeGreaterThan(0);
  });
  it('keeps a legacy board, save, and reward proof playable under its original rules', () => {
    const result=solve(4,1);expect(result.state.status).toBe('won');expect(verifyPuzzleReplay('3-gems',4,0,result.actions,1)?.stars).toBeGreaterThan(0);
    expect(verifyPuzzleReplay('3-gems',4,0,result.actions,2)).toBeNull();
    const journey=newGemsJourney();journey.stars={'1':3,'2':3,'3':3};journey.unlocked=4;journey.play=startGems(4,0,1);delete journey.play.rules;
    expect(readGemsJourney(JSON.stringify(journey)).play).toEqual(journey.play);
  });
});

describe('relevant post-level notices', () => {
  it('distinguishes an affordable repair from a mission awaiting a crafted order', () => {
    expect(gemsNextSteps(monasteryProgress(0))).toMatchObject({repairReady:false,villageActions:0});
    expect(gemsNextSteps(monasteryProgress(1))).toMatchObject({repairReady:true,task:{cost:1}});
    const blocked=gemsNextSteps(monasteryProgress(50,8));expect(blocked).toMatchObject({repairReady:false,needsOrder:true});
  });
  it('reports real village opportunities and removes notices after they are completed', () => {
    let progress=monasteryProgress(30,4);progress=monasteryActivity(progress,'village_craft','meal')!;
    expect(gemsNextSteps(progress).villageActions).toBe(3);
    progress=monasteryActivity(progress,'alms','nuns')!;expect(gemsNextSteps(progress).villageActions).toBe(0);
    expect(gemsNextSteps(monasteryProgress(200,50))).toMatchObject({repairReady:false,needsOrder:false,task:null});
  });
});

 it('keeps server-issued legacy runs verifiable after the migration and marks new runs with current rules', async () => {
   const db=new TestD1();try {
     const actor={principal:'member:11111111-1111-4111-8111-111111111111',jokers:false},user=actor.principal.slice(7),economy=new EconomyStore(db),puzzles=new PuzzleRewardStore(db,economy);
     await economy.ensureMember(actor);
     for(let level=1;level<=3;level++) await economy.creditPuzzle(actor,'3-gems',level);
     const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
     db.sqlite.prepare("INSERT INTO puzzle_runs(id,user_id,game,level,attempt,expires_at,created_at) VALUES(?,?,'3-gems',4,0,?,0)").run(id,user,Date.now()+60000);
     expect(await puzzles.command(actor,{operation:'complete',runId:id,actions:solve(4,1).actions})).toMatchObject({verified:true,level:4});
     const next=await puzzles.command(actor,{operation:'start',game:'3-gems',level:5});expect(next).toMatchObject({rulesVersion:2,level:5});
   } finally {db.sqlite.close();}
 });
