import type { GemSpecial } from './gems-engine';

export const GEM_COMBINATIONS = {
  cross: { title: 'Sacred Cross', detail: 'Two lines clear a full row and column.', color: '#a3f4ff' },
  'lotus-lines': { title: 'Lotus Starburst', detail: 'Lotus + line sweeps three rows and three columns.', color: '#ffd4a0' },
  'double-lotus': { title: 'Twin Lotus Nova', detail: 'Two lotuses create overlapping 5 × 5 blasts.', color: '#ffb8d8' },
  'orb-lines': { title: 'Prismatic Storm', detail: 'Orb + line turns one color into row and column specials.', color: '#c9bcff' },
  'orb-lotus': { title: 'Lotus Constellation', detail: 'Orb + lotus turns one color into lotus blasts.', color: '#e4baff' },
  'orb-lantern': { title: 'Festival of Lights', detail: 'Orb + lantern turns one color into goal-seeking lanterns.', color: '#ffe1a0' },
  'double-orb': { title: 'Great Awakening', detail: 'Two wisdom orbs strike the entire garden.', color: '#f4e7ff' },
  'lantern-lines': { title: 'Guiding Comet', detail: 'Lantern + line delivers a row or column strike to a goal.', color: '#b4f7e0' },
  'lantern-lotus': { title: 'Lotus Pilgrimage', detail: 'Lantern + lotus delivers a blast to a goal.', color: '#bcffd4' },
  'double-lantern': { title: 'Three Wishes', detail: 'Two lanterns seek three separate goals.', color: '#fff0a3' },
} as const;
export type GemComboKind = keyof typeof GEM_COMBINATIONS;
export interface GemCombination { kind: GemComboKind; a: number; b: number; specials: [GemSpecial, GemSpecial] }

/** Symmetric abilities: either swap direction produces the same combination. */
export function gemCombination(a: number, b: number, first: GemSpecial, second: GemSpecial): GemCombination {
  const pair = [first, second], orb = pair.includes('orb'), lantern = pair.includes('lantern'), lotus = pair.includes('burst');
  const kind: GemComboKind = orb ? first === second ? 'double-orb' : lantern ? 'orb-lantern' : lotus ? 'orb-lotus' : 'orb-lines'
    : lantern ? first === second ? 'double-lantern' : lotus ? 'lantern-lotus' : 'lantern-lines'
      : lotus ? first === second ? 'double-lotus' : 'lotus-lines' : 'cross';
  return { kind, a, b, specials: [first, second] };
}
