"use strict";

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Unified escape-time + Newton fragment shader, ported from mandelbrot.py's
// _fractal_chunk() / _newton_chunk(). u_ftype selects the family; u_isJulia
// mirrors the Python `julia_render` flag: true means z starts at the pixel's
// complex coordinate and c is the fixed u_juliaC (Julia-set rendering of
// whichever family is selected), false means z starts at 0 and c is the
// pixel coordinate (the "parameter space" / Mandelbrot-family rendering).
//
// Loop bound is a compile-time constant (portability across WebGL1/GLSL ES
// 1.00) with a runtime break via u_maxIter, same technique as the Phase 0/1
// prototype. Brent's cycle detection and the real-axis mirror from the
// Python desktop app are CPU-bound optimizations for a serial/chunked
// renderer; they're not ported here since the GPU already computes every
// pixel in parallel and Phase 1 already confirmed real-time frame rates.
//
// --- Phase 3: deep zoom via perturbation theory -----------------------------
// Plain float32 breaks down (banding/pixelation) once the per-pixel offset
// from the view center becomes smaller than float32 can resolve relative to
// the center's own magnitude — measured on-device at roughly 5.7e-6 zoom
// scale in Phase 1. An emulated dual-float ("double-single") path was tried
// first, but a standalone numerical self-test confirmed dfMul() doesn't
// deliver extended precision on this GPU/browser at all — likely because
// mobile GPU ALUs are often fused-multiply-add
// native in hardware, so there may be no way to get the separately-rounded
// multiply Dekker's algorithm requires, regardless of how the GLSL source
// is written.
//
// Perturbation theory sidesteps that failure mode entirely: the one
// high-precision computation (the reference orbit) runs on the CPU in JS,
// which is already float64 — no GPU-side bit-exact tricks needed. The GPU
// only ever computes a small per-pixel DELTA from that reference, in
// ordinary float32, which stays accurate because the delta itself stays
// small (this is the same "small deltas are fine in float32 regardless of
// absolute zoom depth" property the dc offset already relied on). Scoped to
// the plain z^n+c family (Mandelbrot, Multibrot^3) in parameter-space mode
// only: Ship/Tricorn's abs()-kinks and Julia mode both need a different
// reference-orbit strategy this pass doesn't implement, so those still hit
// the plain float32 ceiling at deep zoom. A cheap "reset the delta once it
// grows too large" heuristic was tried and didn't meaningfully help — the
// worst glitches happen when the reference orbit passes very close to zero
// (common exactly where people zoom, near mini-Mandelbrot structures), and
// resetting a pixel's delta right then doesn't fix anything since the
// reference passing near zero doesn't mean that pixel's true orbit does too.
//
// This is real two-pass glitch detection instead, using the standard
// "Pauldelbrot criterion": a pixel is glitched if its computed value
// collapses to near-zero relative to the reference orbit's own magnitude at
// that step — a sign its true trajectory has drifted into different
// territory than the reference represents, invalidating the linear
// approximation from there on. Pass 1 renders with reference orbit A (the
// view center) into an offscreen framebuffer and flags glitches in the
// alpha channel. The CPU reads that back, and if any pixel glitched, picks
// its location as a second reference orbit B. Pass 2 renders to the actual
// canvas: clean pass-1 pixels are reused directly, glitched ones are
// recomputed against orbit B. Bounded to exactly one retry — a pixel still
// glitched under orbit B is accepted as-is rather than attempting a third
// pass, which is the same bound production tools don't actually have (they
// iterate this until clean), so some residual glitching in pathological
// regions is still possible.
const FRAG_SRC = `
precision highp float;

uniform vec2  u_resolution;
uniform vec2  u_center;
uniform float u_scale;
uniform float u_rotation; // radians; two-finger twist gesture, see app.js
uniform int   u_maxIter;
uniform int   u_ftype;   // 0=escape 1=ship 2=tricorn 3=newton
uniform float u_power;   // 2.0 or 3.0 (escape family only)
uniform bool  u_isJulia;
uniform vec2  u_juliaC;
uniform sampler2D u_lut;
uniform int   u_digitDepth; // Carpet/Gasket only, see renderDigitFractal

uniform bool  u_usePerturbation;
uniform int   u_passNum;         // 1 or 2, only meaningful when u_usePerturbation
uniform sampler2D u_refOrbitTex; // reference orbit A — width = u_refOrbitLen
uniform int   u_refOrbitLen;
uniform sampler2D u_pass1Tex;    // pass 2 only: pass 1's result (rgb=color, a=1.0 clean/0.0 glitched)
uniform bool  u_hasOrbitB;       // pass 2 only: whether a glitch was found and orbit B computed
uniform sampler2D u_refOrbitTexB;
uniform int   u_refOrbitLenB;
// World-space offset of orbit B's own reference point from u_center (0 for
// orbit A, which IS u_center by construction). See renderEscapePerturbationWith.
uniform vec2  u_refOffset;

const int FTYPE_ESCAPE  = 0;
const int FTYPE_SHIP    = 1;
const int FTYPE_TRICORN = 2;
const int FTYPE_NEWTON  = 3;
const int FTYPE_CARPET  = 4;
const int FTYPE_GASKET  = 5;

const vec2 NEWTON_ROOT0 = vec2( 1.0,  0.0);
const vec2 NEWTON_ROOT1 = vec2(-0.5,  0.8660254037844386);
const vec2 NEWTON_ROOT2 = vec2(-0.5, -0.8660254037844386);

vec2 cMul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec2 cDiv(vec2 a, vec2 b) {
  float d = dot(b, b);
  return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / max(d, 1e-20);
}

vec3 lutColor(float t) {
  return texture2D(u_lut, vec2(fract(t), 0.5)).rgb;
}

// Sierpinski carpet and Sierpinski gasket are the same construction at two
// different bases: repeatedly scale the point by "base" and exclude it the
// first time both axes' current digit equal 1.
//   base=3: removes the center cell of a 3x3 grid at every scale — the
//   classic Sierpinski carpet.
//   base=2: a point survives only if, written in binary, no bit position
//   has both axes' bit set to 1 simultaneously (equivalently: the point's
//   two binary-digit-sequences bitwise-AND to zero at every level). This is
//   the well-known construction that produces the Sierpinski
//   gasket/triangle pattern — it's the same statement as "Pascal's
//   triangle mod 2", just expressed as a digit test instead of binomial
//   coefficients.
// A point excluded at depth d is colored by d (same idea as escape-time
// iteration-count coloring); a point that survives every level tested is
// the fractal's interior, rendered black like the other types' interior.
// p never grows unbounded since it's re-fract()ed back into [0,1) after
// every level, regardless of how many levels run.
//
// Depth is u_digitDepth, deliberately NOT u_maxIter: u_maxIter's range
// (50-2000, from the iter slider) is calibrated for escape-time iteration
// counts, but this recursion only has ~15-24 meaningful levels in float32
// before the repeated *base/re-fract() accumulates enough rounding error to
// be numerically meaningless (each level consumes ~log2(base) bits of the
// ~24-bit float32 mantissa). Using u_maxIter directly here shipped as a
// real bug: at its default of 300, the actual exclusion depth (rarely above
// ~30) divided by 299 crushed nearly the whole image into the first few
// percent of the colormap, which for the default colormap is nearly black.
// Coloring is still normalized by a fixed 15 (not by u_digitDepth) so each
// level keeps the same color at every zoom.
//
// u_digitDepth is the deepest level whose cells are still at least one
// pixel wide (see digitFractalDepth in app.js), capped at 16. It used to be
// a fixed 16, which caused visible speckle: at the default view one pixel
// is ~3^-6.5 wide, so levels ~7-16 were sub-pixel and a single sample per
// pixel landed on an effectively random one of them. A float64 simulation
// of this exact loop confirmed that aliasing, not float32 precision, was
// the cause: moving the sample a third of a pixel changed 44% of pixels,
// while float32-vs-float64 differed on only 7% (nearly all at depth >= 13).
// A point that survives every resolvable level is colored with the
// area-weighted average of the sub-pixel levels below it (subPixelColor)
// rather than one arbitrary sample — the limit a supersampled render
// converges to, so flat regions and resolved holes agree as you zoom in.
// No perturbation/deep-zoom support either way: this only reuses the
// existing float32 fast path (see FRAG_SRC's top comment), so like
// Ship/Tricorn/Julia it hits the same ~1e-5 float32 zoom ceiling rather
// than perturbation's effectively unlimited depth.
vec3 subPixelColor(int depth, float base) {
  // Each level removes 1/base^2 of whatever survived the level above it;
  // anything that survives all 16 levels is interior (black).
  float hitFrac = 1.0 / (base * base);
  float surviving = 1.0;
  vec3 sum = vec3(0.0);
  for (int k = 0; k < 16; k++) {
    if (k < depth) continue;
    sum += surviving * hitFrac * lutColor(float(k) / 15.0);
    surviving *= 1.0 - hitFrac;
  }
  return sum;
}

vec3 renderDigitFractal(vec2 p, float base) {
  // Literal loop bound with a runtime break, same pattern as u_maxIter in
  // the escape-time loops (GLSL ES 1.00 needs a constant bound).
  for (int i = 0; i < 16; i++) {
    if (i >= u_digitDepth) break;
    p *= base;
    vec2 cell = mod(floor(p), base);
    if (cell.x == 1.0 && cell.y == 1.0) {
      return lutColor(float(i) / 15.0);
    }
    p -= floor(p);
  }
  return subPixelColor(u_digitDepth, base);
}

vec3 renderNewton(vec2 p) {
  // Matches _newton_chunk: z starts at the grid point itself.
  vec2 z = p;
  int rootIdx = -1;
  int iterUsed = 0;

  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;
    iterUsed = i;
    vec2 z2 = cMul(z, z);
    vec2 denom = 3.0 * z2;
    if (dot(denom, denom) > 1e-24) {
      vec2 num = cMul(z, z2) - vec2(1.0, 0.0);
      z -= cDiv(num, denom);
    }
    if (dot(z - NEWTON_ROOT0, z - NEWTON_ROOT0) < 1e-12) { rootIdx = 0; break; }
    if (dot(z - NEWTON_ROOT1, z - NEWTON_ROOT1) < 1e-12) { rootIdx = 1; break; }
    if (dot(z - NEWTON_ROOT2, z - NEWTON_ROOT2) < 1e-12) { rootIdx = 2; break; }
  }

  if (rootIdx < 0) return vec3(0.0);
  float t = (float(rootIdx) + float(iterUsed) / max(float(u_maxIter - 1), 1.0)) / 3.0;
  return lutColor(t);
}

vec3 renderEscapeFast(vec2 p) {
  vec2 z = u_isJulia ? p : vec2(0.0);
  vec2 c = u_isJulia ? u_juliaC : p;

  // Cardioid / period-2 bulb analytic skip — only for plain power-2
  // Mandelbrot in parameter-space (non-Julia) mode, same test as the
  // Python desktop app's cardioid/bulb skip.
  if (u_ftype == FTYPE_ESCAPE && u_power < 2.5 && !u_isJulia) {
    float x = c.x, y = c.y;
    float q = (x - 0.25) * (x - 0.25) + y * y;
    if (q * (q + x - 0.25) < 0.25 * y * y || (x + 1.0) * (x + 1.0) + y * y < 0.0625) {
      return vec3(0.0);
    }
  }

  int iter = 0;
  bool escaped = false;

  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;
    vec2 zsq;
    if (u_ftype == FTYPE_SHIP) {
      vec2 zabs = vec2(abs(z.x), abs(z.y));
      zsq = cMul(zabs, zabs);
    } else if (u_ftype == FTYPE_TRICORN) {
      vec2 zc = vec2(z.x, -z.y);
      zsq = cMul(zc, zc);
    } else {
      zsq = cMul(z, z);
      if (u_power > 2.5) zsq = cMul(zsq, z); // power 3 (Multibrot^3)
    }
    z = zsq + c;
    iter = i;
    if (dot(z, z) > 16.0) { escaped = true; break; }
  }

  if (!escaped) return vec3(0.0);

  // Smooth iteration count: i + 1 - log2(log2(|z|)) — same formula as
  // mandelbrot.py's smooth coloring.
  float smoothIter = float(iter) + 1.0 - log2(log2(sqrt(dot(z, z))));
  return lutColor(smoothIter * 0.025);
}

// ---------------------------------------------------------------- perturbation

// dc is the pixel's offset from orbitTex's own reference point — for orbit
// A that's u_center (refOffset=0), but orbit B's reference point is
// wherever the glitched pixel that spawned it lives, which is NOT
// u_center. uv*u_scale*2.0 is always the pixel's offset from u_center, so
// refOffset (orbit's reference minus u_center, see app.js) is subtracted
// to correct it back to an offset from the orbit actually being used. This
// was missing entirely before: every orbit-B retry used dc relative to the
// wrong point, silently producing wrong values instead of fixing glitches
// (confirmed by hand: even the one pixel that DEFINED orbit B computed a
// nonzero dc for itself, when the correct value is exactly zero, since
// that's where the orbit starts).
//
// A small value regardless of absolute zoom depth either way, so plain
// float32 is exact enough with no splitting needed (see comment above
// FRAG_SRC). Returns (color.rgb, cleanFlag): cleanFlag is 0.0 if the
// Pauldelbrot glitch criterion tripped, 1.0 otherwise (including
// interior/non-escaped points, which aren't glitch-prone the same way).
vec4 renderEscapePerturbationWith(vec2 uv, sampler2D orbitTex, int orbitLen, vec2 refOffset) {
  vec2 dc = vec2(uv.x * u_scale * 2.0, uv.y * u_scale * 2.0) - refOffset;
  vec2 dz = vec2(0.0);
  vec2 Zcur = vec2(0.0); // reference orbit's Z[0] is always 0 by construction

  int iter = 0;
  bool escaped = false;
  bool glitched = false;
  vec2 fullAtEscape = vec2(0.0);

  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;
    if (i + 1 >= orbitLen) {
      // The reference orbit escaped/ended before this pixel could be
      // resolved against it -- its true state (does it also escape, does
      // it need more iterations, etc.) is simply unknown from this
      // reference alone. This used to fall through to "ran out of loop,
      // never escaped" i.e. treated as solid interior, which was a real,
      // measured bug: 16% of pixels that genuinely escape (measured near
      // (-0.75,0.02) at scale 5e-4) were painted black because the
      // view-center reference happened to escape early. Only flag this
      // when the orbit stopped due to an actual escape rather than
      // legitimately reaching u_maxIter unescaped (see computeReferenceOrbit
      // in app.js: a non-escaping orbit has length maxIter+1, so
      // orbitLen-1 == u_maxIter exactly in that case, not less than it) --
      // otherwise a genuinely-interior reference would wrongly flag every
      // pixel around it as glitched.
      if (orbitLen - 1 < u_maxIter) glitched = true;
      break;
    }

    if (u_power > 2.5) {
      // (Z+dz)^3 - Z^3 = 3*Z^2*dz + 3*Z*dz^2 + dz^3
      vec2 Z2 = cMul(Zcur, Zcur);
      vec2 dz2 = cMul(dz, dz);
      dz = cMul(3.0 * Z2, dz) + cMul(3.0 * Zcur, dz2) + cMul(dz2, dz) + dc;
    } else {
      // (Z+dz)^2 - Z^2 = 2*Z*dz + dz^2
      dz = cMul(2.0 * Zcur, dz) + cMul(dz, dz) + dc;
    }

    float nextIdx = float(i + 1);
    vec2 Znext = texture2D(orbitTex, vec2((nextIdx + 0.5) / float(orbitLen), 0.5)).xy;
    vec2 full = Znext + dz;
    iter = i;

    if (dot(full, full) > 16.0) {
      escaped = true;
      fullAtEscape = full;
      break;
    }

    // Pauldelbrot glitch criterion: the true trajectory has collapsed to
    // near-zero relative to the reference orbit's own magnitude at this
    // step, meaning this pixel has drifted into different structure than
    // the reference orbit represents. Stop immediately rather than
    // continuing to iterate on data that's no longer meaningful.
    if (dot(full, full) < 1e-6 * dot(Znext, Znext)) {
      glitched = true;
      break;
    }

    Zcur = Znext;
  }

  if (glitched) return vec4(0.0, 0.0, 0.0, 0.0);
  if (!escaped) return vec4(0.0, 0.0, 0.0, 1.0);

  float smoothIter = float(iter) + 1.0 - log2(log2(sqrt(dot(fullAtEscape, fullAtEscape))));
  return vec4(lutColor(smoothIter * 0.025), 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;

  // Rotate the screen-space offset once, up front — every downstream use of
  // uv (Newton's p, the fast-path p, and the perturbation delta dc inside
  // renderEscapePerturbationWith) derives from it, so this single rotation
  // covers all of them. Must match app.js's screenToComplex/centerForAnchor
  // rotation convention exactly, or the rendered fractal and the pointer/
  // gesture math (panning, box-zoom, the Julia-c crosshair) disagree about
  // which way is "up".
  float rc = cos(u_rotation), rs = sin(u_rotation);
  uv = vec2(uv.x * rc - uv.y * rs, uv.x * rs + uv.y * rc);

  if (u_ftype == FTYPE_NEWTON) {
    vec2 p = u_center + uv * u_scale * 2.0;
    gl_FragColor = vec4(renderNewton(p), 1.0);
    return;
  }

  if (u_ftype == FTYPE_CARPET || u_ftype == FTYPE_GASKET) {
    vec2 p = u_center + uv * u_scale * 2.0;
    float base = (u_ftype == FTYPE_CARPET) ? 3.0 : 2.0;
    gl_FragColor = vec4(renderDigitFractal(p, base), 1.0);
    return;
  }

  if (u_usePerturbation) {
    if (u_passNum == 1) {
      gl_FragColor = renderEscapePerturbationWith(uv, u_refOrbitTex, u_refOrbitLen, vec2(0.0));
    } else {
      vec4 p1 = texture2D(u_pass1Tex, gl_FragCoord.xy / u_resolution);
      if (p1.a > 0.5) {
        gl_FragColor = vec4(p1.rgb, 1.0);
      } else if (u_hasOrbitB) {
        vec4 r = renderEscapePerturbationWith(uv, u_refOrbitTexB, u_refOrbitLenB, u_refOffset);
        gl_FragColor = vec4(r.rgb, 1.0); // accept as-is even if still glitched — bounded to one retry
      } else {
        gl_FragColor = vec4(p1.rgb, 1.0);
      }
    }
    return;
  }

  vec2 p = u_center + uv * u_scale * 2.0;
  gl_FragColor = vec4(renderEscapeFast(p), 1.0);
}
`;
