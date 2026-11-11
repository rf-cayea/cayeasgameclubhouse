import type { Action } from './engine';
import type { GemsAction } from './gems-engine';
import type { Inventory } from './gems-levels';
import type { PuzzleProgress, EconomyWallet } from './economy-protocol';
import type { MonasteryProgress } from './monastery';

export type PuzzleGame = 'faith-3' | '3-gems';
export type PuzzleAction = Action | GemsAction;
export interface PuzzleRun {
  runId: string; game: PuzzleGame; level: number; attempt: number; expiresAt: number;
  boosters: Inventory; progress: PuzzleProgress;
  monastery?: MonasteryProgress; rulesVersion?: 1 | 2;
}
export interface PuzzleReceipt {
  verified: true; game: PuzzleGame; level: number; stars?: number; flawless?: boolean;
  amount: number; alreadyCredited: boolean; wallet: EconomyWallet; progress: PuzzleProgress;
  monastery?: MonasteryProgress;
}
export const PUZZLE_RUN_BOOSTERS: Inventory = { row: 2, column: 2, burst: 1, shuffle: 1 };
export const PUZZLE_MAX_ACTIONS = 2000;
