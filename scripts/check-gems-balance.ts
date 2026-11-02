/** Deterministic balance check through the same journey transitions as the UI.
 * node --import tsx scripts/check-gems-balance.ts --earned-boosters
 * No board edits, free tools, replay gifts, or skipped locked levels.
 */
import assert from 'node:assert/strict';
import { applyGemsAction, legalGemSwaps, startGems, type GemsAction, type GemsState } from '../src/lib/gems-engine';
import { gemsLevel } from '../src/lib/gems-levels';
import { enterGemsLevel, newGemsJourney, playGemsJourney, readGemsJourney } from '../src/lib/gems-progress';

function remaining(state: GemsState) {
  const collection = gemsLevel(state.level).collect.reduce((n, goal) => n + Math.max(0, goal.count - state.collected[goal.color]!), 0);
  return collection * 1.5 + state.board.reduce((n, c) => n + c.frost * 3 + c.crate * 3 + (c.chain ? 3 : 0), 0);
}
const report: { level: number; won: boolean; moves: number; remaining: number }[] = [];
const useEarned = process.argv.includes('--earned-boosters');
let journey = newGemsJourney(), toolsUsed = 0, retries = 0;
for (let level = 1; level <= 150; level++) {
  if (useEarned && level > 1) { const next = enterGemsLevel(journey, level); assert(next, `Locked level ${level}`); journey = next; }
  let state = useEarned ? journey.play : startGems(level), usedHere = 0, attemptsHere = 0;
  const commit = (action: GemsAction) => {
    if (useEarned) {
      const next = playGemsJourney(journey, action); assert(next, 'Invalid move or exhausted booster');
      journey = next.journey;
      assert.deepEqual(readGemsJourney(JSON.stringify(journey)), journey, `Autosave mismatch in level ${level}`);
      state = journey.play;
    } else { const next = applyGemsAction(state, action); assert(next); state = next.state; }
  };
  for (let turn = 0; state.status === 'play' && turn < 250; turn++) {
    const outcomes = legalGemSwaps(state).map(([a, b]) => {
      const action: GemsAction = { type: 'swap', a, b };
      return { action, state: applyGemsAction(state, action)!.state };
    });
    const value = (next: GemsState) => (next.status === 'won' ? 100000 : 0) + (remaining(state) - remaining(next)) * 10
      + (next.score - state.score) * .008 + next.board.filter(c => c.gem?.special).length * 2;
    outcomes.sort((a, b) => value(b.state) - value(a.state));
    assert(outcomes[0], `Dead board at level ${level}`);
    if (useEarned && state.movesLeft <= 3 && outcomes[0].state.status !== 'won' && usedHere < 16) {
      const boosters: { action: GemsAction; state: GemsState }[] = [];
      for (const kind of ['row', 'column', 'burst'] as const) if (journey.inventory[kind] > 0) {
        const targets = kind === 'burst' ? Array.from({ length: 64 }, (_, i) => i) : Array.from({ length: 8 }, (_, i) => kind === 'row' ? i * 8 : i);
        for (const target of targets) {
          const action: GemsAction = { type: 'booster', kind, target }, next = applyGemsAction(state, action);
          if (next) boosters.push({ action, state: next.state });
        }
      }
      boosters.sort((a, b) => remaining(a.state) - remaining(b.state) || b.state.score - a.state.score);
      if (boosters[0] && remaining(boosters[0].state) < remaining(state)) { commit(boosters[0].action); toolsUsed++; usedHere++; continue; }
    }
    commit(outcomes[0].action);
    if (useEarned && state.status === 'lost' && attemptsHere < 3) {
      const next = enterGemsLevel(journey, level); assert(next);
      journey = next; state = journey.play; retries++; attemptsHere++; usedHere = 0;
    }
  }
  report.push({ level, won: state.status === 'won', moves: state.movesLeft, remaining: remaining(state) });
  if (useEarned) {
    assert.equal(state.status, 'won', `Campaign stopped at level ${level}: ${remaining(state)} remaining, ${JSON.stringify(journey.inventory)}`);
    assert.equal(Object.keys(journey.stars).length, level, 'Each level earns a first-clear gift once');
  }
  if (level % 15 === 0) console.log(JSON.stringify({ chapter: level / 15, won: report.slice(-15).filter(r => r.won).length, ...(useEarned ? { inventory: journey.inventory, toolsUsed, retries } : { hardest: report.slice(-15).sort((a, b) => b.remaining - a.remaining).slice(0, 3) }) }));
}
console.log(JSON.stringify({ mode: useEarned ? 'actual saved journey transitions, starter kit and earned boosters only' : 'one greedy attempt per level, no boosters', completed: report.filter(r => r.won).length, levels: report.length, ...(useEarned ? { inventory: journey.inventory, toolsUsed, retries } : { challenging: report.filter(r => !r.won).map(r => r.level) }) }));
