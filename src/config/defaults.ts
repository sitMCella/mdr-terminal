/** Field names match the reference app's settings JSON so its files import unchanged. */
export interface DisplaySettings {
  globalScale: number;
  imageScale: number;
  gridSpacing: number;
  mouseScaleRadius: number;
  mouseScaleMultiplier: number;
  minZoomScale: number;
  maxZoomScale: number;
  noiseSpeed: number;
  noiseScale: number;
  noiseScaleOffset: number;
  refinedToBinSpeed: number;
  /** Header label. Empty shows the current file name. */
  headerText: string;
}

export interface ControlSettings {
  arrowSensitivity: number;
  zoomSensitivity: number;
}

export interface GameplaySettings {
  gridSize: number;
  badNoiseScale: number;
  badThreshold: number;
  binCount: number;
  /** Seconds without input before the screensaver starts. 0 disables it. */
  idleTimeoutSec: number;
}

export interface DebugSettings {
  revealMap: boolean;
  crt: boolean;
}

export interface Settings {
  displaySettings: DisplaySettings;
  controlSettings: ControlSettings;
  gameplay: GameplaySettings;
  debug: DebugSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  displaySettings: {
    globalScale: 1,
    imageScale: 0.75,
    gridSpacing: 200,
    mouseScaleRadius: 100,
    mouseScaleMultiplier: 2,
    minZoomScale: 0.2,
    maxZoomScale: 0.8,
    noiseSpeed: 0.004,
    noiseScale: 1,
    noiseScaleOffset: 15,
    refinedToBinSpeed: 3,
    headerText: '',
  },
  controlSettings: {
    arrowSensitivity: 25,
    zoomSensitivity: 0.1,
  },
  gameplay: {
    gridSize: 100,
    // Tuned for simplex noise: about 90 groups of ~5 digits on a 100x100 grid.
    badNoiseScale: 0.12,
    badThreshold: 0.85,
    binCount: 5,
    idleTimeoutSec: 120,
  },
  debug: {
    revealMap: false,
    crt: false,
  },
};

/**
 * Layout constants at a 1280px reference width. Multiply by
 * `(viewportWidth / 1280) * globalScale` at runtime.
 */
export const LAYOUT_PRESETS = {
  referenceWidth: 1280,
  numberWindowBufferTop: 125,
  numberWindowBufferBottom: 115,
  headerImageOffsetX: 50,
  headerBoxBufferX: 55,
  headerBoxBufferY: 37,
  binOffset: 40,
  binPercentBarOffset: 50,
  binHeight: 28,
  binPercentBarHeight: 22,
  fontSize: 25,
  lineGraphicsSpacing: 10,
  lineThickness: 3,
} as const;

/** Base digit font size in world units, before imageScale and zoom. */
export const DIGIT_BASE_SIZE = 120;

export const INITIAL_ZOOM = 0.3;

export const THEME = {
  fg: '#9DE3EB',
  bg: '#010A10',
  revealBad: '#FF3B3B',
  revealActive: '#FFE600',
} as const;

/** Show-inspired names for refinement files. */
export const FILE_NAMES = [
  'Cold Harbor',
  'Siena',
  'Tumwater',
  'Dranesville',
  'Allentown',
  'Moonbeam',
  'Narva',
  'Jesup',
  'Labrador',
  'Ocula',
] as const;
