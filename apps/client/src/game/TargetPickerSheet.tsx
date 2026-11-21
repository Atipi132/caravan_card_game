import { placedValue } from '@caravan/engine';
import type { Card, Caravan, PlayerIndex } from '@caravan/engine';
import { CardImage } from './CardImage';
import { titleCase } from './text';

interface TargetPickerSheetProps {
  selectedCard: Card;
  caravan: Caravan;
  caravanTitle: string;
  targetPlayer: PlayerIndex;
  me: PlayerIndex;
  legalIndices: Set<number>;
  onPick: (cardIndex: number) => void;
  onCancel: () => void;
}

/**
 * Mobile helper sheet: when playing a Jack, King, or Joker onto a caravan with
 * multiple valid number cards, shows each card large and un-overlapped so thumbs
 * can pick the exact target without accidental mistaps.
 */
export function TargetPickerSheet({
  selectedCard,
  caravan,
  caravanTitle,
  targetPlayer,
  me,
  legalIndices,
  onPick,
  onCancel,
}: TargetPickerSheetProps) {
  const whose = targetPlayer === me ? 'your' : "opponent's";
  const actionVerb =
    selectedCard.rank === 'J'
      ? 'Remove a card from'
      : selectedCard.rank === 'K'
        ? 'Double a card in'
        : 'Play Joker on';

  return (
    <div className="modal-backdrop picker-backdrop" onClick={onCancel} data-testid="target-picker">
      <div className="pip-box picker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="picker-header">
          <div className="pip-title picker-title">
            {actionVerb} {whose} {titleCase(caravanTitle)}
          </div>
          <div className="picker-sub dim">Tap a highlighted card to apply {selectedCard.rank === 'JOKER' ? 'Joker' : selectedCard.rank}.</div>
        </div>

        <div className="picker-cards">
          {caravan.cards.map((placed, index) => {
            const legal = legalIndices.has(index);
            const val = placedValue(placed);
            return (
              <button
                key={placed.card.id}
                type="button"
                className={`picker-card-btn ${legal ? 'is-legal' : 'is-full'}`}
                disabled={!legal}
                data-testid={`picker-card-${index}`}
                onClick={() => legal && onPick(index)}
              >
                <div className="picker-card-art">
                  <CardImage spec={placed.card} set={placed.card.set} faceUp seed={placed.card.id} />
                </div>
                <div className="picker-card-meta">
                  <span className="picker-card-val">{val}</span>
                  {placed.attachments.length > 0 && (
                    <span className="picker-card-att">
                      {placed.attachments.map((a) => (a.rank === 'JOKER' ? 'JKR' : a.rank)).join('+')}
                    </span>
                  )}
                  {!legal && <span className="picker-card-full warn">Full (3/3)</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="pip-actions picker-actions">
          <button type="button" className="pip-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
