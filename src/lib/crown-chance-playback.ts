import type { ChanceActivity, CrownChanceState } from './crown-chance';

export const CHANCE_ROLL_MS = 850;
export function chanceActivityDuration(frame: ChanceActivity, opponent: boolean) {
  if (frame.kind === 'roll') return opponent ? frame.lost !== undefined ? 3400 : 3000 : 1100;
  if (frame.kind === 'claim') return opponent ? frame.hot ? 2300 : 1800 : frame.hot ? 1400 : 650;
  return opponent ? 2200 : 900;
}

/** Show the score at the visible move, even when the server has already
 * completed the opponent's turn. Old saved activities remain replayable. */
export function chancePlaybackScores(state: CrownChanceState, frame?: ChanceActivity, rolling = false) {
  const scores = (frame?.scores ?? state.scores).map(score => ({ ...score }));
  if (!frame) return scores;
  const through = frame.id - (rolling ? 1 : 0);
  const later = (state.activity ?? []).filter(event => event.id > through && (!frame.scores || event.id === frame.id));
  for (const event of later) {
    const score = scores[event.seat]!;
    if (event.kind === 'bank') {
      score.points -= event.points;
      score.turns--;
      if (event.points >= score.best) score.best = Math.max(0, ...(state.activity ?? [])
        .filter(previous => previous.id <= through && previous.seat === event.seat && previous.kind === 'bank')
        .map(previous => previous.kind === 'bank' ? previous.points : 0));
    } else if (event.kind === 'roll' && event.lost !== undefined) { score.turns--; score.busts--; }
    else if (event.kind === 'claim' && event.hot) score.hot--;
  }
  return scores;
}
