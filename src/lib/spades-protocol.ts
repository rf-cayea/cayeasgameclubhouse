import type { Level } from './rummy';
import type { HandScore, SpadesMode, SpadesMove, SpadesPhase, SpadesTrick, TrickCard } from './spades';
import type { RewardView } from './rummy-rewards';
export interface SpadesOptions { mode: 'bot' | 'online'; variant: SpadesMode; target: number; humans: number; level: Level; table: string; deck: string }
export interface SpadesRoomView {
  code: string; revision: number; owner: boolean; status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  options: SpadesOptions; mySeat: number; players: { id: string; name: string; bot: boolean; ready: boolean; occupied: boolean; you: boolean; count: number }[];
  hand: string[]; legal: string[]; bids: (number | null)[]; taken: number[]; scores: number[]; bags: number[];
  phase: SpadesPhase | null; turn: number; dealer: number; round: number; broken: boolean;
  trick: TrickCard[]; completed: SpadesTrick[]; result: HandScore[] | null; winner: number | null; log: string[]; reward: RewardView;
}
export type SpadesCommand =
  | { operation: 'create'; name: string; options: SpadesOptions }
  | { operation: 'join'; code: string; name: string; seat?: number }
  | { operation: 'ready'; code: string; ready: boolean }
  | { operation: 'start'; code: string; revision: number }
  | { operation: 'move'; code: string; revision: number; requestId: string; move: SpadesMove }
  | { operation: 'leave'; code: string };
