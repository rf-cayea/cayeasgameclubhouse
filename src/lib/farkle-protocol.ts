import type { Level } from './rummy';
import type { RewardView } from './rummy-rewards';
import type { FarkleMove, FarkleState } from './farkle';
export interface FarkleOptions { mode: 'bot' | 'online'; seats: 2 | 3 | 4; level: Level; target?: 5000 | 10000 }
export interface FarkleRoomView {
  code: string; revision: number; owner: boolean; status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  options: FarkleOptions; mySeat: number; players: { id: string; name: string; bot: boolean; ready: boolean; you: boolean; occupied: boolean }[];
  state: FarkleState | null; reward: RewardView;
}
export type FarkleCommand =
  | { operation: 'create'; requestId: string; name: string; options: FarkleOptions }
  | { operation: 'join'; requestId: string; code: string; name: string }
  | { operation: 'ready'; requestId: string; code: string; ready: boolean }
  | { operation: 'start'; requestId: string; code: string; revision: number }
  | { operation: 'move'; requestId: string; code: string; revision: number; move: FarkleMove }
  | { operation: 'leave'; requestId: string; code: string };
