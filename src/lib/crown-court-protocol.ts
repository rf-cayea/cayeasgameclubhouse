import type { CourtLength } from './crown-court';
import type { Level } from './rummy';
import type { RewardView } from './rummy-rewards';
import type { CrownCourtMove, CrownCourtState } from './crown-court';
export interface CrownCourtOptions { mode: 'bot' | 'online'; seats: 2 | 3 | 4; level: Level; length: CourtLength }
export interface CrownCourtRoomView {
  code: string; revision: number; owner: boolean; status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  options: CrownCourtOptions; mySeat: number; players: { id: string; name: string; bot: boolean; ready: boolean; you: boolean; occupied: boolean }[];
  state: CrownCourtState | null; reward: RewardView;
}
export type CrownCourtCommand =
  | { operation: 'create'; requestId: string; name: string; options: CrownCourtOptions }
  | { operation: 'join'; requestId: string; code: string; name: string }
  | { operation: 'ready'; requestId: string; code: string; ready: boolean }
  | { operation: 'start'; requestId: string; code: string; revision: number }
  | { operation: 'move'; requestId: string; code: string; revision: number; move: CrownCourtMove }
  | { operation: 'leave'; requestId: string; code: string };
