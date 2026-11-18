/** Socket.IO protocol shared by the server and the client. */
import type { Action, CardSet, CardSpec } from './types';
import type { PlayerView } from './view';

export interface RoomSettings {
  /** Jokers in standard decks. */
  jokers: 0 | 1 | 2;
  /** Players may bring their custom deck from the deck builder (validated by the server). */
  allowCustomDecks: boolean;
  /** Seconds per turn. */
  turnSeconds: number;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = { jokers: 2, allowCustomDecks: false, turnSeconds: 60 };

export interface DeckChoice {
  /** Card back of the standard deck. */
  backSet: CardSet;
  /** Custom deck, used only if the room allows it. */
  custom?: CardSpec[];
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type RematchState = 'none' | 'you' | 'opponent';

export interface GameUpdate {
  gameId: string;
  /** Incremented on every rematch. */
  round: number;
  view: PlayerView;
  youName: string;
  opponentName: string;
  opponentConnected: boolean;
  /** Epoch ms (server clock) when the current turn times out, or null when the game is over. */
  deadline: number | null;
  /** Server time when the update was sent (to compensate clock skew). */
  serverNow: number;
  rematch: RematchState;
  settings: RoomSettings;
  /** Present when the game was ended by the server (opponent left, etc.). */
  notice?: string;
}

export interface ClientToServerEvents {
  hello: (p: { playerId: string; name: string }, ack: (r: Ack<{ resumed: boolean }>) => void) => void;
  'queue:join': (p: { deck: DeckChoice }, ack: (r: Ack) => void) => void;
  'queue:leave': () => void;
  'room:create': (p: { settings: Partial<RoomSettings>; deck: DeckChoice }, ack: (r: Ack<{ code: string }>) => void) => void;
  'room:join': (p: { code: string; deck: DeckChoice }, ack: (r: Ack) => void) => void;
  'room:leave': () => void;
  'game:action': (p: { action: Action }, ack: (r: Ack) => void) => void;
  'game:rematch': () => void;
  'game:leave': () => void;
}

export interface ServerToClientEvents {
  'queue:status': (p: { searching: boolean; waiting: number }) => void;
  'room:waiting': (p: { code: string; settings: RoomSettings }) => void;
  'game:state': (p: GameUpdate) => void;
  'game:closed': (p: { reason: string }) => void;
  'server:stats': (p: { online: number; games: number }) => void;
}
