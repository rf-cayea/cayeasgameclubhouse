import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: null }));
import { awardPoints, BADGES, cashFor, hubStats, levelPoints } from '../src/lib/clubhouse';
import { describeActivity } from '../src/lib/social';

describe('supplied Clubhouse reward rules', () => {
  it('increases first-clear points at the documented 20-level boundaries', () => {
    expect([1, 19, 20, 39, 40, 280].map(levelPoints)).toEqual([5, 5, 6, 6, 7, 19]);
  });

  it('converts complete groups of ten points at 70 percent', () => {
    expect([0, 9, 10, 19, 20, 100].map(cashFor)).toEqual([0, 0, 7, 7, 14, 70]);
  });

  it('counts only matching verified human wins toward multiplayer badges', () => {
    const stats = hubStats(null,
      ['faith3:level:1', 'faith3:ms:starter', 'rummy:win:one', 'rummy:win:two'], [],
      ['rummy:win:one', 'rummy:win:one', 'rummy:win:unverified', 'faith3:level:1']);
    expect(stats).toEqual({ lifetime: 0, cosmetics: 0, f3Levels: 1, f3Milestones: 1, rummyWins: 2, rummyHumanWins: 1 });
  });

  it('keeps badge IDs unique and multiplayer rewards increasing', () => {
    expect(new Set(BADGES.map(badge => badge.id)).size).toBe(BADGES.length);
    const rival = BADGES.filter(badge => badge.stat === 'rummyHumanWins');
    expect(rival.map(badge => badge.goal)).toEqual([1, 3, 5, 10, 15, 25, 40, 60, 80, 100, 150, 200]);
    expect(rival.every(badge => badge.points > 0)).toBe(true);
  });

  it('does not report an award success when no backend is connected', async () => {
    expect(await awardPoints('faith3:level:1', 5)).toBe(false);
  });
});

describe('activity descriptions', () => {
  it('shows the level and avoids exposing unknown source identifiers', () => {
    expect(describeActivity('faith3:level:12')).toBe('cleared Faith 3 level 12');
    expect(describeActivity('rummy:win:round-42')).toBe('won a Rummy+ game');
    expect(describeActivity('unknown:internal-id')).toBe('earned Clubhouse points');
  });
});
