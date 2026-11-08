import type { GridParams } from '../core/types';
import { DEFAULT_SETTINGS, type Settings } from './defaults';

export const SETTINGS_KEY = 'mdr.settings.v1';
export const PROGRESS_KEY = 'mdr.progress.v1';

export interface Progress {
  version: 1;
  fileName: string;
  grid: GridParams;
  refinedGroupIds: number[];
  startedAt: string;
  completedAt: string | null;
}

/** Storage that never throws (private mode, blocked site data, SSR). */
export interface SafeStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createSafeStorage(getStorage: () => Storage | undefined = () => globalThis.localStorage): SafeStorage {
  return {
    get: (key) => {
      try {
        return getStorage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        getStorage()?.setItem(key, value);
      } catch {
        /* storage unavailable: settings stay in memory */
      }
    },
    remove: (key) => {
      try {
        getStorage()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function cloneDefaults(): Settings {
  return structuredClone(DEFAULT_SETTINGS);
}

/**
 * Merge untrusted JSON onto defaults. Unknown keys are ignored, and values of
 * the wrong type fall back to the default. Accepts the reference app's
 * `{ displaySettings, controlSettings }` shape.
 */
export function parseSettings(raw: unknown): Settings {
  const result = cloneDefaults();
  if (!isRecord(raw)) return result;
  for (const section of Object.keys(result) as (keyof Settings)[]) {
    const source = raw[section];
    if (!isRecord(source)) continue;
    const target = result[section] as unknown as Record<string, unknown>;
    for (const key of Object.keys(target)) {
      const value = source[key];
      const fallback = target[key];
      if (typeof fallback === 'number' && typeof value === 'number' && Number.isFinite(value)) {
        target[key] = value;
      } else if (typeof fallback === typeof value && typeof value !== 'number') {
        target[key] = value;
      }
    }
  }
  return sanitize(result);
}

/** Keep values in ranges the engine can work with. */
function sanitize(s: Settings): Settings {
  const d = s.displaySettings;
  d.globalScale = Math.max(0.1, d.globalScale);
  d.imageScale = Math.max(0.05, d.imageScale);
  d.gridSpacing = Math.max(10, d.gridSpacing);
  d.mouseScaleRadius = Math.max(1, d.mouseScaleRadius);
  d.minZoomScale = Math.max(0.01, d.minZoomScale);
  d.maxZoomScale = Math.max(d.minZoomScale, d.maxZoomScale);
  d.refinedToBinSpeed = Math.max(0.1, d.refinedToBinSpeed);
  const g = s.gameplay;
  g.gridSize = clampInt(g.gridSize, 5, 400);
  g.binCount = clampInt(g.binCount, 1, 10);
  g.badThreshold = Math.min(0.99, Math.max(0.5, g.badThreshold));
  g.badNoiseScale = Math.max(0.01, g.badNoiseScale);
  g.idleTimeoutSec = Math.max(0, g.idleTimeoutSec);
  return s;
}

export function loadSettings(storage: SafeStorage): Settings {
  const text = storage.get(SETTINGS_KEY);
  if (!text) return cloneDefaults();
  try {
    return parseSettings(JSON.parse(text));
  } catch {
    return cloneDefaults();
  }
}

export function saveSettings(storage: SafeStorage, settings: Settings): void {
  storage.set(SETTINGS_KEY, JSON.stringify(settings, null, 2));
}

export function exportSettings(settings: Settings): string {
  return JSON.stringify(settings, null, 4);
}

export function importSettings(text: string): Settings {
  return parseSettings(JSON.parse(text));
}

export function loadProgress(storage: SafeStorage): Progress | null {
  const text = storage.get(PROGRESS_KEY);
  if (!text) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.version !== 1 || typeof raw.fileName !== 'string' || !isRecord(raw.grid)) return null;
    const g = raw.grid;
    const nums = ['size', 'seed', 'badNoiseScale', 'badThreshold', 'binCount'] as const;
    if (!nums.every((k) => typeof g[k] === 'number' && Number.isFinite(g[k]))) return null;
    const ids = Array.isArray(raw.refinedGroupIds)
      ? raw.refinedGroupIds.filter((n): n is number => Number.isInteger(n))
      : [];
    return {
      version: 1,
      fileName: raw.fileName,
      grid: {
        size: clampInt(g.size as number, 5, 400),
        seed: g.seed as number,
        badNoiseScale: g.badNoiseScale as number,
        badThreshold: g.badThreshold as number,
        binCount: clampInt(g.binCount as number, 1, 10),
      },
      refinedGroupIds: ids,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
      completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
    };
  } catch {
    return null;
  }
}

export function saveProgress(storage: SafeStorage, progress: Progress): void {
  storage.set(PROGRESS_KEY, JSON.stringify(progress));
}

export function newProgress(fileName: string, seed: number, settings: Settings): Progress {
  const g = settings.gameplay;
  return {
    version: 1,
    fileName,
    grid: {
      size: g.gridSize,
      seed,
      badNoiseScale: g.badNoiseScale,
      badThreshold: g.badThreshold,
      binCount: g.binCount,
    },
    refinedGroupIds: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
