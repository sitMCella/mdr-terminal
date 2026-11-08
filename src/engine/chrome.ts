import { binProgress, formatPercent } from '../core/progress';
import type { Bin } from '../core/types';
import type { Layout } from './layout';

export const UI_FONT = 'Montserrat, "Helvetica Neue", Arial, sans-serif';

export interface ChromeColors {
  fg: string;
  bg: string;
}

/** Header box, file name, overall percentage, logo and the frame lines. */
export function drawChrome(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  headerText: string,
  overall: number,
  logo: HTMLImageElement | null,
  colors: ChromeColors,
): void {
  const { headerBox: box, k, fontSize } = layout;
  ctx.save();
  ctx.strokeStyle = colors.fg;
  ctx.fillStyle = colors.fg;
  ctx.lineWidth = Math.max(1, 2 * k);
  ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);

  const midY = (box.y0 + box.y1) / 2;
  ctx.font = `700 ${fontSize}px ${UI_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(headerText, box.x0 + 25 * k, midY);

  // Logo straddles the right edge of the header box, masking the border.
  let logoHalfWidth = 0;
  if (logo && logo.complete && logo.naturalWidth > 0) {
    const h = layout.logo.height;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    logoHalfWidth = w / 2;
    const { x, y } = layout.logo.center;
    ctx.fillStyle = colors.bg;
    ctx.fillRect(x - w / 2 - 6 * k, y - h / 2, w + 12 * k, h);
    ctx.drawImage(logo, x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = colors.fg;
  }

  ctx.textAlign = 'right';
  ctx.fillText(`${formatPercent(overall)} Complete`, box.x1 - logoHalfWidth - 30 * k, midY);

  ctx.lineWidth = layout.lineThickness;
  ctx.beginPath();
  for (const y of layout.lineYs) {
    ctx.moveTo(0, y);
    ctx.lineTo(layout.width, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** The numbered bins, their open lids and percent bars. */
export function drawBins(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  bins: readonly Bin[],
  openBins: ReadonlySet<number>,
  colors: ChromeColors,
): void {
  const { k, fontSize } = layout;
  ctx.save();
  ctx.strokeStyle = colors.fg;
  ctx.fillStyle = colors.fg;
  ctx.lineWidth = Math.max(1, 2 * k);
  ctx.textBaseline = 'middle';

  layout.bins.forEach((b, i) => {
    const bin = bins[i];
    if (!bin) return;
    const x0 = b.center.x - b.width / 2;
    const y0 = b.center.y - b.height / 2;

    if (openBins.has(i)) {
      // Lid flaps swung open above the bin.
      const flap = b.height * 0.9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 - flap * 0.35, y0 - flap);
      ctx.moveTo(x0 + b.width, y0);
      ctx.lineTo(x0 + b.width + flap * 0.35, y0 - flap);
      ctx.stroke();
    }

    ctx.strokeRect(x0, y0, b.width, b.height);
    ctx.font = `700 ${fontSize * 0.8}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1).padStart(2, '0'), b.center.x, b.center.y);

    const barY0 = b.barCenterY - b.barHeight / 2;
    const fraction = binProgress(bin);
    ctx.strokeRect(x0, barY0, b.width, b.barHeight);
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x0, barY0, b.width * fraction, b.barHeight);
    ctx.globalAlpha = 1;
    ctx.font = `700 ${fontSize * 0.7}px ${UI_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(formatPercent(fraction), x0 + 6 * k, b.barCenterY);
  });
  ctx.restore();
}
