import { expect, test } from '@playwright/test';
import { playOpeningMove, tableCardCount, waitForMyTurn } from './helpers';

test('menu → game vs AI → opening round → forfeit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('CARAVAN', { exact: true })).toBeVisible();
  await page.getByTestId('menu-ai').click();
  await page.getByTestId('ai-start').click();

  // Both hands are dealt: 8 face-up cards for us, 8 hidden ones for the AI.
  await expect(page.locator('[data-kind="hand"]')).toHaveCount(8);
  await expect(page.locator('[data-kind="opp-hand"]')).toHaveCount(8);
  await expect(page.locator('[data-kind="opp-hand"][data-card="hidden"]')).toHaveCount(8);

  // Opening round: three caravans each.
  for (let i = 0; i < 3; i++) {
    expect(await waitForMyTurn(page)).toBe(true);
    expect(await playOpeningMove(page)).toBe(true);
  }
  await expect.poll(() => tableCardCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(6);
  expect(await waitForMyTurn(page)).toBe(true);
  await expect(page.locator('[data-kind="hand"]')).toHaveCount(5);

  // Discard is possible in the main phase.
  await page.keyboard.press('1');
  await page.keyboard.press('q');
  await expect(page.locator('.hud-turn.is-mine')).toHaveCount(0);

  // Forfeit.
  expect(await waitForMyTurn(page)).toBe(true);
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'Forfeit', exact: true }).click();
  await expect(page.getByTestId('game-over')).toContainText('You lose');
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('[data-kind="hand"]')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('HUD color can be switched to green', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('menu-settings').click();
  await page.getByTestId('hud-green').click();
  const color = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hud').trim());
  expect(color).toBe('#1aff80');
});
