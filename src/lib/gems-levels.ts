export const GEMS_NAME = '3 Gems of Buddhism';
export const GEMS_LEVEL_COUNT = 200;
export const GEMS_SIZE = 8;
export const GEM_COLORS = [
  { name: 'Jade', color: '#55ddb0', shade: '#126f64', shape: 'leaf' },
  { name: 'Ruby', color: '#ff8096', shade: '#a62f67', shape: 'heart' },
  { name: 'Sapphire', color: '#72baff', shade: '#354eaa', shape: 'diamond' },
  { name: 'Amber', color: '#ffcf70', shade: '#ba762d', shape: 'sun' },
  { name: 'Amethyst', color: '#c6a0ff', shade: '#7349af', shape: 'lotus' },
  { name: 'Aquamarine', color: '#80eff2', shade: '#208a9e', shape: 'drop' },
] as const;
export const GEMS_CHAPTERS = [
  { name: 'Bodhi Light Vihara', lesson: 'Every journey begins with one mindful step.', color: '#8bd5b2', symbol: '🌿' },
  { name: 'Lotus Wisdom Temple', lesson: 'Wisdom and compassion grow through shared practice.', color: '#edbe79', symbol: '🪷' },
  { name: 'Snow Lion Sanctuary', lesson: 'Meet a challenge with steadiness and care.', color: '#abb9e3', symbol: '🏔' },
  { name: 'Still Water Monastery', lesson: 'Buddha, Dharma, Sangha: awakening, teaching, community.', color: '#d6acdf', symbol: '☸︎' },
] as const;
export const MONASTERY_PROJECTS = [
  { name: 'Lotus Courtyard', task: 'Clear the old stones and welcome the first lotus blooms.', symbol: '✿' },
  { name: 'Bodhi Garden', task: 'Bring the garden back to life, one mindful step at a time.', symbol: '❧' },
  { name: 'Lantern Walk', task: 'Hang warm lanterns along the path to the temple.', symbol: '◈' },
  { name: 'Reflection Pond', task: 'Restore the water, the lotus beds, and the little bridge.', symbol: '≈' },
  { name: 'Monastery Gate', task: 'Repair the entrance that has stood closed for so long.', symbol: '⌂' },
  { name: 'Dharma Hall', task: 'Rebuild a quiet place for learning and community.', symbol: '☸︎' },
  { name: 'Sanctuary Roof', task: 'Return the sweeping roof and its golden finial.', symbol: '△' },
  { name: 'Golden Stupa', task: 'Restore the stupa overlooking the garden.', symbol: '✦' },
  { name: 'Meditation Hall', task: 'Light the hall and prepare a place for stillness.', symbol: '☾' },
  { name: 'The Reopening', task: 'Complete the final preparations and reopen the monastery.', symbol: '✧' },
] as const;
export function monasteryRestoration(cleared: number) {
  const completed = Math.min(150, Math.max(0, cleared));
  return { completed, stage: Math.min(10, Math.floor(completed / 15)), project: MONASTERY_PROJECTS[Math.min(9, Math.floor(completed / 15))]!,
    inProject: completed === 150 ? 15 : completed % 15, reopened: completed === 150 };
}
export type Booster = 'row' | 'column' | 'burst' | 'shuffle';
export type Inventory = Record<Booster, number>;
export const BOOSTERS: Record<Booster, { name: string; icon: string; description: string }> = {
  row: { name: 'Row hammer', icon: '↔', description: 'Clear a whole horizontal row without using a move.' },
  column: { name: 'Column hammer', icon: '↕', description: 'Clear a whole vertical column without using a move.' },
  burst: { name: 'Lotus blessing', icon: '✿', description: 'Clear a 3 × 3 area without using a move.' },
  shuffle: { name: 'Fresh breeze', icon: '⤨', description: 'Rearrange movable gems without using a move.' },
};
export type GemsRules = 1 | 2;
export const GEMS_RULES: GemsRules = 2;
export interface GemsLevel {
  id: number; chapter: number; name: string; moves: number; colors: number;
  collect: { color: number; count: number }[];
  crates: number; crateLayers: number; frost: number; frostLayers: number; chains: number;
  checkpoint: boolean; barrier?: string;
}
const LEVEL_NAMES = ['First Light', 'Lotus Dew', 'Quiet Steps', 'Garden Gate', 'A Little Kindness', 'Bodhi Shade', 'Clear Water', 'Patient Heart', 'Open Sky', 'Golden Hour', 'Gentle Rain', 'Lantern Glow', 'Stillness', 'New Insight', 'Sanctuary'];

