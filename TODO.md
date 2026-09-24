# TODO — fractal-web

Future ideas raised but explicitly deferred (not approved for implementation):

- **Menger sponge** — a 3D fractal; would need a different rendering approach (raymarching or similar) from the current 2D escape-time/vector renderers.
- **"Make your own fractal"** — a user-facing custom fractal builder/editor. Scope undefined.
- **Animate the colormap** — color-cycling effect: for WebGL fractals, a `u_colorPhase` uniform shifting the LUT lookup index over time (via `requestAnimationFrame`), separate from the existing "cycle colormap" button (that picks a palette; this animates within one). For Koch/tree (flat single-color fill), cycle through the colormap's stops over time instead, similar to how `kochAnimateBtn` already cycles depth on a timer. New toggle control, not a repurposing of existing buttons.
- **Screenshot/save button** — save the current canvas view as an image. Straightforward for the WebGL canvases and any Canvas2D view (`canvas.toBlob()`/`toDataURL()` + a download link or the Web Share API); needs an icon button added per mode's control row.
- **Shareable view links / bookmarks** — encode the current view (fractal type, center, scale, rotation, maxIter, colormap, and Julia c when relevant) in the URL, e.g. `#f=Mandelbrot&x=…&y=…&s=…&r=…`, so opening the link (browser or installed PWA) lands on that exact spot. A share button copies it or uses the Web Share API; the same encoding doubles as saved bookmarks. Coordinates must be written at full float64 precision (17 significant digits) or deep-zoom links land in the wrong place. Motivation: turns individual discoveries into shareable content (App Store growth loop).
- **Cell rebasing for Carpet/Gasket (unlimited zoom)** — the digit-test analog of perturbation: the CPU finds the level-k cells (at most ~4) the view overlaps and whether each is already a hole, then the shader runs the digit test on coordinates local to those cells, which are back at ordinary scale. Exact (no glitches possible); ~1e15× with float64 cell math, more with BigInt. Today: Carpet ~3.5e4×, Gasket ~3,000×.
- **Gasket depth cap 22 → 23** — float32 simulation showed depth 23 still only shifts cell edges by one pixel (24 breaks); 22 was chosen for one level of margin on real phone GPUs. ~2× more Gasket zoom. Moot if cell rebasing lands.
- **View-adaptive recursion for Koch / Dragon / Pythagoras** — only subdivide parts whose bounding box touches the viewport, down to ~1 px, so zooming keeps revealing detail instead of magnifying fixed-depth geometry (today detail runs out at ~13× Koch, ~1–2× tree, ~1× dragon). Filled Koch stays correct (off-screen chords lie inside their bounding triangles); Dragon would move from the L-system string to its two-map IFS form.
- **More than 2000 iterations (multi-pass)** — deep views need 10⁴–10⁶ iterations; one GPU draw can't loop that long without risking a watchdog timeout/context loss. Split iteration across passes, saving per-pixel state (z, dz, reference index) in float textures between them, like progressive supersampling does for samples. Without it, deeper views show growing false-black interiors.
- **Perturbation for Newton z³** — the difference N(Z+δ) − N(Z) factors without cancellation as δ(2Z⁴ + 4Z³δ + 2Z²δ² − 2Z − δ) / (3Z²(Z+δ)²). Less established than escape-time perturbation; prototype first.
- **Zoom past ~1e13 (arbitrary precision)** — today's ceiling is the float64 view center. Needs a BigInt fixed-point reference orbit, extended-exponent deltas (float32 underflows below ~1e-35), BLA iteration skipping, and 2D reference-orbit textures past MAX_TEXTURE_SIZE. Multi-session project; only if deep zoom becomes a headline feature.
- **Compute rotation cos/sin on the CPU** — the shader's own `cos()`/`sin()` of `u_rotation` are approximate on some GPUs, likely why rotated deep views scored ~4 points worse against float64 than unrotated ones (invisible, sub-pixel). Pass exact cos/sin as uniforms instead.

## Done

- ~~Box-zoom (zoom selector) for Barnsley Fern~~ — done in `0a3ad53`.
- ~~Show the last frame while dragging at deep zoom~~ — done in `f0f0e98`.
