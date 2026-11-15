import { CARROM_MANDALA_BUNDLES } from './carrom-mandalas';
import { POKER_DICE_SETS, POKER_DICE_SLOT } from './poker-dice-sets';
import { CARROM_COLLECTIBLES } from './carrom-sets';
import {BG_COLLECTIBLES} from './backgammon-sets';
import type {RewardCrateCollection} from './reward-crates';
import { DICE_FRAGMENTS_REQUIRED, type DiceCrateView, type DiceCrateReward } from './dice-crates';
import { NAUTICAL_BUNDLES, NAUTICAL_BUNDLE_PRICE } from './nautical-sets';
import { DOMINO_SKINS,DOMINO_SKIN_SLOT } from './dominoes-skins';
import { FARKLE_DICE_SETS, FARKLE_DICE_SLOT } from './farkle-dice';
import { CONVERSION_RATE, cashPriceFor } from './reward-rates';
export { CONVERSION_RATE, cashPriceFor, puzzleLevelPoints } from './reward-rates';
import { PROFILE_IMAGE_SHAPES, isProfileFrameItem, profileFrameItem, profileFrameName } from './profile-image';
import { FAITH_SKINS } from './faith-skins';
import { SHARED_DECKS } from './playing-decks';
import { SPADES_VENUES } from './spades-cosmetics';
import { RUMMY_DESIGNS } from './rummy-cosmetics';

export const POINT_FIELDS = { 'faith-3': 'f3_points', '3-gems': 'gems_points', rummy: 'rummy_points', spades: 'spades_points', 'five-dice': 'dice_points', dominoes: 'domino_points' } as const;
export type PointGame = keyof typeof POINT_FIELDS;
export type Currency = typeof POINT_FIELDS[PointGame] | 'points';
export const POINT_GAMES = ['faith-3', '3-gems', 'rummy', 'spades', 'five-dice', 'dominoes'] as const;
export type StorePayment = 'game' | 'cash';
export interface EconomyWallet {
  points: number; f3_points: number; gems_points: number; rummy_points: number; spades_points: number; dice_points: number; domino_points: number; lifetime_points: number;
  owned: string[]; equipped: Record<string, string>; pending_perks: Record<string, number>;
}
export type AchievementGroup = PointGame | 'farkle' | 'crown-court' | 'crown-chance' | 'backgammon' | 'carrom' | 'crazy-eights' | 'hearts' | 'clubhouse';
export interface AchievementDefinition {
  id: string; name: string; description: string; group: AchievementGroup; icon: string; tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  stat: keyof EconomyStats; goal: number; reward: number; currency: Currency; cashReward: number;
}
export interface AchievementView extends AchievementDefinition { progress: number; unlocked: boolean; claimed: boolean; claimedAt: number | null }
export interface EconomyStats {
  faithLevels: number; faithChapters: number; gemsLevels: number; gemsStars: number; gemsChapters: number;
  rummyWins: number; rummyHumanWins: number; rummyHardWins: number; spadesWins: number; spadesHumanWins: number; spadesHardWins: number; diceWins: number; diceHumanWins: number; diceHardWins: number; dominoWins: number; dominoHumanWins: number; dominoHardWins: number;
  farkleWins: number; farkleHumanWins: number; farkleHardWins: number; crownWins: number; crownHumanWins: number; crownHardWins: number;
  eightsWins: number; eightsHumanWins: number; heartsWins: number; heartsHumanWins: number;
  chanceWins:number; chanceHumanWins:number; chanceHardWins:number;
  carromWins:number;carromHumanWins:number;carromHardWins:number;backgammonWins:number;backgammonHumanWins:number;backgammonHardWins:number;
  lifetime: number; cosmetics: number; friends: number; memberDays: number; visits: number; profileComplete: number; gamesPlayed: number;
}
export interface EconomyHistory {
  id: string; source: string; kind: 'reward' | 'achievement' | 'conversion' | 'purchase' | 'legacy';
  label: string; currency: Currency; amount: number; cash: number; createdAt: number;
}
export interface PuzzleProgress { levels: number[]; stars: Record<string, number>; unlocked: number }
export interface EconomyView {
  rewardCrates?: Record<RewardCrateCollection,DiceCrateView>; diceCrates?: DiceCrateView; wallet: EconomyWallet; sources: string[]; humanWinSources: string[]; stats: EconomyStats; achievements: AchievementView[];
  history: EconomyHistory[]; progress: { 'faith-3': PuzzleProgress; '3-gems': PuzzleProgress }; conversionRate: typeof CONVERSION_RATE;
}
export interface EconomyReceipt {
  type: 'conversion' | 'achievement' | 'purchase' | 'equip' | 'check_in' | 'dice_crate'; alreadyApplied: boolean;
  crate?: DiceCrateReward; amount?: number; cash?: number; currency?: Currency; itemId?: string; achievementId?: string;
}
export type EconomyCommand =
 | {operation:'buy_fragments';itemId:string;count:number;payment:StorePayment;requestId:string;game?:'rummy'|'spades';expectedPrice?:number}
  | { operation: 'convert'; game: PointGame; amount: number; requestId: string }
  | { operation: 'claim_achievement'; achievementId: string }
  | { operation: 'purchase'; itemId: string; payment?: StorePayment; game?: PointGame }
  | { operation: 'equip'; slot: string; itemId: string }
  | { operation: 'check_in' }
  | { operation: 'open_dice_crate'; crateId: string }
  | {operation:'open_reward_crate';collection:RewardCrateCollection;crateId:string};