/** Four fifty-level communities. Versioned rules preserve games that were already in progress. */
export function gemsLevel(id: number, rules: GemsRules = GEMS_RULES): GemsLevel {
  if (!Number.isInteger(id) || id < 1 || id > GEMS_LEVEL_COUNT) throw new Error('Choose a level from 1 to 200.');
  const chapter = Math.floor((id - 1) / 50), progressionBand = Math.floor((id - 1) / 15), checkpoint = id % 50 === 0;
  const collect = [{ color: (progressionBand + Math.floor((id - 1) / 3)) % (id < 25 ? 5 : 6), count: id < 4 ? 8 + id * 2 : 14 + Math.floor(id / 9) }];
  if (id >= 12 && id % 3 !== 1) collect.push({ color: (collect[0]!.color + 2) % (id < 25 ? 5 : 6), count: 10 + Math.floor(id / 12) });
  const barriers = ['Middle wall', 'Split columns', 'Staggered gates', 'Garden cross', 'Terrace walls'];
  const harder = rules === 2 && id >= 4;
  return {
    id, chapter, name: `${GEMS_CHAPTERS[chapter]!.name} · ${LEVEL_NAMES[(id - 1) % 15]}`,
    ...(harder ? { barrier: barriers[(id - 4) % 5] } : {}),
    moves: harder ? 36 - Math.floor(id / 65) + (checkpoint ? 4 : 0) : (id <= 3 ? 26 : 34 - Math.floor(id / 45)) + (id % 15 === 0 ? 4 : 0), colors: id < 25 ? 5 : 6,
    collect, crates: harder ? (id < 10 ? 8 : id < 20 ? 10 : id < 50 ? 12 : id < 100 ? 14 : id < 150 ? 16 : 18) : id < 4 ? 0 : Math.min(12, 3 + Math.floor(id / 13)), crateLayers: harder ? (id < 12 ? 1 : id < 60 ? 2 : 3) : id < 50 ? 1 : id < 120 ? 2 : 3,
    frost: id < 7 ? 0 : Math.min(26, 6 + Math.floor(id / 5)), frostLayers: id < 45 ? 1 : id < 100 ? 2 : 3,
    chains: id < 16 ? 0 : Math.min(10, 2 + Math.floor(id / 19)), checkpoint,
  };
}

export function gemsClearReward(level: number): Inventory {
  const reward: Inventory = { row: 0, column: 0, burst: 0, shuffle: 0 };
  if (level % 5 === 0) { reward.row = 2; reward.column = 2; }
  else reward[(level % 2 === 0) ? 'column' : 'row'] = 1;
  if (level % 10 === 0) { reward.burst = 1; reward.shuffle = 1; }
  if (level % 15 === 0 || level % 50 === 0) { reward.burst += 2; reward.shuffle += 1; }
  return reward;
}

/** Contiguous barriers have priority over seeded extra blocks. */
export function gemsBarrierCells(level: number): number[] {
  const row = (r: number) => Array.from({ length: 8 }, (_, c) => r * 8 + c);
  const column = (c: number) => Array.from({ length: 8 }, (_, r) => r * 8 + c);
  switch ((level - 4) % 5) {
    case 0: return [...row(3), ...row(4)];
    case 1: return [...column(3), ...column(5)];
    case 2: return [...row(2).filter(i => i % 8 !== 2), ...row(5).filter(i => i % 8 !== 5)];
    case 3: return [...new Set([...row(3), ...column(4)]), ...row(4)];
    default: return [...row(2), ...row(5), ...column(1)];
  }
}
