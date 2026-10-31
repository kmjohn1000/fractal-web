// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
// Only the JS declarations are exported; the column-0 `const` lines inside the GLSL template strings are shader code.

export const VERT_SRC = `
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
// is written. Retested 2026-10-16 on an iPhone 15 and an M3 Mac (ANGLE on
// Metal): plain Dekker and a version with uniform barriers against
// reassociation both still render deep views no better than float32.
// Integer fixed point (WebGL2 uints) does work, exactly, and is what
// Newton's deep zoom uses -- see NEWTON_DEEP_FRAG_SRC.
//
// Perturbation theory sidesteps that failure mode entirely: the one
// high-precision computation (the reference orbit) runs on the CPU in JS,
// which is already float64 — no GPU-side bit-exact tricks needed. The GPU
// only ever computes a small per-pixel DELTA from that reference, in
// ordinary float32, which stays accurate because the delta itself stays
// small (this is the same "small deltas are fine in float32 regardless of
// absolute zoom depth" property the dc offset already relied on). Covers
// Mandelbrot, Multibrot^3, Tricorn, Burning Ship and Celtic, in parameter-space and
// Julia mode (see perturbStep and renderEscapePerturbation). Newton isn't
// an escape-time iteration and still hits the plain float32 ceiling at deep
// zoom; the Carpet/Gasket digit tests get their own exact equivalent, cell
// rebasing (see renderDigitFractal). A cheap "reset the delta once it
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
// renderEscapePerturbation below and chooseReference in deepzoom.js.
// Gesture preview at deep zoom (see renderPreview in renderer.js): redraws the
// last accurate frame, captured into u_snap, moved/scaled/rotated to the
// current view. u_toSnap/u_snapOffset map this frame's uv (same convention
// as FRAG_SRC's main()) to the snapshot's uv; they're computed on the CPU
// in float64 from the two views' relative offset, so they're O(1) numbers
// and the preview is exact at any zoom depth. Anything the snapshot didn't
// cover is filled with the page background.
export const PREVIEW_FRAG_SRC = `
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

// Color styles (COLOR_STYLES in state.js). Shared by FRAG_SRC and
// PHOENIX_DEEP_FRAG_SRC, which each define lutColor before including this. A
// style picks the colormap coordinate t; bands and shift then treat every
// style alike, lutColor(t * u_density + u_offset), which at 1 and 0 is
// exactly lutColor(t) (x * 1.0 + 0.0 loses no bit), so the default Smooth
// output is unchanged. Each shader's escapeColor picks t: Smooth is the
// continuous count (see escapeColor in FRAG_SRC for the formula) and Bands
// the whole-number count with its hard edges; the other styles are in
// FRAG_SRC. Shader compilers are touchy about float32 perturbation loops: a
// reshaped escapeColor once changed 10% of a deep Phoenix frame, so any edit
// here must pass scripts/default-identity.mjs (zero differing pixels).
export const COLOR_STYLE_GLSL = `
const int STYLE_SMOOTH  = 0;
const int STYLE_BANDS   = 1;
const int STYLE_GLOW    = 2;
const int STYLE_STRIPES = 3;
const int STYLE_POINT   = 4;
const int STYLE_CROSS   = 5;
uniform int   u_style;
uniform float u_density;   // bands: colormap cycles per unit of t (1 = today's 40 iterations per cycle)
uniform float u_offset;    // shift: where in the colormap t = 0 starts, 0..1

vec3 styleColor(float t) {
  return lutColor(t * u_density + u_offset);
}
`;

