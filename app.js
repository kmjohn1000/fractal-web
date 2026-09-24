"use strict";

// ---------------------------------------------------------------- fractal configs
// Ported from mandelbrot.py's FRACTAL_CONFIGS. view is [xmin, xmax, ymin, ymax];
// we only use the y-extent as the half-height (see viewFromBounds) since the
// canvas's own aspect ratio determines the visible x-extent, same convention
// used throughout the WebGL renderer.

const FTYPE = { ESCAPE: 0, SHIP: 1, TRICORN: 2, NEWTON: 3, CARPET: 4, GASKET: 5 };

// family groups the hamburger menu into sections, by actual mathematical
// relationship rather than just "looks similar":
//   "escape"  - the z^n+c iteration in parameter-space (c varies, z starts
//               at 0) — Mandelbrot itself and its direct variants. These
//               all render the characteristic "bug"-shaped boundary.
//   "julia"   - the SAME z^n+c iteration, just in the dual mode (c is
//               fixed, z starts at the pixel) — mathematically the same
//               family as "escape" (a Julia set is literally a cross-
//               section of the Mandelbrot construction), split into its
//               own section because fixed-c renderings look nothing like
//               parameter-space ones (dust/lightning/spirals, not bugs) —
//               grouping by literal visual family is more useful for
//               browsing than collapsing them under one giant "Mandelbrot"
//               label just because the underlying math matches.
//   "other"   - structurally unrelated constructions: Newton's method
//               (root-finding, not escape-time), and the digit-test
//               carpet/gasket (self-similar IFS constructions).
const FRACTAL_CONFIGS = {
  "Mandelbrot":   { ftype: FTYPE.ESCAPE,  power: 2, juliaC: null,               view: [-2.5, 1.0, -1.25, 1.25], dual: true,  family: "escape" },
  "Burn. Ship":   { ftype: FTYPE.SHIP,    power: 2, juliaC: null,               view: [-2.5, 1.5, -2.0,  0.5],  dual: true,  family: "escape" },
  "Tricorn":      { ftype: FTYPE.TRICORN, power: 2, juliaC: null,               view: [-2.5, 1.0, -1.25, 1.25], dual: true,  family: "escape" },
  "Multibrot³": { ftype: FTYPE.ESCAPE, power: 3, juliaC: null,             view: [-2.0, 2.0, -1.5,  1.5],  dual: true,  family: "escape" },
  "Julia:Rabbit": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.12256, 0.74486], view: [-1.8, 1.8, -1.35, 1.35], dual: false, family: "julia" },
  "Julia:Dragon": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.4, 0.6],         view: [-1.8, 1.8, -1.35, 1.35], dual: false, family: "julia" },
  "Julia:Spiral": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [0.285, 0.01],       view: [-1.8, 1.8, -1.35, 1.35], dual: false, family: "julia" },
  "Newton z³": { ftype: FTYPE.NEWTON, power: 3, juliaC: null,              view: [-2.0, 2.0, -1.5, 1.5],   dual: false, family: "other" },
  // Digit-test fractals (see FRAG_SRC's renderDigitFractal) — defined on
  // the unit square, so centered there with a little margin. power is
  // unused by these but kept non-null for consistency with the others.
  "Carpet":       { ftype: FTYPE.CARPET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, family: "other" },
  "Gasket":       { ftype: FTYPE.GASKET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, family: "other" },
};
const FRACTAL_NAMES = Object.keys(FRACTAL_CONFIGS);
const FRACTAL_FAMILIES = [
  { key: "escape", label: "Escape-time (parameter space)" },
  { key: "julia",  label: "Julia sets" },
  { key: "other",  label: "Other constructions" },
];

// Menu entries that switch the whole app mode (Canvas2D vector views, not a
// WebGL shader ftype) rather than selecting a FRACTAL_CONFIGS entry — same
// "structurally unrelated construction" logic that puts Newton/Carpet/Gasket
// in "other" applies to Koch (an IFS boundary curve, not escape-time), so it
// belongs in the same section of the same menu instead of its own top-level
// mode button.
const EXTRA_MODES = [
  { key: "koch", label: "Koch Snowflake", family: "other" },
  { key: "tree", label: "Pythagoras Tree", family: "other" },
  { key: "dragon", label: "Dragon Curve", family: "other" },
  { key: "fern", label: "Barnsley Fern", family: "other" },
];

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

function viewFromBounds(b) {
  return { cx: (b[0] + b[1]) / 2, cy: (b[2] + b[3]) / 2, scale: (b[3] - b[2]) / 2 };
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
    rotation: gl.getUniformLocation(prog, "u_rotation"),
    maxIter: gl.getUniformLocation(prog, "u_maxIter"),
    ftype: gl.getUniformLocation(prog, "u_ftype"),
    power: gl.getUniformLocation(prog, "u_power"),
    isJulia: gl.getUniformLocation(prog, "u_isJulia"),
    juliaC: gl.getUniformLocation(prog, "u_juliaC"),
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
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
    gl.uniform1f(u.rotation, state.rotation || 0);
    gl.uniform1i(u.maxIter, state.maxIter | 0);
    gl.uniform1i(u.ftype, state.ftype);
    gl.uniform1f(u.power, state.power);
    gl.uniform1i(u.isJulia, state.isJulia ? 1 : 0);
    gl.uniform2f(u.juliaC, state.juliaC[0], state.juliaC[1]);
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
};

