import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: null }));
import { BADGES, cashFor, GAME_POINTS, levelPoints } from '../src/lib/clubhouse';
import { describeActivity } from '../src/lib/social';

describe('supplied Clubhouse reward rules', () => {
  it('increases first-clear points at the documented 20-level boundaries', () => {
    expect([1, 20, 21, 40, 41, 280].map(levelPoints)).toEqual([12, 12, 15, 15, 17, 45]);
  });

  it('converts 13 points to 10 Cash for a 30 percent per-unit premium', () => {
    expect([0, 12, 13, 25, 26, 130].map(cashFor)).toEqual([0, 0, 10, 10, 20, 100]);
  });

  it('covers all six point currencies and all twelve achievement groups', () => {
    expect(Object.keys(GAME_POINTS).sort()).toEqual(['3-gems', 'dominoes', 'faith-3', 'five-dice', 'rummy', 'spades']);
    expect([...new Set(BADGES.map(badge => badge.group))].sort()).toEqual(['3-gems', 'backgammon', 'carrom', 'clubhouse', 'crown-chance', 'crown-court', 'dominoes', 'faith-3', 'farkle', 'five-dice', 'rummy', 'spades']);
    expect(new Set(BADGES.map(badge => badge.id)).size).toBe(BADGES.length);
    expect(BADGES.every(badge => Number.isSafeInteger(badge.reward) && badge.reward > 0)).toBe(true);
  });

  it('makes mastery milestones worth more than entry achievements', () => {
    for (const group of ['faith-3', '3-gems', 'rummy', 'spades', 'clubhouse']) {
      const awards = BADGES.filter(badge => badge.group === group);
      expect(Math.max(...awards.map(badge => badge.reward))).toBeGreaterThanOrEqual(group==='clubhouse'?100:1000);
      expect(awards.some(badge => badge.tier === 'bronze')).toBe(true);
    }
  });
});

describe('activity descriptions', () => {
  it('shows the level and avoids exposing unknown source identifiers', () => {
    expect(describeActivity('faith3:level:12')).toBe('cleared Faith 3 level 12');
    expect(describeActivity('rummy:win:round-42')).toBe('won a Rummy+ game');
    expect(describeActivity('unknown:internal-id')).toBe('earned Clubhouse points');
  });
});
