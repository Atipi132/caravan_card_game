// Pre-compresses built static assets (.gz and .br) so sirv serves them with zero runtime CPU cost.
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const COMPRESSIBLE = new Set(['.js', '.css', '.svg', '.html', '.json', '.webmanifest', '.xml', '.txt']);
const MIN_BYTES = 1024;

let count = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    if (st.size < MIN_BYTES || !COMPRESSIBLE.has(extname(entry))) continue;
    const raw = readFileSync(full);
    const gz = gzipSync(raw, { level: 9 });
    const br = brotliCompressSync(raw, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    });
    if (gz.length < raw.length) writeFileSync(`${full}.gz`, gz);
    if (br.length < raw.length) writeFileSync(`${full}.br`, br);
    count++;
  }
}

walk(DIST);
console.log(`Pre-compressed ${count} static assets (.gz + .br) in ${DIST}`);
