/** Capture return errors before the auth SDK consumes or cleans the URL. */
export function readEmailReturn(href: string) {
  const url = new URL(href), fragment = new URLSearchParams(url.hash.slice(1));
  const value = (key: string) => url.searchParams.get(key) || fragment.get(key);
  return { hasRecoveryToken: fragment.get('type')==='recovery'&&Boolean(fragment.get('access_token')), code: value('code'), tokenHash: value('token_hash'), type: value('type'), errorCode: value('error_code') || value('error') };
}
export const incomingEmailReturn = typeof window === 'undefined' ? null : readEmailReturn(window.location.href);
export function emailConfirmationUrl(origin = window.location.origin) { return new URL('/auth/confirm', origin).href; }
export function authErrorMessage(cause: unknown) {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
  if (code === 'email_address_not_authorized') return 'The Clubhouse email service cannot send to this address yet. Please contact the site owner.';
  if (code === 'over_email_send_rate_limit') return 'The email service has reached its sending limit. Please try again later.';
  if (code === 'over_request_rate_limit') return 'Too many attempts. Please wait before trying again.';
  if (code === 'email_not_confirmed') return 'Your email is not confirmed yet. Open the newest confirmation email or request another link below.';
  if (['otp_expired', 'access_denied', 'flow_state_expired', 'flow_state_not_found'].includes(code)) return 'This confirmation link has expired or was already used. Request a new email, or sign in if you already confirmed.';
  if (['bad_code_verifier', 'code_verifier_not_found'].includes(code)) return 'Open the confirmation link in the browser where you signed up, or request a new email.';
  return cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : 'Could not complete your request. Please try again.';
}
interface ConfirmationClient {
  auth: {
    getSession(): Promise<{ data: { session: unknown }; error: unknown }>;
    getUser(): Promise<{ data: { user: { email?: string; email_confirmed_at?: string } | null }; error: unknown }>;
    verifyOtp(input: { token_hash: string; type: 'email' | 'signup' }): Promise<{ data: { session: unknown }; error: unknown }>;
    exchangeCodeForSession(code: string): Promise<{ data: { session: unknown }; error: unknown }>;
  };
}
export async function completeEmailConfirmation(client: ConfirmationClient, incoming: ReturnType<typeof readEmailReturn>) {
  if (incoming.errorCode) throw new Error(authErrorMessage({ code: incoming.errorCode, message: 'The confirmation link could not be completed. Request a new confirmation email.' }));
  if (incoming.type && incoming.type !== 'email' && incoming.type !== 'signup') throw new Error('This link is not an email confirmation link. Request a new confirmation email.');
  // The client uses implicit URL processing. Wait for it before checking the
  // session; token hashes and PKCE codes are handled explicitly here.
  let result = await client.auth.getSession();
  if (result.error) throw result.error;
  if (incoming.tokenHash) {
    if (incoming.type !== 'email' && incoming.type !== 'signup') throw new Error('This link is not an email confirmation link. Request a new confirmation email.');
    result = await client.auth.verifyOtp({ token_hash: incoming.tokenHash, type: incoming.type });
  } else if (incoming.code) {
    result = await client.auth.exchangeCodeForSession(incoming.code);
  }
  if (result.error) throw result.error;
  if (!result.data.session) throw new Error('Open the latest confirmation link from your inbox. If you already confirmed, return to sign in.');
  const identity = await client.auth.getUser();
  if (identity.error) throw identity.error;
  if (!identity.data.user) throw new Error('Your sign-in could not be verified. Please sign in again.');
  if (!identity.data.user.email_confirmed_at) throw new Error(authErrorMessage({ code: 'email_not_confirmed' }));
  return { email: identity.data.user.email ?? '' };
}
export function clearEmailReturnUrl() {
  // Never retain access tokens, refresh tokens or confirmation codes in the URL.
  window.history.replaceState(window.history.state, '', '/auth/confirm');
}
