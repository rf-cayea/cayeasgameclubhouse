import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();
let validUrl = false;
try { validUrl = Boolean(url && new URL(url).protocol === 'https:'); } catch { /* Show configuration message below. */ }

export const configurationError = !url || !key
  ? 'Member features are not connected yet. Add the Supabase project URL and public key to enable accounts, wallets, and the lounge.'
  : !validUrl ? 'The Supabase project URL must be a valid HTTPS URL.' : null;

export const supabase = configurationError ? null : createClient(url!, key!);
