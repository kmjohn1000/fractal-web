"use strict";

// ---------------------------------------------------------------- fractal configs
// Ported from mandelbrot.py's FRACTAL_CONFIGS. view is [xmin, xmax, ymin, ymax],
// the region that must be fully visible when the fractal first opens;
// viewFromBounds fits it to the canvas's aspect ratio (see there).

const FTYPE = { ESCAPE: 0, SHIP: 1, TRICORN: 2, NEWTON: 3, CARPET: 4, GASKET: 5, PHOENIX: 6 };

// Phoenix's fixed p in z' = z^2 + c + p*z_prev: the classic real -0.5
// (Ushiki). With c = 0.5667 in Julia mode that gives the well-known twin-lobe
// image (Julia:Phoenix); p = -0.5+0.5i was tried first and gives only a single
// tilted lobe in either mode. A constant for the fractal, not view state.
const PHOENIX_P = [-0.5, 0];

// category splits the fractal picker into its two labeled parts (see
// FRACTAL_CATEGORIES), and gates the zoom-only toolbar buttons (box zoom,
// Surprise me):
//   "zoom"    - fractals you explore by zooming: every escape-time type
//               (Mandelbrot and its variants, the Julia presets, Newton)
//               and the digit-test Carpet/Gasket. Everything in
//               FRACTAL_CONFIGS is "zoom"; any future escape-time or
//               digit-extraction type belongs here too.
//   "pattern" - the Canvas2D curves and chaos-game IFS shapes (EXTRA_MODES).
const FRACTAL_CONFIGS = {
  // The escape-time and Julia boxes are the sets' measured extents
  // (antenna/tips included; for dust-like Julia sets, points surviving 60+
  // iterations) plus a ~0.1 margin, so each opens filling the screen.
  // Tricorn's tips reach y = +-1.54, which its old +-1.25 box clipped even
  // before aspect fitting.
  "Mandelbrot":   { ftype: FTYPE.ESCAPE,  power: 2, juliaC: null,               view: [-2.15, 0.65, -1.25, 1.25], dual: true,  category: "zoom" },
  "Burn. Ship":   { ftype: FTYPE.SHIP,    power: 2, juliaC: null,               view: [-2.15, 1.25, -1.85, 0.65], dual: true,  category: "zoom" },
  "Tricorn":      { ftype: FTYPE.TRICORN, power: 2, juliaC: null,               view: [-2.1,  1.15, -1.7,  1.7],  dual: true,  category: "zoom" },
  "Multibrot³": { ftype: FTYPE.ESCAPE, power: 3, juliaC: null,             view: [-0.82, 0.82, -1.45, 1.45], dual: true,  category: "zoom" },
  // Needs the previous iterate as state, so no perturbation (deep zoom) path
  // -- see perturbationEligibleType.
  "Phoenix":      { ftype: FTYPE.PHOENIX, power: 2, juliaC: null,               view: [-2.0, 0.65, -0.78, 0.78], dual: true,  category: "zoom" },
  "Julia:Rabbit": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.12256, 0.74486], view: [-1.42, 1.42, -1.2, 1.2], dual: false, category: "zoom" },
  "Julia:Dragon": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.4, 0.6],         view: [-1.5, 1.5, -1.1, 1.1],   dual: false, category: "zoom" },
  "Julia:Spiral": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [0.285, 0.01],       view: [-0.95, 0.95, -1.2, 1.2], dual: false, category: "zoom" },
  "Julia:Phoenix": { ftype: FTYPE.PHOENIX, power: 2, juliaC: [0.5667, 0],        view: [-0.8, 0.88, -1.38, 1.38], dual: false, category: "zoom" },
  "Newton z³": { ftype: FTYPE.NEWTON, power: 3, juliaC: null,              view: [-2.0, 2.0, -1.5, 1.5],   dual: false, category: "zoom" },
  // Digit-test fractals (see FRAG_SRC's renderDigitFractal) — defined on
  // the unit square, so centered there with a little margin. power is
  // unused by these but kept non-null for consistency with the others.
  "Carpet":       { ftype: FTYPE.CARPET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, category: "zoom" },
  "Gasket":       { ftype: FTYPE.GASKET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, category: "zoom" },
};
const FRACTAL_NAMES = Object.keys(FRACTAL_CONFIGS);

// "Surprise me" destinations (see teleport()). Keyed by FRACTAL_CONFIGS name,
// not FTYPE: FTYPE.ESCAPE is shared by Mandelbrot, Multibrot³ and the Julia
// presets, whose coordinates mean different things. scale is the view's
// half-height, as everywhere else. Every entry was checked by rendering it
// (not taken on faith): each lands on visible boundary detail at its scale.
// re/im are strings so the source keeps every digit it was given.
const TELEPORT_DESTINATIONS = [
  { fractal: "Mandelbrot", label: "Seahorse Valley", re: "-0.743643887037151", im: "0.131825904205330", scale: 4e-10 },
  { fractal: "Mandelbrot", label: "Elephant Valley", re: "0.2925", im: "0.0165", scale: 6e-3 },
  { fractal: "Mandelbrot", label: "Mini Mandelbrot", re: "-1.7490033809726543", im: "0.0", scale: 2e-12 },
  { fractal: "Mandelbrot", label: "Spiral Cluster", re: "-0.7453", im: "0.1127", scale: 1e-3 },
  { fractal: "Mandelbrot", label: "Feather Valley", re: "-0.774931606245356", im: "-0.13706041474587047", scale: 1e-8 },
  { fractal: "Mandelbrot", label: "Double Spiral", re: "-0.16070135", im: "1.0375665", scale: 5e-7 },
];
// Picker sections, in display order.
const FRACTAL_CATEGORIES = [
  { key: "zoom",    label: "Infinite Zoom" },
  { key: "pattern", label: "Beautiful Patterns" },
];

// Menu entries that switch the whole app mode (Canvas2D vector views, not a
// WebGL shader ftype) rather than selecting a FRACTAL_CONFIGS entry. All are
// in the picker's "pattern" section.
const EXTRA_MODES = [
  { key: "koch", label: "Koch Snowflake", category: "pattern" },
  { key: "tree", label: "Pythagoras Tree", category: "pattern" },
  { key: "dragon", label: "Dragon Curve", category: "pattern" },
  { key: "hilbert", label: "Hilbert Curve", category: "pattern" },
  { key: "gosper", label: "Gosper Curve", category: "pattern" },
  { key: "arrowhead", label: "Sierpinski Arrowhead", category: "pattern" },
  { key: "fern", label: "Barnsley Fern", category: "pattern" },
  { key: "sierpinski", label: "Sierpinski Triangle", category: "pattern" },
  { key: "levy", label: "Lévy C Curve", category: "pattern" },
  { key: "vicsek", label: "Vicsek Fractal", category: "pattern" },
];

// The chaos-game IFS modes (fern.js's IFS_SYSTEMS). They all share one
// view, canvas and control row -- the fern's -- and differ only in which
// transform table that view runs.
const isIfsMode = (m) => Object.prototype.hasOwnProperty.call(IFS_SYSTEMS, m);
// Likewise the L-system line curves (dragon.js's LINE_CURVES) share the
// dragon's view, canvas and control row.
const isCurveMode = (m) => Object.prototype.hasOwnProperty.call(LINE_CURVES, m);

// Deepest level float32 digit extraction stays accurate for, per base --
// see renderDigitFractal in shaders.js for how these were measured.
function digitMaxDepth(ftype) {
  return ftype === FTYPE.CARPET ? 16 : 22;
}

// Carpet/Gasket recursion depth for the current zoom: the deepest level
// whose cells are still at least one device pixel wide, capped at
// digitMaxDepth. Deeper levels are sub-pixel and only produce aliasing
// speckle -- see renderDigitFractal in shaders.js for how the shader colors
// what's below this depth instead.
function digitFractalDepth(ftype, scale, heightPx) {
  const base = ftype === FTYPE.CARPET ? 3 : 2;
  const pixelSize = (scale * 2) / heightPx;
  const d = Math.floor(Math.log(1 / pixelSize) / Math.log(base) + 1e-9);
  return Math.max(1, Math.min(digitMaxDepth(ftype), d));
}

