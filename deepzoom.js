// Deep zoom (perturbation reference orbits, Newton and Phoenix deep paths) and the supersampling
// offsets. No DOM references (no document, els, window or canvas): pure math on numbers and arrays.
// Needs FTYPE and PHOENIX_P from configs.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { FTYPE, PHOENIX_P } from "./configs.js?v=1.70.0";
import { EXACT_FRAC, EXACT_ONE, exactCenter, toExact } from "./view-math.js?v=1.70.0";

// ---------------------------------------------------------------- Phase 3: deep zoom
// Below this scale, plain float32 starts losing pixels to precision collapse
// (measured on-device at ~5.7e-6 in Phase 1) — switch to perturbation-based
// rendering (see shaders.js) with margin to spare before that point.
export const DEEP_ZOOM_THRESHOLD = 1e-3;
// Squared escape radius (256), matching ESCAPE_RADIUS_SQ in shaders.js, so the
// reference orbit runs as long as the pixels that are perturbed against it.
export const ESCAPE_RADIUS_SQ = 65536.0;

// Which fractal types have a perturbation (deep zoom) path -- see
// perturbStep in shaders.js for the per-type delta formulas. Covers both
// parameter-space and Julia mode.
export function perturbationEligibleType(state) {
  return state.ftype === FTYPE.ESCAPE || state.ftype === FTYPE.TRICORN || state.ftype === FTYPE.SHIP ||
    state.ftype === FTYPE.CELTIC;
}

// Newton's deep zoom is fixed point instead (NEWTON_DEEP_FRAG_SRC in
// shaders.js), and only where float32 actually fails: once the view is
// deep AND far from the origin relative to its size. float32 resolves a
// center c to ~|c| * 1e-7, so a view within NEWTON_FLOAT32_REACH half-heights
// of 0 still renders exactly in float32 -- Pole Star's dive into 0 stays on
// that path the whole way down, with the live frames its spin needs.
// Fixed point also only pays off where its fixed 2^-48 step is finer than
// float32's ~|c| * 2^-23: within ~3e-8 of 0 float32 is the finer one (a
// dive centered 1e-16 from 0 went blank at 2e-19 in fixed point).
// The shader also needs |c| < 100 (its first 1/z keeps |z|^2 inside the
// fixed-point range; far out, the basins are plain sectors anyway).
export const NEWTON_FLOAT32_REACH = 1000;
export function newtonDeepEligible(state) {
  const r = Math.hypot(state.cx, state.cy);
  return state.ftype === FTYPE.NEWTON && state.scale < DEEP_ZOOM_THRESHOLD
    && r > NEWTON_FLOAT32_REACH * state.scale && r * 2 ** -23 > 2 ** -48 && r < 100;
}

// Nova has no deep zoom path (its orbit starts at z = 1 and the pixel's c is
// added every step, so there is nothing to rebase), so its depth is the one
// float32 gives: measured on the frilly boundary at 402x874 @3x, the picture
// is sharp to a view half-height of ~5e-5 (a pixel is then about one float32
// step of the center), shows stair-steps on the boundary by 2.5e-5, goes
// grainy and blocky by 1e-5 and is mush by 1e-6. Every way of zooming (pinch,
// wheel, box, keys, share links) goes through limitScale, which stops at
// 4e-5, and the info card says so. About 37,000 times deeper than the opening
// view on a phone.
export const NOVA_MIN_SCALE = 4e-5;
// Magnet I and II: no deep zoom path either (the map is a rational function, whose poles have no
// perturbation step worked out here), so the depth is float32's. The interesting part of the plane
// is at c = 0 to 3.4, where a float32 step is 1.2e-7 to 2.4e-7, so the floor is higher than Nova's.
// Measured at the boundary between the escaping bubbles and the field that converges to 1, on a
// 402x874 @3x screen (a pixel is 2 * scale / 2622) against a float64 render: sharp to a view
// half-height of 1.5e-4 (Magnet I at c = 2.98 + 0.8i, Magnet II at c = 1.49 + 1.15i), ragged
// edges by 1e-4, stair-steps by 5e-5, so the zoom stops at 2e-4. About 12,000 times deeper than
// Magnet I's opening view.
export const MAGNET_MIN_SCALE = 2e-4;

