import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpHandler, DEFAULT_SITE_URL } from '../src/http';

describe('HTTP / SEO handler', () => {
  let dir = '';
  let baseUrl = '';
  const server = createServer();

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'caravan-http-'));
    writeFileSync(
      join(dir, 'index.html'),
      `<!doctype html><html><head><link rel="canonical" href="${DEFAULT_SITE_URL}/" /><title>Caravan</title></head><body>home</body></html>`,
    );
    writeFileSync(
      join(dir, 'how-to-play.html'),
      `<!doctype html><html><head><link rel="canonical" href="${DEFAULT_SITE_URL}/how-to-play" /><title>Rules</title></head><body>rules</body></html>`,
    );
    writeFileSync(join(dir, 'favicon.svg'), '<svg></svg>');

    server.on(
      'request',
      createHttpHandler({
        staticDir: dir,
        siteUrl: 'https://playcaravan.example',
        googleVerification: 'google-token-123',
        bingVerification: 'bing-token-456',
        getStats: () => ({ online: 2, games: 1, queue: 0, rooms: 0 }),
      }),
    );
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves robots.txt and sitemap.xml with configured SITE_URL', async () => {
    const robots = await fetch(`${baseUrl}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(robots.headers.get('content-type')).toContain('text/plain');
    const rText = await robots.text();
    expect(rText).toContain('Allow: /');
    expect(rText).toContain('Disallow: /healthz');
    expect(rText).toContain('Sitemap: https://playcaravan.example/sitemap.xml');

    const sitemap = await fetch(`${baseUrl}/sitemap.xml`);
    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get('content-type')).toContain('application/xml');
    const sText = await sitemap.text();
    expect(sText).toContain('<loc>https://playcaravan.example/</loc>');
    expect(sText).toContain('<loc>https://playcaravan.example/how-to-play</loc>');
  });

  it('rewrites canonical URL, injects verification meta tags, and supports compression', async () => {
    const res = await fetch(`${baseUrl}/`, { headers: { 'accept-encoding': 'br, gzip' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBeNull();
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('etag')).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('href="https://playcaravan.example/"');
    expect(html).toContain('<meta name="google-site-verification" content="google-token-123" />');
    expect(html).toContain('<meta name="msvalidate.01" content="bing-token-456" />');
  });

  it('marks ?room= and /healthz as noindex', async () => {
    const room = await fetch(`${baseUrl}/?room=ABCDE`);
    expect(room.status).toBe(200);
    expect(room.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    const health = await fetch(`${baseUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(health.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await health.json()).toEqual({ ok: true, online: 2, games: 1, queue: 0, rooms: 0 });
  });

  it('serves /how-to-play and 301-redirects duplicate paths', async () => {
    const guide = await fetch(`${baseUrl}/how-to-play`);
    expect(guide.status).toBe(200);
    expect(await guide.text()).toContain('href="https://playcaravan.example/how-to-play"');

    for (const alias of ['/how-to-play/', '/how-to-play.html']) {
      const r = await fetch(`${baseUrl}${alias}`, { redirect: 'manual' });
      expect(r.status).toBe(301);
      expect(r.headers.get('location')).toBe('/how-to-play');
    }

    const idx = await fetch(`${baseUrl}/index.html`, { redirect: 'manual' });
    expect(idx.status).toBe(301);
    expect(idx.headers.get('location')).toBe('/');
  });

  it('returns a real 404 (not a soft 200) for unknown paths', async () => {
    const res = await fetch(`${baseUrl}/not-a-real-page`);
    expect(res.status).toBe(404);
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(await res.text()).toContain('404');
  });

  it('supports optional canonical host redirect', async () => {
    const s2 = createServer(
      createHttpHandler({
        staticDir: dir,
        siteUrl: 'https://playcaravan.example',
        canonicalRedirect: true,
        getStats: () => ({}),
      }),
    );
    await new Promise<void>((r) => s2.listen(0, '127.0.0.1', () => r()));
    const port = (s2.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/how-to-play`, { redirect: 'manual' });
      expect(res.status).toBe(301);
      expect(res.headers.get('location')).toBe('https://playcaravan.example/how-to-play');
      // /healthz must never redirect so platform health checks stay 200.
      const health = await fetch(`http://127.0.0.1:${port}/healthz`, { redirect: 'manual' });
      expect(health.status).toBe(200);
    } finally {
      s2.close();
    }
  });
});
