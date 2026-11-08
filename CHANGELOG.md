# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-08

First release of MDR Terminal, a browser simulation of the Macrodata Refinement terminal from _Severance_.

### Added

- Grid of drifting numbers rendered with Canvas 2D, with hidden groups of bad numbers generated from simplex noise.
- Active-group behavior: one visible group of bad numbers wakes up every 8–25 seconds, grows, and shrinks back if it
  is not refined in time.
- Cursor magnification of nearby digits, with the active group shaking while hovered.
- Refining: clicking a digit of the active group sends the group to its bin, opens the bin lid and raises the bin's
  percentage.
- File completion screen once every bin reaches 100%, with the option to open the next file.
- Navigation by drag, arrow keys, mouse wheel and `,` / `.` zoom, plus touch support (tap to refine, drag to pan).
- Bouncing-logo screensaver, opened with `I` or after 2 minutes of inactivity.
- Help overlay (`?`) listing the controls.
- Settings panel (`Tab`) for display, controls and gameplay values, applied live, with save, JSON export and import.
  The original project's `settingsRPI.json` imports unchanged.
- "Reveal bad numbers" option that highlights bad numbers and the active group.
- Progress and settings persisted in the browser.
- `?seed=` URL parameter for a fixed board layout.
- Unit tests (Vitest), end-to-end tests (Playwright), linting (oxlint), formatting (Prettier) and type checking in CI.
- CI build, packaging and GitHub release of the static site for version tags.

[Unreleased]: https://github.com/sitMCella/mdr-terminal/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/sitMCella/mdr-terminal/releases/tag/v0.1.0