// The sine family (renderSineFamily) is float32 only and has no deep path either. Its maps are entire functions
// that amplify an error in a pixel's coordinate by |L cos z| (up to e^|Im z|) at every step, so they are chaotic
// from the first few iterations and a float32 orbit drifts from the float64 one in every filament. Measured with a
// float64 iteration of the same maps against the app's picture (300x300 at device scale 1; the share of pixels
// more than 20 of 255 gray levels off): at a view centered on 0, where float32 is finest, the Julia set agrees to
// the smallest scale tried, 1e-5 (under 1%); at pi, the Julia set's worst case (|center| about 3), it is 0.6% at 0.1,
// 5% at 1e-3, 8% at 1e-4, 20% at 3e-5 and 24% at 1e-5; the plane at a rim point (0, 1.17) is under 1% to 1e-4,
// 1% at 3e-5 and 4% at 1e-5. Beyond the drift, a pixel is about one float32 step of a center near 3 at a view
// half-height of 1e-4 on a 2,600 pixel canvas (the Nova floor's rule, 4e-5 at |center| near 1), and the picture
// goes blocky. So one floor for both entries and every center: 1e-4, about 24,000 times deeper than the Julia
// opening view. Every way of zooming goes through limitScale, and the info card says so.
export const SINE_MIN_SCALE = 1e-4;
export const isSineType = (ftype) => ftype === FTYPE.SINE || ftype === FTYPE.SINEPLANE;
// The L-plane (FTYPE.SINE without isJulia: z -> L sin z with L the pixel, started at pi/2) has the Julia sets' floor and,
// where |L| is large, a higher one that follows its center, like Spider's. The pixel IS the parameter, so its float32
// position is the parameter of the map being iterated, and a pixel narrower than one float32 step of the center repeats
// the same L. Measured against a float64 iteration of the same map at boundary points (1500x1500 canvas at device scale
// 1, the share of pixels more than 20 of 255 gray levels off, centers |L| 1.0, 1.3, 2.4, 4.6 and 5.0, at half-heights
// 1e-3, 3e-4, 1e-4 and below): at 1.0 and 1.3, 3% at 1e-3, 1% at 3e-4 and 0% from 1e-4 down; at 2.4, 6% at 1e-3 and
// 3e-4 and 5% at 1e-4; at 4.6 and 5.0 (where a float32 step is 4.8e-7 and the orbits are amplified the most) 4-10% at
// 1e-3, 7-14% at 3e-4 and 11-15% at 1e-4, 21% at 2e-5. So the floor is the family's 1e-4, and never under two float32
// steps of the center per pixel on the nominal canvas (minScaleFor): 1.2e-4 at |L| 0.5 to 1, 2.4e-4 at 1 to 2, 4.8e-4
// at 2 to 4 and 9.5e-4 at 4 to 8, which keeps the measured disagreement near 5% or under at every center.
export const isSineLPlane = (state) => state.ftype === FTYPE.SINE && !state.isJulia;