export const FRAG_SRC = `
precision highp float;

uniform vec2  u_resolution;
uniform vec2  u_center;
uniform float u_scale;
// cos/sin of the view rotation (two-finger twist, see interaction.js), computed on
// the CPU in float64 once per frame rather than per pixel -- also exact,
// where some GPUs' cos()/sin() are approximations.
uniform float u_rotCos;
uniform float u_rotSin;
// -1 mirrors the view's imaginary axis (the Burning Ship's upright picture,
// state.flipY), 1 everywhere else. Applied once, after the rotation, in
// main(): the offset from u_center (and every perturbation delta built on
// it) is then in the real plane's axes, and the iteration is untouched.
uniform float u_flipY;
uniform int   u_maxIter;
uniform int   u_ftype;   // 0=escape 1=ship 2=tricorn 3=newton 7=celtic (see FTYPE in configs.js)
uniform float u_power;   // 2.0 or 3.0 (escape family only)
uniform bool  u_isJulia;
uniform vec2  u_juliaC;
uniform vec2  u_phoenixP; // Phoenix only: fixed p in z' = z^2 + c + p*z_prev
uniform sampler2D u_lut;
// Carpet/Gasket only, see renderDigitFractal below and digitCellFrame in fractal-defs.js.
uniform int   u_digitDepth;    // deepest level resolved per pixel
uniform int   u_digitLevel;    // level of the cells the CPU rebased to
uniform vec2  u_digitCenter;   // view center in those cells' units, within its own cell
uniform float u_digitScale;    // uv to cell units
uniform float u_cellHole[9];   // 3x3 cells around the center one: level cut out at, or -1
uniform float u_digitCycle;    // levels per pass through the colormap (digitColorCycle)
uniform vec3  u_subPixelColor; // color past u_digitDepth (digitSubPixelColor)
// Apollonian gasket only, see renderApollonian below and apolloFrame in fractal-defs.js.
uniform vec2  u_apoW0;         // the view's composed inversions: w0 + K u / (1 + L u)
uniform vec2  u_apoK;
uniform vec2  u_apoL;
uniform bool  u_apoFlip;       // odd step count: apply to conj(u)
uniform float u_apoSteps;      // inversions the CPU already applied
uniform vec3  u_apoCapColor;   // color past APOLLO_MAX_STEPS (apolloCapColor)
// Sub-pixel sample offset in pixels, (0,0) = pixel center. Supersampling
// accumulates several jittered renders on the CPU side -- see
// SAMPLE_OFFSETS in deepzoom.js.
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
// chooseReference in deepzoom.js doesn't always use the view center. See
// renderEscapePerturbation.
uniform vec2  u_refOffset;

const int FTYPE_ESCAPE  = 0;
const int FTYPE_SHIP    = 1;
const int FTYPE_TRICORN = 2;
const int FTYPE_NEWTON  = 3;
const int FTYPE_CARPET  = 4;
const int FTYPE_GASKET  = 5;
const int FTYPE_PHOENIX = 6;
const int FTYPE_CELTIC  = 7;
const int FTYPE_APOLLONIAN = 8;
const int FTYPE_NOVA    = 9;

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
${COLOR_STYLE_GLSL}
// Escape radius 256 (squared here), not the minimal 2: the smooth count below
// assumes |z| is large enough that z^P + c ~ z^P, and with a small radius that
// approximation shows up as faint ripples across each iteration band. A bigger
// radius costs ~2 extra iterations and leaves the colors where they were --
// the escape iteration and the log-log term both grow by the same amount.
// Must match ESCAPE_RADIUS_SQ in deepzoom.js (reference orbit and its selection).
const float ESCAPE_RADIUS_SQ = 65536.0;

// Color for an escaped escape-time pixel. Smooth iteration count
// i + 1 - log_P(log2|z|), where P is the map's power (2, or 3 for
// Multibrot^3): each iteration raises |z| to the P-th power, so log base P
// is what makes the count continuous across iteration bands. Clamped at 0:
// a pixel far outside the set escapes on the first step with |z| well past
// the bailout, which makes the formula negative, and lutColor's fract() would
// wrap that to the TOP of the colormap (inferno's pale yellow in the corners).
vec3 escapeColor(int iter, vec2 z) {
  float logBase = u_power > 2.5 ? log2(3.0) : 1.0;
  if (u_style == STYLE_BANDS) return styleColor(floor(float(iter) + 1.0) * 0.025);
  float n = max(float(iter) + 1.0 - log2(log2(sqrt(dot(z, z)))) / logBase, 0.0);
  return styleColor(n * 0.025);
}

// The styles that need work every iteration are compiled as variants of this
// program (COLOR_VARIANT, defined ahead of the source by fractalProgram in
// renderer.js; 0 is Smooth and Bands and compiles to exactly the code without
// these blocks). Each style's math is mirrored in scripts/oracle/oracle.py;
// change them together.
#if COLOR_VARIANT == 1
// Glow: exterior distance estimate. Track D = dz/dc (the derivative of the
// orbit with respect to the pixel's c; with respect to z0 for Julia), as a
// 2x2 matrix for the folded maps and as a complex number (D.xy) for plain
// z^2 and z^3, where it's a rotation and scale. At escape the distance to
// the set is about 2|z| ln|z| / |D|; the color fades with
// log(1 + distance in CSS pixels), so thin filaments glow the same width at
// any zoom and on any screen.
uniform float u_pixelSize;   // world units per CSS pixel
const float COLOR_DE_RANGE = 40.0;   // glow reaches this many CSS pixels
const float DE_CLAMP = 1e30;         // keeps D inside float32; see glowColor

vec4 glowStart() {
  if (!u_isJulia) return vec4(0.0);
  return u_ftype == FTYPE_ESCAPE ? vec4(1.0, 0.0, 0.0, 0.0) : vec4(1.0, 0.0, 0.0, 1.0);
}

// D after one step, where z is the value f is applied to.
vec4 glowStep(vec4 D, vec2 z) {
  float add = u_isJulia ? 0.0 : 1.0;
  vec4 n;
  if (u_ftype == FTYPE_ESCAPE) {
    vec2 f = u_power > 2.5 ? 3.0 * cMul(z, z) : 2.0 * z;
    n = vec4(cMul(f, D.xy) + vec2(add, 0.0), 0.0, 0.0);
  } else {
    // f's Jacobian (p q / r s) at z, then D = J D + add I.
    float p, q, r, s;
    if (u_ftype == FTYPE_SHIP) {
      vec2 sg = vec2(z.x >= 0.0 ? 1.0 : -1.0, z.y >= 0.0 ? 1.0 : -1.0);
      p = 2.0 * abs(z.x) * sg.x; q = -2.0 * abs(z.y) * sg.y;
      r = 2.0 * abs(z.y) * sg.x; s = 2.0 * abs(z.x) * sg.y;
    } else if (u_ftype == FTYPE_TRICORN) {
      p = 2.0 * z.x; q = -2.0 * z.y; r = -2.0 * z.y; s = -2.0 * z.x;
    } else {
      float sg = z.x * z.x - z.y * z.y >= 0.0 ? 1.0 : -1.0;   // Celtic
      p = sg * 2.0 * z.x; q = -sg * 2.0 * z.y; r = 2.0 * z.y; s = 2.0 * z.x;
    }
    n = vec4(p * D.x + q * D.z + add, p * D.y + q * D.w, r * D.x + s * D.z, r * D.y + s * D.w + add);
  }
  // A pixel whose |D| passes 1e30 is closer to the boundary than any pixel
  // could show (float32's range ends near 3e38, and D grows by 2|z| a step):
  // saturate it, which colors it as on the boundary.
  float m = max(max(abs(n.x), abs(n.y)), max(abs(n.z), abs(n.w)));
  return m > DE_CLAMP ? n * (DE_CLAMP / m) : n;
}

vec3 glowColor(vec2 z, vec4 D) {
  float m = max(max(abs(D.x), abs(D.y)), max(max(abs(D.z), abs(D.w)), 1e-30));
  vec4 d = D / m;
  float norm = m * (u_ftype == FTYPE_ESCAPE ? length(d.xy) : length(d) * 0.70710678);
  float r = sqrt(dot(z, z));
  float distPx = 2.0 * r * log(r) / norm / u_pixelSize;
  float t = 1.0 - clamp(log(1.0 + distPx) / log(1.0 + COLOR_DE_RANGE), 0.0, 1.0);
  return styleColor(t);
}

// Relief: the fractal lit as an embossed surface, from the same derivative.
// The escape potential 0.5 |z|^2 rises away from the set, and its gradient
// with respect to the pixel's position is J^T z, where J is the 2x2 matrix D
// holds (for the plain maps D is a complex number, a rotation and scale, and
// J^T z is conj(D) z). Only the direction matters, so D is scaled first, as in
// glowColor, which keeps the products inside float32. The unit gradient is
// shaded the way the classic 3D Mandelbrot is (a Lambert term with a height
// factor), lit from the upper left of the screen whatever the view's rotation,
// and multiplies the smooth escape color. It is the Smooth coloring with
// the shading on top, so the palette, Repeat and Shift all apply.
const int STYLE_RELIEF = 6;
const float RELIEF_HEIGHT = 1.5;
const vec2 RELIEF_LIGHT = vec2(-0.70710678, 0.70710678);

vec3 reliefColor(int iter, vec2 z, vec4 D) {
  float m = max(max(abs(D.x), abs(D.y)), max(max(abs(D.z), abs(D.w)), 1e-30));
  vec4 d = D / m;
  vec2 g = u_ftype == FTYPE_ESCAPE
    ? vec2(d.x * z.x + d.y * z.y, d.x * z.y - d.y * z.x)
    : vec2(d.x * z.x + d.z * z.y, d.y * z.x + d.w * z.y);
  // From the plane's axes to the screen's (the view is rotated by u_rotCos/u_rotSin,
  // and mirrored by u_flipY first when the view is flipped).
  g.y *= u_flipY;
  g = vec2(g.x * u_rotCos + g.y * u_rotSin, g.y * u_rotCos - g.x * u_rotSin);
  float len = length(g);
  vec2 u = len > 1e-30 ? g / len : vec2(0.0);
  float shade = (dot(u, RELIEF_LIGHT) + RELIEF_HEIGHT) / (1.0 + RELIEF_HEIGHT);
  float logBase = u_power > 2.5 ? log2(3.0) : 1.0;
  float n = max(float(iter) + 1.0 - log2(log2(sqrt(dot(z, z)))) / logBase, 0.0);
  return styleColor(n * 0.025) * shade;
}
#elif COLOR_VARIANT == 2
// Stripes: Härkönen's stripe average. Each iterate z contributes
// a = 0.5 + 0.5 sin(4 arg z), computed from x and y alone (sin 4t = 2 sin 2t
// cos 2t, no trig: the atan version with frequency 5 looked the same in
// side-by-side renders and costs an atan and a sin per iteration). The
// average is over a decaying window (decay 0.85, about 7 iterations of
// memory) rather than every iteration: the plain average washes out to flat
// orange at depth. S = (raw sum, 0.85^n, E_n, E_(n-1)) with the bias-corrected
// average E_n = raw / (1 - 0.85^n); the pixel's value blends the last two
// averages by the smooth iteration count's fraction, so it's continuous
// across iteration bands.
const float STRIPE_LAM = 0.85;
const float STRIPE_GAIN = 2.2;       // contrast around 0.5

vec4 stripeStart() { return vec4(0.0, 1.0, 0.0, 0.0); }

vec4 stripeStep(vec4 S, vec2 z) {
  float r2 = max(dot(z, z), 1e-30);
  float a = 0.5 + 0.5 * (2.0 * (2.0 * z.x * z.y / r2) * ((z.x * z.x - z.y * z.y) / r2));
  float raw = STRIPE_LAM * S.x + (1.0 - STRIPE_LAM) * a;
  float lp = S.y * STRIPE_LAM;
  return vec4(raw, lp, raw / (1.0 - lp), S.z);
}

vec3 stripeColor(int iter, vec2 z, vec4 S) {
  float logBase = u_power > 2.5 ? log2(3.0) : 1.0;
  float n = max(float(iter) + 1.0 - log2(log2(sqrt(dot(z, z)))) / logBase, 0.0);
  float A = S.w + (S.z - S.w) * (n - floor(n));
  return styleColor(clamp(0.5 + (A - 0.5) * STRIPE_GAIN, 0.0, 1.0));
}
#elif COLOR_VARIANT == 3
// Point and Cross: orbit traps. T = (the smallest squared distance any
// iterate came to u_trapCenter, the smallest distance to the horizontal or
// vertical line through it). Point colors by the first, Cross by the second;
// both color the interior too, which never escapes but still has an orbit.
// The first iterate sits at c, the pixel itself, so it's skipped. Every
// pixel's orbit shares nearly the same shape in a deep view, so the distances
// all land in a narrow band that a fixed range paints one color. The range is
// set per view instead (trapRangeFor in state.js): the 2nd-98th percentile of the
// distance over a small probe of the same view, so [u_trapLo, u_trapHi] maps
// to the whole colormap at any depth. Without a probe the app sends the old
// fixed ranges (0..1 Point, 0..0.2 Cross).
uniform vec2 u_trapCenter;
uniform float u_trapLo;       // distance that maps to the near end of the colormap
uniform float u_trapHi;       // distance that maps to the far end
uniform int u_trapProbe;      // 1: write the distance (log, 16 bits) and the escaped flag instead of a color

vec2 trapStart() { return vec2(1e18, 1e18); }

vec2 trapStep(vec2 T, vec2 z) {
  vec2 d = z - u_trapCenter;
  return min(T, vec2(dot(d, d), min(abs(d.x), abs(d.y))));
}

vec3 trapColor(vec2 T, bool escaped) {
  float d = u_style == STYLE_CROSS ? T.y : sqrt(T.x);
  if (u_trapProbe == 1) {
    // ln(1e-12) .. ln(1e2) in 16 bits (red high byte, green low byte).
    float e = clamp((log(max(d, 1e-12)) + 27.6310211) / 32.2361913, 0.0, 1.0);
    float q = floor(e * 65535.0 + 0.5);
    float hiByte = floor(q / 256.0);
    return vec3(hiByte / 255.0, (q - hiByte * 256.0) / 255.0, escaped ? 1.0 : 0.0);
  }
  float t = 1.0 - sqrt(clamp((d - u_trapLo) / max(u_trapHi - u_trapLo, 1e-30), 0.0, 1.0));
  return styleColor(t);
}
#endif

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
// Each level keeps the same color at every zoom (see digitColor).
//
// Deep zoom is cell rebasing (digitCellFrame in fractal-defs.js), the digit-test
// counterpart of perturbation: the CPU works out the top u_digitLevel
// digits exactly from float64 integer cell addresses, for the 3x3 block of
// level-u_digitLevel cells the view lies in, and passes which of them are
// already holes (u_cellHole). The shader works in those cells' units, where
// the view is O(1) wide, so float32 only ever runs the last ~10 levels. That
// carries both fractals to the ~1e15x a float64 view center can address.
// Before it, everything ran from world coordinates in float32 and both
// stopped resolving new levels: Gasket at ~3,000x, Carpet at ~3.5e4x.
//
// The per-pixel levels are still capped (digitMaxDepth in fractal-defs.js), by base.
// Carpet (base 3) stays at 16: *3 rounds, so
// error compounds ~1.6 bits per level. Gasket (base 2) goes to 22: *2 and
// subtracting floor() are exact in float32, so the only error is the input
// coordinate's own rounding, which a float32-vs-float64 simulation showed
// only ever moves a cell edge by one pixel through depth 23 (<=0.02% of
// pixels off by more), and depth 24 breaks down (6% wrong). 22 leaves one
// level of margin for real GPUs rounding differently from the simulation.
// Rebasing keeps the per-pixel count far below either cap except on a
// canvas tens of thousands of pixels tall.
//
// u_digitDepth is the deepest level whose cells are still at least one
// pixel wide (see digitFractalDepth in fractal-defs.js), capped as above. It used to be
// a fixed 16, which caused visible speckle: at the default view one pixel
// is ~3^-6.5 wide, so levels ~7-16 were sub-pixel and a single sample per
// pixel landed on an effectively random one of them. A float64 simulation
// of this exact loop confirmed that aliasing, not float32 precision, was
// the cause: moving the sample a third of a pixel changed 44% of pixels,
// while float32-vs-float64 differed on only 7% (nearly all at depth >= 13).
// A point that survives every resolvable level is colored with the
// area-weighted average of the sub-pixel levels below it
// (u_subPixelColor, worked out once per view by digitSubPixelColor in
// fractal-defs.js) rather than one arbitrary sample — the limit a supersampled
// render converges to, so flat regions and resolved holes agree as you
// zoom in.

// Color for a hole cut out at this level (0 = top). One pass through the
// colormap takes u_digitCycle levels (digitColorCycle in fractal-defs.js). Zooming
// keeps going deeper than that, so alternate passes run back down the
// colormap rather than jumping from its end to its start. digitSubPixelColor
// in fractal-defs.js mirrors this on the CPU.
vec3 digitColor(float level) {
  float t = level / u_digitCycle;
  return lutColor(1.0 - abs(1.0 - mod(t, 2.0)));
}

// q is the pixel in level-u_digitLevel cell units, relative to the cell
// holding the view center (see digitCellFrame in fractal-defs.js).
vec3 renderDigitFractal(vec2 q, float base) {
  // Which of the 3x3 rebased cells the pixel is in. Clamped: at level 0 the
  // zoomed-out view can span more cells than that, but none is a hole yet.
  // Comparing against the loop index is the GLSL ES 1.00-safe way to index
  // a uniform array by a runtime value.
  vec2 n = clamp(floor(q), -1.0, 1.0);
  int cellIdx = int(n.y + 1.0) * 3 + int(n.x + 1.0);
  for (int j = 0; j < 9; j++) {
    if (j == cellIdx && u_cellHole[j] >= 0.0) return digitColor(u_cellHole[j]);
  }
  vec2 p = q - floor(q);
  // Literal loop bound with a runtime break, same pattern as u_maxIter in
  // the escape-time loops (GLSL ES 1.00 needs a constant bound). The CPU
  // keeps u_digitDepth - u_digitLevel within digitMaxDepth (22 at most).
  int levels = u_digitDepth - u_digitLevel;
  for (int i = 0; i < 24; i++) {
    if (i >= levels) break;
    p *= base;
    vec2 cell = mod(floor(p), base);
    if (cell.x == 1.0 && cell.y == 1.0) {
      return digitColor(float(u_digitLevel + i));
    }
    p -= floor(p);
  }
  return u_subPixelColor;
}

// Apollonian gasket, the (-1, 2, 2, 3) packing (APOLLO_DUAL in fractal-defs.js has
// the geometry). Inverts the pixel in whichever of the four dual circles
// holds it until none does, and colors it by the number of inversions. Each
// packing circle shows as nested bands, counts climbing toward its rim, and
// the gasket itself is where they climb fastest. Near a tangency point the
// count grows without bound, so it's capped. Past the cap the color is the
// colormap's average (u_apoCapColor): what supersampling those pixels
// would converge to.
//
// u is the pixel's offset from the view center. For deep zoom the CPU has
// already applied the inversions every pixel shares (apolloFrame in
// fractal-defs.js), as one Mobius map of u: K u and L u keep their precision at any
// depth, and the result is O(1), where float32 is fine. Same ~1e15 limit as
// cell rebasing: the float64 center.
//
// One pass through the colormap takes APOLLO_CYCLE inversions and alternate
// passes run back down it, like digitColor. APOLLO_OFFSET starts the
// opening view's large circles a quarter of the way in: at 0 they're
// Inferno's near-black start.
const int APOLLO_MAX_STEPS = 500;
const float APOLLO_CYCLE = 24.0;
const float APOLLO_OFFSET = 6.0;

vec3 renderApollonian(vec2 u) {
  if (u_apoFlip) u.y = -u.y;
  vec2 z = u_apoW0 + cDiv(cMul(u_apoK, u), vec2(1.0, 0.0) + cMul(u_apoL, u));
  float n = u_apoSteps;
  for (int i = 0; i < APOLLO_MAX_STEPS; i++) {
    vec2 p1 = z - vec2(1.0, 1.0);
    vec2 p2 = z - vec2(-1.0, 1.0);
    vec2 p3 = z - vec2(0.0, 0.25);
    float d1 = dot(p1, p1), d2 = dot(p2, p2), d3 = dot(p3, p3);
    if (z.y < 0.0) {
      z.y = -z.y;
    } else if (d1 < 1.0) {
      z = vec2(1.0, 1.0) + p1 / d1;
    } else if (d2 < 1.0) {
      z = vec2(-1.0, 1.0) + p2 / d2;
    } else if (d3 < 0.0625) {
      z = vec2(0.0, 0.25) + p3 * (0.0625 / d3);
    } else {
      float t = (n + APOLLO_OFFSET) / APOLLO_CYCLE;
      return lutColor(1.0 - abs(1.0 - mod(t, 2.0)));
    }
    n += 1.0;
  }
  return u_apoCapColor;
}

// Nova (Paul Derbyshire): Newton's method for z^3 - 1 with the pixel's c added
// every step, z <- z - (z^3 - 1) / (3 z^2) + c, started at the root z = 1 (R = 1).
// Colored by how fast the orbit settles: converged once a step moves z by less
// than NOVA_EPS. Pixels that never settle are black. The count is smoothed, so
// the colormap flows. Like Newton it is float32 only, with no deep zoom path
// (NOVA_MIN_SCALE in deepzoom.js stops the zoom where float32 gives out).
const float NOVA_EPS2 = 1e-10;     // NOVA_EPS squared, NOVA_EPS = 1e-5
const float NOVA_CYCLE = 20.0;    // iterations per pass through the colormap

vec3 renderNova(vec2 c) {
  vec2 z = vec2(1.0, 0.0);
  float prevD2 = 4.0;
  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;
    // z - (z^3 - 1)/(3z^2) as (2z + (1/z)^2)/3, the form renderNewton uses, so
    // it never forms z^2 or z^4.
    vec2 zn = c;
    float d = dot(z, z);
    if (d > 0.0) {
      vec2 w = vec2(z.x, -z.y) / d;
      zn += (2.0 * z + cMul(w, w)) / 3.0;
    } else {
      zn += z;
    }
    vec2 dz = zn - z;
    float d2 = dot(dz, dz);
    z = zn;
    // Settled when the step is under NOVA_EPS relative to |z| (but never less
    // than NOVA_EPS itself): float32 can't step finer than ~1e-7 * |z|, and with
    // a flat 1e-6 the pixels whose fixed point is far out (|z| > 5, most of the
    // plane away from the crescent) never settled and drew as noise.
    float thr = NOVA_EPS2 * max(dot(z, z), 1.0);
    if (d2 < thr) {
      // Where log|step| crosses the threshold between the last two steps (a
      // converging orbit shrinks its steps by a steady factor), counted from 0.
      float lo = log(max(d2, 1e-36));
      float hi = log(max(prevD2, 1e-36));
      float frac = hi - lo > 1e-6 ? (log(thr) - lo) / (hi - lo) : 0.0;
      float n = max(float(i) - frac, 0.0);
      return lutColor(n / NOVA_CYCLE);
    }
    prevD2 = d2;
  }
  return vec3(0.0);
}

vec3 renderNewton(vec2 p) {
  // Matches _newton_chunk: z starts at the grid point itself.
  vec2 z = p;
  int rootIdx = -1;
  int iterUsed = 0;

  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;
    iterUsed = i;
    // z - (z^3 - 1)/(3z^2), rewritten as (2z + (1/z)^2)/3 so it never
    // forms z^2 or z^4: those underflow float32 near the pole at 0, which
    // blanked Surprise me's dive there below a scale of ~1e-6. This form
    // holds down to |z| ~ 1e-19.
    float d = dot(z, z);
    if (d > 0.0) {
      vec2 w = vec2(z.x, -z.y) / d;
      z = (2.0 * z + cMul(w, w)) / 3.0;
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
  // Python desktop app's cardioid/bulb skip. (Not for the orbit traps, which
  // color the interior by its orbit.)
#if COLOR_VARIANT != 3
  if (u_ftype == FTYPE_ESCAPE && u_power < 2.5 && !u_isJulia) {
    float x = c.x, y = c.y;
    float q = (x - 0.25) * (x - 0.25) + y * y;
    if (q * (q + x - 0.25) < 0.25 * y * y || (x + 1.0) * (x + 1.0) + y * y < 0.0625) {
      return vec3(0.0);
    }
  }
#endif

  int iter = 0;
  bool escaped = false;
  // Phoenix is the one type whose recurrence needs the previous iterate
  // (z' = z^2 + c + p*z_prev, z_(-1) = 0); everything else ignores zPrev.
  vec2 zPrev = vec2(0.0);
#if COLOR_VARIANT == 1
  vec4 D = glowStart();
#elif COLOR_VARIANT == 2
  vec4 S = stripeStart();
#elif COLOR_VARIANT == 3
  vec2 T = trapStart();
#endif

  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;
#if COLOR_VARIANT == 1
    D = glowStep(D, z);
#endif
    vec2 zsq;
    if (u_ftype == FTYPE_SHIP) {
      vec2 zabs = vec2(abs(z.x), abs(z.y));
      zsq = cMul(zabs, zabs);
    } else if (u_ftype == FTYPE_TRICORN) {
      vec2 zc = vec2(z.x, -z.y);
      zsq = cMul(zc, zc);
    } else if (u_ftype == FTYPE_CELTIC) {
      // Mandelbrot with the real part of z^2 folded: (|x^2 - y^2|, 2xy)
      zsq = cMul(z, z);
      zsq.x = abs(zsq.x);
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
#if COLOR_VARIANT == 2
    S = stripeStep(S, z);
#elif COLOR_VARIANT == 3
    if (i > 0) T = trapStep(T, z);
#endif
    if (dot(z, z) > ESCAPE_RADIUS_SQ) { escaped = true; break; }
  }

#if COLOR_VARIANT == 3
  return trapColor(T, escaped);
#endif
  if (!escaped) return vec3(0.0);

#if COLOR_VARIANT == 1
  return u_style == STYLE_RELIEF ? reliefColor(iter, z, D) : glowColor(z, D);
#elif COLOR_VARIANT == 2
  return stripeColor(iter, z, S);
#else
  return escapeColor(iter, z);
#endif
}

// ---------------------------------------------------------------- perturbation

// Exact delta step dz' = f(Z+dz) - f(Z) + dc for each type with a
// perturbation path (perturbationEligibleType in deepzoom.js). Each is expanded
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
  if (u_ftype == FTYPE_CELTIC) {
    // f(z) = (|x^2 - y^2|, 2xy). The imaginary part is plain Mandelbrot's:
    // 2*(X*dy + dx*Y + dx*dy). The real part folds x^2 - y^2 =: A, whose
    // delta is a = (2X+dx)*dx - (2Y+dy)*dy, so |A+a| - |A| = diffabs(A, a).
    float a = (2.0 * Z.x + dz.x) * dz.x - (2.0 * Z.y + dz.y) * dz.y;
    float re = diffabs(Z.x * Z.x - Z.y * Z.y, a);
    float im = 2.0 * (Z.x * dz.y + dz.x * Z.y + dz.x * dz.y);
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
// deepzoom.js -- is subtracted) is a small value regardless of absolute zoom
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
#if COLOR_VARIANT == 1
  vec4 D = glowStart();
#elif COLOR_VARIANT == 2
  vec4 S = stripeStart();
#elif COLOR_VARIANT == 3
  vec2 T = trapStart();
#endif

  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;

#if COLOR_VARIANT == 1
    D = glowStep(D, Zm + dz);   // the orbit's value before this step
#endif
    dz = perturbStep(Zm, dz, dc);

    m++;
    Zm = refOrbitAt(base + m);
    vec2 full = Zm + dz;
    iter = i;
#if COLOR_VARIANT == 2
    S = stripeStep(S, full);
#elif COLOR_VARIANT == 3
    if (i > 0) T = trapStep(T, full);
#endif

    if (dot(full, full) > ESCAPE_RADIUS_SQ) {
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

#if COLOR_VARIANT == 3
  return trapColor(T, escaped);
#endif
  if (!escaped) return vec3(0.0);
#if COLOR_VARIANT == 1
  return u_style == STYLE_RELIEF ? reliefColor(iter, fullAtEscape, D) : glowColor(fullAtEscape, D);
#elif COLOR_VARIANT == 2
  return stripeColor(iter, fullAtEscape, S);
#else
  return escapeColor(iter, fullAtEscape);
#endif
}

void main() {
  vec2 uv = (gl_FragCoord.xy + u_jitter - 0.5 * u_resolution) / u_resolution.y;

  // Rotate the screen-space offset once, up front — every downstream use of
  // uv (Newton's p, the fast-path p, and the perturbation delta dc inside
  // renderEscapePerturbation) derives from it, so this single rotation
  // covers all of them. Must match render-layout.js's screenToComplex/centerForAnchor
  // rotation convention exactly, or the rendered fractal and the pointer/
  // gesture math (panning, box-zoom, the Julia-c crosshair) disagree about
  // which way is "up".
  uv = vec2(uv.x * u_rotCos - uv.y * u_rotSin, uv.x * u_rotSin + uv.y * u_rotCos);
  uv.y *= u_flipY; // see u_flipY; render-layout.js's screenToComplex does the same

  if (u_ftype == FTYPE_NEWTON) {
    vec2 p = u_center + uv * u_scale * 2.0;
    gl_FragColor = vec4(renderNewton(p), 1.0);
    return;
  }

  if (u_ftype == FTYPE_NOVA) {
    gl_FragColor = vec4(renderNova(u_center + uv * u_scale * 2.0), 1.0);
    return;
  }

  if (u_ftype == FTYPE_CARPET || u_ftype == FTYPE_GASKET) {
    vec2 q = u_digitCenter + uv * u_digitScale;
    float base = (u_ftype == FTYPE_CARPET) ? 3.0 : 2.0;
    gl_FragColor = vec4(renderDigitFractal(q, base), 1.0);
    return;
  }

  if (u_ftype == FTYPE_APOLLONIAN) {
    gl_FragColor = vec4(renderApollonian(uv * u_scale * 2.0), 1.0);
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

// ---------------------------------------------------------------- fixed-point deep zoom
// Newton and Phoenix have no perturbation path of the kind above (Newton
// isn't escape-time; Phoenix's two-term recurrence can't rebase), so their
// deep views use exact 16.48 fixed point (WebGL2 only): a value is a 64-bit
// two's-complement integer over 2^48, kept as four 16-bit limbs in a uvec4,
// .x most significant. 16x16-bit partial products fit a 32-bit uint
// exactly, so every operation is exact integer math, which no compiler
// optimization can change -- unlike the dual-float tricks (see the comment
// above FRAG_SRC). Resolution is 2^-48 (~3.6e-15), so views stay sharp to a
// scale of ~1e-11. The integer part is 16 bits (|x| < 32768), so callers
// keep values well inside that.
export const VERT_SRC_300 = `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Shared by NEWTON_DEEP_FRAG_SRC and PHOENIX_DEEP_FRAG_SRC, which declare
// u_lut before including it.
export const FIXED_POINT_GLSL = `
const uint M = 0xFFFFu;

uvec4 fxAdd(uvec4 a, uvec4 b) {
  uint w = a.w + b.w; uint c = w >> 16u; w &= M;
  uint z = a.z + b.z + c; c = z >> 16u; z &= M;
  uint y = a.y + b.y + c; c = y >> 16u; y &= M;
  uint x = (a.x + b.x + c) & M;
  return uvec4(x, y, z, w);
}
uvec4 fxNeg(uvec4 a) { return fxAdd(a ^ uvec4(M), uvec4(0u, 0u, 0u, 1u)); }
bool fxIsNeg(uvec4 a) { return (a.x & 0x8000u) != 0u; }
uvec4 fxAbs(uvec4 a) { return fxIsNeg(a) ? fxNeg(a) : a; }
// a / 2, rounding toward -infinity (arithmetic shift).
uvec4 fxHalf(uvec4 a) {
  return uvec4((a.x >> 1u) | (a.x & 0x8000u), (a.y >> 1u) | ((a.x & 1u) << 15u),
               (a.z >> 1u) | ((a.y & 1u) << 15u), (a.w >> 1u) | ((a.z & 1u) << 15u));
}

// |a| * |b| >> 48: column sums of the 16 partial products' 16-bit halves
// (each column well under 2^32), then one carry pass. Truncates the bits
// below 2^-48.
uvec4 fxMulAbs(uvec4 a, uvec4 b) {
  uint a0 = a.w, a1 = a.z, a2 = a.y, a3 = a.x;   // limb i weighs 2^(16 i)
  uint b0 = b.w, b1 = b.z, b2 = b.y, b3 = b.x;
  uint p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p02 = a0 * b2, p11 = a1 * b1, p20 = a2 * b0;
  uint p03 = a0 * b3, p12 = a1 * b2, p21 = a2 * b1, p30 = a3 * b0;
  uint p13 = a1 * b3, p22 = a2 * b2, p31 = a3 * b1, p23 = a2 * b3, p32 = a3 * b2, p33 = a3 * b3;
  uint c0 = p00 & M;
  uint c1 = (p00 >> 16u) + (p01 & M) + (p10 & M);
  uint c2 = (p01 >> 16u) + (p10 >> 16u) + (p02 & M) + (p11 & M) + (p20 & M);
  uint c3 = (p02 >> 16u) + (p11 >> 16u) + (p20 >> 16u) + (p03 & M) + (p12 & M) + (p21 & M) + (p30 & M);
  uint c4 = (p03 >> 16u) + (p12 >> 16u) + (p21 >> 16u) + (p30 >> 16u) + (p13 & M) + (p22 & M) + (p31 & M);
  uint c5 = (p13 >> 16u) + (p22 >> 16u) + (p31 >> 16u) + (p23 & M) + (p32 & M);
  uint c6 = (p23 >> 16u) + (p32 >> 16u) + (p33 & M);
  c1 += c0 >> 16u; c2 += c1 >> 16u; c3 += c2 >> 16u;
  c4 += c3 >> 16u; c5 += c4 >> 16u; c6 += c5 >> 16u;
  return uvec4(c6 & M, c5 & M, c4 & M, c3 & M);
}
uvec4 fxMul(uvec4 a, uvec4 b) {
  uvec4 m = fxMulAbs(fxAbs(a), fxAbs(b));
  return fxIsNeg(a) != fxIsNeg(b) ? fxNeg(m) : m;
}
// Exact for any float32 below 2^15: floor() and *65536 lose nothing.
uvec4 fxFromFloat(float f) {
  float x = abs(f);
  float l0 = floor(x); float r = (x - l0) * 65536.0;
  float l1 = floor(r); r = (r - l1) * 65536.0;
  float l2 = floor(r); r = (r - l2) * 65536.0;
  float l3 = floor(r);
  uvec4 v = uvec4(uint(l0), uint(l1), uint(l2), uint(l3));
  return f < 0.0 ? fxNeg(v) : v;
}
float fxToFloat(uvec4 a) {
  uvec4 m = fxAbs(a);
  float v = float(m.x) + float(m.y) / 65536.0 + float(m.z) / 4294967296.0 + float(m.w) / 281474976710656.0;
  return fxIsNeg(a) ? -v : v;
}

// Must match lutColor in FRAG_SRC.
vec3 lutColor(float t) {
  float u = abs(t - 1.0) < 1e-5 ? 255.5 / 256.0 : fract(t);
  return texture(u_lut, vec2(u, 0.5)).rgb;
}
`;

