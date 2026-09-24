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
// absolute zoom depth" property the dc offset already relied on). Covers
// Mandelbrot, Multibrot^3, Tricorn and Burning Ship, in parameter-space and
// Julia mode (see perturbStep and renderEscapePerturbation). Newton and the
// Carpet/Gasket digit tests aren't escape-time iterations and still hit the
// plain float32 ceiling at deep zoom. A cheap "reset the delta once it
// grows too large" heuristic was tried and didn't meaningfully help — the
// worst glitches happen when the reference orbit passes very close to zero
// (common exactly where people zoom, near mini-Mandelbrot structures), and
// resetting a pixel's delta right then doesn't fix anything since the
// reference passing near zero doesn't mean that pixel's true orbit does too.
//
// Glitches are handled by rebasing (Zhuoran, 2021), which replaced an
// earlier two-pass scheme (Pauldelbrot glitch flags in an offscreen pass,
// a full-frame readPixels to find one glitched pixel, a second reference
// orbit from there, and a second pass -- bounded to one retry, so glitches
// survived in hard regions). Each pixel instead tracks its own index m into
// the reference orbit, and whenever its true value Z[m]+dz gets closer to
// zero than dz itself -- exactly when the delta stops being a small
// correction and glitches start -- it restarts from the beginning of the
// reference: dz = Z[m]+dz, m = 0. That's valid because every reference
// orbit starts at Z[0] = 0, the critical point of z^n+c, so "the pixel's
// value is dz" and "the pixel is dz away from Z[0]" are the same statement.
// It also rebases when it runs off the end of a reference that escaped
// early. One reference, one draw, no readback. See
// renderEscapePerturbation and chooseReference in app.js.
// Gesture preview at deep zoom (see renderPreview in app.js): redraws the
// last accurate frame, captured into u_snap, moved/scaled/rotated to the
// current view. u_toSnap/u_snapOffset map this frame's uv (same convention
// as FRAG_SRC's main()) to the snapshot's uv; they're computed on the CPU
// in float64 from the two views' relative offset, so they're O(1) numbers
// and the preview is exact at any zoom depth. Anything the snapshot didn't
// cover is filled with the page background.
const PREVIEW_FRAG_SRC = `
precision highp float;
uniform vec2  u_resolution;
uniform sampler2D u_snap;
uniform vec2  u_snapRes;
uniform mat2  u_toSnap;
uniform vec2  u_snapOffset;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
  vec2 s = u_toSnap * uv + u_snapOffset;
  vec2 t = vec2(s.x * u_snapRes.y / u_snapRes.x + 0.5, s.y + 0.5);
  if (t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0) {
    gl_FragColor = vec4(0.067, 0.067, 0.067, 1.0);
    return;
  }
  gl_FragColor = vec4(texture2D(u_snap, t).rgb, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;

uniform vec2  u_resolution;
uniform vec2  u_center;
uniform float u_scale;
// cos/sin of the view rotation (two-finger twist, see app.js), computed on
// the CPU in float64 once per frame rather than per pixel -- also exact,
// where some GPUs' cos()/sin() are approximations.
uniform float u_rotCos;
uniform float u_rotSin;
uniform int   u_maxIter;
uniform int   u_ftype;   // 0=escape 1=ship 2=tricorn 3=newton
uniform float u_power;   // 2.0 or 3.0 (escape family only)
uniform bool  u_isJulia;
uniform vec2  u_juliaC;
uniform vec2  u_phoenixP; // Phoenix only: fixed p in z' = z^2 + c + p*z_prev
uniform sampler2D u_lut;
uniform int   u_digitDepth;    // Carpet/Gasket only, see renderDigitFractal
uniform int   u_digitMaxDepth; // Carpet 16, Gasket 22 (DIGIT_MAX_DEPTH in app.js)
// Sub-pixel sample offset in pixels, (0,0) = pixel center. Supersampling
// accumulates several jittered renders on the CPU side -- see
// SAMPLE_OFFSETS in app.js.
uniform vec2  u_jitter;

uniform bool  u_usePerturbation;
// Reference orbit texture. Parameter mode: one orbit, Z[0] = 0. Julia mode:
// the view-point orbit (texels 0..u_refOrbitLen-1) followed by the critical
// orbit (texels u_critOffset..u_critOffset+u_critLen-1, starting at 0) --
// see renderEscapePerturbation. In parameter mode u_critOffset = 0 and
// u_critLen = u_refOrbitLen, so both "orbits" are the same one.
uniform sampler2D u_refOrbitTex;
uniform int   u_refOrbitLen;
uniform int   u_critOffset;
uniform int   u_critLen;
uniform float u_refTexWidth;
// World-space offset of the reference orbit's own point from u_center --
// chooseReference in app.js doesn't always use the view center. See
// renderEscapePerturbation.
uniform vec2  u_refOffset;

const int FTYPE_ESCAPE  = 0;
const int FTYPE_SHIP    = 1;
const int FTYPE_TRICORN = 2;
const int FTYPE_NEWTON  = 3;
const int FTYPE_CARPET  = 4;
const int FTYPE_GASKET  = 5;
const int FTYPE_PHOENIX = 6;

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

// t cycles through the colormap (escape-time coloring passes values well
// past 1.0 on purpose), so fract() wraps it -- except t == 1.0 itself, the
// end of a bounded [0,1] range (the deepest Carpet/Gasket level, Newton's
// last root band), which fract() would send to the START color. The LUT
// texture wraps with REPEAT, so a coordinate of 1.0 would too; the end
// color is sampled at the last texel's center instead. The tolerance
// covers GPU division rounding (e.g. 15.0/15.0 -> 0.99999994).
vec3 lutColor(float t) {
  float u = abs(t - 1.0) < 1e-5 ? 255.5 / 256.0 : fract(t);
  return texture2D(u_lut, vec2(u, 0.5)).rgb;
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
// Coloring is normalized by u_digitMaxDepth - 1 (not by u_digitDepth) so
// each level keeps the same color at every zoom, and the deepest level
// reaches the end of the colormap rather than wrapping past it.
//
// The cap differs by base. Carpet (base 3) stays at 16: *3 rounds, so
// error compounds ~1.6 bits per level. Gasket (base 2) goes to 22: *2 and
// subtracting floor() are exact in float32, so the only error is the input
// coordinate's own rounding, which a float32-vs-float64 simulation showed
// only ever moves a cell edge by one pixel through depth 23 (<=0.02% of
// pixels off by more), and depth 24 breaks down (6% wrong). 22 leaves one
// level of margin for real GPUs rounding differently from the simulation.
// The old shared cap of 16 stopped the Gasket resolving new levels at only
// ~50x zoom; 22 carries it to ~3,000x.
//
// u_digitDepth is the deepest level whose cells are still at least one
// pixel wide (see digitFractalDepth in app.js), capped as above. It used to be
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
  // anything that survives every level down to u_digitMaxDepth is interior
  // (black).
  float hitFrac = 1.0 / (base * base);
  float surviving = 1.0;
  vec3 sum = vec3(0.0);
  float norm = float(u_digitMaxDepth - 1);
  for (int k = 0; k < 24; k++) {
    if (k >= u_digitMaxDepth) break;
    if (k < depth) continue;
    sum += surviving * hitFrac * lutColor(float(k) / norm);
    surviving *= 1.0 - hitFrac;
  }
  return sum;
}

vec3 renderDigitFractal(vec2 p, float base) {
  // Literal loop bound with a runtime break, same pattern as u_maxIter in
  // the escape-time loops (GLSL ES 1.00 needs a constant bound).
  // 24 is just the constant loop bound; u_digitDepth never exceeds
  // u_digitMaxDepth (22 at most).
  for (int i = 0; i < 24; i++) {
    if (i >= u_digitDepth) break;
    p *= base;
    vec2 cell = mod(floor(p), base);
    if (cell.x == 1.0 && cell.y == 1.0) {
      return lutColor(float(i) / float(u_digitMaxDepth - 1));
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
  // Phoenix is the one type whose recurrence needs the previous iterate
  // (z' = z^2 + c + p*z_prev, z_(-1) = 0); everything else ignores zPrev.
  vec2 zPrev = vec2(0.0);

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
    vec2 zNext = zsq + c;
    // Branch on a uniform, so every pixel takes the same side: the extra
    // term and bookkeeping cost nothing for the other types.
    if (u_ftype == FTYPE_PHOENIX) {
      zNext += cMul(u_phoenixP, zPrev);
      zPrev = z;
    }
    z = zNext;
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

// Exact delta step dz' = f(Z+dz) - f(Z) + dc for each type with a
// perturbation path (perturbationEligibleType in app.js). Each is expanded
// so no term is a difference of two large nearly-equal values, which is
// what keeps the delta accurate in float32.
// |c+d| - |c|, by sign cases so it's never computed as a difference of two
// nearly-equal magnitudes (Heiland-Allen's "diffabs"). Which case applies
// is still decided in float32, so pixels whose orbit passes within float32
// rounding of an axis can pick the wrong fold -- Burning Ship's residual
// error concentrates there.
float diffabs(float c, float d) {
  float cd = c + d;
  if (c >= 0.0) return cd >= 0.0 ? d : -(2.0 * c + d);
  return cd > 0.0 ? 2.0 * c + d : -d;
}

vec2 perturbStep(vec2 Z, vec2 dz, vec2 dc) {
  if (u_ftype == FTYPE_SHIP) {
    // f(z) = (|x| + i|y|)^2 = (x^2 - y^2) + 2|xy| i. Real part: squares
    // don't care about abs, so (X+dx)^2 - X^2 = (2X+dx)*dx. Imag part:
    // 2*(|(X+dx)(Y+dy)| - |XY|) = 2*diffabs(XY, X*dy + dx*Y + dx*dy).
    float re = (2.0 * Z.x + dz.x) * dz.x - (2.0 * Z.y + dz.y) * dz.y;
    float im = 2.0 * diffabs(Z.x * Z.y, Z.x * dz.y + dz.x * Z.y + dz.x * dz.y);
    return vec2(re, im) + dc;
  }
  if (u_ftype == FTYPE_TRICORN) {
    // conj(Z+dz)^2 - conj(Z)^2 = conj(2*Z*dz + dz^2)
    vec2 d = cMul(2.0 * Z, dz) + cMul(dz, dz);
    return vec2(d.x, -d.y) + dc;
  }
  if (u_power > 2.5) {
    // (Z+dz)^3 - Z^3 = 3*Z^2*dz + 3*Z*dz^2 + dz^3
    vec2 Z2 = cMul(Z, Z);
    vec2 dz2 = cMul(dz, dz);
    return cMul(3.0 * Z2, dz) + cMul(3.0 * Z, dz2) + cMul(dz2, dz) + dc;
  }
  // (Z+dz)^2 - Z^2 = 2*Z*dz + dz^2
  return cMul(2.0 * Z, dz) + cMul(dz, dz) + dc;
}

vec2 refOrbitAt(int index) {
  return texture2D(u_refOrbitTex, vec2((float(index) + 0.5) / u_refTexWidth, 0.5)).xy;
}

// The pixel's offset from the reference point (uv*u_scale*2.0 is always the
// offset from u_center, so u_refOffset -- reference minus u_center, see
// app.js -- is subtracted) is a small value regardless of absolute zoom
// depth, so plain float32 is exact enough with no splitting needed (see
// comment above FRAG_SRC).
//
// Parameter mode: the offset is in c (dc), z starts at 0 like the reference.
// Julia mode: c is fixed (dc = 0) and the offset is in the STARTING z, so
// the first reference is the orbit of the view point itself. Its Z[0] is
// that point, not 0, so the first rebase can't return to it -- instead it
// switches to the critical orbit (z0 = 0, same c). The pixel's value is
// near zero at that moment, so as an offset from the critical orbit's
// Z[0] = 0 it's still small and float32 keeps its precision. Every later
// rebase returns to the critical orbit's start, exactly like parameter
// mode. (Ported from how deep-zoom renderers handle Julia sets.)
vec3 renderEscapePerturbation(vec2 uv) {
  vec2 offset = uv * u_scale * 2.0 - u_refOffset;
  vec2 dc = u_isJulia ? vec2(0.0) : offset;
  vec2 dz = u_isJulia ? offset : vec2(0.0);
  int base = 0;                 // texel index of the current orbit's Z[0]
  int len = u_refOrbitLen;      // current orbit's length
  int m = 0;
  vec2 Zm = refOrbitAt(0);      // Z[m]: 0 in parameter mode, the view point in Julia mode

  int iter = 0;
  bool escaped = false;
  vec2 fullAtEscape = vec2(0.0);

  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;

    dz = perturbStep(Zm, dz, dc);

    m++;
    Zm = refOrbitAt(base + m);
    vec2 full = Zm + dz;
    iter = i;

    if (dot(full, full) > 16.0) {
      escaped = true;
      fullAtEscape = full;
      break;
    }

    // Rebase (see comment above FRAG_SRC): the pixel's value is now closer
    // to zero than its delta, or the reference has no Z[m+1] to step to.
    // Always onto the critical orbit, whose Z[0] is 0.
    if (dot(full, full) < dot(dz, dz) || m >= len - 1) {
      dz = full;
      base = u_critOffset;
      len = u_critLen;
      m = 0;
      Zm = vec2(0.0);
    }
  }

  if (!escaped) return vec3(0.0);
  float smoothIter = float(iter) + 1.0 - log2(log2(sqrt(dot(fullAtEscape, fullAtEscape))));
  return lutColor(smoothIter * 0.025);
}

void main() {
  vec2 uv = (gl_FragCoord.xy + u_jitter - 0.5 * u_resolution) / u_resolution.y;

  // Rotate the screen-space offset once, up front — every downstream use of
  // uv (Newton's p, the fast-path p, and the perturbation delta dc inside
  // renderEscapePerturbation) derives from it, so this single rotation
  // covers all of them. Must match app.js's screenToComplex/centerForAnchor
  // rotation convention exactly, or the rendered fractal and the pointer/
  // gesture math (panning, box-zoom, the Julia-c crosshair) disagree about
  // which way is "up".
  uv = vec2(uv.x * u_rotCos - uv.y * u_rotSin, uv.x * u_rotSin + uv.y * u_rotCos);

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
    gl_FragColor = vec4(renderEscapePerturbation(uv), 1.0);
    return;
  }

  vec2 p = u_center + uv * u_scale * 2.0;
  gl_FragColor = vec4(renderEscapeFast(p), 1.0);
}
`;