// The zoom floor: how deep each fractal can go before panning stalls and zoom-about-the-cursor drifts. Every
// way of zooming goes through limitScale, which stops here; the HUD says "As deep as this fractal goes".
//   - The escape-time family (Mandelbrot, Tricorn, Burning Ship, Celtic, Multibrot^3, and their Julia views) keeps
//     an exact BigInt center, so its floor is where the float32 per-pixel deltas give out: measured clean to about
//     1e-33 and grainy by 1e-36 (tests/visual/deep-exact.spec.mjs), floored at 1e-30 with margin.
//   - Everything else keeps its center in float64 (or, for Newton and Phoenix deep, 16.48 fixed point), which a
//     one-pixel pan can only move if the pixel is a few steps of the center's last digit. The floor keeps it at
//     FLOOR_STEPS steps. The pixel size is taken for a nominal canvas FLOOR_PIXELS device pixels tall: the scale
//     alone is all limitScale has, and a taller canvas than that only makes pixels smaller than the floor assumes.
export const EXACT_MIN_SCALE = 1e-30;
// Carpet and Gasket: a zoom of 1e300 on the opening view. Not the center's limit (it grows with the zoom) but the
// scale's: a double is normal down to 2.2e-308, and base^level as a double (digitCellFrame) stays finite here.
export const DIGIT_MIN_SCALE = 1e-300;
// The Apollonian gasket: a choice, not a limit (see minScaleFor).
export const APOLLO_MIN_SCALE = 1e-100;
// Phoenix: where its Julia views start to lose pixels (see minScaleFor).
export const PHOENIX_MIN_SCALE = 1e-13;
// Spider: float32 only (its c changes every step, so there is no orbit to rebase onto). The shader forms each
// pixel's position as a float32, so a pixel narrower than one float32 step of the view's center repeats the same
// position and the picture goes blocky: measured with a float32 emulation of the shader against float64 on a
// 2622-pixel-tall canvas (a phone at 3x), the positions repeat once a pixel is under a step (at 1e-4 near
// |center| 1.4, at 4e-5 near 0.9, below 2e-5 near 0.3) and the escape counts drift from the float64 ones
// (about 1% of the boundary's pixels at 1e-3, 5% at 1e-4, 12% at 1e-5). So the floor is two float32 steps per
// pixel (the same FLOOR_STEPS and nominal canvas as the others, see minScaleFor), never under 2e-5.
export const SPIDER_MIN_SCALE = 2e-5;
export const FLOOR_STEPS = 2;
export const FLOOR_PIXELS = 2000;
export const FIXED_STEP = 2 ** -48;
// The size of the last digit of a float64 near |r|.
export const ulp64 = (r) => (r > 0 ? 2 ** (Math.floor(Math.log2(r)) - 52) : 0);
// The same for a float32.
export const ulp32 = (r) => (r > 0 ? 2 ** (Math.floor(Math.log2(r)) - 23) : 0);
export function minScaleFor(state) {
  if (state.ftype === FTYPE.NOVA) return NOVA_MIN_SCALE;
  if (state.ftype === FTYPE.SPIDER) {
    return Math.max(SPIDER_MIN_SCALE, FLOOR_STEPS * ulp32(Math.max(Math.abs(state.cx), Math.abs(state.cy))) * FLOOR_PIXELS / 2);
  }
  if (state.ftype === FTYPE.MAGNET) return MAGNET_MIN_SCALE;
  if (isSineLPlane(state)) {
    return Math.max(SINE_MIN_SCALE, FLOOR_STEPS * ulp32(Math.max(Math.abs(state.cx), Math.abs(state.cy))) * FLOOR_PIXELS / 2);
  }
  if (isSineType(state.ftype)) return SINE_MIN_SCALE;
  if (perturbationEligibleType(state)) return EXACT_MIN_SCALE;
  // Carpet and Gasket keep an exact BigInt center that grows with the zoom (view-math.js, exactBitsFor) and the
  // cell frame reads their digits from it (digitCellFrame), so a pan follows a pixel at any depth. What is left
  // is the double that holds the scale itself, which stops being a normal number near 1e-308.
  if (state.ftype === FTYPE.CARPET || state.ftype === FTYPE.GASKET) return DIGIT_MIN_SCALE;
  // The Apollonian gasket's chain of inversions runs from the exact center too (apolloFrameExact), measured right to
  // the last double with log2(1/scale) plus a few dozen bits, and the shader gets K * scale (u_apoRescale), so its
  // floor is a choice, not a limit: 1e-100, a few hundred chain steps, checked in tests/visual/apollo-exact.spec.mjs.
  if (state.ftype === FTYPE.APOLLONIAN) return APOLLO_MIN_SCALE;
  const r = Math.max(Math.abs(state.cx), Math.abs(state.cy));
  // Phoenix: the view's center is the double (the reference orbit and every pixel's offset come from it), so a pan is
  // limited like any double center; the 2^-48 fixed-point grid only places the exact fallback for glitched pixels.
  // Measured (tests/visual/phoenix-depth.spec.mjs, a 16x16 probe of the deep shader against a BigInt iteration at a
  // boundary point): parameter space agrees at 100% to 1e-15; Julia agrees at 89-100% to 1e-13, then 73-87% at 1e-14
  // and 14-71% at 1e-15. So the floor is the double formula, and never deeper than PHOENIX_MIN_SCALE (Julia's limit).
  if (state.ftype === FTYPE.PHOENIX) return Math.max(PHOENIX_MIN_SCALE, FLOOR_STEPS * ulp64(r) * FLOOR_PIXELS / 2);
  let step;
  if (state.ftype === FTYPE.NEWTON) step = Math.min(r * 2 ** -23, FIXED_STEP); // float32 near 0, else fixed point
  else step = ulp64(r);
  return Math.max(EXACT_MIN_SCALE, FLOOR_STEPS * step * FLOOR_PIXELS / 2);
}
export function limitScale(state, scale) {
  return Math.max(scale, minScaleFor(state));
}
export function atZoomLimit(state) {
  return minScaleFor(state) > 0 && state.scale <= minScaleFor(state) * 1.0001;
}

