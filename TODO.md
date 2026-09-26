# Roadmap

## Tier 0 — do now, trivial/no-risk
- [x] Rotation cos/sin computed on CPU, not per-pixel in FRAG_SRC
      (eliminates redundant cos()/sin() calls in main(), pure perf,
      no visual change) — done in `7a3e717`

## Tier 1 — growth mechanism, ship together
- [x] Screenshot/save button (preserveDrawingBuffer is already set,
      canvas.toDataURL()/toBlob() should work as-is; fractal control row
      is full at 7 buttons for one line at 360px — an 8th wraps and costs
      ~54px of canvas, so share one button with shareable links) — done in `9f94472`
- [x] Shareable links (needs a URL query/hash format + parser on load;
      serialize from mainState, not HUD text — the HUD prints ~6
      significant digits, deep-zoom links need full float64 / 17 digits;
      include type, center, scale, rotation, maxIter, colormap, Julia c;
      share via copy or Web Share API, same encoding doubles as bookmarks) — done in `9f94472`

## Tier 2 — close gaps in existing systems
- [ ] Viewport-adaptive recursion for Koch/Dragon/Tree (currently the
      only fractal family that doesn't adapt detail to zoom — Carpet/
      Gasket compute depth from pixel size, Fern regenerates from
      viewport, these three don't; subdivide only parts whose bounding box
      touches the viewport, down to ~1px — detail runs out today at ~13×
      Koch, ~1–2× Tree, ~1× Dragon; filled Koch stays correct since
      off-screen chords lie inside their bounding triangles; Dragon moves
      from the L-system string to its two-map IFS form)
- [ ] New escape-time types: Celtic Mandelbrot, Buffalo, Lambda
      (single-state iteration, reuse existing shader/perturbation/
      supersampling pipeline with no structural changes)
- [ ] Cell rebasing for Carpet/Gasket (real fix for the depth-16/22
      precision ceiling — track cell address separately from a small
      per-cell delta, refreshed at each subdivision, same principle as
      the escape-time perturbation rebasing already implemented; CPU
      resolves the ≤4 level-k cells the view overlaps and whether each is
      already a hole; exact, no glitches; ~1e15× with float64 cell math,
      more with BigInt — today Carpet ~3.5e4×, Gasket ~3,000×)

## Tier 3 — differentiation
- [ ] AI-curated "find something beautiful" auto-discovery
- [ ] Julia set live preview tied to touch position (Mandelbrot family)
- [ ] Orbit trap coloring as a style selector
- [ ] "Zoom to nearest minibrot" guided action

## Tier 4 — build once Tier 2's variety justifies it
- [x] Generic L-system engine (unify Koch/Pythagoras Tree/Dragon Curve
      into one axiom+rules+turtle interpreter; do this before adding
      more vector fractals, not after) — done in `ff5a58f`
- [ ] Make-your-own-fractal formula editor (needs the building blocks
      Celtic/Buffalo/Lambda introduce before the abstraction is clear)
- [ ] Custom 3x3 keep/remove mask for Carpet (a preset of the L-system/
      mask idea, not standalone work)

