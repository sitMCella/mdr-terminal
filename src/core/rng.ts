/** Small seeded PRNG helpers (mulberry32). Deterministic for a given seed. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  bool(): boolean;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return fromSource(next);
}

/** Non-deterministic RNG for cosmetic effects (jitter, timing, regenerated digits). */
export function createFxRng(): Rng {
  return fromSource(Math.random);
}

function fromSource(next: () => number): Rng {
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    bool: () => next() < 0.5,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