// Suggested maxIter for a view: the slider's 300 default at the fractal's
// own opening scale, plus K per halving of scale past it (deeper views need
// more iterations before boundary points escape). Never below the default
// when zoomed out past the opening view. Rounded to the iter slider's step
// of 10 so the slider can show the exact value. Used while a pane's
// iterAutoLocked is false -- see applyAutoIter.
function suggestedMaxIter(baseScale, currentScale) {
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
function viewFromBounds(b, aspect) {
  const halfW = (b[1] - b[0]) / 2, halfH = (b[3] - b[2]) / 2;
  return { cx: (b[0] + b[1]) / 2, cy: (b[2] + b[3]) / 2, scale: Math.max(halfH, halfW / aspect) };
}

// ---------------------------------------------------------------- Phase 3: deep zoom
// Below this scale, plain float32 starts losing pixels to precision collapse
// (measured on-device at ~5.7e-6 in Phase 1) — switch to perturbation-based
// rendering (see shaders.js) with margin to spare before that point.
const DEEP_ZOOM_THRESHOLD = 1e-3;

// Which fractal types have a perturbation (deep zoom) path -- see
// perturbStep in shaders.js for the per-type delta formulas. Covers both
// parameter-space and Julia mode.
function perturbationEligibleType(state) {
  return state.ftype === FTYPE.ESCAPE || state.ftype === FTYPE.TRICORN || state.ftype === FTYPE.SHIP;
}

// One float64 step of the escape-family map, z <- f(z) + c, in place on the
// 2-element array z (avoids allocating per step in chooseReference's hot
// loop). Must match renderEscapeFast in shaders.js.
function stepOrbit(ftype, power, z, cr, ci) {
  const zr = z[0], zi = z[1];
  if (ftype === FTYPE.SHIP) {
    // (|zr| + i|zi|)^2
    const ar = Math.abs(zr), ai = Math.abs(zi);
    z[0] = ar * ar - ai * ai + cr;
    z[1] = 2 * ar * ai + ci;
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
function computeReferenceOrbit(state, z0r, z0i, cr, ci) {
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
    if (zr * zr + zi * zi > 16.0) break;
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
const REFERENCE_GRID = 32;
function chooseReference(state, widthPx, heightPx) {
  // A candidate point is c in parameter mode, the starting z in Julia mode.
  const z = [0, 0];
  const escapeIter = (pr, pi) => {
    const cr = state.isJulia ? state.juliaC[0] : pr, ci = state.isJulia ? state.juliaC[1] : pi;
    z[0] = state.isJulia ? pr : 0; z[1] = state.isJulia ? pi : 0;
    for (let n = 0; n < state.maxIter; n++) {
      stepOrbit(state.ftype, state.power, z, cr, ci);
      if (z[0] * z[0] + z[1] * z[1] > 16.0) return n;
    }
    return Infinity;
  };
  if (escapeIter(state.cx, state.cy) === Infinity) return { dx: 0, dy: 0 };

  // Same uv -> world mapping as FRAG_SRC's main(), rotation included.
  const rot = state.rotation || 0;
  const rc = Math.cos(rot), rs = Math.sin(rot);
  const halfW = 0.5 * widthPx / heightPx;
  let best = { dx: 0, dy: 0, iter: -1 };
  for (let gy = 0; gy < REFERENCE_GRID; gy++) {
    for (let gx = 0; gx < REFERENCE_GRID; gx++) {
      const uvx = ((gx + 0.5) / REFERENCE_GRID * 2 - 1) * halfW;
      const uvy = ((gy + 0.5) / REFERENCE_GRID * 2 - 1) * 0.5;
      const dx = (uvx * rc - uvy * rs) * state.scale * 2.0;
      const dy = (uvx * rs + uvy * rc) * state.scale * 2.0;
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
function halton(index, base) {
  let f = 1, r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}
const SAMPLE_COUNT = 16;
const SAMPLE_OFFSETS = Array.from({ length: SAMPLE_COUNT }, (_, i) =>
  i === 0 ? [0, 0] : [halton(i, 2) - 0.5, halton(i, 3) - 0.5]);

// ---------------------------------------------------------------- WebGL renderer factory

function createFractalRenderer(canvas) {
  // preserveDrawingBuffer: supersampling blends each new sample into the
  // previous frame's canvas contents, which the browser would otherwise be
  // free to discard after compositing.
  const ctxOpts = { antialias: false, alpha: false, preserveDrawingBuffer: true };
  const gl = canvas.getContext("webgl", ctxOpts)
          || canvas.getContext("experimental-webgl", ctxOpts);
  if (!gl) return null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  // a_pos is pinned to attribute 0 in both programs so they share the
  // quad's vertex-attribute setup below without re-pointing it per draw.
  function link(fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const prog = link(FRAG_SRC);
  const previewProg = link(PREVIEW_FRAG_SRC);
  gl.useProgram(prog);

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const pu = {
    resolution: gl.getUniformLocation(previewProg, "u_resolution"),
    snap: gl.getUniformLocation(previewProg, "u_snap"),
    snapRes: gl.getUniformLocation(previewProg, "u_snapRes"),
    toSnap: gl.getUniformLocation(previewProg, "u_toSnap"),
    snapOffset: gl.getUniformLocation(previewProg, "u_snapOffset"),
  };
  const snapTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, snapTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const u = {
    resolution: gl.getUniformLocation(prog, "u_resolution"),
    center: gl.getUniformLocation(prog, "u_center"),
    scale: gl.getUniformLocation(prog, "u_scale"),
    rotCos: gl.getUniformLocation(prog, "u_rotCos"),
    rotSin: gl.getUniformLocation(prog, "u_rotSin"),
    maxIter: gl.getUniformLocation(prog, "u_maxIter"),
    ftype: gl.getUniformLocation(prog, "u_ftype"),
    power: gl.getUniformLocation(prog, "u_power"),
    isJulia: gl.getUniformLocation(prog, "u_isJulia"),
    juliaC: gl.getUniformLocation(prog, "u_juliaC"),
    phoenixP: gl.getUniformLocation(prog, "u_phoenixP"),
    lut: gl.getUniformLocation(prog, "u_lut"),
    digitDepth: gl.getUniformLocation(prog, "u_digitDepth"),
    digitMaxDepth: gl.getUniformLocation(prog, "u_digitMaxDepth"),
    jitter: gl.getUniformLocation(prog, "u_jitter"),
    usePerturbation: gl.getUniformLocation(prog, "u_usePerturbation"),
    refOrbitTex: gl.getUniformLocation(prog, "u_refOrbitTex"),
    refOrbitLen: gl.getUniformLocation(prog, "u_refOrbitLen"),
    critOffset: gl.getUniformLocation(prog, "u_critOffset"),
    critLen: gl.getUniformLocation(prog, "u_critLen"),
    refTexWidth: gl.getUniformLocation(prog, "u_refTexWidth"),
    refOffset: gl.getUniformLocation(prog, "u_refOffset"),
  };

  const lutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  // CLAMP, not REPEAT: lutColor already cycles with fract(), so the texture
  // never needs to wrap -- and under REPEAT + LINEAR, a lookup at u = 0 (every
  // first-step escape once smoothIter is clamped at 0) blends texel 0 with
  // texel 255, tinting those regions with the colormap's end color.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  function setLUT(bytes) {
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  // Perturbation needs a float texture to hold the reference orbit (each
  // texel a genuine re/im pair, not an 8-bit-quantized color). Feature-detect
  // once; if unavailable, perturbation mode is simply never offered and deep
  // zoom stays capped at the plain float32 ceiling for this renderer.
  const floatTexExt = gl.getExtension("OES_texture_float");
  const refOrbitTex = floatTexExt ? gl.createTexture() : null;
  if (refOrbitTex) {
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  const perturbationSupported = !!refOrbitTex;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    }
    return false;
  }

  // Final draw to the canvas. Sample 0 overwrites; sample k>0 blends in
  // with weight 1/(k+1), which keeps the canvas equal to the running mean of
  // samples 0..k.
  function drawToCanvas(sampleIndex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (sampleIndex > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (sampleIndex + 1));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  }

  // Reference orbit for the current view, reused by that view's
  // supersampling passes instead of re-running chooseReference's grid scan
  // and re-uploading the texture 16 times.
  let refCacheKey = "";
  let refCache = null;

  // sampleIndex selects the sub-pixel offset from SAMPLE_OFFSETS; see there
  // and drawToCanvas for how successive samples accumulate.
  // The view the canvas's current accurate frame was drawn for, and whether
  // the next renderPreview should capture it as a fresh snapshot.
  let lastView = null;
  let snapView = null;
  let needSnapshot = false;

  function render(state, sampleIndex = 0) {
    // A resize clears the canvas, so there's nothing left to blend into.
    if (resize()) sampleIndex = 0;
    if (sampleIndex === 0) {
      lastView = { cx: state.cx, cy: state.cy, scale: state.scale, rotation: state.rotation || 0 };
      needSnapshot = true;
    }
    gl.useProgram(prog);
    const jitter = SAMPLE_OFFSETS[sampleIndex];
    gl.uniform2f(u.jitter, jitter[0], jitter[1]);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.uniform2f(u.center, state.cx, state.cy);
    gl.uniform1f(u.scale, state.scale);
    const rot = state.rotation || 0;
    gl.uniform1f(u.rotCos, Math.cos(rot));
    gl.uniform1f(u.rotSin, Math.sin(rot));
    gl.uniform1i(u.maxIter, state.maxIter | 0);
    gl.uniform1i(u.ftype, state.ftype);
    gl.uniform1f(u.power, state.power);
    gl.uniform1i(u.isJulia, state.isJulia ? 1 : 0);
    gl.uniform2f(u.juliaC, state.juliaC[0], state.juliaC[1]);
    gl.uniform2f(u.phoenixP, PHOENIX_P[0], PHOENIX_P[1]);
    gl.uniform1i(u.digitDepth, digitFractalDepth(state.ftype, state.scale, canvas.height));
    gl.uniform1i(u.digitMaxDepth, digitMaxDepth(state.ftype));

    // See perturbationEligibleType for which types are covered. Also
    // suppressed mid-gesture (see isInteracting) since recomputing the
    // reference orbit every frame during a live pinch/wheel is expensive
    // enough to visibly jank.
    const usePerturbation = perturbationSupported
      && !isInteracting
      && perturbationEligibleType(state)
      && state.scale < DEEP_ZOOM_THRESHOLD;
    gl.uniform1i(u.usePerturbation, usePerturbation ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(u.lut, 0);

    if (!usePerturbation) {
      drawToCanvas(sampleIndex);
      return false;
    }

    const key = [state.ftype, state.cx, state.cy, state.scale, state.rotation || 0,
      state.power, state.maxIter, state.isJulia, state.juliaC[0], state.juliaC[1],
      canvas.width, canvas.height].join(",");
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTex);
    if (key !== refCacheKey) {
      const ref = chooseReference(state, canvas.width, canvas.height);
      const rx = state.cx + ref.dx, ry = state.cy + ref.dy;
      let data, refLen, critOffset, critLen;
      if (state.isJulia) {
        // [view-point orbit | critical orbit] in one texture, see
        // renderEscapePerturbation. At most 2*(maxIter+1) = 4002 texels,
        // within every WebGL device's MAX_TEXTURE_SIZE (4096 minimum in
        // practice).
        const [jr, ji] = state.juliaC;
        const view = computeReferenceOrbit(state, rx, ry, jr, ji);
        const crit = computeReferenceOrbit(state, 0, 0, jr, ji);
        data = new Float32Array(view.data.length + crit.data.length);
        data.set(view.data, 0);
        data.set(crit.data, view.data.length);
        refLen = view.length; critOffset = view.length; critLen = crit.length;
      } else {
        const orbit = computeReferenceOrbit(state, 0, 0, rx, ry);
        data = orbit.data;
        refLen = orbit.length; critOffset = 0; critLen = orbit.length;
      }
      const width = data.length / 4;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, 1, 0, gl.RGBA, gl.FLOAT, data);
      refCache = { dx: ref.dx, dy: ref.dy, refLen, critOffset, critLen, width };
      refCacheKey = key;
    }
    gl.uniform1i(u.refOrbitTex, 1);
    gl.uniform1i(u.refOrbitLen, refCache.refLen);
    gl.uniform1i(u.critOffset, refCache.critOffset);
    gl.uniform1i(u.critLen, refCache.critLen);
    gl.uniform1f(u.refTexWidth, refCache.width);
    gl.uniform2f(u.refOffset, refCache.dx, refCache.dy);
    drawToCanvas(sampleIndex);
    return true;
  }

  // Deep-zoom gesture preview (see renderAll): on the first call after an
  // accurate render, copy the canvas -- still showing that frame, thanks to
  // preserveDrawingBuffer -- into snapTex, then redraw it mapped onto the
  // current view. The mapping is one similarity transform, snapshot uv =
  // k*R(dRot)*uv + offset, with k, dRot and offset computed here in float64
  // from the two views' difference, so it stays exact at any depth.
  function renderPreview(state) {
    if (resize()) needSnapshot = false; // a resize cleared the canvas
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, snapTex);
    if (needSnapshot && lastView) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // RGB, not RGBA: the context has alpha:false, and WebGL rejects
      // copying components the framebuffer doesn't have.
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, canvas.width, canvas.height, 0);
      snapView = { ...lastView, width: canvas.width, height: canvas.height };
      needSnapshot = false;
    }
    if (!snapView) return;

    const k = state.scale / snapView.scale;
    const dRot = (state.rotation || 0) - snapView.rotation;
    const c = Math.cos(dRot) * k, s = Math.sin(dRot) * k;
    const rc = Math.cos(snapView.rotation), rs = Math.sin(snapView.rotation);
    const dx = state.cx - snapView.cx, dy = state.cy - snapView.cy;
    const inv = 1 / (2 * snapView.scale);

    gl.useProgram(previewProg);
    gl.uniform2f(pu.resolution, canvas.width, canvas.height);
    gl.uniform1i(pu.snap, 4);
    gl.uniform2f(pu.snapRes, snapView.width, snapView.height);
    // Column-major: columns (c, s) and (-s, c) = k * rotation by dRot.
    gl.uniformMatrix2fv(pu.toSnap, false, [c, s, -s, c]);
    // R(-snapRotation) * (center - snapCenter) / (2 * snapScale)
    gl.uniform2f(pu.snapOffset, (dx * rc + dy * rs) * inv, (-dx * rs + dy * rc) * inv);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return { canvas, render, renderPreview, setLUT, resize, perturbationSupported, get dpr() { return dpr; } };
}

// ---------------------------------------------------------------- app state

const els = {
  hud: document.getElementById("hud"),
  canvasArea: document.getElementById("canvasArea"),
  mainCanvas: document.getElementById("mainCanvas"),
  juliaCanvas: document.getElementById("juliaCanvas"),
  kochCanvas: document.getElementById("kochCanvas"),
  treeCanvas: document.getElementById("treeCanvas"),
  dragonCanvas: document.getElementById("dragonCanvas"),
  fernCanvas: document.getElementById("fernCanvas"),
  boxRect: document.getElementById("boxZoomRect"),
  crosshair: document.getElementById("crosshair"),
  fractalTypeRow: document.getElementById("fractalTypeRow"),
  fractalControls: document.getElementById("fractalControls"),
  kochControls: document.getElementById("kochControls"),
  treeControls: document.getElementById("treeControls"),
  dragonControls: document.getElementById("dragonControls"),
  fernControls: document.getElementById("fernControls"),
  iterField: document.getElementById("iterField"),
  iterSlider: document.getElementById("iterSlider"),
  colormapBtn: document.getElementById("colormapBtn"),
  dualBtn: document.getElementById("dualBtn"),
  boxZoomBtn: document.getElementById("boxZoomBtn"),
  backBtn: document.getElementById("backBtn"),
  teleportBtn: document.getElementById("teleportBtn"),
  resetBtn: document.getElementById("resetBtn"),
  kochDepthSlider: document.getElementById("kochDepthSlider"),
  kochAnimateBtn: document.getElementById("kochAnimateBtn"),
  kochFillBtn: document.getElementById("kochFillBtn"),
  kochColormapBtn: document.getElementById("kochColormapBtn"),
  kochResetBtn: document.getElementById("kochResetBtn"),
  treeDepthSlider: document.getElementById("treeDepthSlider"),
  treeColormapBtn: document.getElementById("treeColormapBtn"),
  treeResetBtn: document.getElementById("treeResetBtn"),
  dragonDepthSlider: document.getElementById("dragonDepthSlider"),
  dragonColormapBtn: document.getElementById("dragonColormapBtn"),
  dragonResetBtn: document.getElementById("dragonResetBtn"),
  fernPointsSlider: document.getElementById("fernPointsSlider"),
  fernColorBtn: document.getElementById("fernColorBtn"),
  fernColorSwatch: document.getElementById("fernColorSwatch"),
  fernResetBtn: document.getElementById("fernResetBtn"),
  fernBoxZoomBtn: document.getElementById("fernBoxZoomBtn"),
  kochBackBtn: document.getElementById("kochBackBtn"),
  treeBackBtn: document.getElementById("treeBackBtn"),
  dragonBackBtn: document.getElementById("dragonBackBtn"),
  fernBackBtn: document.getElementById("fernBackBtn"),
  shareMenu: document.getElementById("shareMenu"),
  colormapMenu: document.getElementById("colormapMenu"),
  shareSaveBtn: document.getElementById("shareSaveBtn"),
  shareCopyBtn: document.getElementById("shareCopyBtn"),
  shareNativeBtn: document.getElementById("shareNativeBtn"),
};

let mode = "fractal"; // "fractal" | "koch" | "tree" | a LINE_CURVES key ("dragon", ...) | an IFS_SYSTEMS key ("fern", ...)
let colormapIndex = 0;
let currentName = "Mandelbrot";
let dualActive = false;
let boxZoomActive = false;
let fernBoxZoomActive = false; // separate toggle: the fern has its own control row
// Info overlay (#hud): hidden by default, one app-wide toggle shared by every
// mode's control row, so it persists across mode switches.
let hudVisible = false;
let activePane = "main"; // "main" | "julia" — which pane Back/box-zoom targets

// Perturbation rendering runs a CPU reference search (chooseReference) plus
// a heavy full-frame GPU pass — slow on mobile, often 100s of ms at high
// maxIter. The main canvas shows a moving preview (see renderAll) for the whole time
// isInteracting is true, so this delay only affects how soon it snaps back
// to an accurate render after you stop — no correctness risk either way,
// just responsiveness.
let isInteracting = false;
let settleTimer = null;
function markInteracting() {
  isInteracting = true;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    isInteracting = false;
    settleTimer = null;
    applyAutoIter();
    requestRender();
  }, 200);
}

const mainRenderer = createFractalRenderer(els.mainCanvas);
const juliaRenderer = createFractalRenderer(els.juliaCanvas);
const kochView = createKochView(els.kochCanvas);
const treeView = createPythagorasTreeView(els.treeCanvas);
const dragonView = createCurveView(els.dragonCanvas);
const fernView = createIfsView(els.fernCanvas);

if (!mainRenderer) reportError("WebGL context creation failed on mainCanvas — this browser/device may not support WebGL.");
if (!juliaRenderer) reportError("WebGL context creation failed on juliaCanvas.");

// iOS Safari has historically been more willing than desktop browsers to
// silently drop a WebGL context under memory pressure — exactly the kind of
// load a deep-zoom perturbation session creates. There's no cheap way to
// reconstruct every GL resource (buffers, textures, compiled shaders, the
// two-pass FBOs) in place, so rather than risk a half-reinitialized,
// subtly-broken renderer, this does the simple, reliable thing: freeze the
// canvas, tell the user, and reload once the context comes back.
[els.mainCanvas, els.juliaCanvas].forEach((canvas) => {
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    reportError("WebGL context lost (likely memory pressure). Waiting to recover — the page will reload automatically once it does.");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    location.reload();
  });
});

