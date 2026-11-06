// Picker categories, EXTRA_MODES, SHAPE_INFO, suggestedMaxIter and viewFromBounds. Pure definitions, no DOM.
// Needs dragon.js (LINE_CURVES) and ifs.js (IFS_SYSTEMS), which only its function bodies use. The Carpet/Gasket
// digit helpers are in digit-fractals.js and the Apollonian gasket's CPU math in apollonian.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it;
// tests/cases.mjs reads this file's text and accepts the `export`).
import { LINE_CURVES } from "./dragon.js?v=1.70.5";
import { IFS_SYSTEMS } from "./ifs.js?v=1.70.5";

// The fractal picker's layout, in display order: sections with a title, each
// split into titled groups of tiles. Display only: a key is a FRACTAL_CONFIGS
// name or an EXTRA_MODES key, and each must appear exactly once (app.spec.mjs
// checks). `category` on the configs and modes is separate -- it decides what
// the zoom-only buttons (box zoom, Surprise me) do, not where a tile sits.
export const PICKER_LAYOUT = [
  { label: "Zoom forever", groups: [
    // Parameter maps (c is the pixel): the classic first, then variants by how far the formula departs from it
    // (the power, folds and conjugates, a memory term, other maps, the newest last).
    { label: "Mandelbrot family", keys: ["Mandelbrot", "Multibrot³", "Burn. Ship", "Tricorn", "Celtic", "Phoenix", "Spider", "Magnet I", "Magnet II", "Sine plane", "Sine L plane"] },
    { label: "Julia sets", keys: ["Julia:Spiral", "Julia:Rabbit", "Julia:Dragon", "Julia:Phoenix", "Sine Julia"] },
    { label: "More to zoom into", keys: ["Newton z³", "Nova", "Apollonian", "Carpet", "Gasket"] },
  ] },
  { label: "Watch it grow", groups: [
    { label: "Build level by level", keys: ["koch", "tree", "hexaflake", "dragon", "hilbert", "gosper", "arrowhead", "penrose"] },
    { label: "Chaos games", keys: ["fern", "pentagon", "sierpinski", "levy", "vicsek", "corners"] },
  ] },
];

// The one-line blurb under each picker row, keyed like PICKER_LAYOUT (a FRACTAL_CONFIGS name or an
// EXTRA_MODES key). Every key in the layout needs one, and each ends with a period (app.spec.mjs checks).
// Wording written and checked by the user (2026-11-05); a new fractal adds its line here.
export const PICKER_BLURBS = {
  "Mandelbrot": "The classic: a black bulb ringed by endless detail.",
  "Multibrot³": "Mandelbrot cubed, not squared: two bulbs back to back.",
  "Burn. Ship": "Jagged masts and flames, with tiny ships to find.",
  "Tricorn": "Mandelbrot, flipped at every step: three corners.",
  "Celtic": "Mandelbrot with a folded, horn-like edge.",
  "Phoenix": "Mandelbrot with memory: each step looks back one.",
  "Spider": "Many-armed stripes around a dartboard of rings.",
  "Magnet I": "Born in magnet physics: black bulbs in a smooth field.",
  "Magnet II": "Magnet I’s sibling, with bubbles inside the set.",
  "Sine plane": "A Mandelbrot-style map of a sine formula; open Dual view for its Julia sets.",
  "Sine L plane": "The map behind Sine Julia: open Dual view to see its sets.",
  "Julia:Spiral": "A Julia set that winds into spirals.",
  "Julia:Rabbit": "Ears on ears on ears: the famous rabbit.",
  "Julia:Dragon": "Two spiral eyes joined by frilly, branching arms.",
  "Julia:Phoenix": "The Phoenix’s Julia set: two feathered lobes.",
  "Sine Julia": "A field of spirals from the sine function.",
  "Newton z³": "Three roots, three colors, a tangle where they meet.",
  "Nova": "Newton’s method plus a constant: a frilly crescent.",
  "Apollonian": "Circles packed into every gap, forever.",
  "Carpet": "A square with ever-smaller square holes.",
  "Gasket": "A triangle with a triangle cut from every triangle.",
  "koch": "A snowflake whose edge never stops growing.",
  "tree": "Squares and right triangles that branch like a tree.",
  "hexaflake": "Hexagons inside hexagons, one level at a time.",
  "dragon": "Fold a strip in half again and again, then open it.",
  "hilbert": "One line that visits every square.",
  "gosper": "A hexagonal line that fills an island.",
  "arrowhead": "One curve that draws a Sierpinski triangle.",
  "penrose": "Tiles that fill the plane with no repeating pattern.",
  "fern": "Random dots that grow into a fern.",
  "pentagon": "Dots jumping toward five corners.",
  "sierpinski": "Three corners, random jumps, a triangle full of holes.",
  "levy": "A lacy C built from two smaller copies of itself.",
  "vicsek": "Crosses made of crosses.",
  "corners": "A new rule each time: see what the dots draw.",
};

