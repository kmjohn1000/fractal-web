// Fractal configs: FTYPE, PHOENIX_P, FRACTAL_CONFIGS, FRACTAL_NAMES, fractalLabel and slugify.
// Split from app.js (a pure move); loads first of the app.js pieces, so it needs nothing from them.

"use strict";

// ---------------------------------------------------------------- fractal configs
// Ported from mandelbrot.py's FRACTAL_CONFIGS. view is [xmin, xmax, ymin, ymax],
// the region that must be fully visible when the fractal first opens;
// viewFromBounds fits it to the canvas's aspect ratio (see there).

const FTYPE = { ESCAPE: 0, SHIP: 1, TRICORN: 2, NEWTON: 3, CARPET: 4, GASKET: 5, PHOENIX: 6, CELTIC: 7, APOLLONIAN: 8 };

// Phoenix's fixed p in z' = z^2 + c + p*z_prev: the classic real -0.5
// (Ushiki). With c = 0.5667 in Julia mode that gives the well-known twin-lobe
// image (Julia:Phoenix); p = -0.5+0.5i was tried first and gives only a single
// tilted lobe in either mode. A constant for the fractal, not view state.
const PHOENIX_P = [-0.5, 0];

// category gates the zoom-only toolbar buttons (box zoom, Surprise me); where
// a tile sits in the fractal picker is PICKER_LAYOUT's job (fractal-defs.js):
//   "zoom"    - fractals you explore by zooming: every escape-time type
//               (Mandelbrot and its variants, the Julia presets, Newton)
//               the digit-test Carpet/Gasket and the Apollonian gasket's
//               circle inversions. Everything in
//               FRACTAL_CONFIGS is "zoom"; any future escape-time or
//               digit-extraction type belongs here too.
//   "pattern" - the Canvas2D curves and chaos-game IFS shapes (EXTRA_MODES).
// defaultColormap (optional, a COLORMAPS name) is the palette the fractal
// opens in until the user picks one (see applyDefaultColormap in
// state-colors.js); without it, the first colormap, Inferno. Chosen by looking
// at each fractal's views in every palette, not by rule.
const FRACTAL_CONFIGS = {
  // The escape-time and Julia boxes are the sets' measured extents
  // (antenna/tips included; for dust-like Julia sets, points surviving 60+
  // iterations) plus a ~0.1 margin, so each opens filling the screen.
  // Tricorn's tips reach y = +-1.54, which its old +-1.25 box clipped even
  // before aspect fitting.
  "Mandelbrot":   { label: "Mandelbrot", ftype: FTYPE.ESCAPE,  power: 2, juliaC: null,               view: [-2.15, 0.65, -1.25, 1.25], dual: true,  category: "zoom" },
  // flipY: the screen's up is -Im c, the classic picture with the ship's masts
  // up (the set sits at Im c < 0). A view of this fractal carries the flag as
  // state.flipY (see freshState and screenToComplex); share links without
  // the fl field open without it, as they always did.
  "Burn. Ship":   { label: "Burning Ship", ftype: FTYPE.SHIP,    power: 2, juliaC: null,               view: [-2.15, 1.25, -1.85, 0.65], dual: true,  category: "zoom", flipY: true, defaultColormap: "Fire" },
  "Tricorn":      { label: "Tricorn", ftype: FTYPE.TRICORN, power: 2, juliaC: null,               view: [-2.1,  1.15, -1.7,  1.7],  dual: true,  category: "zoom", defaultColormap: "Classic" },
  "Celtic":       { label: "Celtic Mandelbrot", ftype: FTYPE.CELTIC, power: 2, juliaC: null,     view: [-2.0,  0.45, -1.85, 1.85], dual: true,  category: "zoom" },
  "Multibrot³": { label: "Multibrot³", ftype: FTYPE.ESCAPE, power: 3, juliaC: null,             view: [-0.82, 0.82, -1.45, 1.45], dual: true,  category: "zoom", defaultColormap: "Viridis" },
  // Needs the previous iterate as state, so no perturbation (deep zoom) path
  // -- see perturbationEligibleType.
  "Phoenix":      { label: "Phoenix", ftype: FTYPE.PHOENIX, power: 2, juliaC: null,               view: [-2.0, 0.65, -0.78, 0.78], dual: true,  category: "zoom", defaultColormap: "Hot" },
  // A Julia preset has no dual view of its own; dualParent is the set whose
  // dual view shows it (see openPresetInDual): the parent in the main pane,
  // centered on the preset's c, and the preset in the Julia pane.
  "Julia:Rabbit": { label: "Douady rabbit", group: "julia", ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.12256, 0.74486], view: [-1.42, 1.42, -1.2, 1.2], dual: false, dualParent: "Mandelbrot", category: "zoom" },
  "Julia:Dragon": { label: "Dragon", group: "julia", ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.4, 0.6],         view: [-1.5, 1.5, -1.1, 1.1],   dual: false, dualParent: "Mandelbrot", category: "zoom" },
  "Julia:Spiral": { label: "Spiral", group: "julia", ftype: FTYPE.ESCAPE,  power: 2, juliaC: [0.285, 0.01],       view: [-0.95, 0.95, -1.2, 1.2], dual: false, dualParent: "Mandelbrot", category: "zoom" },
  "Julia:Phoenix": { label: "Phoenix", group: "julia", ftype: FTYPE.PHOENIX, power: 2, juliaC: [0.5667, 0],        view: [-0.8, 0.88, -1.38, 1.38], dual: false, dualParent: "Phoenix", category: "zoom", defaultColormap: "Hot" },
  "Newton z³": { label: "Newton's method", ftype: FTYPE.NEWTON, power: 3, juliaC: null,              view: [-2.0, 2.0, -1.5, 1.5],   dual: false, category: "zoom" },
  // Digit-test fractals (see FRAG_SRC's renderDigitFractal) — defined on
  // the unit square, so centered there with a little margin. power is
  // unused by these but kept non-null for consistency with the others.
  "Carpet":       { label: "Sierpinski carpet", ftype: FTYPE.CARPET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, category: "zoom", defaultColormap: "Glacier" },
  "Gasket":       { label: "Sierpinski gasket", ftype: FTYPE.GASKET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, category: "zoom", defaultColormap: "Plasma" },
  // The packing fills the unit circle (see APOLLO_DUAL).
  "Apollonian":   { label: "Apollonian gasket", ftype: FTYPE.APOLLONIAN, power: 2, juliaC: null,         view: [-1.05, 1.05, -1.05, 1.05], dual: false, category: "zoom" },
};
const FRACTAL_NAMES = Object.keys(FRACTAL_CONFIGS);
// FRACTAL_CONFIGS keys double as share-link ids (f=...), so they never
// change; label is what people see. Julia presets are grouped in the picker
// under "Julia sets", so their label alone ("Spiral") needs that context
// anywhere else.
function fractalLabel(name) {
  const c = FRACTAL_CONFIGS[name];
  return c.group === "julia" ? `Julia set: ${c.label}` : c.label;
}
// File-name-safe id, shared by export file names and picker thumbnails
// (icons/thumbs/<slug>.webp, rendered by scripts/render_thumbs.mjs).
function slugify(text) {
  return text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