function mainCanvasAspect() {
  const c = els.mainCanvas;
  return c.clientWidth > 0 && c.clientHeight > 0 ? c.clientWidth / c.clientHeight : 1;
}

function freshState(config) {
  const v = viewFromBounds(config.view, mainCanvasAspect());
  return {
    cx: v.cx, cy: v.cy, scale: v.scale, rotation: 0,
    ftype: config.ftype, power: config.power,
    isJulia: config.juliaC !== null,
    juliaC: config.juliaC || [0, 0],
    // Auto iter mode (see applyAutoIter): baseScale is this fractal's
    // opening scale, the zero point of suggestedMaxIter.
    maxIter: suggestedMaxIter(v.scale, v.scale),
    baseScale: v.scale,
    iterAutoLocked: false,
  };
}

// For each pane still in auto iter mode, set maxIter from its zoom level,
// and keep the (single, shared) iter slider showing the active pane's
// value. Called on discrete view changes only -- gesture settle, box zoom,
// Back, fractal select/Reset -- never per frame, so it can't fight a live
// pinch. The slider writes both panes and locks both (see its handler).
// Carpet/Gasket ignore maxIter entirely (usesFixedDepth) and are skipped.
function applyAutoIter() {
  for (const st of [mainState, dualActive ? juliaState : null]) {
    if (!st || st.iterAutoLocked) continue;
    if (st.ftype === FTYPE.CARPET || st.ftype === FTYPE.GASKET) continue;
    st.maxIter = suggestedMaxIter(st.baseScale, st.scale);
  }
  const shown = activePane === "julia" && dualActive && juliaState ? juliaState : mainState;
  els.iterSlider.value = shown.maxIter;
}

let mainState = freshState(FRACTAL_CONFIGS[currentName]);
let juliaState = null; // populated when dual mode is entered
let mainHistory = [];
let juliaHistory = [];

const kochState = { depth: 4, fill: true, animating: false, timer: null };
const treeState = { depth: 9 };
// Each line curve keeps its own depth; dragonState.depth reads/writes the
// one currently shown, so code written for the dragon alone still works.
const curveDepths = Object.fromEntries(Object.entries(LINE_CURVES).map(([k, c]) => [k, c.defaultDepth]));
const dragonState = {
  get depth() { return curveDepths[dragonView.curve]; },
  set depth(v) { curveDepths[dragonView.curve] = v; },
};
const fernState = { count: 1000000, colorIndex: 0 };

function pushHistory(pane) {
  const st = pane === "julia" ? juliaState : mainState;
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  if (!st) return;
  hist.push({ cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation || 0 });
  if (hist.length > 50) hist.shift();
}

function popHistory(pane) {
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  const snap = hist.pop();
  if (!snap) return;
  const st = pane === "julia" ? juliaState : mainState;
  st.cx = snap.cx; st.cy = snap.cy; st.scale = snap.scale; st.rotation = snap.rotation ?? 0;
  applyAutoIter();
  renderAll();
}

// ---------------------------------------------------------------- rendering + layout

function updateLUT() {
  const bytes = buildLUTBytes(COLORMAPS[colormapIndex].stops);
  mainRenderer.setLUT(bytes);
  juliaRenderer.setLUT(bytes);
}

function layoutCanvasArea() {
  const stacked = els.canvasArea.clientWidth < els.canvasArea.clientHeight;
  els.canvasArea.classList.toggle("stacked", dualActive && stacked);
  els.canvasArea.classList.toggle("row", dualActive && !stacked);
}

let lastMainUsedPerturbation = false;

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
function deepZoomEligible(renderer, state) {
  return renderer.perturbationSupported
    && perturbationEligibleType(state)
    && state.scale < DEEP_ZOOM_THRESHOLD;
}

function renderAll() {
  if (mode === "fractal") {
    if (isInteracting && deepZoomEligible(mainRenderer, mainState)) {
      mainRenderer.renderPreview(mainState);
    } else {
      lastMainUsedPerturbation = mainRenderer.render(mainState);
    }

    // The dual-mode Julia pane can be deep-zoomed too (perturbation covers
    // Julia mode), so it gets the same preview while interacting.
    if (dualActive && juliaState) {
      if (isInteracting && deepZoomEligible(juliaRenderer, juliaState)) {
        juliaRenderer.renderPreview(juliaState);
      } else {
        juliaRenderer.render(juliaState);
      }
      positionCrosshair();
    }
    updateHud();
    scheduleRefinement();
  } else if (mode === "koch") {
    kochView.render({ depth: kochState.depth, fill: kochState.fill, colormapIndex });
    updateKochHud();
  } else if (mode === "tree") {
    treeView.render({ depth: treeState.depth, colormapIndex });
    updateTreeHud();
  } else if (isCurveMode(mode)) {
    dragonView.render({ depth: dragonState.depth, colormapIndex });
    updateDragonHud();
  } else {
    fernView.render({
      count: fernState.count,
      colorIndex: fernState.colorIndex,
      isActive: () => mode === fernView.system,
      onProgress: updateFernHud,
    });
    updateFernHud();
  }
}

// Progressive supersampling: after renderAll draws sample 0, add the rest of
// SAMPLE_OFFSETS one per animation frame. Any later renderAll (every gesture
// frame, colormap change, etc.) bumps refineGeneration, which abandons the
// in-flight chain -- the canvas it was blending into was just overwritten
// by a fresh sample 0 for the new view. Skipped while interacting so
// gestures stay at full frame rate; the settle timer's requestRender then
// starts a fresh chain once the view stops moving.
let refineGeneration = 0;
// False from the moment a render starts a refinement chain until that chain
// draws its last sample; share capture waits on it (captureShareBlob).
let refineDone = true;
function scheduleRefinement() {
  const gen = ++refineGeneration;
  refineDone = false;
  if (isInteracting) return;
  let k = 1;
  const step = () => {
    if (gen !== refineGeneration || mode !== "fractal" || isInteracting) return;
    mainRenderer.render(mainState, k);
    if (dualActive && juliaState) juliaRenderer.render(juliaState, k);
    if (++k < SAMPLE_OFFSETS.length) requestAnimationFrame(step);
    else refineDone = true;
  };
  requestAnimationFrame(step);
}

let renderPending = false;
function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderAll(); });
}

// Only shown when non-zero — no reset-to-north button on any mode, so this
// is the only feedback that a two-finger twist has rotated the view at all.
// Shared by every mode's HUD (WebGL fractal + all four Canvas2D vector
// views) since they all support the same twist gesture.
function rotationHudText(rotation) {
  const rotDeg = (rotation || 0) * 180 / Math.PI;
  return Math.abs(rotDeg) > 0.5 ? `   rotation: ${rotDeg.toFixed(0)}°` : "";
}

// Name goes in the bold headline line, everything else in the muted
// monospace stats block beneath it (see #hud in index.html).
function setHud(name, stats) {
  els.hud.querySelector(".hudName").textContent = name;
  els.hud.querySelector(".hudStats").textContent = stats;
}

// Plain decimals while zoomed out (scale >= DEEP_ZOOM_THRESHOLD), where
// "-0.75 + 0.00i / 1.25" reads better than exponents; full-precision
// scientific notation once in deep-zoom territory, where the digits are
// the point.
function formatHudCoords(cx, cy, scale) {
  if (scale < DEEP_ZOOM_THRESHOLD) {
    return {
      center: `${cx.toExponential(5)} + ${cy.toExponential(5)}i`,
      scale: scale.toExponential(3),
    };
  }
  // 2 decimals at scale ~1, one more per decade of zoom, capped at 4.
  const decimals = Math.min(4, Math.max(2, Math.ceil(-Math.log10(scale)) + 1));
  const fmt = (v) => {
    let t = v.toFixed(decimals);
    // Trim trailing zeros, but keep at least 2 decimals (0.00, not 0).
    while (t.length - t.indexOf(".") - 1 > 2 && t.endsWith("0")) t = t.slice(0, -1);
    return t.replace(/^-(0\.0+)$/, "$1"); // no "-0.00"
  };
  return {
    center: `${fmt(cx)} + ${fmt(cy)}i`,
    scale: String(Number(scale.toPrecision(3))),
  };
}

