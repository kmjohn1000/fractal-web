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
];

function viewFromBounds(b) {
  return { cx: (b[0] + b[1]) / 2, cy: (b[2] + b[3]) / 2, scale: (b[3] - b[2]) / 2 };
}

// ---------------------------------------------------------------- Phase 3: deep zoom
// Below this scale, plain float32 starts losing pixels to precision collapse
// (measured on-device at ~5.7e-6 in Phase 1) — switch to perturbation-based
// rendering (see shaders.js) with margin to spare before that point.
const DEEP_ZOOM_THRESHOLD = 1e-3;

// Computes the reference orbit Z[0..n] for perturbation rendering: Z[0]=0,
// Z[n+1] = Z[n]^power + (cx,cy), stopping early if it escapes. Runs in plain
// JS (float64) — no bignum needed at this target depth, and this is the one
// place genuine extended precision matters; everything the GPU touches
// afterward (the reference values once read back, and the per-pixel delta)
// only ever needs float32. Returns a Float32Array laid out as RGBA texels
// (re, im, 0, 1) so it can be uploaded directly as a texture.
function computeReferenceOrbit(cx, cy, power, maxIter) {
  const cap = maxIter + 1;
  const data = new Float32Array(cap * 4);
  data[3] = 1.0; // Z[0] = (0,0)
  let zr = 0, zi = 0;
  let len = 1;
  for (let n = 0; n < maxIter; n++) {
    let nzr, nzi;
    if (power === 3) {
      const zr2 = zr * zr - zi * zi, zi2 = 2 * zr * zi;
      nzr = zr2 * zr - zi2 * zi;
      nzi = zr2 * zi + zi2 * zr;
    } else {
      nzr = zr * zr - zi * zi;
      nzi = 2 * zr * zi;
    }
    zr = nzr + cx;
    zi = nzi + cy;
    data[len * 4] = zr;
    data[len * 4 + 1] = zi;
    data[len * 4 + 3] = 1.0;
    len++;
    if (zr * zr + zi * zi > 16.0) break;
  }
  return { data: data.subarray(0, len * 4), length: len };
}

// ---------------------------------------------------------------- WebGL renderer factory

function createFractalRenderer(canvas) {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false })
          || canvas.getContext("experimental-webgl", { antialias: false, alpha: false });
  if (!gl) return null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

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
    usePerturbation: gl.getUniformLocation(prog, "u_usePerturbation"),
    passNum: gl.getUniformLocation(prog, "u_passNum"),
    refOrbitTex: gl.getUniformLocation(prog, "u_refOrbitTex"),
    refOrbitLen: gl.getUniformLocation(prog, "u_refOrbitLen"),
    pass1Tex: gl.getUniformLocation(prog, "u_pass1Tex"),
    hasOrbitB: gl.getUniformLocation(prog, "u_hasOrbitB"),
    refOrbitTexB: gl.getUniformLocation(prog, "u_refOrbitTexB"),
    refOrbitLenB: gl.getUniformLocation(prog, "u_refOrbitLenB"),
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

  // Glitch detection needs a second render pass: pass 1 goes to this
  // offscreen framebuffer (so its result can be read back and reused as an
  // input texture in pass 2), and refOrbitTexB holds the second reference
  // orbit used to recompute pixels pass 1 flagged as glitched.
  const pass1Fbo = perturbationSupported ? gl.createFramebuffer() : null;
  const pass1Tex = perturbationSupported ? gl.createTexture() : null;
  if (pass1Tex) {
    gl.bindTexture(gl.TEXTURE_2D, pass1Tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  const refOrbitTexB = perturbationSupported ? gl.createTexture() : null;
  if (refOrbitTexB) {
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTexB);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  let fboWidth = 0, fboHeight = 0;
  function ensureFbo(w, h) {
    if (fboWidth === w && fboHeight === h) return;
    fboWidth = w; fboHeight = h;
    gl.bindTexture(gl.TEXTURE_2D, pass1Tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pass1Fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pass1Tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      reportError(`Perturbation glitch-detection framebuffer incomplete (status ${status}) — deep zoom will fall back to single-pass rendering.`);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function render(state) {
    resize();
    gl.useProgram(prog);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.uniform2f(u.center, state.cx, state.cy);
    gl.uniform1f(u.scale, state.scale);
    gl.uniform1f(u.rotation, state.rotation || 0);
    gl.uniform1i(u.maxIter, state.maxIter | 0);
    gl.uniform1i(u.ftype, state.ftype);
    gl.uniform1f(u.power, state.power);
    gl.uniform1i(u.isJulia, state.isJulia ? 1 : 0);
    gl.uniform2f(u.juliaC, state.juliaC[0], state.juliaC[1]);

    // Perturbation only covers the plain z^n+c family in parameter-space
    // (non-Julia) mode — see the FRAG_SRC comment for why Ship/Tricorn/Julia
    // aren't included yet. Also suppressed mid-gesture (see isInteracting)
    // since recomputing the reference orbit every frame during a live
    // pinch/wheel is expensive enough to visibly jank.
    const usePerturbation = perturbationSupported
      && !isInteracting
      && !state.isJulia
      && state.ftype === FTYPE.ESCAPE
      && state.scale < DEEP_ZOOM_THRESHOLD;
    gl.uniform1i(u.usePerturbation, usePerturbation ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(u.lut, 0);

    if (!usePerturbation) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return false;
    }

    // --- Pass 1: render to an offscreen framebuffer with reference orbit A
    // (the view center), flagging glitched pixels in the alpha channel.
    ensureFbo(canvas.width, canvas.height);
    const orbitA = computeReferenceOrbit(state.cx, state.cy, state.power, state.maxIter);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, orbitA.length, 1, 0, gl.RGBA, gl.FLOAT, orbitA.data);
    gl.uniform1i(u.refOrbitTex, 1);
    gl.uniform1i(u.refOrbitLen, orbitA.length);
    gl.uniform1i(u.passNum, 1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, pass1Fbo);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Read back the alpha channel to find whether anything glitched, and
    // where — that location becomes reference orbit B. Bounded to a single
    // retry: only the first glitched pixel found is used, not a search for
    // the "best" one.
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let glitchIdx = -1;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 128) { glitchIdx = (i - 3) / 4; break; }
    }

    let hasOrbitB = false;
    if (glitchIdx >= 0) {
      const px = glitchIdx % canvas.width;
      const py = Math.floor(glitchIdx / canvas.width);
      // Same gl_FragCoord-style mapping the shader itself uses: readPixels
      // rows run bottom-to-top, matching gl_FragCoord.y's convention.
      const uvx = (px + 0.5 - 0.5 * canvas.width) / canvas.height;
      const uvy = (py + 0.5 - 0.5 * canvas.height) / canvas.height;
      const cxB = state.cx + uvx * state.scale * 2.0;
      const cyB = state.cy + uvy * state.scale * 2.0;
      const orbitB = computeReferenceOrbit(cxB, cyB, state.power, state.maxIter);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, refOrbitTexB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, orbitB.length, 1, 0, gl.RGBA, gl.FLOAT, orbitB.data);
      gl.uniform1i(u.refOrbitTexB, 3);
      gl.uniform1i(u.refOrbitLenB, orbitB.length);
      hasOrbitB = true;
    }
    gl.uniform1i(u.hasOrbitB, hasOrbitB ? 1 : 0);

    // --- Pass 2: render to the real canvas, reusing pass 1's clean pixels
    // and recomputing glitched ones from orbit B.
    gl.uniform1i(u.passNum, 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, pass1Tex);
    gl.uniform1i(u.pass1Tex, 2);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return true;
  }

  return { canvas, render, setLUT, resize, perturbationSupported, get dpr() { return dpr; } };
}

