/** Small seeded PRNG (mulberry32). The state is a single uint32 so it can live in GameState. */

export function nextRandom(state: number): [value: number, nextState: number] {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, s];
}

/** Mutable RNG helper used inside a single transition. */
export class Rng {
  constructor(public state: number) {}

  next(): number {
    const [v, s] = nextRandom(this.state);
    this.state = s;
    return v;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  shuffle<T>(items: T[]): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  id(): string {
    // 8 base36 chars, opaque.
    let out = '';
    for (let i = 0; i < 8; i++) out += this.int(36).toString(36);
    return out;
  }
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0;
}
