import { expect, test } from '@playwright/test';

test('SEO assets, metadata, /how-to-play guide, and 404 handling', async ({ page, request }) => {
  // Home page metadata & internal link to /how-to-play
  await page.goto('/');
  await expect(page).toHaveTitle(/Caravan Online/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/og-image\.jpg$/);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  await expect(page.locator('a[href="/how-to-play"]')).toBeVisible();

  // Navigate to the static rules & FAQ guide and deep-link back into AI setup
  await page.locator('a[href="/how-to-play"]').click();
  await expect(page).toHaveURL(/\/how-to-play$/);
  await expect(page.locator('h1')).toContainText('How to Play Caravan');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

  await page.locator('a[href="/?mode=ai"]').first().click();
  await expect(page.getByTestId('ai-start')).toBeVisible();

  // Crawlability endpoints & social assets
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Sitemap:');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('/how-to-play');

  const og = await request.get('/og-image.jpg');
  expect(og.status()).toBe(200);
  expect(og.headers()['content-type']).toContain('image/jpeg');

  const manifest = await request.get('/site.webmanifest');
  expect(manifest.status()).toBe(200);

  const missing = await request.get('/this-page-does-not-exist');
  expect(missing.status()).toBe(404);
});
