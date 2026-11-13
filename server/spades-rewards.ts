import type { SpadesMatchReward, SpadesReceipt } from '../src/lib/spades-rewards';
export interface SpadesRewardWriter { configured: () => boolean; deliver: (result: SpadesMatchReward) => Promise<SpadesReceipt> }