// Newton: below the deep-zoom threshold and away from the origin (see
// newtonDeepEligible in deepzoom.js). Measured on an iPhone 15: ~12 ms per
// 256x256 pass at 1e-9, about 0.2 s full screen (before the u-mode below).
//
// The map N(z) = (2z + 1/z^2) / 3 throws an orbit that passes near the pole
// at 0 far out (|N(z)| ~ 1/(3|z|^2)), past the 16-bit integer part. So the
// orbit is kept as z while |z| <= 2 and as u = 1/z beyond, where
//   u' = 3u / (2 + u^3)            (u-mode, |u| < 1/2)
//   u' = 3z^2 / (1 + 2z^3)         (straight from z when |z| < 1/4)
// and every value stays small and exact. An earlier version dropped to
// float32 instead, which lost the pixel offsets near the central star and
// its copies (5-40% of pixels right at 1e-9). Only an orbit that comes
// within ~1e-4 of 0 still finishes in float32: there u ~ 3|z|^2 is too
// small for 48 fraction bits, and float32's relative precision is better.

export const NEWTON_DEEP_FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  u_resolution;
uniform vec2  u_jitter;
uniform float u_rotCos;
uniform float u_rotSin;
uniform float u_scale;
uniform int   u_maxIter;
uniform uvec4 u_cx;      // view center, fixed point (fixedLimbs in deepzoom.js)
uniform uvec4 u_cy;
uniform uvec4 u_third;   // 1/3 in fixed point
// Self-test output (see newtonDeepSelfTest in renderer.js): iteration count and
// root as bytes instead of a color.
uniform bool  u_testMode;
uniform sampler2D u_lut;
out vec4 fragColor;

