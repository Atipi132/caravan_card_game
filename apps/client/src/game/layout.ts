import type { Card, CardSet, CaravanIndex, PlayerIndex, PlayerView } from '@caravan/engine';
import type { HiddenCard } from '@caravan/engine';

/** Logical stage size; the whole scene is scaled to fit the window. */
export const STAGE_W = 1600;
export const STAGE_H = 900;
export const CARD_W = 104;
export const CARD_H = 146;

/** Left edge of each caravan column (both sides share the columns, like in the original game). */
export const COL_X = [300, 560, 820];
/** Top of the first card of the player's caravans. */
export const PLAYER_ROW_Y = 452;
/** Top of the first card of the opponent's caravans (later cards stack upward). */
export const OPP_ROW_Y = 212;
const MAX_STEP = 34;
const ATTACH_DX = 32;
const ATTACH_DY = 9;

export const DECK_POS = {
  me: { x: 1340, y: 492 },
  opp: { x: 1340, y: 196 },
};
const HAND_CENTER = {
  me: { x: 1135, y: 500 },
  opp: { x: 1135, y: 196 },
};

/** Vertical band (y range) of each side's caravan area, used for click zones. */
export const ZONES = {
  me: { top: 440, bottom: 890 },
  opp: { top: 10, bottom: 370 },
};

export type SpriteKind = 'hand' | 'opp-hand' | 'caravan' | 'attachment';

export interface Sprite {
  id: string;
  kind: SpriteKind;
  owner: PlayerIndex;
  set: CardSet;
  /** Known face, or null for hidden cards. */
  card: Card | null;
  x: number;
  y: number;
  rotate: number;
  z: number;
  faceUp: boolean;
  /** Table location (caravan cards & attachments). */
  side?: PlayerIndex;
  lane?: CaravanIndex;
  index?: number;
}

export function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small deterministic jitter so cards don't look perfectly aligned. */
function jitter(id: string, amount: number): number {
  return (((hash(id) % 1000) / 1000) * 2 - 1) * amount;
}

export function caravanStep(n: number, available: number): number {
  if (n <= 1) return MAX_STEP;
  return Math.min(MAX_STEP, available / (n - 1));
}

/** Position of the n-th number card of a caravan. */
export function caravanCardPos(isMe: boolean, lane: number, index: number, count: number): { x: number; y: number } {
  const x = COL_X[lane];
  if (isMe) {
    const step = caravanStep(count, STAGE_H - 24 - CARD_H - PLAYER_ROW_Y);
    return { x, y: PLAYER_ROW_Y + index * step };
  }
  const step = caravanStep(count, OPP_ROW_Y - 8);
  return { x, y: OPP_ROW_Y - index * step };
}

function fan(count: number, center: { x: number; y: number }, spacing: number, i: number, mirror: boolean) {
  const mid = (count - 1) / 2;
  const d = i - mid;
  const x = center.x - CARD_W / 2 + d * spacing;
  const arc = d * d * 2.2;
  return { x, y: center.y + (mirror ? -arc : arc), rotate: d * (mirror ? -4 : 4) };
}

export interface LayoutOptions {
  selectedId: string | null;
  hoveredHandId: string | null;
}

export function computeLayout(view: PlayerView, opts: LayoutOptions): Sprite[] {
  const sprites: Sprite[] = [];
  const me = view.you;

  // Caravans
  for (const side of [0, 1] as PlayerIndex[]) {
    const isMe = side === me;
    view.caravans[side].forEach((caravan, lane) => {
      const n = caravan.cards.length;
      caravan.cards.forEach((placed, index) => {
        const pos = caravanCardPos(isMe, lane, index, n);
        // Newer cards are drawn on top (they overlap the previous ones).
        const z = 20 + index * 5;
        sprites.push({
          id: placed.card.id,
          kind: 'caravan',
          owner: placed.card.owner,
          set: placed.card.set,
          card: placed.card,
          x: pos.x + jitter(placed.card.id, 2),
          y: pos.y,
          rotate: jitter(placed.card.id + 'r', 1.6),
          z,
          faceUp: true,
          side,
          lane: lane as CaravanIndex,
          index,
        });
        placed.attachments.forEach((a, ai) => {
          sprites.push({
            id: a.id,
            kind: 'attachment',
            owner: a.owner,
            set: a.set,
            card: a,
            x: pos.x + ATTACH_DX * (ai + 1),
            y: pos.y + ATTACH_DY * (ai + 1),
            rotate: jitter(a.id + 'r', 2.5),
            z: z + 1 + ai,
            faceUp: true,
            side,
            lane: lane as CaravanIndex,
            index,
          });
        });
      });
    });
  }

  // Player hand (face up)
  const hand = view.hand;
  hand.forEach((card, i) => {
    const f = fan(hand.length, HAND_CENTER.me, Math.min(46, 290 / Math.max(1, hand.length - 1)), i, false);
    let y = f.y;
    if (card.id === opts.selectedId) y -= 34;
    else if (card.id === opts.hoveredHandId) y -= 14;
    sprites.push({ id: card.id, kind: 'hand', owner: me, set: card.set, card, x: f.x, y, rotate: f.rotate, z: 400 + i, faceUp: true });
  });

  // Opponent hand (hidden)
  const opp = view.opponent.hand;
  opp.forEach((c: HiddenCard, i) => {
    const f = fan(opp.length, HAND_CENTER.opp, 30, i, true);
    sprites.push({ id: c.id, kind: 'opp-hand', owner: c.owner, set: c.set, card: null, x: f.x, y: f.y, rotate: f.rotate, z: 300 + i, faceUp: false });
  });

  return sprites;
}

/** Where a newly appearing card starts its animation (top of its owner's deck). */
export function spawnPoint(view: PlayerView, owner: PlayerIndex) {
  return owner === view.you ? DECK_POS.me : DECK_POS.opp;
}

/** Where a removed card flies to (off the table, towards its owner). */
export function exitPoint(view: PlayerView, owner: PlayerIndex, x: number) {
  return owner === view.you ? { x: x + 60, y: STAGE_H + 120 } : { x: x + 60, y: -CARD_H - 120 };
}
