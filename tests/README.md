# Visual regression suite

```
npm run test:visual                                   # everything, ~3.5 min
npm run test:visual -- --project=webkit-iphone15      # one browser/size
npm run test:visual -- -g "Seahorse"                  # matching tests only
npm run test:visual -- --update-snapshots=all -g X    # re-record X's baselines
```

Playwright (`playwright.config.mjs`) loads the app in four projects
(Chromium and WebKit, each at 1280x800 desktop and iPhone 15) and puts it in
every state the app lists: each fractal and pattern, each colormap, and
each Surprise-me place (read from `app.js`/`colormaps.js` by `cases.mjs`, so
new ones are picked up automatically). For each state, once the frame has
settled (every supersample blended in, every IFS point plotted), it fails
if:

- the WebGL context was lost, an uncaught error fired, or the error
  banner is showing;
- the frame is blank: one color covers more than 99.5% of the canvas;
- the canvas is off-center, its drawing buffer doesn't match its shape,
  or the toolbar overlaps it;
- the screenshot differs from the golden baseline in
  `tests/baselines/<project>/` by more than 1% of pixels.

`vector.spec.mjs` covers the Koch, Pythagoras tree and dragon views, which
are drawn from the viewport (`kochAdaptive`, `treeAdaptive`,
`dragonAdaptive`): their geometry must equal the plain full-detail
generators' (`kochSnowflake`, `pythagorasTree`, `dragonCurve`) at depths
0-6 / 0-10 / 0-14; culling must not change a pixel of what's on screen (the
same view on a canvas twice the size, compared in the middle); zooming
in must add levels beyond the depth slider's and say so in the info card; a
two-finger twist must still work at depth; a nonsense view from a
hand-edited link must render quickly without errors; and three deep-zoom
screenshots are compared with baselines.

`styles.spec.mjs` and `color-sheet.spec.mjs` cover the color styles (Smooth,
Bands, Edge glow, Stripes, Orbs and Rays; the style ids are `smooth`, `bands`,
`glow`, `stripes`, `point` and `cross`, see `COLOR_STYLES` in `app.js`),
which are being built behind a flag (`localStorage["fractalAtlas.styles"] =
"1"`, or open the page once with `#styles`; the specs set it themselves
where it matters). They check that the style API is strict, which fractal
types draw which style (Phoenix has Smooth and Bands; Newton, Carpet, Gasket
and Apollonian color by their own schemes), that the orbit traps are offered
at any depth and keep real contrast deep in (their colormap range comes from a
per-view probe; the probe's decoding is unit tested), that the deep-zoom drag preview shows the current
style, that Save image equals the frame on screen, and the Color sheet: its
controls and names (the same words on the Look tiles, the style segments, the
unavailable note and the info card; the slider is Repeat), the Looks as a grid
with every tile on screen (four across on a phone, one row on an iPad), both
tabs the same height with the tab bar in place, every palette on screen at once
(named, pickable, one tab stop with the arrow keys), Reset, the slider values
shown, Phoenix showing what it draws (not a greyed choice), the palette-only
sheet on Newton, Carpet, Gasket and Apollonian, Done (named "Done"), the color
button and Escape and a plain tap on the fractal closing it while a drag or a
pinch leaves it open, and in dual view the closing tap not also gliding the
view; no rebuild on reopening and the scroll position kept; the larger text
sizes (1.5x and 2x: no overlapping or overflowing labels, no segment alone on
its row), a 360x640 phone, iPhone landscape (852x393 and 667x375), and the
sheet centered on an iPad. Also the share-link fields (`st`, `cd`, `co`:
lenient parsing, written only when not the default; the ids didn't change when
the display names did), the info card, and baselines of each style on several
fractals and of both sheet tabs.

Three scripts back them, outside the suite because they take a few minutes
or need Python with numpy and Pillow:

- `node scripts/default-identity.mjs record|check`: the default style must
  draw exactly as before the styles work. It renders 26 states (every
  fractal type, the perturbation, Newton and Phoenix deep paths, dual view)
  and `check` fails on a single differing pixel against the reference
  recorded in `tests/baselines/identity/`. Run it after any shader edit: a
  reshaped `escapeColor` in `PHOENIX_DEEP_FRAG_SRC` once changed 10% of a
  deep Phoenix frame, and the shader compiler is the only thing that knows.
- `node scripts/oracle-compare.mjs --styles glow,stripes ...`: renders a view
  in the app and in a float64 reference (`scripts/oracle/oracle.py`, which
  reads the app's own palettes) and compares them. Gates, set from what
  Smooth measures against the oracle (blurred difference 0.16-1.60 of 255
  over the twelve gate views, because float32 and float64 orbits drift
  apart in filament zones and the app takes 16 samples to the oracle's 4):
  every case needs the interior masks to agree on at least 98% of pixels and
  the difference after averaging 8x8 blocks to be at most 3 of 255; the
  "calm" views (low iteration counts) also need a mean difference of at most
  5 and at most 4% of pixels off by more than 40. Measured, all within the
  gates: Smooth 0.16-1.60, Bands 0.29-1.62, Glow 0.14-1.17, Stripes 0.37-1.94,
  Point 0.07-0.41 and Cross 0.08-1.28 (blurred difference; those two with
  the old fixed ranges). The deep views run the perturbation path against
  straight float64. Point and Cross take a per-view range: the 2nd-98th
  percentile of the escaped pixels' trap distance, from a small probe of the
  view (`trapRange` in `app.js`), blended with the old fixed range (`trapRangeFor`:
  the fixed range while the probe's is as wide as it, the probe's once it is half
  as wide or less, so shallow views look as they always did). The oracle's
  `point` and `cross` styles use the same rule (`point_fixed` and `cross_fixed`
  keep the old ranges): over mandelbrot, valley, ship, rabbit, seahorse (4e-10)
  and minibrot (1.5e-12) with Plasma, Point measures 0.12-0.81 and Cross
  0.35-1.28 (blurred difference), all within the same gates; the five shallow
  trap baselines didn't change.
- `node scripts/style-bench.mjs ['setColorStyle({style:"glow"})']`: the
  headless time of one fully refined frame. Headless Chromium on a Mac's GPU,
  so only for "did Smooth regress" and "what does a style add", never a
  phone number.

`sw.spec.mjs` checks the freshness stamps `npm run stamp` writes: `sw.js`'s
`CACHE_NAME` matches the app files, and `package.json` and `index.html`'s
`?v=` queries carry the CHANGELOG version. It also checks that `APP_SHELL`
lists everything `index.html` loads and that the installed web app starts
offline.

`scripts/test-visual.mjs` kills leftover Playwright browsers and test
servers before and after each run and runs with stdin closed. The git
pre-push hook (`.githooks/pre-push`, turned on by `npm install`) runs the
suite unless the push only touches docs; `SKIP_VISUAL=1 git push` skips it.
Failures leave diffs in `test-results/report/index.html`.

## Baselines

The baselines are about 200 MB of PNGs, so they're git-ignored and stay
on this machine. Re-record a baseline only for an intentional change, and
look at it before trusting it. If the folder is lost, check out a commit
you know is good and run `npm run test:visual -- --update-snapshots=missing`.
GPU output differs between machines, so baselines from one Mac won't
match another.
