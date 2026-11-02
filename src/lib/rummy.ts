export type Variant = "classic" | "gin" | "r500";
export type Card = string;
export type Level = "easy" | "normal" | "hard";
export interface Player { id: string; name: string; bot: boolean; level?: Level }
export const LEVELS: Record<Level, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };
export const WIN_POINTS = { humans: 150, hard: 120, normal: 70, easy: 40 } as const;
export function winTier(players: Player[]): keyof typeof WIN_POINTS {
  if (players.filter(p => !p.bot).length >= 2) return "humans";
  const levels = players.filter(p => p.bot).map(p => p.level ?? "normal");
  return levels.includes("hard") ? "hard" : levels.includes("normal") ? "normal" : "easy";
}
export interface Meld { cards: { c: Card; by: number }[] }
export type Phase = "draw" | "play" | "roundOver" | "gameOver";
export interface RoundResult { winner: number | null; points: number[]; note: string }
export interface State {
  variant: Variant; players: Player[]; target: number; gameNo: number; jokers?: boolean;
  deck: Card[]; discard: Card[]; hands: Card[][]; melds: Meld[]; laid: number[];
  turn: number; dealer: number; round: number; phase: Phase;
  mustUse: Card | null; drewDiscard: Card | null; stockPasses?: number;
  scores: number[]; roundResult: RoundResult | null; winner: number | null; log: string[];
  opening?: "first" | "dealer" | "stock" | null;
  turns?: number;
}
export type Move =
  | { t: "draw"; from: "stock" } | { t: "draw"; from: "discard"; index?: number }
  | { t: "meld"; cards: Card[] } | { t: "layoff"; card: Card; meld: number }
  | { t: "discard"; card: Card; knock?: boolean } | { t: "next" } | { t: "pass" };
export const RANKS = "A23456789TJQK";
export const SUITS = "SHDC";
export const VARIANTS: Record<Variant, { name: string; target: number; min: number; max: number; summary: string }> = {
  classic: { name: "Classic Rummy", target: 100, min: 2, max: 4, summary: "Make sets and runs, lay off on any meld. First to empty hand scores opponent cards. First to 100 wins." },
  gin: { name: "Gin Rummy", target: 100, min: 2, max: 2, summary: "Two players, 10 cards. Melds stay in hand. Knock with <=10 deadwood, or go Gin." },
  r500: { name: "Rummy 500", target: 500, min: 2, max: 4, summary: "Score every card you meld minus cards left in hand. First to 500 wins." },
};
export const JOKERS: Card[] = ["X1", "X2"];
export const isCard = (card: Card) => /^(?:[A23456789TJQK][SHDC]|X[12])$/.test(card);
export const rankOf = (card: Card) => isCard(card) && card[0] !== "X" ? RANKS.indexOf(card[0]!) + 1 : 0;
export const suitOf = (card: Card) => isCard(card) && card[0] !== "X" ? card[1]! : "";
export const isJoker = (card: Card) => JOKERS.includes(card);
export const JOKER_VALUE = 15;
export const JOKER_PERK = "rummy-jokers";
export function cardValue(card: Card, variant: Variant) {
  if (!isCard(card)) throw new Error("Invalid card.");
  if (isJoker(card)) return JOKER_VALUE;
  const rank = rankOf(card);
  if (variant === "r500") return rank === 1 ? 15 : rank >= 10 ? 10 : 5;
  return rank >= 10 ? 10 : rank;
}
function shuffleDeck<T>(cards: T[], rand: () => number) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) {
    const value = rand();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Random values must be in [0, 1).");
    const j = Math.floor(value * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
const validCards = (cards: Card[]) => cards.every(isCard) && new Set(cards).size === cards.length;
export function isSet(cards: Card[]) {
  if (cards.length < 3 || cards.length > 4 || !validCards(cards)) return false;
  const natural = cards.filter(card => !isJoker(card));
  if (!natural.length) return false;
  const rank = rankOf(natural[0]!);
  return natural.every(card => rankOf(card) === rank) && new Set(natural.map(suitOf)).size === natural.length;
}
export function isRun(cards: Card[], aceHigh: boolean) {
  if (!validCards(cards)) return false;
  const natural = cards.filter(card => !isJoker(card)), wild = cards.length - natural.length;
  if (cards.length < 3 || cards.length > 13 || !natural.length || !natural.every(card => suitOf(card) === suitOf(natural[0]!))) return false;
  const fits = (ranks: number[]) => new Set(ranks).size === ranks.length && ranks[ranks.length - 1]! - ranks[0]! + 1 - ranks.length <= wild;
  const ranks = natural.map(rankOf).sort((a, b) => a - b);
  if (fits(ranks)) return true;
  return aceHigh && ranks[0] === 1 && fits([...ranks.slice(1), 14]);
}
export const isMeld = (cards: Card[], variant: Variant) => validCards(cards) && (isSet(cards) || isRun(cards, variant === "r500"));
function assertHand(hand: Card[]) {
  if (!validCards(hand)) throw new Error("A hand must contain valid, distinct physical cards.");
}
const compareCards = (a: Card, b: Card) => {
  if (isJoker(a) || isJoker(b)) return Number(isJoker(a)) - Number(isJoker(b)) || (a < b ? -1 : a > b ? 1 : 0);
  return rankOf(a) - rankOf(b) || SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b));
};

