# Roadmap

## Tier 0 — do now, trivial/no-risk
- [x] Rotation cos/sin computed on CPU, not per-pixel in FRAG_SRC
      (eliminates redundant cos()/sin() calls in main(), pure perf,
      no visual change) — done in `7a3e717`

## Tier 1 — growth mechanism, ship together
- [ ] Screenshot/save button (preserveDrawingBuffer is already set,
      canvas.toDataURL()/toBlob() should work as-is)
- [ ] Shareable links (HUD already serializes full view state as text;
      needs a URL query/hash format + parser on load)

## Tier 2 — close gaps in existing systems
- [ ] Viewport-adaptive recursion for Koch/Dragon/Tree (currently the
      only fractal family that doesn't adapt detail to zoom — Carpet/
      Gasket compute depth from pixel size, Fern regenerates from
      viewport, these three don't)
- [ ] New escape-time types: Celtic Mandelbrot, Buffalo, Lambda
      (single-state iteration, reuse existing shader/perturbation/
      supersampling pipeline with no structural changes)
- [ ] Cell rebasing for Carpet/Gasket (real fix for the depth-16/22
      precision ceiling — track cell address separately from a small
      per-cell delta, refreshed at each subdivision, same principle as
      the escape-time perturbation rebasing already implemented)

## Tier 3 — differentiation
- [ ] AI-curated "find something beautiful" auto-discovery
- [ ] Julia set live preview tied to touch position (Mandelbrot family)
- [ ] Orbit trap coloring as a style selector
- [ ] "Zoom to nearest minibrot" guided action

## Tier 4 — build once Tier 2's variety justifies it
- [ ] Generic L-system engine (unify Koch/Pythagoras Tree/Dragon Curve
      into one axiom+rules+turtle interpreter; do this before adding
      more vector fractals, not after)
- [ ] Make-your-own-fractal formula editor (needs the building blocks
      Celtic/Buffalo/Lambda introduce before the abstraction is clear)
- [ ] Custom 3x3 keep/remove mask for Carpet (a preset of the L-system/
      mask idea, not standalone work)

## Tier 5 — larger engineering projects
- [x] Phoenix fractal (needs two-state iteration support — z_(n-1) as
      running state — not a drop-in like Tier 2's new types) — done in `bbe2e4a`
- [ ] Newton perturbation (rational-function deltas near root
      singularities; harder than Phoenix, do after it)
- [ ] Arbitrary-precision reference orbit for zoom past ~1e13
      (computeReferenceOrbit is float64-limited to ~15-16 significant
      digits; CPU/JS-only work, shader unaffected — do this if/when deep
      zoom becomes an actual marketed feature)

## Tier 6 — do when actually needed
- [ ] maxIter past 2000 (blocked on checking gl.getParameter(MAX_TEXTURE_SIZE)
      at runtime first — Julia-mode reference orbit texture width is
      2*(maxIter+1) texels, currently safely under the 4096 minimum)

## Business layer (parallel track, not blocked on the above)
- [ ] Watermark on free-tier exports
- [ ] Freemium structure: free explore, paid unlock for high-res export/
      watermark removal/palettes/extra fractal families

## Polish (whenever)
- [ ] Colormap animation

## Deferred indefinitely
- Menger Sponge / other 3D fractals (real 3D rendering project, not a
  slot-in)
- Real-time collaborative exploration

## Explicitly rejected
- Gasket depth cap 22 → 23: don't. The 22 cap was deliberately chosen
  with one level of safety margin below the simulated-safe 23, to
  absorb real GPUs rounding differently than the simulation did.
  Bumping it spends that margin and reintroduces the aliasing this was
  built to prevent. Cell rebasing (Tier 2) is the correct path to
  deeper Gasket zoom, not this.

## Done
- Box-zoom (zoom selector) for Barnsley Fern — `0a3ad53`
- Show the last frame while dragging at deep zoom — `f0f0e98`
- UI consistency: canonical control order, fern palette icon, Back for vector views, HUD hidden by default with a toggle — `05ebfaf`
- Every fractal and vector mode opens showing its whole shape — `33f5890`, `0cc7a1d`, `4e60514`
- Canvas stays below the iOS status bar when the HUD is hidden — `bae8ff5`
- Phoenix fractal (parameter-space + Julia:Phoenix) — `bbe2e4a`
- Rotation cos/sin on the CPU — `7a3e717`
