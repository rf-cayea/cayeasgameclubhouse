import { createClient } from '@supabase/supabase-js';
import { RummyError } from '../src/lib/rummy-protocol';
import type { Identity } from './rooms';

/** Rules shared by the Node server and the Cloudflare Worker. */
export interface MemberConfig { url?: string; key?: string }

export async function verifyMemberToken(token: string, config: MemberConfig): Promise<Identity> {
  if (!config.url || !config.key) throw new RummyError('Member verification is not configured on the game server. Sign out to play as a guest, or configure the server’s Supabase project.', 503, 'auth_unavailable');
  const client = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new RummyError('Your sign-in expired. Sign in again.', 401, 'unauthorized');
  const wallet = await client.from('wallets').select('owned').eq('user_id', data.user.id).maybeSingle();
  if (wallet.error) throw new RummyError('Could not verify Joker ownership. Please try again.', 503, 'auth_unavailable');
  return { principal: `member:${data.user.id}`, jokers: Array.isArray(wallet.data?.owned) && wallet.data.owned.includes('rummy-jokers'), owned: Array.isArray(wallet.data?.owned) ? wallet.data.owned : [] };
}

/** Rejects cross-site writes. Host-based defaults keep localhost and codespaces working. */
export function assertSameOrigin(origin: string | null, allowed: string[]): void {
  if (!origin) return;
  if (!allowed.includes(origin)) throw new RummyError('Cross-site game commands are not allowed.', 403);
}

export function originList(host: string | null, configured?: string, extra: string[] = []): string[] {
  if (configured) return [configured];
  const hosts = host ? [`http://${host}`, `https://${host}`] : [];
  return [...new Set([...hosts, ...extra])];
}

export function guestCookie(cookie: string, secure: boolean): string {
  return `cayea_rummy=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? '; Secure' : ''}`;
}

export function parseCommand(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new RummyError('Send a valid JSON command.'); }
}
