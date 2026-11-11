import { isSharedDeck } from './playing-decks';
import { isProfileFrameItem } from './profile-image';
import { economyRequest } from './economy-api';
import { ECONOMY_CATALOG, POINT_FIELDS, type Currency, type EconomyCatalogItem, type EconomyCommandResult, type EconomyWallet, type StorePayment, type PointGame } from './economy-protocol';
import { SPADES_PARTNERSHIPS } from './spades-perks';

export const JOKER_MODE = ECONOMY_CATALOG.find(item => item.id === 'rummy-jokers')!;
export interface StoreItem { id: string; name: string; price: number; currency: 'rummy_points'; cashPrice: number }
export interface Purchase { item_id: string; owned: boolean; already_owned: boolean; balance: number; currency: Currency; price: number }
const currencies = new Set<string>(['points', ...Object.values(POINT_FIELDS)]);
const confirmedWallet = (wallet: EconomyWallet | null | undefined) => Boolean(wallet &&
  ['points', ...Object.values(POINT_FIELDS), 'lifetime_points'].every(field => Number.isSafeInteger(wallet[field as keyof EconomyWallet]) && Number(wallet[field as keyof EconomyWallet]) >= 0) &&
  Array.isArray(wallet.owned) && wallet.owned.every(id => typeof id === 'string') &&
  wallet.equipped && typeof wallet.equipped === 'object' && !Array.isArray(wallet.equipped) &&
  wallet.pending_perks && typeof wallet.pending_perks === 'object' && !Array.isArray(wallet.pending_perks));


/** Catalog browsing is public. Purchases always use the verified member API. */
export async function loadEconomyCatalog(): Promise<EconomyCatalogItem[]> {
  const response = await fetch('/api/economy/catalog', { credentials: 'same-origin', signal: AbortSignal.timeout(12000) });
  let data: unknown;
  try { data = await response.json(); } catch { throw new Error('Store prices are unavailable. Please try again.'); }
  if (!response.ok || !data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)) throw new Error('Store prices are unavailable. Please try again.');
  const seen = new Set<string>();
  for (const item of data.items) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || seen.has(item.id) || typeof item.name !== 'string' || !Number.isSafeInteger(item.price) || item.price < 0 || !currencies.has(item.currency) || !Number.isSafeInteger(item.cashPrice) || item.cashPrice < 0 || (item.slot !== null && typeof item.slot !== 'string')) throw new Error('Store prices could not be verified. Please refresh the catalog.');
    seen.add(item.id);
  }
  return data.items as EconomyCatalogItem[];
}

export async function purchaseStoreItem(itemId: string, expectedUserId?: string, payment: StorePayment = 'game', game?: PointGame): Promise<Purchase> {
  const item = ECONOMY_CATALOG.find(value => value.id === itemId);
  if (!item) throw new Error('Choose an available store item.');
  if (game && isSharedDeck(itemId) && !['rummy', 'spades'].includes(game)) throw new Error('Use Rummy+ or Spades points for a shared deck.');
  // The server chooses the price and spends the balance once, including retries.
  const data = await economyRequest<EconomyCommandResult>({ operation: 'purchase', itemId, payment, ...(game && (isProfileFrameItem(itemId) || isSharedDeck(itemId)) && payment === 'game' ? { game } : {}) }, expectedUserId);
  const currency = payment === 'cash' ? 'points' : (isProfileFrameItem(itemId) || isSharedDeck(itemId)) && game ? POINT_FIELDS[game] : item.currency, price = payment === 'cash' ? item.cashPrice : item.price;
  const receipt = data.receipt, balance = data.wallet?.[currency];
  if (data.ok !== true || receipt?.type !== 'purchase' || receipt.itemId !== itemId || typeof receipt.alreadyApplied !== 'boolean' || receipt.currency !== currency || receipt.amount !== price || !data.wallet?.owned?.includes(itemId) || !Number.isSafeInteger(balance) || balance < 0) throw new Error('The purchase could not be confirmed. Refresh your wallet before trying again.');
  return { item_id: itemId, owned: true, already_owned: receipt.alreadyApplied, balance, currency, price };
}

export async function equipStoreItem(slot: string, itemId: string, expectedUserId?: string) {
  const data = await economyRequest<EconomyCommandResult>({ operation: 'equip', slot, itemId }, expectedUserId);
  if (data.ok !== true || data.receipt?.type !== 'equip' || data.receipt.itemId !== itemId || !confirmedWallet(data.wallet) || data.wallet?.equipped?.[slot] !== itemId || (ECONOMY_CATALOG.some(item => item.id === itemId) && !data.wallet.owned.includes(itemId))) throw new Error('The design change could not be confirmed. Refresh your collection.');
  return { item_id: itemId, slot, wallet: data.wallet };
}

export async function loadJokerMode(): Promise<StoreItem> {
  const item = (await loadEconomyCatalog()).find(item => item.id === JOKER_MODE.id);
  if (!item || item.currency !== JOKER_MODE.currency || item.price !== JOKER_MODE.price) throw new Error('The Joker Mode catalog entry is unavailable.');
  return item as StoreItem;
}
export async function purchaseJokerMode(expectedUserId?: string): Promise<Purchase> { return purchaseStoreItem(JOKER_MODE.id, expectedUserId); }

export async function loadSpadesPartnerships() {
  const item = (await loadEconomyCatalog()).find(item => item.id === SPADES_PARTNERSHIPS.id);
  if (!item || item.currency !== SPADES_PARTNERSHIPS.currency || item.price !== SPADES_PARTNERSHIPS.price) throw new Error('The Spades Partnerships catalog entry is unavailable.');
  return SPADES_PARTNERSHIPS;
}
export async function purchaseSpadesPartnerships(expectedUserId?: string): Promise<{ already_owned: boolean; balance: number }> {
  const result = await purchaseStoreItem(SPADES_PARTNERSHIPS.id, expectedUserId);
  return { already_owned: result.already_owned, balance: result.balance };
}
