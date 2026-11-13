// The Apollonian gasket's CPU math: the four dual circles, the info card's curvature, the deep-zoom view frame
// (float64 and exact BigInt) and the cap color. Split from fractal-defs.js (a pure move). Pure definitions,
// no DOM. Needs view-math.js (fromExact).
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { fromExact } from "../core/view-math.js?v=1.80.6";

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

// apolloFrame for a view with an exact center: the same chain, with w0 (the center's image, the one value that
// carries the center's digits through every inversion) held as a BigInt with `exact.bits` fraction bits, and K, L
// and the choice of dual disk in doubles (K and L are derivative-like and need only relative accuracy; the choice
// only needs the disks' rough positions). Measured on Golden Dive's exact point: the chain takes 46 steps at 1e-20,
// 118 at 1e-50 and 370 at 1e-200, and w0 is right to the last double with log2(1/scale) plus a few dozen bits, so
// exactBitsFor(scale) is enough. `exact` = { ex, ey, bits }. Returns the same shape as apolloFrame, w0 as doubles.
export function apolloFrameExact(exact, scale, aspect) {
  const F = BigInt(exact.bits), one = 1n << F, two2F = 1n << (2n * F);
  const quarter = one >> 2n;
  // The four dual disks as exact fixed-point centers and r^2 = rn / rd (APOLLO_DUAL's are 0, 1 and 1/4 over 4).
  const dual = APOLLO_DUAL.map((c) => ({
    ox: BigInt(Math.round(c.x * 4)) * quarter, oy: BigInt(Math.round(c.y * 4)) * quarter,
    rd: c.r > 0 ? BigInt(Math.round(1 / (c.r * c.r))) : 1n,
  }));
  let w0r = exact.ex, w0i = exact.ey, kr = 1, ki = 0, lr = 0, li = 0;
  let flip = false, steps = 0;
  const R = scale * Math.hypot(1, aspect);
  for (; steps < APOLLO_VIEW_STEPS; steps++) {
    const wr = fromExact(w0r, exact.bits), wi = fromExact(w0i, exact.bits);
    const a = 1 - R * R * (lr * lr + li * li);
    if (a <= 0) break;
    const mr = wr - (R * R / a) * (kr * lr + ki * li);
    const mi = wi - (R * R / a) * (ki * lr - kr * li);
    const rho = Math.hypot(kr, ki) * R / a;
    const j = APOLLO_DUAL.findIndex((c) => {
      if (c.r === 0) return mi + rho < 0;
      const d = Math.hypot(mr - c.x, mi - c.y);
      return d + rho < c.r && d > 2 * rho;
    });
    if (j < 0) break;
    const c = APOLLO_DUAL[j], e = dual[j];
    if (c.r === 0) {
      w0i = -w0i; ki = -ki; li = -li;
    } else {
      // The same inversion as apolloFrame: p = conj(w0 - o); w0' = o + r^2 / p.
      const pr = w0r - e.ox, pi = -(w0i - e.oy);
      const p2 = pr * pr + pi * pi; // 2^-2F units
      if (p2 === 0n) break; // the center is the disk's own center: no image, as in float64
      w0r = e.ox + (pr * two2F) / (e.rd * p2);
      w0i = e.oy - (pi * two2F) / (e.rd * p2);
      const prd = fromExact(pr, exact.bits), pid = fromExact(pi, exact.bits), p2d = prd * prd + pid * pid, r2 = c.r * c.r;
      const qr = (prd * prd - pid * pid) / (p2d * p2d), qi = (-2 * prd * pid) / (p2d * p2d);
      const nkr = -r2 * (kr * qr + ki * qi), nki = -r2 * (kr * qi - ki * qr);
      const sr = (kr * prd - ki * pid) / p2d, si = (-ki * prd - kr * pid) / p2d;
      lr = lr + sr;
      li = -li + si;
      kr = nkr;
      ki = nki;
    }
    flip = !flip;
  }
  return { w0: [fromExact(w0r, exact.bits), fromExact(w0i, exact.bits)], k: [kr, ki], l: [lr, li], flip, steps };
}

export function apolloFrame(cx, cy, scale, aspect, exact = null) {
  if (exact) return apolloFrameExact(exact, scale, aspect);
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