let mode = "fractal"; // "fractal" | "koch" | "tree" | "dragon" | "fern"
let colormapIndex = 0;
let currentName = "Mandelbrot";
let dualActive = false;
let boxZoomActive = false;
let fernBoxZoomActive = false; // separate toggle: the fern has its own control row
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
    requestRender();
  }, 200);
}

const mainRenderer = createFractalRenderer(els.mainCanvas);
const juliaRenderer = createFractalRenderer(els.juliaCanvas);
const kochView = createKochView(els.kochCanvas);
const treeView = createPythagorasTreeView(els.treeCanvas);
const dragonView = createDragonView(els.dragonCanvas);
const fernView = createFernView(els.fernCanvas);

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

function freshState(config) {
  const v = viewFromBounds(config.view);
  return {
    cx: v.cx, cy: v.cy, scale: v.scale, rotation: 0,
    ftype: config.ftype, power: config.power,
    isJulia: config.juliaC !== null,
    juliaC: config.juliaC || [0, 0],
    maxIter: parseInt(els.iterSlider.value, 10),
  };
}

let mainState = freshState(FRACTAL_CONFIGS[currentName]);
let juliaState = null; // populated when dual mode is entered
let mainHistory = [];
let juliaHistory = [];

const kochState = { depth: 4, fill: true, animating: false, timer: null };
const treeState = { depth: 9 };
const dragonState = { depth: 13 };
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
  } else if (mode === "dragon") {
    dragonView.render({ depth: dragonState.depth, colormapIndex });
    updateDragonHud();
  } else {
    fernView.render({
      count: fernState.count,
      colorIndex: fernState.colorIndex,
      isActive: () => mode === "fern",
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
function scheduleRefinement() {
  const gen = ++refineGeneration;
  if (isInteracting) return;
  let k = 1;
  const step = () => {
    if (gen !== refineGeneration || mode !== "fractal" || isInteracting) return;
    mainRenderer.render(mainState, k);
    if (dualActive && juliaState) juliaRenderer.render(juliaState, k);
    if (++k < SAMPLE_OFFSETS.length) requestAnimationFrame(step);
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
    : `maxIter: ${s.maxIter}`;
  let text =
    `${currentName}   center: ${s.cx.toExponential(5)} + ${s.cy.toExponential(5)}i\n` +
    `scale: ${s.scale.toExponential(3)}   ${iterText}   precision: ${precision}${rotText}` +
    `${dualActive ? "   [dual mode — tap left pane to set Julia c]" : ""}`;
  els.hud.textContent = text;
}

function updateKochHud() {
  els.hud.textContent = `Koch Snowflake   depth: ${kochState.depth}   ${kochState.fill ? "filled" : "outline"}${rotationHudText(kochView.view.rotation)}`;
}

function updateTreeHud() {
  els.hud.textContent = `Pythagoras Tree   depth: ${treeState.depth}${rotationHudText(treeView.view.rotation)}`;
}

function updateDragonHud() {
  els.hud.textContent = `Dragon Curve   depth: ${dragonState.depth}${rotationHudText(dragonView.view.rotation)}`;
}

function updateFernHud() {
  // accepted = points actually on screen so far; it climbs toward the
  // target as refinement runs, and resets on every pan/zoom.
  els.hud.textContent = `Barnsley Fern   points: ${fernView.accepted.toLocaleString()} / ${fernState.count.toLocaleString()}${rotationHudText(fernView.view.rotation)}`;
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
// the GPU shader's cos(u_rotation)/sin(u_rotation) operating on a bounded
// input rather than one that grows without limit over a long session
// (float32 trig on a very large argument loses precision reducing it back
// into range internally).
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
  els.fractalControls.classList.toggle("hidden", mode !== "fractal");
  els.kochControls.classList.toggle("hidden", mode !== "koch");
  els.treeControls.classList.toggle("hidden", mode !== "tree");
  els.dragonControls.classList.toggle("hidden", mode !== "dragon");
  els.fernControls.classList.toggle("hidden", mode !== "fern");
  els.mainCanvas.classList.toggle("hidden", mode !== "fractal");
  els.juliaCanvas.classList.toggle("hidden", mode !== "fractal" || !dualActive);
  els.kochCanvas.classList.toggle("hidden", mode !== "koch");
  els.treeCanvas.classList.toggle("hidden", mode !== "tree");
  els.dragonCanvas.classList.toggle("hidden", mode !== "dragon");
  els.fernCanvas.classList.toggle("hidden", mode !== "fern");
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
function attachVectorViewInteraction(canvas, vectorView, isBoxZoomActive = () => false) {
  const pointers = new Map();
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
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartHalfHeight = vectorView.view.halfHeight;
      pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchStartRotation = vectorView.view.rotation || 0;
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

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (isBoxZoomActive()) return;
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
}

attachVectorViewInteraction(els.kochCanvas, kochView);
attachVectorViewInteraction(els.treeCanvas, treeView);
attachVectorViewInteraction(els.dragonCanvas, dragonView);
attachVectorViewInteraction(els.fernCanvas, fernView, () => fernBoxZoomActive);

// ---------------------------------------------------------------- UI wiring

FRACTAL_FAMILIES.forEach((fam) => {
  const names = FRACTAL_NAMES.filter((n) => FRACTAL_CONFIGS[n].family === fam.key);
  const extraModes = EXTRA_MODES.filter((m) => m.family === fam.key);
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

els.iterSlider.addEventListener("input", () => {
  const v = parseInt(els.iterSlider.value, 10);
  mainState.maxIter = v;
  if (juliaState) juliaState.maxIter = v;
  requestRender();
});

els.colormapBtn.addEventListener("click", () => {
  colormapIndex = (colormapIndex + 1) % COLORMAPS.length;
  updateLUT();
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

els.backBtn.addEventListener("click", () => popHistory(activePane));

els.resetBtn.addEventListener("click", () => selectFractal(currentName));

els.kochDepthSlider.addEventListener("input", () => {
  kochState.depth = parseInt(els.kochDepthSlider.value, 10);
  requestRender();
});

els.kochFillBtn.addEventListener("click", () => {
  kochState.fill = !kochState.fill;
  els.kochFillBtn.classList.toggle("active", kochState.fill);
  requestRender();
});

els.kochColormapBtn.addEventListener("click", () => {
  colormapIndex = (colormapIndex + 1) % COLORMAPS.length;
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
  kochView.view.cx = 0; kochView.view.cy = 0; kochView.view.halfHeight = 1.4; kochView.view.rotation = 0;
  requestRender();
});

els.treeDepthSlider.addEventListener("input", () => {
  treeState.depth = parseInt(els.treeDepthSlider.value, 10);
  requestRender();
});

els.treeColormapBtn.addEventListener("click", () => {
  colormapIndex = (colormapIndex + 1) % COLORMAPS.length;
  requestRender();
});

els.treeResetBtn.addEventListener("click", () => {
  treeView.view.cx = 0; treeView.view.cy = 2.3; treeView.view.halfHeight = 2.9; treeView.view.rotation = 0;
  requestRender();
});

els.dragonDepthSlider.addEventListener("input", () => {
  dragonState.depth = parseInt(els.dragonDepthSlider.value, 10);
  requestRender();
});

els.dragonColormapBtn.addEventListener("click", () => {
  colormapIndex = (colormapIndex + 1) % COLORMAPS.length;
  requestRender();
});

els.dragonResetBtn.addEventListener("click", () => {
  dragonView.view.cx = -0.35; dragonView.view.cy = -0.24; dragonView.view.halfHeight = 1.0; dragonView.view.rotation = 0;
  requestRender();
});

els.fernPointsSlider.addEventListener("input", () => {
  fernState.count = parseInt(els.fernPointsSlider.value, 10);
  requestRender();
});

els.fernColorBtn.addEventListener("click", () => {
  fernState.colorIndex = (fernState.colorIndex + 1) % FERN_COLORS.length;
  const [r, g, b] = FERN_COLORS[fernState.colorIndex].rgb;
  els.fernColorSwatch.setAttribute("fill", `rgb(${r}, ${g}, ${b})`);
  requestRender();
});

els.fernBoxZoomBtn.addEventListener("click", () => {
  fernBoxZoomActive = !fernBoxZoomActive;
  els.fernBoxZoomBtn.classList.toggle("active", fernBoxZoomActive);
  if (!fernBoxZoomActive) els.boxRect.classList.add("hidden");
});

els.fernResetBtn.addEventListener("click", () => {
  fernView.view.cx = 0.24; fernView.view.cy = 5.0; fernView.view.halfHeight = 5.3; fernView.view.rotation = 0;
  requestRender();
});

window.addEventListener("resize", () => { layoutCanvasArea(); requestRender(); });

// ---------------------------------------------------------------- init

selectFractal(currentName);
updateLUT();
requestRender();

// One-shot layout diagnostic: if the canvas collapsed to near-zero size
// (a CSS/flexbox bug) nothing will be visible even though no JS error
// was thrown, so surface that case explicitly too.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = els.mainCanvas;
  if (c.clientWidth < 4 || c.clientHeight < 4) {
    reportError(`Diagnostic: mainCanvas has collapsed to ${c.clientWidth}x${c.clientHeight} CSS px (canvasArea: ${els.canvasArea.clientWidth}x${els.canvasArea.clientHeight}). This is a layout bug, not a rendering bug.`);
  }
}));
