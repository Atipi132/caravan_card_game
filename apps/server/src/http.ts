import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import sirv from 'sirv';

export const DEFAULT_SITE_URL = 'https://caravan-card-game.fly.dev';

export interface HttpHandlerOptions {
  staticDir?: string;
  siteUrl?: string;
  /** When true, 301-redirect requests on a different Host header to `siteUrl`. */
  canonicalRedirect?: boolean;
  googleVerification?: string;
  bingVerification?: string;
  getStats: () => Record<string, unknown>;
}

interface CachedPage {
  raw: Buffer;
  gzip: Buffer;
  brotli: Buffer;
  etag: string;
  lastmod: string;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function loadPage(
  filePath: string,
  siteUrl: string,
  googleVerification?: string,
  bingVerification?: string,
): CachedPage | null {
  if (!existsSync(filePath)) return null;
  let html = readFileSync(filePath, 'utf8');
  if (siteUrl !== DEFAULT_SITE_URL) {
    html = html.replaceAll(DEFAULT_SITE_URL, siteUrl);
  }
  const extraTags: string[] = [];
  if (googleVerification) {
    extraTags.push(`<meta name="google-site-verification" content="${escapeAttr(googleVerification)}" />`);
  }
  if (bingVerification) {
    extraTags.push(`<meta name="msvalidate.01" content="${escapeAttr(bingVerification)}" />`);
  }
  if (extraTags.length > 0) {
    html = html.replace('</head>', `    ${extraTags.join('\n    ')}\n  </head>`);
  }
  const raw = Buffer.from(html, 'utf8');
  const gzip = gzipSync(raw, { level: 9 });
  const brotli = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
  const etag = `"${createHash('sha1').update(raw).digest('base64url')}"`;
  const lastmod = statSync(filePath).mtime.toISOString().slice(0, 10);
  return { raw, gzip, brotli, etag, lastmod };
}

function sendCompressedHtml(
  req: IncomingMessage,
  res: ServerResponse,
  page: CachedPage,
  extraHeaders: Record<string, string> = {},
): void {
  const headers: Record<string, string | number> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=0, must-revalidate',
    etag: page.etag,
    vary: 'Accept-Encoding',
    ...extraHeaders,
  };

  if (req.headers['if-none-match'] === page.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const accept = String(req.headers['accept-encoding'] ?? '');
  let body = page.raw;
  if (/\bbr\b/.test(accept)) {
    headers['content-encoding'] = 'br';
    body = page.brotli;
  } else if (/\bgzip\b/.test(accept)) {
    headers['content-encoding'] = 'gzip';
    body = page.gzip;
  }
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>404 — Page Not Found | Caravan Online</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0c0d0b; color: #ffb642; font-family: monospace; text-align: center; padding: 24px; }
      main { border: 2px solid #ffb642; padding: 28px 36px; max-width: 480px; background: rgba(14, 16, 12, 0.92); }
      h1 { margin: 0 0 12px; font-size: 32px; }
      p { margin: 0 0 20px; line-height: 1.5; }
      a { color: #ffb642; border: 2px solid #ffb642; padding: 8px 16px; text-decoration: none; margin: 0 6px; display: inline-block; }
      a:hover { background: #ffb642; color: #0c0d0b; }
    </style>
  </head>
  <body>
    <main>
      <h1>404 — Trail Not Found</h1>
      <p>That caravan route doesn't exist.</p>
      <a href="/">Play Caravan</a>
      <a href="/how-to-play">How to Play</a>
    </main>
  </body>
</html>`;

export function createHttpHandler(opts: HttpHandlerOptions): RequestListener {
  const siteUrl = (opts.siteUrl ?? DEFAULT_SITE_URL).replace(/\/+$/, '');
  const siteHost = new URL(siteUrl).host;
  const staticDir = opts.staticDir && existsSync(opts.staticDir) ? opts.staticDir : undefined;

  const indexPage = staticDir
    ? loadPage(join(staticDir, 'index.html'), siteUrl, opts.googleVerification, opts.bingVerification)
    : null;
  const guidePage = staticDir
    ? loadPage(join(staticDir, 'how-to-play.html'), siteUrl, opts.googleVerification, opts.bingVerification)
    : null;

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const robotsTxt = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /healthz',
    'Disallow: /socket.io/',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');

  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '  <url>',
    `    <loc>${siteUrl}/</loc>`,
    `    <lastmod>${indexPage?.lastmod ?? fallbackDate}</lastmod>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
    '  <url>',
    `    <loc>${siteUrl}/how-to-play</loc>`,
    `    <lastmod>${guidePage?.lastmod ?? fallbackDate}</lastmod>`,
    '    <changefreq>monthly</changefreq>',
    '    <priority>0.9</priority>',
    '  </url>',
    '</urlset>',
    '',
  ].join('\n');

  const serveStatic = staticDir
    ? sirv(staticDir, {
        single: false,
        etag: true,
        gzip: true,
        brotli: true,
        setHeaders: (res, pathname) => {
          if (pathname.startsWith('/assets/')) {
            const hashed = /-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(pathname);
            res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
          } else if (/\.(png|jpe?g|svg|webp|ico|webmanifest)$/.test(pathname)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
        },
      })
    : null;

  return (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    let parsed: URL;
    try {
      parsed = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Bad request');
      return;
    }
    const pathname = parsed.pathname;

    if (pathname === '/healthz') {
      const body = JSON.stringify({ ok: true, ...opts.getStats() });
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
        'content-length': Buffer.byteLength(body),
      });
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      return;
    }

    // Optional redirect from secondary hostnames (e.g. .fly.dev -> custom domain) to prevent duplicate indexing.
    if (opts.canonicalRedirect && req.headers.host && req.headers.host !== siteHost && !pathname.startsWith('/socket.io/')) {
      res.writeHead(301, { location: `${siteUrl}${req.url ?? '/'}` });
      res.end();
      return;
    }

    if (pathname === '/robots.txt') {
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'content-length': Buffer.byteLength(robotsTxt),
      });
      if (req.method === 'HEAD') res.end();
      else res.end(robotsTxt);
      return;
    }

    if (pathname === '/sitemap.xml') {
      res.writeHead(200, {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'content-length': Buffer.byteLength(sitemapXml),
      });
      if (req.method === 'HEAD') res.end();
      else res.end(sitemapXml);
      return;
    }

    // Canonical clean URL redirects (avoid duplicate indexed paths).
    if (pathname === '/index.html') {
      res.writeHead(301, { location: `/${parsed.search}` });
      res.end();
      return;
    }
    if (pathname === '/how-to-play/' || pathname === '/how-to-play.html') {
      res.writeHead(301, { location: '/how-to-play' });
      res.end();
      return;
    }

    if (pathname === '/') {
      if (indexPage) {
        const noindex = parsed.searchParams.has('room') || parsed.searchParams.has('mode');
        sendCompressedHtml(req, res, indexPage, noindex ? { 'x-robots-tag': 'noindex, nofollow' } : {});
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Caravan game server running. Build the client (npm run build) to serve it from here.');
      return;
    }

    if (pathname === '/how-to-play' && guidePage) {
      sendCompressedHtml(req, res, guidePage);
      return;
    }

    if (serveStatic) {
      serveStatic(req, res, () => {
        res.writeHead(404, {
          'content-type': 'text/html; charset=utf-8',
          'x-robots-tag': 'noindex, nofollow',
        });
        if (req.method === 'HEAD') res.end();
        else res.end(NOT_FOUND_HTML);
      });
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' });
    res.end('Not found');
  };
}
