import { cloneCaravan, caravanBid, emptyCaravan, facePlayError, flip, isSold, numberPlayError, pushNumber, recomputeDirection } from './caravan';
import { isNumberCard, rankValue, standardDeck } from './cards';
import { Rng } from './rng';
import type {
  Action,
  ActionResult,
  AppliedAction,
  Card,
  CardSpec,
  Caravan,
  CaravanIndex,
  GameConfig,
  GameState,
  PlayerIndex,
  PlayerState,
} from './types';

export const CARAVAN_INDICES: readonly CaravanIndex[] = [0, 1, 2];
export const OPENING_HAND = 8;
const MAX_MULLIGANS = 50;

export function other(p: PlayerIndex): PlayerIndex {
  return p === 0 ? 1 : 0;
}

export function defaultConfig(partial: Partial<GameConfig> = {}): GameConfig {
  return {
    decks: partial.decks ?? [standardDeck('classic'), standardDeck('classic')],
    firstPlayer: partial.firstPlayer ?? 0,
    openingHand: partial.openingHand ?? OPENING_HAND,
  };
}

function countNumbers(cards: CardSpec[]): number {
  let n = 0;
  for (const c of cards) if (isNumberCard(c)) n++;
  return n;
}

/** Creates a new game: shuffles both decks, deals the opening hands and performs automatic mulligans (rule 4.3). */
export function createGame(partial: Partial<GameConfig> = {}, seed = 1): GameState {
  const config = defaultConfig(partial);
  const rng = new Rng(seed >>> 0);
  const usedIds = new Set<string>();
  const players = [0, 1].map((idx) => {
    const owner = idx as PlayerIndex;
    const specs = rng.shuffle(config.decks[owner]);
    const deck: Card[] = specs.map((spec) => {
      let id = rng.id();
      while (usedIds.has(id)) id = rng.id();
      usedIds.add(id);
      const card: Card = { id, owner, set: spec.set, rank: spec.rank, suit: spec.suit };
      if (spec.jokerIndex) card.jokerIndex = spec.jokerIndex;
      return card;
    });
    return { deck, hand: [], discard: [] } as PlayerState;
  }) as [PlayerState, PlayerState];

  const mulligans: [number, number] = [0, 0];
  for (const idx of [0, 1] as PlayerIndex[]) {
    const p = players[idx];
    p.hand = p.deck.splice(p.deck.length - Math.min(config.openingHand, p.deck.length));
    // Rule 4.3: a player without three number cards shows the hand, reshuffles and draws again.
    while (countNumbers(p.hand) < 3 && mulligans[idx] < MAX_MULLIGANS && countNumbers(p.deck) + countNumbers(p.hand) >= 3) {
      mulligans[idx]++;
      p.deck = rng.shuffle([...p.deck, ...p.hand]);
      p.hand = p.deck.splice(p.deck.length - Math.min(config.openingHand, p.deck.length));
    }
  }

  return {
    phase: 'opening',
    turn: config.firstPlayer,
    turnNumber: 0,
    players,
    caravans: [
      [emptyCaravan(), emptyCaravan(), emptyCaravan()],
      [emptyCaravan(), emptyCaravan(), emptyCaravan()],
    ],
    winner: null,
    endReason: null,
    rng: rng.state,
    mulligans,
    firstPlayer: config.firstPlayer,
    lastAction: null,
  };
}

/** Fast structural clone. Card objects are immutable and therefore shared. */
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({ deck: p.deck.slice(), hand: p.hand.slice(), discard: p.discard.slice() })) as [PlayerState, PlayerState],
    caravans: s.caravans.map((side) => side.map(cloneCaravan)) as [Caravan[], Caravan[]],
    mulligans: [s.mulligans[0], s.mulligans[1]],
  };
}

export function bids(s: GameState): [number[], number[]] {
  return [s.caravans[0].map(caravanBid), s.caravans[1].map(caravanBid)];
}

/** Winner of a lane (pair of competing caravans), or `null` if undecided (nothing sold, or tie). */
export function laneWinner(s: GameState, lane: CaravanIndex): PlayerIndex | null {
  const b0 = caravanBid(s.caravans[0][lane]);
  const b1 = caravanBid(s.caravans[1][lane]);
  const s0 = isSold(b0);
  const s1 = isSold(b1);
  if (s0 && s1) return b0 > b1 ? 0 : b1 > b0 ? 1 : null;
  if (s0) return 0;
  if (s1) return 1;
  return null;
}

/**
 * Rule 6.2: the game ends once every lane is decided (at least one caravan sold, no tie).
 * The player who wins two or three lanes wins.
 */
