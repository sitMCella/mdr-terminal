import type { Bin, SimState } from './types';

/** Fraction refined for one bin, 0..1. Empty bins count as complete. */
export function binProgress(bin: Bin): number {
  return bin.total === 0 ? 1 : bin.refined / bin.total;
}

/** Fraction refined over the whole file, 0..1. */
export function overallProgress(state: SimState): number {
  let refined = 0;
  let total = 0;
  for (const bin of state.bins) {
    refined += bin.refined;
    total += bin.total;
  }
  return total === 0 ? 1 : refined / total;
}

/** Every group refined and no digits still in flight. */
export function isComplete(state: SimState): boolean {
  return overallProgress(state) >= 1 && state.flying.size === 0;
}

/** Floors so "100%" only shows once everything is refined. */
export function formatPercent(fraction: number): string {
  return `${Math.floor(fraction * 100 + 1e-9)}%`;
}
