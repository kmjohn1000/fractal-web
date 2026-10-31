// Picker categories, EXTRA_MODES, the Carpet/Gasket digit helpers, the Apollonian gasket's CPU math,
// suggestedMaxIter and viewFromBounds. Pure definitions, no DOM. Needs configs.js (FTYPE) and
// lsystem.js/koch.js (IFS_SYSTEMS, LINE_CURVES), which only its function bodies use.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it;
// tests/cases.mjs reads this file's text and accepts the `export`).
import { FTYPE } from "./configs.js?v=1.53.11";
import { LINE_CURVES } from "./dragon.js?v=1.53.11";
import { IFS_SYSTEMS } from "./fern.js?v=1.53.11";

// The fractal picker's layout, in display order: sections with a title, each
// split into titled groups of tiles. Display only: a key is a FRACTAL_CONFIGS
// name or an EXTRA_MODES key, and each must appear exactly once (app.spec.mjs
// checks). `category` on the configs and modes is separate -- it decides what
// the zoom-only buttons (box zoom, Surprise me) do, not where a tile sits.
export const PICKER_LAYOUT = [
  { label: "Zoom forever", groups: [
    { label: "Mandelbrot family", keys: ["Mandelbrot", "Burn. Ship", "Tricorn", "Celtic", "Multibrot³", "Phoenix"] },
    { label: "Julia sets", keys: ["Julia:Spiral", "Julia:Rabbit", "Julia:Dragon", "Julia:Phoenix"] },
    { label: "More to zoom into", keys: ["Newton z³", "Nova", "Apollonian", "Carpet", "Gasket"] },
  ] },
  { label: "Watch it grow", groups: [
    { label: "Build level by level", keys: ["koch", "tree", "hexaflake", "dragon", "hilbert", "gosper", "arrowhead"] },
    { label: "Dots that build up", keys: ["fern", "sierpinski", "levy", "vicsek"] },
  ] },
];

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
  { key: "fern", label: "Barnsley fern", category: "pattern" },
  { key: "sierpinski", label: "Sierpinski triangle", category: "pattern" },
  { key: "levy", label: "Lévy C curve", category: "pattern" },
  { key: "vicsek", label: "Vicsek fractal", category: "pattern" },
  { key: "hexaflake", label: "Hexaflake", category: "pattern" },
];

// What each pattern shape's info card says about it (see setHud's `about`):
// two short lines, then a quiet credit for the shapes with a confirmed maker
// and year (left out for the rest: no other maker or year goes here). Keyed by
// EXTRA_MODES key. The wording is the user's; tests/visual/info-card.spec.mjs
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

// The chaos-game IFS modes (fern.js's IFS_SYSTEMS). They all share one
// view, canvas and control row -- the fern's -- and differ only in which
// transform table that view runs.
export const isIfsMode = (m) => Object.prototype.hasOwnProperty.call(IFS_SYSTEMS, m);
// Likewise the L-system line curves (dragon.js's LINE_CURVES) share the
// dragon's view, canvas and control row.
export const isCurveMode = (m) => Object.prototype.hasOwnProperty.call(LINE_CURVES, m);

// Carpet and Gasket: the digit-test fractals (renderDigitFractal in
// shaders.js), which use a zoom-derived depth instead of maxIter and cell
// rebasing instead of perturbation.
export const isDigitFractal = (ftype) => ftype === FTYPE.CARPET || ftype === FTYPE.GASKET;
export const digitBase = (ftype) => (ftype === FTYPE.CARPET ? 3 : 2);
// Fractals whose depth comes from the view rather than maxIter (the detail
// slider): Carpet/Gasket's zoom-derived depth, the Apollonian gasket's
// inversion count.
export const ignoresMaxIter = (ftype) => isDigitFractal(ftype) || ftype === FTYPE.APOLLONIAN;

// Most levels float32 digit extraction stays accurate for, per base,
// counted from the cell digitCellFrame rebased to -- see renderDigitFractal
// in shaders.js for how these were measured.
export function digitMaxDepth(ftype) {
  return ftype === FTYPE.CARPET ? 16 : 22;
}

// Levels per pass through the colormap (u_digitCycle, see digitColor in
// shaders.js): the old per-pixel caps minus one, so the opening views keep
// the colors they always had.
export function digitColorCycle(ftype) {
  return ftype === FTYPE.CARPET ? 15 : 21;
}