export function caravanWinner(s: GameState): PlayerIndex | null {
  let w0 = 0;
  let w1 = 0;
  for (const lane of CARAVAN_INDICES) {
    const w = laneWinner(s, lane);
    if (w === null) return null;
    if (w === 0) w0++;
    else w1++;
  }
  return w0 > w1 ? 0 : 1;
}

function findInHand(p: PlayerState, cardId: string): number {
  return p.hand.findIndex((c) => c.id === cardId);
}

function sendToDiscard(s: GameState, cards: Card[]): void {
  for (const c of cards) s.players[c.owner].discard.push(c);
}

/** Removes `caravan.cards[index]` with its attachments. Returns removed cards. */
function removePlaced(caravan: Caravan, index: number): Card[] {
  const [removed] = caravan.cards.splice(index, 1);
  return removed ? [removed.card, ...removed.attachments] : [];
}

function draw(s: GameState, player: PlayerIndex): string | undefined {
  const p = s.players[player];
  const card = p.deck.pop();
  if (!card) return undefined;
  p.hand.push(card);
  return card.id;
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Validates an action without applying it. */
export function validateAction(s: GameState, player: PlayerIndex, action: Action): string | null {
  if (s.phase === 'ended') return 'The game is over';
  if (action.type === 'forfeit') return null;
  if (action.type === 'timeout') return player === s.turn ? null : 'Not your turn';
  if (player !== s.turn) return 'Not your turn';
  const me = s.players[player];

  switch (action.type) {
    case 'discard': {
      if (s.phase === 'opening') return 'You cannot discard during the opening round';
      if (findInHand(me, action.cardId) < 0) return 'Card not in hand';
      return null;
    }
    case 'disband': {
      if (s.phase === 'opening') return 'You cannot disband during the opening round';
      const c = s.caravans[player][action.caravan];
      if (!c) return 'Invalid caravan';
      if (c.cards.length === 0) return 'This caravan is empty';
      return null;
    }
    case 'play': {
      const idx = findInHand(me, action.cardId);
      if (idx < 0) return 'Card not in hand';
      const card = me.hand[idx];
      const t = action.target;
      if (!t || (t.player !== 0 && t.player !== 1) || ![0, 1, 2].includes(t.caravan)) return 'Invalid target';
      const caravan = s.caravans[t.player][t.caravan];
      if (isNumberCard(card)) {
        if (t.player !== player) return 'Number cards can only be played on your own caravans';
        if (s.phase === 'opening' && caravan.cards.length > 0) return 'During the opening round, start each caravan with one card';
        return numberPlayError(caravan, card);
      }
      if (s.phase === 'opening') return 'Only number cards can be played during the opening round';
      const index = action.cardIndex ?? (card.rank === 'Q' ? caravan.cards.length - 1 : -1);
      return facePlayError(caravan, index, card);
    }
    default:
      return 'Unknown action';
  }
}

/** Applies an action. Never mutates the input state. */
export function applyAction(state: GameState, player: PlayerIndex, action: Action): ActionResult {
  const error = validateAction(state, player, action);
  if (error) return fail(error);

  const s = cloneState(state);
  const applied: AppliedAction = { player, action, removedIds: [] };

  if (action.type === 'forfeit' || action.type === 'timeout') {
    s.phase = 'ended';
    s.winner = other(player);
    s.endReason = action.type === 'forfeit' ? 'forfeit' : 'timeout';
    s.lastAction = applied;
    return { ok: true, state: s, applied };
  }

  const me = s.players[player];

  if (action.type === 'discard') {
    const [card] = me.hand.splice(findInHand(me, action.cardId), 1);
    me.discard.push(card);
    applied.card = card;
    applied.drawnId = draw(s, player);
  } else if (action.type === 'disband') {
    const caravan = s.caravans[player][action.caravan];
    const removed: Card[] = [];
    for (const p of caravan.cards) removed.push(p.card, ...p.attachments);
    caravan.cards = [];
    caravan.direction = null;
    sendToDiscard(s, removed);
    applied.removedIds = removed.map((c) => c.id);
  } else {
    const [card] = me.hand.splice(findInHand(me, action.cardId), 1);
    applied.card = card;
    const caravan = s.caravans[action.target.player][action.target.caravan];
    if (isNumberCard(card)) {
      pushNumber(caravan, card);
    } else {
      const index = action.cardIndex ?? caravan.cards.length - 1;
      applied.action = { ...action, cardIndex: index };
      const removed = playFace(s, caravan, index, card);
      sendToDiscard(s, removed);
      applied.removedIds = removed.map((c) => c.id);
    }
    if (s.phase === 'main') applied.drawnId = draw(s, player);
  }

  finishTurn(s);
  s.lastAction = applied;
  return { ok: true, state: s, applied };
}

/** Applies a face card / Joker. Mutates `s`. Returns removed cards (to be discarded). */
function playFace(s: GameState, caravan: Caravan, index: number, card: Card): Card[] {
  const target = caravan.cards[index];
  switch (card.rank) {
    case 'J': {
      const before = caravan.direction;
      const removed = removePlaced(caravan, index);
      caravan.direction = recomputeDirection(caravan, before);
      return [...removed, card];
    }
    case 'Q': {
      target.attachments.push(card);
      caravan.direction = flip(caravan.direction);
      return [];
    }
    case 'K': {
      target.attachments.push(card);
      return [];
    }
    case 'JOKER': {
      target.attachments.push(card);
      const isAce = target.card.rank === 'A';
      const removed: Card[] = [];
      for (const side of s.caravans) {
        for (const c of side) {
          const before = c.direction;
          let changed = false;
          for (let i = c.cards.length - 1; i >= 0; i--) {
            const p = c.cards[i];
            if (p === target) continue;
            const hit = isAce ? p.card.suit === target.card.suit : rankValue(p.card.rank) === rankValue(target.card.rank);
            if (hit) {
              removed.push(...removePlaced(c, i));
              changed = true;
            }
          }
          if (changed) c.direction = recomputeDirection(c, before);
        }
      }
      return removed;
    }
    default:
      return [];
  }
}

function finishTurn(s: GameState): void {
  if (s.phase === 'opening') {
    const done = s.caravans.every((side) => side.every((c) => c.cards.length > 0));
    // Safety: if a player can no longer start a caravan (only possible with odd custom decks), move on.
    const stuck = !done && !hasOpeningMove(s, other(s.turn)) && !hasOpeningMove(s, s.turn);
    if (done || stuck) s.phase = 'main';
  }

  if (s.phase === 'main') {
    const w = caravanWinner(s);
    if (w !== null) {
      s.phase = 'ended';
      s.winner = w;
      s.endReason = 'caravans';
      return;
    }
  }

  s.turn = other(s.turn);
  s.turnNumber++;

  if (s.phase === 'opening' && !hasOpeningMove(s, s.turn)) {
    // The next player has already started all caravans they can: skip them.
    s.turn = other(s.turn);
  }

  // Rule 6.3: a player with no cards left loses.
  const next = s.players[s.turn];
  if (s.phase === 'main' && next.hand.length === 0 && next.deck.length === 0) {
    s.phase = 'ended';
    s.winner = other(s.turn);
    s.endReason = 'out-of-cards';
  }
}

function hasOpeningMove(s: GameState, player: PlayerIndex): boolean {
  const hasEmpty = s.caravans[player].some((c) => c.cards.length === 0);
  return hasEmpty && s.players[player].hand.some(isNumberCard);
}

/** Enumerates every legal action for `player` (forfeit excluded). */
export function legalActions(s: GameState, player: PlayerIndex): Action[] {
  if (s.phase === 'ended' || s.turn !== player) return [];
  const out: Action[] = [];
  const hand = s.players[player].hand;
  const seen = new Set<string>();
  for (const card of hand) {
    if (isNumberCard(card)) {
      for (const caravan of CARAVAN_INDICES) {
        const a: Action = { type: 'play', cardId: card.id, target: { player, caravan } };
        if (!validateAction(s, player, a)) out.push(a);
      }
    } else if (s.phase === 'main') {
      for (const tp of [0, 1] as PlayerIndex[]) {
        for (const caravan of CARAVAN_INDICES) {
          const c = s.caravans[tp][caravan];
          for (let i = 0; i < c.cards.length; i++) {
            if (card.rank === 'Q' && i !== c.cards.length - 1) continue;
            const a: Action = { type: 'play', cardId: card.id, target: { player: tp, caravan }, cardIndex: i };
            if (!validateAction(s, player, a)) out.push(a);
          }
        }
      }
    }
    if (s.phase === 'main' && !seen.has(card.id)) {
      seen.add(card.id);
      out.push({ type: 'discard', cardId: card.id });
    }
  }
  if (s.phase === 'main') {
    for (const caravan of CARAVAN_INDICES) {
      if (s.caravans[player][caravan].cards.length > 0) out.push({ type: 'disband', caravan });
    }
  }
  return out;
}

/** Total number of cards owned by a player (deck + hand + discard + on the table). Used for invariants. */
export function countOwnedCards(s: GameState, player: PlayerIndex): number {
  const p = s.players[player];
  let n = p.deck.length + p.hand.length + p.discard.length;
  for (const side of s.caravans) {
    for (const c of side) {
      for (const placed of c.cards) {
        if (placed.card.owner === player) n++;
        for (const a of placed.attachments) if (a.owner === player) n++;
      }
    }
  }
  return n;
}