// A float64 value as the deep shaders' 16.48 fixed point: four 16-bit limbs
// of the two's-complement integer round(x * 2^48), most significant first.
// Exact for |x| < 2^15 (rounded to 2^-48); the eligibility checks keep every
// value passed here inside FIXED_RANGE, so it never wraps or overflows.
export const FIXED_RANGE = 2 ** 14;
export function fixedLimbs(x) {
  let b = BigInt(Math.round(x * 2 ** 48));
  if (b < 0n) b += 1n << 64n;
  return [48n, 32n, 16n, 0n].map((s) => Number((b >> s) & 0xFFFFn));
}
export const FIXED_THIRD = (() => {
  const b = (1n << 48n) / 3n;
  return [48n, 32n, 16n, 0n].map((s) => Number((b >> s) & 0xFFFFn));
})();

// Phoenix's deep zoom (PHOENIX_DEEP_FRAG_SRC: float32 perturbation, exact
// fixed point for glitched pixels), in both modes. Plain float32 stays sharp
// down to ~1e-4, and it renders live during gestures with full refinement,
// so Phoenix switches later than the perturbation types' 1e-3.
export const PHOENIX_DEEP_THRESHOLD = 1e-4;
export function phoenixDeepEligible(state) {
  const inRange = (v) => Math.abs(v) < FIXED_RANGE;
  return state.ftype === FTYPE.PHOENIX && state.scale < PHOENIX_DEEP_THRESHOLD
    && inRange(state.cx) && inRange(state.cy) && inRange(state.juliaC[0]) && inRange(state.juliaC[1]);
}
// Phoenix deep frames are ~10x a float32 frame, so refinement stops at this
// many samples instead of SAMPLE_COUNT.
export const PHOENIX_DEEP_SAMPLES = 4;
// Exact steps per pixel before it finishes in float32: bounds a draw's
// worst case (all-exact Phoenix lost the WebGL context on an iPhone 15).
export const PHOENIX_EXACT_CAP = 600;

// One float64 Phoenix orbit from (zr, zi) with z_prev = 0: the escape
// iteration (as the shaders count it), or Infinity if it never escapes.
export function phoenixEscapeF64(zr, zi, cr, ci, maxIter) {
  const [pr0, pi0] = PHOENIX_P;
  let pr = 0, pi = 0;
  for (let n = 0; n < maxIter; n++) {
    const nr = zr * zr - zi * zi + cr + pr0 * pr - pi0 * pi;
    const ni = 2 * zr * zi + ci + pr0 * pi + pi0 * pr;
    pr = zr; pi = zi; zr = nr; zi = ni;
    if (zr * zr + zi * zi > ESCAPE_RADIUS_SQ) return n;
  }
  return Infinity;
}

