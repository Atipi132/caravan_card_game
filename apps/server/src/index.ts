import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { GameServer } from './gameServer';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const here = dirname(fileURLToPath(import.meta.url));
// Built client: apps/client/dist (dev/monorepo) or ./public next to the bundle (Docker image).
const STATIC_DIR = process.env.STATIC_DIR ?? [resolve(here, 'public'), resolve(here, '../../client/dist')].find((d) => existsSync(d));

const serveStatic = STATIC_DIR
  ? sirv(STATIC_DIR, {
      single: true,
      etag: true,
      gzip: true,
      setHeaders: (res, pathname) => {
        if (pathname.startsWith('/assets/') && /\.(js|css|webp|svg|jpg|png|woff2?)$/.test(pathname)) {
          res.setHeader('Cache-Control', pathname.match(/-[A-Za-z0-9_-]{8,}\.(js|css)$/) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
        }
      },
    })
  : null;

let gameServer: GameServer;

const http = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...gameServer.stats() }));
    return;
  }
  if (serveStatic) return serveStatic(req, res, () => {
    res.writeHead(404);
    res.end('Not found');
  });
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Caravan game server running. Build the client (npm run build) to serve it from here.');
});

gameServer = new GameServer(http, { log: (m) => console.log(`[caravan] ${m}`) });

http.listen(PORT, HOST, () => {
  console.log(`[caravan] listening on http://${HOST}:${PORT}${STATIC_DIR ? ` (serving ${STATIC_DIR})` : ''}`);
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[caravan] shutting down');
  gameServer.announceShutdown();
  // Give the notice a moment to reach the clients before closing the sockets.
  setTimeout(() => {
    gameServer.close();
    http.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  }, 500);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