/** Ascending rank, then spades/hearts/diamonds/clubs, with physical jokers last. */
export function sortHandByRank(hand: Card[]): Card[] {
  assertHand(hand);
  return [...hand].sort(compareCards);
}

/** Group suits in spades/hearts/diamonds/clubs order, then ascending rank. */
export function sortHandBySuit(hand: Card[]): Card[] {
  assertHand(hand);
  return [...hand].sort((a, b) => isJoker(a) || isJoker(b) ? compareCards(a, b)
    : SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b)) || rankOf(a) - rankOf(b));
}

export const MAX_BEST_SORT_CARDS = 20;
const countBits = (mask: number) => {
  let count = 0;
  for (; mask; mask &= mask - 1) count++;
  return count;
};

function forEachSelection(items: number[], count: number, visit: (mask: number) => void, offset = 0, mask = 0) {
  if (count === 0) { visit(mask); return; }
  for (let i = offset; i <= items.length - count; i++) {
    forEachSelection(items, count - 1, visit, i + 1, mask | (1 << items[i]!));
  }
}

function orderMeld(cards: Card[], variant: Variant): Card[] {
  if (isSet(cards)) return [...cards].sort(compareCards);
  const natural = cards.filter(card => !isJoker(card));
  const jokers = cards.filter(isJoker).sort();
  const lastRank = variant === "r500" ? 14 : 13;
  for (let start = 1; start <= lastRank - cards.length + 1; start++) {
    const positions = new Map(natural.map(card => [rankOf(card) === 1 && start > 1 ? 14 : rankOf(card), card]));
    if (positions.size !== natural.length || [...positions.keys()].some(rank => rank < start || rank >= start + cards.length)) continue;
    let wild = 0;
    return Array.from({ length: cards.length }, (_, index) => positions.get(start + index) ?? jokers[wild++]!);
  }
  // Every caller supplies a valid meld; this branch guards future rule changes.
  return [...cards].sort(compareCards);
}

/**
 * Find disjoint melds with the lowest possible deadwood value. Ties prefer fewer
 * deadwood cards, then fewer meld groups. Canonical card/candidate order makes
 * results independent of the current manual hand order. Exact search is bounded
 * to 20 cards so an accidental oversized input cannot freeze the browser.
 */
