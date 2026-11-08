import { canLayOff } from './rummy-engine';
import { isMeld, type Card, type Move } from './rummy';
import type { RoomView } from './rummy-protocol';
import type { SpadesMove } from './spades';
import type { SpadesRoomView } from './spades-protocol';

type RummyDragView = Pick<RoomView, 'hand' | 'melds' | 'variant' | 'phase' | 'drewDiscard' | 'mustUse' | 'status' | 'turn' | 'mySeat'>;
export type RummyDropAction = { move: Move } | { chooseMeld: Card };

export function dragSelection(card: Card, selected: Card[], hand: Card[]): Card[] {
  if (!hand.includes(card)) return [];
  return selected.includes(card) ? [...new Set(selected.filter(value => hand.includes(value)))] : [card];
}

/** Resolve a table gesture using the current private hand and public rules. */
export function rummyDropAction(room: RummyDragView, target: string, card: Card, cards: Card[], enabled: boolean): RummyDropAction | null {
  if (!enabled || room.status !== 'playing' || room.turn !== room.mySeat || room.phase !== 'play' ||
    !room.hand.includes(card) || !cards.includes(card) || cards.some(value => !room.hand.includes(value))) return null;
  if (target === 'rummy-discard') return !room.mustUse && room.drewDiscard !== card ? { move: { t: 'discard', card } } : null;
  if (target !== 'rummy-melds' || room.variant === 'gin') return null;
  if (cards.length >= 3 && isMeld(cards, room.variant)) return { move: { t: 'meld', cards } };
  if (cards.length !== 1) return null;
  const matches = room.melds.flatMap((meld, index) => canLayOff(card, meld, room.variant) ? [index] : []);
  return matches.length === 1 ? { move: { t: 'layoff', card, meld: matches[0]! } } : matches.length > 1 ? { chooseMeld: card } : null;
}

export function spadesDropMove(room: Pick<SpadesRoomView, 'hand' | 'status' | 'turn' | 'mySeat' | 'phase' | 'legal'>, target: string, card: Card, enabled: boolean): SpadesMove | null {
  return enabled && target === 'spades-play' && room.status === 'playing' && room.turn === room.mySeat && room.phase === 'play' &&
    room.hand.includes(card) && room.legal.includes(card) ? { t: 'play', card } : null;
}
