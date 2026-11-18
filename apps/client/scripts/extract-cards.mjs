// Extracts the CC0 card faces from @letele/playing-cards (Adrian Kennard's designs, https://www.me.uk/cards/)
// into static SVG files so the client can load them as plain images.
// Usage: node apps/client/scripts/extract-cards.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as deck from '@letele/playing-cards/dist/index.esm.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'cards');
mkdirSync(out, { recursive: true });

const SUITS = { S: 'S', H: 'H', D: 'D', C: 'C' };
const RANKS = { a: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', j: 'J', q: 'Q', k: 'K' };

let n = 0;
for (const [name, Comp] of Object.entries(deck)) {
  let file;
  if (name === 'J1') file = 'JOKER1';
  else if (name === 'J2') file = 'JOKER2';
  else if (name.startsWith('B')) continue; // backs: we use our own casino designs
  else {
    const suit = SUITS[name[0]];
    const rank = RANKS[name.slice(1).toLowerCase()];
    if (!suit || !rank) continue;
    file = `${rank}${suit}`;
  }
  let svg = renderToStaticMarkup(React.createElement(Comp, { width: 240, height: 336 }));
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  // React renders xlink:href as xlinkHref when unknown; normalise.
  svg = svg.replaceAll('xlinkHref', 'xlink:href');
  if (svg.includes('xlink:href') && !svg.includes('xmlns:xlink')) svg = svg.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  // Cream card stock without the thin black outline (the in-game cards have none); fill the whole viewBox.
  svg = svg.replace(/<rect([^>]*?)fill="#fff" stroke="#000"/, '<rect$1fill="#f3eddc" stroke="none"');
  writeFileSync(join(out, `${file}.svg`), svg);
  n++;
}

// The original Ace of Spades carries the designer's URL and a QR code: rebuild it from the Ace of Hearts layout.
{
  const heart = 'M0-300c0-100 100-200 200-200s200 100 200 250C400 0 0 400 0 500 0 400-400 0-400-250c0-150 100-250 200-250S0-400 0-300Z';
  const spade =
    'M0-500c100 250 355 400 355 685a150 150 0 0 1-300 0 10 10 0 0 0-20 0c0 200 50 215 95 315h-260c45-100 95-115 95-315a10 10 0 0 0-20 0 150 150 0 0 1-300 0c0-285 255-435 355-685Z';
  const ah = readFileSync(join(out, 'AH.svg'), 'utf8');
  if (!ah.includes(heart)) throw new Error('Unexpected AH.svg structure');
  const as = ah
    .replaceAll('H-A_svg', 'S-A_svg')
    .replace(heart, spade)
    .replaceAll('"red"', '"#000"')
    // Larger central pip, as on a traditional Ace of Spades.
    .replace('height="70" width="70" x="-35" y="-35"', 'height="120" width="120" x="-60" y="-60"');
  writeFileSync(join(out, 'AS.svg'), as);
}
console.log(`Wrote ${n} card faces to ${out}`);