function updateHud() {
  const s = mainState;
  const eligibleType = perturbationEligibleType(s);
  const deepZoomEligible = mainRenderer.perturbationSupported && eligibleType && s.scale < DEEP_ZOOM_THRESHOLD;
  let precision = "float32";
  if (isInteracting && deepZoomEligible) {
    precision = "preview (renders at deep zoom once you stop)";
  } else if (lastMainUsedPerturbation) {
    precision = "perturbation (deep zoom)";
  } else if (s.scale < DEEP_ZOOM_THRESHOLD) {
    if (!mainRenderer.perturbationSupported) {
      precision = "float32 (deep zoom unavailable: no float texture support)";
    } else if (!eligibleType) {
      precision = "float32 (deep zoom unsupported for this fractal type)";
    }
  }
  const rotText = rotationHudText(s.rotation);
  // Carpet/Gasket ignore the iter slider entirely (zoom-derived depth in
  // the shader) — showing "maxIter: 300" would misleadingly imply it still
  // does something, the same mismatch that caused the coloring bug.
  const usesFixedDepth = s.ftype === FTYPE.CARPET || s.ftype === FTYPE.GASKET;
  const iterText = usesFixedDepth
    ? `depth: ${digitFractalDepth(s.ftype, s.scale, mainRenderer.canvas.height)} (auto)`
    : `maxIter: ${s.maxIter}${s.iterAutoLocked ? "" : " (auto)"}`;
  const f = formatHudCoords(s.cx, s.cy, s.scale);
  setHud(currentName,
    `center: ${f.center}\n` +
    `scale: ${f.scale}   ${iterText}   precision: ${precision}${rotText}` +
    `${dualActive ? "   [dual mode — tap left pane to set Julia c]" : ""}`);
}

function updateKochHud() {
  setHud("Koch Snowflake", `depth: ${kochState.depth}   ${kochState.fill ? "filled" : "outline"}${rotationHudText(kochView.view.rotation)}`);
}

function updateTreeHud() {
  setHud("Pythagoras Tree", `depth: ${treeState.depth}${rotationHudText(treeView.view.rotation)}`);
}

function updateDragonHud() {
  setHud(LINE_CURVES[dragonView.curve].label, `depth: ${dragonState.depth}${rotationHudText(dragonView.view.rotation)}`);
}

function updateFernHud() {
  // accepted = points actually on screen so far; it climbs toward the
  // target as refinement runs, and resets on every pan/zoom.
  setHud(IFS_SYSTEMS[fernView.system].label, `points: ${fernView.accepted.toLocaleString()} / ${fernState.count.toLocaleString()}${rotationHudText(fernView.view.rotation)}`);
}

function positionCrosshair() {
  if (!dualActive) { els.crosshair.classList.add("hidden"); return; }
  const [sx, sy] = screenToComplexInverse(mainRenderer, mainState, mainState.juliaC);
  const rect = els.mainCanvas.getBoundingClientRect();
  els.crosshair.classList.remove("hidden");
  els.crosshair.style.left = `${rect.left + sx}px`;
  els.crosshair.style.top = `${rect.top + sy}px`;
}

// world (complex) -> screen (CSS px, relative to canvas's own client rect)
function screenToComplexInverse(renderer, state, world) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const wx = (world[0] - state.cx) / (state.scale * 2.0);
  const wy = (world[1] - state.cy) / (state.scale * 2.0);
  const rot = -(state.rotation || 0); // inverse of screenToComplex's rotation
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const uvx = wx * cos - wy * sin;
  const uvy = wx * sin + wy * cos;
  const sx = (uvx * canvas.height + 0.5 * canvas.width) / dpr;
  const sy = (0.5 * canvas.height - uvy * canvas.height) / dpr;
  return [sx, sy];
}

function screenToComplex(renderer, state, sx, sy) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const uvx = (sx * dpr - 0.5 * canvas.width) / canvas.height;
  const uvy = (0.5 * canvas.height - sy * dpr) / canvas.height;
  const rot = state.rotation || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  // Rotate the screen-space offset into world axes before scaling — must
  // stay in sync with FRAG_SRC's identical rotation of uv, or the rendered
  // fractal and every pointer/gesture computation that goes through this
  // function (pan, box-zoom, the Julia-c crosshair) disagree about "up".
  const wx = uvx * cos - uvy * sin;
  const wy = uvx * sin + uvy * cos;
  return { x: state.cx + wx * state.scale * 2.0, y: state.cy + wy * state.scale * 2.0 };
}

// Wraps an angle to (-PI, PI]. cos/sin are periodic, so this never changes
// what's rendered (rotation=720deg looks identical to 0deg either way) —
// it's purely for the HUD display, which otherwise showed "720deg" instead
// of wrapping back toward 0deg after a couple of full spins, and to keep
// the rotation's cos/sin (computed on the CPU for the shader's
// u_rotCos/u_rotSin) operating on a bounded input rather than one that
// grows without limit over a long session.
function normalizeAngle(a) {
  return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// Inverse of screenToComplex, solved for (cx, cy): the center a view would
// need so that local screen point (sx, sy) maps exactly to world point
// (targetX, targetY) at the view's current scale/rotation. This is the
// "grab a point and drag it" primitive — pan uses it directly, and it's
// what the pinch/wheel zoom's before/after-diff anchoring is equivalent to.
function centerForAnchor(renderer, state, sx, sy, targetX, targetY) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const uvx = (sx * dpr - 0.5 * canvas.width) / canvas.height;
  const uvy = (0.5 * canvas.height - sy * dpr) / canvas.height;
  const rot = state.rotation || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const wx = uvx * cos - uvy * sin;
  const wy = uvx * sin + uvy * cos;
  return { cx: targetX - wx * state.scale * 2.0, cy: targetY - wy * state.scale * 2.0 };
}

// ---------------------------------------------------------------- fractal-type / mode switching

function selectFractal(name) {
  cancelTeleport();
  currentName = name;
  const config = FRACTAL_CONFIGS[name];
  mainState = freshState(config);
  mainHistory = [];
  juliaHistory = [];
  // Same reasoning as exitDual(): juliaHistory was just cleared above, so
  // if activePane was left on "julia" from before this switch, Back would
  // try to pop an empty array and silently do nothing.
  activePane = "main";
  if (dualActive && !config.dual) dualActive = false;
  if (dualActive) enterDual();
  els.dualBtn.disabled = !config.dual;
  els.dualBtn.classList.toggle("active", dualActive);
  // Zoom-only tools. Everything in FRACTAL_CONFIGS is "zoom" today, but the
  // category is the rule; teleport also needs curated destinations, which
  // a new zoom fractal may not have yet.
  const isZoom = config.category === "zoom";
  els.boxZoomBtn.classList.toggle("hidden", !isZoom);
  els.teleportBtn.classList.toggle("hidden", !isZoom || !TELEPORT_DESTINATIONS.some((d) => d.fractal === name));
  // Carpet/Gasket use a zoom-derived depth (see FRAG_SRC) — the iter slider does
  // nothing for them, and leaving it enabled implied otherwise, which is
  // exactly the mismatch that made them render as almost solid black
  // before that was caught and fixed.
  const usesFixedDepth = config.ftype === FTYPE.CARPET || config.ftype === FTYPE.GASKET;
  els.iterSlider.disabled = usesFixedDepth;
  els.iterField.classList.toggle("hidden", usesFixedDepth);
  els.juliaCanvas.classList.toggle("hidden", !dualActive);
  if (!dualActive) els.crosshair.classList.add("hidden");
  layoutCanvasArea();
  setMode("fractal");
  // Refit now that layout is final: freshState ran above while the canvas
  // could still be hidden (coming from a vector mode) or about to change
  // size (Julia pane / iter slider shown or hidden). setMode only schedules
  // the render, so it picks this up.
  const fitted = viewFromBounds(config.view, mainCanvasAspect());
  Object.assign(mainState, fitted, { baseScale: fitted.scale });
  // Fresh fractal (or Reset, which is selectFractal) = fresh auto iter mode.
  applyAutoIter();
}

function enterDual() {
  const config = FRACTAL_CONFIGS[currentName];
  if (!config.dual) return;
  dualActive = true;
  juliaState = {
    cx: 0, cy: 0, scale: mainState.scale, rotation: 0,
    ftype: mainState.ftype, power: mainState.power,
    isJulia: true, juliaC: [mainState.cx, mainState.cy],
    maxIter: mainState.maxIter,
    // The slider drives both panes, so a manual lock carries over; auto
    // mode counts zoom from this pane's own opening scale.
    baseScale: mainState.scale,
    iterAutoLocked: mainState.iterAutoLocked,
  };
  mainState.juliaC = [juliaState.juliaC[0], juliaState.juliaC[1]];
  juliaHistory = [];
  els.juliaCanvas.classList.remove("hidden");
  layoutCanvasArea();
  requestRender();
}

function exitDual() {
  dualActive = false;
  // Without this, Back (popHistory(activePane)) silently pops the now-
  // hidden juliaState/juliaHistory if the julia pane was the last one
  // touched -- nothing visibly changes, so Back appears dead until the
  // main canvas is tapped again (which resets activePane itself).
  activePane = "main";
  els.juliaCanvas.classList.add("hidden");
  els.crosshair.classList.add("hidden");
  layoutCanvasArea();
  requestRender();
}

function setMode(next) {
  mode = next;
  els.fractalTypeRow.classList.remove("open"); // collapse the picker on any mode switch
  els.shareMenu.classList.remove("open");
  els.colormapMenu.classList.remove("open");
  els.fractalControls.classList.toggle("hidden", mode !== "fractal");
  els.kochControls.classList.toggle("hidden", mode !== "koch");
  els.treeControls.classList.toggle("hidden", mode !== "tree");
  els.dragonControls.classList.toggle("hidden", !isCurveMode(mode));
  els.fernControls.classList.toggle("hidden", !isIfsMode(mode));
  els.mainCanvas.classList.toggle("hidden", mode !== "fractal");
  els.juliaCanvas.classList.toggle("hidden", mode !== "fractal" || !dualActive);
  els.kochCanvas.classList.toggle("hidden", mode !== "koch");
  els.treeCanvas.classList.toggle("hidden", mode !== "tree");
  els.dragonCanvas.classList.toggle("hidden", !isCurveMode(mode));
  if (isCurveMode(mode)) {
    // Same sharing as the IFS modes below, plus the depth slider, whose
    // range is per curve.
    if (dragonView.curve !== mode) {
      dragonView.setCurve(mode);
      dragonNav.clearHistory();
    }
    els.dragonDepthSlider.min = LINE_CURVES[mode].minDepth || 0;
    els.dragonDepthSlider.max = LINE_CURVES[mode].maxDepth;
    els.dragonDepthSlider.value = dragonState.depth;
  }
  els.fernCanvas.classList.toggle("hidden", !isIfsMode(mode));
  // The IFS modes share fernView: point it at this mode's transforms (it
  // keeps each one's pan/zoom). Back history belongs to the previous one.
  if (isIfsMode(mode) && fernView.system !== mode) {
    fernView.setSystem(mode);
    fernNav.clearHistory();
  }
  // First visit to a vector mode: fit its view now that its canvas is
  // visible and has a real size (later visits keep wherever you left it).
  if (mode !== "fractal" && !fittedVectorModes.has(mode)) fitVectorView(mode);
  updateMenuActiveState();
  requestRender();
}

// Highlights whichever hamburger-menu entry matches the current mode/
// selection — a FRACTAL_CONFIGS entry (dataset.name) only counts while in
// fractal mode, an EXTRA_MODES entry (dataset.mode) whenever mode matches it.
function updateMenuActiveState() {
  els.fractalTypeRow.querySelectorAll("button").forEach((btn) => {
    const isActive = btn.dataset.mode
      ? btn.dataset.mode === mode
      : mode === "fractal" && btn.dataset.name === currentName;
    btn.classList.toggle("active", isActive);
  });
}

// ---------------------------------------------------------------- interaction: fractal canvases

