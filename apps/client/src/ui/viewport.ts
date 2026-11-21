import { useEffect, useState } from 'react';

export type LayoutMode = 'desktop' | 'mobile-portrait' | 'mobile-landscape';

export interface ViewportInfo {
  mode: LayoutMode;
  isMobile: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
  isTouch: boolean;
  width: number;
  height: number;
}

/**
 * Classifies a viewport size into desktop, mobile-portrait, or mobile-landscape.
 * Desktop (`width >= 900 && height >= 540`) is preserved 100% unchanged.
 */
export function classifyViewport(width: number, height: number): LayoutMode {
  if (width >= 900 && height >= 540) return 'desktop';
  return height >= width ? 'mobile-portrait' : 'mobile-landscape';
}

function readViewport(): ViewportInfo {
  if (typeof window === 'undefined') {
    return { mode: 'desktop', isMobile: false, isPortrait: false, isLandscape: true, isTouch: false, width: 1600, height: 900 };
  }
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  const mode = classifyViewport(width, height);
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return {
    mode,
    isMobile: mode !== 'desktop',
    isPortrait: mode === 'mobile-portrait',
    isLandscape: mode === 'mobile-landscape',
    isTouch,
    width,
    height,
  };
}

export function useViewport(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(readViewport);

  useEffect(() => {
    const update = () => {
      const next = readViewport();
      setInfo((cur) =>
        cur.mode === next.mode && cur.isTouch === next.isTouch && cur.width === next.width && cur.height === next.height ? cur : next,
      );
    };
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    const mq = window.matchMedia?.('(pointer: coarse)');
    mq?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      mq?.removeEventListener?.('change', update);
    };
  }, []);

  return info;
}
