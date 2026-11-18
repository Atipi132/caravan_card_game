import { MAX_ATTACHMENTS, SOLD_MAX, SOLD_MIN, isNumberCard, rankValue } from './cards';
import type { Card, Caravan, Direction, PlacedCard, Suit } from './types';

export function emptyCaravan(): Caravan {
  return { cards: [], direction: null };
}

export function cloneCaravan(c: Caravan): Caravan {
  return { direction: c.direction, cards: c.cards.map((p) => ({ card: p.card, attachments: p.attachments.slice() })) };
}

/** Value of one placed number card including Kings (each King doubles). */
export function placedValue(p: PlacedCard): number {
  let v = rankValue(p.card.rank);
  for (const a of p.attachments) if (a.rank === 'K') v *= 2;
  return v;
}

/** The bid of a caravan: sum of its number cards, Kings included. */
export function caravanBid(c: Caravan): number {
  let total = 0;
  for (const p of c.cards) total += placedValue(p);
  return total;
}

export function isSold(bid: number): boolean {
  return bid >= SOLD_MIN && bid <= SOLD_MAX;
}

/** Suit of the caravan: suit of the last Queen attached to the last card, otherwise suit of the last card. */
export function caravanSuit(c: Caravan): Suit | null {
  const last = c.cards[c.cards.length - 1];
  if (!last) return null;
  for (let i = last.attachments.length - 1; i >= 0; i--) {
    const a = last.attachments[i];
    if (a.rank === 'Q') return a.suit;
  }
  return last.card.suit;
}

export function flip(d: Direction): Direction {
  return d === 'asc' ? 'desc' : d === 'desc' ? 'asc' : null;
}

/**
 * Recomputes the direction of a caravan after cards were removed (Jack / Joker).
 *
 * The direction follows the last two number cards, reversed once per Queen attached to the last card.
 * Rule 5.4: if the removal leaves two identical values at the end, the previous direction is kept.
 */
export function recomputeDirection(c: Caravan, previous: Direction): Direction {
  const n = c.cards.length;
  if (n < 2) return null;
  const last = c.cards[n - 1];
  const prev = c.cards[n - 2];
  const lv = rankValue(last.card.rank);
  const pv = rankValue(prev.card.rank);
  if (lv === pv) return previous;
  let d: Direction = lv > pv ? 'asc' : 'desc';
  for (const a of last.attachments) if (a.rank === 'Q') d = flip(d);
  return d;
}

/** Why a number card cannot be played on a caravan, or `null` if it can. */
export function numberPlayError(c: Caravan, card: Card): string | null {
  if (!isNumberCard(card)) return 'Not a number card';
  const n = c.cards.length;
  if (n === 0) return null;
  const last = c.cards[n - 1];
  const value = rankValue(card.rank);
  const lastValue = rankValue(last.card.rank);
  if (value === lastValue) return 'A number card cannot be played on a card of the same value';
  if (n === 1) return null;
  if (card.suit === caravanSuit(c)) return null;
  if (c.direction === 'asc' && value > lastValue) return null;
  if (c.direction === 'desc' && value < lastValue) return null;
  if (c.direction === null) return null;
  return 'The card must follow the suit or the direction of the caravan';
}

/** Appends a number card (assumes legality was checked). Mutates `c`. */
export function pushNumber(c: Caravan, card: Card): void {
  const last = c.cards[c.cards.length - 1];
  if (last) {
    const value = rankValue(card.rank);
    const lastValue = rankValue(last.card.rank);
    c.direction = value > lastValue ? 'asc' : 'desc';
  }
  c.cards.push({ card, attachments: [] });
}

/** Why a face card cannot be attached to `c.cards[index]`, or `null` if it can. */
export function facePlayError(c: Caravan, index: number, card: Card): string | null {
  if (isNumberCard(card)) return 'Not a face card';
  const target = c.cards[index];
  if (!target) return 'There is no card there';
  if (target.attachments.length >= MAX_ATTACHMENTS) return 'A card cannot hold more than three face cards';
  if (card.rank === 'Q' && index !== c.cards.length - 1) return 'A Queen can only be played on the last card of a caravan';
  return null;
}