function attachFractalInteraction(canvas, getState, paneName, renderer) {
  const pointers = new Map();
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartScale = null;
  let pinchStartAngle = null;
  let pinchStartRotation = null;
  let downPos = null;
  let lastZoomPush = 0;
  // True for the whole span from a second finger touching down until every
  // finger has lifted — guards the tap-to-set-Julia-c check below, which
  // otherwise fires on the LAST finger of a pinch/rotate to release: downPos
  // gets overwritten by every pointerdown (not tracked per-pointer), so once
  // the first finger lifts, the remaining (second) finger's release is
  // checked against ITS OWN down position, and a finger that acted as a
  // relatively stationary pinch/rotate anchor can easily stay under the 6px
  // tap threshold from where IT went down, even though a real two-finger
  // gesture happened.
  let multiTouch = false;

  function screenToWorldHere(sx, sy) {
    return screenToComplex(renderer, getState(), sx, sy);
  }

  // screenToComplex expects coordinates relative to this canvas's own
  // top-left corner, but pointer/wheel events report page-relative
  // clientX/clientY — the canvas isn't flush with the page origin (the HUD
  // sits above it, and in dual mode the Julia pane sits beside/below it), so
  // this offset must be subtracted before any zoom-anchoring math.
  function toLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    cancelTeleport();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) multiTouch = true;
    activePane = paneName;
    downPos = { x: e.clientX, y: e.clientY };

    if (boxZoomActive) {
      // The main canvas can be showing a frozen, stale frame if this drag
      // starts while a previous gesture's settle delay hasn't fired yet
      // (see markInteracting/renderAll) — force it caught up to the actual
      // current state first, so the box is always drawn on top of exactly
      // the pixels commitBoxZoom's math will use.
      if (isInteracting) {
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
        isInteracting = false;
        renderAll();
      }
      // boxRect is position:fixed, so its geometry lives entirely in
      // viewport (clientX/clientY) coordinates during the drag — storing
      // the start point here and reusing it directly in pointermove avoids
      // re-deriving it via a fresh canvas rect on every move, which used to
      // drift the box whenever the canvas's on-screen position shifted
      // mid-drag (e.g. Safari's toolbar collapsing/expanding).
      els.boxRect.classList.remove("hidden");
      els.boxRect.dataset.pane = paneName;
      els.boxRect.dataset.startClientX = e.clientX;
      els.boxRect.dataset.startClientY = e.clientY;
      els.boxRect.style.left = `${e.clientX}px`;
      els.boxRect.style.top = `${e.clientY}px`;
      els.boxRect.style.width = "0px";
      els.boxRect.style.height = "0px";
      return;
    }

    if (pointers.size === 1) {
      // Anchor on the world point under the finger, not a screen-space
      // delta from it — a delta-based pan doesn't generalize to a rotated
      // view (see centerForAnchor), and this is exact regardless of
      // rotation.
      const local = toLocal(e.clientX, e.clientY);
      const world = screenToWorldHere(local.x, local.y);
      panStart = { worldX: world.x, worldY: world.y };
      // Pinch/wheel/box-zoom all push a history checkpoint before they
      // change the view; a plain one-finger drag never did, so Back after
      // zoom -> drag skipped straight past the drag to the pre-zoom state,
      // silently discarding the pan. Matches the pinch branch below exactly
      // (push immediately at gesture start, before any movement).
      pushHistory(paneName);
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScale = getState().scale;
      pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchStartRotation = getState().rotation || 0;
      pushHistory(paneName);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (boxZoomActive && els.boxRect.dataset.pane === paneName && !els.boxRect.classList.contains("hidden")) {
      const startClientX = parseFloat(els.boxRect.dataset.startClientX);
      const startClientY = parseFloat(els.boxRect.dataset.startClientY);
      const left = Math.min(startClientX, e.clientX);
      const top = Math.min(startClientY, e.clientY);
      els.boxRect.style.left = `${left}px`;
      els.boxRect.style.top = `${top}px`;
      els.boxRect.style.width = `${Math.abs(e.clientX - startClientX)}px`;
      els.boxRect.style.height = `${Math.abs(e.clientY - startClientY)}px`;
      return;
    }

    const st = getState();
    if (pointers.size === 1 && panStart) {
      const local = toLocal(e.clientX, e.clientY);
      const anchored = centerForAnchor(renderer, st, local.x, local.y, panStart.worldX, panStart.worldY);
      st.cx = anchored.cx;
      st.cy = anchored.cy;
      markInteracting();
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midClient = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const mid = toLocal(midClient.x, midClient.y);
      const before = screenToWorldHere(mid.x, mid.y);
      st.scale = pinchStartScale * (pinchStartDist / Math.max(dist, 1));
      // Two-finger twist: rotate by however much the finger-pair's angle has
      // changed since the gesture started. Setting rotation here, before
      // recomputing `after`, means the existing before/after anchor trick
      // below keeps the midpoint under the fingers stable under combined
      // pinch+rotate, exactly like it already does for pinch+pan.
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      st.rotation = normalizeAngle(pinchStartRotation + (angle - pinchStartAngle));
      const after = screenToWorldHere(mid.x, mid.y);
      st.cx += before.x - after.x;
      st.cy += before.y - after.y;
      markInteracting();
      requestRender();
    }
  });

  function release(e) {
    if (boxZoomActive && els.boxRect.dataset.pane === paneName && !els.boxRect.classList.contains("hidden")) {
      commitBoxZoom(paneName, getState(), renderer, canvas);
      els.boxRect.classList.add("hidden");
      pointers.delete(e.pointerId);
      return;
    }

    // Tap-to-set-Julia-c: only on the main pane while dual mode is active,
    // only if the pointer barely moved (a click, not a drag), and only
    // outside a multi-touch gesture -- downPos isn't tracked per-pointer,
    // so without the multiTouch guard the last finger to lift from a
    // pinch/rotate gets checked against its OWN down position and can read
    // as a "tap" even though two fingers were down (see multiTouch's
    // comment above).
    if (paneName === "main" && dualActive && downPos && pointers.size === 1 && !multiTouch) {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved < 6) {
        const local = toLocal(e.clientX, e.clientY);
        const world = screenToWorldHere(local.x, local.y);
        pushHistory("julia");
        juliaState.juliaC = [world.x, world.y];
        mainState.juliaC = [world.x, world.y];
        requestRender();
      }
    }

    pointers.delete(e.pointerId);
    if (pointers.size === 0) multiTouch = false;
    if (pointers.size === 1) {
      const [p] = pointers.values();
      const local = toLocal(p.x, p.y);
      const world = screenToWorldHere(local.x, local.y);
      panStart = { worldX: world.x, worldY: world.y };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
    pinchStartAngle = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (boxZoomActive) return;
    cancelTeleport();
    activePane = paneName;
    const now = performance.now();
    if (now - lastZoomPush > 400) { pushHistory(paneName); lastZoomPush = now; }
    const st = getState();
    const local = toLocal(e.clientX, e.clientY);
    const before = screenToWorldHere(local.x, local.y);
    st.scale *= Math.exp(e.deltaY * 0.0015);
    const after = screenToWorldHere(local.x, local.y);
    st.cx += before.x - after.x;
    st.cy += before.y - after.y;
    markInteracting();
    requestRender();
  }, { passive: false });
}

function commitBoxZoom(paneName, state, renderer, canvas) {
  const rect = canvas.getBoundingClientRect();
  const left = parseFloat(els.boxRect.style.left) - rect.left;
  const top = parseFloat(els.boxRect.style.top) - rect.top;
  const w = parseFloat(els.boxRect.style.width);
  const h = parseFloat(els.boxRect.style.height);
  if (w < 4 || h < 4) return;

  // Center: the world point under the box's screen-center. A single-point
  // query through screenToComplex is exact at any rotation.
  const centerPoint = screenToComplex(renderer, state, left + w / 2, top + h / 2);

  // Half-extents: derived from the box's on-screen size and the current
  // scale directly, NOT from subtracting two rotated corners (c2 - c1) —
  // rotation is a rigid transform, so it doesn't change how many world
  // units a screen pixel spans, but it does rotate the corner-difference
  // vector, which would silently distort this if rotation is nonzero.
  // (Reduces to the exact previous corner-difference formula at rotation=0,
  // verified by hand before this was shipped.)
  const dpr = renderer.dpr;
  const halfW = (w / 2) * dpr / canvas.height * state.scale * 2.0;
  const halfH = (h / 2) * dpr / canvas.height * state.scale * 2.0;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const newScale = Math.max(halfH, halfW / Math.max(aspect, 1e-6));

  pushHistory(paneName);
  const cx = centerPoint.x, cy = centerPoint.y;
  // rotation is intentionally left unchanged — box-zoom reframes, it
  // doesn't reorient
  state.cx = cx; state.cy = cy; state.scale = newScale;
  applyAutoIter();
  requestRender();
}

attachFractalInteraction(els.mainCanvas, () => mainState, "main", mainRenderer);
attachFractalInteraction(els.juliaCanvas, () => juliaState, "julia", juliaRenderer);

// ---------------------------------------------------------------- interaction: Koch canvas

