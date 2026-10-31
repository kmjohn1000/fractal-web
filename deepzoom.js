// Deep zoom (perturbation reference orbits, Newton and Phoenix deep paths) and the supersampling
// offsets. No DOM references (no document, els, window or canvas): pure math on numbers and arrays.
// Needs FTYPE and PHOENIX_P from configs.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { FTYPE, PHOENIX_P } from "./configs.js?v=1.53.11";

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
export function minScaleFor(state) {
  return state.ftype === FTYPE.NOVA ? NOVA_MIN_SCALE : 0;
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

