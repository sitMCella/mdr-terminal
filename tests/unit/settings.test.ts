import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/config/defaults';
import {
  createSafeStorage,
  importSettings,
  loadProgress,
  loadSettings,
  newProgress,
  parseSettings,
  PROGRESS_KEY,
  saveProgress,
  saveSettings,
  SETTINGS_KEY,
} from '../../src/config/settings';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe('settings', () => {
  it('imports the reference app settingsRPI.json shape', () => {
    const s = importSettings(
      JSON.stringify({
        controlSettings: { arrowSensitivity: 50.0, zoomSensitivity: 0.019999999552965164 },
        displaySettings: {
          globalScale: 1.2999999523162842,
          gridSpacing: 300.0,
          headerText: '@someone',
          imageScale: 1.0,
          maxZoomScale: 0.25,
          minZoomScale: 0.10000000149011612,
          mouseScaleMultiplier: 2.0,
          mouseScaleRadius: 50.0,
          noiseScale: 1.0,
          noiseScaleOffset: 10.0,
          noiseSpeed: 0.0020000000949949026,
          refinedToBinSpeed: 2.0,
        },
      }),
    );
    expect(s.controlSettings.arrowSensitivity).toBe(50);
    expect(s.displaySettings.gridSpacing).toBe(300);
    expect(s.displaySettings.headerText).toBe('@someone');
    expect(s.gameplay).toEqual(DEFAULT_SETTINGS.gameplay);
  });

  it('ignores unknown keys and wrong types', () => {
    const s = parseSettings({
      displaySettings: { gridSpacing: 'wide', bogus: 1, imageScale: Number.NaN },
      debug: { revealMap: 'yes' },
      extra: {},
    });
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps unusable values', () => {
    const s = parseSettings({
      displaySettings: { gridSpacing: 0, minZoomScale: 0.5, maxZoomScale: 0.1 },
      gameplay: { gridSize: 10_000, binCount: 0 },
    });
    expect(s.displaySettings.gridSpacing).toBeGreaterThan(0);
    expect(s.displaySettings.maxZoomScale).toBeGreaterThanOrEqual(s.displaySettings.minZoomScale);
    expect(s.gameplay.gridSize).toBe(400);
    expect(s.gameplay.binCount).toBe(1);
  });

  it('round-trips through storage and survives corrupt data', () => {
    const backing = memoryStorage();
    const storage = createSafeStorage(() => backing);
    const s = structuredClone(DEFAULT_SETTINGS);
    s.debug.revealMap = true;
    saveSettings(storage, s);
    expect(loadSettings(storage)).toEqual(s);

    backing.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('does not throw when storage is unavailable', () => {
    const storage = createSafeStorage(() => {
      throw new Error('SecurityError');
    });
    expect(() => saveSettings(storage, DEFAULT_SETTINGS)).not.toThrow();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('progress persistence', () => {
  it('round-trips progress', () => {
    const backing = memoryStorage();
    const storage = createSafeStorage(() => backing);
    expect(loadProgress(storage)).toBeNull();
    const p = { ...newProgress('Siena', 505, DEFAULT_SETTINGS), refinedGroupIds: [1, 4, 9] };
    saveProgress(storage, p);
    expect(loadProgress(storage)).toEqual(p);
  });

  it('rejects malformed progress', () => {
    const backing = memoryStorage();
    const storage = createSafeStorage(() => backing);
    backing.setItem(PROGRESS_KEY, JSON.stringify({ version: 2 }));
    expect(loadProgress(storage)).toBeNull();
    backing.setItem(PROGRESS_KEY, JSON.stringify({ version: 1, fileName: 'x', grid: { size: 'big' } }));
    expect(loadProgress(storage)).toBeNull();
  });
});
