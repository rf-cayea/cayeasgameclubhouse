import { PLAYING_CARDS, PLAYING_CARDS_WITH_JOKERS } from './playing-decks';

export const SUITS = ['C', 'D', 'S', 'H'] as const;
export type Suit = typeof SUITS[number];
export const SUIT_NAMES: Record<Suit, string> = { C: 'Clubs', D: 'Diamonds', S: 'Spades', H: 'Hearts' };
const SEATS = [0, 1, 2, 3];
const ranks = '23456789TJQKA';
const next = (seat: number) => (seat + 1) % 4;
const suit = (card: string): Suit => card === 'X1' ? 'C' : card === 'X2' ? 'D' : card[1] as Suit;
const rank = (card: string) => ranks.indexOf(card[0]!);
export const wild = (card: string) => card[0] === '8' || card[0] === 'X';
export const sortHand = (hand: string[]) => hand.sort((a, b) => SUITS.indexOf(suit(a)) - SUITS.indexOf(suit(b)) || rank(a) - rank(b));

function shuffle(cards: readonly string[]) {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function preferredSuit(hand: string[]): Suit {
  return SUITS.reduce((best, candidate) => {
    const count = (value: Suit) => hand.filter(card => !wild(card) && suit(card) === value).length;
    return count(candidate) > count(best) ? candidate : best;
  }, SUITS[0]);
}

export interface Eights {
  hands: string[][];
  stock: string[];
  pile: string[];
  active: Suit;
  turn: number;
  drew: boolean;
  passes: number;
  winners: number[];
  message: string;
}

export function startEights(): Eights {
  const stock = shuffle(PLAYING_CARDS_WITH_JOKERS);
  const hands = SEATS.map(() => sortHand(stock.splice(0, 5)));
  const [opening] = stock.splice(stock.findIndex(card => !wild(card)), 1) as [string];
  return { hands, stock, pile: [opening], active: suit(opening), turn: 0, drew: false, passes: 0, winners: [], message: 'Match the opening card or play a wild.' };
}

export function eightsLegal(game: Eights, card: string) {
  return wild(card) || suit(card) === game.active || card[0] === game.pile.at(-1)?.[0];
}

export function playEight(game: Eights, card: string, chosenSuit: Suit): Eights {
  const hand = game.hands[game.turn]!;
  if (game.winners.length || !hand.includes(card) || !eightsLegal(game, card)) return game;
  const hands = game.hands.map((cards, i) => i === game.turn ? cards.filter(value => value !== card) : cards);
  return { ...game, hands, pile: [...game.pile, card], active: wild(card) ? chosenSuit : suit(card), turn: next(game.turn), drew: false, passes: 0,
    winners: hand.length === 1 ? [game.turn] : [], message: `${seatName(game.turn)} played ${cardName(card)}${wild(card) ? ` and called ${SUIT_NAMES[chosenSuit]}` : ''}.` };
}

export function drawEight(game: Eights): Eights {
  if (game.winners.length || game.drew || game.hands[game.turn]!.some(card => eightsLegal(game, card))) return game;
  const pile = game.stock.length ? game.pile : game.pile.slice(-1);
  const stock = game.stock.length ? [...game.stock] : shuffle(game.pile.slice(0, -1));
  const card = stock.pop();
  if (!card) return passEight({ ...game, drew: true });
  const hands = game.hands.map((hand, seat) => seat === game.turn ? sortHand([...hand, card]) : hand);
  const drawn = { ...game, pile, stock, hands, drew: true, passes: 0, message: `${seatName(game.turn)} drew a card.` };
  return eightsLegal(drawn, card) ? drawn : passEight(drawn);
}

export function passEight(game: Eights): Eights {
  if (game.winners.length || !game.drew) return game;
  const passes = game.passes + 1;
  const lowest = Math.min(...game.hands.map(hand => hand.length));
  return { ...game, turn: next(game.turn), drew: false, passes, winners: passes === 4 ? SEATS.filter(seat => game.hands[seat]!.length === lowest) : [], message: `${seatName(game.turn)} passed.` };
}

export function eightsBot(game: Eights) {
  const hand = game.hands[game.turn]!;
  const legal = hand.filter(card => eightsLegal(game, card));
  const card = legal.find(value => !wild(value)) ?? legal[0];
  if (card) return playEight(game, card, preferredSuit(hand.filter(value => value !== card)));
  return game.drew ? passEight(game) : drawEight(game);
}

interface TrickPlay { seat: number; card: string }
export interface Hearts {
  hands: string[][];
  kitty: string[];
  jokers: boolean;
  totals: number[];
  taken: number[];
  round: number;
  trick: TrickPlay[];
  lastTrick: TrickPlay[];
  turn: number;
  broken: boolean;
  phase: 'pass' | 'play' | 'round' | 'match';
  message: string;
}

export const passDirection = (round: number) => ['left', 'right', 'across', 'hold'][round % 4]!;
export const heartPoints = (card: string) => card === 'QS' ? 13 : suit(card) === 'H' ? 1 : 0;
export function startHearts(jokers: boolean, round = 0, totals = [0, 0, 0, 0]): Hearts {
  // The two non-scoring deuces form the first-trick kitty in the 54-card variant.
  const kitty = jokers ? ['2D', '2S'] : [];
  const stock = shuffle((jokers ? PLAYING_CARDS_WITH_JOKERS : PLAYING_CARDS).filter(card => !kitty.includes(card)));
  const hands = SEATS.map(() => sortHand(stock.splice(0, 13)));
  return { hands, kitty, jokers, totals, taken: [0, 0, 0, 0], round, trick: [], lastTrick: [], turn: hands.findIndex(hand => hand.includes('2C')), broken: false,
    phase: passDirection(round) === 'hold' ? 'play' : 'pass', message: 'The 2 of Clubs opens the hand.' };
}

export function validHeartPass(hand: string[], selection: string[]) {
  return selection.length === 3 && new Set(selection).size === 3 && selection.every(card => hand.includes(card));
}

export function passHearts(game: Hearts, selection: string[]): Hearts {
  if (!validHeartPass(game.hands[0]!, selection)) return game;
  return exchangeHearts(game, [selection]);
}

export function exchangeHearts(game: Hearts, selections: (string[] | undefined)[]): Hearts {
  if (game.phase !== 'pass') return game;
  const offset = [1, 3, 2][game.round % 4]!;
  const sent = game.hands.map((hand, seat) => selections[seat] ?? [...hand].sort((a, b) => passRisk(b) - passRisk(a)).slice(0, 3));
  const hands = game.hands.map((hand, seat) => sortHand([...hand.filter(card => !sent[seat]!.includes(card)), ...sent[(seat + 4 - offset) % 4]!]));
  return { ...game, hands, turn: hands.findIndex(hand => hand.includes('2C')), phase: 'play', message: 'Cards passed. The 2 of Clubs opens.' };
}

const passRisk = (card: string) => card === 'QS' ? 30 : (['AS', 'KS'].includes(card) ? 20 : 0) + rank(card);
export function heartsLegal(game: Hearts): string[] {
  if (game.phase !== 'play' || game.trick.length === 4) return [];
  const hand = game.hands[game.turn]!;
  const lead = game.trick[0];
  const first = game.lastTrick.length === 0;
  if (!lead) {
    if (first) return ['2C'];
    const other = hand.filter(card => suit(card) !== 'H');
    return !game.broken && other.length ? other : hand;
  }
  const matching = hand.filter(card => suit(card) === suit(lead.card));
  if (matching.length) return matching;
  const safe = hand.filter(card => heartPoints(card) === 0);
  return first && safe.length ? safe : hand;
}

export function playHeart(game: Hearts, card: string): Hearts {
  if (!heartsLegal(game).includes(card)) return game;
  const hands = game.hands.map((hand, seat) => seat === game.turn ? hand.filter(value => value !== card) : hand);
  const trick = [...game.trick, { seat: game.turn, card }];
  return { ...game, hands, trick, turn: next(game.turn), broken: game.broken || suit(card) === 'H', message: `${seatName(game.turn)} played ${cardName(card)}.` };
}

function trickWinner(trick: TrickPlay[]) {
  const lead = trick[0]!;
  return trick.reduce((best, entry) => suit(entry.card) === suit(lead.card) && rank(entry.card) > rank(best.card) ? entry : best, lead);
}

export function collectTrick(game: Hearts): Hearts {
  if (game.phase !== 'play' || game.trick.length !== 4) return game;
  const { seat } = trickWinner(game.trick);
  const points = game.trick.reduce((sum, entry) => sum + heartPoints(entry.card), 0);
  const taken = game.taken.map((value, index) => value + (index === seat ? points : 0));
  const base = { ...game, turn: seat, kitty: [], taken, lastTrick: game.trick, trick: [], message: `${seatName(seat)} took the trick${points ? ` for ${points} points` : ''}.` };
  if (game.hands[0]!.length) return base;
  const moon = taken.indexOf(26);
  const totals = game.totals.map((total, index) => total + (moon < 0 ? taken[index]! : index === moon ? 0 : 26));
  return { ...base, totals, phase: totals.some(total => total >= 100) ? 'match' : 'round', message: moon < 0 ? base.message : `${seatName(moon)} shot the moon. Every other player adds 26 points.` };
}

export function heartsBot(game: Hearts) {
  if (game.trick.length === 4) return collectTrick(game);
  const cards = [...heartsLegal(game)].sort((a, b) => rank(a) - rank(b));
  const lead = game.trick[0];
  if (!lead) return playHeart(game, cards[0]!);
  const winning = trickWinner(game.trick).card;
  const under = cards.filter(card => rank(card) < rank(winning));
  const choice = suit(cards[0]!) !== suit(lead.card)
    ? cards.sort((a, b) => heartPoints(b) - heartPoints(a) || passRisk(b) - passRisk(a))[0]
    : under.at(-1) ?? cards[0];
  return playHeart(game, choice!);
}

export const seatName = (seat: number) => ['You', 'West', 'North', 'East'][seat]!;
export function cardName(card: string) {
  if (card === 'X1' || card === 'X2') return card === 'X1' ? 'Black Joker' : 'Red Joker';
  const face: Record<string, string> = { A: 'Ace', T: '10', J: 'Jack', Q: 'Queen', K: 'King' };
  return `${face[card[0]!] ?? card[0]} of ${SUIT_NAMES[suit(card)]}`;
}
