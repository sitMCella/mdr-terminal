import { createNoise2D, createNoise3D } from 'simplex-noise';
import { createRng } from './rng';

export type Noise2D = (x: number, y: number) => number;
export type Noise3D = (x: number, y: number, z: number) => number;

/** Seeded 2D noise mapped to [0, 1]. */
export function createNoise2D01(seed: number): Noise2D {
  const noise = createNoise2D(createRng(seed).next);
  return (x, y) => (noise(x, y) + 1) / 2;
}

/** Seeded 3D noise in [-1, 1]. */
export function createSeededNoise3D(seed: number): Noise3D {
  return createNoise3D(createRng(seed).next);
}