export interface EconomyCommandResult extends EconomyView { ok: true; receipt: EconomyReceipt }
export interface EconomyCatalogItem { id: string; name: string; price: number; currency: Currency; slot: string | null; cashPrice: number }
export function storePointSources(item: EconomyCatalogItem): readonly PointGame[] {
  if (isProfileFrameItem(item.id)) return POINT_GAMES;
  return isSharedTable(item) || item.slot === 'card_deck' ? ['rummy', 'spades'] : [];
}

export const isSharedTable = (item: EconomyCatalogItem) => item.slot === 'rummy_table' || item.slot === 'spades_table';

export function fragmentPrice(item: EconomyCatalogItem, payment: StorePayment, collected: number) {
  const fullPrice = payment === 'cash' ? item.cashPrice : item.price;
  const totalFor = (count: number) => Math.ceil(fullPrice * count / DICE_FRAGMENTS_REQUIRED);
  return totalFor(collected + 1) - totalFor(collected);
}

const primaryCatalog: Omit<EconomyCatalogItem, 'cashPrice'>[] = [
 ...POKER_DICE_SETS.map(item=>({id:item.id,name:item.name,price:item.price,slot:POKER_DICE_SLOT,currency:'dice_points' as const})),
 ...CARROM_MANDALA_BUNDLES.map(item=>({id:item.id,name:item.name,price:item.price,currency:item.currency,slot:null})),
 ...CARROM_COLLECTIBLES.map(item=>({id:item.id,name:item.name,price:item.price,slot:item.slot,currency:'dice_points' as const})),
 ...BG_COLLECTIBLES.map(d=>({id:d.id,name:d.name,price:d.price,currency:'dice_points' as const,slot:d.slot})),
  ...NAUTICAL_BUNDLES.map(item=>({id:item.id,name:item.name,price:NAUTICAL_BUNDLE_PRICE,currency:item.currency,slot:null})),
  ...DOMINO_SKINS.map(item=>({id:item.id,name:item.name+' Dominoes',price:item.price,currency:'domino_points' as const,slot:DOMINO_SKIN_SLOT})),
  ...FARKLE_DICE_SETS.map(item => ({id:item.id,name:item.name,price:item.price,currency:'dice_points' as const,slot:FARKLE_DICE_SLOT})),
  ...PROFILE_IMAGE_SHAPES.map(shape => ({ id: profileFrameItem(shape), name: `${profileFrameName(shape)} custom image frame`, price: 100, currency: 'rummy_points' as const, slot: null })),
  { id:'farkle-party',name:'Farkle Party Tables',price:600,currency:'dice_points',slot:null },
  { id: 'five-dice-party', name: 'Quintsee Party Tables', price: 600, currency: 'dice_points', slot: null },
  { id: 'rummy-jokers', name: 'Joker Mode', price: 400, currency: 'rummy_points', slot: null },
  { id: 'spades-partnerships', name: 'Spades Partnerships', price: 400, currency: 'spades_points', slot: null },
  ...RUMMY_DESIGNS.filter(item => item.slot === 'table' && item.id.startsWith('rummy-') && (item.wins > 0 || item.purchaseOnly)).map(item => ({ id: item.id, name: item.name, price: item.slot === 'table' ? 100 : item.price ?? 300, currency: 'rummy_points' as const, slot: `rummy_${item.slot}` })),
  ...FAITH_SKINS.map(item => ({ id: item.id, name: item.name, price: item.price, currency: 'points' as const, slot: 'faith3_skin' })),
  ...SPADES_VENUES.filter(item => item.id.startsWith('spades-')).map(item => ({ id: item.id, name: item.name, price: 100, currency: 'spades_points' as const, slot: 'spades_table' })),
  ...SHARED_DECKS.map(item => ({ id: item.id, name: item.name, price: item.price, currency: 'rummy_points' as const, slot: 'card_deck' })),
];
export const increasedStorePrice = (price: number) => Math.ceil(price * 1.25);

export const ECONOMY_CATALOG: EconomyCatalogItem[] = primaryCatalog.map(item => ({
  ...item,
  price: increasedStorePrice(item.price),
  cashPrice: increasedStorePrice(item.currency === 'points' ? item.price : cashPriceFor(item.price)),
}));
/** First clears grow more valuable at each chapter. Replays never repeat a reward. */