// Shared pan/pinch-zoom/wheel-zoom for any Canvas2D vector view (Koch,
// Pythagoras tree) — both createKochView() and createPythagorasTreeView()
// return the same shape ({view, dpr, screenToWorld, ...}), so this one
// function covers both instead of duplicating the gesture logic per mode,
// the way attachFractalInteraction is the single shared handler for the
// two WebGL canvases.
// isBoxZoomActive (optional): when it returns true, a one-finger drag draws
// the shared #boxZoomRect and zooms to it on release instead of panning --
// the vector-view analog of the WebGL panes' box zoom (commitBoxZoom).
//
// Returns { back, clearHistory, checkpoint }: each vector view keeps its own
// pan/zoom history stack, checkpointed at the same moments
// attachFractalInteraction pushes for the WebGL panes (one-finger drag
// start, pinch start, wheel zoom throttled to one checkpoint per 400ms
// burst, box-zoom commit). checkpoint() is that same throttled push, for
// keyboard navigation.
function attachVectorViewInteraction(canvas, vectorView, isBoxZoomActive = () => false) {
  const pointers = new Map();
  const history = [];
  let lastWheelPush = 0;
  function pushViewHistory() {
    const v = vectorView.view;
    history.push({ cx: v.cx, cy: v.cy, halfHeight: v.halfHeight, rotation: v.rotation || 0 });
    if (history.length > 50) history.shift();
  }
  function back() {
    const snap = history.pop();
    if (!snap) return;
    Object.assign(vectorView.view, snap);
    requestRender();
  }
  const boxPane = `vector:${canvas.id}`;
  const boxDragging = () => isBoxZoomActive()
    && els.boxRect.dataset.pane === boxPane && !els.boxRect.classList.contains("hidden");

  // Same rotation-safe construction as commitBoxZoom: the new center is the
  // world point under the box's screen-center (one screenToWorld query,
  // exact at any rotation), and the new half-height comes from the box's
  // on-screen size, never from differencing two rotated corners. Rotation
  // is left unchanged -- box zoom reframes, it doesn't reorient.
  function commitVectorBoxZoom() {
    const rect = canvas.getBoundingClientRect();
    const w = parseFloat(els.boxRect.style.width);
    const h = parseFloat(els.boxRect.style.height);
    if (w < 4 || h < 4) return;
    const dpr = vectorView.dpr;
    const sx = (parseFloat(els.boxRect.style.left) - rect.left + w / 2) * dpr;
    const sy = (parseFloat(els.boxRect.style.top) - rect.top + h / 2) * dpr;
    const [cx, cy] = vectorView.screenToWorld(sx, sy);
    // halfHeight world units span canvas.height/2 device pixels.
    const unitsPerPx = vectorView.view.halfHeight / (canvas.height / 2);
    const halfH = (h / 2) * dpr * unitsPerPx;
    const halfW = (w / 2) * dpr * unitsPerPx;
    const aspect = canvas.width / canvas.height;
    pushViewHistory();
    vectorView.view.cx = cx;
    vectorView.view.cy = cy;
    vectorView.view.halfHeight = Math.max(halfH, halfW / Math.max(aspect, 1e-6));
    requestRender();
  }
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartHalfHeight = null;
  let pinchStartAngle = null;
  let pinchStartRotation = null;

  // Given a canvas-pixel (dpr-scaled) screen point and the world point that
  // should end up under it, solves for the view center that makes that so
  // — the vector-view analog of centerForAnchor above, needed once these
  // views can rotate (a plain screen-delta pan, which this replaced,
  // doesn't generalize to a rotated view for the same reason
  // centerForAnchor's own comment gives).
  function centerForVectorAnchor(sx, sy, targetX, targetY) {
    const uvx = (sx - canvas.width / 2) / (canvas.height / 2);
    const uvy = (canvas.height / 2 - sy) / (canvas.height / 2);
    const rot = vectorView.view.rotation || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const wx = uvx * cos - uvy * sin;
    const wy = uvx * sin + uvy * cos;
    return {
      cx: targetX - wx * vectorView.view.halfHeight,
      cy: targetY - wy * vectorView.view.halfHeight,
    };
  }

  function localPixel(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * vectorView.dpr, y: (clientY - rect.top) * vectorView.dpr };
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isBoxZoomActive() && pointers.size === 1) {
      // Same viewport-coordinate bookkeeping as the WebGL panes' box zoom
      // (see attachFractalInteraction's pointerdown for why).
      els.boxRect.classList.remove("hidden");
      els.boxRect.dataset.pane = boxPane;
      els.boxRect.dataset.startClientX = e.clientX;
      els.boxRect.dataset.startClientY = e.clientY;
      els.boxRect.style.left = `${e.clientX}px`;
      els.boxRect.style.top = `${e.clientY}px`;
      els.boxRect.style.width = "0px";
      els.boxRect.style.height = "0px";
      return;
    }
    if (pointers.size === 1) {
      const p = localPixel(e.clientX, e.clientY);
      const world = vectorView.screenToWorld(p.x, p.y);
      panStart = { worldX: world[0], worldY: world[1] };
      pushViewHistory();
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartHalfHeight = vectorView.view.halfHeight;
      pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchStartRotation = vectorView.view.rotation || 0;
      pushViewHistory();
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (boxDragging()) {
      const startClientX = parseFloat(els.boxRect.dataset.startClientX);
      const startClientY = parseFloat(els.boxRect.dataset.startClientY);
      els.boxRect.style.left = `${Math.min(startClientX, e.clientX)}px`;
      els.boxRect.style.top = `${Math.min(startClientY, e.clientY)}px`;
      els.boxRect.style.width = `${Math.abs(e.clientX - startClientX)}px`;
      els.boxRect.style.height = `${Math.abs(e.clientY - startClientY)}px`;
      return;
    }
    if (pointers.size === 1 && panStart) {
      const p = localPixel(e.clientX, e.clientY);
      const anchored = centerForVectorAnchor(p.x, p.y, panStart.worldX, panStart.worldY);
      vectorView.view.cx = anchored.cx;
      vectorView.view.cy = anchored.cy;
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = canvas.getBoundingClientRect();
      const midX = ((pts[0].x + pts[1].x) / 2 - rect.left) * vectorView.dpr;
      const midY = ((pts[0].y + pts[1].y) / 2 - rect.top) * vectorView.dpr;
      const before = vectorView.screenToWorld(midX, midY);
      vectorView.view.halfHeight = pinchStartHalfHeight * (pinchStartDist / Math.max(dist, 1));
      // Two-finger twist, same convention as attachFractalInteraction:
      // set rotation before recomputing `after` so the before/after anchor
      // trick keeps the midpoint stable under combined pinch+rotate.
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      vectorView.view.rotation = normalizeAngle(pinchStartRotation + (angle - pinchStartAngle));
      const after = vectorView.screenToWorld(midX, midY);
      vectorView.view.cx += before[0] - after[0];
      vectorView.view.cy += before[1] - after[1];
      requestRender();
    }
  });

  function release(e) {
    if (boxDragging()) {
      commitVectorBoxZoom();
      els.boxRect.classList.add("hidden");
      pointers.delete(e.pointerId);
      return;
    }
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [p] = pointers.values();
      const local = localPixel(p.x, p.y);
      const world = vectorView.screenToWorld(local.x, local.y);
      panStart = { worldX: world[0], worldY: world[1] };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
    pinchStartAngle = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function checkpoint() {
    const now = performance.now();
    if (now - lastWheelPush > 400) { pushViewHistory(); lastWheelPush = now; }
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (isBoxZoomActive()) return;
    checkpoint();
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * vectorView.dpr;
    const sy = (e.clientY - rect.top) * vectorView.dpr;
    const before = vectorView.screenToWorld(sx, sy);
    vectorView.view.halfHeight *= Math.exp(e.deltaY * 0.0015);
    const after = vectorView.screenToWorld(sx, sy);
    vectorView.view.cx += before[0] - after[0];
    vectorView.view.cy += before[1] - after[1];
    requestRender();
  }, { passive: false });

  return { back, checkpoint, clearHistory: () => { history.length = 0; } };
}

// The region each vector view shows in full when its mode first opens and
// on Reset: the measured extent of its geometry plus a small margin, fitted
// to the canvas aspect with the same viewFromBounds the WebGL fractals use
// (a fixed zoom level cut the sides off wide shapes on portrait phones).
// Koch spans x +-0.866, y +-1; the tree (depth 12) x +-2.95, y 0..3.95; the
// fern FERN_BOUNDS. The dragon rotates 45 degrees per depth level, so a
// box covering every depth would open it badly zoomed out -- it's fitted
// to the current depth instead.
function vectorViewBox(modeKey) {
  if (modeKey === "koch") return [-0.95, 0.95, -1.08, 1.08];
  if (modeKey === "tree") return [-3.1, 3.1, -0.15, 4.1];
  if (modeKey === "fern") return [-2.4, 2.9, -0.2, 10.25];
  if (isIfsMode(modeKey)) {
    const [x0, x1, y0, y1] = ifsData(modeKey).bounds;
    const m = 0.04 * Math.max(x1 - x0, y1 - y0);
    return [x0 - m, x1 + m, y0 - m, y1 + m];
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of LINE_CURVES[modeKey].points(dragonState.depth)) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const m = 0.06 * Math.max(x1 - x0, y1 - y0);
  return [x0 - m, x1 + m, y0 - m, y1 + m];
}

const VECTOR_VIEWS = {
  koch: [kochView, els.kochCanvas], tree: [treeView, els.treeCanvas],
  dragon: [dragonView, els.dragonCanvas], fern: [fernView, els.fernCanvas],
  sierpinski: [fernView, els.fernCanvas], levy: [fernView, els.fernCanvas],
  vicsek: [fernView, els.fernCanvas],
  hilbert: [dragonView, els.dragonCanvas], gosper: [dragonView, els.dragonCanvas],
  arrowhead: [dragonView, els.dragonCanvas],
};
const fittedVectorModes = new Set();
function fitVectorView(modeKey) {
  const [vectorView, canvas] = VECTOR_VIEWS[modeKey];
  const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
  const v = viewFromBounds(vectorViewBox(modeKey), aspect);
  Object.assign(vectorView.view, { cx: v.cx, cy: v.cy, halfHeight: v.scale, rotation: 0 });
  fittedVectorModes.add(modeKey);
}

const kochNav = attachVectorViewInteraction(els.kochCanvas, kochView);
const treeNav = attachVectorViewInteraction(els.treeCanvas, treeView);
const dragonNav = attachVectorViewInteraction(els.dragonCanvas, dragonView);
const fernNav = attachVectorViewInteraction(els.fernCanvas, fernView, () => fernBoxZoomActive);
els.kochBackBtn.addEventListener("click", () => kochNav.back());
els.treeBackBtn.addEventListener("click", () => treeNav.back());
els.dragonBackBtn.addEventListener("click", () => dragonNav.back());
els.fernBackBtn.addEventListener("click", () => fernNav.back());

// ---------------------------------------------------------------- interaction: keyboard

// Desktop keyboard navigation for every mode: arrows pan, Shift+Left/Right
// rotate (Google Maps' convention; Ctrl+arrows switch Spaces on macOS),
// +/- zoom about the center, R resets. Everything is expressed in screen
// terms and mapped through the view's own screen-to-world function, so
// "up" is always screen-up however the view is rotated. Held keys
// auto-repeat; history is checkpointed once per 400ms burst, like the
// wheel, so one Back undoes a whole held-key move.
const KEY_PAN_FRACTION = 0.1;              // of the canvas's shorter side
const KEY_ZOOM_FACTOR = 1.25;
const KEY_ROTATE_STEP = 5 * Math.PI / 180; // + is clockwise, like the twist

function keyAction(e) {
  const k = e.key;
  if (e.shiftKey && (k === "ArrowLeft" || k === "ArrowRight")) {
    return { rotate: k === "ArrowRight" ? KEY_ROTATE_STEP : -KEY_ROTATE_STEP };
  }
  if (e.shiftKey && (k === "ArrowUp" || k === "ArrowDown")) return null;
  if (k === "ArrowLeft") return { pan: [-1, 0] };
  if (k === "ArrowRight") return { pan: [1, 0] };
  if (k === "ArrowUp") return { pan: [0, -1] };   // screen y grows downward
  if (k === "ArrowDown") return { pan: [0, 1] };
  if (k === "+" || k === "=") return { zoom: 1 / KEY_ZOOM_FACTOR };
  if (k === "-" || k === "_") return { zoom: KEY_ZOOM_FACTOR };
  if ((k === "r" || k === "R") && !e.shiftKey) return { reset: true };
  return null;
}

// The vector view, its canvas, nav (history) and Reset button for the
// active non-fractal mode.
function activeVectorTarget() {
  if (mode === "koch") return { v: kochView, canvas: els.kochCanvas, nav: kochNav, resetBtn: els.kochResetBtn };
  if (mode === "tree") return { v: treeView, canvas: els.treeCanvas, nav: treeNav, resetBtn: els.treeResetBtn };
  if (isCurveMode(mode)) return { v: dragonView, canvas: els.dragonCanvas, nav: dragonNav, resetBtn: els.dragonResetBtn };
  if (isIfsMode(mode)) return { v: fernView, canvas: els.fernCanvas, nav: fernNav, resetBtn: els.fernResetBtn };
  return null;
}

let lastKeyHistoryPush = 0;

document.addEventListener("keydown", (e) => {
  // Leave browser/OS shortcuts (Cmd+arrows, Cmd +/-) alone, and let
  // focused form controls (sliders take arrow keys) keep their keys.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
  const action = keyAction(e);
  if (!action) return;
  e.preventDefault();

  if (mode === "fractal") {
    if (action.reset) { els.resetBtn.click(); return; }
    // In dual mode, keys drive whichever pane was last touched.
    const pane = dualActive && activePane === "julia" && juliaState ? "julia" : "main";
    const st = pane === "julia" ? juliaState : mainState;
    const renderer = pane === "julia" ? juliaRenderer : mainRenderer;
    cancelTeleport();
    const now = performance.now();
    if (now - lastKeyHistoryPush > 400) { pushHistory(pane); lastKeyHistoryPush = now; }
    const w = renderer.canvas.width / renderer.dpr, h = renderer.canvas.height / renderer.dpr;
    if (action.pan) {
      const step = KEY_PAN_FRACTION * Math.min(w, h);
      const c = screenToComplex(renderer, st, w / 2 + action.pan[0] * step, h / 2 + action.pan[1] * step);
      st.cx = c.x;
      st.cy = c.y;
    } else if (action.zoom) {
      st.scale *= action.zoom;
    } else if (action.rotate) {
      st.rotation = normalizeAngle((st.rotation || 0) + action.rotate);
    }
    markInteracting();
    requestRender();
    return;
  }

  const target = activeVectorTarget();
  if (!target) return;
  if (action.reset) { target.resetBtn.click(); return; }
  const { v, canvas, nav } = target;
  nav.checkpoint();
  if (action.pan) {
    // screenToWorld works in device pixels (canvas.width/height), so the
    // step is measured in them too.
    const step = KEY_PAN_FRACTION * Math.min(canvas.width, canvas.height);
    const [x, y] = v.screenToWorld(canvas.width / 2 + action.pan[0] * step, canvas.height / 2 + action.pan[1] * step);
    v.view.cx = x;
    v.view.cy = y;
  } else if (action.zoom) {
    v.view.halfHeight *= action.zoom;
  } else if (action.rotate) {
    v.view.rotation = normalizeAngle((v.view.rotation || 0) + action.rotate);
  }
  requestRender();
});

function applyHudVisibility() {
  els.hud.classList.toggle("hidden", !hudVisible);
  document.querySelectorAll(".hudToggleBtn").forEach((b) => b.classList.toggle("active", hudVisible));
  requestRender(); // the canvas area just changed height
}
document.querySelectorAll(".hudToggleBtn").forEach((b) => b.addEventListener("click", () => {
  hudVisible = !hudVisible;
  applyHudVisibility();
}));
applyHudVisibility();

// ---------------------------------------------------------------- UI wiring

