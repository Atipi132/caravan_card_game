/**
 * Core types for the Caravan rules engine.
 *
 * The engine is pure and deterministic: every state transition goes through
 * `applyAction(state, player, action)` and all randomness comes from a seeded
 * RNG whose state lives inside `GameState`, so games can be serialised,
 * replayed and validated on the server.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export type NumberRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';
export type FaceRank = 'J' | 'Q' | 'K' | 'JOKER';
export type Rank = NumberRank | FaceRank;
export type PlayerIndex = 0 | 1;
export type CaravanIndex = 0 | 1 | 2;

/** Cosmetic card set (card back design). Mirrors the casino decks of the original game. */
export type CardSet = 'classic' | 'atomic' | 'regal' | 'lucky' | 'crimson' | 'bunker';
export const CARD_SETS: readonly CardSet[] = ['classic', 'atomic', 'regal', 'lucky', 'crimson', 'bunker'];

/** A card definition, independent of any game (used for deck building). */
export interface CardSpec {
  set: CardSet;
  rank: Rank;
  /** `null` only for Jokers. */
  suit: Suit | null;
  /** Distinguishes the two Jokers of a set (1 or 2). Omitted for other cards. */
  jokerIndex?: 1 | 2;
}

/** A physical card in a game. `id` is opaque and random (never encodes the rank). */
export interface Card extends CardSpec {
  id: string;
  owner: PlayerIndex;
}

/** A number card on a caravan, with the face cards attached to it (max 3). */
export interface PlacedCard {
  card: Card;
  attachments: Card[];
}

export type Direction = 'asc' | 'desc' | null;

export interface Caravan {
  cards: PlacedCard[];
  /** Current numerical direction. `null` while fewer than two number cards are present. */
  direction: Direction;
}

export interface PlayerState {
  deck: Card[];
  hand: Card[];
  discard: Card[];
}

export type Phase = 'opening' | 'main' | 'ended';
export type EndReason = 'caravans' | 'out-of-cards' | 'forfeit' | 'timeout';

export interface GameConfig {
  /** Deck of each player. Defaults to a standard 54 card deck. */
  decks: [CardSpec[], CardSpec[]];
  /** Which player plays first. */
  firstPlayer: PlayerIndex;
  /** Number of cards drawn at the start. */
  openingHand: number;
}

export interface GameState {
  phase: Phase;
  /** Player whose turn it is. */
  turn: PlayerIndex;
  /** Number of turns completed since the start of the game. */
  turnNumber: number;
  players: [PlayerState, PlayerState];
  /** `caravans[player][index]`. */
  caravans: [Caravan[], Caravan[]];
  winner: PlayerIndex | null;
  endReason: EndReason | null;
  /** Internal RNG state (mulberry32). */
  rng: number;
  /** How many times each player had to mulligan during the setup. */
  mulligans: [number, number];
  firstPlayer: PlayerIndex;
  /** The last successfully applied action (useful for UI / logs). */
  lastAction: AppliedAction | null;
}

export interface CaravanTarget {
  player: PlayerIndex;
  caravan: CaravanIndex;
}

export type Action =
  /**
   * Play a card from the hand.
   * - Number cards: `target` is one of your own caravans; the card is appended.
   * - Face cards / Jokers: `target` is any caravan and `cardIndex` the number card it is attached to
   *   (for Queens, `cardIndex` must be the last card and may be omitted).
   */
  | { type: 'play'; cardId: string; target: CaravanTarget; cardIndex?: number }
  | { type: 'discard'; cardId: string }
  | { type: 'disband'; caravan: CaravanIndex }
  | { type: 'forfeit' }
  /** Server-only: the current player ran out of time. */
  | { type: 'timeout' };

export interface AppliedAction {
  player: PlayerIndex;
  action: Action;
  /** Card played/discarded (revealed to both players once played). */
  card?: Card;
  /** Ids of every card that left the table because of this action. */
  removedIds: string[];
  /** Id of the card drawn after the action (if any). */
  drawnId?: string;
}

export type ActionResult =
  | { ok: true; state: GameState; applied: AppliedAction }
  | { ok: false; error: string };