// Deepest level whose cells are still at least one device pixel wide.
// Deeper levels are sub-pixel and only produce aliasing speckle -- see
// renderDigitFractal in shaders.js for how the shader colors what's below
// this depth instead.
export function digitPixelDepth(ftype, scale, heightPx) {
  const pixelSize = (scale * 2) / heightPx;
  const d = Math.floor(Math.log(1 / pixelSize) / Math.log(digitBase(ftype)) + 1e-9);
  return Math.max(1, d);
}

// Carpet/Gasket recursion depth for the current view: the pixel depth,
// capped at what float32 resolves below the rebased cell level. The
// renderer draws to this depth and the info card reports it.
export function digitFractalDepth(ftype, scale, heightPx, aspect) {
  return Math.min(digitPixelDepth(ftype, scale, heightPx), digitCellLevel(ftype, scale, aspect) + digitMaxDepth(ftype));
}

// base^k by repeated multiplication, exact while it stays under 2^53
// (Math.pow isn't guaranteed exact).
export function intPow(base, k) {
  let v = 1;
  for (let i = 0; i < k; i++) v *= base;
  return v;
}

// Deepest rebase level per base: 2^52 and 3^33 are the last powers under
// 2^53, so cell addresses and their digits stay exact float64 integers.
// About as deep as a float64 view center can address anyway (~1e15x).
export const DIGIT_MAX_CELL_LEVEL = { 2: 52, 3: 33 };

// Cell rebasing for Carpet/Gasket deep zoom -- the digit-test counterpart
// of the escape-time types' perturbation. Picks the deepest level k whose
// cells are at least as wide as the view's half-diagonal, so the view (at
// any rotation) lies inside the 3x3 block of level-k cells around the one
// holding its center. The CPU resolves the top k digits of those 9 cells
// exactly, and the shader only runs the remaining levels on the pixel's
// O(1) position within its cell, which float32 handles at any zoom.
// Returns the view center in level-k cell units relative to the center
// cell, the world-to-cell-units factor, and per cell (row-major from
// dy = -1, dx = -1) the level it was cut out at, or -1 if it survives all k.
export function digitCellFrame(ftype, cx, cy, scale, aspect) {
  const base = digitBase(ftype);
  const k = digitCellLevel(ftype, scale, aspect);
  const cells = intPow(base, k);
  // The pattern repeats with period 1, so drop the center's whole-number
  // part first (exact in float64). On a copy far from the original,
  // cx * cells would otherwise pass 2^53, where cell addresses round:
  // neighboring cells got the wrong holes and the view jumped by cells.
  const fx = cx - Math.trunc(cx), fy = cy - Math.trunc(cy);
  const ix = Math.floor(fx * cells), iy = Math.floor(fy * cells);
  const holes = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) holes.push(digitHoleLevel(ix + dx, iy + dy, base, k, cells));
  }
  return { level: k, center: [fx * cells - ix, fy * cells - iy], cellsPerUnit: cells, holes };
}

// The rebase level k for digitCellFrame: the deepest whose cells are at
// least as wide as the view's half-diagonal.
export function digitCellLevel(ftype, scale, aspect) {
  const base = digitBase(ftype);
  const halfDiag = scale * Math.hypot(1, aspect);
  let k = Math.floor(Math.log(1 / halfDiag) / Math.log(base));
  k = Math.max(0, Math.min(DIGIT_MAX_CELL_LEVEL[base], k));
  while (k > 0 && intPow(base, k) * halfDiag > 1) k--;
  return k;
}

// Color for pixels that survive every level the shader resolves: the
// area-weighted average of the colors of the sub-pixel levels below
// u_digitDepth -- the limit a supersampled render converges to, so flat
// regions and resolved holes agree as you zoom in. It's the same for every
// pixel, so it's worked out here once per view rather than per pixel.
// Each level removes 1/base^2 of whatever survived the level above it. The
// fractal itself has zero area, so the weights are renormalized over the
// levels summed; 48 of them already account for over 99.6% of the area
// (Carpet; far more for Gasket). Returns RGB in 0..1.
export function digitSubPixelColor(ftype, depth, lutBytes) {
  const base = digitBase(ftype), cycle = digitColorCycle(ftype);
  const hitFrac = 1 / (base * base);
  let surviving = 1;
  const sum = [0, 0, 0];
  for (let k = 0; k < 48; k++) {
    const t = (depth + k) / cycle;
    const c = lutColorCpu(lutBytes, 1 - Math.abs(1 - (t - 2 * Math.floor(t / 2))));
    for (let i = 0; i < 3; i++) sum[i] += surviving * hitFrac * c[i];
    surviving *= 1 - hitFrac;
  }
  return sum.map((v) => v / (1 - surviving));
}