FRACTAL_CATEGORIES.forEach((fam) => {
  const names = FRACTAL_NAMES.filter((n) => FRACTAL_CONFIGS[n].category === fam.key);
  const extraModes = EXTRA_MODES.filter((m) => m.category === fam.key);
  if (names.length === 0 && extraModes.length === 0) return;
  const header = document.createElement("div");
  header.className = "menuSectionHeader";
  header.textContent = fam.label;
  els.fractalTypeRow.appendChild(header);
  names.forEach((name) => {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.name = name;
    btn.addEventListener("click", () => selectFractal(name));
    els.fractalTypeRow.appendChild(btn);
  });
  extraModes.forEach((m) => {
    const btn = document.createElement("button");
    btn.textContent = m.label;
    btn.dataset.mode = m.key;
    btn.addEventListener("click", () => setMode(m.key));
    els.fractalTypeRow.appendChild(btn);
  });
});
updateMenuActiveState();

// Two hamburger buttons exist (one in #fractalControls, one in #kochControls
// — see index.html) so the menu stays reachable regardless of mode, since
// selecting Koch/a fractal type from it is now the only way to switch modes
// at all. Both share the .fractalMenuBtn class rather than an id.
document.querySelectorAll(".fractalMenuBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.colormapMenu.classList.remove("open");
    els.shareMenu.classList.remove("open");
    els.fractalTypeRow.classList.toggle("open");
  });
});
// Tap anywhere outside the open picker (or a hamburger button) to dismiss
// it — standard dropdown/hamburger-menu behavior.
document.addEventListener("pointerdown", (e) => {
  if (!els.fractalTypeRow.classList.contains("open")) return;
  if (els.fractalTypeRow.contains(e.target) || e.target.closest(".fractalMenuBtn")) return;
  els.fractalTypeRow.classList.remove("open");
});

// Sliders: keep each one's filled-track position (--fill, read by the
// track's gradient in index.html) in sync with its value. Dragging fires
// "input" (each listener below calls syncSliderFill); everything app.js
// sets from code (URL restore, fractal switches, Koch's depth animation,
// a curve's max depth changing) goes through the value/max setters, which
// are wrapped here once per slider instead of patched at every call site.
const SLIDERS = [els.iterSlider, els.kochDepthSlider, els.treeDepthSlider, els.dragonDepthSlider, els.fernPointsSlider];

function syncSliderFill(slider) {
  const min = parseFloat(slider.min), max = parseFloat(slider.max);
  const pct = max > min ? (parseFloat(slider.value) - min) / (max - min) * 100 : 0;
  slider.style.setProperty("--fill", `${Math.min(100, Math.max(0, pct))}%`);
}

for (const slider of SLIDERS) {
  for (const prop of ["value", "max", "min"]) {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, prop);
    Object.defineProperty(slider, prop, {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); syncSliderFill(this); },
    });
  }
  syncSliderFill(slider);
}

els.iterSlider.addEventListener("input", () => {
  syncSliderFill(els.iterSlider);
  const v = parseInt(els.iterSlider.value, 10);
  mainState.maxIter = v;
  if (juliaState) juliaState.maxIter = v;
  // Manual interaction is the only thing that turns auto iter mode off
  // (for both panes, since this slider drives both); selectFractal/Reset
  // turn it back on.
  mainState.iterAutoLocked = true;
  if (juliaState) juliaState.iterAutoLocked = true;
  requestRender();
});


els.dualBtn.addEventListener("click", () => {
  if (dualActive) exitDual(); else enterDual();
  els.dualBtn.classList.toggle("active", dualActive);
});

els.boxZoomBtn.addEventListener("click", () => {
  boxZoomActive = !boxZoomActive;
  els.boxZoomBtn.classList.toggle("active", boxZoomActive);
  if (!boxZoomActive) els.boxRect.classList.add("hidden");
});

els.backBtn.addEventListener("click", () => { cancelTeleport(); popHistory(activePane); });

// ---------------------------------------------------------------- teleport ("Surprise me")

// d3's interpolateZoom (van Wijk & Nuij, "Smooth and efficient zooming and
// panning"): a far jump zooms out, pans, and zooms back in, instead of
// zooming straight at a point that stays off-screen the whole way. Views
// are [cx, cy, w] with w the visible height; returns f(t) for t in [0, 1].
// The near-case cutoff is relative to w, not d3's absolute 1e-12 --
// deep-zoom jumps are routinely that small in absolute terms. f.distance
// is the path's length in d3's units (roughly zoom levels travelled),
// used to size the flight's duration.
function zoomPath(p0, p1) {
  const rho = Math.SQRT2, rho2 = 2, rho4 = 4;
  const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1;
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
  const tiny = 1e-6 * Math.min(w0, w1);
  if (d2 < tiny * tiny) {
    const S = Math.log(w1 / w0) / rho;
    const f = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
    f.distance = Math.abs(S);
    return f;
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  // d3 writes these as log(sqrt(b*b + 1) - b), which cancels to log(0) when
  // a flight starts deep (b0 ~ distance / w0 ~ 1e10). -asinh(b) is the same
  // value, computed stably.
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const S = (r1 - r0) / rho;
  const coshr0 = Math.cosh(r0), sinhr0 = Math.sinh(r0);
  const f = (t) => {
    const s = t * S;
    const u = w0 / (rho2 * d1) * (coshr0 * Math.tanh(rho * s + r0) - sinhr0);
    return [ux0 + u * dx, uy0 + u * dy, w0 * coshr0 / Math.cosh(rho * s + r0)];
  };
  f.distance = Math.abs(S);
  return f;
}

// Flight time grows with distance: ~1s for a short hop from the opening
// view (distance ~4), up to 2.5s for the longest deep-to-deep dives (~34).
function teleportDurationMs(distance) {
  return Math.min(2500, Math.max(1000, 1000 + (distance - 4) * 50));
}
let lastTeleportIndex = -1; // index into TELEPORT_DESTINATIONS; never picked twice in a row
let teleportGeneration = 0;

// Any direct manipulation (pointer, wheel, Back, fractal switch) wins over
// an in-flight flight: bumping the generation makes its next frame a no-op.
function cancelTeleport() { teleportGeneration++; }

function teleport() {
  if (mode !== "fractal") return;
  const candidates = TELEPORT_DESTINATIONS
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => d.fractal === currentName && i !== lastTeleportIndex);
  if (candidates.length === 0) return;
  const { d, i } = candidates[Math.floor(Math.random() * candidates.length)];
  lastTeleportIndex = i;

  const st = mainState;
  const target = { cx: Number(d.re), cy: Number(d.im), scale: d.scale };
  pushHistory("main");
  activePane = "main";
  const path = zoomPath([st.cx, st.cy, 2 * st.scale], [target.cx, target.cy, 2 * target.scale]);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const durationMs = teleportDurationMs(path.distance);
  const gen = ++teleportGeneration;
  const t0 = performance.now();

  // Each frame goes through the same path as a pinch frame: markInteracting
  // puts renderAll on its gesture path (live float32 above
  // DEEP_ZOOM_THRESHOLD, the moving last-frame preview below it), and its
  // settle timer does the full-quality render -- perturbation reference
  // orbit included, via render()'s normal chooseReference call -- plus
  // applyAutoIter once the last frame lands.
  const step = (now) => {
    if (gen !== teleportGeneration || mode !== "fractal" || mainState !== st) return;
    const t = Math.min(1, (now - t0) / durationMs);
    if (t < 1) {
      const [cx, cy, w] = path(ease(t));
      st.cx = cx; st.cy = cy; st.scale = w / 2;
    } else {
      // Exact landing: the path's last point can be a few ulps off, which
      // matters at 1e-12 scales.
      Object.assign(st, target);
    }
    markInteracting();
    renderAll();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

els.teleportBtn.addEventListener("click", teleport);

els.resetBtn.addEventListener("click", () => selectFractal(currentName));

els.kochDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.kochDepthSlider);
  kochState.depth = parseInt(els.kochDepthSlider.value, 10);
  requestRender();
});

els.kochFillBtn.addEventListener("click", () => {
  kochState.fill = !kochState.fill;
  els.kochFillBtn.classList.toggle("active", kochState.fill);
  requestRender();
});


els.kochAnimateBtn.addEventListener("click", () => {
  kochState.animating = !kochState.animating;
  els.kochAnimateBtn.classList.toggle("active", kochState.animating);
  if (kochState.animating) {
    kochState.timer = setInterval(() => {
      kochState.depth = (kochState.depth + 1) % 9;
      els.kochDepthSlider.value = kochState.depth;
      requestRender();
    }, 700);
  } else {
    clearInterval(kochState.timer);
  }
});

els.kochResetBtn.addEventListener("click", () => {
  kochNav.clearHistory();
  fitVectorView("koch");
  requestRender();
});

els.treeDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.treeDepthSlider);
  treeState.depth = parseInt(els.treeDepthSlider.value, 10);
  requestRender();
});


els.treeResetBtn.addEventListener("click", () => {
  treeNav.clearHistory();
  fitVectorView("tree");
  requestRender();
});

els.dragonDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.dragonDepthSlider);
  dragonState.depth = parseInt(els.dragonDepthSlider.value, 10);
  requestRender();
});


els.dragonResetBtn.addEventListener("click", () => {
  dragonNav.clearHistory();
  fitVectorView(mode);
  requestRender();
});

els.fernPointsSlider.addEventListener("input", () => {
  syncSliderFill(els.fernPointsSlider);
  fernState.count = parseInt(els.fernPointsSlider.value, 10);
  requestRender();
});

// ---------------------------------------------------------------- colormap picker

// The palette button in every row opens this picker (same popover pattern as
// the share menu) instead of cycling blindly. Koch/tree/dragon/fractal pick
// from the shared COLORMAPS; the fern picks from its own IFS_COLORS.
function cmGradient(stops) {
  return `linear-gradient(to right, ${stops.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ")})`;
}

function setFernColor(i) {
  fernState.colorIndex = i;
  const [r, g, b] = IFS_COLORS[i].rgb;
  els.fernColorSwatch.setAttribute("fill", `rgb(${r}, ${g}, ${b})`);
}

function openColormapMenu(forFern) {
  const items = forFern
    ? IFS_COLORS.map((c) => ({ name: c.name, bg: `rgb(${c.rgb.join(",")})` }))
    : COLORMAPS.map((c) => ({ name: c.name, bg: cmGradient(c.stops) }));
  const current = forFern ? fernState.colorIndex : colormapIndex;
  els.colormapMenu.replaceChildren(...items.map((item, i) => {
    const btn = document.createElement("button");
    btn.setAttribute("role", "menuitemradio");
    btn.setAttribute("aria-checked", String(i === current));
    btn.classList.toggle("active", i === current);
    const swatch = document.createElement("span");
    swatch.className = "cmSwatch";
    swatch.style.background = item.bg;
    btn.append(swatch, item.name);
    btn.addEventListener("click", () => {
      if (forFern) {
        setFernColor(i);
      } else {
        colormapIndex = i;
        // Always refresh the shader's LUT, whichever mode picked it: the
        // old koch/tree/dragon cycle handlers skipped this, leaving the
        // fractal on a stale colormap after switching back.
        updateLUT();
      }
      els.colormapMenu.classList.remove("open");
      requestRender();
    });
    return btn;
  }));
  els.colormapMenu.classList.add("open");
  els.colormapMenu.querySelector(".active")?.scrollIntoView({ block: "nearest" });
}

[els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.dragonColormapBtn, els.fernColorBtn].forEach((btn) => {
  btn.setAttribute("aria-haspopup", "true");
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-tap closer below fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.shareMenu.classList.remove("open");
    if (els.colormapMenu.classList.contains("open")) els.colormapMenu.classList.remove("open");
    else openColormapMenu(btn === els.fernColorBtn);
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.colormapMenu.classList.contains("open")) return;
  if (els.colormapMenu.contains(e.target) || e.target.closest("[aria-haspopup]")) return;
  els.colormapMenu.classList.remove("open");
});

els.fernBoxZoomBtn.addEventListener("click", () => {
  fernBoxZoomActive = !fernBoxZoomActive;
  els.fernBoxZoomBtn.classList.toggle("active", fernBoxZoomActive);
  if (!fernBoxZoomActive) els.boxRect.classList.add("hidden");
});

els.fernResetBtn.addEventListener("click", () => {
  fernNav.clearHistory();
  fitVectorView(mode);
  requestRender();
});

