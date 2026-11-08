# MDR Terminal

A browser simulation of the Macrodata Refinement terminal from _Severance_. A grid of drifting numbers hides groups of
"bad" numbers. Your job is to spot them when they wake up and refine them into bins until the file is 100% complete.

The behavior is modeled on [andrewchilicki/LumonMDR](https://github.com/andrewchilicki/LumonMDR), a C++ desktop app for
Raspberry Pi. This version is written from scratch in React, TypeScript and Canvas 2D. See
[`docs/design.md`](docs/design.md) for the analysis and architecture.

> Unofficial fan project. Not affiliated with or endorsed by Apple TV+. The logo in `public/logo.svg` is an original
> placeholder.

## Build and run

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev        # development server at http://localhost:5173
```

To make a production build:

```sh
npm run build      # type-check and build static files into dist/
npm run preview    # serve dist/ at http://localhost:4173
```

The contents of `dist/` can be hosted on any static web server (GitHub Pages, Netlify, a Raspberry Pi in kiosk mode).

### Tests and checks

```sh
npm test                            # unit tests (Vitest)
npx playwright install chromium     # once, before the first end-to-end run
npm run test:e2e                    # end-to-end tests (Playwright) against the production build
npm run lint                        # oxlint
npm run typecheck                   # tsc
```

### Creating a release

Releases are built and published by the CI workflow (`.github/workflows/ci.yml`) when a version tag is pushed.

1. Pick the new version following [Semantic Versioning](https://semver.org/), for example `0.2.0`.
2. Update the version in `package.json` and `package-lock.json`:

   ```sh
   npm version 0.2.0 --no-git-tag-version
   ```

3. In [`CHANGELOG.md`](CHANGELOG.md), move the entries under `## [Unreleased]` into a new `## [0.2.0] - YYYY-MM-DD`
   section and update the comparison links at the bottom of the file.
4. Commit the changes and merge them into `main`.
5. Tag the commit on `main` and push the tag:

   ```sh
   git tag v0.2.0
   git push origin v0.2.0
   ```

The workflow then runs all checks and builds the app. It fails if the tag does not match the `package.json` version or if
`CHANGELOG.md` has no section for that version. If everything passes, it publishes a GitHub Release named after the tag.
The release notes come from the changelog section, and the release includes these files:

- `mdr-terminal-<version>.tar.gz` and `mdr-terminal-<version>.zip`: the static build, ready to host
- `SHA256SUMS.txt`: checksums of both packages

Every push to `main` and every pull request also uploads the same packages as a workflow artifact, so you can download a
build without making a release.

## How to use it

### Refining numbers

1. **Watch for movement.** Every 8–25 seconds, one group of bad numbers on screen starts to grow bigger.
2. **Hover over it.** Numbers near the cursor get magnified. Hovering over the active group makes it shake, and it
   stays active longer.
3. **Click one of its digits.** Aim close to the centre of a digit. The whole group flies into its bin, the bin's
   lid opens, and its percentage goes up.
4. If you don't click in time, the group shrinks back and another one wakes up later.

Each group belongs to a fixed bin, so you don't choose the bin or drag numbers into it. When every bin reaches 100%,
the file is complete and you can open the next one.

**Tip:** press `Tab` and tick **Reveal bad numbers** to see bad numbers in red and the active group in yellow.

### Controls

| Input                     | Action                                         |
| ------------------------- | ---------------------------------------------- |
| Move the mouse            | Magnify nearby digits                          |
| Click an active group     | Refine it                                      |
| Drag, or arrow keys       | Move around the grid                           |
| Mouse wheel, or `,` / `.` | Zoom out / in                                  |
| `Tab`                     | Open or close the settings panel               |
| `I`                       | Screensaver (also starts after 2 minutes idle) |
| `?`                       | Show the controls                              |
| `Esc`                     | Close panels                                   |

On touch screens, tap a digit of the active group to refine it, and drag with one finger to move around.

### Saving and settings

Progress and settings are saved in the browser, so reloading the page continues the same file. The settings panel
changes display, controls and gameplay values live. **Save** keeps them, **Export** and **Import** move them as JSON.
The original project's `settingsRPI.json` imports unchanged.

Add `?seed=505` (any number) to the URL to open a file with a fixed board layout.

## License

MIT for the code in this repository. The Montserrat font is used under the SIL Open Font License.
