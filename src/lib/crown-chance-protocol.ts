import type { ChanceLength } from './crown-chance';
import type { Level } from './rummy';
import type { RewardView } from './rummy-rewards';
import type { CrownChanceMove, CrownChanceState } from './crown-chance';
export interface CrownChanceOptions { mode: 'bot' | 'online'; seats: 2 | 3 | 4; level: Level; length: ChanceLength; minimum: 0 | 500 | 1000 }
export interface CrownChanceRoomView {
  code: string; revision: number; owner: boolean; status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  options: CrownChanceOptions; mySeat: number; players: { id: string; name: string; bot: boolean; ready: boolean; you: boolean; occupied: boolean }[];
  state: CrownChanceState | null; reward: RewardView;
}
export type CrownChanceCommand =
  | { operation: 'create'; requestId: string; name: string; options: CrownChanceOptions }
  | { operation: 'join'; requestId: string; code: string; name: string }
  | { operation: 'ready'; requestId: string; code: string; ready: boolean }
  | { operation: 'start'; requestId: string; code: string; revision: number }
  | { operation: 'move'; requestId: string; code: string; revision: number; move: CrownChanceMove }
  | { operation: 'leave'; requestId: string; code: string };
