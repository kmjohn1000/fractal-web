"use strict";

// ---------------------------------------------------------------- fractal configs
// Ported from mandelbrot.py's FRACTAL_CONFIGS. view is [xmin, xmax, ymin, ymax];
// we only use the y-extent as the half-height (see viewFromBounds) since the
// canvas's own aspect ratio determines the visible x-extent, same convention
// used throughout the WebGL renderer.

const FTYPE = { ESCAPE: 0, SHIP: 1, TRICORN: 2, NEWTON: 3 };

const FRACTAL_CONFIGS = {
  "Mandelbrot":   { ftype: FTYPE.ESCAPE,  power: 2, juliaC: null,               view: [-2.5, 1.0, -1.25, 1.25], dual: true },
  "Burn. Ship":   { ftype: FTYPE.SHIP,    power: 2, juliaC: null,               view: [-2.5, 1.5, -2.0,  0.5],  dual: true },
  "Tricorn":      { ftype: FTYPE.TRICORN, power: 2, juliaC: null,               view: [-2.5, 1.0, -1.25, 1.25], dual: true },
  "Multibrot³": { ftype: FTYPE.ESCAPE, power: 3, juliaC: null,             view: [-2.0, 2.0, -1.5,  1.5],  dual: true },
  "Julia:Rabbit": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.12256, 0.74486], view: [-1.8, 1.8, -1.35, 1.35], dual: false },
  "Julia:Dragon": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.4, 0.6],         view: [-1.8, 1.8, -1.35, 1.35], dual: false },
  "Julia:Spiral": { ftype: FTYPE.ESCAPE,  power: 2, juliaC: [0.285, 0.01],       view: [-1.8, 1.8, -1.35, 1.35], dual: false },
  "Newton z³": { ftype: FTYPE.NEWTON, power: 3, juliaC: null,              view: [-2.0, 2.0, -1.5, 1.5],   dual: false },
};
const FRACTAL_NAMES = Object.keys(FRACTAL_CONFIGS);

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
  boxRect: document.getElementById("boxZoomRect"),
  crosshair: document.getElementById("crosshair"),
  modeFractalBtn: document.getElementById("modeFractalBtn"),
  modeKochBtn: document.getElementById("modeKochBtn"),
  fractalTypeRow: document.getElementById("fractalTypeRow"),
  fractalControls: document.getElementById("fractalControls"),
  kochControls: document.getElementById("kochControls"),
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
};

let mode = "fractal"; // "fractal" | "koch"
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
    cx: v.cx, cy: v.cy, scale: v.scale,
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

function pushHistory(pane) {
  const st = pane === "julia" ? juliaState : mainState;
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  if (!st) return;
  hist.push({ cx: st.cx, cy: st.cy, scale: st.scale });
  if (hist.length > 50) hist.shift();
}

function popHistory(pane) {
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  const snap = hist.pop();
  if (!snap) return;
  const st = pane === "julia" ? juliaState : mainState;
  st.cx = snap.cx; st.cy = snap.cy; st.scale = snap.scale;
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
  } else {
    kochView.render({ depth: kochState.depth, fill: kochState.fill, colormapIndex });
    updateKochHud();
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
  let text =
    `${currentName}   center: ${s.cx.toExponential(5)} + ${s.cy.toExponential(5)}i\n` +
    `scale: ${s.scale.toExponential(3)}   maxIter: ${s.maxIter}   precision: ${precision}` +
    `${dualActive ? "   [dual mode — tap left pane to set Julia c]" : ""}`;
  els.hud.textContent = text;
}

function updateKochHud() {
  els.hud.textContent = `Koch Snowflake   depth: ${kochState.depth}   ${kochState.fill ? "filled" : "outline"}`;
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
  const uvx = (world[0] - state.cx) / (state.scale * 2.0);
  const uvy = (world[1] - state.cy) / (state.scale * 2.0);
  const sx = (uvx * canvas.height + 0.5 * canvas.width) / dpr;
  const sy = (0.5 * canvas.height - uvy * canvas.height) / dpr;
  return [sx, sy];
}

function screenToComplex(renderer, state, sx, sy) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const uvx = (sx * dpr - 0.5 * canvas.width) / canvas.height;
  const uvy = (0.5 * canvas.height - sy * dpr) / canvas.height;
  return { x: state.cx + uvx * state.scale * 2.0, y: state.cy + uvy * state.scale * 2.0 };
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
  [...els.fractalTypeRow.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.name === name);
  });
  els.juliaCanvas.classList.toggle("hidden", !dualActive);
  if (!dualActive) els.crosshair.classList.add("hidden");
  layoutCanvasArea();
  requestRender();
}

