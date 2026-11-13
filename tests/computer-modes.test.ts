import { describe, expect, it } from 'vitest';
import { COMPUTER_OPPONENTS, computerOpponent, levelLabel, rememberComputerLevel, rememberedComputerLevel } from '../src/lib/computer-modes';

const fakeStore = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
};

describe('computer opponents', () => {
  it('covers the nine computer games and leaves the two puzzle campaigns out', () => {
    expect(Object.keys(COMPUTER_OPPONENTS)).toHaveLength(9);
    expect(computerOpponent('five-dice')?.route).toBe('/games/quintsee');
    expect(computerOpponent('3-gems')).toBeNull();
    expect(computerOpponent('faith-3')).toBeNull();
    expect(computerOpponent('not-a-game')).toBeNull();
  });

  it('defaults to normal when nothing is stored', () => {
    expect(rememberedComputerLevel('rummy', 'normal', fakeStore())).toBe('normal');
  });

  it('remembers a difficulty per game without disturbing the others', () => {
    const store = fakeStore();
    rememberComputerLevel('farkle', 'hard', store);
    rememberComputerLevel('spades', 'easy', store);
    expect(rememberedComputerLevel('farkle', 'normal', store)).toBe('hard');
    expect(rememberedComputerLevel('spades', 'normal', store)).toBe('easy');
    expect(rememberedComputerLevel('dominoes', 'normal', store)).toBe('normal');
    expect(levelLabel(rememberedComputerLevel('farkle', 'normal', store))).toBe('Hard');
  });

  it('ignores junk values and corrupt storage', () => {
    const store = fakeStore();
    rememberComputerLevel('rummy', 'nightmare', store);
    expect(rememberedComputerLevel('rummy', 'normal', store)).toBe('normal');
    store.setItem('clubhouse-computer-levels', 'not json');
    expect(rememberedComputerLevel('rummy', 'hard', store)).toBe('hard');
  });
});
