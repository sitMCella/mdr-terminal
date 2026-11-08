import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/config/defaults';
import { generateGrid } from '../../src/core/grid';
import { cellIndex, type GridParams } from '../../src/core/types';

const g = DEFAULT_SETTINGS.gameplay;
const params = (seed: number, overrides: Partial<GridParams> = {}): GridParams => ({
  size: g.gridSize,
  seed,
  badNoiseScale: g.badNoiseScale,
  badThreshold: g.badThreshold,
  binCount: g.binCount,
  ...overrides,
});

describe('generateGrid', () => {
  it('is deterministic for a seed', () => {
    const a = generateGrid(params(505));
    const b = generateGrid(params(505));
    expect(a.cells.map((c) => [c.value, c.driftAxis, c.groupId])).toEqual(
      b.cells.map((c) => [c.value, c.driftAxis, c.groupId]),
    );
    expect([...a.groups.values()].map((x) => x.binIndex)).toEqual([...b.groups.values()].map((x) => x.binIndex));
  });

  it('differs between seeds', () => {
    const a = generateGrid(params(1));
    const b = generateGrid(params(2));
    expect(a.cells.map((c) => c.value)).not.toEqual(b.cells.map((c) => c.value));
  });

  it('creates size*size cells with valid digits and coordinates', () => {
    const s = generateGrid(params(7, { size: 20 }));
    expect(s.cells).toHaveLength(400);
    for (const c of s.cells) {
      expect(c.value).toBeGreaterThanOrEqual(0);
      expect(c.value).toBeLessThanOrEqual(9);
      expect(s.cells[cellIndex(20, c.gx, c.gy)]).toBe(c);
      expect(c.regen).toBe(0);
    }
  });

  it('puts every bad cell in exactly one group, consistently', () => {
    const s = generateGrid(params(505));
    const seen = new Set<number>();
    for (const group of s.groups.values()) {
      expect(group.cellIds.length).toBeGreaterThan(0);
      expect(group.state).toBe('dormant');
      for (const id of group.cellIds) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        expect(s.cells[id]!.groupId).toBe(group.id);
      }
    }
    const grouped = s.cells.filter((c) => c.groupId !== null).length;
    expect(seen.size).toBe(grouped);
  });

  it('groups only 8-connected cells', () => {
    const s = generateGrid(params(42));
    for (const group of s.groups.values()) {
      if (group.cellIds.length < 2) continue;
      const cells = group.cellIds.map((id) => s.cells[id]!);
      for (const c of cells) {
        const hasNeighbour = cells.some((o) => o !== c && Math.abs(o.gx - c.gx) <= 1 && Math.abs(o.gy - c.gy) <= 1);
        expect(hasNeighbour).toBe(true);
      }
    }
  });

  it('assigns groups to bins and counts bin totals', () => {
    const s = generateGrid(params(505));
    expect(s.bins).toHaveLength(5);
    expect(s.bins.reduce((n, b) => n + b.total, 0)).toBe(s.groups.size);
    for (const group of s.groups.values()) {
      expect(group.binIndex).toBeGreaterThanOrEqual(0);
      expect(group.binIndex).toBeLessThan(5);
    }
  });

  it('produces a playable number of groups with default settings', () => {
    const s = generateGrid(params(505));
    expect(s.groups.size).toBeGreaterThan(30);
    expect(s.groups.size).toBeLessThan(300);
  });

  it('honours the threshold (higher threshold, fewer bad cells)', () => {
    const low = generateGrid(params(9, { badThreshold: 0.8 }));
    const high = generateGrid(params(9, { badThreshold: 0.9 }));
    const bad = (x: typeof low) => x.cells.filter((c) => c.groupId !== null).length;
    expect(bad(high)).toBeLessThan(bad(low));
  });
});
