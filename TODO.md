# TODO — fractal-web

Future ideas raised but explicitly deferred (not approved for implementation):

- **Menger sponge** — a 3D fractal; would need a different rendering approach (raymarching or similar) from the current 2D escape-time/vector renderers.
- **"Make your own fractal"** — a user-facing custom fractal builder/editor. Scope undefined.
- **Animate the colormap** — color-cycling effect: for WebGL fractals, a `u_colorPhase` uniform shifting the LUT lookup index over time (via `requestAnimationFrame`), separate from the existing "cycle colormap" button (that picks a palette; this animates within one). For Koch/tree (flat single-color fill), cycle through the colormap's stops over time instead, similar to how `kochAnimateBtn` already cycles depth on a timer. New toggle control, not a repurposing of existing buttons.
- **Screenshot/save button** — save the current canvas view as an image. Straightforward for the WebGL canvases and any Canvas2D view (`canvas.toBlob()`/`toDataURL()` + a download link or the Web Share API); needs an icon button added per mode's control row.
- **Shareable view links / bookmarks** — encode the current view (fractal type, center, scale, rotation, maxIter, colormap, and Julia c when relevant) in the URL, e.g. `#f=Mandelbrot&x=…&y=…&s=…&r=…`, so opening the link (browser or installed PWA) lands on that exact spot. A share button copies it or uses the Web Share API; the same encoding doubles as saved bookmarks. Coordinates must be written at full float64 precision (17 significant digits) or deep-zoom links land in the wrong place. Motivation: turns individual discoveries into shareable content (App Store growth loop).

- **Show the last frame while dragging at deep zoom** — below `DEEP_ZOOM_THRESHOLD` the main canvas currently freezes during a pan/pinch (see `renderAll`) instead of following the gesture. Instead, move a snapshot of the last accurate frame with the gesture until the new render lands. Note: a CSS-transform-based preview was tried before and was jumpy (see the comment above `renderAll`); drawing the snapshot as a texture through the existing rotation-aware view math is the likelier route.

## Done

- ~~Box-zoom (zoom selector) for Barnsley Fern~~ — done in `0a3ad53`.
