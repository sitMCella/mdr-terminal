/** Font size the digit sprites are rasterised at. */
const GLYPH_FONT_PX = 128;
const GLOW_PX = 14;

export interface Glyph {
  canvas: HTMLCanvasElement;
  /** Sprite size in CSS px at GLYPH_FONT_PX. */
  width: number;
  height: number;
}

/**
 * Pre-rendered digit sprites (0-9) per colour, with a baked-in glow.
 * Drawing sprites with drawImage is much cheaper than fillText + shadowBlur.
 */
export class GlyphCache {
  private cache = new Map<string, Glyph[]>();
  private fontFamily: string;
  private pixelRatio: number;

  constructor(fontFamily: string, pixelRatio = 1) {
    this.fontFamily = fontFamily;
    this.pixelRatio = pixelRatio;
  }

  /** Drop sprites (e.g. after the web font loads or DPR changes). */
  reset(pixelRatio = this.pixelRatio): void {
    this.pixelRatio = pixelRatio;
    this.cache.clear();
  }

  get(color: string, digit: number): Glyph {
    let glyphs = this.cache.get(color);
    if (!glyphs) {
      glyphs = Array.from({ length: 10 }, (_, d) => this.render(color, d));
      this.cache.set(color, glyphs);
    }
    return glyphs[digit]!;
  }

  /** Scale factor that turns a sprite into a digit of `fontPx` size. */
  static scaleFor(fontPx: number): number {
    return fontPx / GLYPH_FONT_PX;
  }

  private render(color: string, digit: number): Glyph {
    const width = GLYPH_FONT_PX * 0.75 + GLOW_PX * 2;
    const height = GLYPH_FONT_PX + GLOW_PX * 2;
    const ratio = Math.min(2, this.pixelRatio);
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * ratio);
    canvas.height = Math.ceil(height * ratio);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.font = `700 ${GLYPH_FONT_PX}px ${this.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = GLOW_PX;
      ctx.fillText(String(digit), width / 2, height / 2 + GLYPH_FONT_PX * 0.04);
      ctx.shadowBlur = 0;
      ctx.fillText(String(digit), width / 2, height / 2 + GLYPH_FONT_PX * 0.04);
    }
    return { canvas, width, height };
  }
}