export function bestArrangement(hand: Card[], variant: Variant): { melds: Card[][]; deadwood: Card[]; dw: number } {
  assertHand(hand);
  if (!Object.prototype.hasOwnProperty.call(VARIANTS, variant)) throw new Error("Invalid Rummy variant.");
  if (hand.length > MAX_BEST_SORT_CARDS) throw new RangeError(`Best Sort supports up to ${MAX_BEST_SORT_CARDS} cards.`);
  const cards = [...hand].sort(compareCards);
  if (cards.length === 0) return { melds: [], deadwood: [], dw: 0 };
  const maskCards = (mask: number) => cards.filter((_, index) => (mask & (1 << index)) !== 0);
  const candidates = new Map<number, Card[]>();
  const add = (mask: number) => {
    if (candidates.has(mask)) return;
    const meld = maskCards(mask);
    if (isMeld(meld, variant)) candidates.set(mask, orderMeld(meld, variant));
  };
  const jokerIndices = cards.flatMap((card, index) => isJoker(card) ? [index] : []);
  const jokerMasks: number[] = [];
  for (let size = 0; size <= jokerIndices.length; size++) forEachSelection(jokerIndices, size, mask => jokerMasks.push(mask));

  // Sets have at most four natural suits and two distinct physical jokers.
  for (let rank = 1; rank <= 13; rank++) {
    const natural = cards.flatMap((card, index) => !isJoker(card) && rankOf(card) === rank ? [index] : []);
    for (const jokers of jokerMasks) {
      for (const length of [3, 4]) {
        const naturalCount = length - countBits(jokers);
        if (naturalCount > 0 && naturalCount <= natural.length) forEachSelection(natural, naturalCount, mask => add(mask | jokers));
      }
    }
  }

  // Enumerate suited intervals, including choices to reserve an available
  // natural card for another meld by filling its position with a joker.
  for (const suit of SUITS) {
    const natural = new Map(cards.flatMap((card, index) => !isJoker(card) && suitOf(card) === suit ? [[rankOf(card), index] as const] : []));
    if (variant === "r500" && natural.has(1)) natural.set(14, natural.get(1)!);
    const lastRank = variant === "r500" ? 14 : 13;
    for (let length = 3; length <= 13; length++) {
      for (let start = 1; start <= lastRank - length + 1; start++) {
        const available: number[] = [];
        for (let rank = start; rank < start + length; rank++) if (natural.has(rank)) available.push(natural.get(rank)!);
        const missing = length - available.length;
        const availableMask = available.reduce((mask, index) => mask | (1 << index), 0);
        for (const jokers of jokerMasks) {
          const jokerCount = countBits(jokers);
          const omit = jokerCount - missing;
          if (omit < 0 || omit >= available.length || jokerCount >= length) continue;
          forEachSelection(available, omit, omitted => add((availableMask ^ omitted) | jokers));
        }
      }
    }
  }

  const byCard: number[][] = cards.map(() => []);
  for (const mask of [...candidates.keys()].sort((a, b) => a - b)) {
    cards.forEach((_, index) => { if (mask & (1 << index)) byCard[index]!.push(mask); });
  }
  const size = 1 << cards.length;
  const scores = new Int16Array(size).fill(-1);
  const deadCounts = new Uint8Array(size);
  const meldCounts = new Uint8Array(size);
  const choices = new Int32Array(size);
  scores[0] = 0;
  const solve = (mask: number): number => {
    if (scores[mask]! >= 0) return scores[mask]!;
    const first = mask & -mask;
    const index = 31 - Math.clz32(first);
    const skipped = mask ^ first;
    let score = cardValue(cards[index]!, variant) + solve(skipped);
    let deadCount = deadCounts[skipped]! + 1;
    let meldCount = meldCounts[skipped]!;
    let choice = 0;
    for (const meld of byCard[index]!) {
      if ((mask & meld) !== meld) continue;
      const rest = mask ^ meld;
      const candidateScore = solve(rest);
      const candidateDead = deadCounts[rest]!;
      const candidateMelds = meldCounts[rest]! + 1;
      if (candidateScore < score || candidateScore === score && (candidateDead < deadCount || candidateDead === deadCount && candidateMelds < meldCount)) {
        score = candidateScore;
        deadCount = candidateDead;
        meldCount = candidateMelds;
        choice = meld;
      }
    }
    scores[mask] = score;
    deadCounts[mask] = deadCount;
    meldCounts[mask] = meldCount;
    choices[mask] = choice;
    return score;
  };
  let remaining = size - 1;
  const dw = solve(remaining);
  const melds: Card[][] = [];
  const deadwood: Card[] = [];
  while (remaining) {
    const meld = choices[remaining]!;
    if (meld) { melds.push([...candidates.get(meld)!]); remaining ^= meld; }
    else {
      const first = remaining & -remaining;
      deadwood.push(cards[31 - Math.clz32(first)]!);
      remaining ^= first;
    }
  }
  return { melds, deadwood, dw };
}
/** Deal a fresh match. Turn execution lives in rummy-engine.ts. */
export function newGame(variant: Variant, players: Player[], rand: () => number, gameNo = 1, jokers = false): State {
  const config = VARIANTS[variant];
  if (!config || players.length < config.min || players.length > config.max) throw new Error("Invalid player count for variant.");
  if (new Set(players.map(player => player.id)).size !== players.length) throw new Error("Player IDs must be unique.");
  const deck = shuffleDeck([...[...SUITS].flatMap(suit => [...RANKS].map(rank => rank + suit)), ...(jokers ? JOKERS : [])], rand);
  const count = variant === "gin" ? 10 : variant === "r500" ? (players.length === 2 ? 13 : 7) : (players.length === 2 ? 10 : 7);
  const hands = players.map(() => deck.splice(0, count));
  return {
    variant, players, target: config.target, gameNo, jokers, deck, discard: [deck.pop()!], hands, melds: [], laid: players.map(() => 0),
    turn: 1, dealer: 0, round: 1, phase: "draw", mustUse: null, drewDiscard: null, scores: players.map(() => 0), roundResult: null, winner: null, log: ["Game started."],
    opening: variant === "gin" ? "first" : null, turns: 0,
  };
}