// ---------------------------------------------------------------- app state

const els = {
  hud: document.getElementById("hud"),
  canvasArea: document.getElementById("canvasArea"),
  mainCanvas: document.getElementById("mainCanvas"),
  juliaCanvas: document.getElementById("juliaCanvas"),
  kochCanvas: document.getElementById("kochCanvas"),
  treeCanvas: document.getElementById("treeCanvas"),
  boxRect: document.getElementById("boxZoomRect"),
  crosshair: document.getElementById("crosshair"),
  fractalTypeRow: document.getElementById("fractalTypeRow"),
  fractalControls: document.getElementById("fractalControls"),
  kochControls: document.getElementById("kochControls"),
  treeControls: document.getElementById("treeControls"),
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
};

let mode = "fractal"; // "fractal" | "koch" | "tree"
let colormapIndex = 0;
let currentName = "Mandelbrot";
let dualActive = false;
let boxZoomActive = false;
let activePane = "main"; // "main" | "julia" — which pane Back/box-zoom targets

// Perturbation rendering does two full-frame GPU passes plus a synchronous
// gl.readPixels() (glitch detection) — genuinely slow on mobile, often
// 100s of ms. The main canvas is frozen (see renderAll) for the whole time
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
// shows what's effectively unrelated content. A CSS-transform-based live
// preview of the last accurate frame was tried as a fix and, after several
// rounds, still produced jumpy/inconsistent results that got worse rather
// than better with tuning — rather than keep guessing at that math blind,
// this just freezes the main canvas (touches nothing) while interacting at
// deep zoom, and only renders once the gesture settles. Less live feedback,
// but nothing left to get subtly wrong.
function renderAll() {
  if (mode === "fractal") {
    const deepZoomEligible = mainRenderer.perturbationSupported
      && !mainState.isJulia
      && mainState.ftype === FTYPE.ESCAPE
      && mainState.scale < DEEP_ZOOM_THRESHOLD;

    if (!(isInteracting && deepZoomEligible)) {
      lastMainUsedPerturbation = mainRenderer.render(mainState);
    }

    if (dualActive && juliaState) {
      juliaRenderer.render(juliaState);
      positionCrosshair();
    }
    updateHud();
  } else if (mode === "koch") {
    kochView.render({ depth: kochState.depth, fill: kochState.fill, colormapIndex });
    updateKochHud();
  } else {
    treeView.render({ depth: treeState.depth, colormapIndex });
    updateTreeHud();
  }
}