// Phoenix's reference: like chooseReference, the view center if it never
// escapes, else the longest-surviving point of a coarse grid. Returns its
// offset from the center and its float64 orbit as a 3-row texture: row 0
// Z as float32 (the delta step), rows 1-2 Z's x and y as fixed-point limbs
// (the exact switch-over; 16-bit integers are exact in float32).
export function phoenixReference(state, widthPx, heightPx) {
  const cFor = (pr, pi) => (state.isJulia ? state.juliaC : [pr, pi]);
  const survive = (pr, pi) => {
    const [cr, ci] = cFor(pr, pi);
    return state.isJulia ? phoenixEscapeF64(pr, pi, cr, ci, state.maxIter) : phoenixEscapeF64(0, 0, cr, ci, state.maxIter);
  };
  let best = { dx: 0, dy: 0, iter: survive(state.cx, state.cy) };
  if (best.iter !== Infinity) {
    const rot = state.rotation || 0;
    const rc = Math.cos(rot), rs = Math.sin(rot);
    const halfW = 0.5 * widthPx / heightPx;
    for (let gy = 0; gy < REFERENCE_GRID && best.iter !== Infinity; gy++) {
      for (let gx = 0; gx < REFERENCE_GRID; gx++) {
        const uvx = ((gx + 0.5) / REFERENCE_GRID * 2 - 1) * halfW;
        const uvy = ((gy + 0.5) / REFERENCE_GRID * 2 - 1) * 0.5;
        const dx = (uvx * rc - uvy * rs) * state.scale * 2.0;
        const dy = (uvx * rs + uvy * rc) * state.scale * 2.0;
        const iter = survive(state.cx + dx, state.cy + dy);
        if (iter > best.iter) {
          best = { dx, dy, iter };
          if (iter === Infinity) break;
        }
      }
    }
  }
  const rx = state.cx + best.dx, ry = state.cy + best.dy;
  const [cr, ci] = cFor(rx, ry);
  const [pr0, pi0] = PHOENIX_P;
  let zr = state.isJulia ? rx : 0, zi = state.isJulia ? ry : 0, pr = 0, pi = 0;
  const orbit = [zr, zi];
  for (let n = 0; n < state.maxIter; n++) {
    const nr = zr * zr - zi * zi + cr + pr0 * pr - pi0 * pi;
    const ni = 2 * zr * zi + ci + pr0 * pi + pi0 * pr;
    pr = zr; pi = zi; zr = nr; zi = ni;
    orbit.push(zr, zi);
    if (zr * zr + zi * zi > ESCAPE_RADIUS_SQ) break;
  }
  const len = orbit.length / 2;
  const data = new Float32Array(len * 3 * 4);
  for (let k = 0; k < len; k++) {
    const x = orbit[2 * k], y = orbit[2 * k + 1];
    data[k * 4] = x; data[k * 4 + 1] = y;
    // The escaped last point can be past the fixed-point range; the shader
    // never switches there (see PHOENIX_DEEP_FRAG_SRC).
    if (Math.abs(x) < 2 ** 14 && Math.abs(y) < 2 ** 14) {
      data.set(fixedLimbs(x), (len + k) * 4);
      data.set(fixedLimbs(y), (2 * len + k) * 4);
    }
  }
  return { dx: best.dx, dy: best.dy, len, data };
}

// Newton's map in float64, as the self-test's reference: iterations used and
// root index (-1 if none), same loop as renderNewton/NEWTON_DEEP_FRAG_SRC.
export const NEWTON_ROOTS = [[1, 0], [-0.5, Math.sqrt(3) / 2], [-0.5, -Math.sqrt(3) / 2]];
export function newtonOrbitF64(zr, zi, maxIter) {
  let used = 0;
  for (let i = 0; i < maxIter; i++) {
    used = i;
    const d = zr * zr + zi * zi;
    if (d > 0) {
      const wr = zr / d, wi = -zi / d;
      zr = (2 * zr + wr * wr - wi * wi) / 3;
      zi = (2 * zi + 2 * wr * wi) / 3;
    }
    for (let k = 0; k < 3; k++) {
      const dr = zr - NEWTON_ROOTS[k][0], di = zi - NEWTON_ROOTS[k][1];
      if (dr * dr + di * di < 1e-12) return { used, root: k };
    }
  }
  return { used, root: -1 };
}

// One float64 step of the escape-family map, z <- f(z) + c, in place on the
// 2-element array z (avoids allocating per step in chooseReference's hot
// loop). Must match renderEscapeFast in shaders.js.
export function stepOrbit(ftype, power, z, cr, ci) {
  const zr = z[0], zi = z[1];
  if (ftype === FTYPE.SHIP) {
    // (|zr| + i|zi|)^2
    const ar = Math.abs(zr), ai = Math.abs(zi);
    z[0] = ar * ar - ai * ai + cr;
    z[1] = 2 * ar * ai + ci;
  } else if (ftype === FTYPE.CELTIC) {
    // (|zr^2 - zi^2|, 2*zr*zi)
    z[0] = Math.abs(zr * zr - zi * zi) + cr;
    z[1] = 2 * zr * zi + ci;
  } else if (ftype === FTYPE.TRICORN) {
    // conj(z)^2 = (zr^2 - zi^2) - 2*zr*zi*i
    z[0] = zr * zr - zi * zi + cr;
    z[1] = -2 * zr * zi + ci;
  } else if (power === 3) {
    const zr2 = zr * zr - zi * zi, zi2 = 2 * zr * zi;
    z[0] = zr2 * zr - zi2 * zi + cr;
    z[1] = zr2 * zi + zi2 * zr + ci;
  } else {
    z[0] = zr * zr - zi * zi + cr;
    z[1] = 2 * zr * zi + ci;
  }
}

