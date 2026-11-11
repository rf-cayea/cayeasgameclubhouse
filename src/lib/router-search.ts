import { defaultParseSearch } from '@tanstack/react-router';

/** Room codes are opaque hex strings, including digits and scientific-looking codes. */
export function parseClubhouseSearch(search: string) {
  const parsed = defaultParseSearch(search) as Record<string, unknown>, codes = new URLSearchParams(search).getAll('room');
  if (codes.length === 1 && /^[a-f0-9]{8}$/i.test(codes[0]!)) parsed.room = codes[0];
  return parsed;
}
