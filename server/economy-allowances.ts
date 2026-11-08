import { createClient } from '@supabase/supabase-js';
import { EconomyStore } from './economy';
import { loadLegacySnapshot } from './economy-members';
import type { D1Binding } from './database';

/** Settle only allowances already authorized in the trusted database. This is
 * not a minting API: visitors cannot supply a player, balance, or grant amount. */
export async function settleCashAllowances(env: { DB: D1Binding; SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string; SUPABASE_SERVICE_ROLE_KEY?: string; CLUBHOUSE_REWARD_KEY?: string }) {
  const economy = new EconomyStore(env.DB);
  const pending = await economy.pendingAllowances();
  if (!pending.length) return;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.CLUBHOUSE_REWARD_KEY;
  const client = env.SUPABASE_URL && key ? createClient(env.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(8000) }) } }) : null;
  for (const allowance of pending) {
    const actor = { principal: `member:${allowance.userId}` };
    try {
      if (!await economy.hasMember(actor)) {
        if (!client) continue; // The member can also claim it through their verified sign-in.
        const identity = await client.auth.admin.getUserById(allowance.userId);
        if (identity.error || identity.data.user?.id !== allowance.userId) continue;
        const legacy = await loadLegacySnapshot(client, allowance.userId);
        await economy.ensureMember(actor, { ...legacy, joinedAt: identity.data.user.created_at });
      }
      await economy.read(actor);
    } catch { console.error('An authorized tester allowance is waiting for wallet synchronization.'); }
  }
}