// Computes a reference orbit Z[0..n] for perturbation rendering: Z[0] =
// (z0r,z0i), Z[n+1] = f(Z[n]) + (cr,ci), stopping early if it escapes.
// Parameter mode uses z0 = 0 and c = the reference point; Julia mode uses
// both the view-point orbit (z0 = point, c fixed) and the critical orbit
// (z0 = 0, c fixed) -- see renderEscapePerturbation in shaders.js. Runs in plain
// JS (float64) — no bignum needed at this target depth, and this is the one
// place genuine extended precision matters; everything the GPU touches
// afterward (the reference values once read back, and the per-pixel delta)
// only ever needs float32. Returns a Float32Array laid out as RGBA texels
// (re, im, 0, 1) so it can be uploaded directly as a texture.
export function computeReferenceOrbit(state, z0r, z0i, cr, ci) {
  const maxIter = state.maxIter;
  const cap = maxIter + 1;
  const data = new Float32Array(cap * 4);
  data[0] = z0r; data[1] = z0i; data[3] = 1.0;
  const z = [z0r, z0i];
  let len = 1;
  for (let n = 0; n < maxIter; n++) {
    stepOrbit(state.ftype, state.power, z, cr, ci);
    const zr = z[0], zi = z[1];
    data[len * 4] = zr;
    data[len * 4 + 1] = zi;
    data[len * 4 + 3] = 1.0;
    len++;
    if (zr * zr + zi * zi > ESCAPE_RADIUS_SQ) break;
  }
  return { data: data.subarray(0, len * 4), length: len };
}

