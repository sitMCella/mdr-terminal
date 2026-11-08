import { LAYOUT_PRESETS as P } from '../config/defaults';
import type { Point } from '../core/types';
import type { Rect } from './viewport';

export interface BinLayout {
  center: Point;
  width: number;
  height: number;
  barCenterY: number;
  barHeight: number;
}

export interface Layout {
  width: number;
  height: number;
  /** Scale factor applied to every preset. */
  k: number;
  numberWindow: Rect;
  headerBox: Rect;
  logo: { center: Point; height: number };
  lineYs: number[];
  lineThickness: number;
  fontSize: number;
  bins: BinLayout[];
}

/**
 * Compute chrome positions for a viewport. Presets are scaled from a fresh
 * base every time (the reference mutated them cumulatively).
 */
export function computeLayout(width: number, height: number, globalScale: number, binCount: number): Layout {
  // Width-based like the reference, with a floor so chrome stays legible on phones.
  const k = Math.max(width / P.referenceWidth, Math.min(0.6, height / 720)) * globalScale;
  const top = P.numberWindowBufferTop * k;
  const bottom = height - P.numberWindowBufferBottom * k;
  const spacing = P.lineGraphicsSpacing * k;

  const headerBox: Rect = {
    x0: P.headerBoxBufferX * k,
    y0: P.headerBoxBufferY * k,
    x1: width - P.headerBoxBufferX * k - P.headerImageOffsetX * k,
    y1: top - spacing - P.headerBoxBufferY * k,
  };
  const headerHeight = Math.max(1, headerBox.y1 - headerBox.y0);

  const binSlot = width / (binCount + 1);
  const binWidth = Math.min(binSlot * 0.72, 220 * k);
  const binCenterY = height - (P.numberWindowBufferBottom - P.binOffset) * k;
  const bins: BinLayout[] = Array.from({ length: binCount }, (_, i) => ({
    center: { x: binSlot * (i + 1), y: binCenterY },
    width: binWidth,
    height: P.binHeight * k,
    barCenterY: binCenterY + P.binPercentBarOffset * k,
    barHeight: P.binPercentBarHeight * k,
  }));

  return {
    width,
    height,
    k,
    numberWindow: { x0: 0, y0: top, x1: width, y1: bottom },
    headerBox,
    logo: { center: { x: headerBox.x1, y: (headerBox.y0 + headerBox.y1) / 2 }, height: headerHeight * 1.9 },
    lineYs: [top, top - spacing, bottom, bottom + spacing],
    lineThickness: Math.max(1, P.lineThickness * k),
    fontSize: P.fontSize * k,
    bins,
  };
}
