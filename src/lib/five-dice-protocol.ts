import type { Level } from './rummy';
import type { RewardView } from './rummy-rewards';
import type { FiveDiceMove, FiveDiceState } from './five-dice';
export interface FiveDiceOptions { mode: 'bot' | 'online'; seats: 2 | 3 | 4; level: Level }
export interface FiveDiceRoomView {
  code: string; revision: number; owner: boolean; status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  options: FiveDiceOptions; mySeat: number; players: { id: string; name: string; bot: boolean; ready: boolean; you: boolean; occupied: boolean }[];
  state: FiveDiceState | null; reward: RewardView;
}
export type FiveDiceCommand =
  | { operation: 'create'; requestId: string; name: string; options: FiveDiceOptions }
  | { operation: 'join'; requestId: string; code: string; name: string }
  | { operation: 'ready'; requestId: string; code: string; ready: boolean }
  | { operation: 'start'; requestId: string; code: string; revision: number }
  | { operation: 'move'; requestId: string; code: string; revision: number; move: FiveDiceMove }
  | { operation: 'leave'; requestId: string; code: string };
