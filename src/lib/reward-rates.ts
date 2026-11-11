/** Shared by the authoritative economy and every player-facing earning guide.
 * Store prices, conversions, game scores, and restoration stars are separate. */
export const CARD_WIN_POINTS = { easy: 15, normal: 25, hard: 35, humans: 50 } as const;
export const PREVIOUS_CARD_WIN_POINTS = { easy: 20, normal: 35, hard: 60, humans: 75 } as const;
export const LEGACY_CARD_WIN_POINTS = { easy: 40, normal: 70, hard: 120, humans: 150 } as const;
export const reducedGameReward = (previous: number) => Math.max(1, Math.floor(previous / 2));
export const gameAchievementCash = (reward: number) => Math.max(2, Math.floor(reward / 13));
/** Receipts acknowledge trusted server writes, including an already committed
 * reward from previous schedules. Only the economy decides a new payout. */
export const validCardRewardAmount = (tier: keyof typeof CARD_WIN_POINTS, amount: number) => amount === CARD_WIN_POINTS[tier] || amount === PREVIOUS_CARD_WIN_POINTS[tier] || amount === LEGACY_CARD_WIN_POINTS[tier];

export const legacyGameAchievementCash=(reward:number)=>Math.max(5,Math.round(reward*2/13));
