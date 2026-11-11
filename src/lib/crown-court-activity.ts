import { CROWN_COURT_CATEGORIES, type CrownCourtActivity, type CrownCourtCard, type CrownCourtState, courtRank } from './crown-court';

export const CROWN_COURT_ROLL_MS = 850;
/** Keep later scoring choices hidden until their step in opponent playback. */
export function crownCourtPresentationCards(state: CrownCourtState, frame: CrownCourtActivity | null): CrownCourtCard[] {
  if (!frame) return state.cards;
  const future = (state.activity ?? []).filter(event => event.id > frame.id && event.kind === 'score' && event.category);
  if (!future.length) return state.cards;
  const cards = state.cards.map(card => ({ scores: { ...card.scores } }));
  for (const event of future) {
    const card = cards[event.seat];
    if (card && event.category) { delete card.scores[event.category]; }
  }
  return cards;
}

/** A bot decides its holds one die at a time. Present each resulting hold group together. */
export function crownCourtActivityFrames(events: readonly CrownCourtActivity[]): CrownCourtActivity[] {
  const frames: CrownCourtActivity[] = [];
  for (const event of events) {
    const previous = frames.at(-1);
    if (event.kind === 'hold' && previous?.kind === 'hold' && previous.seat === event.seat && previous.round === event.round && previous.rolls === event.rolls) frames[frames.length - 1] = event;
    else frames.push(event);
  }
  return frames;
}

export function crownCourtActivityText(event: CrownCourtActivity): string {
  if (event.kind === 'score') {
    const category = CROWN_COURT_CATEGORIES.find(item => item.id === event.category)?.label ?? 'a category';
    return `${category} · +${event.score ?? 0}`;
  }
  if (event.kind === 'hold') {
    const kept = event.dice.filter((_, index) => event.held[index]);
    return kept.length ? `Holding ${kept.map(courtRank).join(' · ')} — ${5 - kept.length} ${kept.length === 4 ? 'die' : 'dice'} to reroll` : 'Released all dice';
  }
  return `Roll ${event.rolls} of 3 · ${event.dice.map(courtRank).join(' · ')}`;
}

export function crownCourtActivityDuration(event: CrownCourtActivity): number {
  return event.kind === 'roll' ? CROWN_COURT_ROLL_MS : event.kind === 'hold' ? 400 : 1150;
}
