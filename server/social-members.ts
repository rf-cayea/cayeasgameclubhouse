import { createClient } from '@supabase/supabase-js';
import type { Identity } from './rooms';
import type { SocialStore } from './social';

/** Only new member seats use the account name. Existing matches keep snapshots. */
export async function namedGameCommand(social: SocialStore, actor: Identity, command: unknown) {
  if (!actor.principal.startsWith('member:') || !command || typeof command !== 'object' || Array.isArray(command)) return command;
  const value = command as Record<string, unknown>;
  if (value.operation !== 'create' && value.operation !== 'join') return command;
  return { ...value, name: await social.gamerName(actor) };
}

/** Keep legacy lounge names aligned without exposing the server key to clients.
 * A moderation flag wins a concurrent profile edit. Profile persistence is D1. */
export async function mirrorLoungeName(url: string | undefined, key: string | undefined, actor: Identity, gamerName: string) {
  if (!url || !key || !actor.principal.startsWith('member:') || actor.nameFlagged) return;
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.from('profiles').update({ display_name: gamerName }).eq('user_id', actor.principal.slice(7)).eq('name_flagged', false).abortSignal(AbortSignal.timeout(4000));
    if (error) console.error('Lounge name synchronization will retry after the next profile save.');
  } catch { console.error('Lounge name synchronization will retry after the next profile save.'); }
}