const vec2 NEWTON_ROOT0 = vec2( 1.0,  0.0);
const vec2 NEWTON_ROOT1 = vec2(-0.5,  0.8660254037844386);
const vec2 NEWTON_ROOT2 = vec2(-0.5, -0.8660254037844386);
const uvec4 FX_ONE = uvec4(1u, 0u, 0u, 0u);
const uvec4 FX_TWO = uvec4(2u, 0u, 0u, 0u);
${FIXED_POINT_GLSL}
// 1/s for a real s > 0 whose float32 value is sf: one Newton-Raphson step on
// the float32 reciprocal doubles its 24 correct bits to all 48. Needs
// 1/32768 < s < 32768.
uvec4 fxRecip(uvec4 s, float sf) {
  uvec4 y0 = fxFromFloat(1.0 / sf);
  return fxMul(y0, fxAdd(FX_TWO, fxNeg(fxMul(s, y0))));
}
// (rx, ry) = (ax + i ay)(bx + i by)
void cxMul(uvec4 ax, uvec4 ay, uvec4 bx, uvec4 by, out uvec4 rx, out uvec4 ry) {
  rx = fxAdd(fxMul(ax, bx), fxNeg(fxMul(ay, by)));
  ry = fxAdd(fxMul(ax, by), fxMul(ay, bx));
}
// (rx, ry) = 1 / (x + i y) = (x - i y) / (x^2 + y^2)
void cxRecip(uvec4 x, uvec4 y, out uvec4 rx, out uvec4 ry) {
  uvec4 s = fxAdd(fxMul(x, x), fxMul(y, y));
  uvec4 inv = fxRecip(s, fxToFloat(s));
  rx = fxMul(x, inv);
  ry = fxNeg(fxMul(y, inv));
}
// (rx, ry) = 3 (nx + i ny) / (dx + i dy)
void cxThreeOver(uvec4 nx, uvec4 ny, uvec4 dx, uvec4 dy, out uvec4 rx, out uvec4 ry) {
  uvec4 ix, iy, qx, qy;
  cxRecip(dx, dy, ix, iy);
  cxMul(nx, ny, ix, iy, qx, qy);
  rx = fxAdd(fxAdd(qx, qx), qx);
  ry = fxAdd(fxAdd(qy, qy), qy);
}

