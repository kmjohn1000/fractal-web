// Carpet and Gasket, the digit-test fractals: the zoom-derived depth, the cell rebasing for deep zoom
// (float64 and exact BigInt), and the CPU twins of the shader's colors. Split from fractal-defs.js (a pure
// move). Pure definitions, no DOM. Needs configs.js (FTYPE).
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { FTYPE } from "../core/configs.js?v=1.80.4";

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

// Deepest rebase level per base at which cell addresses are still exact float64 integers: 2^52 and 3^33 are
// the last powers under 2^53. That is about as deep as a float64 view center can address (~1e15x). Past it
// (or whenever the view has an exact center) digitCellFrame works on the BigInt center instead, so this is no
// longer a cap on the level, only where the float64 shortcut stops.
export const DIGIT_MAX_CELL_LEVEL = { 2: 52, 3: 33 };
// The deepest level at all, per base: base^k as a double (cellsPerUnit) must stay finite (3^640 is about 1e305,
// 2^1000 about 1e301). The zoom floor (deepzoom.js, DIGIT_MIN_SCALE = 1e-300) stops short of both: level 628
// for the Carpet, 997 for the Gasket.
export const DIGIT_LEVEL_LIMIT = { 2: 1000, 3: 640 };

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
//
// `exact` ({ ex, ey, bits }: the center as BigInts of `bits` fraction bits, see view-math.js) is the
// infinite-zoom input. With it, or whenever k is past DIGIT_MAX_CELL_LEVEL (the caller then builds one from the
// doubles), the cell address is the BigInt (ex mod 1) * base^k >> bits and the center inside the cell is
// the bits below it, so the frame is exact at any depth and costs O(k) per call (see digitCellFrameExact).
// Without it, on a shallow view, the float64 arithmetic below is unchanged.
export function digitCellFrame(ftype, cx, cy, scale, aspect, exact = null) {
  const base = digitBase(ftype);
  const k = digitCellLevel(ftype, scale, aspect);
  if (exact) return digitCellFrameExact(base, k, exact.ex, exact.ey, exact.bits);
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

// digitCellFrame from the exact center: ex and ey are BigInts of `bits` fraction bits (one world unit is
// 2^bits). The pattern repeats with period 1, so only the fraction counts: (ex mod 2^bits) / 2^bits is the
// center within its unit square, multiplied by base^k it is the level-k cell index (the integer part) and the
// center inside that cell (the fraction, whose top 64 bits are kept; a double takes them all). The nine
// cells' holes are found from their digit strings, one toString per distinct x and y address.
export function digitCellFrameExact(base, k, ex, ey, bits) {
  const B = BigInt(bits), mask = (1n << B) - 1n, b = BigInt(base);
  const cells = b ** BigInt(k);
  const px = (ex & mask) * cells, py = (ey & mask) * cells;
  const ix = px >> B, iy = py >> B;
  const local = (p) => Number((p & mask) >> (B - 64n)) / 2 ** 64;
  const wrap = (v) => ((v % cells) + cells) % cells;
  const xs = [-1n, 0n, 1n].map((d) => wrap(ix + d)), ys = [-1n, 0n, 1n].map((d) => wrap(iy + d));
  const holes = [];
  if (base === 2) {
    // A bit position where both addresses have a 1; its level counts from the top digit (level 0).
    for (const y of ys) for (const x of xs) {
      const z = x & y;
      holes.push(z === 0n ? -1 : k - z.toString(2).length);
    }
  } else {
    const digits = (v) => v.toString(3).padStart(k, "0");
    const sx = xs.map(digits), sy = ys.map(digits);
    for (const y of sy) for (const x of sx) {
      let hole = -1;
      for (let j = 0; j < k; j++) if (x.charCodeAt(j) === 49 && y.charCodeAt(j) === 49) { hole = j; break; }
      holes.push(hole);
    }
  }
  return { level: k, center: [local(px), local(py)], cellsPerUnit: Number(cells), holes };
}

// The rebase level k for digitCellFrame: the deepest whose cells are at
// least as wide as the view's half-diagonal.
export function digitCellLevel(ftype, scale, aspect) {
  const base = digitBase(ftype);
  const halfDiag = scale * Math.hypot(1, aspect);
  let k = Math.floor(Math.log(1 / halfDiag) / Math.log(base));
  k = Math.max(0, Math.min(DIGIT_LEVEL_LIMIT[base], k));
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
