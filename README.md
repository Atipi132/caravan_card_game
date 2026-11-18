# Caravan

A browser recreation of **Caravan**, the card game from *Fallout: New Vegas*. You can play it online against friends, against random players, or against an AI. The look aims to match the minigame: a weathered wooden table, worn cards, casino card backs, caravan names carved into the wood and a Pip-Boy HUD (amber or green).

> Unofficial fan project, not affiliated with Bethesda Softworks or Obsidian Entertainment. No assets from the game are used (see [Credits](#credits)).

## Features

- **Complete rules engine** following [`docs/rules.md`](docs/rules.md): the opening round with automatic mulligan, number cards, Jacks / Queens / Kings / Jokers, the 3-face-card limit, rule 5.4 for direction after removals, and all end-of-game conditions.
- **Vs AI**, three levels (Easy, Normal, Hard). Hard looks one move ahead over sampled opponent hands. The AI never peeks at hidden cards.
- **Online play**:
  - **Quick match** queue.
  - **Private rooms** with a 5-letter code or an invitation link (`/?room=CODE`). Room options: number of Jokers, custom decks, turn time.
  - The server is authoritative and sends each player a redacted view, so the opponent's hand and the deck order never leave the server.
  - Reconnecting after a page reload resumes the game.
  - Turn timer: when it runs out, a card is discarded automatically. Three timeouts in a row forfeit the game.
  - Rematches.
- **Deck builder** using the six casino card sets, laid out like the in-game screen ("Caravan Deck" / "All Cards", Randomize). Decks need at least 30 cards and may not contain the same card twice from one set.
- **Cosmetic ante**: Ante Pot, Net Total and Win/Loss, stored in the browser.
- **Synthesised sound effects** and a desert-wind ambience (Web Audio, no audio files).
- **Keyboard controls** matching the PC version: `W` select, `Q` discard card, `E` discard track, `R` cancel, `B` forfeit. Also `1–8` to pick a card from your hand and `A/S/D` to play it on your caravans.

## Project layout

```
packages/engine   Pure TypeScript rules engine, AI and network protocol types (shared)
apps/client       React + Vite front-end (DOM/CSS 3D board, Motion animations)
apps/server       Node + Socket.IO authoritative game server (also serves the built client)
e2e               Playwright end-to-end tests (vs AI and two-browser online game)
docs              Reference material (rules, screenshots, videos of the original)
```

## Development

Requires Node 22+.

```bash
npm install
npm run dev          # game server on :3000 + Vite dev server on :5173 (proxying /socket.io)
```

Open <http://localhost:5173>.

```bash
npm test             # engine + server unit/integration tests (Vitest)
npm run typecheck    # TypeScript, all packages
npx playwright install chromium && npm run e2e   # end-to-end tests against the production build
npx tsx packages/engine/scripts/bench.ts 100      # AI strength benchmark
```

## Production

```bash
npm run build && npm start             # http://localhost:3000
# or
docker build -t caravan .
docker run -p 3000:3000 caravan
```

Environment variables: `PORT` (default `3000`), `HOST` (default `0.0.0.0`), `STATIC_DIR` (location of the built client). `GET /healthz` returns server statistics. The server keeps games in memory, so run a single instance.

**Hosting online:** see [`deploy/README.md`](deploy/README.md). It sets up a small European VPS (Hetzner) with Caddy for automatic HTTPS, a free DuckDNS hostname, and GitHub Actions that test, build and deploy on every push to `main`.

## Credits

- Card faces: Adrian Kennard's playing card designs (<https://www.me.uk/cards/>), CC0, via [`@letele/playing-cards`](https://github.com/letele/playing-cards). They are extracted to static SVGs by `apps/client/scripts/extract-cards.mjs`, which also replaces the Ace of Spades that carried the designer's URL.
- Card backs, table and card-wear textures: original artwork made for this project.
- Fonts: [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) (OFL) and [Special Elite](https://fonts.google.com/specimen/Special+Elite) (Apache 2.0).
- Rules write-up: `docs/rules.md`.
