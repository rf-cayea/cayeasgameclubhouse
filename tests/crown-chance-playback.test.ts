import { describe, expect, it } from 'vitest';
import { applyCrownChanceMove, newCrownChance, type CrownChanceState, type CrownChanceMove } from '../src/lib/crown-chance';
import { chanceActivityDuration, chancePlaybackScores, CHANCE_ROLL_MS } from '../src/lib/crown-chance-playback';
const players = [{ id: 'human', name: 'Player', bot: false }, { id: 'bot', name: 'Computer', bot: true }];
function act(state: CrownChanceState, move: CrownChanceMove, dice: number[] = []) {
  return applyCrownChanceMove(state, state.turn, move, () => ((dice.shift() ?? 6) - .5) / 6)!;
}
function completedTurn() {
  let state = newCrownChance(players, 'long');
  state.turn = 1;
  state = act(state, { t: 'roll' }, [1,2,3,4,5,6]);
  state = act(state, { t: 'claim', mask: 63 });
  return act(state, { t: 'bank' });
}
describe('Crown & Chance visible computer turn', () => {
  it('shows zero banked computer points throughout roll and claim, then updates on the bank', () => {
    const state = completedTurn();
    const [roll, claim, bank] = state.activity!;
    expect(state.scores[1]!.points).toBe(2000);
    expect(chancePlaybackScores(state, roll)[1]).toMatchObject({ points: 0, turns: 0, hot: 0, best: 0 });
    expect(chancePlaybackScores(state, claim)[1]).toMatchObject({ points: 0, turns: 0, hot: 1, best: 0 });
    expect(chancePlaybackScores(state, bank)[1]).toMatchObject({ points: 2000, turns: 1, hot: 1, best: 2000 });
    expect(roll!.scores![1]!.points).toBe(0);
    expect(claim!.claimed).toEqual(Array(6).fill(true));
  });
  it('preserves scores from earlier turns and does not reveal a later bank', () => {
    let state = completedTurn();
    state = act(state, { t: 'roll' }, [1,2,3,4,5,6]);
    state = act(state, { t: 'claim', mask: 63 });
    state = act(state, { t: 'bank' });
    const earlier = state.activity![0]!;
    expect(chancePlaybackScores(state, earlier).map(score => score.points)).toEqual([0,0]);
    expect(chancePlaybackScores(state, state.activity![3]).map(score => score.points)).toEqual([0,2000]);
    expect(state.scores.map(score => score.points)).toEqual([2000,2000]);
  });
  it('defers the bust counter until the dice land', () => {
    let state = newCrownChance(players, 'long'); state.turn = 1;
    state = act(state, { t: 'roll' }, [2,2,2,3,4,5]);
    state = act(state, { t: 'claim', mask: 7 });
    state = act(state, { t: 'roll' }, [1,3,6]);
    state = act(state, { t: 'claim', mask: 8 });
    state = act(state, { t: 'claim', mask: 32 });
    state = act(state, { t: 'roll' }, [4]);
    const bust = state.activity!.at(-1)!;
    expect(bust).toMatchObject({ kind: 'roll', lost: 700 });
    expect(chancePlaybackScores(state, bust, true)[1]).toMatchObject({ points: 0, turns: 0, busts: 0 });
    expect(chancePlaybackScores(state, bust)[1]).toMatchObject({ points: 0, turns: 1, busts: 1 });
  });
  it('can replay older saved histories without score snapshots', () => {
    const state = completedTurn();
    for (const event of state.activity!) { delete event.scores; delete event.claimed; }
    expect(chancePlaybackScores(state, state.activity![0])[1]).toMatchObject({ points: 0, turns: 0, hot: 0, best: 0 });
    expect(chancePlaybackScores(state, state.activity![1])[1]).toMatchObject({ points: 0, turns: 0, hot: 1 });
    expect(chancePlaybackScores(state, state.activity![2])[1].points).toBe(2000);
  });
  it('gives opponents time to roll, show their hand and bank, exceeding human move delays', () => {
    for (const event of completedTurn().activity!) {
      expect(chanceActivityDuration(event, true)).toBeGreaterThan(chanceActivityDuration(event, false));
      expect(chanceActivityDuration(event, true)).toBeGreaterThan(CHANCE_ROLL_MS + 900);
    }
  });
});