// Menu entries that switch the whole app mode (Canvas2D vector views, not a
// WebGL shader ftype) rather than selecting a FRACTAL_CONFIGS entry. All are
// in the "pattern" category.
export const EXTRA_MODES = [
  { key: "koch", label: "Koch snowflake", category: "pattern" },
  { key: "tree", label: "Pythagoras tree", category: "pattern" },
  { key: "dragon", label: "Dragon curve", category: "pattern" },
  { key: "hilbert", label: "Hilbert curve", category: "pattern" },
  { key: "gosper", label: "Gosper curve", category: "pattern" },
  { key: "arrowhead", label: "Sierpinski arrowhead", category: "pattern" },
  { key: "penrose", label: "Penrose tiling", category: "pattern" },
  { key: "fern", label: "Barnsley fern", category: "pattern" },
  { key: "sierpinski", label: "Sierpinski triangle", category: "pattern" },
  { key: "pentagon", label: "Sierpinski pentagon", category: "pattern" },
  { key: "levy", label: "Lévy C curve", category: "pattern" },
  { key: "vicsek", label: "Vicsek fractal", category: "pattern" },
  { key: "corners", label: "Corner rules", category: "pattern" },
  { key: "hexaflake", label: "Hexaflake", category: "pattern" },
];

// What each pattern shape's info card says about it (see setHud's `about`):
// two short lines, then a quiet credit for the shapes with a confirmed maker
// and year (left out for the rest: no other maker or year goes here). Keyed by
// EXTRA_MODES key. (Not Corner Rules: its card is the rule dealt, corner-rules.js cornerAbout.) The wording is the user's; tests/visual/info-card.spec.mjs
// holds its own copy, so a changed string fails there.
export const SHAPE_INFO = {
  koch: {
    lines: ["Each side is replaced by four sides, each a third as long, again and again.",
      "The border of the flake grows but its area stays finite. Dimension 1.26."],
    credit: "Koch curve, 1904",
  },
  tree: {
    lines: ["Each square supports two smaller squares that meet at a right angle.",
      "Together, the two small squares have exactly the area of the big one."],
    credit: "Bosman, 1942",
  },
  hexaflake: {
    lines: ["Every hexagon becomes seven new ones, each a third the size: one in the center with six around it.",
      "Dimension 1.77."],
  },
  dragon: {
    lines: ["Models folding a strip of paper in half again and again, then opening it with every fold at a right angle.",
      "It never crosses itself, only touches at corners. It fills a patch of the plane: dimension 2."],
  },
  hilbert: {
    lines: ["One unbroken line drawn into each cell of a grid, and each level splits every cell into four.",
      "Taken to the limit, it fills the whole square. Dimension 2."],
    credit: "Hilbert, 1891",
  },
  gosper: {
    lines: ["Every segment becomes seven shorter ones, turned and flipped to snake through a hexagon.",
      "The line fills a ragged, flower-like region. Dimension 2."],
  },
  arrowhead: {
    lines: ["Every line becomes three lines half as long; the zigzag closes in on the Sierpinski triangle.",
      "One unbroken line draws it all. Dimension 1.58."],
  },
  penrose: {
    lines: ["Two shapes of rhombus, one fat and one thin, fit together in a five-fold pattern that never repeats.",
      "Each level cuts every tile into smaller ones, so the tiles get finer as you zoom in."],
  },
  fern: {
    lines: ["Four simple rules, chosen by chance, plot dot after dot until a fern appears.",
      "Each leaflet is a smaller, slightly bent copy of the whole fern."],
    credit: "Barnsley, 1988",
  },
  sierpinski: {
    lines: ["Jump halfway to a corner chosen at random, over and over. A triangle with holes appears.",
      "This is the “chaos game”. Dimension 1.58."],
    credit: "Sierpinski, 1915",
  },
  pentagon: {
    lines: ["Jump about 62% of the way to a corner chosen at random, over and over. A pentagon of pentagons appears.",
      "Five copies, each 0.382 times the size. Dimension 1.67."],
  },
  levy: {
    lines: ["Two rules, each shrinking and turning by 45 degrees, draw a C made of smaller Cs.",
      "The curve fills an area. Dimension 2."],
  },
  vicsek: {
    lines: ["A square becomes a cross of five squares, each a third the size, again and again.",
      "Dimension 1.46."],
    credit: "Vicsek, 1983",
  },
};

// The chaos-game IFS modes (ifs.js's IFS_SYSTEMS). They all share one
// view, canvas and control row -- the fern's -- and differ only in which
// transform table that view runs.
export const isIfsMode = (m) => Object.prototype.hasOwnProperty.call(IFS_SYSTEMS, m);
// Likewise the L-system line curves (dragon.js's LINE_CURVES) share the
// dragon's view, canvas and control row.
export const isCurveMode = (m) => Object.prototype.hasOwnProperty.call(LINE_CURVES, m);

// Suggested maxIter for a view: the slider's 300 default at the fractal's
// own opening scale, plus K per halving of scale past it (deeper views need
// more iterations before boundary points escape). Never below the default
// when zoomed out past the opening view. Rounded to the iter slider's step
// of 10 so the slider can show the exact value. Used while a pane's
// iterAutoLocked is false -- see applyAutoIter.
export function suggestedMaxIter(baseScale, currentScale) {
  const DEFAULT_ITER = 300; // matches iterSlider's default
  const K = 60;
  const extraLevels = Math.max(0, Math.log2(baseScale / currentScale));
  const v = DEFAULT_ITER + K * extraLevels;
  return Math.max(50, Math.min(2000, Math.round(v / 10) * 10));
}

// Fits the whole box on screen: scale is the view's half-height, and the
// visible half-width is scale * aspect, so the box's half-width needs
// scale >= halfW / aspect. Fitting the height alone (the old behavior) cut
// off the sides of every wide box on a portrait phone.
export function viewFromBounds(b, aspect) {
  const halfW = (b[1] - b[0]) / 2, halfH = (b[3] - b[2]) / 2;
  return { cx: (b[0] + b[1]) / 2, cy: (b[2] + b[3]) / 2, scale: Math.max(halfH, halfW / aspect) };
}

