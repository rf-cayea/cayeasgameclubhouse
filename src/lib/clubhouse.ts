import { classicTitle } from './classic-card-protocol';
import { CONVERSION_RATE, puzzleLevelPoints } from "./reward-rates";
import type { EconomyWallet } from "./economy-protocol";
export { useClubhouse, useClubhouseAccount } from "./clubhouse-account";
export { ACHIEVEMENTS as BADGES } from "./achievement-catalog";

export const HUB_NAME = "Cayea's Game Clubhouse";

/** The shared server reward schedule also drives the displayed first-clear reward. */
export const levelPoints = (level: number) => puzzleLevelPoints('faith-3', level);

export interface Game {
  slug: string;
  name: string;
  tagline: string;
  status: "live" | "soon";
  icon: string;
}

export const GAMES: Game[] = [
 {slug:"carrom",name:"Clubhouse Carrom & Disc Pool",tagline:"Slide your striker. Pull back to aim. Pocket your color with touch controls, bank shots, three computer difficulties or online rivals.",status:"live",icon:"◉"},
  {slug:"backgammon",name:"Clubhouse Backgammon",tagline:"Smart moves, doubling cube, Crawford matches and Nackgammon. Collect boards and engraved checkers.",status:"live",icon:"◈"},
  { slug: "crown-chance", name: "Crown & Chance", tagline: "Richard Cayea’s six-dice game of poker hands, bold rerolls and safe banks.", status: "live", icon: "♠" },
  { slug: "crown-court", name: "Crown & Court", tagline: "A Clubhouse Original. Five poker dice, three match lengths, and a royal scorecard. Roll 9, 10, J, Q, K, A.", status: "live", icon: "♛" },
  { slug: "farkle", name: "Farkle", tagline: "Six dice. Smart scoring. Bank your points or risk a Farkle. Three computer difficulties and online tables for 2–4.", status: "live", icon: "⚅" },
  { slug: "dominoes", name: "Clubhouse Dominoes", tagline: "Draw, Block and Muggins. Three computer difficulties or private online matches for two.", status: "live", icon: "▣" },
  { slug: "five-dice", name: "Quintsee", tagline: "Three computer difficulties, free two-player online tables, and unlockable three- or four-player party tables.", status: "live", icon: "🎲" },
  { slug: "faith-3", name: "Faith 3 Tile Match", tagline: "280 levels across ten world beliefs, including 80 mahjong-style layouts.", status: "live", icon: "🕊" },
  { slug: "rummy", name: "Cayea's Classic Cards Rummy+", tagline: "Classic, Gin and Rummy 500 — vs computer, online, or on one device.", status: "live", icon: "🃏" },
  { slug: "spades", name: "Cayea’s Classic Cards Spades", tagline: "Four players. Solo rivals or 2 vs 2 partners. Bid, play, and collect your own table and deck.", status: "live", icon: "♠" },
  { slug: "crazy-eights", name: classicTitle('eights'), tagline: "Match rank or suit, call a new suit with wild eights or jokers, and empty your hand first. Play solo or host an online table.", status: "live", icon: "8" },
  { slug: "hearts", name: classicTitle('hearts'), tagline: "Dodge penalty cards or shoot the moon in classic Hearts or the Clubhouse Jokers variant, solo or online.", status: "live", icon: "♥" },
  { slug: "3-gems", name: "3 Gems of Buddhism", tagline: "200 match-three levels. Restore four monasteries, 50 levels each.", status: "live", icon: "🪷" },
];

export type Wallet = EconomyWallet;

export const SKIN_SLOT = "faith3_skin";
/** Owned forever: unlimited Shuffles in Faith 3 (server allows it when verifying wins). */
export const INFINITY_SHUFFLE = "f3-infinity-shuffle";

const EVT = "clubhouse-wallet";
/** Each game's own points. They buy only that game's items, or convert to Clubhouse Cash. */
export const GAME_POINTS = {
  dominoes: { name: "Dominoes points", short: "Domino pts", icon: "▣", key: "domino_points" },
  "3-gems": { name: "3 Gems points", short: "Gems pts", icon: "🪷", key: "gems_points" },
  "faith-3": { name: "Faith 3 points", short: "F3 pts", icon: "🙏", key: "f3_points" },
  rummy: { name: "Rummy+ points", short: "Rummy pts", icon: "🃏", key: "rummy_points" },
  "five-dice": { name: "Shared Dice points (Quintsee, Farkle, Crown & Court, Crown & Chance, Backgammon, Carrom)", short: "Dice pts", icon: "⚄", key: "dice_points" },
  spades: { name: "Spades points", short: "Spades pts", icon: "♠", key: "spades_points" },
} as const;
export type PointGame = keyof typeof GAME_POINTS;
/** One Clubhouse Cash is worth 30% more than one game point. */
export const cashFor = (gamePoints: number) => Math.floor(gamePoints / CONVERSION_RATE.points) * CONVERSION_RATE.cash;
export const notifyWallet = () => {
  window.dispatchEvent(new Event(EVT));
  try { localStorage.setItem('clubhouse-wallet-refresh', crypto.randomUUID()); } catch { /* Cross-tab refresh is optional in private browsing. */ }
};
