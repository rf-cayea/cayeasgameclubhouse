import { FIVE_DICE_CATEGORIES, type FiveDiceActivity, type FiveDiceCard, type FiveDiceState } from './five-dice';

export const FIVE_DICE_ROLL_MS = 850;
export const QUINTSEE_CELEBRATION_MS = 2400;

/** Celebrate the committed roll, never a hold, scoring echo, or empty tray. */
export function isQuintseeRoll(event: FiveDiceActivity | null): boolean {
  return event?.kind === 'roll' && event.rolls > 0 && event.dice.length === 5
    && Number.isInteger(event.dice[0]) && event.dice[0]! >= 1 && event.dice[0]! <= 6
    && event.dice.every(value => value === event.dice[0]);
}

/** Keep later scoring choices hidden until their step in opponent playback. */
export function fiveDicePresentationCards(state: FiveDiceState, frame: FiveDiceActivity | null): FiveDiceCard[] {
  if (!frame) return state.cards;
  const future = (state.activity ?? []).filter(event => event.id > frame.id && event.kind === 'score' && event.category);
  if (!future.length) return state.cards;
  const cards = state.cards.map(card => ({ scores: { ...card.scores }, fiveKindBonuses: card.fiveKindBonuses }));
  for (const event of future) {
    const card = cards[event.seat];
    if (card && event.category) { delete card.scores[event.category]; card.fiveKindBonuses = Math.max(0, card.fiveKindBonuses - (event.bonus ?? 0) / 100); }
  }
  return cards;
}

/** A bot decides its holds one die at a time. Present each resulting hold group together. */
export function fiveDiceActivityFrames(events: readonly FiveDiceActivity[]): FiveDiceActivity[] {
  const frames: FiveDiceActivity[] = [];
  for (const event of events) {
    const previous = frames.at(-1);
    if (event.kind === 'hold' && previous?.kind === 'hold' && previous.seat === event.seat && previous.round === event.round && previous.rolls === event.rolls) frames[frames.length - 1] = event;
    else frames.push(event);
  }
  return frames;
}

export function fiveDiceActivityText(event: FiveDiceActivity): string {
  if (event.kind === 'score') {
    const category = FIVE_DICE_CATEGORIES.find(item => item.id === event.category)?.label ?? 'a category';
    return `${category} · +${event.score ?? 0}${event.bonus ? ` + ${event.bonus} bonus` : ''}`;
  }
  if (event.kind === 'hold') {
    const kept = event.dice.filter((_, index) => event.held[index]);
    return kept.length ? `Holding ${kept.join(' · ')} — ${5 - kept.length} ${kept.length === 4 ? 'die' : 'dice'} to reroll` : 'Released all dice';
  }
  return `Roll ${event.rolls} of 3 · ${event.dice.join(' · ')}`;
}

export function fiveDiceActivityDuration(event: FiveDiceActivity): number {
  return event.kind === 'roll' ? FIVE_DICE_ROLL_MS + (isQuintseeRoll(event) ? QUINTSEE_CELEBRATION_MS : 0) : event.kind === 'hold' ? 400 : 1150;
}
