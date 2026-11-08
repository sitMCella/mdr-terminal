# MDR Terminal — Design Document

A browser-based simulation of the _Macrodata Refinement_ (MDR) terminal from _Severance_, modeled on the behavior of
[andrewchilicki/LumonMDR](https://github.com/andrewchilicki/LumonMDR) (a C++/ImGui/OpenGL desktop app for Raspberry Pi).

This document analyzes the reference implementation (§1), describes the architecture and configuration of the
implemented React application (§2–§3), records the implementation status against the original plan (§4), and lists
open extensions, legal notes and risks (§5–§7).

---

## 1. Reference implementation analysis

The reference is small (~1,300 lines of C++). Its behavior breaks down into five areas.

### 1.1 Source layout

| Reference file                    | Responsibility                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.cpp`                    | GLFW window (fullscreen on RPi, 1920×1080 otherwise), main loop, `Esc` to quit                                                                           |
| `src/UI/UIManager.cpp`            | Mode switching: `Tab` toggles the settings panel, `I` toggles idle mode, a left click leaves idle mode. Defines the `lumonBlue` color `rgb(157,227,235)` |
| `libs/Numbers/Number.h`           | Data model: `Number`, `BadGroup`, `NumberDisplayInfos`                                                                                                   |
| `libs/Numbers/NumberGrid.cpp`     | Grid generation, bad-number detection, grouping, and the active-group state machine                                                                      |
| `src/UI/Widgets/NumbersPanel.cpp` | Rendering, viewport (pan/zoom), cursor magnification, refine-on-click, bin animation, progress bars                                                      |
| `src/UI/Widgets/IdleScreen.cpp`   | Bouncing-logo screensaver                                                                                                                                |
| `src/UI/Widgets/Settings.h`       | `DisplaySettings`, `ControlSettings`, `PresetDisplaySettings`, JSON load/save                                                                            |
| `libs/Image/*`                    | Loads PNG textures via stb_image                                                                                                                         |
| `assets/`                         | `numbers/0-9.png`, `bins/bin01-05.png`, `bin-open.png`, `bin-percent.png`, `lumon-logo.png`, `Montserrat-Bold.ttf`                                       |
| `external/`                       | imgui, nlohmann/json, siv::PerlinNoise, stb                                                                                                              |

### 1.2 Grid generation (`NumberGrid::generateGrid`)

1. Create a `gridSize × gridSize` grid (100 × 100 = 10,000 cells).
2. Each cell gets a random digit `0–9` and a random `horizontalOffset` flag. The flag decides whether the cell's drift
   animation moves it along the X axis or the Y axis.
3. Mark a cell as **bad** when `perlin(seed=505).noise2D_01(x * 0.4, y * 0.4) > 0.7`.
4. **Group bad cells** in one pass. For each bad cell, look at its 8 neighbors. If a neighbor already belongs to a group,
   join that group. Otherwise start a new group and assign it a random bin index `0–4`.
   - This single pass can split one connected blob into several groups. That is acceptable, and it is part of the
     original feel.
5. Each bin's `maxBadGroups` is the number of groups assigned to it. This value is the denominator of the bin's
   percentage.

### 1.3 Active-group state machine (`NumberGrid::update`, once per frame)

```
             countdown hits 0 and a visible group exists
  IDLE ─────────────────────────────────────────────▶ ACTIVE (scale grows 0 → 0.23)
   ▲                                                    │  cursor hovers → superActive (max 0.24, jitter)
   │ countdown = rand(5..15) * 100 frames               ▼
   └────────── scale falls to 0, or group leaves viewport ◀── reachedMax → scale shrinks
                                                         │
                                         click while hovered → REFINED (fly to bin)
```

- Only **one** group is active at a time. It is picked at random from the groups that are visible in the viewport.
- Each frame, scale grows by `0.0001 × rand(1..10)` until it reaches 0.23. Once the group reaches its maximum, scale
  shrinks at the same rate.
- **Super active**: the cursor magnifies any digit of the group above 1.0. The group then jitters by
  `rand(-10..10) × scale` px per axis, and its peak is extended to 0.24.
- Group timing is counted in **frames**, not seconds. The first group appears after 500 frames, and later groups after
  500–1500 frames. At 60 fps that is about 8–25 s.

### 1.4 Rendering and interaction (`NumbersPanel`)

- **World-to-screen mapping**: `screen = (gridIndex * gridSpacing + panelOffset) * panelScale + windowPos`. The view
  starts centered on the grid. `panelScale` is clamped to `[minZoomScale, maxZoomScale]`, and `panelOffset` is clamped
  so the view stays inside the grid.
- **Visibility culling**: only cells fully inside the number window are drawn and can become active. The number window
  is the screen area between the top and bottom buffers.
- **Ambient drift**: each cell is offset by `perlin(seed=555).noise3D(x * noiseScale, y * noiseScale, t * noiseSpeed) * noiseScaleOffset`
  along its own axis.
- **Cursor magnification**: within `mouseScaleRadius`, a digit's scale is
  `1 + (radius - d) / radius * mouseScaleMultiplier`.
- **Refine**: the click registers when the group is active, the cursor is on one of its digits with magnification
  `>= 0.5 + mouseScaleMultiplier` (near the digit's center), and the left mouse button is down. On refine:
  - The bin's `badGroupsRefined` counter increments.
  - Each digit flies in a straight line toward its bin at `refinedToBinSpeed` px/frame.
  - The bin shows its "open" lid graphic while digits are in flight.
  - When a digit arrives, it gets a new random value, leaves the group, and fades back in through `regenerateScale`.
- **Fade-in**: `regenerateScale` rises from 0 to 1 by `rand(0..10) × 0.001` per frame. This produces a staggered
  "load" effect, and it replays when the app leaves idle mode.
- **Chrome**: a header box with text (`headerText`) and the logo at its right end, two double horizontal lines that
  frame the number window, and 5 bins at `x = width/6 × id` along the bottom. Each bin has a percent bar.
- **Debug "revealMap"**: bad cells render red, and the active group renders yellow.
- **Responsive scaling**: layout constants (`PresetDisplaySettings`) scale with `viewportWidth / 1280 × globalScale`.

### 1.5 Controls (reference)

| Input      | Action                                                 |
| ---------- | ------------------------------------------------------ |
| Arrow keys | Pan by `arrowSensitivity`                              |
| `,` / `.`  | Zoom out / in by `zoomSensitivity`                     |
| Mouse move | Magnify digits near the cursor; super-activate a group |
| Left click | Refine the active group; leave idle mode               |
| `Tab`      | Toggle the settings panel                              |
| `I`        | Toggle idle mode                                       |
| `Esc`      | Quit (in the web app: close panels instead)            |

### 1.6 Gaps in the reference to address

- Nothing is persisted. Progress resets when the app restarts. (Addressed: §3.5.)
- There is no completion state at 100%, no file or session concept, and no sound. (Completion and files addressed;
  sound not implemented.)
- All timing depends on frame rate, which on the web varies between 60, 120, and 144 Hz. (Addressed: §2.4.)
- The repository has **no license**, and the logo and show imagery belong to Apple TV+. Assets must not be copied (see §6).

---

## 2. Architecture (as implemented)

### 2.1 Technology choices

| Concern                      | Choice                                                                 | Rationale                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Language                     | **TypeScript** (strict)                                                | Type-safe port of the C++ data model                                                                                          |
| Build / dev server           | **Vite** (`react-ts` template)                                         | Zero-config, fast HMR, static output                                                                                          |
| Rendering                    | **HTML Canvas 2D** (one canvas, DPR-aware)                             | Only visible cells are drawn (a few hundred at default zoom), so Canvas 2D is enough. PixiJS remains a possible later upgrade |
| Noise                        | **`simplex-noise`** + small seeded PRNG (mulberry32, in `core/rng.ts`) | Replaces siv::PerlinNoise. Fixed seeds keep the layout deterministic                                                          |
| UI overlay (settings, menus) | **React 19** components over the canvas                                | Settings panel (replaces the ImGui window), help, idle and completion screens. The canvas engine stays framework-free         |
| State persistence            | `localStorage` (versioned JSON, every access wrapped in try/catch)     | Replaces `settings.json`, and also stores progress                                                                            |
| Font                         | **Montserrat** 500 and 700 via `@fontsource/montserrat` (bundled, OFL) | Same font as the reference, with a compatible license, no external requests                                                   |
| Testing                      | **Vitest** (unit), **Playwright** (e2e, Chromium)                      | Covers the pure simulation logic and the browser behavior                                                                     |
| Lint / format                | **oxlint** (Vite template default) + Prettier                          |                                                                                                                               |
| Deploy                       | Static files from `dist/` (relative `base: './'`)                      | No backend required; works from any path, e.g. GitHub Pages                                                                   |

No backend is used. Section 5 covers optional multi-user extensions.

### 2.2 Module layout

```
mdr-terminal/
├─ index.html
├─ public/logo.svg       # original placeholder mark (not the Lumon logo), also the favicon
├─ src/
│  ├─ main.tsx           # React root, fonts, global styles
│  ├─ App.tsx            # app state: settings, progress, mode (work/idle/complete), shortcuts, idle timer, test hook
│  ├─ styles.css         # theme tokens, overlays, settings panel, CRT overlay
│  ├─ config/
│  │  ├─ defaults.ts     # settings types and defaults, layout presets, theme, digit size, file names
│  │  └─ settings.ts     # safe localStorage, parse/validate/import/export settings, progress persistence
│  ├─ core/              # pure logic, no DOM: unit-testable
│  │  ├─ rng.ts          # seeded PRNG (mulberry32) + Math.random-based cosmetic RNG
│  │  ├─ noise.ts        # seeded 2D/3D simplex noise wrappers
│  │  ├─ types.ts        # NumberCell, BadGroup, Bin, GridParams, SimState
│  │  ├─ grid.ts         # generateGrid(): digits, bad map, one-pass grouping, bins
│  │  ├─ activeGroup.ts  # active-group state machine (tick-based) and its constants
│  │  ├─ refine.ts       # refine action, flight progression, regeneration, restore
│  │  └─ progress.ts     # per-bin + overall percentages, completion detection
│  ├─ engine/            # canvas engine, framework-free
│  │  ├─ engine.ts       # fixed-timestep loop, pointer/wheel input, digit rendering, e2e test API
│  │  ├─ viewport.ts     # pan/zoom, world↔screen, clamping, culling
│  │  ├─ layout.ts       # chrome positions from scaled presets
│  │  ├─ chrome.ts       # header box, logo, frame lines, bins, lids, percent bars
│  │  ├─ glyphs.ts       # pre-rendered digit sprites with baked glow
│  │  └─ Terminal.tsx    # React wrapper that mounts the engine and syncs props
│  └─ ui/
│     ├─ SettingsPanel.tsx  # Tab panel: §3.1 fields + editable §3.2 fields, Save/Reset/Import/Export, new file
│     ├─ HelpOverlay.tsx    # controls reference (?)
│     ├─ IdleScreen.tsx     # bouncing-logo screensaver
│     └─ CompleteScreen.tsx # 100% screen + next file
├─ tests/
│  ├─ unit/              # Vitest: grid, state machine, refine/progress, settings, viewport/layout
│  └─ e2e/               # Playwright: render, refine + persistence, settings, idle, completion, help
├─ .github/workflows/ci.yml
├─ vite.config.ts, playwright.config.ts, tsconfig*.json, .oxlintrc.json, .prettierrc.json
└─ docs/design.md
```

`core/` holds all simulation state and contains no rendering code. `engine/` renders that state and changes it only
through `core/` functions. React owns overlays and app state, never per-frame drawing. This split lets the simulation
run at a fixed tick rate and be unit-tested without a browser.

Keyboard input is split: `App.tsx` has one global `keydown` listener for app shortcuts (`Tab`, `I`, `?`, `Esc`) and
forwards navigation keys to `Engine.handleKey()`. Pointer and wheel input are handled by the engine on the canvas.

### 2.3 Data model (`core/types.ts`)

```ts
interface NumberCell {
  id: number; // index in the flat array: gy * size + gx
  gx: number;
  gy: number;
  value: number; // 0..9
  driftAxis: 'x' | 'y'; // reference: horizontalOffset
  groupId: number | null; // bad group membership
  regen: number; // 0..1 fade-in (reference: regenerateScale)
  flight: Point | null; // screen position (CSS px) while flying to a bin
}

interface BadGroup {
  id: number;
  cellIds: number[];
  binIndex: number; // 0..binCount-1
  state: 'dormant' | 'active' | 'refining' | 'done';
  superActive: boolean;
  scale: number; // 0..0.24
  reachedMax: boolean;
}

interface Bin {
  index: number;
  refined: number;
  total: number;
}

interface GridParams {
  size: number;
  seed: number;
  badNoiseScale: number;
  badThreshold: number;
  binCount: number;
}

interface SimState {
  params: GridParams;
  cells: NumberCell[];
  groups: Map<number, BadGroup>;
  bins: Bin[];
  activeGroupId: number | null;
  countdownTicks: number;
  flying: Set<number>; // ids of cells currently flying to a bin
}
```

- The flat array replaces the reference's `std::map<int, std::map<int, Number>>` and allows O(1) neighbor lookups.
- Whether a bin's lid is open is not stored: `openBins()` derives it from `flying`.
- The file name and start/end dates live in `Progress` (§3.5), not in the simulation. The drift time counter lives in
  the engine.
- A board is fully defined by its `GridParams`, so saved progress is just those parameters plus the refined group IDs.

### 2.4 Main loop (`engine.ts`)

- `requestAnimationFrame` drives rendering.
- The simulation advances in a **fixed timestep of 60 ticks/s** with an accumulator. All reference constants (scale
  steps, countdowns, fly speed) are defined per tick, so the feel is the same on 60 Hz and 144 Hz displays.
- Render interpolation is not used. Motion is slow enough that drawing the latest tick looks smooth.
- Each frame checks `document.visibilityState`; ticks stop while the tab is hidden, and frame time is capped at 250 ms
  so there is no burst of catch-up ticks afterwards.
- The engine is also paused (`setPaused`) whenever the app is not in `work` mode, i.e. in idle and completion screens.
- Each tick: compute the visible cell range and visible groups, advance the active-group state machine, apply hover
  (super active) and a held press (refine), advance flights, advance fade-in for visible cells, and check completion.

---

## 3. Configuration

### 3.1 Runtime settings (user-tunable, persisted, in the settings panel)

Field names match the reference so its JSON files can be imported. Defaults come from `Settings.h`; the reference's RPi
overrides are shown for comparison. Values are sanitized before reaching the engine (for example zoom limits are kept
in order, spacing and radius stay positive).

| Group   | Key                             | Default   | RPi value  | Meaning                                                                       |
| ------- | ------------------------------- | --------- | ---------- | ----------------------------------------------------------------------------- |
| display | `globalScale`                   | 1.0       | 1.3        | Multiplier on all layout presets                                              |
| display | `imageScale`                    | 0.75      | 1.0        | Base digit size                                                               |
| display | `gridSpacing`                   | 200       | 300        | World units between cells                                                     |
| display | `mouseScaleRadius`              | 100       | 50         | Cursor magnification radius (px)                                              |
| display | `mouseScaleMultiplier`          | 2.0       | 2.0        | Peak extra magnification                                                      |
| display | `minZoomScale` / `maxZoomScale` | 0.2 / 0.8 | 0.1 / 0.25 | Zoom clamp                                                                    |
| display | `noiseSpeed`                    | 0.004     | 0.002      | Drift animation speed                                                         |
| display | `noiseScale`                    | 1.0       | 1.0        | Spatial frequency of the drift                                                |
| display | `noiseScaleOffset`              | 15        | 10         | Drift amplitude (px)                                                          |
| display | `refinedToBinSpeed`             | 3.0       | 2.0        | Fly-to-bin speed (px/tick)                                                    |
| display | `headerText`                    | `""`      | —          | Header label; empty shows the file name (the reference uses an author handle) |
| control | `arrowSensitivity`              | 25        | 50         | Pan step per key press (world units)                                          |
| control | `zoomSensitivity`               | 0.1       | 0.02       | Zoom step per key press                                                       |
| debug   | `revealMap`                     | false     | —          | Color bad (red) and active (yellow) cells                                     |
| debug   | `crt`                           | false     | —          | Scanline and vignette overlay                                                 |

### 3.2 Gameplay values

Only some of these are user settings. The rest are code constants.

| Key                               | Default                      | Where it lives                                         | Source in reference           |
| --------------------------------- | ---------------------------- | ------------------------------------------------------ | ----------------------------- |
| `gridSize`                        | 100                          | Settings panel (applies to the next file)              | `NumbersPanel::gridSize`      |
| `badNoiseScale`                   | 0.12                         | Settings panel (next file)                             | `badScale` (0.4 with Perlin)  |
| `badThreshold`                    | 0.85                         | Settings panel (next file)                             | `badThresh` (0.7 with Perlin) |
| `binCount`                        | 5                            | Settings panel (next file)                             | `std::array<Bin, 5>`          |
| `idleTimeoutSec`                  | 120 (0 = off)                | Settings panel                                         | New: automatic screensaver    |
| `seed`                            | random per file              | Saved progress; `?seed=<n>` in the URL forces one      | Perlin seeds 505 / 555        |
| `groupGrowMax` / `superActiveMax` | 0.23 / 0.24                  | `DEFAULT_ACTIVE_GROUP_CONFIG` in `core/activeGroup.ts` | `update()`                    |
| `groupScaleStep`                  | 0.0001 × rand(1..10)         | same                                                   | `update()`                    |
| `superActiveCreep`                | 0.00001 per tick             | same                                                   | `update()`                    |
| `groupCooldownMin/MaxTicks`       | 500 / 1500                   | same                                                   | `randomNumber(5,15) * 100`    |
| `FIRST_GROUP_DELAY_TICKS`         | 500                          | `core/grid.ts`                                         | `newBadGroupCountdown`        |
| Jitter                            | rand(-10..10) × group scale  | `engine.ts` render                                     | `randomNumber(-10,10)`        |
| Refine threshold                  | `0.5 + mouseScaleMultiplier` | `engine.ts` `tryRefine()`                              | click condition               |

The reference noise values (0.4 / 0.7) produced mostly single-digit groups with simplex noise. 0.12 / 0.85 was chosen
by measuring generated boards: about 90 groups of about 5 digits on a 100×100 grid.

Grid parameters are copied into the saved progress when a file is created, so changing them in the settings never
breaks the file in progress; they take effect with **Start new file** or **Open next file**.

### 3.3 Layout constants (`LAYOUT_PRESETS`, not user-facing)

At a 1280 px reference width: `numberWindowBufferTop 125`, `numberWindowBufferBottom 115`, `headerImageOffsetX 50`,
`headerBoxBufferX 55`, `headerBoxBufferY 37`, `binOffset 40`, `binPercentBarOffset 50`, `binHeight 28`,
`binPercentBarHeight 22`, `fontSize 25`, `lineGraphicsSpacing 10`, `lineThickness 3`.

- Scale factor: `k = max(width / 1280, min(0.6, height / 720)) × globalScale`. The floor keeps the chrome legible on
  phones; the reference used `width / 1280` only.
- Presets are scaled from their base values on every layout, not mutated cumulatively as in the reference.
- The reference's image-scale presets (`headerImageScale`, `binImageScale`) are replaced by vector drawing: the logo is
  drawn at 1.9 × the header-box height, and bins are `min(slot × 0.72, 220 × k)` wide, where `slot = width / (binCount + 1)`.
- Other engine constants: `DIGIT_BASE_SIZE 120` (digit font size in world units before `imageScale` and zoom) and
  `INITIAL_ZOOM 0.3`.

### 3.4 Theme

| Item                   | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Foreground (lumonBlue) | `#9DE3EB` / `rgb(157,227,235)`; CSS `--mdr-fg`, canvas `THEME.fg`                     |
| Background             | `#010A10`; CSS `--mdr-bg`, canvas `THEME.bg`                                          |
| Other CSS tokens       | `--mdr-fg-dim` (60%), `--mdr-fg-faint` (15%), `--mdr-panel`, `--mdr-font`             |
| Percent bar fill       | foreground at 30% alpha (canvas)                                                      |
| Reveal colors (debug)  | `#FF3B3B` bad, `#FFE600` active (canvas `THEME`)                                      |
| Font                   | Montserrat 700 for digits and canvas chrome, 500 for the React UI                     |
| Digit glow             | Always on, baked into the digit sprites (`shadowBlur` once per sprite, not per frame) |
| CRT overlay            | CSS scanlines and vignette, toggled by `debug.crt`, off by default                    |

### 3.5 Persistence schema (`localStorage`)

```jsonc
// key: "mdr.settings.v1"
{ "displaySettings": { ... }, "controlSettings": { ... }, "gameplay": { ... }, "debug": { ... } }

// key: "mdr.progress.v1"
{
  "version": 1,
  "fileName": "Cold Harbor",
  "grid": { "size": 100, "seed": 505, "badNoiseScale": 0.12, "badThreshold": 0.85, "binCount": 5 },
  "refinedGroupIds": [3, 17, 42],
  "startedAt": "2026-11-08T20:00:00.000Z",
  "completedAt": null
}
```

- Settings are written only when the user presses **Save**; edits apply live before that.
- Progress is written whenever it changes (each refine, completion, new file).
- On load, `generateGrid(grid)` rebuilds the board and `applyRefined()` marks the stored groups as done. Restored cells
  keep their original digits (the random digits from regeneration are not saved).
- If the URL has `?seed=<n>` and it differs from the saved file, a new file with that seed is started.
- Import/export use the same shape, and the reference's `{ displaySettings, controlSettings }` file loads unchanged.
  Unknown keys and values of the wrong type are ignored; missing keys fall back to defaults. Malformed progress is
  discarded and a new file is started.

### 3.6 Project and tooling configuration

- `package.json` scripts: `dev`, `build` (`tsc -b && vite build`), `preview`, `typecheck`, `test`, `test:watch`,
  `test:e2e`, `lint`, `format`, `format:check`.
- TypeScript project references: `tsconfig.app.json` (src), `tsconfig.node.json` (Vite and Playwright configs),
  `tsconfig.test.json` (tests). Options include `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`,
  `verbatimModuleSyntax`, target `es2023`.
- `vite.config.ts`: `base: './'` and the Vitest config (`tests/unit/**/*.test.ts`, Node environment).
- `playwright.config.ts`: Chromium at 1280×720; the web server runs `npm run build` then `vite preview` on port 4173.
- `.github/workflows/ci.yml`: lint, format check, typecheck, unit tests, Playwright (which also builds); uploads the
  Playwright report on failure. No deploy job.
- `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `.oxlintrc.json`.

---

## 4. Implementation status

The plan was carried out phase by phase. This section records what was built and where it differs from the plan.

### Phase 0 — Scaffold: done

Vite `react-ts` template with `simplex-noise`, `@fontsource/montserrat`, Vitest, Playwright, oxlint and Prettier;
full-viewport DPR-aware canvas with a `ResizeObserver`; fixed-timestep loop; CI. The planned dev-build tick counter
was not added.

### Phase 1 — Core simulation: done

| Planned                                        | Implemented                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `generateGrid(size, seed, badScale, thresh)`   | `generateGrid(params: GridParams)`                                                                          |
| `tick(state, visibleGroupIds, hoveredGroupId)` | `tickActiveGroup(state, visibleGroupIds, rng, cfg)`; hover via `setSuperActive(state, id)`                  |
| `refine(groupId)`                              | `refineGroup(state, groupId, startPositions)`                                                               |
| `advanceFlights(binPositions)`                 | `advanceFlights(state, binPositions, speed, rng)`, plus `openBins()`, `applyRefined()`, `refinedGroupIds()` |
| `progress.ts`                                  | `binProgress()`, `overallProgress()`, `isComplete()`, `formatPercent()` (floors, so 100% only when done)    |

Unit tests cover determinism, grouping, bin totals, the full state machine (including super-active extension and
leaving view), refine-once, flights, restore, completion, settings parsing and storage, viewport and layout.

### Phase 2 — Viewport and number rendering: done, simplified

- `viewport.ts` as planned. Zoom keeps the window centre (keys) or the cursor (wheel) fixed.
- `glyphs.ts` renders each digit once per color at 128 px (capped at 2× DPR) with a baked glow, instead of several
  size buckets.
- Digit drawing lives in `engine.ts` (no separate `renderer.ts` / `numbers.ts`). Digit size in px is
  `regen × DIGIT_BASE_SIZE × imageScale × zoom × cursorScale + groupScale × DIGIT_BASE_SIZE`, matching the
  reference formula. Alpha is `min(1, regen × 2)`.

### Phase 3 — Interaction: done, without separate input modules

- Pointer and wheel input are in `engine.ts`; keyboard shortcuts are in `App.tsx` (see §2.2). No `pointer.ts` or
  `keyboard.ts`.
- Refine happens on pointer down, or while the button is held still (not dragging) and an active group is under the cursor.
- Drag pans the grid after a 6 px threshold; wheel zooms around the cursor; `,`/`-` and `.`/`=`/`+` zoom.
- Touch: a tap sets the cursor and refines if it hits the active group; one-finger drag pans. Pinch zoom and the
  long-press magnifier were not implemented.
- Shortcuts are ignored while typing in a settings field; any key or click leaves idle mode.

There is no free selection: the player cannot pick arbitrary numbers or drag them into a chosen bin. Each group's bin
is fixed at generation, as in the reference (see §5 for a possible manual mode).

### Phase 4 — Chrome, bins, progress: done

Everything is drawn in `chrome.ts` (no separate `bins.ts`): header box with header text on the left and
"N% Complete" on the right, logo straddling the box edge, double frame lines, bins labelled `01`–`05` with percent
bars, and the open lid drawn as two flaps while digits fly in.

### Phase 5 — Screens and persistence: done, except the boot screen

Settings panel, progress persistence (on every change instead of `beforeunload`), idle screen (key `I`, inactivity
timeout, click or key to leave, fade-in replays), and completion screen (fires once all groups are refined and every
digit has landed). The optional boot screen was not built.

### Phase 6 — Polish and quality: partly done

| Item                     | Status                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Audio                    | Not implemented                                                                                                                           |
| CRT overlay              | Done (`debug.crt`)                                                                                                                        |
| `prefers-reduced-motion` | Partly: drift amplitude is cut to 25%; jitter is unchanged                                                                                |
| Keyboard-only refining   | Not implemented                                                                                                                           |
| High-contrast option     | Not implemented                                                                                                                           |
| Performance              | Culling and sprites in place; no formal profiling pass                                                                                    |
| Playwright tests         | Done: 6 tests using the `?e2e` test API (`window.__MDR__`: `summary`, `forceActivate`, `activeCellPositions`, `fastForward`, `refineAll`) |
| README                   | Done: overview, build, interaction                                                                                                        |

### Phase 7 — Deploy: not done

The build is static and path-independent, but there is no deploy job and no kiosk-mode documentation yet.

---

## 5. Optional extensions

- **Manual selection mode**: drag a box (or click cells) to select numbers, then drop the selection on a bin of the
  player's choice; only selections matching a real bad group count. Panning would move to arrow keys, right-drag or
  `Space` + drag.
- **Multiple files**: partly done. Each new file gets a show-inspired name and a new seed, but only one file's progress
  is stored at a time. Keeping progress per file is still open.
- **Temperament bins**: label the four sub-bars inside each bin as WO / FC / DR / MA, and split each refined group
  between them at random. This is cosmetic and show-inspired; the reference does not implement it.
- **Shared floor / leaderboard**: a small backend (e.g. Supabase or a Node/WebSocket server) so several "refiners" can
  see each other's progress.
- **Quotas and timers**: daily quota mode with a session timer.

---

## 6. Legal and asset notes

- The reference repository has **no license file**, so its code and assets (digit PNGs, bin art, logo) are all rights
  reserved. This project reimplements the behavior from scratch and copies none of its source or `assets/`. This
  document describes algorithms and parameters only.
- "Lumon", its logo, and _Severance_ imagery are Apple TV+ intellectual property. The project uses an original
  placeholder mark (`public/logo.svg`), vector-drawn bins, and a disclaimer in the README and help overlay.
- Montserrat is bundled under the SIL Open Font License.
- This repository is MIT-licensed. Keep any third-party assets compatible with that license and credit them in the README.

---

## 7. Risks and mitigations

| Risk                                      | Mitigation (status)                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Frame-rate-dependent feel                 | Fixed 60 Hz simulation tick (done, §2.4)                                                                                       |
| Too many glyphs per frame on slow devices | Visible-range culling and cached digit sprites (done). Skipping noise at low zoom and a PixiJS fallback were not needed so far |
| Blurry rendering on HiDPI screens         | DPR-scaled canvas backing store; sprites rendered at up to 2× (done)                                                           |
| Single-pass grouping produces odd splits  | Kept for authenticity; a flood-fill option is not implemented                                                                  |
| Corrupt or old localStorage data          | Versioned keys, validation, fallback to defaults or a new file (done, unit-tested)                                             |
| Touch devices have no hover               | A tap places the cursor and refines if it hits the active group (done). No larger radius for coarse pointers                   |
| Chrome too small on phones                | Layout scale floor (done, §3.3)                                                                                                |
