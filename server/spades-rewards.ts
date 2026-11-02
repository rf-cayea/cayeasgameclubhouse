import { createClient } from '@supabase/supabase-js';
import type { SpadesMatchReward, SpadesReceipt } from '../src/lib/spades-rewards';
export interface SpadesRewardWriter { configured: () => boolean; deliver: (result: SpadesMatchReward) => Promise<SpadesReceipt> }
export function supabaseSpadesWriter(): SpadesRewardWriter {
  const config = () => ({ url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key: process.env.CLUBHOUSE_REWARD_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY });
  return { configured: () => Boolean(config().url && config().key), deliver: async result => {
    const { url, key } = config(); if (!url || !key) throw new Error('reward_unconfigured');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.rpc('credit_spades_match', { _result: result }).abortSignal(AbortSignal.timeout(15000));
    if (error) throw new Error('reward_sync_failed'); return data as SpadesReceipt;
  } };
}
