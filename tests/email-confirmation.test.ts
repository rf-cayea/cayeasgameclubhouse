import { describe, expect, it, vi } from 'vitest';
import { authErrorMessage, completeEmailConfirmation, emailConfirmationUrl, readEmailReturn } from '../src/lib/email-confirmation';
function client() { return { auth: {
  getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'member@example.invalid', email_confirmed_at: '2026-11-02T12:00:00Z' } }, error: null }),
  verifyOtp: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
  exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
} }; }
describe('email confirmation returns', () => {
  it('uses the running Site origin and a fixed confirmation path', () => {
    expect(emailConfirmationUrl('https://clubhouse.example')).toBe('https://clubhouse.example/auth/confirm');
  });
  it('supports token-hash confirmation and verifies the signed-in identity', async () => {
    const sdk = client();
    await expect(completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm?token_hash=example&type=email'))).resolves.toEqual({ email: 'member@example.invalid' });
    expect(sdk.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'example', type: 'email' });
    expect(sdk.auth.getUser).toHaveBeenCalledOnce();
  });
  it('accepts an implicit session already consumed by the SDK', async () => {
    const sdk = client(); sdk.auth.getSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
    await completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm'));
    expect(sdk.auth.exchangeCodeForSession).not.toHaveBeenCalled(); expect(sdk.auth.getUser).toHaveBeenCalledOnce();
  });
  it('verifies an incoming token instead of claiming success from an unrelated existing session', async () => {
    const sdk = client(); sdk.auth.getSession.mockResolvedValue({ data: { session: { user: {} } }, error: null });
    sdk.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: 'otp_expired' } });
    await expect(completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm?token_hash=expired&type=email'))).rejects.toMatchObject({ code: 'otp_expired' });
    expect(sdk.auth.getUser).not.toHaveBeenCalled();
  });
  it('exchanges a PKCE code when it has not already produced a session', async () => {
    const sdk = client(); await completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm?code=example'));
    expect(sdk.auth.exchangeCodeForSession).toHaveBeenCalledWith('example');
  });
  it('reports expired links from fragments without displaying untrusted descriptions', async () => {
    const sdk = client();
    await expect(completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm#error=access_denied&error_code=otp_expired&error_description=untrusted'))).rejects.toThrow('expired or was already used');
    expect(sdk.auth.verifyOtp).not.toHaveBeenCalled(); expect(sdk.auth.getSession).not.toHaveBeenCalled();
  });
  it('does not mark a bare return or unsupported OTP type as confirmed', async () => {
    const sdk = client(); await expect(completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm'))).rejects.toThrow('latest confirmation link');
    await expect(completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm?token_hash=example&type=recovery'))).rejects.toThrow('not an email confirmation');
    expect(sdk.auth.verifyOtp).not.toHaveBeenCalled();
  });
  it('requires the server to verify the identity even when a session is present', async () => {
    const sdk = client(); sdk.auth.getSession.mockResolvedValue({ data: { session: {} }, error: null });
    sdk.auth.getUser.mockResolvedValue({ data: { user: null }, error: { code: 'bad_jwt', message: 'Invalid session.' } });
    await expect(completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm'))).rejects.toMatchObject({ code: 'bad_jwt' });
  });
  it('distinguishes pending confirmation, mail authorization and email rate limits', () => {
    expect(authErrorMessage({ code: 'email_not_confirmed' })).toContain('not confirmed');
    expect(authErrorMessage({ code: 'email_address_not_authorized' })).toContain('cannot send to this address');
    expect(authErrorMessage({ code: 'over_email_send_rate_limit' })).toContain('sending limit');
  });
  it('does not call an unconfirmed account confirmed just because a session exists', async () => {
    const sdk = client(); sdk.auth.getSession.mockResolvedValue({ data: { session: {} }, error: null });
    sdk.auth.getUser.mockResolvedValue({ data: { user: { email: 'member@example.invalid' } }, error: null });
    await expect(completeEmailConfirmation(sdk, readEmailReturn('https://clubhouse.example/auth/confirm'))).rejects.toThrow('not confirmed yet');
  });
});
