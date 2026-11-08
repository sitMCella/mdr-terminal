import { describe, expect, it } from 'vitest';
import { tickActiveGroup } from '../../src/core/activeGroup';
import { generateGrid } from '../../src/core/grid';
import { formatPercent, isComplete, overallProgress } from '../../src/core/progress';
import { advanceFlights, applyRefined, openBins, refineGroup, refinedGroupIds } from '../../src/core/refine';
import { createRng } from '../../src/core/rng';
import type { Point, SimState } from '../../src/core/types';

const BINS: Point[] = [0, 1, 2, 3, 4].map((i) => ({ x: 100 * (i + 1), y: 500 }));

function withActiveGroup(): { s: SimState; id: number } {
  const s = generateGrid({ size: 40, seed: 505, badNoiseScale: 0.12, badThreshold: 0.85, binCount: 5 });
  s.countdownTicks = 0;
  tickActiveGroup(s, new Set(s.groups.keys()), createRng(1));
  return { s, id: s.activeGroupId! };
}

const starts = (s: SimState, id: number) =>
  new Map(s.groups.get(id)!.cellIds.map((c) => [c, { x: 300, y: 100 } as Point]));

describe('refineGroup', () => {
  it('refines an active group exactly once', () => {
    const { s, id } = withActiveGroup();
    const bin = s.bins[s.groups.get(id)!.binIndex]!;
    expect(refineGroup(s, id, starts(s, id))).toBe(true);
    expect(refineGroup(s, id, starts(s, id))).toBe(false);
    expect(bin.refined).toBe(1);
    expect(s.groups.get(id)!.state).toBe('refining');
    expect(s.flying.size).toBe(s.groups.get(id)!.cellIds.length);
  });

  it('rejects dormant groups', () => {
    const { s, id } = withActiveGroup();
    const other = [...s.groups.keys()].find((g) => g !== id)!;
    expect(refineGroup(s, other, new Map())).toBe(false);
  });
});

describe('advanceFlights', () => {
  it('moves digits into their bin, then regenerates them', () => {
    const { s, id } = withActiveGroup();
    const group = s.groups.get(id)!;
    refineGroup(s, id, starts(s, id));
    expect(openBins(s)).toEqual(new Set([group.binIndex]));

    const rng = createRng(2);
    let ticks = 0;
    while (s.flying.size > 0 && ticks < 10_000) {
      advanceFlights(s, BINS, 3, rng);
      ticks++;
    }
    expect(s.flying.size).toBe(0);
    expect(group.state).toBe('done');
    expect(openBins(s).size).toBe(0);
    for (const cellId of group.cellIds) {
      const cell = s.cells[cellId]!;
      expect(cell.groupId).toBeNull();
      expect(cell.flight).toBeNull();
      expect(cell.regen).toBe(0);
    }
  });

  it('flies in straight lines at the given speed', () => {
    const { s, id } = withActiveGroup();
    refineGroup(s, id, starts(s, id));
    const cellId = s.groups.get(id)!.cellIds[0]!;
    const before = { ...s.cells[cellId]!.flight! };
    advanceFlights(s, BINS, 3, createRng(1));
    const after = s.cells[cellId]!.flight!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(3, 5);
  });
});

describe('progress', () => {
  it('restores saved progress and reports refined ids', () => {
    const { s, id } = withActiveGroup();
    refineGroup(s, id, starts(s, id));
    const ids = refinedGroupIds(s);
    expect(ids).toEqual([id]);

    const restored = generateGrid(s.params);
    applyRefined(restored, ids);
    applyRefined(restored, ids); // idempotent
    expect(restored.bins.reduce((n, b) => n + b.refined, 0)).toBe(1);
    expect(refinedGroupIds(restored)).toEqual([id]);
    expect(overallProgress(restored)).toBeCloseTo(1 / restored.groups.size);
  });

  it('completes when every group is refined and nothing is flying', () => {
    const s = generateGrid({ size: 30, seed: 3, badNoiseScale: 0.12, badThreshold: 0.85, binCount: 5 });
    expect(isComplete(s)).toBe(false);
    applyRefined(s, s.groups.keys());
    expect(overallProgress(s)).toBe(1);
    expect(isComplete(s)).toBe(true);
  });

  it('formats percentages without rounding up to 100%', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.996)).toBe('99%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.29)).toBe('29%');
  });
});
