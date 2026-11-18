import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { STAGE_H, STAGE_W } from '../game/layout';

/** Fixed 1600×900 logical stage, scaled to fit the window (letterboxed). */
export function Stage({ children, className }: { children: ReactNode; className?: string }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return (
    <div className="viewport">
      <div className={`stage ${className ?? ''}`} style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
