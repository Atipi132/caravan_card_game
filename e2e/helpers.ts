import type { Page } from '@playwright/test';

export async function isMyTurn(page: Page): Promise<boolean> {
  return (await page.locator('.hud-turn.is-mine').count()) > 0;
}

export async function waitForMyTurn(page: Page, timeout = 15_000): Promise<boolean> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await isMyTurn(page)) return true;
    if ((await page.locator('[data-testid="game-over"]').count()) > 0) return false;
    await page.waitForTimeout(150);
  }
  return false;
}

/**
 * Plays one opening move with the keyboard: select a number card (digits) and start a caravan (A/S/D).
 * Returns false if no move could be made.
 */
export async function playOpeningMove(page: Page): Promise<boolean> {
  const hand = page.locator('[data-kind="hand"]');
  const n = await hand.count();
  for (let i = 0; i < n; i++) {
    const code = (await hand.nth(i).getAttribute('data-card')) ?? '';
    if (/^(J|Q|K)[SHDC]$/.test(code) || code === 'JOKER') continue;
    await page.keyboard.press(String(i + 1));
    for (const key of ['a', 's', 'd']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
      if (!(await isMyTurn(page))) return true;
    }
    await page.keyboard.press('r');
  }
  return false;
}

/** Number of number cards on the caravans of one side ('me' rows are below the names). */
export async function tableCardCount(page: Page): Promise<number> {
  return page.locator('[data-kind="caravan"]').count();
}