void main() {
  vec2 uv = (gl_FragCoord.xy + u_jitter - 0.5 * u_resolution) / u_resolution.y;
  uv = vec2(uv.x * u_rotCos - uv.y * u_rotSin, uv.x * u_rotSin + uv.y * u_rotCos);
  // The offset from the center is small, so float32 holds it to ~1e-7 of a
  // pixel; adding it to the center is where the precision is needed.
  vec2 off = uv * u_scale * 2.0;
  // (ax, ay) is z, or u = 1/z while inU; f is its float32 value.
  uvec4 ax = fxAdd(u_cx, fxFromFloat(off.x));
  uvec4 ay = fxAdd(u_cy, fxFromFloat(off.y));
  vec2 f = vec2(fxToFloat(ax), fxToFloat(ay));
  bool inU = false;
  // A center past |z| = 2 (newtonDeepEligible keeps it under 100) starts
  // as u.
  if (dot(f, f) > 4.0) {
    cxRecip(ax, ay, ax, ay);
    f = vec2(fxToFloat(ax), fxToFloat(ay));
    inU = true;
  }
  bool exact = true;
  vec2 z = f;   // float32 z, once exact is off
  int rootIdx = -1;
  int iterUsed = 0;

  // Same iteration as renderNewton in FRAG_SRC, z <- (2z + (1/z)^2) / 3.
  for (int i = 0; i < 2000; i++) {
    if (i >= u_maxIter) break;
    iterUsed = i;
    if (exact) {
      float d = dot(f, f);
      uvec4 nx, ny;
      if (inU) {
        // u' = 3u / (2 + u^3)
        uvec4 u2x, u2y, u3x, u3y;
        cxMul(ax, ay, ax, ay, u2x, u2y);
        cxMul(u2x, u2y, ax, ay, u3x, u3y);
        cxThreeOver(ax, ay, fxAdd(u3x, FX_TWO), u3y, nx, ny);
        ax = nx; ay = ny;
        f = vec2(fxToFloat(ax), fxToFloat(ay));
        // Back to z once |z| <= 2: |u|^2 is then in [1/4, 0.64].
        if (dot(f, f) >= 0.25) {
          cxRecip(ax, ay, ax, ay);
          f = vec2(fxToFloat(ax), fxToFloat(ay));
          inU = false;
        }
      } else if (d < 1e-8) {
        // Within 1e-4 of the pole: finish in float32 (see above).
        exact = false;
        z = f;
      } else if (d < 0.0625) {
        // |z| < 1/4: u' = 3z^2 / (1 + 2z^3), |u'| < 0.2.
        uvec4 z2x, z2y, z3x, z3y;
        cxMul(ax, ay, ax, ay, z2x, z2y);
        cxMul(z2x, z2y, ax, ay, z3x, z3y);
        cxThreeOver(z2x, z2y, fxAdd(fxAdd(z3x, z3x), FX_ONE), fxAdd(z3y, z3y), nx, ny);
        ax = nx; ay = ny;
        f = vec2(fxToFloat(ax), fxToFloat(ay));
        inU = true;
      } else {
        // 1/4 <= |z| <= 2: z' = (2z + w^2) / 3 with w = 1/z (|w| <= 4).
        uvec4 wx, wy;
        cxRecip(ax, ay, wx, wy);
        uvec4 w2x = fxAdd(fxMul(wx, wx), fxNeg(fxMul(wy, wy)));
        uvec4 w2y = fxMul(wx, wy);
        w2y = fxAdd(w2y, w2y);
        ax = fxMul(fxAdd(fxAdd(ax, ax), w2x), u_third);
        ay = fxMul(fxAdd(fxAdd(ay, ay), w2y), u_third);
        f = vec2(fxToFloat(ax), fxToFloat(ay));
        // |z'| <= ~6.7 here; past 2 it continues as u.
        if (dot(f, f) > 4.0) {
          cxRecip(ax, ay, ax, ay);
          f = vec2(fxToFloat(ax), fxToFloat(ay));
          inU = true;
        }
      }
      if (exact && !inU) z = f;
    }
    if (!exact) {
      float d = dot(z, z);
      if (d > 0.0) {
        vec2 w = vec2(z.x, -z.y) / d;
        z = (2.0 * z + vec2(w.x * w.x - w.y * w.y, 2.0 * w.x * w.y)) / 3.0;
      }
    }
    // The roots have |z| = 1, so a u-mode value can't be at one.
    if (!exact || !inU) {
      if (dot(z - NEWTON_ROOT0, z - NEWTON_ROOT0) < 1e-12) { rootIdx = 0; break; }
      if (dot(z - NEWTON_ROOT1, z - NEWTON_ROOT1) < 1e-12) { rootIdx = 1; break; }
      if (dot(z - NEWTON_ROOT2, z - NEWTON_ROOT2) < 1e-12) { rootIdx = 2; break; }
    }
  }

  if (u_testMode) {
    float it = float(iterUsed);
    fragColor = vec4(mod(it, 256.0) / 255.0, floor(it / 256.0) / 255.0, float(rootIdx + 1) / 255.0, 1.0);
    return;
  }
  if (rootIdx < 0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float t = (float(rootIdx) + float(iterUsed) / max(float(u_maxIter - 1), 1.0)) / 3.0;
  fragColor = vec4(lutColor(t), 1.0);
}
`;

// Phoenix (z' = z^2 + c + p*z_prev) deep zoom, both parameter space and
// Julia mode, below the deep-zoom threshold (phoenixDeepEligible in deepzoom.js).
// All-fixed-point Phoenix was exact but ~20x too slow on an iPhone 15, and
// its long draws made the phone drop the WebGL context. So each pixel runs
// the cheap float32 perturbation delta first,
//   d' = 2*Z*d + d^2 + dc + p*d_prev,
// against one float64 reference orbit Z (u_ref row 0, see
// phoenixReference in deepzoom.js), and only a pixel that glitches -- its value
// Z+d smaller than d, the point where a delta stops being small -- or that
// outlives the reference switches to exact fixed point. It switches from
// Z[m] + d, which is exact at that moment because u_ref rows 1-2 hold Z[m]
// as fixed-point limbs. Phoenix can't rebase like renderEscapePerturbation
// (it would need z AND z_prev near the reference's start), which is why the
// fallback is fixed point. On an iPhone 15 this matched float64 on 100% of
// pixels at 1e-9, ~0.3 s full screen at maxIter 2000.
//
// The exact stretch runs until |z| > 8 (no overflow risk: |z^2 + c + p z| <
// 100), then float32 finishes the escape, where precision no longer matters.
// u_exactCap bounds each pixel's exact steps so no draw runs long enough to
// trip the GPU watchdog; a pixel past the cap finishes in float32.
// Assumes PHOENIX_P = (-0.5, 0): p*z_prev is a halving and a negation.
export const PHOENIX_DEEP_FRAG_SRC = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  u_resolution;
uniform vec2  u_jitter;
uniform float u_rotCos;
uniform float u_rotSin;
uniform float u_scale;
uniform int   u_maxIter;
uniform bool  u_isJulia;
uniform uvec4 u_cx;          // view center, fixed point
uniform uvec4 u_cy;
uniform uvec4 u_jcx;         // Julia mode's c, fixed point
uniform uvec4 u_jcy;
uniform highp sampler2D u_ref;
uniform int   u_refLen;
uniform vec2  u_refOff;      // reference point minus view center
uniform int   u_exactCap;
uniform bool  u_testMode;    // iteration count and escape as bytes (phoenixDeepSelfTest)
uniform sampler2D u_lut;
out vec4 fragColor;

const float P = -0.5;
// Must match ESCAPE_RADIUS_SQ in FRAG_SRC.
const float ESCAPE_RADIUS_SQ = 65536.0;
${FIXED_POINT_GLSL}
${COLOR_STYLE_GLSL}
// Must match escapeColor in FRAG_SRC (Phoenix is power 2: log base 2). Only
// Smooth and Bands exist for Phoenix (styleDrawn in state.js). Kept in this
// exact shape: the version that called a shared helper changed the compiled
// perturbation loop (see COLOR_STYLE_GLSL).
vec3 escapeColor(int iter, vec2 z) {
  float n = max(float(iter) + 1.0 - log2(log2(sqrt(dot(z, z)))), 0.0);
  float t = u_style == STYLE_BANDS ? floor(float(iter) + 1.0) * 0.025 : n * 0.025;
  return lutColor(t * u_density + u_offset);
}

vec2 cMul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}
vec2 refZ(int m) { return texelFetch(u_ref, ivec2(m, 0), 0).xy; }
uvec4 refLimbs(int m, int row) {
  vec4 t = texelFetch(u_ref, ivec2(m, row), 0);
  return uvec4(uint(t.x), uint(t.y), uint(t.z), uint(t.w));
}

vec4 result(int iter, bool escaped, vec2 z) {
  if (u_testMode) {
    float it = float(iter);
    return vec4(mod(it, 256.0) / 255.0, floor(it / 256.0) / 255.0, escaped ? 1.0 / 255.0 : 0.0, 1.0);
  }
  return vec4(escaped ? escapeColor(iter, z) : vec3(0.0), 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy + u_jitter - 0.5 * u_resolution) / u_resolution.y;
  uv = vec2(uv.x * u_rotCos - uv.y * u_rotSin, uv.x * u_rotSin + uv.y * u_rotCos);
  vec2 off = uv * u_scale * 2.0;
  vec2 rel = off - u_refOff;
  // Parameter mode: the offset is in c, z starts at 0 like the reference.
  // Julia mode: c is fixed and the offset is in the starting z.
  vec2 dc = u_isJulia ? vec2(0.0) : rel;
  vec2 d = u_isJulia ? rel : vec2(0.0);
  vec2 dp = vec2(0.0);
  vec2 Z = refZ(0);
  int m = 0;
  int i = 0;
  bool glitched = false;
  for (; i < 2000; i++) {
    if (i >= u_maxIter) break;
    vec2 dn = 2.0 * cMul(Z, d) + cMul(d, d) + dc + P * dp;
    dp = d;
    d = dn;
    m++;
    Z = refZ(m);
    vec2 full = Z + d;
    float f2 = dot(full, full);
    if (f2 > ESCAPE_RADIUS_SQ) { fragColor = result(i, true, full); return; }
    // Stop before the reference's last (escaped, possibly huge) point, so
    // its limbs are always in fixed-point range.
    if (f2 < dot(d, d) || m >= u_refLen - 2) { glitched = true; break; }
  }
  if (!glitched) { fragColor = result(u_maxIter - 1, false, vec2(0.0)); return; }

  // Exact from here: z = Z[m] + d, z_prev = Z[m-1] + dp, c = center + offset.
  uvec4 zx = fxAdd(refLimbs(m, 1), fxFromFloat(d.x));
  uvec4 zy = fxAdd(refLimbs(m, 2), fxFromFloat(d.y));
  uvec4 zpx = fxAdd(refLimbs(m - 1, 1), fxFromFloat(dp.x));
  uvec4 zpy = fxAdd(refLimbs(m - 1, 2), fxFromFloat(dp.y));
  uvec4 cx = u_isJulia ? u_jcx : fxAdd(u_cx, fxFromFloat(off.x));
  uvec4 cy = u_isJulia ? u_jcy : fxAdd(u_cy, fxFromFloat(off.y));
  vec2 z = vec2(fxToFloat(zx), fxToFloat(zy));
  i++;
  for (int k = 0; k < 2000; k++) {
    if (i >= u_maxIter || k >= u_exactCap || dot(z, z) > 64.0) break;
    uvec4 re = fxAdd(fxMul(zx, zx), fxNeg(fxMul(zy, zy)));
    uvec4 xy = fxMul(zx, zy);
    uvec4 nx = fxAdd(re, fxAdd(cx, fxNeg(fxHalf(zpx))));
    uvec4 ny = fxAdd(fxAdd(xy, xy), fxAdd(cy, fxNeg(fxHalf(zpy))));
    zpx = zx; zpy = zy; zx = nx; zy = ny;
    z = vec2(fxToFloat(zx), fxToFloat(zy));
    if (dot(z, z) > ESCAPE_RADIUS_SQ) { fragColor = result(i, true, z); return; }
    i++;
  }

  // float32 for the rest: the escape from |z| > 8, or past u_exactCap.
  vec2 zp = vec2(fxToFloat(zpx), fxToFloat(zpy));
  vec2 c = vec2(fxToFloat(cx), fxToFloat(cy));
  for (int k = 0; k < 2000; k++) {
    if (i >= u_maxIter) break;
    vec2 zn = cMul(z, z) + c + P * zp;
    zp = z;
    z = zn;
    if (dot(z, z) > ESCAPE_RADIUS_SQ) { fragColor = result(i, true, z); return; }
    i++;
  }
  fragColor = result(u_maxIter - 1, false, vec2(0.0));
}
`;
