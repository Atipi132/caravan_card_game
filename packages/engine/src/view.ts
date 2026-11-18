import { caravanBid } from './caravan';
import { laneWinner, other } from './game';
import type { AppliedAction, Card, CardSet, Caravan, EndReason, GameState, Phase, PlayerIndex } from './types';

/** A card whose face is unknown to the viewer. */
export interface HiddenCard {
  id: string;
  set: CardSet;
  owner: PlayerIndex;
  hidden: true;
}

export interface SideView {
  deckCount: number;
  /** Set of the top card of the deck (its back is visible on the table, like in the original game). */
  deckTopSet: CardSet | null;
  discardCount: number;
}

/** What one player is allowed to see. Sent by the server; also used by the local (vs AI) mode. */
export interface PlayerView {
  you: PlayerIndex;
  phase: Phase;
  turn: PlayerIndex;
  turnNumber: number;
  firstPlayer: PlayerIndex;
  winner: PlayerIndex | null;
  endReason: EndReason | null;
  caravans: [Caravan[], Caravan[]];
  bids: [number[], number[]];
  laneWinners: (PlayerIndex | null)[];
  hand: Card[];
  me: SideView;
  opponent: SideView & { hand: HiddenCard[] };
  lastAction: AppliedAction | null;
  mulligans: [number, number];
}

function side(s: GameState, p: PlayerIndex): SideView {
  const pl = s.players[p];
  const top = pl.deck[pl.deck.length - 1];
  return { deckCount: pl.deck.length, deckTopSet: top ? top.set : null, discardCount: pl.discard.length };
}

export function hideCard(c: Card): HiddenCard {
  return { id: c.id, set: c.set, owner: c.owner, hidden: true };
}

/** Builds the redacted view of `s` for `viewer`: the opponent's hand and both decks stay hidden. */
export function viewFor(s: GameState, viewer: PlayerIndex): PlayerView {
  const opp = other(viewer);
  // Note: `lastAction` never contains hidden information: played/discarded cards are public,
  // and a drawn card id is already visible as a hidden card in the opponent's hand.
  const lastAction = s.lastAction;
  return {
    you: viewer,
    phase: s.phase,
    turn: s.turn,
    turnNumber: s.turnNumber,
    firstPlayer: s.firstPlayer,
    winner: s.winner,
    endReason: s.endReason,
    caravans: s.caravans,
    bids: [s.caravans[0].map(caravanBid), s.caravans[1].map(caravanBid)],
    laneWinners: [0, 1, 2].map((l) => laneWinner(s, l as 0 | 1 | 2)),
    hand: s.players[viewer].hand,
    me: side(s, viewer),
    opponent: { ...side(s, opp), hand: s.players[opp].hand.map(hideCard) },
    lastAction,
    mulligans: s.mulligans,
  };
}
