import { DIGIT_BASE_SIZE, INITIAL_ZOOM, THEME, type Settings } from '../config/defaults';
import { setSuperActive, tickActiveGroup } from '../core/activeGroup';
import { generateGrid } from '../core/grid';
import { createSeededNoise3D, type Noise3D } from '../core/noise';
import { isComplete, overallProgress } from '../core/progress';
import { advanceFlights, applyRefined, openBins, refineGroup, refinedGroupIds } from '../core/refine';
import { createFxRng } from '../core/rng';
import { cellIndex, type GridParams, type NumberCell, type Point, type SimState } from '../core/types';
import { drawBins, drawChrome, UI_FONT } from './chrome';
import { GlyphCache } from './glyphs';
import { computeLayout, type Layout } from './layout';
import { Viewport, type GridRange } from './viewport';

export const TICKS_PER_SECOND = 60;
const TICK_MS = 1000 / TICKS_PER_SECOND;
/** Avoid a spiral of catch-up ticks after the tab was hidden. */
const MAX_FRAME_MS = 250;
const DRAG_THRESHOLD_PX = 6;

export interface EngineFile {
  fileName: string;
  grid: GridParams;
  refinedGroupIds: readonly number[];
}

export interface EngineCallbacks {
  /** A group was refined. Receives every refined group id so far. */
  onRefine?: (refinedIds: number[], overall: number) => void;
  /** Every group refined and all digits landed in their bins. */
  onComplete?: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
}

/**
 * Canvas engine: owns the simulation, the camera, input on the canvas and the
 * render loop. Framework-free; React mounts it through <Terminal>.
 */
