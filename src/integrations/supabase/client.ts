import { createClient } from '@supabase/supabase-js';

interface RuntimeConfig { supabaseUrl?: string; supabaseKey?: string }
declare global { interface Window { __CLUBHOUSE_CONFIG__?: RuntimeConfig } }

// A hosted deployment can supply these at runtime through /clubhouse-config.js,
// so one build works anywhere; values inlined at build time still take over when
// the runtime file is absent.
const runtime = typeof window === 'undefined' ? undefined : window.__CLUBHOUSE_CONFIG__;
const url = (runtime?.supabaseUrl || import.meta.env.VITE_SUPABASE_URL)?.trim();
const key = (runtime?.supabaseKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();
let validUrl = false;
try { validUrl = Boolean(url && new URL(url).protocol === 'https:'); } catch { /* Show configuration message below. */ }

export const configurationError = !url || !key
  ? 'Member features are not connected yet. Add the Supabase project URL and public key to enable accounts, wallets, and the lounge.'
  : !validUrl ? 'The Supabase project URL must be a valid HTTPS URL.' : null;

export const supabase = configurationError ? null : createClient(url!, key!);
