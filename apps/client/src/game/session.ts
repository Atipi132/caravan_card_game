import type { Action, PlayerView } from '@caravan/engine';

export type RematchState = 'none' | 'you' | 'opponent';

/** Common interface of a game being played, whatever the transport (local AI or online server). */
export interface GameSession {
  mode: 'ai' | 'online';
  view: PlayerView | null;
  youName: string;
  opponentName: string;
  ante: number;
  /** Epoch ms at which the current turn times out (online only). */
  deadline: number | null;
  opponentConnected: boolean;
  rematch: RematchState;
  /** The AI / remote player is thinking. */
  waiting: boolean;
  /** Last error / status message from the transport. */
  status: string | null;
  act(action: Action): Promise<string | null>;
  requestRematch(): void;
  leave(): void;
}
