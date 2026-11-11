import type { SupabaseClient } from '@supabase/supabase-js';
import { RummyError } from '../src/lib/rummy-protocol';
import type { EconomyWallet } from '../src/lib/economy-protocol';
import type { EconomyStore } from './economy';
import type { Identity } from './rooms';

type MemberClient = SupabaseClient<any>;
const unavailable = () => new RummyError('Your existing reward wallet could not be synchronized. Please refresh and try again. Your balances have not been reset.', 503, 'wallet_unavailable');
// Select the legacy row so projects predating Spades do not need a new SQL
// column just to migrate. Only the whitelisted fields below enter the wallet.
const walletColumns = '*';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function legacyWallet(value: unknown): EconomyWallet {
  if (!object(value)) throw unavailable();
  for (const key of ['points', 'f3_points', 'rummy_points', 'lifetime_points']) {
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0) throw unavailable();
  }
  if (value.spades_points !== undefined && (!Number.isSafeInteger(value.spades_points) || Number(value.spades_points) < 0)) throw unavailable();
  if (!Array.isArray(value.owned) || !value.owned.every(id => typeof id === 'string') || !object(value.equipped) || !object(value.pending_perks)) throw unavailable();
  if (!Object.values(value.equipped).every(id => typeof id === 'string') || !Object.values(value.pending_perks).every(n => Number.isSafeInteger(n) && Number(n) >= 0)) throw unavailable();
  return { points: Number(value.points), f3_points: Number(value.f3_points), rummy_points: Number(value.rummy_points), spades_points: Number(value.spades_points ?? 0), gems_points: 0, dice_points: 0, domino_points: 0,
    lifetime_points: Number(value.lifetime_points), owned: [...value.owned].sort(),
    equipped: Object.fromEntries(Object.entries(value.equipped).sort(([a], [b]) => a.localeCompare(b))) as Record<string, string>,
    pending_perks: Object.fromEntries(Object.entries(value.pending_perks).sort(([a], [b]) => a.localeCompare(b))) as Record<string, number> };
}

/** A stable, server-read snapshot prevents importing an old award without its balance,
 * or a new balance without its deduplication source. No client snapshot is accepted. */
export async function loadLegacySnapshot(client: MemberClient, userId: string) {
  async function wallet() {
    const result = await client.from('wallets').select(walletColumns).eq('user_id', userId).abortSignal(AbortSignal.timeout(8000)).maybeSingle();
    if (result.error) throw unavailable();
    return legacyWallet(result.data);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await wallet();
    const awards: { source: string; amount: number; rummy_tier: string | null; created_at?: string }[] = [];
    let complete = false;
    for (let offset = 0; offset < 50000; offset += 500) {
      const result = await client.from('point_awards').select('*').eq('user_id', userId).order('id').range(offset, offset + 499).abortSignal(AbortSignal.timeout(8000));
      if (result.error || !Array.isArray(result.data)) throw unavailable();
      for (const row of result.data as unknown[]) {
        if (!object(row) || typeof row.source !== 'string' || !Number.isSafeInteger(row.amount) || Number(row.amount) < 0) throw unavailable();
        awards.push({ source: row.source, amount: Number(row.amount), rummy_tier: typeof row.rummy_tier === 'string' ? row.rummy_tier : null, ...(typeof row.created_at === 'string' ? { created_at: row.created_at } : {}) });
      }
      if (result.data.length < 500) { complete = true; break; }
    }
    if (!complete) throw unavailable();
    const after = await wallet();
    if (JSON.stringify(before) === JSON.stringify(after)) return { wallet: after, awards };
  }
  throw unavailable();
}

/** Supabase verifies identity; the Sites wallet becomes authoritative after import. */
export async function canonicalMemberIdentity(economy: EconomyStore, client: MemberClient, userId: string, nameFlagged: boolean, joinedAt?: string): Promise<Identity> {
  const actor: Identity = { principal: `member:${userId}`, jokers: false, owned: [], nameFlagged };
  if (!await economy.hasMember(actor)) await economy.ensureMember(actor, { ...await loadLegacySnapshot(client, userId), joinedAt });
  if (await economy.hasPendingAllowance(actor)) await economy.read(actor);
  const wallet = await economy.ensureMember(actor);
  return { ...actor, owned: wallet.owned, jokers: wallet.owned.includes('rummy-jokers') };
}