function enterDual() {
  const config = FRACTAL_CONFIGS[currentName];
  if (!config.dual) return;
  dualActive = true;
  juliaState = {
    cx: 0, cy: 0, scale: mainState.scale,
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
  els.modeFractalBtn.classList.toggle("active", mode === "fractal");
  els.modeKochBtn.classList.toggle("active", mode === "koch");
  els.fractalTypeRow.classList.toggle("hidden", mode !== "fractal");
  els.fractalControls.classList.toggle("hidden", mode !== "fractal");
  els.kochControls.classList.toggle("hidden", mode !== "koch");
  els.mainCanvas.classList.toggle("hidden", mode !== "fractal");
  els.juliaCanvas.classList.toggle("hidden", mode !== "fractal" || !dualActive);
  els.kochCanvas.classList.toggle("hidden", mode !== "koch");
  requestRender();
}

// ---------------------------------------------------------------- interaction: fractal canvases

function attachFractalInteraction(canvas, getState, paneName, renderer) {
  const pointers = new Map();
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartScale = null;
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
      const st = getState();
      panStart = { sx: e.clientX, sy: e.clientY, cx: st.cx, cy: st.cy };
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScale = getState().scale;
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
      const dpr = renderer.dpr;
      const dxScreen = e.clientX - panStart.sx;
      const dyScreen = e.clientY - panStart.sy;
      const dxComplex = (dxScreen * dpr / canvas.height) * st.scale * 2.0;
      const dyComplex = (dyScreen * dpr / canvas.height) * st.scale * 2.0;
      st.cx = panStart.cx - dxComplex;
      st.cy = panStart.cy + dyComplex;
      markInteracting();
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midClient = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const mid = toLocal(midClient.x, midClient.y);
      const before = screenToWorldHere(mid.x, mid.y);
      st.scale = pinchStartScale * (pinchStartDist / Math.max(dist, 1));
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
      panStart = { sx: p.x, sy: p.y, cx: getState().cx, cy: getState().cy };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
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

  const c1 = screenToComplex(renderer, state, left, top);
  const c2 = screenToComplex(renderer, state, left + w, top + h);
  const cx = (c1.x + c2.x) / 2;
  const cy = (c1.y + c2.y) / 2;
  const halfW = Math.abs(c2.x - c1.x) / 2;
  const halfH = Math.abs(c2.y - c1.y) / 2;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const newScale = Math.max(halfH, halfW / Math.max(aspect, 1e-6));

  // Kept for future box-zoom debugging — uncomment to see the geometry
  // math on-device (no remote devtools access while testing on the phone).
  // reportError(
  //   "Box-zoom debug (not an error) —\n" +
  //   `canvas: ${canvas.clientWidth}x${canvas.clientHeight} CSS px, dpr=${renderer.dpr}\n` +
  //   `box (canvas-relative CSS px): left=${left.toFixed(1)} top=${top.toFixed(1)} w=${w.toFixed(1)} h=${h.toFixed(1)}\n` +
  //   `before: cx=${state.cx.toExponential(6)} cy=${state.cy.toExponential(6)} scale=${state.scale.toExponential(6)}\n` +
  //   `c1=(${c1.x.toExponential(6)}, ${c1.y.toExponential(6)})  c2=(${c2.x.toExponential(6)}, ${c2.y.toExponential(6)})\n` +
  //   `after: cx=${cx.toExponential(6)} cy=${cy.toExponential(6)} newScale=${newScale.toExponential(6)}\n` +
  //   `ratio old/new scale = ${(state.scale / newScale).toFixed(3)}   box w/canvas w = ${(w / canvas.clientWidth).toFixed(4)}   box h/canvas h = ${(h / canvas.clientHeight).toFixed(4)}`
  // );

  pushHistory(paneName);
  state.cx = cx; state.cy = cy; state.scale = newScale;
  requestRender();
}

attachFractalInteraction(els.mainCanvas, () => mainState, "main", mainRenderer);
attachFractalInteraction(els.juliaCanvas, () => juliaState, "julia", juliaRenderer);

// ---------------------------------------------------------------- interaction: Koch canvas

(function attachKochInteraction() {
  const canvas = els.kochCanvas;
  const pointers = new Map();
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartHalfHeight = null;

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      panStart = { sx: e.clientX, sy: e.clientY, cx: kochView.view.cx, cy: kochView.view.cy };
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartHalfHeight = kochView.view.halfHeight;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1 && panStart) {
      const dpr = kochView.dpr;
      const dxScreen = e.clientX - panStart.sx;
      const dyScreen = e.clientY - panStart.sy;
      const v = kochView.view;
      v.cx = panStart.cx - (dxScreen * dpr / canvas.height) * v.halfHeight * 2.0;
      v.cy = panStart.cy + (dyScreen * dpr / canvas.height) * v.halfHeight * 2.0;
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = canvas.getBoundingClientRect();
      const midX = ((pts[0].x + pts[1].x) / 2 - rect.left) * kochView.dpr;
      const midY = ((pts[0].y + pts[1].y) / 2 - rect.top) * kochView.dpr;
      const before = kochView.screenToWorld(midX, midY);
      kochView.view.halfHeight = pinchStartHalfHeight * (pinchStartDist / Math.max(dist, 1));
      const after = kochView.screenToWorld(midX, midY);
      kochView.view.cx += before[0] - after[0];
      kochView.view.cy += before[1] - after[1];
      requestRender();
    }
  });

  function release(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [p] = pointers.values();
      panStart = { sx: p.x, sy: p.y, cx: kochView.view.cx, cy: kochView.view.cy };
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
    const sx = (e.clientX - rect.left) * kochView.dpr;
    const sy = (e.clientY - rect.top) * kochView.dpr;
    const before = kochView.screenToWorld(sx, sy);
    kochView.view.halfHeight *= Math.exp(e.deltaY * 0.0015);
    const after = kochView.screenToWorld(sx, sy);
    kochView.view.cx += before[0] - after[0];
    kochView.view.cy += before[1] - after[1];
    requestRender();
  }, { passive: false });
})();

// ---------------------------------------------------------------- UI wiring

FRACTAL_NAMES.forEach((name) => {
  const btn = document.createElement("button");
  btn.textContent = name;
  btn.dataset.name = name;
  btn.addEventListener("click", () => selectFractal(name));
  els.fractalTypeRow.appendChild(btn);
});

els.modeFractalBtn.addEventListener("click", () => setMode("fractal"));
els.modeKochBtn.addEventListener("click", () => setMode("koch"));

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

window.addEventListener("resize", () => { layoutCanvasArea(); requestRender(); });

// ---------------------------------------------------------------- init

els.fractalControls.classList.remove("hidden");
els.kochControls.classList.add("hidden");
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
