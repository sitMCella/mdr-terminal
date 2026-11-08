import { describe, expect, it } from 'vitest';
import { computeLayout } from '../../src/engine/layout';
import { Viewport } from '../../src/engine/viewport';

const WINDOW = { x0: 0, y0: 100, x1: 1000, y1: 600 };

describe('Viewport', () => {
  it('maps world to screen and back', () => {
    const v = new Viewport(0.5);
    v.offsetX = 10;
    v.offsetY = -20;
    const p = v.worldToScreen(100, 200);
    expect(p).toEqual({ x: 55, y: 90 });
    expect(v.screenToWorld(p.x, p.y)).toEqual({ x: 100, y: 200 });
  });

  it('centres the grid on first clamp', () => {
    const v = new Viewport(0.3);
    const extent = 99 * 200;
    v.clamp(extent, 200, WINDOW, 0.2, 0.8);
    const mid = v.worldToScreen(extent / 2, extent / 2);
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(350);
  });

  it('keeps the grid covering the window when panning', () => {
    const v = new Viewport(0.3);
    v.clamp(99 * 200, 200, WINDOW, 0.2, 0.8);
    v.panPx(1e6, 1e6);
    v.clamp(99 * 200, 200, WINDOW, 0.2, 0.8);
    const origin = v.worldToScreen(0, 0);
    expect(origin.x).toBeLessThanOrEqual(WINDOW.x0 + 200 * 0.3 + 1e-6);
    expect(origin.y).toBeLessThanOrEqual(WINDOW.y0 + 200 * 0.3 + 1e-6);
  });

  it('clamps zoom and keeps the anchor fixed', () => {
    const v = new Viewport(0.3);
    v.clamp(99 * 200, 200, WINDOW, 0.2, 0.8);
    const anchor = { x: 400, y: 300 };
    const before = v.screenToWorld(anchor.x, anchor.y);
    v.zoomAt(5, anchor, 0.2, 0.8);
    expect(v.scale).toBe(0.8);
    const after = v.screenToWorld(anchor.x, anchor.y);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('returns only fully visible cells', () => {
    const v = new Viewport(0.5);
    v.offsetX = 0;
    v.offsetY = 200; // world y 0 at screen y 100
    const r = v.visibleRange(100, 100, WINDOW, 10)!;
    // Cells every 50px. x: 10..990 -> gx 1..19; y: 110..590 -> gy 1..9
    expect(r).toEqual({ gx0: 1, gx1: 19, gy0: 1, gy1: 9 });
  });
});

describe('computeLayout', () => {
  it('scales presets with width and places bins evenly', () => {
    const l = computeLayout(1280, 720, 1, 5);
    expect(l.k).toBe(1);
    expect(l.numberWindow).toEqual({ x0: 0, y0: 125, x1: 1280, y1: 605 });
    expect(l.bins.map((b) => Math.round(b.center.x))).toEqual([213, 427, 640, 853, 1067]);
    const big = computeLayout(2560, 1440, 1, 5);
    expect(big.k).toBe(2);
    expect(big.numberWindow.y0).toBe(250);
  });
});
