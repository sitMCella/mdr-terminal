import type { Point } from '../core/types';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GridRange {
  gx0: number;
  gx1: number;
  gy0: number;
  gy1: number;
}

/**
 * Pan/zoom camera. A world point maps to the screen as
 * `screen = (world + offset) * scale` (CSS px), as in the reference app.
 */
export class Viewport {
  offsetX = 0;
  offsetY = 0;
  scale: number;
  initialized = false;

  constructor(initialScale: number) {
    this.scale = initialScale;
  }

  worldToScreen(wx: number, wy: number): Point {
    return { x: (wx + this.offsetX) * this.scale, y: (wy + this.offsetY) * this.scale };
  }

  screenToWorld(sx: number, sy: number): Point {
    return { x: sx / this.scale - this.offsetX, y: sy / this.scale - this.offsetY };
  }

  /** Pan by a screen-space delta in CSS px. */
  panPx(dx: number, dy: number): void {
    this.offsetX += dx / this.scale;
    this.offsetY += dy / this.scale;
  }

  /** Pan by a world-space delta (reference arrow-key behaviour). */
  panWorld(dx: number, dy: number): void {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** Change zoom while keeping the world point under `anchor` fixed. */
  zoomAt(newScale: number, anchor: Point, minScale: number, maxScale: number): void {
    const clamped = Math.min(maxScale, Math.max(minScale, newScale));
    const world = this.screenToWorld(anchor.x, anchor.y);
    this.scale = clamped;
    this.offsetX = anchor.x / clamped - world.x;
    this.offsetY = anchor.y / clamped - world.y;
  }

  /**
   * Keep the grid covering the window (one cell of slack), centring it on any
   * axis where it is smaller than the window. Centres the grid on first call.
   */
  clamp(gridExtentWorld: number, spacing: number, window: Rect, minScale: number, maxScale: number): void {
    this.scale = Math.min(maxScale, Math.max(minScale, this.scale));
    const extentPx = gridExtentWorld * this.scale;
    const pad = spacing * this.scale;

    const axis = (offset: number, lo: number, hi: number): number => {
      const center = (lo + hi - extentPx) / 2;
      if (!this.initialized) return center / this.scale;
      const maxO = lo + pad;
      const minO = hi - pad - extentPx;
      if (minO > maxO) return center / this.scale;
      return Math.min(maxO, Math.max(minO, offset * this.scale)) / this.scale;
    };

    this.offsetX = axis(this.offsetX, window.x0, window.x1);
    this.offsetY = axis(this.offsetY, window.y0, window.y1);
    this.initialized = true;
  }

  /** Grid cells whose glyph (half-size `marginPx`) lies fully inside `window`. */
  visibleRange(size: number, spacing: number, window: Rect, marginPx: number): GridRange | null {
    const step = spacing * this.scale;
    const ox = this.offsetX * this.scale;
    const oy = this.offsetY * this.scale;
    const gx0 = Math.max(0, Math.ceil((window.x0 + marginPx - ox) / step));
    const gx1 = Math.min(size - 1, Math.floor((window.x1 - marginPx - ox) / step));
    const gy0 = Math.max(0, Math.ceil((window.y0 + marginPx - oy) / step));
    const gy1 = Math.min(size - 1, Math.floor((window.y1 - marginPx - oy) / step));
    if (gx0 > gx1 || gy0 > gy1) return null;
    return { gx0, gx1, gy0, gy1 };
  }
}
