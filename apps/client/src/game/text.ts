import { cardLabel } from '@caravan/engine';
import type { AppliedAction, PlayerView } from '@caravan/engine';

export const CARAVAN_NAMES: [string[], string[]] = [
  // Index by "is opponent" → names (top row is the opponent's side, like in the original game).
  ['DAYGLOW', 'NEW RENO', 'THE HUB'],
  ['BONEYARD', 'REDDING', 'SHADY SANDS'],
];

export function caravanName(view: PlayerView, side: number, lane: number): string {
  return CARAVAN_NAMES[side === view.you ? 0 : 1][lane];
}

/** Human readable description of the last action, from the viewer's perspective. */
export function describeAction(view: PlayerView, a: AppliedAction, opponentName: string): string {
  const who = a.player === view.you ? 'You' : opponentName;
  switch (a.action.type) {
    case 'play': {
      const card = a.card ? cardLabel(a.card) : 'a card';
      const t = a.action.target;
      const name = caravanName(view, t.player, t.caravan);
      const whose = t.player === view.you ? 'your' : 'their';
      const removed = a.removedIds.length;
      let s = `${who} played ${card} on ${whose} ${titleCase(name)}`;
      if (a.card?.rank === 'J') s = `${who} played a Jack on ${whose} ${titleCase(name)}`;
      if (a.card?.rank === 'JOKER' && removed > 0) s += ` – ${removed} card${removed > 1 ? 's' : ''} removed`;
      return s;
    }
    case 'discard':
      return `${who} discarded ${a.card ? cardLabel(a.card) : 'a card'}`;
    case 'disband':
      return `${who} disbanded ${a.player === view.you ? 'your' : 'their'} ${titleCase(caravanName(view, a.player, a.action.caravan))} caravan`;
    case 'forfeit':
      return `${who} forfeited`;
    case 'timeout':
      return `${who} ran out of time`;
  }
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function endReasonText(view: PlayerView): string {
  const won = view.winner === view.you;
  switch (view.endReason) {
    case 'caravans':
      return won ? 'You sold the most caravans.' : 'Your opponent sold the most caravans.';
    case 'out-of-cards':
      return won ? 'Your opponent ran out of cards.' : 'You ran out of cards.';
    case 'forfeit':
      return won ? 'Your opponent forfeited.' : 'You forfeited the game.';
    case 'timeout':
      return won ? 'Your opponent ran out of time.' : 'You ran out of time.';
    default:
      return '';
  }
}
