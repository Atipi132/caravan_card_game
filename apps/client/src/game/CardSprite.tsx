import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { Sprite } from './layout';
import { CARD_H, CARD_W } from './layout';
import { CardImage } from './CardImage';

export interface SpriteVisualState {
  selected: boolean;
  /** A legal target for the selected card. */
  target: boolean;
  /** Hovered while being a legal target. */
  hot: boolean;
  /** Recently played card (brief highlight). */
  recent: boolean;
  interactive: boolean;
}

interface Props {
  sprite: Sprite;
  initialPos: { x: number; y: number; rotate: number } | false;
  exitPos: { x: number; y: number };
  visual: SpriteVisualState;
  onClick?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

const MOVE = { type: 'tween' as const, ease: [0.22, 0.8, 0.25, 1] as [number, number, number, number], duration: 0.5 };

function CardSpriteImpl({ sprite, initialPos, exitPos, visual, onClick, onHover }: Props) {
  // While a card travels, keep it above everything else, then drop to its resting z-index.
  const [flying, setFlying] = useState(initialPos !== false);
  const last = useRef({ x: sprite.x, y: sprite.y });
  useEffect(() => {
    const moved = Math.abs(last.current.x - sprite.x) + Math.abs(last.current.y - sprite.y) > 40;
    last.current = { x: sprite.x, y: sprite.y };
    if (moved) setFlying(true);
  }, [sprite.x, sprite.y]);

  const cls = [
    'sprite',
    `sprite-${sprite.kind}`,
    visual.selected && 'is-selected',
    visual.target && 'is-target',
    visual.hot && 'is-hot',
    visual.recent && 'is-recent',
    visual.interactive && 'is-interactive',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <motion.div
      className={cls}
      data-card-id={sprite.id}
      data-card={sprite.card ? (sprite.card.rank === 'JOKER' ? 'JOKER' : `${sprite.card.rank}${sprite.card.suit}`) : 'hidden'}
      data-kind={sprite.kind}
      style={{ width: CARD_W, height: CARD_H, zIndex: flying ? 900 + sprite.z : sprite.z }}
      initial={initialPos === false ? false : { ...initialPos, opacity: 1 }}
      animate={{ x: sprite.x, y: sprite.y, rotate: sprite.rotate, opacity: 1 }}
      exit={{ x: exitPos.x, y: exitPos.y, rotate: sprite.rotate + 25, opacity: 1, transition: { duration: 0.6, ease: 'easeIn' } }}
      transition={MOVE}
      onAnimationComplete={() => setFlying(false)}
      onClick={onClick ? (e) => {
        e.stopPropagation();
        onClick(sprite.id);
      } : undefined}
      onPointerEnter={onHover ? () => onHover(sprite.id) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      <CardImage spec={sprite.card} set={sprite.set} faceUp={sprite.faceUp} seed={sprite.id} />
      <div className="sprite-tint" />
    </motion.div>
  );
}

export const CardSprite = memo(CardSpriteImpl, (a, b) => {
  const s1 = a.sprite;
  const s2 = b.sprite;
  return (
    s1.x === s2.x &&
    s1.y === s2.y &&
    s1.rotate === s2.rotate &&
    s1.z === s2.z &&
    s1.faceUp === s2.faceUp &&
    s1.card === s2.card &&
    s1.kind === s2.kind &&
    a.exitPos.x === b.exitPos.x &&
    a.exitPos.y === b.exitPos.y &&
    a.visual.selected === b.visual.selected &&
    a.visual.target === b.visual.target &&
    a.visual.hot === b.visual.hot &&
    a.visual.recent === b.visual.recent &&
    a.visual.interactive === b.visual.interactive &&
    a.onClick === b.onClick &&
    a.onHover === b.onHover
  );
});