export class Engine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private settings: Settings;
  private callbacks: EngineCallbacks;
  private file!: EngineFile;
  private state!: SimState;
  private drift!: Noise3D;
  private readonly fx = createFxRng();
  private readonly viewport = new Viewport(INITIAL_ZOOM);
  private layout: Layout;
  private readonly glyphs: GlyphCache;
  private readonly logo: HTMLImageElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion: MediaQueryList | null;

  private dpr = 1;
  private sized = false;
  private cursor: Point | null = null;
  private pressed = false;
  private drag: DragState | null = null;
  private range: GridRange | null = null;
  private readonly visibleGroups = new Set<number>();
  private time = 0;
  private rafId = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private paused = false;
  private running = false;
  private completeNotified = false;

  constructor(canvas: HTMLCanvasElement, settings: Settings, file: EngineFile, callbacks: EngineCallbacks = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.canvas = canvas;
    this.ctx = ctx;
    this.settings = settings;
    this.callbacks = callbacks;
    this.glyphs = new GlyphCache(UI_FONT, window.devicePixelRatio || 1);
    this.layout = computeLayout(1280, 720, settings.displaySettings.globalScale, file.grid.binCount);
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

    this.logo = new Image();
    this.logo.src = `${import.meta.env.BASE_URL}logo.svg`;

    // Re-rasterise digit sprites once the web font is ready.
    document.fonts?.load(`700 64px Montserrat`).then(
      () => this.glyphs.reset(),
      () => undefined,
    );

    this.setFile(file);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.bindInput();
  }

  // ---------------------------------------------------------------- lifecycle

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.unbindInput();
  }

  setCallbacks(callbacks: EngineCallbacks): void {
    this.callbacks = callbacks;
  }

  setSettings(settings: Settings): void {
    this.settings = settings;
    this.relayout();
  }

  /** Load a file (board). No-op if the same file object is passed again. */
  setFile(file: EngineFile): void {
    if (file === this.file) return;
    this.file = file;
    this.state = generateGrid(file.grid);
    applyRefined(this.state, file.refinedGroupIds);
    this.drift = createSeededNoise3D(file.grid.seed + 1);
    this.viewport.initialized = false;
    this.completeNotified = isComplete(this.state);
    this.relayout();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.cursor = null;
      this.pressed = false;
      this.drag = null;
    }
  }

  /** Replay the staggered fade-in (used when leaving idle mode). */
  triggerLoadAnimation(): void {
    for (const cell of this.state.cells) cell.regen = 0;
  }

  /** Keyboard navigation. Returns true when the key was handled. */
  handleKey(key: string): boolean {
    const step = this.settings.controlSettings.arrowSensitivity;
    const zoom = this.settings.controlSettings.zoomSensitivity;
    switch (key) {
      case 'ArrowLeft':
        this.viewport.panWorld(step, 0);
        break;
      case 'ArrowRight':
        this.viewport.panWorld(-step, 0);
        break;
      case 'ArrowUp':
        this.viewport.panWorld(0, step);
        break;
      case 'ArrowDown':
        this.viewport.panWorld(0, -step);
        break;
      case ',':
      case '-':
        this.zoomBy(-zoom);
        break;
      case '.':
      case '=':
      case '+':
        this.zoomBy(zoom);
        break;
      default:
        return false;
    }
    this.clampViewport();
    return true;
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.min(MAX_FRAME_MS, now - this.lastFrame);
    this.lastFrame = now;
    if (!this.paused && document.visibilityState !== 'hidden') {
      this.accumulator += elapsed;
      while (this.accumulator >= TICK_MS) {
        this.tick();
        this.accumulator -= TICK_MS;
      }
    } else {
      this.accumulator = 0;
    }
    this.render();
    this.rafId = requestAnimationFrame(this.frame);
  };

  private tick(): void {
    const s = this.state;
    const d = this.settings.displaySettings;
    this.updateVisible();

    tickActiveGroup(s, this.visibleGroups, this.fx);

    // Hovering an active group makes it super active; a held press refines.
    if (s.activeGroupId !== null && this.cursor) {
      const group = s.groups.get(s.activeGroupId);
      if (group) {
        for (const cellId of group.cellIds) {
          if (this.cursorScale(this.cellScreenPos(s.cells[cellId]!)) > 1) {
            setSuperActive(s, group.id);
            break;
          }
        }
      }
      if (this.pressed && !this.drag?.moved) this.tryRefine();
    }

    advanceFlights(
      s,
      this.layout.bins.map((b) => b.center),
      d.refinedToBinSpeed,
      this.fx,
    );

    if (this.range) {
      const { gx0, gx1, gy0, gy1 } = this.range;
      const size = s.params.size;
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const cell = s.cells[cellIndex(size, gx, gy)]!;
          if (cell.regen < 1) cell.regen = Math.min(1, cell.regen + this.fx.int(0, 10) * 0.001);
        }
      }
    }

    this.time++;

    if (!this.completeNotified && isComplete(s)) {
      this.completeNotified = true;
      this.callbacks.onComplete?.();
    }
  }

  // ---------------------------------------------------------------- geometry

  private relayout(): void {
    const w = this.canvas.clientWidth || this.layout.width;
    const h = this.canvas.clientHeight || this.layout.height;
    this.layout = computeLayout(w, h, this.settings.displaySettings.globalScale, this.state.params.binCount);
    this.clampViewport();
  }

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (!this.sized) {
      // Centre on the grid once the real canvas size is known.
      this.sized = true;
      this.viewport.initialized = false;
    }
    const dpr = window.devicePixelRatio || 1;
    if (dpr !== this.dpr) this.glyphs.reset(dpr);
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.relayout();
  }

  private clampViewport(): void {
    const d = this.settings.displaySettings;
    const extent = (this.state.params.size - 1) * d.gridSpacing;
    this.viewport.clamp(extent, d.gridSpacing, this.layout.numberWindow, d.minZoomScale, d.maxZoomScale);
    this.updateVisible();
  }

  private zoomBy(delta: number, anchor?: Point): void {
    const d = this.settings.displaySettings;
    const w = this.layout.numberWindow;
    const center = anchor ?? { x: (w.x0 + w.x1) / 2, y: (w.y0 + w.y1) / 2 };
    this.viewport.zoomAt(this.viewport.scale + delta, center, d.minZoomScale, d.maxZoomScale);
  }

  private baseDigitPx(): number {
    return DIGIT_BASE_SIZE * this.settings.displaySettings.imageScale * this.viewport.scale;
  }

  private updateVisible(): void {
    const s = this.state;
    const d = this.settings.displaySettings;
    this.range = this.viewport.visibleRange(
      s.params.size,
      d.gridSpacing,
      this.layout.numberWindow,
      this.baseDigitPx() / 2,
    );
    this.visibleGroups.clear();
    if (!this.range) return;
    const { gx0, gx1, gy0, gy1 } = this.range;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const groupId = s.cells[cellIndex(s.params.size, gx, gy)]!.groupId;
        if (groupId === null) continue;
        const state = s.groups.get(groupId)?.state;
        if (state === 'dormant' || state === 'active') this.visibleGroups.add(groupId);
      }
    }
  }

  private driftAmplitude(): number {
    const amp = this.settings.displaySettings.noiseScaleOffset;
    return this.reducedMotion?.matches ? amp * 0.25 : amp;
  }

  /** Cell centre on screen including ambient drift (no jitter). */
  private cellScreenPos(cell: NumberCell): Point {
    const d = this.settings.displaySettings;
    const p = this.viewport.worldToScreen(cell.gx * d.gridSpacing, cell.gy * d.gridSpacing);
    const n = this.drift(cell.gx * d.noiseScale, cell.gy * d.noiseScale, this.time * d.noiseSpeed);
    if (cell.driftAxis === 'x') p.x += n * this.driftAmplitude();
    else p.y += n * this.driftAmplitude();
    return p;
  }

  /** Magnification from cursor proximity: 1 outside the radius. */
  private cursorScale(p: Point): number {
    if (!this.cursor) return 1;
    const d = this.settings.displaySettings;
    const dist = Math.hypot(this.cursor.x - p.x, this.cursor.y - p.y);
    if (dist >= d.mouseScaleRadius) return 1;
    return 1 + ((d.mouseScaleRadius - dist) / d.mouseScaleRadius) * d.mouseScaleMultiplier;
  }

  /** Refine the active group if the cursor is close enough to one of its digits. */
  private tryRefine(): boolean {
    const s = this.state;
    if (s.activeGroupId === null || !this.cursor) return false;
    const group = s.groups.get(s.activeGroupId);
    if (!group || group.state !== 'active') return false;
    const threshold = 0.5 + this.settings.displaySettings.mouseScaleMultiplier;
    const hit = group.cellIds.some((id) => this.cursorScale(this.cellScreenPos(s.cells[id]!)) >= threshold);
    if (!hit) return false;

    const starts = new Map<number, Point>();
    for (const id of group.cellIds) starts.set(id, this.cellScreenPos(s.cells[id]!));
    if (!refineGroup(s, group.id, starts)) return false;
    this.callbacks.onRefine?.(refinedGroupIds(s), overallProgress(s));
    return true;
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const { ctx, layout } = this;
    const s = this.state;
    const d = this.settings.displaySettings;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, layout.width, layout.height);

    const colors = { fg: THEME.fg, bg: THEME.bg };
    const reveal = this.settings.debug.revealMap;
    const basePx = this.baseDigitPx();

    if (this.range) {
      const { gx0, gx1, gy0, gy1 } = this.range;
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const cell = s.cells[cellIndex(s.params.size, gx, gy)]!;
          if (cell.flight) continue;
          const group = cell.groupId === null ? undefined : s.groups.get(cell.groupId);
          const groupScale = group?.state === 'active' ? group.scale : 0;
          const p = this.cellScreenPos(cell);
          const magnify = this.cursorScale(p);
          if (group?.superActive) {
            p.x += this.fx.int(-10, 10) * groupScale;
            p.y += this.fx.int(-10, 10) * groupScale;
          }
          let color: string = THEME.fg;
          if (reveal && group) color = group.state === 'active' ? THEME.revealActive : THEME.revealBad;
          // Reference: regen * imageScale * cursor * zoom + groupScale (group scale is zoom-independent).
          const px = cell.regen * basePx * magnify + groupScale * DIGIT_BASE_SIZE;
          this.drawDigit(cell.value, p, px, Math.min(1, cell.regen * 2), color);
        }
      }
    }

    for (const id of s.flying) {
      const cell = s.cells[id]!;
      if (cell.flight) this.drawDigit(cell.value, cell.flight, basePx, 1, THEME.fg);
    }

    const header = d.headerText.trim() || this.file.fileName;
    drawChrome(ctx, layout, header, overallProgress(s), this.logo, colors);
    drawBins(ctx, layout, s.bins, openBins(s), colors);
  }

  private drawDigit(value: number, p: Point, fontPx: number, alpha: number, color: string): void {
    if (fontPx <= 0.5 || alpha <= 0) return;
    const glyph = this.glyphs.get(color, value);
    const k = GlyphCache.scaleFor(fontPx);
    const w = glyph.width * k;
    const h = glyph.height * k;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(glyph.canvas, p.x - w / 2, p.y - h / 2, w, h);
    this.ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('pointerleave', this.onPointerLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private unbindInput(): void {
    const c = this.canvas;
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
  }

  private localPoint(e: PointerEvent | WheelEvent): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.paused) return;
    const p = this.localPoint(e);
    this.cursor = p;
    const drag = this.drag;
    if (drag && drag.pointerId === e.pointerId) {
      if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > DRAG_THRESHOLD_PX) drag.moved = true;
      if (drag.moved) {
        this.viewport.panPx(p.x - drag.lastX, p.y - drag.lastY);
        this.clampViewport();
        this.canvas.style.cursor = 'grabbing';
      }
      drag.lastX = p.x;
      drag.lastY = p.y;
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.paused || e.button !== 0) return;
    const p = this.localPoint(e);
    this.cursor = p;
    this.pressed = true;
    if (this.tryRefine()) return;
    this.drag = { pointerId: e.pointerId, startX: p.x, startY: p.y, lastX: p.x, lastY: p.y, moved: false };
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events may not support capture */
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pressed = false;
    if (this.drag?.pointerId === e.pointerId) this.drag = null;
    this.canvas.style.cursor = '';
    // Touch has no hover: forget the cursor once the finger lifts.
    if (e.pointerType === 'touch') this.cursor = null;
  };

  private onPointerLeave = (): void => {
    if (!this.drag) this.cursor = null;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (this.paused) return;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const d = this.settings.displaySettings;
    this.viewport.zoomAt(this.viewport.scale * factor, this.localPoint(e), d.minZoomScale, d.maxZoomScale);
    this.clampViewport();
  };

  // ---------------------------------------------------------------- test hooks

  /** Small inspection/control surface for e2e tests (exposed only with ?e2e). */
  readonly testApi = {
    summary: () => ({
      groups: this.state.groups.size,
      refined: this.state.bins.reduce((n, b) => n + b.refined, 0),
      total: this.state.bins.reduce((n, b) => n + b.total, 0),
      activeGroupId: this.state.activeGroupId,
      flying: this.state.flying.size,
      overall: overallProgress(this.state),
    }),
    /** Activate a visible dormant group immediately. Returns its id or null. */
    forceActivate: (): number | null => {
      this.updateVisible();
      const s = this.state;
      for (const id of this.visibleGroups) {
        const group = s.groups.get(id);
        if (group?.state !== 'dormant') continue;
        if (s.activeGroupId !== null) {
          const prev = s.groups.get(s.activeGroupId);
          if (prev?.state === 'active') prev.state = 'dormant';
        }
        group.state = 'active';
        group.scale = 0.05;
        group.reachedMax = false;
        s.activeGroupId = id;
        s.countdownTicks = 0;
        return id;
      }
      return null;
    },
    /** Screen positions (CSS px, canvas-relative) of the active group's digits. */
    activeCellPositions: (): Point[] => {
      const s = this.state;
      const group = s.activeGroupId === null ? undefined : s.groups.get(s.activeGroupId);
      return group ? group.cellIds.map((id) => this.cellScreenPos(s.cells[id]!)) : [];
    },
    /** Run simulation ticks synchronously. */
    fastForward: (ticks: number) => {
      for (let i = 0; i < ticks; i++) this.tick();
    },
    /** Refine every remaining group instantly (for completion tests). */
    refineAll: () => {
      const s = this.state;
      applyRefined(
        s,
        [...s.groups.values()].filter((g) => g.state === 'dormant' || g.state === 'active').map((g) => g.id),
      );
      s.activeGroupId = null;
      this.callbacks.onRefine?.(refinedGroupIds(s), overallProgress(s));
    },
  };
}

export type EngineTestApi = Engine['testApi'];
