import type { Card } from './rummy';

const ranks: Record<string, string> = { A: 'Ace', T: '10', J: 'Jack', Q: 'Queen', K: 'King' };
const suits: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

export function cardLabel(card: Card): string {
  if (card === 'X1') return 'Joker 1';
  if (card === 'X2') return 'Joker 2';
  return `${ranks[card[0]!] ?? card[0]} of ${suits[card[1]!] ?? 'unknown suit'}`;
}

/** Move one physical card without changing the contents of the hand. */
export function reorderHand(cards: readonly Card[], from: number, to: number): Card[] {
  const result = [...cards];
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= result.length || to >= result.length || from === to) return result;
  const [card] = result.splice(from, 1);
  result.splice(to, 0, card!);
  return result;
}
