import { SHARED_DECKS, type PlayingDeck } from './playing-decks';

export const POKER_DICE_SLOT = 'poker_dice';
export const POKER_SUITS = { S: '♠', H: '♥', C: '♣', D: '♦' } as const;
export type PokerSuit = keyof typeof POKER_SUITS;
export interface PokerDiceSet {
  id: string; name: string; price: number; suit: PokerSuit; paper: string; edge: string;
  style: 'engraved' | 'line' | 'card'; deck: PlayingDeck;
}
const classicDeck = SHARED_DECKS[0]!;
export const CLASSIC_POKER_DICE: PokerDiceSet = {id:'poker-dice-ivory',name:'Ivory Club',price:0,suit:'C',paper:'#fff4db',edge:'#c8ab78',style:'engraved',deck:classicDeck};
const suits: PokerSuit[] = ['D', 'H', 'S', 'C'];
export const POKER_DICE_SETS: PokerDiceSet[] = [
  {id:'poker-dice-blue',name:'Blue Spade',price:150,suit:'S',paper:'#d3e4fb',edge:'#8da5c5',style:'line',deck:classicDeck},
  {id:'poker-dice-inlaid',name:'Inlaid Diamond',price:150,suit:'D',paper:'#fff4dc',edge:'#cdb484',style:'card',deck:classicDeck},
  ...SHARED_DECKS.filter(deck => deck !== classicDeck).map((deck, index): PokerDiceSet => ({
    id:deck.id.replace('card-deck-', 'poker-dice-'), name:deck.name, price:250, suit:suits[index % suits.length]!,
    paper:deck.paper, edge:deck.accent, style:'card', deck,
  })),
];
export function equippedPokerDice(wallet?: {owned: readonly string[]; equipped: Record<string,string>} | null) {
  const id = wallet?.equipped[POKER_DICE_SLOT];
  return wallet?.owned.includes(id ?? '') ? POKER_DICE_SETS.find(set => set.id === id) ?? CLASSIC_POKER_DICE : CLASSIC_POKER_DICE;
}
