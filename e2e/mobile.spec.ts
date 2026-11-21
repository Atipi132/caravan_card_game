import { expect, test } from '@playwright/test';
import { isMyTurn, waitForMyTurn } from './helpers';

test.describe('Mobile portrait (390×844 touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('menus, settings, deck builder, and online lobby fit without horizontal overflow', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await expect(page.getByText('CARAVAN', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Settings: switch to green HUD and back
    await page.getByTestId('menu-settings').tap();
    await page.getByTestId('hud-green').tap();
    const color = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hud').trim());
    expect(color).toBe('#1aff80');
    await page.getByTestId('hud-amber').tap();
    await page.getByRole('button', { name: 'Back' }).tap();

    // Deck Builder: remove a card and verify count updates
    await page.getByTestId('menu-deck').tap();
    const before = Number(await page.getByTestId('deck-count').textContent());
    await page.locator('.db-row').first().locator('.db-card').first().tap();
    await expect(page.getByTestId('deck-count')).toHaveText(String(before - 1));
    await page.getByRole('button', { name: 'Standard Deck' }).tap();
    await expect(page.getByTestId('deck-count')).toHaveText('54');
    await page.getByRole('button', { name: 'Back' }).tap();

    // Online Lobby: create a private room and confirm room code stays inside viewport
    await page.getByTestId('menu-online').tap();
    await expect(page.getByText(/^Connected/)).toBeVisible();
    await page.getByTestId('online-create').tap();
    await page.getByTestId('room-create').tap();
    const codeBox = await page.getByTestId('room-code').boundingBox();
    expect(codeBox).not.toBeNull();
    expect(codeBox!.x + codeBox!.width).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Close room' }).tap();
    expect(errors).toEqual([]);
  });

  test('portrait game vs AI: tap-to-select, tap-to-place, large cards, discard, and forfeit', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await page.getByTestId('menu-ai').tap();
    await page.getByTestId('ai-start').tap();

    await expect(page.getByTestId('mobile-portrait-board')).toBeVisible();
    await expect(page.locator('[data-kind="hand"]')).toHaveCount(8);

    // Hand cards should be comfortably sized (>= 70px wide on a 390px phone, vs ~25px scaled).
    const firstHandBox = await page.locator('[data-kind="hand"]').first().boundingBox();
    expect(firstHandBox).not.toBeNull();
    expect(firstHandBox!.width).toBeGreaterThanOrEqual(70);

    // Play the opening round using touch taps only (select a number card, then tap an empty target lane).
    for (let turn = 0; turn < 3; turn++) {
      expect(await waitForMyTurn(page)).toBe(true);
      const hand = page.locator('[data-kind="hand"]');
      const n = await hand.count();
      let played = false;
      for (let i = 0; i < n && !played; i++) {
        const card = hand.nth(i);
        const code = (await card.getAttribute('data-card')) ?? '';
        if (/^(J|Q|K)[SHDC]$/.test(code) || code === 'JOKER') continue;
        // Tap the left exposed strip of the card so overlapping neighbors never intercept.
        await card.tap({ position: { x: 18, y: 40 } });
        const target = page.locator('.m-lane-zone.is-target').first();
        if ((await target.count()) > 0) {
          await target.tap();
          await page.waitForTimeout(200);
          if (!(await isMyTurn(page))) played = true;
        }
      }
      expect(played).toBe(true);
    }

    // Main phase reached with 5 cards in hand and >= 6 number cards on table.
    await expect.poll(() => page.locator('[data-kind="caravan"]').count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(6);
    expect(await waitForMyTurn(page)).toBe(true);
    await expect(page.locator('[data-kind="hand"]')).toHaveCount(5);

    // Table cards should also be large and readable (>= 70px wide).
    const tableCardBox = await page.locator('[data-kind="caravan"]').first().boundingBox();
    expect(tableCardBox).not.toBeNull();
    expect(tableCardBox!.width).toBeGreaterThanOrEqual(70);

    // Discard via the touch action bar.
    await page.locator('[data-kind="hand"]').first().tap({ position: { x: 20, y: 40 } });
    await page.getByRole('button', { name: 'Discard', exact: true }).tap();
    await expect(page.locator('.hud-turn.is-mine')).toHaveCount(0);

    // Forfeit via touch action bar.
    expect(await waitForMyTurn(page)).toBe(true);
    await page.getByRole('button', { name: 'Forfeit', exact: true }).tap();
    await page.locator('.pip-box').getByRole('button', { name: 'Forfeit', exact: true }).tap();
    await expect(page.getByTestId('game-over')).toContainText('You lose');
    expect(errors).toEqual([]);
  });

  test('face-card target picker opens when playing King on a multi-card caravan', async ({ page }) => {
    // Configure a valid 30-card deck of spades numbers + Kings so we deterministically build a 2-card caravan and have a King.
    await page.goto('/');
    await page.evaluate(() => {
      const deck = [];
      for (const set of ['atomic', 'lucky'] as const) {
        for (const rank of ['2', '3', '4', '5', '6', '7', '8', '9', '10']) {
          deck.push({ set, rank, suit: 'S' });
        }
      }
      for (const set of ['atomic', 'lucky', 'regal'] as const) {
        for (const suit of ['S', 'H', 'D', 'C']) {
          deck.push({ set, rank: 'K', suit });
        }
      }
      localStorage.setItem('caravan.deck', JSON.stringify(deck));
      localStorage.setItem('caravan.settings', JSON.stringify({ useCustomDeck: true }));
    });
    await page.reload();
    await page.getByTestId('menu-ai').tap();
    await page.getByTestId('ai-start').tap();

    // Complete opening round (3 number cards) + stack a 2nd number card onto lane 0.
    for (let turn = 0; turn < 4; turn++) {
      expect(await waitForMyTurn(page)).toBe(true);
      const hand = page.locator('[data-kind="hand"]');
      const n = await hand.count();
      let played = false;
      for (let i = 0; i < n && !played; i++) {
        const card = hand.nth(i);
        const code = (await card.getAttribute('data-card')) ?? '';
        if (code.startsWith('K')) continue;
        await card.tap({ position: { x: 18, y: 40 } });
        const zones = page.locator('.m-lane-zone.is-target');
        const zc = await zones.count();
        for (let z = 0; z < zc && !played; z++) {
          await zones.nth(z).tap({ position: { x: 10, y: 10 }, force: true });
          await page.waitForTimeout(200);
          if (!(await isMyTurn(page))) played = true;
        }
      }
      expect(played).toBe(true);
    }

    // Now at least one caravan has 2+ cards; find a King (discarding once if needed) and tap a 2+ card caravan.
    let pickerOpened = false;
    for (let attempt = 0; attempt < 5 && !pickerOpened; attempt++) {
      expect(await waitForMyTurn(page)).toBe(true);
      const hand = page.locator('[data-kind="hand"]');
      const n = await hand.count();
      let kingIdx = -1;
      for (let i = 0; i < n; i++) {
        const code = (await hand.nth(i).getAttribute('data-card')) ?? '';
        if (code.startsWith('K')) {
          kingIdx = i;
          break;
        }
      }
      if (kingIdx === -1) {
        await hand.first().tap({ position: { x: 18, y: 40 } });
        await page.getByRole('button', { name: 'Discard', exact: true }).tap();
        continue;
      }
      await hand.nth(kingIdx).tap({ position: { x: 18, y: 40 } });
      const zones = page.locator('.m-lane-zone.is-target');
      const zc = await zones.count();
      for (let z = 0; z < zc; z++) {
        await zones.nth(z).tap({ position: { x: 10, y: 10 }, force: true });
        await page.waitForTimeout(200);
        if ((await page.getByTestId('target-picker').count()) > 0) {
          pickerOpened = true;
          await expect(page.getByTestId('picker-card-0')).toBeVisible();
          await expect(page.getByTestId('picker-card-1')).toBeVisible();
          // Pick the second card from the enlarged picker sheet.
          await page.getByTestId('picker-card-1').tap();
          await expect(page.getByTestId('target-picker')).toHaveCount(0);
          break;
        }
        // If that lane only had 1 card, King played immediately — break and retry next turn.
        if (!(await isMyTurn(page))) break;
      }
    }
    expect(pickerOpened).toBe(true);
  });
});

test.describe('Mobile landscape (844×390 touch)', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('landscape game hides PC keycap prompts and stays playable via touch', async ({ page }) => {
    await page.goto('/?mode=ai');
    await page.getByTestId('ai-start').tap();

    await expect(page.locator('.stage.is-landscape')).toBeVisible();
    // PC-only "Select Card W)" prompt is hidden on touch landscape.
    await expect(page.getByRole('button', { name: /Select Card/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Forfeit Game', exact: true })).toBeVisible();
    await expect(page.locator('[data-kind="hand"]')).toHaveCount(8);
  });
});
