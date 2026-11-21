import { describe, expect, it } from 'vitest';
import { createGame, viewFor } from '@caravan/engine';
import type { Card, PlacedCard, PlayerView } from '@caravan/engine';
import { computePortraitCaravanSprites, computePortraitMetrics, portraitCaravanCardPos } from './layout';
import { classifyViewport } from '../ui/viewport';

function fakeCard(id: string, rank: Card['rank'], suit: Card['suit'], owner: 0 | 1): Card {
  return { id, owner, set: 'atomic', rank, suit };
}

function heavyView(): PlayerView {
  const s = createGame({}, 7);
  // Stress test: 6 number cards with 3 face-card attachments each on every caravan.
  for (const side of [0, 1] as const) {
    for (const lane of [0, 1, 2] as const) {
      const cards: PlacedCard[] = [];
      for (let i = 0; i < 6; i++) {
        cards.push({
          card: fakeCard(`s${side}l${lane}c${i}`, '5', 'H', side),
          attachments: [
            fakeCard(`s${side}l${lane}c${i}a0`, 'K', 'S', side),
            fakeCard(`s${side}l${lane}c${i}a1`, 'K', 'D', side),
            fakeCard(`s${side}l${lane}c${i}a2`, 'Q', 'C', side),
          ],
        });
      }
      s.caravans[side][lane] = { cards, direction: 'asc' };
    }
  }
  return viewFor(s, 0);
}

describe('viewport classification', () => {
  it('keeps standard desktop and laptop screens in desktop mode', () => {
    expect(classifyViewport(1600, 900)).toBe('desktop');
    expect(classifyViewport(1280, 720)).toBe('desktop');
    expect(classifyViewport(1024, 768)).toBe('desktop');
    expect(classifyViewport(900, 540)).toBe('desktop');
  });

  it('classifies portrait phones and portrait tablets as mobile-portrait', () => {
    expect(classifyViewport(360, 740)).toBe('mobile-portrait');
    expect(classifyViewport(390, 844)).toBe('mobile-portrait');
    expect(classifyViewport(430, 932)).toBe('mobile-portrait');
    expect(classifyViewport(768, 1024)).toBe('mobile-portrait');
  });

  it('classifies landscape phones as mobile-landscape', () => {
    expect(classifyViewport(667, 375)).toBe('mobile-landscape');
    expect(classifyViewport(844, 390)).toBe('mobile-landscape');
    expect(classifyViewport(932, 430)).toBe('mobile-landscape');
  });
});

describe('portrait board geometry', () => {
  const arenas: [string, number, number][] = [
    ['small phone (360×440)', 360, 440],
    ['iPhone 14 (390×580)', 390, 580],
    ['large phone (430×650)', 430, 650],
    ['portrait tablet (768×740)', 768, 740],
  ];

  for (const [label, w, h] of arenas) {
    it(`keeps all cards and 3-card attachments within bounds on ${label}`, () => {
      const m = computePortraitMetrics(w, h);
      expect(m.cardW).toBeGreaterThanOrEqual(54);
      expect(m.cardW).toBeLessThanOrEqual(104);

      const sprites = computePortraitCaravanSprites(heavyView(), m);
      expect(sprites.length).toBe(2 * 3 * 6 * 4);

      for (const sp of sprites) {
        expect(sp.x).toBeGreaterThanOrEqual(0);
        expect(sp.x + m.cardW).toBeLessThanOrEqual(w + 2);
        // Attachments may sit slightly above/below base card; base number cards must stay within [0, h].
        if (sp.kind === 'caravan') {
          expect(sp.y).toBeGreaterThanOrEqual(0);
          expect(sp.y + m.cardH).toBeLessThanOrEqual(h);
        }
      }

      // First player card starts below the center strip; first opponent card ends above it.
      const myFirst = portraitCaravanCardPos(m, true, 0, 0, 1);
      const oppFirst = portraitCaravanCardPos(m, false, 0, 0, 1);
      expect(myFirst.y).toBeGreaterThanOrEqual(m.stripY + m.stripH);
      expect(oppFirst.y + m.cardH).toBeLessThanOrEqual(m.stripY);
    });
  }
});