// CPU twin of lutColor in shaders.js: the same wrap, end-color special
// case, and LINEAR filtering of the 256-texel LUT (CLAMP_TO_EDGE). RGB in 0..1.
export function lutColorCpu(bytes, t) {
  const u = Math.abs(t - 1) < 1e-5 ? 255.5 / 256 : t - Math.floor(t);
  const x = u * 256 - 0.5;
  const i0 = Math.floor(x), f = x - i0;
  const a = Math.max(0, i0) * 4, b = Math.min(255, i0 + 1) * 4;
  return [0, 1, 2].map((c) => (bytes[a + c] * (1 - f) + bytes[b + c] * f) / 255);
}

// The level (0 = top) at which level-k cell (ix, iy) is cut out -- the
// first digit position where both addresses have a 1 -- or -1 if it
// survives all k levels. The pattern tiles with period 1, so addresses wrap
// mod base^k. Digits come off the bottom (% and an exact division), so the
// last match is the topmost level.
export function digitHoleLevel(ix, iy, base, k, cells) {
  let x = ((ix % cells) + cells) % cells, y = ((iy % cells) + cells) % cells;
  let hole = -1;
  for (let i = k - 1; i >= 0; i--) {
    const dx = x % base, dy = y % base;
    if (dx === 1 && dy === 1) hole = i;
    x = (x - dx) / base;
    y = (y - dy) / base;
  }
  return hole;
}

// Apollonian gasket: the (-1, 2, 2, 3) packing -- the unit circle, circles
// of radius 1/2 at -1/2 and 1/2, and circles of radius 1/3 at +-2i/3 --
// where every circle's curvature is an integer. renderApollonian in
// shaders.js inverts each pixel in the packing's four dual circles (each
// passes through three of its six tangency points, at right angles to the
// three circles that meet there) until it's outside all of them, and colors
// it by how many inversions that took. The dual disks don't overlap, so
// which one to invert in is never a choice. r = 0 is the real axis, inside
// below it: that step is a reflection. Each entry swaps one circle of
// APOLLO_START for its mirror image and leaves the other three where they
// are. renderApollonian hard-codes the same four.
export const APOLLO_DUAL = [
  { x: 0, y: 0, r: 0 },        // swaps the circle at 2i/3 for the one at -2i/3
  { x: 1, y: 1, r: 1 },        // swaps the circle at -1/2
  { x: -1, y: 1, r: 1 },       // swaps the circle at 1/2
  { x: 0, y: 0.25, r: 0.25 },  // swaps the unit circle
];
// Curvatures of the circles at 2i/3, -1/2, 1/2 and the unit circle
// (negative: it encloses the others), in APOLLO_DUAL's order.
export const APOLLO_START = [3, 2, 2, -1];

