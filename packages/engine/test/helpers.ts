import type { Card, Caravan, GameState, PlayerIndex, Rank, Suit } from '../src/types';
import { recomputeDirection } from '../src/caravan';

let counter = 0;

/** Card factory: `card('7H')`, `card('QS', 1)`, `card('JOKER')`. */
export function card(code: string, owner: PlayerIndex = 0): Card {
  counter++;
  if (code === 'JOKER') return { id: `t${counter}`, owner, set: 'classic', rank: 'JOKER', suit: null, jokerIndex: 1 };
  const suit = code.slice(-1) as Suit;
  const rank = code.slice(0, -1) as Rank;
  return { id: `t${counter}`, owner, set: 'classic', rank, suit };
}

/**
 * Builds a caravan from a compact description, e.g. `['6H', '7H+QS', '6C']`
 * (`+` separates attachments). The direction is computed by replaying the plays.
 */
export function caravan(codes: string[], owner: PlayerIndex = 0, direction?: Caravan['direction']): Caravan {
  const c: Caravan = { cards: [], direction: null };
  for (const code of codes) {
    const [num, ...att] = code.split('+');
    const placed = { card: card(num, owner), attachments: att.map((a) => card(a, owner)) };
    c.cards.push(placed);
  }
  c.direction = direction !== undefined ? direction : simulateDirection(c);
  return c;
}

function simulateDirection(c: Caravan): Caravan['direction'] {
  // Replays: direction from the last two values, flipped by Queens on the last card.
  return recomputeDirection(c, null);
}

export interface StateSpec {
  caravans?: [string[][], string[][]];
  hands?: [string[], string[]];
  decks?: [number, number];
  turn?: PlayerIndex;
  phase?: GameState['phase'];
}

export function makeState(spec: StateSpec = {}): GameState {
  const caravans = (spec.caravans ?? [[[], [], []], [[], [], []]]).map((side, owner) =>
    side.map((codes) => caravan(codes, owner as PlayerIndex)),
  ) as [Caravan[], Caravan[]];
  const hands = spec.hands ?? [[], []];
  const decks = spec.decks ?? [10, 10];
  const players = [0, 1].map((p) => ({
    hand: hands[p].map((c) => card(c, p as PlayerIndex)),
    deck: Array.from({ length: decks[p] }, () => card('2C', p as PlayerIndex)),
    discard: [] as Card[],
  })) as GameState['players'];
  return {
    phase: spec.phase ?? 'main',
    turn: spec.turn ?? 0,
    turnNumber: 6,
    players,
    caravans,
    winner: null,
    endReason: null,
    rng: 1,
    mulligans: [0, 0],
    firstPlayer: 0,
    lastAction: null,
  };
}

export function handId(s: GameState, player: PlayerIndex, code: string): string {
  const rank = code === 'JOKER' ? 'JOKER' : code.slice(0, -1);
  const suit = code === 'JOKER' ? null : code.slice(-1);
  const c = s.players[player].hand.find((h) => h.rank === rank && h.suit === suit);
  if (!c) throw new Error(`Card ${code} not in hand of ${player}`);
  return c.id;
}

export function codes(c: Caravan): string[] {
  return c.cards.map((p) => [p.card.rank + p.card.suit, ...p.attachments.map((a) => (a.rank === 'JOKER' ? 'JOKER' : a.rank + a.suit))].join('+'));
}
