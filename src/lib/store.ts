import { supabase } from '@/integrations/supabase/client';
import { SPADES_PARTNERSHIPS } from './spades-perks';

export const JOKER_MODE = { id: 'rummy-jokers', name: 'Joker Mode', price: 800, currency: 'rummy_points' } as const;
export interface StoreItem { id: string; name: string; price: number; currency: 'rummy_points' }
export interface Purchase { item_id: string; owned: boolean; already_owned: boolean; balance: number; currency: 'rummy_points'; price: number }

export async function loadJokerMode(): Promise<StoreItem> {
  if (!supabase) throw new Error('The store is not connected yet.');
  const { data, error } = await supabase.from('store_catalog').select('id,name,price,currency').eq('id', JOKER_MODE.id).single();
  if (error) throw error;
  if (!data || data.id !== JOKER_MODE.id || data.currency !== JOKER_MODE.currency || !Number.isSafeInteger(data.price) || data.price < 0) {
    throw new Error('The Joker Mode catalog entry is unavailable.');
  }
  return data as StoreItem;
}

export async function purchaseJokerMode(): Promise<Purchase> {
  if (!supabase) throw new Error('Sign in to a connected Clubhouse to unlock Joker Mode.');
  // The server chooses the catalog price and locks the wallet; no client balance or price is trusted.
  const { data, error } = await supabase.rpc('purchase_store_item', { _item_id: JOKER_MODE.id });
  if (error) throw error;
  if (!data || data.item_id !== JOKER_MODE.id || data.owned !== true) throw new Error('The purchase could not be confirmed. Refresh your wallet before trying again.');
  return data as Purchase;
}

export async function loadSpadesPartnerships() {
  if (!supabase) throw new Error('The store is not connected yet.');
  const { data, error } = await supabase.from('store_catalog').select('id,name,price,currency').eq('id', SPADES_PARTNERSHIPS.id).single();
  if (error) throw error;
  if (!data || data.id !== SPADES_PARTNERSHIPS.id || data.currency !== SPADES_PARTNERSHIPS.currency || data.price !== SPADES_PARTNERSHIPS.price) throw new Error('The Spades Partnerships catalog entry is unavailable.');
  return SPADES_PARTNERSHIPS;
}

export async function purchaseSpadesPartnerships(): Promise<{ already_owned: boolean; balance: number }> {
  if (!supabase) throw new Error('Sign in to unlock Spades Partnerships.');
  const { data, error } = await supabase.rpc('purchase_store_item', { _item_id: SPADES_PARTNERSHIPS.id });
  if (error) throw error;
  if (!data || data.item_id !== SPADES_PARTNERSHIPS.id || data.owned !== true || data.currency !== SPADES_PARTNERSHIPS.currency ||
    data.price !== SPADES_PARTNERSHIPS.price || typeof data.already_owned !== 'boolean' || !Number.isSafeInteger(data.balance) || data.balance < 0) throw new Error('The unlock could not be confirmed. Refresh your wallet before trying again.');
  return { already_owned: data.already_owned, balance: data.balance };
}