// The APOLLO_DUAL entry whose inside holds (x, y), or -1.
export function apolloDualAt(x, y) {
  return APOLLO_DUAL.findIndex((c) => (c.r === 0 ? y < 0 : (x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r));
}

// Curvature of the packing circle under the view center, for the info card,
// or null on the gasket itself (or too close to it to tell, or past 2^53,
// where curvatures stop being exact). Each inversion
// trades one circle of a Descartes quadruple for the other circle tangent to
// the remaining three, k' = 2 (sum of those three) - k, so following the
// center's inversions from APOLLO_START gives the quadruple around the
// center's circle: integers, exact in float64 below 2^53 (curvature ~1e15,
// as deep as a float64 center goes). The point ends up in the
// curvilinear triangle of one starting circle, which says which entry is
// the center's circle.
export const APOLLO_CENTER_STEPS = 100000;
export function apolloCenterCurvature(cx, cy) {
  const k = APOLLO_START.slice();
  let x = cx, y = cy;
  for (let n = 0; n < APOLLO_CENTER_STEPS; n++) {
    const j = apolloDualAt(x, y);
    if (j < 0) {
      // Strictly inside, so a center on a circle (the opening view's, where
      // the two big circles touch) shows no curvature.
      const inside = (ox, oy, r) => (x - ox) ** 2 + (y - oy) ** 2 < r * r * (1 - 1e-12);
      if (inside(0, 2 / 3, 1 / 3)) return k[0];
      if (inside(-0.5, 0, 0.5)) return k[1];
      if (inside(0.5, 0, 0.5)) return k[2];
      return x * x + y * y > 1 + 1e-12 ? k[3] : null;
    }
    k[j] = 2 * (k[0] + k[1] + k[2] + k[3] - k[j]) - k[j];
    if (k[j] > Number.MAX_SAFE_INTEGER) return null;
    const c = APOLLO_DUAL[j];
    if (c.r === 0) {
      y = -y;
    } else {
      const dx = x - c.x, dy = y - c.y, f = (c.r * c.r) / (dx * dx + dy * dy);
      x = c.x + dx * f;
      y = c.y + dy * f;
    }
  }
  return null;
}

// Deep zoom for the Apollonian gasket, its counterpart of digitCellFrame:
// while the disk around the view (its half-diagonal, so any rotation) lies
// inside one dual disk, every pixel's first inversion is that one, so the
// CPU applies it to the whole view in float64. What's left for the shader
// starts from a view that has grown back to O(1), which float32 handles.
// The composed inversions are one Mobius map of the pixel's offset u from
// the center (of its mirror image, after an odd number of steps):
//   w = w0 + K u / (1 + L u)
// renderApollonian applies it in float32: K u and L u stay accurate however
// small u gets. Stops early near a tangency point, where the view straddles
// two dual circles at any depth; counts there pass the shader's cap anyway.
// Returns w0, K, L (complex, as [re, im]), flip (conjugate u first) and
// steps, the inversion count the shader adds to its own.
export const APOLLO_VIEW_STEPS = 100000;
export function apolloFrame(cx, cy, scale, aspect) {
  let w0r = cx, w0i = cy, kr = 1, ki = 0, lr = 0, li = 0;
  let flip = false, steps = 0;
  const R = scale * Math.hypot(1, aspect);
  for (; steps < APOLLO_VIEW_STEPS; steps++) {
    // The image of the disk |u| <= R: center m, radius rho.
    const a = 1 - R * R * (lr * lr + li * li);
    if (a <= 0) break;
    // m = w0 - K R^2 conj(L) / a
    const mr = w0r - (R * R / a) * (kr * lr + ki * li);
    const mi = w0i - (R * R / a) * (ki * lr - kr * li);
    const rho = Math.hypot(kr, ki) * R / a;
    // Only invert a disk that's inside the dual disk and well clear of its
    // center, whose image would be the outside of a disk.
    const j = APOLLO_DUAL.findIndex((c) => {
      if (c.r === 0) return mi + rho < 0;
      const d = Math.hypot(mr - c.x, mi - c.y);
      return d + rho < c.r && d > 2 * rho;
    });
    if (j < 0) break;
    const c = APOLLO_DUAL[j];
    if (c.r === 0) {
      w0i = -w0i; ki = -ki; li = -li;
    } else {
      // p = conj(w0 - o); w0' = o + r^2 / p; K' = -r^2 conj(K) / p^2;
      // L' = conj(L) + conj(K) / p.
      const pr = w0r - c.x, pi = -(w0i - c.y), p2 = pr * pr + pi * pi, r2 = c.r * c.r;
      w0r = c.x + (r2 * pr) / p2;
      w0i = c.y - (r2 * pi) / p2;
      const qr = (pr * pr - pi * pi) / (p2 * p2), qi = (-2 * pr * pi) / (p2 * p2); // 1 / p^2
      const nkr = -r2 * (kr * qr + ki * qi), nki = -r2 * (kr * qi - ki * qr); // -r^2 conj(K) / p^2
      const sr = (kr * pr - ki * pi) / p2, si = (-ki * pr - kr * pi) / p2;   // conj(K) / p
      lr = lr + sr;
      li = -li + si;
      kr = nkr;
      ki = nki;
    }
    flip = !flip;
  }
  return { w0: [w0r, w0i], k: [kr, ki], l: [lr, li], flip, steps };
}

// Color for pixels past renderApollonian's inversion cap: the colormap's
// average. Counts there change faster than pixels do, so supersampling
// converges to the average of the colors they cycle through, which the
// mirrored cycle visits evenly. RGB in 0..1.
export function apolloCapColor(lutBytes) {
  const sum = [0, 0, 0];
  for (let i = 0; i < 256; i++) {
    for (let c = 0; c < 3; c++) sum[c] += lutBytes[i * 4 + c];
  }
  return sum.map((v) => v / (256 * 255));
}

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