## Tier 5 — larger engineering projects
- [x] Phoenix fractal (needs two-state iteration support — z_(n-1) as
      running state — not a drop-in like Tier 2's new types) — done in `bbe2e4a`
- [ ] Phoenix deep zoom (perturbation) — the delta step itself is easy
      (dz' = 2Z·dz + dz² + dc + p·dz_prev, carrying dz_prev and reading
      Z[m-1] from the orbit), but rebasing isn't: restarting at Z[0] = 0
      needs the pixel's z AND z_prev near the reference's (0, 0), and
      z_prev usually isn't, so dz_prev enters as an O(1) term and float32
      loses the pixel offset. Needs a two-state rebase condition or
      multi-reference fallback; prototype against a float64 reference
- [ ] Newton perturbation (rational-function deltas near root
      singularities; harder than Phoenix, do after it; the difference
      factors without cancellation as
      N(Z+δ) − N(Z) = δ(2Z⁴ + 4Z³δ + 2Z²δ² − 2Z − δ) / (3Z²(Z+δ)²);
      less established than escape-time perturbation — prototype first)
- [ ] Arbitrary-precision reference orbit for zoom past ~1e13
      (computeReferenceOrbit is float64-limited to ~15-16 significant
      digits — do this if/when deep zoom becomes an actual marketed
      feature; the reference orbit is CPU/JS work (BigInt fixed-point),
      but past ~1e-35 the shader's float32 deltas also underflow, so it
      also needs extended-exponent deltas, plus BLA iteration skipping and
      2D reference-orbit textures past MAX_TEXTURE_SIZE)

## Tier 6 — do when actually needed
- [ ] maxIter past 2000 (real blockers: the shader loops are compiled
      with a constant 2000 bound, and one draw that loops 10⁴–10⁶ times
      risks a GPU watchdog timeout/context loss — needs multi-pass
      iteration, saving per-pixel state (z, dz, reference index) in float
      textures between passes; also check gl.getParameter(MAX_TEXTURE_SIZE)
      at runtime — Julia-mode reference orbit texture width is
      2*(maxIter+1) texels, safely under 4096 today; without this, deeper
      views show growing false-black interiors)

## Business layer (parallel track, not blocked on the above)
- [ ] App Store release via Capacitor (wrap the existing static files in
      a WKWebView shell, assets bundled locally rather than loading the
      GitHub Pages URL; guideline 4.2 "minimum functionality" is the
      main rejection risk, so add native value first: save to Photos,
      haptics, native share sheet, offline by default; sw.js goes unused
      inside the wrapper; needs the $99/yr developer account, a 1024px
      icon, iPhone/iPad screenshots, and a privacy policy URL; any paid
      unlock has to use StoreKit IAP) — app shell, Save to Photos, share
      sheet, icon done in `deb3efd`; real launch screen (the `deb3efd` one
      was a flat #111 image, invisible) in `a03c025`; left: on-device
      testing, signing, more haptics, screenshots, privacy policy page,
      App Store Connect submission

## Polish (whenever)
- [ ] Colormap animation (WebGL: a u_colorPhase uniform shifting the LUT
      lookup over time via requestAnimationFrame; Koch/Tree: cycle the
      colormap's stops, like kochAnimateBtn cycles depth; new toggle, not
      a repurposed "cycle colormap" button)

- [ ] Mandelbrot toolbar wraps to two lines at 360px: the row has 9 icon
      buttons (Surprise me was added after the 410px breakpoint was sized
      for 8), and 9 x 40px + gaps = 404px > 360px. Options: ~36px buttons
      below ~400px, or fold a button (e.g. dual view) into a menu. Also
      below 410px the buttons are 40px, under the 44px touch-target min

- [ ] Follow the iOS Larger Text / Dynamic Type setting in the Capacitor
      app. All UI font sizes are rem off `:root { font-size:
      calc(16px * var(--text-scale)) }`, but --text-scale is fixed at 1:
      WKWebView content doesn't get Dynamic Type, and user-scalable=no
      (needed so pinch drives the canvas) rules out browser text zoom.
      Needs native Swift: read UIContentSizeCategory (and observe its
      change notification), then evaluateJavaScript to set --text-scale
      on document.documentElement.style. Not possible in the plain web build

## Deferred indefinitely
- Menger Sponge / other 3D fractals (real 3D rendering project, not a
  slot-in)
- Real-time collaborative exploration
- Monetization (2026-09-26: the app is a portfolio piece, not a revenue
  product, until that changes): freemium structure — free explore, paid
  unlock for high-res export/watermark removal/palettes/extra fractal
  families (any paid unlock has to use StoreKit IAP); high-res export
  decoupled from the live `Math.min(devicePixelRatio, 2)` canvas cap

## Explicitly rejected
- Gasket depth cap 22 → 23: don't. The 22 cap was deliberately chosen
  with one level of safety margin below the simulated-safe 23, to
  absorb real GPUs rounding differently than the simulation did.
  Bumping it spends that margin and reintroduces the aliasing this was
  built to prevent. Cell rebasing (Tier 2) is the correct path to
  deeper Gasket zoom, not this.

## Done
- Single-color picker for Koch/Tree/Dragon/Hilbert/Gosper/Arrowhead; bolder early-depth strokes (were too faint on iPad) — `2127293`
- Watermark on exports: sentence-case "Fractal Explorer" pill, bottom-right, always on — `bc4e05f`
- Fractals centered above the toolbar (canvas ends at it; split view's lower pane no longer covered); shorter toolbar — `47dd1c7`
- Keyboard navigation: arrows pan, Shift+Left/Right rotate, +/- zoom, R reset — `64ecba2`
- Picker split into "Infinite Zoom" / "Beautiful Patterns" sections; zoom-only buttons gated on category — `3157bb6`
- Generic L-system engine; Koch/Dragon migrated; Hilbert, Gosper, Sierpinski Arrowhead added — `ff5a58f`
- Sierpinski Triangle, Lévy C Curve and Vicsek Fractal as IFS modes on the fern engine — `023d2fc`
- "Surprise me" teleport to curated Mandelbrot locations — `7e2c606`
- Box-zoom (zoom selector) for Barnsley Fern — `0a3ad53`
- Show the last frame while dragging at deep zoom — `f0f0e98`
- UI consistency: canonical control order, fern palette icon, Back for vector views, HUD hidden by default with a toggle — `05ebfaf`
- Every fractal and vector mode opens showing its whole shape — `33f5890`, `0cc7a1d`, `4e60514`
- Canvas stays below the iOS status bar when the HUD is hidden — `bae8ff5`
- Phoenix fractal (parameter-space + Julia:Phoenix) — `bbe2e4a`
- Rotation cos/sin on the CPU — `7a3e717`
- Auto maxIter from zoom (until the slider is touched) — `68cdab6`
- Colormap end color reachable (t = 1.0) + colormap name in the HUD — `a738a20`
- Colormaps Viridis/Turbo/Glacier/Ember/Grayscale + HUD lines wrap on phones — `899a803`
- Share: save image, copy link, native share (Tier 1) — `9f94472`
- Colormap picker popover (replaces cycling) + stale-LUT fix — `1603858`
