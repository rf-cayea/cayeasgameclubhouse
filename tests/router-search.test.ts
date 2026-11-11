import { describe, expect, it } from 'vitest';
import { defaultStringifySearch } from '@tanstack/react-router';
import { parseClubhouseSearch } from '../src/lib/router-search';
describe('opaque room codes in invitations', () => {
  it.each(['12345678', '00001234', '1e234567', '1e000012', 'ABCDEF12', 'deadbeef'])('preserves %s through plain URLs and router round trips', room => {
    expect(parseClubhouseSearch(`?room=${room}`).room).toBe(room);
    expect(parseClubhouseSearch(defaultStringifySearch({ room })).room).toBe(room);
  });
  it('retains normal numeric preferences and does not coerce duplicate codes into a valid invitation', () => {
    expect(parseClubhouseSearch('?target=10000&room=12345678&game=farkle')).toEqual({ target: 10000, room: '12345678', game: 'farkle' });
    expect(parseClubhouseSearch('?room=12345678&room=ABCDEF12').room).toBeInstanceOf(Array);
  });
});
