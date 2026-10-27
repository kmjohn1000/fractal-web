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
each Surprise-me place (read from `configs.js`/`fractal-defs.js`/`places.js`/`colormaps.js` by `cases.mjs`, so
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

Deep-zoom views draw 8 of the 16 sharpening passes by default (`DEEP_PASSES`
in `render-layout.js`), which adds a little grain, so the suite pins 16
(`playwright.config.mjs` sets `fractalAtlas.deepPasses` for every test) and
the baselines stay valid. `deep-passes.spec.mjs` clears the pin to test the
default itself: only deep views are reduced, Save and Share still finish all
16, `#passes=N` overrides it, and the reduced picture stays the same picture.
The store screenshot, video, header and oracle scripts pin 16 as well.

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
Bands, Edge glow, Stripes, Orbs, Rays and Relief; the style ids are `smooth`,
`bands`, `glow`, `stripes`, `point`, `cross` and `relief`, see `COLOR_STYLES` in
`state-colors.js`). Relief shares Edge glow's compiled program; its specs check the
types it draws on, baselines on six fractals and two deep views, that the saved
image is the frame on screen, and that the light stays at the upper left of the
screen when the view is rotated (the Rabbit's Julia set is point symmetric, so
a half turn must draw the same picture).
They check that the style API is strict, which fractal
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

`nova.spec.mjs` covers Nova (float32 only, no deep path): it draws a full smooth
picture in Classic, sits beside Newton in the picker with its thumbnail, a share
link round-trips, a half turn draws the left-right mirror (the set is symmetric
about the real axis), a rotated view keeps its center, two baselines (rotated,
and deep near its limit), and the zoom stops at `NOVA_MIN_SCALE` however it is
asked for (link, wheel, box, keys) with the info card saying so; Back and Reset.

`dot-colors.spec.mjs` covers the coloring of the chaos-game modes (fern, Sierpinski
triangle, Lévy C, Vicsek; 1.47.0): each picture spans several hues around its picked
color, picking another color moves the whole picture to it, a deep zoom stays tinted
(not gray or black), each mode has its own color (Green, Violet, Rose, Gold to start)
and a pick changes only that mode, the toolbar pill and its name follow the mode, and
share links carry the mode's color (links from before 1.47.0 still open). Their
baselines are `mode-fern`, `mode-sierpinski`, `mode-levy` and `mode-vicsek` in
app.spec.mjs.

`places-sheet.spec.mjs` covers the Places sheet (1.46.0): every place has a unique
id and an `icons/places/<id>.webp` thumbnail (`node scripts/render_place_thumbs.mjs
--missing` makes the missing ones; the thumbnails are committed), the sheet lists
every place once, grouped in the picker's order with a chip per group, a row is a
button that names the place and its depth, it opens from the picker's first row and
the info card's button and closes with Done, Escape, a tap on the fractal and the
other popovers (never resizing the canvas), the chips jump to a group under its
sticky title, a tap flies there (info card on, name shown on landing; a place on
another fractal starts from that fractal's whole-shape view; from a pattern mode
and from dual view it brings the fractals back; Back returns), the layout on a
phone (one column) and a desktop (two) and in landscape, and a baseline.

`palettes.spec.mjs` covers the per-fractal default palettes and the upright
Burning Ship (1.44.0). Palettes: every `defaultColormap` names a real colormap
and the table is what the app ships; a fractal opens in its own palette (also a
remembered one) until one is picked in the Color sheet, then the pick holds for
every fractal and Reset or the Default Look give the defaults back; a share
link's palette is exactly what it names and counts as a pick unless it is the
fractal's own; a place's `colormap` applies on the flight and never over a pick.
Burning Ship: the flag (`flipY`) is on for a plain pick, Reset and a remembered
view, off for everything else and for the Julia pane; the top of the screen is
-Im; screen-to-complex and back round-trips flipped and turned; the picture is
the old one mirrored top to bottom (also turned, and deep on the perturbation
path); the Julia pane doesn't depend on it; a tap in dual view sets c where the
finger is; share links without `fl` open as they always did (place, turn, palette),
`fl=1` opens upright and is written only when on; Surprise me from an old-link
view lands upright and Back restores the old view.

Three scripts back them, outside the suite because they take a few minutes
or need Python with numpy and Pillow:

- `node scripts/default-identity.mjs record|check`: the default style must
  draw exactly as before the styles work (with all 16 sharpening passes, as
  the suite pins them). It renders 29 states (every
  fractal type, the perturbation, Newton and Phoenix deep paths, dual view)
  and `check` fails on a single differing pixel against the reference
  recorded in `tests/baselines/identity/`. Every state pins Inferno, so the
  per-fractal default palettes don't touch it, and the two Burning Ship
  states recorded before 1.44.0 (`ship-open`, `ship-twin-ships`) ask for the old
  orientation (`flipY: false`, and the old half turn for Twin Ships): they prove the
  old path is pixel-identical, while `ship-open-upright`, `ship-twin-ships-upright`
  and `dual-ship-upright` have references of their own. Run it after any shader
  edit: a reshaped `escapeColor` in `PHOENIX_DEEP_FRAG_SRC` once changed 10% of a
  deep Phoenix frame, and the shader compiler is the only thing that knows.
- `node scripts/oracle-compare.mjs --styles glow,stripes ...` (`--flip 1` draws the
  Burning Ship views the way the app opens them since 1.44.0 and flips the picture
  back before comparing; the oracle's relief light follows. Measured for ship, armada
  and twinships (deep, perturbation) in Smooth, Glow, Stripes, Relief, Point and
  Cross: all within the gates, Smooth 0.25 / 0.62 / 1.55 blurred, the same as the
  old orientation): renders a view
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
  Relief 0.16-1.29, Point 0.07-0.41 and Cross 0.08-1.28 (blurred difference;
  those two with the old fixed ranges). The deep views run the perturbation path against
  straight float64. Point and Cross take a per-view range: the 2nd-98th
  percentile of the escaped pixels' trap distance, from a small probe of the
  view (`trapRange` in `renderer.js`), blended with the old fixed range (`trapRangeFor`:
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
pre-push hook (`.githooks/pre-push`, turned on by `npm install`) runs lint on
every push and the whole suite only when the push carries a release tag
(`v*`, which `/release` pushes); `RUN_VISUAL=1 git push` forces the suite on
a branch push and `SKIP_VISUAL=1` skips it even for a tag. Between releases,
run the specs that cover what you changed (`npx playwright test
tests/visual/<file>.spec.mjs`). Failures leave diffs in
`test-results/report/index.html`.

## Baselines

The baselines are about 200 MB of PNGs, so they're git-ignored and stay
on this machine. Re-record a baseline only for an intentional change, and
look at it before trusting it. If the folder is lost, check out a commit
you know is good and run `npm run test:visual -- --update-snapshots=missing`.
GPU output differs between machines, so baselines from one Mac won't
match another.
