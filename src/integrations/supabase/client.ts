import { createClient } from '@supabase/supabase-js';
import { incomingPasswordReturn } from '@/lib/password-reset';
void incomingPasswordReturn;
import { incomingEmailReturn } from '@/lib/email-confirmation';
// Read the inbound return before constructing the SDK, which may consume it.
void incomingEmailReturn;

declare global { interface Window { __CLUBHOUSE_CONFIG__?: { supabaseUrl?: string; supabaseKey?: string } } }
const runtime = typeof window === 'undefined' ? undefined : window.__CLUBHOUSE_CONFIG__;
const url = (runtime?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL)?.trim();
const key = (runtime?.supabaseKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();
let validUrl = false;
try { validUrl = Boolean(url && new URL(url).protocol === 'https:'); } catch { /* Show configuration message below. */ }

export const configurationError = !url || !key
  ? 'Member features are not connected yet. Add the Supabase project URL and public key to enable accounts, wallets, and the lounge.'
  : !validUrl ? 'The Supabase project URL must be a valid HTTPS URL.' : null;

// Email callbacks rely on the SDK consuming implicit tokens while our return
// handler explicitly exchanges token hashes or codes once.
export const supabase = configurationError ? null : createClient(url!, key!, { auth: { flowType: 'implicit' } });
