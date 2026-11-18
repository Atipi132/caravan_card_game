import type { CardSet, CardSpec } from '@caravan/engine';
import { hash } from './layout';

export function faceUrl(spec: Pick<CardSpec, 'rank' | 'suit' | 'jokerIndex'>): string {
  if (spec.rank === 'JOKER') return `/assets/cards/JOKER${spec.jokerIndex ?? 1}.svg`;
  return `/assets/cards/${spec.rank}${spec.suit}.svg`;
}

export function backUrl(set: CardSet): string {
  return set === 'classic' ? '/assets/backs/classic.svg' : `/assets/backs/${set}.webp`;
}

export const SET_LABELS: Record<CardSet, string> = {
  classic: 'Standard',
  atomic: 'The Atomic',
  regal: 'Regal',
  lucky: 'Lucky 7',
  crimson: 'Crimson',
  bunker: 'Bunker 21',
};

/** Worn-card overlay chosen deterministically from the card id. */
function wearStyle(seed: string): React.CSSProperties {
  const h = hash(seed);
  const variant = (h % 3) + 1;
  const flip = (h >> 3) % 4;
  const transforms = ['none', 'rotate(180deg)', 'scaleX(-1)', 'scaleY(-1)'];
  return { backgroundImage: `url(/assets/textures/wear${variant}.webp)`, transform: transforms[flip] };
}

interface CardImageProps {
  spec: Pick<CardSpec, 'rank' | 'suit' | 'jokerIndex' | 'set'> | null;
  set: CardSet;
  faceUp: boolean;
  seed: string;
  className?: string;
}

/** Static (non animated) card with front & back faces; flips with a CSS 3D rotation. */
export function CardImage({ spec, set, faceUp, seed, className }: CardImageProps) {
  return (
    <div className={`card-img ${faceUp ? 'is-up' : 'is-down'} ${className ?? ''}`}>
      <div className="card-inner">
        {spec && (
          <div className="card-face card-front">
            <img src={faceUrl(spec)} alt="" draggable={false} />
            <div className="card-wear" style={wearStyle(seed)} />
          </div>
        )}
        <div className="card-face card-back">
          <img src={backUrl(set)} alt="" draggable={false} />
          <div className="card-wear card-wear-back" style={wearStyle(seed + 'b')} />
        </div>
      </div>
    </div>
  );
}
