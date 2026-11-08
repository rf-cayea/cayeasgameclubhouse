/** Web Crypto helpers; identical on Node 24 and in Cloudflare Workers. */

export const secureRandom = (): number => {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! / 0x100000000;
};

export const randomHex = (bytes: number): string => {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const uuid = (): string => crypto.randomUUID();

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