// Picks the reference point for perturbation: the view center if it never
// escapes, else the longest-surviving point on a coarse grid over the
// (rotated) view. The shader rebases correctly when a pixel outlives the
// reference, but after that particular rebase dz is O(1), and in float32 the
// pixel's tiny dc (~scale) is lost against it -- that pixel quietly drops to
// plain-float32 accuracy. Double-precision perturbation renderers don't have
// this problem; ours does, so it's worth a few ms of float64 CPU iteration to
// make "reference escapes first" as rare as possible. Returns the reference
// point's offset from the view center (the shader's u_refOffset).
export const REFERENCE_GRID = 32;
export function chooseReference(state, widthPx, heightPx) {
  // A candidate point is c in parameter mode, the starting z in Julia mode.
  const z = [0, 0];
  const escapeIter = (pr, pi) => {
    const cr = state.isJulia ? state.juliaC[0] : pr, ci = state.isJulia ? state.juliaC[1] : pi;
    z[0] = state.isJulia ? pr : 0; z[1] = state.isJulia ? pi : 0;
    for (let n = 0; n < state.maxIter; n++) {
      stepOrbit(state.ftype, state.power, z, cr, ci);
      if (z[0] * z[0] + z[1] * z[1] > ESCAPE_RADIUS_SQ) return n;
    }
    return Infinity;
  };
  if (escapeIter(state.cx, state.cy) === Infinity) return { dx: 0, dy: 0 };

  // Same uv -> world mapping as FRAG_SRC's main(), rotation included.
  const rot = state.rotation || 0;
  const rc = Math.cos(rot), rs = Math.sin(rot);
  const halfW = 0.5 * widthPx / heightPx;
  const flip = state.flipY ? -1 : 1; // the view's mirrored imaginary axis (FRAG_SRC's u_flipY)
  let best = { dx: 0, dy: 0, iter: -1 };
  for (let gy = 0; gy < REFERENCE_GRID; gy++) {
    for (let gx = 0; gx < REFERENCE_GRID; gx++) {
      const uvx = ((gx + 0.5) / REFERENCE_GRID * 2 - 1) * halfW;
      const uvy = ((gy + 0.5) / REFERENCE_GRID * 2 - 1) * 0.5;
      const dx = (uvx * rc - uvy * rs) * state.scale * 2.0;
      const dy = (uvx * rs + uvy * rc) * state.scale * 2.0 * flip;
      const iter = escapeIter(state.cx + dx, state.cy + dy);
      if (iter > best.iter) {
        best = { dx, dy, iter };
        if (iter === Infinity) return best;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- exact reference (BigInt)
// Below this scale the float64 view center can't place the reference orbit to a pixel (a pixel is then within a
// few steps of a double at the center), so the reference is computed from the view's exact center (view-math.js)
// in BigInt fixed point, 2^-192 units like the center itself. Only the reference is exact; the GPU's per-pixel
// deltas are offsets from the reference and never needed the center (see renderEscapePerturbation in shaders.js).
// Above it the float64 path above is unchanged, so every opening view and place keeps its picture.
// An object so a test can move the limits (to draw a shallow place through the exact path and compare it with the
// float64 path); nothing else changes them. below: the escape-time family's reference orbit; apollo: the Apollonian
// gasket's chain of inversions (apolloFrameExact, also used whenever the view has an exact pair); apolloRescale:
// where the shader gets K * scale and L * scale instead of K and L.
export const exactRender = { below: 1e-13, apollo: 1e-13, apolloRescale: 1e-15 };
export const exactRenderEligible = (state) => state.scale < exactRender.below;
// Candidates per side for the exact reference search: 64 orbits of up to maxIter BigInt steps (about 20 ms on an
// M-series Mac for 2000 steps each), against the float64 search's 1024 cheap ones.
export const EXACT_REFERENCE_GRID = 8;
export const EXACT_ESCAPE_SQ =BigInt(ESCAPE_RADIUS_SQ) << (2n * EXACT_FRAC);

// One BigInt fixed-point step of the escape-family map, in place on z = [re, im]. The same cases as stepOrbit; a
// product is shifted back down by EXACT_FRAC (floor), which is an error of one 2^-192 unit a step, far below the
// pixel at the 1e-30 floor.
export function stepOrbitExact(ftype, power, z, cr, ci) {
  const F = EXACT_FRAC;
  const zr = z[0], zi = z[1];
  if (ftype === FTYPE.SHIP) {
    const ar = zr < 0n ? -zr : zr, ai = zi < 0n ? -zi : zi;
    z[0] = ((ar * ar - ai * ai) >> F) + cr;
    z[1] = ((ar * ai) >> (F - 1n)) + ci;
  } else if (ftype === FTYPE.CELTIC) {
    const re = (zr * zr - zi * zi) >> F;
    z[0] = (re < 0n ? -re : re) + cr;
    z[1] = ((zr * zi) >> (F - 1n)) + ci;
  } else if (ftype === FTYPE.TRICORN) {
    z[0] = ((zr * zr - zi * zi) >> F) + cr;
    z[1] = -((zr * zi) >> (F - 1n)) + ci;
  } else if (power === 3) {
    const zr2 = (zr * zr - zi * zi) >> F, zi2 = (zr * zi) >> (F - 1n);
    z[0] = ((zr2 * zr - zi2 * zi) >> F) + cr;
    z[1] = ((zr2 * zi + zi2 * zr) >> F) + ci;
  } else {
    z[0] = ((zr * zr - zi * zi) >> F) + cr;
    z[1] = ((zr * zi) >> (F - 1n)) + ci;
  }
}

// computeReferenceOrbit with BigInt start and constant (fixed-point integers); the same Float32Array texel layout.
export function computeReferenceOrbitExact(state, z0r, z0i, cr, ci) {
  const maxIter = state.maxIter;
  const data = new Float32Array((maxIter + 1) * 4);
  data[0] = Number(z0r) / EXACT_ONE; data[1] = Number(z0i) / EXACT_ONE; data[3] = 1.0;
  const z = [z0r, z0i];
  let len = 1;
  for (let n = 0; n < maxIter; n++) {
    stepOrbitExact(state.ftype, state.power, z, cr, ci);
    data[len * 4] = Number(z[0]) / EXACT_ONE;
    data[len * 4 + 1] = Number(z[1]) / EXACT_ONE;
    data[len * 4 + 3] = 1.0;
    len++;
    if (z[0] * z[0] + z[1] * z[1] > EXACT_ESCAPE_SQ) break;
  }
  return { data: data.subarray(0, len * 4), length: len };
}

// The reference point of chooseReferenceExact's answer as a BigInt pair: the exact center plus its offset.
export function exactReferencePoint(state, ref) {
  const c = exactCenter(state);
  return [c.ex + toExact(ref.dx), c.ey + toExact(ref.dy)];
}

// chooseReference for a view with an exact center: the same rule (the center if it never escapes, else the
// longest survivor of a grid over the rotated view), run in BigInt on a coarser grid. Returns the same
// { dx, dy } offset from the center, in doubles (it is a few pixels' worth, so a double holds it fine).
export function chooseReferenceExact(state, widthPx, heightPx) {
  const c = exactCenter(state);
  const jr = state.isJulia ? toExact(state.juliaC[0]) : 0n, ji = state.isJulia ? toExact(state.juliaC[1]) : 0n;
  const z = [0n, 0n];
  const escapeIter = (pr, pi) => {
    const cr = state.isJulia ? jr : pr, ci = state.isJulia ? ji : pi;
    z[0] = state.isJulia ? pr : 0n; z[1] = state.isJulia ? pi : 0n;
    for (let n = 0; n < state.maxIter; n++) {
      stepOrbitExact(state.ftype, state.power, z, cr, ci);
      if (z[0] * z[0] + z[1] * z[1] > EXACT_ESCAPE_SQ) return n;
    }
    return Infinity;
  };
  if (escapeIter(c.ex, c.ey) === Infinity) return { dx: 0, dy: 0 };

  // Same uv -> world mapping as chooseReference and FRAG_SRC's main(), rotation included.
  const rot = state.rotation || 0;
  const rc = Math.cos(rot), rs = Math.sin(rot);
  const halfW = 0.5 * widthPx / heightPx;
  const flip = state.flipY ? -1 : 1;
  const G = EXACT_REFERENCE_GRID;
  let best = { dx: 0, dy: 0, iter: -1 };
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const uvx = ((gx + 0.5) / G * 2 - 1) * halfW;
      const uvy = ((gy + 0.5) / G * 2 - 1) * 0.5;
      const dx = (uvx * rc - uvy * rs) * state.scale * 2.0;
      const dy = (uvx * rs + uvy * rc) * state.scale * 2.0 * flip;
      const iter = escapeIter(c.ex + toExact(dx), c.ey + toExact(dy));
      if (iter > best.iter) {
        best = { dx, dy, iter };
        if (iter === Infinity) return best;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- supersampling
// Sub-pixel sample offsets (in pixels) for progressive supersampling. One
// sample per pixel aliases badly wherever the fractal varies faster than the
// pixel grid -- worst on Burning Ship, whose abs() creases make the boundary
// rougher than Mandelbrot's. Sample 0 is the pixel center (what a plain
// render shows, so interaction looks the same as before); the rest are
// Halton(2,3) points shifted into [-0.5, 0.5), which spread evenly over the
// pixel for any prefix length. Each sample is a separate full-frame draw
// averaged into the canvas by blending (see render()), not a loop inside the
// shader: a single draw costs the same as an unsupersampled one, so heavy
// deep-zoom frames don't risk a GPU watchdog timeout / context loss, and
// refinement can be abandoned the moment the view changes.
// 16 samples cuts per-pixel noise ~4x; in Burning Ship's chaotic regions 8
// still left visible grain.
export function halton(index, base) {
  let f = 1, r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}
export const SAMPLE_COUNT = 16;
export const SAMPLE_OFFSETS = Array.from({ length: SAMPLE_COUNT }, (_, i) =>
  i === 0 ? [0, 0] : [halton(i, 2) - 0.5, halton(i, 3) - 0.5]);

// Below the deep-zoom threshold, a live float32 re-render during an active
// gesture isn't a lower-quality version of the same view — the per-pixel
// offset rounds away entirely against the view center at that scale, so it
// shows what's effectively unrelated content — and a full perturbation
// render per gesture frame is too slow. So while interacting at deep zoom,
// each pane shows its last accurate frame moved with the gesture
// (renderPreview), and renders for real once the gesture settles. A
// CSS-transform version of this preview was tried first and was jumpy; this
// one draws the snapshot through the same float64 view math the renderer
// uses, so it can't drift from where the real render will land.
export function deepZoomEligible(renderer, state) {
  return (renderer.perturbationSupported
    && perturbationEligibleType(state)
    && state.scale < DEEP_ZOOM_THRESHOLD)
    || (renderer.newtonDeepSupported && newtonDeepEligible(state))
    || (renderer.phoenixDeepSupported && phoenixDeepEligible(state));
}

