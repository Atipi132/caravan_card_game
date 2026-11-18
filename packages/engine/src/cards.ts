import type { Card, CardSet, CardSpec, NumberRank, Rank, Suit } from './types';

export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];
export const NUMBER_RANKS: readonly NumberRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
export const FACE_RANKS = ['J', 'Q', 'K'] as const;
export const ALL_RANKS: readonly Rank[] = [...NUMBER_RANKS, ...FACE_RANKS, 'JOKER'];

export const MIN_DECK_SIZE = 30;
export const MAX_ATTACHMENTS = 3;
export const SOLD_MIN = 21;
export const SOLD_MAX = 26;

export function isNumberRank(rank: Rank): rank is NumberRank {
  return (NUMBER_RANKS as readonly string[]).includes(rank);
}

export function isNumberCard(card: CardSpec): boolean {
  return isNumberRank(card.rank);
}

export function isFaceCard(card: CardSpec): boolean {
  return !isNumberRank(card.rank);
}

/** Face value of a number card (A = 1). */
export function rankValue(rank: Rank): number {
  if (rank === 'A') return 1;
  if (!isNumberRank(rank)) return 0;
  return Number(rank);
}

/** Unique key of a card spec inside a deck (set + rank + suit). */
export function specKey(spec: CardSpec): string {
  return spec.rank === 'JOKER' ? `${spec.set}:JOKER${spec.jokerIndex ?? 1}` : `${spec.set}:${spec.rank}${spec.suit}`;
}

/** A standard 52 card deck plus `jokers` Jokers, all from the same set. */
export function standardDeck(set: CardSet = 'classic', jokers: 0 | 1 | 2 = 2): CardSpec[] {
  const deck: CardSpec[] = [];
  for (const suit of SUITS) {
    for (const rank of [...NUMBER_RANKS, ...FACE_RANKS]) deck.push({ set, rank, suit });
  }
  for (let i = 1; i <= jokers; i++) deck.push({ set, rank: 'JOKER', suit: null, jokerIndex: i as 1 | 2 });
  return deck;
}

export interface DeckValidation {
  ok: boolean;
  errors: string[];
}

/** Validates a (custom) deck: ≥30 cards, no duplicate card from the same set, at least 3 number cards. */
export function validateDeck(deck: CardSpec[], maxSize = 216): DeckValidation {
  const errors: string[] = [];
  if (!Array.isArray(deck)) return { ok: false, errors: ['Deck must be an array'] };
  if (deck.length < MIN_DECK_SIZE) errors.push(`Deck must contain at least ${MIN_DECK_SIZE} cards`);
  if (deck.length > maxSize) errors.push(`Deck must contain at most ${maxSize} cards`);
  const seen = new Set<string>();
  let numbers = 0;
  for (const spec of deck) {
    if (!isValidSpec(spec)) {
      errors.push('Deck contains an invalid card');
      break;
    }
    const key = specKey(spec);
    if (seen.has(key)) {
      errors.push(`Duplicate card ${key}`);
      break;
    }
    seen.add(key);
    if (isNumberCard(spec)) numbers++;
  }
  if (numbers < 3) errors.push('Deck must contain at least 3 number cards');
  return { ok: errors.length === 0, errors };
}

const SET_NAMES = new Set<string>(['classic', 'atomic', 'regal', 'lucky', 'crimson', 'bunker']);

export function isValidSpec(spec: unknown): spec is CardSpec {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as Record<string, unknown>;
  if (typeof s.set !== 'string' || !SET_NAMES.has(s.set)) return false;
  if (typeof s.rank !== 'string' || !(ALL_RANKS as readonly string[]).includes(s.rank)) return false;
  if (s.rank === 'JOKER') return s.suit === null && (s.jokerIndex === 1 || s.jokerIndex === 2);
  return typeof s.suit === 'string' && (SUITS as readonly string[]).includes(s.suit);
}

const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function cardLabel(card: CardSpec): string {
  if (card.rank === 'JOKER') return 'Joker';
  return `${card.rank}${SUIT_SYMBOLS[card.suit as Suit]}`;
}

export function cloneCard(card: Card): Card {
  return { ...card };
}