window.addEventListener("resize", () => { layoutCanvasArea(); requestRender(); });
// The toolbar is in flow under the canvas, so the canvas area also changes
// size without a window resize (e.g. a mode's control row wrapping
// differently); re-lay out and re-render then too.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => { layoutCanvasArea(); requestRender(); }).observe(els.canvasArea);
}

// ---------------------------------------------------------------- share: links

// A share link is the page URL plus a hash encoding the current view, e.g.
// #v=1&m=fractal&f=Mandelbrot&x=...&y=...&s=...  Numbers use String(),
// the shortest decimal that round-trips to the exact same double -- the
// HUD's rounded display would move deep-zoom views. Julia c is encoded
// explicitly: enterDual only seeds it from the main center; tapping the
// main pane moves it independently afterward.
function depthStateFor(m) {
  return isCurveMode(m) ? dragonState : { koch: kochState, tree: treeState }[m];
}

function buildShareHash() {
  const p = new URLSearchParams();
  p.set("v", "1");
  p.set("m", mode);
  const put = (k, v) => p.set(k, String(v));
  if (mode === "fractal") {
    const s = mainState;
    p.set("f", currentName);
    put("x", s.cx); put("y", s.cy); put("s", s.scale); put("r", s.rotation || 0);
    put("i", s.maxIter); if (s.iterAutoLocked) p.set("il", "1");
    put("cm", colormapIndex);
    if (dualActive && juliaState) {
      const j = juliaState;
      p.set("d", "1");
      put("jcx", j.juliaC[0]); put("jcy", j.juliaC[1]);
      put("jx", j.cx); put("jy", j.cy); put("js", j.scale); put("jr", j.rotation || 0);
      put("ji", j.maxIter); put("jb", j.baseScale);
    }
  } else {
    const v = VECTOR_VIEWS[mode][0].view;
    put("x", v.cx); put("y", v.cy); put("s", v.halfHeight); put("r", v.rotation || 0);
    if (isIfsMode(mode)) {
      put("n", fernState.count); put("c", fernState.colorIndex);
    } else {
      put("cm", colormapIndex);
      put("dp", depthStateFor(mode).depth);
      if (mode === "koch") p.set("fl", kochState.fill ? "1" : "0");
    }
  }
  return "#" + p.toString();
}

function buildShareUrl() {
  return Platform.shareBaseUrl() + buildShareHash();
}

// Parses a share hash into a plain state object, or null if it isn't a
// valid v1 link -- any missing/out-of-range field rejects the whole link,
// so a malformed one falls back to the normal default view.
function parseShareHash(hash) {
  try {
    if (!hash || hash.length < 2) return null;
    const p = new URLSearchParams(hash.slice(1));
    if (p.get("v") !== "1") return null;
    const num = (k, test = () => true) => {
      const raw = p.get(k);
      const v = raw === null || raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(v) || !test(v)) throw new Error(`bad share field ${k}`);
      return v;
    };
    const int = (k, lo, hi) => num(k, (v) => Number.isInteger(v) && v >= lo && v <= hi);
    const pos = (v) => v > 0;
    const m = p.get("m");
    const view = { cx: num("x"), cy: num("y"), scale: num("s", pos), rotation: num("r") };
    if (m === "fractal") {
      const name = p.get("f");
      if (!Object.prototype.hasOwnProperty.call(FRACTAL_CONFIGS, name)) return null;
      const st = { mode: m, name, ...view, maxIter: int("i", 50, 2000), iterAutoLocked: p.get("il") === "1",
        cm: int("cm", 0, COLORMAPS.length - 1), dual: false };
      if (p.get("d") === "1" && FRACTAL_CONFIGS[name].dual) {
        st.dual = true;
        st.julia = { juliaC: [num("jcx"), num("jcy")], cx: num("jx"), cy: num("jy"), scale: num("js", pos),
          rotation: num("jr"), maxIter: int("ji", 50, 2000), baseScale: num("jb", pos) };
      }
      return st;
    }
    if (isIfsMode(m)) return { mode: m, ...view, count: int("n", 100000, 4000000), colorIndex: int("c", 0, IFS_COLORS.length - 1) };
    const maxDepth = isCurveMode(m) ? LINE_CURVES[m].maxDepth : { koch: 8, tree: 12 }[m];
    if (maxDepth === undefined) return null;
    const minDepth = isCurveMode(m) ? LINE_CURVES[m].minDepth || 0 : 0;
    return { mode: m, ...view, cm: int("cm", 0, COLORMAPS.length - 1), depth: int("dp", minDepth, maxDepth), fill: p.get("fl") !== "0" };
  } catch {
    return null;
  }
}

function applyShareState(st) {
  if (st.mode === "fractal") {
    colormapIndex = st.cm;
    if (dualActive) exitDual();
    selectFractal(st.name);
    Object.assign(mainState, { cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation,
      maxIter: st.maxIter, iterAutoLocked: st.iterAutoLocked });
    if (st.dual) {
      enterDual();
      Object.assign(juliaState, st.julia, { juliaC: st.julia.juliaC.slice(), iterAutoLocked: st.iterAutoLocked });
      mainState.juliaC = st.julia.juliaC.slice();
    }
    els.dualBtn.classList.toggle("active", dualActive);
    els.iterSlider.value = mainState.maxIter;
  } else {
    if (isIfsMode(st.mode)) {
      fernView.setSystem(st.mode); // before the view is written below
      fernState.count = st.count;
      els.fernPointsSlider.value = st.count;
      setFernColor(st.colorIndex);
    } else {
      colormapIndex = st.cm;
      if (isCurveMode(st.mode)) dragonView.setCurve(st.mode); // before depth/view are written
      depthStateFor(st.mode).depth = st.depth;
      els[`${isCurveMode(st.mode) ? "dragon" : st.mode}DepthSlider`].value = st.depth;
      if (st.mode === "koch") {
        kochState.fill = st.fill;
        els.kochFillBtn.classList.toggle("active", st.fill);
      }
    }
    // Mark as fitted first: setMode's first-visit fit would otherwise
    // replace the linked view with the default one.
    fittedVectorModes.add(st.mode);
    Object.assign(VECTOR_VIEWS[st.mode][0].view, { cx: st.cx, cy: st.cy, halfHeight: st.scale, rotation: st.rotation });
    setMode(st.mode);
  }
  updateLUT();
  requestRender();
}

// Applies a share link from the URL, then strips the hash so a reload
// returns to the app's normal start rather than re-pinning the link.
function applyShareHashFromUrl() {
  const st = parseShareHash(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (st) applyShareState(st);
}

// ---------------------------------------------------------------- share: image + menu

function shareFileName() {
  const label = mode === "fractal" ? currentName : EXTRA_MODES.find((e) => e.key === mode).label;
  const slug = label.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `fractal-web-${slug}-${date}.png`;
}

function waitUntil(cond, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => (cond() || performance.now() - t0 > timeoutMs ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

// Dual mode: both panes onto one canvas in the layout actually on screen
// (layoutCanvasArea's "stacked" = main above Julia, otherwise side by side),
// with #canvasArea's 2px black gap between them.
function compositeDualCanvas() {
  const a = els.mainCanvas, b = els.juliaCanvas;
  const stacked = els.canvasArea.classList.contains("stacked");
  const gap = Math.round(2 * mainRenderer.dpr);
  const out = document.createElement("canvas");
  out.width = stacked ? Math.max(a.width, b.width) : a.width + gap + b.width;
  out.height = stacked ? a.height + gap + b.height : Math.max(a.height, b.height);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(a, 0, 0);
  ctx.drawImage(b, stacked ? 0 : a.width + gap, stacked ? a.height + gap : 0);
  return out;
}

// A copy of src with the "Fractal Explorer" wordmark in a dark translucent
// pill, bottom-right. Drawn on the export only, never the live canvas. The
// pill (not bare or shadowed text) keeps it legible on any colormap,
// including flat light or flat dark regions. Sized off the image's short
// side so it looks the same on a phone and an iPad export.
function watermarkedCopy(src) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);

  const text = "Fractal Explorer";
  const fontPx = Math.max(12, Math.round(Math.min(out.width, out.height) * 0.03));
  ctx.font = `600 ${fontPx}px -apple-system, system-ui, "Helvetica Neue", sans-serif`;
  const h = Math.round(fontPx * 1.9);
  const w = Math.round(ctx.measureText(text).width + fontPx * 1.5);
  const margin = Math.round(fontPx * 0.9);
  const x = out.width - margin - w, y = out.height - margin - h, r = h / 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fill();
  // Hairline edge so the pill still reads against a flat black export.
  ctx.lineWidth = Math.max(1, fontPx / 16);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + fontPx * 0.04);
  return out;
}

// PNG of the current view, taken only once progressive refinement has
// finished (fractal supersampling, fern point fill) -- or after 3s, so a
// slow device or an ongoing gesture can't hang it. Koch/tree/dragon draw
// synchronously and are captured immediately. Every export path (Save
// image, Save to Photos, Share…) goes through here, so all get the
// watermark.
async function captureShareBlob() {
  if (mode === "fractal") await waitUntil(() => refineDone && !isInteracting, 3000);
  else if (isIfsMode(mode)) await waitUntil(() => !fernView.refining, 3000);
  const canvas = watermarkedCopy(mode !== "fractal" ? VECTOR_VIEWS[mode][1] : dualActive ? compositeDualCanvas() : els.mainCanvas);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
}

els.shareNativeBtn.classList.toggle("hidden", !Platform.canShare);

// Capture starts when the menu opens, not when an option is tapped: iOS
// Safari only allows navigator.share() close to the user's tap, so the PNG
// should already be ready by then.
let pendingCapture = null;
function closeShareMenu() { els.shareMenu.classList.remove("open"); }
document.querySelectorAll(".shareBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.colormapMenu.classList.remove("open");
    const opening = !els.shareMenu.classList.contains("open");
    els.shareMenu.classList.toggle("open", opening);
    if (opening) {
      pendingCapture = captureShareBlob();
      pendingCapture.catch(() => {}); // surfaced when an option actually uses it
    }
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.shareMenu.classList.contains("open")) return;
  if (els.shareMenu.contains(e.target) || e.target.closest(".shareBtn")) return;
  closeShareMenu();
});

function flashLabel(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; closeShareMenu(); }, 1500);
}

els.shareSaveBtn.textContent = Platform.saveImageLabel;
els.shareSaveBtn.addEventListener("click", async () => {
  try {
    const saved = await Platform.saveImage(await pendingCapture, shareFileName());
    if (saved) flashLabel(els.shareSaveBtn, "Saved!");
    else closeShareMenu();
  } catch (err) {
    closeShareMenu();
    reportError(`Save image failed: ${err && err.message ? err.message : err}`);
  }
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard needs a secure context (not the LAN dev server).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

els.shareCopyBtn.addEventListener("click", async () => {
  const ok = await copyText(buildShareUrl());
  flashLabel(els.shareCopyBtn, ok ? "Copied!" : "Copy failed");
});

els.shareNativeBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  closeShareMenu();
  try {
    await Platform.share({ blob: await pendingCapture, fileName: shareFileName(), url, title: "Fractal Explorer" });
  } catch (err) {
    reportError(`Share failed: ${err && err.message ? err.message : err}`);
  }
});

// Pasting a different link into an open tab only changes the hash.
window.addEventListener("hashchange", applyShareHashFromUrl);

// ---------------------------------------------------------------- init

selectFractal(currentName);
updateLUT();
requestRender();
applyShareHashFromUrl();
// requestRender draws on the next animation frame; one frame after that it
// has been painted, so the app's launch screen can fade into it (no-op on
// the web, see platform.js).
requestAnimationFrame(() => requestAnimationFrame(() => Platform.hideLaunchScreen()));

// One-shot layout diagnostic: if the canvas collapsed to near-zero size
// (a CSS/flexbox bug) nothing will be visible even though no JS error
// was thrown, so surface that case explicitly too.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = els.mainCanvas;
  if (c.clientWidth < 4 || c.clientHeight < 4) {
    reportError(`Diagnostic: mainCanvas has collapsed to ${c.clientWidth}x${c.clientHeight} CSS px (canvasArea: ${els.canvasArea.clientWidth}x${els.canvasArea.clientHeight}). This is a layout bug, not a rendering bug.`);
  }
}));
