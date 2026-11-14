import type { Eights, Hearts, Suit } from './classic-cards';

export type ClassicKind = 'eights' | 'hearts';
export const classicTitle = (kind: ClassicKind) => kind === 'eights' ? 'Cayea’s Classic Card Crazy 8’s' : 'Cayea’s Classic Card Hearts';
export const classicPath = (kind: ClassicKind) => kind === 'eights' ? '/games/crazy-eights' : '/games/hearts';
export const classicRoomCode = (value: unknown): value is string => typeof value === 'string' && /^[A-F0-9]{8}$/.test(value);

export interface ClassicTableSummary {
  code: string;
  host: string;
  humans: number;
  capacity: number;
  jokers: boolean;
}

export interface ClassicOptions {
  listed: boolean;
  capacity: 1 | 2 | 3 | 4;
  jokers: boolean;
}

export interface ClassicRoomView {
  code: string;
  revision: number;
  host: boolean;
  seat: number;
  options: ClassicOptions;
  players: { seat: number; name: string; ready: boolean }[];
  hand: string[];
  counts: number[];
  legal: string[];
  waitingForPass: boolean;
  rewardMatchId: string | null;
  game:
    | ({ kind: 'eights'; top: string; stockCount: number; canDraw: boolean } & Pick<Eights, 'active' | 'turn' | 'winners' | 'message'>)
    | ({ kind: 'hearts' } & Omit<Hearts, 'hands' | 'broken'>)
    | null;
}

type SeatedAction = { code: string; revision: number };
export type ClassicAction =
  | { operation: 'create'; options: ClassicOptions; name: string }
  | { operation: 'join'; code: string; name: string }
  | { operation: 'leave'; code: string }
  | (SeatedAction & (
      | { operation: 'ready'; ready: boolean }
      | { operation: 'start' | 'draw' | 'next' | 'rematch' }
      | { operation: 'play'; card: string; suit?: Suit }
      | { operation: 'pass'; cards: string[]; round: number }
    ));
export type ClassicRequest = ClassicAction & { requestId: string };
export const classicAPI = (kind: ClassicKind) => `/api/classic-cards/${kind}`;
export function classicEndpoint(path: string) {
  const match = /^\/api\/classic-cards\/(eights|hearts)(?:\/([A-Fa-f0-9]{8}))?$/.exec(path);
  return match ? { kind: match[1] as ClassicKind, code: match[2]?.toUpperCase() } : null;
}
