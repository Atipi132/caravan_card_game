import type { ReactNode } from 'react';
import { STAGE_H, STAGE_W } from '../game/layout';
import { useViewport } from './viewport';

interface StageProps {
  children: ReactNode;
  className?: string;
  /**
   * On short mobile-landscape viewports, the game board scales the 16:9 stage while
   * menus/lobby/deck-builder/settings/rules stay in a native scrollable container.
   */
  scalableInLandscape?: boolean;
}

/**
 * Desktop (`width >= 900 && height >= 540`): fixed 1600×900 letterboxed stage (unchanged).
 * Mobile: full-viewport native container (`100vw × 100dvh`, safe-area aware), or scaled 16:9
 * stage with touch styling when rendering the game table in landscape.
 */
export function Stage({ children, className, scalableInLandscape = false }: StageProps) {
  const vp = useViewport();

  if (vp.mode === 'desktop') {
    const scale = Math.min(vp.width / STAGE_W, vp.height / STAGE_H);
    return (
      <div className="viewport">
        <div className={`stage ${className ?? ''}`} style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          {children}
        </div>
      </div>
    );
  }

  const flags = `is-mobile ${vp.isPortrait ? 'is-portrait' : 'is-landscape'} ${vp.isTouch ? 'is-touch' : ''} ${className ?? ''}`;

  if (vp.isLandscape && scalableInLandscape) {
    const scale = Math.min(vp.width / STAGE_W, vp.height / STAGE_H);
    return (
      <div className={`viewport ${flags}`}>
        <div className={`stage ${flags}`} style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className={`viewport viewport-mobile ${flags}`}>
      <div className={`stage-mobile ${flags}`}>{children}</div>
    </div>
  );
}
