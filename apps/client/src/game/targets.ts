import { facePlayError, isNumberCard, numberPlayError } from '@caravan/engine';
import type { Action, Card, CaravanIndex, PlayerIndex, PlayerView } from '@caravan/engine';

export interface Target {
  player: PlayerIndex;
  caravan: CaravanIndex;
  /** Number card the face card attaches to. Undefined for number cards (appended to the caravan). */
  cardIndex?: number;
}

const LANES: CaravanIndex[] = [0, 1, 2];

/** Every legal target for `card` given what the viewer can see (mirrors the engine validation). */
export function legalTargets(view: PlayerView, card: Card): Target[] {
  if (view.phase === 'ended' || view.turn !== view.you) return [];
  const out: Target[] = [];
  if (isNumberCard(card)) {
    for (const lane of LANES) {
      const c = view.caravans[view.you][lane];
      if (view.phase === 'opening' && c.cards.length > 0) continue;
      if (!numberPlayError(c, card)) out.push({ player: view.you, caravan: lane });
    }
    return out;
  }
  if (view.phase !== 'main') return out;
  for (const p of [0, 1] as PlayerIndex[]) {
    for (const lane of LANES) {
      const c = view.caravans[p][lane];
      for (let i = 0; i < c.cards.length; i++) {
        if (!facePlayError(c, i, card)) out.push({ player: p, caravan: lane, cardIndex: i });
      }
    }
  }
  return out;
}

export function targetToAction(card: Card, t: Target): Action {
  return { type: 'play', cardId: card.id, target: { player: t.player, caravan: t.caravan }, cardIndex: t.cardIndex };
}

/** Finds where a card id sits on the table. */
export function locateOnTable(view: PlayerView, id: string): { player: PlayerIndex; caravan: CaravanIndex; index: number; attachment: number } | null {
  for (const p of [0, 1] as PlayerIndex[]) {
    for (const lane of LANES) {
      const cards = view.caravans[p][lane].cards;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i].card.id === id) return { player: p, caravan: lane, index: i, attachment: -1 };
        const a = cards[i].attachments.findIndex((x) => x.id === id);
        if (a >= 0) return { player: p, caravan: lane, index: i, attachment: a };
      }
    }
  }
  return null;
}
