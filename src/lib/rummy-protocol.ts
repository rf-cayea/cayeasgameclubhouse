import type { Card, Level, Meld, Move, Phase, PublicPlay, RoundResult, Variant } from './rummy';
import type { RewardView } from './rummy-rewards';

export type GameMode = 'bot' | 'local' | 'online';
export interface GameOptions { mode: GameMode; variant: Variant; seats: number; level: Level; jokers: boolean; names?: string[] }
export interface PublicPlayer { id: string; name: string; bot: boolean; count: number; score: number; ready: boolean; you: boolean }
export interface RoomView {
  code: string; mode: GameMode; variant: Variant; capacity: number; status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  revision: number; owner: boolean; players: PublicPlayer[]; mySeat: number | null;
  hand: Card[]; discard: Card[]; stockCount: number; melds: Meld[]; phase: Phase | null;
  turn: number; dealer: number; round: number; target: number; roundResult: RoundResult | null; winner: number | null;
  mustUse: Card | null; drewDiscard: Card | null; opening: 'first' | 'dealer' | 'stock' | null;
  jokers: boolean; log: string[]; revealedHands: Card[][] | null;
  activity?: PublicPlay[];
  reward: RewardView;
}
export type RoomCommand =
  | { operation: 'create'; options: GameOptions; name: string }
  | { operation: 'join'; code: string; name: string }
  | { operation: 'ready'; code: string; ready: boolean }
  | { operation: 'start'; code: string; revision: number }
  | { operation: 'move'; code: string; revision: number; requestId: string; move: Move }
  | { operation: 'leave'; code: string };

export class RummyError extends Error {
  constructor(message: string, public status = 400, public code = 'invalid_move') { super(message); }
}
