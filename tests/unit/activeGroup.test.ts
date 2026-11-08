import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIVE_GROUP_CONFIG as CFG, setSuperActive, tickActiveGroup } from '../../src/core/activeGroup';
import { FIRST_GROUP_DELAY_TICKS, generateGrid } from '../../src/core/grid';
import { createRng } from '../../src/core/rng';
import type { SimState } from '../../src/core/types';

function setup(): { s: SimState; visible: Set<number> } {
  const s = generateGrid({ size: 40, seed: 505, badNoiseScale: 0.12, badThreshold: 0.85, binCount: 5 });
  return { s, visible: new Set(s.groups.keys()) };
}

describe('tickActiveGroup', () => {
  it('waits for the first-group delay before activating', () => {
    const { s, visible } = setup();
    const rng = createRng(1);
    for (let i = 0; i < FIRST_GROUP_DELAY_TICKS; i++) {
      tickActiveGroup(s, visible, rng);
      expect(s.activeGroupId).toBeNull();
    }
    tickActiveGroup(s, visible, rng);
    expect(s.activeGroupId).not.toBeNull();
    expect(s.groups.get(s.activeGroupId!)!.state).toBe('active');
  });

  it('never activates when no group is visible', () => {
    const { s } = setup();
    s.countdownTicks = 0;
    tickActiveGroup(s, new Set(), createRng(1));
    expect(s.activeGroupId).toBeNull();
  });

  it('keeps exactly one group active', () => {
    const { s, visible } = setup();
    s.countdownTicks = 0;
    const rng = createRng(3);
    for (let i = 0; i < 3000; i++) {
      tickActiveGroup(s, visible, rng);
      const active = [...s.groups.values()].filter((g) => g.state === 'active');
      expect(active.length).toBeLessThanOrEqual(1);
      if (active[0]) expect(active[0].id).toBe(s.activeGroupId);
    }
  });

  it('grows to the max, shrinks back to zero, then cools down', () => {
    const { s, visible } = setup();
    s.countdownTicks = 0;
    const rng = createRng(5);
    tickActiveGroup(s, visible, rng);
    const id = s.activeGroupId!;
    const group = s.groups.get(id)!;

    let peak = 0;
    let ticks = 0;
    while (s.activeGroupId === id && ticks < 10_000) {
      peak = Math.max(peak, group.scale);
      tickActiveGroup(s, visible, rng);
      ticks++;
    }
    expect(peak).toBeGreaterThanOrEqual(CFG.groupGrowMax);
    expect(peak).toBeLessThan(CFG.superActiveMax);
    expect(group.state).toBe('dormant');
    expect(group.scale).toBe(0);
    expect(s.countdownTicks).toBeGreaterThanOrEqual(CFG.groupCooldownMinTicks - 1);
    expect(s.countdownTicks).toBeLessThanOrEqual(CFG.groupCooldownMaxTicks);
  });

  it('super active groups stay longer and peak higher', () => {
    const run = (superActive: boolean) => {
      const { s, visible } = setup();
      s.countdownTicks = 0;
      const rng = createRng(11);
      tickActiveGroup(s, visible, rng);
      const id = s.activeGroupId!;
      let ticks = 0;
      let peak = 0;
      while (s.activeGroupId === id && ticks < 20_000) {
        if (superActive) setSuperActive(s, id);
        peak = Math.max(peak, s.groups.get(id)!.scale);
        tickActiveGroup(s, visible, rng);
        ticks++;
      }
      return { ticks, peak };
    };
    const normal = run(false);
    const agitated = run(true);
    expect(agitated.peak).toBeGreaterThanOrEqual(CFG.superActiveMax);
    expect(agitated.ticks).toBeGreaterThan(normal.ticks);
  });

  it('drops the active group when it leaves the viewport', () => {
    const { s, visible } = setup();
    s.countdownTicks = 0;
    const rng = createRng(7);
    tickActiveGroup(s, visible, rng);
    const id = s.activeGroupId!;
    const remaining = new Set([...visible].filter((g) => g !== id));
    tickActiveGroup(s, remaining, rng);
    expect(s.activeGroupId).toBeNull();
    expect(s.groups.get(id)!.state).toBe('dormant');
    expect(s.countdownTicks).toBeGreaterThan(0);
  });
});
