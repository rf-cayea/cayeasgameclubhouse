import { describe, expect, it } from 'vitest';
import { serviceErrorDetails } from '../server/service-error';
describe('safe production diagnostics', () => {
  it('retains nested database failures that identify the failing query', () => {
    expect(serviceErrorDetails(new Error('D1_ERROR: statement failed', { cause: new Error('no such column: pending_claim') })))
      .toContain('no such column: pending_claim');
  });
  it('redacts tokens, keys, account identifiers, email addresses, and request URLs', () => {
    const message = serviceErrorDetails(new Error('Bearer private-session-token sb_secret_privatevalue eyJheader.eyJbody.signature 11111111-1111-4111-8111-111111111111 player@example.test https://auth.test/callback?token=private'));
    for (const secret of ['private-session-token','sb_secret_privatevalue','eyJheader','11111111-1111','player@example.test','https://auth.test','token=private']) expect(message).not.toContain(secret);
  });
});