let renderPending = false;
function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderAll(); });
}

function updateHud() {
  const s = mainState;
  const eligibleType = !s.isJulia && s.ftype === FTYPE.ESCAPE;
  const deepZoomEligible = mainRenderer.perturbationSupported && eligibleType && s.scale < DEEP_ZOOM_THRESHOLD;
  let precision = "float32";
  if (isInteracting && deepZoomEligible) {
    precision = "frozen (will render at deep zoom once you stop)";
  } else if (lastMainUsedPerturbation) {
    precision = "perturbation (deep zoom)";
  } else if (s.scale < DEEP_ZOOM_THRESHOLD) {
    if (!mainRenderer.perturbationSupported) {
      precision = "float32 (deep zoom unavailable: no float texture support)";
    } else if (!eligibleType) {
      precision = "float32 (deep zoom unsupported for this fractal type)";
    }
  }
  const rotDeg = ((s.rotation || 0) * 180 / Math.PI);
  // Only shown when non-zero — no reset-to-north button, so this is the
  // only feedback that a two-finger twist has rotated the view at all.
  const rotText = Math.abs(rotDeg) > 0.5 ? `   rotation: ${rotDeg.toFixed(0)}°` : "";
  // Carpet/Gasket ignore the iter slider entirely (fixed depth in the
  // shader) — showing "maxIter: 300" would misleadingly imply it still
  // does something, the same mismatch that caused the coloring bug.
  const usesFixedDepth = s.ftype === FTYPE.CARPET || s.ftype === FTYPE.GASKET;
  const iterText = usesFixedDepth ? "depth: 16 (fixed)" : `maxIter: ${s.maxIter}`;
  let text =
    `${currentName}   center: ${s.cx.toExponential(5)} + ${s.cy.toExponential(5)}i\n` +
    `scale: ${s.scale.toExponential(3)}   ${iterText}   precision: ${precision}${rotText}` +
    `${dualActive ? "   [dual mode — tap left pane to set Julia c]" : ""}`;
  els.hud.textContent = text;
}

function updateKochHud() {
  els.hud.textContent = `Koch Snowflake   depth: ${kochState.depth}   ${kochState.fill ? "filled" : "outline"}`;
}

function updateTreeHud() {
  els.hud.textContent = `Pythagoras Tree   depth: ${treeState.depth}`;
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
  if (dualActive && !config.dual) dualActive = false;
  if (dualActive) enterDual();
  els.dualBtn.disabled = !config.dual;
  els.dualBtn.classList.toggle("active", dualActive);
  // Carpet/Gasket use a fixed depth (see FRAG_SRC) — the iter slider does
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
  els.mainCanvas.classList.toggle("hidden", mode !== "fractal");
  els.juliaCanvas.classList.toggle("hidden", mode !== "fractal" || !dualActive);
  els.kochCanvas.classList.toggle("hidden", mode !== "koch");
  els.treeCanvas.classList.toggle("hidden", mode !== "tree");
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
    // and only if the pointer barely moved (a click, not a drag).
    if (paneName === "main" && dualActive && downPos && pointers.size === 1) {
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
function attachVectorViewInteraction(canvas, vectorView) {
  const pointers = new Map();
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartHalfHeight = null;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      panStart = { sx: e.clientX, sy: e.clientY, cx: vectorView.view.cx, cy: vectorView.view.cy };
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartHalfHeight = vectorView.view.halfHeight;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && panStart) {
      const dpr = vectorView.dpr;
      const dxScreen = e.clientX - panStart.sx;
      const dyScreen = e.clientY - panStart.sy;
      const v = vectorView.view;
      v.cx = panStart.cx - (dxScreen * dpr / canvas.height) * v.halfHeight * 2.0;
      v.cy = panStart.cy + (dyScreen * dpr / canvas.height) * v.halfHeight * 2.0;
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = canvas.getBoundingClientRect();
      const midX = ((pts[0].x + pts[1].x) / 2 - rect.left) * vectorView.dpr;
      const midY = ((pts[0].y + pts[1].y) / 2 - rect.top) * vectorView.dpr;
      const before = vectorView.screenToWorld(midX, midY);
      vectorView.view.halfHeight = pinchStartHalfHeight * (pinchStartDist / Math.max(dist, 1));
      const after = vectorView.screenToWorld(midX, midY);
      vectorView.view.cx += before[0] - after[0];
      vectorView.view.cy += before[1] - after[1];
      requestRender();
    }
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [p] = pointers.values();
      panStart = { sx: p.x, sy: p.y, cx: vectorView.view.cx, cy: vectorView.view.cy };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
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
  kochView.view.cx = 0; kochView.view.cy = 0; kochView.view.halfHeight = 1.4;
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
  treeView.view.cx = 0; treeView.view.cy = 2.3; treeView.view.halfHeight = 2.9;
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
