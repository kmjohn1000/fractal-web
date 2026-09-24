# TODO — fractal-web

Future ideas raised but explicitly deferred (not approved for implementation):

- **Menger sponge** — a 3D fractal; would need a different rendering approach (raymarching or similar) from the current 2D escape-time/vector renderers.
- **"Make your own fractal"** — a user-facing custom fractal builder/editor. Scope undefined.
- **Animate the colormap** — color-cycling effect: for WebGL fractals, a `u_colorPhase` uniform shifting the LUT lookup index over time (via `requestAnimationFrame`), separate from the existing "cycle colormap" button (that picks a palette; this animates within one). For Koch/tree (flat single-color fill), cycle through the colormap's stops over time instead, similar to how `kochAnimateBtn` already cycles depth on a timer. New toggle control, not a repurposing of existing buttons.
