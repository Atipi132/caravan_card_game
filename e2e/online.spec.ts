import { expect, test } from '@playwright/test';
import { isMyTurn, playOpeningMove, waitForMyTurn } from './helpers';

test('private room: two browsers play the opening round together', async ({ browser }) => {
  const host = await (await browser.newContext()).newPage();
  const guest = await (await browser.newContext()).newPage();

  await host.goto('/');
  await host.getByTestId('menu-online').click();
  await expect(host.getByText(/^Connected/)).toBeVisible();
  await host.getByTestId('online-create').click();
  await host.getByTestId('room-create').click();
  const code = (await host.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{5}$/);

  // The guest follows the invitation link.
  await guest.goto(`/?room=${code}`);

  for (const p of [host, guest]) {
    await expect(p.locator('[data-kind="hand"]')).toHaveCount(8);
    await expect(p.locator('[data-kind="opp-hand"][data-card="hidden"]')).toHaveCount(8);
  }

  // Hidden information: the guest page never contains the host's hand.
  const hostCards = await host.locator('[data-kind="hand"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-card-id')));
  const guestHtml = await guest.content();
  for (const id of hostCards) {
    expect(guestHtml).toContain(id!); // the id is known (hidden card)…
  }
  expect(await guest.locator('[data-kind="opp-hand"]:not([data-card="hidden"])').count()).toBe(0); // …the face is not

  // Opening round, alternating between the two browsers.
  for (let move = 0; move < 6; move++) {
    const current = (await isMyTurn(host)) ? host : guest;
    expect(await waitForMyTurn(current)).toBe(true);
    expect(await playOpeningMove(current)).toBe(true);
    await current.waitForTimeout(300);
  }
  for (const p of [host, guest]) {
    await expect.poll(() => p.locator('[data-kind="caravan"]').count(), { timeout: 10_000 }).toBe(6);
    await expect(p.locator('[data-kind="hand"]')).toHaveCount(5);
  }

  // Guest leaves → host wins.
  const leaver = guest;
  await leaver.keyboard.press('b');
  await leaver.getByRole('button', { name: 'Forfeit', exact: true }).click();
  await expect(host.getByTestId('game-over')).toContainText('You win', { timeout: 10_000 });
});
