import { analyseHand } from './rummy-engine';
import { allowsHighAce, cardValue, isJoker, rankOf, sortHandByRank, sortHandBySuit, suitOf, type Card, type Variant } from './rummy';

/** Preserve the best complete melds, then place useful pairs together and isolated high cards last. */
export function smartRummySort(hand: Card[], variant: Variant) {
  const analysis = analyseHand(sortHandByRank(hand), variant), remaining = sortHandByRank(analysis.deadwood);
  const candidates: { cards: Card[]; weight: number; key: string }[] = [];
  for (let a = 0; a < remaining.length; a++) for (let b = a + 1; b < remaining.length; b++) {
    const first = remaining[a]!, second = remaining[b]!;
    let weight = 0;
    if (isJoker(first) || isJoker(second)) weight = 85;
    else if (rankOf(first) === rankOf(second)) weight = 72;
    else if (suitOf(first) === suitOf(second)) {
      let distance = Math.abs(rankOf(first) - rankOf(second));
      if (allowsHighAce(variant) && (rankOf(first) === 1 || rankOf(second) === 1)) distance = Math.min(distance, 14 - Math.max(rankOf(first), rankOf(second)));
      weight = distance === 1 ? 76 : distance === 2 ? 45 : 0;
    }
    if (weight) candidates.push({ cards: [first, second], weight, key: `${first}:${second}` });
  }
  const used = new Set<Card>(), nearMelds: Card[][] = [];
  for (const pair of candidates.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))) {
    if (pair.cards.some(card => used.has(card))) continue;
    pair.cards.forEach(card => used.add(card)); nearMelds.push(allowsHighAce(variant) && pair.cards.some(card => rankOf(card) === 1) && pair.cards.some(card => rankOf(card) >= 12) ? [...pair.cards].sort((a,b)=>(rankOf(a)===1?14:rankOf(a))-(rankOf(b)===1?14:rankOf(b))) : sortHandBySuit(pair.cards));
  }
  const isolated = remaining.filter(card => !used.has(card)).sort((a, b) => cardValue(a, variant) - cardValue(b, variant) || a.localeCompare(b));
  return { ...analysis, nearMelds, cards: [...analysis.melds.flat(), ...nearMelds.flat(), ...isolated] };
}
