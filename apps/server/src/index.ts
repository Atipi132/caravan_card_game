import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameServer } from './gameServer';
import { createHttpHandler, DEFAULT_SITE_URL } from './http';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const SITE_URL = process.env.SITE_URL ?? DEFAULT_SITE_URL;
const CANONICAL_REDIRECT = process.env.CANONICAL_REDIRECT === 'true';
const here = dirname(fileURLToPath(import.meta.url));
// Built client: apps/client/dist (dev/monorepo) or ./public next to the bundle (Docker image).
const STATIC_DIR = process.env.STATIC_DIR ?? [resolve(here, 'public'), resolve(here, '../../client/dist')].find((d) => existsSync(d));

let gameServer: GameServer;

const handler = createHttpHandler({
  staticDir: STATIC_DIR,
  siteUrl: SITE_URL,
  canonicalRedirect: CANONICAL_REDIRECT,
  googleVerification: process.env.GOOGLE_SITE_VERIFICATION,
  bingVerification: process.env.BING_SITE_VERIFICATION,
  getStats: () => gameServer.stats(),
});

const http = createServer(handler);

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
