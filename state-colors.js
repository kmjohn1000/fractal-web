// App state (els, mode, per-pane states, histories, renderers, live-resolution adaptation) and the
// color styles (COLOR_STYLES, trap ranges). Needs configs.js, fractal-defs.js and, inside function
// bodies only, renderer.js, render-layout.js and the later scripts; the views come from koch.js and friends.
"use strict";

// ---------------------------------------------------------------- app state

const els = {
  hud: document.getElementById("hud"),
  canvasArea: document.getElementById("canvasArea"),
  mainCanvas: document.getElementById("mainCanvas"),
  juliaCanvas: document.getElementById("juliaCanvas"),
  kochCanvas: document.getElementById("kochCanvas"),
  treeCanvas: document.getElementById("treeCanvas"),
  hexaflakeCanvas: document.getElementById("hexaflakeCanvas"),
  dragonCanvas: document.getElementById("dragonCanvas"),
  fernCanvas: document.getElementById("fernCanvas"),
  boxRect: document.getElementById("boxZoomRect"),
  crosshair: document.getElementById("crosshair"),
  hudName: document.querySelector("#hud .hudName"),
  hudPlain: document.querySelector("#hud .hudPlain"),
  hudStats: document.querySelector("#hud .hudStats"),
  hudScale: document.querySelector("#hud .hudScale"),
  hudBar: document.querySelector("#hud .hudBar"),
  hudScaleText: document.querySelector("#hud .hudScaleText"),
  hudCenter: document.querySelector("#hud .hudCenter"),
  juliaLabel: document.getElementById("juliaLabel"),
  welcome: document.getElementById("welcome"),
  welcomeText: document.getElementById("welcomeText"),
  welcomeClose: document.getElementById("welcomeClose"),
  fractalTypeRow: document.getElementById("fractalTypeRow"),
  fractalControls: document.getElementById("fractalControls"),
  kochControls: document.getElementById("kochControls"),
  treeControls: document.getElementById("treeControls"),
  hexaflakeControls: document.getElementById("hexaflakeControls"),
  dragonControls: document.getElementById("dragonControls"),
  fernControls: document.getElementById("fernControls"),
  iterField: document.getElementById("iterField"),
  iterSlider: document.getElementById("iterSlider"),
  colormapBtn: document.getElementById("colormapBtn"),
  colormapPill: document.getElementById("colormapPill"),
  dualBtn: document.getElementById("dualBtn"),
  boxZoomBtn: document.getElementById("boxZoomBtn"),
  backBtn: document.getElementById("backBtn"),
  teleportBtn: document.getElementById("teleportBtn"),
  resetBtn: document.getElementById("resetBtn"),
  kochDepthSlider: document.getElementById("kochDepthSlider"),
  kochFillBtn: document.getElementById("kochFillBtn"),
  kochColormapBtn: document.getElementById("kochColormapBtn"),
  kochResetBtn: document.getElementById("kochResetBtn"),
  treeDepthSlider: document.getElementById("treeDepthSlider"),
  treeColormapBtn: document.getElementById("treeColormapBtn"),
  treeResetBtn: document.getElementById("treeResetBtn"),
  hexaflakeDepthSlider: document.getElementById("hexaflakeDepthSlider"),
  hexaflakeColormapBtn: document.getElementById("hexaflakeColormapBtn"),
  hexaflakeResetBtn: document.getElementById("hexaflakeResetBtn"),
  dragonDepthSlider: document.getElementById("dragonDepthSlider"),
  dragonColormapBtn: document.getElementById("dragonColormapBtn"),
  dragonResetBtn: document.getElementById("dragonResetBtn"),
  fernPointsSlider: document.getElementById("fernPointsSlider"),
  fernColorBtn: document.getElementById("fernColorBtn"),
  fernColorSwatch: document.getElementById("fernColorSwatch"),
  kochColorSwatch: document.getElementById("kochColorSwatch"),
  treeColorSwatch: document.getElementById("treeColorSwatch"),
  hexaflakeColorSwatch: document.getElementById("hexaflakeColorSwatch"),
  dragonColorSwatch: document.getElementById("dragonColorSwatch"),
  fernResetBtn: document.getElementById("fernResetBtn"),
  fernBoxZoomBtn: document.getElementById("fernBoxZoomBtn"),
  kochBackBtn: document.getElementById("kochBackBtn"),
  treeBackBtn: document.getElementById("treeBackBtn"),
  hexaflakeBackBtn: document.getElementById("hexaflakeBackBtn"),
  dragonBackBtn: document.getElementById("dragonBackBtn"),
  fernBackBtn: document.getElementById("fernBackBtn"),
  shareMenu: document.getElementById("shareMenu"),
  colormapMenu: document.getElementById("colormapMenu"),
  colorSheet: document.getElementById("colorSheet"),
  placesSheet: document.getElementById("placesSheet"),
  shareSaveBtn: document.getElementById("shareSaveBtn"),
  shareCopyBtn: document.getElementById("shareCopyBtn"),
  shareNativeBtn: document.getElementById("shareNativeBtn"),
};

let mode = "fractal"; // "fractal" | "koch" | "tree" | "hexaflake" | a LINE_CURVES key ("dragon", ...) | an IFS_SYSTEMS key ("fern", ...)
let colormapIndex = 0;

// ---------------------------------------------------------------- default colormaps

// Each fractal opens in its own palette (defaultColormap in FRACTAL_CONFIGS;
// the first colormap, Inferno, when it names none), and a Surprise-me place
// can name one too (colormap in places.js). That holds until the user picks
// a palette (the Color sheet's palettes, a Look, or a share link naming one
// that isn't the fractal's own): from then on the pick applies everywhere,
// as the colormap has been one global since 1.17.0. colormapPicked is in
// memory only, like fractalMemory: a new launch starts on the defaults.
// fractalMemory keeps views, not palettes, so a remembered fractal comes back
// in its default too unless something was picked.
let colormapPicked = false;
// The palette that is the default for what is on screen (the fractal's or
// the landed place's): what the Default Look and Reset return to.
let colormapDefaultIndex = 0;

function colormapIndexNamed(name) {
  return Math.max(0, COLORMAPS.findIndex((c) => c.name === name));
}
// The default palette's name for a fractal, or for one of its places.
function defaultColormapName(fractal, place = null) {
  return (place && place.colormap) || FRACTAL_CONFIGS[fractal].defaultColormap || COLORMAPS[0].name;
}
// The user's own pick: it holds for every fractal and place from now on.
function pickColormap(i) {
  colormapPicked = true;
  colormapIndex = i;
  updateLUT();
}
// Called when the fractal changes (selectFractal) or a flight starts
// (flyTo, with the place it lands on): moves to the default unless a palette
// has been picked.
function applyDefaultColormap(place = null) {
  colormapDefaultIndex = colormapIndexNamed(defaultColormapName(currentName, place));
  if (colormapPicked || colormapDefaultIndex === colormapIndex) return;
  colormapIndex = colormapDefaultIndex;
  updateLUT();
}
// Back to the defaults: the Default Look and Reset in the Color sheet.
function releaseColormapPick() {
  colormapPicked = false;
  if (colormapIndex !== colormapDefaultIndex) {
    colormapIndex = colormapDefaultIndex;
    updateLUT();
  }
}

// ---------------------------------------------------------------- color styles

// How an escape-time pixel picks its colormap coordinate (see
// COLOR_STYLE_GLSL in shaders.js). Like the colormap, the style is global:
// one choice for every fractal that can draw it, kept across fractal
// switches. `bands` and `shift` apply to every style as
// lutColor(t * bands + shift); Smooth at bands 1 and shift 0 is exactly
// today's coloring. `glsl` is the style's number in the shaders, `variant`
// which compiled version of the escape-time program draws it (COLOR_VARIANT
// in FRAG_SRC: 0 needs no per-iteration work), `types` the fractal types it
// works on (the escape-time types when left out).
const ESCAPE_TIME_TYPES = [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC, FTYPE.PHOENIX];
const COLOR_STYLES = [
  { id: "smooth", glsl: 0, variant: 0, label: "Smooth" },
  { id: "bands", glsl: 1, variant: 0, label: "Bands" },
  // Phoenix is left out of the styles that track state per iteration: its
  // two-term recurrence has no derivative worked out, and its deep path is a
  // separate fixed-point shader.
  { id: "glow", glsl: 2, variant: 1, label: "Edge glow", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
  { id: "stripes", glsl: 3, variant: 2, label: "Stripes", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
  // Orbit traps color by how close the orbit came to a point or a cross. In a
  // deep view every pixel's orbit looks alike, so the distances fall in a
  // narrow band; the renderer stretches the colormap over the view's real
  // range (trapRange in createFractalRenderer), so they work at any depth.
  // (A style can still be limited with `maxZoom`: past that many times deep
  // it isn't offered and the view draws Smooth. The traps were limited to
  // 1,000 before the auto-range.)
  // Display names are plain words and the same everywhere (tile, segment,
  // note, info card): Orbs is the point trap and Rays the cross trap. The ids
  // (and the share-link codes below) never change.
  { id: "point", glsl: 4, variant: 3, label: "Orbs", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
  { id: "cross", glsl: 5, variant: 3, label: "Rays", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
  // Relief is lit from the distance estimate's derivative, so it shares Edge
  // glow's compiled program (variant 1) and its limits.
  { id: "relief", glsl: 6, variant: 1, label: "Relief", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
];
const COLOR_BANDS_RANGE = [0.25, 8];
// A style's id in share links (st=); "c" is taken by the vector modes' solid
// color, so the three fields are st (style), cd (bands) and co (shift).
const STYLE_LINK_CODES = new Map([["smooth", "sm"], ["bands", "bd"], ["glow", "de"], ["stripes", "sp"], ["point", "pt"], ["cross", "xt"], ["relief", "rl"]]);
// trap: an [x, y] override of the orbit traps' center (the checks use it to
// match the oracle); null for the per-fractal default, see trapCenterFor.
const colorStyle = { style: "smooth", density: 1, offset: 0, trap: null };
const TRAP_CENTERS = new Map([[FTYPE.ESCAPE, [-0.5, 0]], [FTYPE.SHIP, [-1.75, -0.03]], [FTYPE.TRICORN, [0, 0]], [FTYPE.CELTIC, [-0.5, 0]]]);
function trapCenterFor(state) {
  if (colorStyle.trap) return colorStyle.trap;
  if (state.isJulia || (state.ftype === FTYPE.ESCAPE && state.power > 2.5)) return [0, 0];
  return TRAP_CENTERS.get(state.ftype) || [0, 0];
}

// The orbit traps' range from a probe's RGBA bytes (see probeTrapRange in the
// renderer): red and green are the distance's log in 16 bits over
// ln(1e-12) .. ln(1e2) (the same constants as trapColor in shaders.js), blue is
// the escaped flag. The range is the 2nd-98th percentile of the escaped
// pixels' distances, or of every pixel when almost none escaped (a view inside
// the set, where the traps color the interior). null when it can't be told.
const TRAP_LN_LO = -27.6310211, TRAP_LN_SPAN = 32.2361913;
function decodeTrapRange(px) {
  const all = [], escaped = [];
  for (let i = 0; i + 3 < px.length; i += 4) {
    const d = Math.exp(TRAP_LN_LO + ((px[i] * 256 + px[i + 1]) / 65535) * TRAP_LN_SPAN);
    all.push(d);
    if (px[i + 2] > 127) escaped.push(d);
  }
  const pool = escaped.length >= Math.max(24, all.length * 0.08) ? escaped : all;
  if (pool.length < 8) return null;
  pool.sort((a, b) => a - b);
  const lo = pool[Math.floor(0.02 * (pool.length - 1))];
  let hi = pool[Math.ceil(0.98 * (pool.length - 1))];
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (!(hi > lo)) hi = lo * 1.01 + 1e-9; // a flat view: any range will do
  return { lo, hi };
}

// The range the traps use. A shallow view has its far field in the
// percentile (orbits that escape far from the trap), and stretching over it
// paled everything near the set, so the fixed range (0..1 Point, 0..0.2
// Cross) stays in force while the probe's range is as wide as it is; as the
// probe's range narrows to half of it or less (a deep view, whose distances
// sit in a narrow band) the colormap moves smoothly onto the probe's range,
// so there's no jump while zooming. fixed = { lo, hi }.
function trapRangeFor(px, fixed) {
  const r = decodeTrapRange(px);
  if (!r) return fixed;
  if (r.lo >= fixed.hi) return r; // everything lies beyond the fixed range
  const w = Math.min(1, Math.max(0, (fixed.hi - r.hi) / (0.5 * (fixed.hi - fixed.lo))));
  const lo = fixed.lo + w * (r.lo - fixed.lo);
  const hi = fixed.hi + w * (r.hi - fixed.hi);
  return { lo, hi: hi > lo ? hi : lo * 1.01 + 1e-9 };
}

// The style a view actually draws: the chosen one if its fractal can do it,
// otherwise Smooth. Newton, Carpet, Gasket and Apollonian color by their own
// schemes (the shaders never read the style).
function styleDrawn(id, state) {
  const s = COLOR_STYLES.find((c) => c.id === id);
  return s && !styleBlocked(s, state) ? s.id : "smooth";
}

// Why a style can't be drawn for this view: "type" (its fractal can't do it)
// or "depth" (too deep for the orbit traps), else null. The small allowance
// keeps a view set to exactly maxZoom on the right side of rounding.
function styleBlocked(style, state) {
  if (!(style.types || ESCAPE_TIME_TYPES).includes(state.ftype)) return "type";
  if (style.maxZoom && !(state.baseScale / state.scale <= style.maxZoom * 1.001)) return "depth";
  return null;
}

// What the renderer sends the shaders for one view.
function colorStyleFor(state) {
  const s = COLOR_STYLES.find((c) => c.id === styleDrawn(colorStyle.style, state));
  return { glsl: s.glsl, variant: s.variant, density: colorStyle.density, offset: colorStyle.offset,
    trap: s.variant === 3 ? trapCenterFor(state) : [0, 0] };
}

// Strict: anything unknown or out of range falls back to today's coloring
// (or keeps the current value for a field left out), never throws.
function setColorStyle(next = {}) {
  const prev = { ...colorStyle };
  if (next.style !== undefined) colorStyle.style = COLOR_STYLES.some((s) => s.id === next.style) ? next.style : "smooth";
  if (next.density !== undefined) {
    colorStyle.density = Number.isFinite(next.density)
      ? Math.min(COLOR_BANDS_RANGE[1], Math.max(COLOR_BANDS_RANGE[0], next.density)) : 1;
  }
  if (next.offset !== undefined) {
    const o = next.offset;
    // (a value already in 0..1 is kept exactly; the wrap would add rounding)
    colorStyle.offset = !Number.isFinite(o) ? 0 : o >= 0 && o < 1 ? o : ((o % 1) + 1) % 1;
  }
  if (next.trap !== undefined) {
    colorStyle.trap = Array.isArray(next.trap) && next.trap.length === 2 && next.trap.every(Number.isFinite) ? [next.trap[0], next.trap[1]] : null;
  }
  if (prev.style !== colorStyle.style || prev.density !== colorStyle.density || prev.offset !== colorStyle.offset
    || String(prev.trap) !== String(colorStyle.trap)) {
    labelColormapButton();
    requestRender();
  }
}
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

// The vector views' counterpart: while a drag, pinch or wheel zoom is in
// progress they draw at a coarser pixel limit (opts.lite), because a full
// frame of the dragon at depth 16 took 200-400 ms per move on a phone-speed
// CPU and the pinch looked frozen. Full detail returns when the last finger
// lifts, or 150 ms after the last wheel tick.
let vectorLite = false;
let vectorLiteTimer = null;
function markVectorInteracting() {
  vectorLite = true;
  if (vectorLiteTimer) clearTimeout(vectorLiteTimer);
  vectorLiteTimer = setTimeout(endVectorInteracting, 150);
}
function endVectorInteracting() {
  if (vectorLiteTimer) clearTimeout(vectorLiteTimer);
  vectorLiteTimer = null;
  if (!vectorLite) return;
  vectorLite = false;
  requestRender();
}

// Live frames at a frame-time-driven resolution. During a flight or a pinch
// each frame is one full-size pass; on a phone a heavy view or style can take
// longer than a frame, and the flight or pinch stutters. When frames arrive
// late (two frames' worth of time between draws, three times running) the
// next live frames are drawn at a step smaller, scaled up; when they're on
// time for a good while, a step bigger. The step is kept between gestures that
// follow each other, and starts over at full size after a pause. The render
// when the gesture or flight settles is always full size.
const LIVE_STEPS = [1, 1.5, 2, 3, 4];
const liveRes = { step: 0, last: 0, late: 0, onTime: 0 };
function adaptLiveResolution(now = performance.now()) {
  const dt = now - liveRes.last;
  liveRes.last = now;
  if (dt > 1500) { liveRes.step = 0; liveRes.late = 0; liveRes.onTime = 0; }
  else if (dt > 150) { liveRes.late = 0; liveRes.onTime = 0; } // a gap, not a slow frame
  else if (dt > 25) { liveRes.onTime = 0; liveRes.late++; }
  else if (dt < 19) { liveRes.late = 0; liveRes.onTime++; }
  let step = liveRes.step;
  if (liveRes.late >= 3 && step < LIVE_STEPS.length - 1) { step++; liveRes.late = 0; }
  else if (liveRes.onTime >= 45 && step > 0) { step--; liveRes.onTime = 0; }
  liveRes.step = step;
  mainRenderer.setLiveDivisor(LIVE_STEPS[step]);
  juliaRenderer.setLiveDivisor(LIVE_STEPS[step]);
}

const mainRenderer = createFractalRenderer(els.mainCanvas);
const juliaRenderer = createFractalRenderer(els.juliaCanvas);
const kochView = createKochView(els.kochCanvas);
const treeView = createPythagorasTreeView(els.treeCanvas);
const hexaflakeView = createHexaflakeView(els.hexaflakeCanvas);
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
    // Carry the current view across the reload as a share link, so a deep
    // zoom isn't lost at exactly the moment memory pressure hits.
    // replaceState, not location.hash: that would fire hashchange, whose
    // handler strips the hash again before the reload commits.
    try { history.replaceState(null, "", location.pathname + location.search + buildShareHash()); } catch { /* reload to the default view */ }
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
    // Mirrors the view's imaginary axis (the Burning Ship's classic upright
    // picture); cx/cy stay real coordinates. See screenToComplex.
    flipY: !!config.flipY,
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
// Carpet/Gasket and the Apollonian gasket ignore maxIter entirely
// (ignoresMaxIter) and are skipped.
function applyAutoIter() {
  for (const st of [mainState, dualActive ? juliaState : null]) {
    if (!st || st.iterAutoLocked) continue;
    if (ignoresMaxIter(st.ftype)) continue;
    st.maxIter = suggestedMaxIter(st.baseScale, st.scale);
  }
  const shown = activePane === "julia" && dualActive && juliaState ? juliaState : mainState;
  els.iterSlider.value = shown.maxIter;
}

let mainState = freshState(FRACTAL_CONFIGS[currentName]);
let juliaState = null; // populated when dual mode is entered
let mainHistory = [];
let juliaHistory = [];

const curveBoxCache = new Map(); // vectorViewBox's boxes for the line curves, by curve and depth
const kochState = { depth: 4, fill: true };
const treeState = { depth: 9 };
const HEXAFLAKE_DEFAULT_DEPTH = 4;
const HEXAFLAKE_MAX_DEPTH = 6; // the depth slider's max in index.html: at the fitted view level 6 is already about a pixel across
const hexaflakeState = { depth: HEXAFLAKE_DEFAULT_DEPTH };
// Each line curve keeps its own depth; dragonState.depth reads/writes the
// one currently shown, so code written for the dragon alone still works.
const curveDepths = Object.fromEntries(Object.entries(LINE_CURVES).map(([k, c]) => [k, c.defaultDepth]));
const dragonState = {
  get depth() { return curveDepths[dragonView.curve]; },
  set depth(v) { curveDepths[dragonView.curve] = v; },
};
const fernState = { count: 1000000 };
// Solid color (a SOLID_COLORS index) per line/shape mode. The escape-time
// fractals keep the gradient colormapIndex; these used to sample it by
// depth, which left low depths near-black and hard to see. The four chaos-game
// modes (fern.js) each have one too: the picked color is the base that their
// transforms turn the hue of, so each starts in its own color.
const solidIndex = (name) => SOLID_COLORS.findIndex((c) => c.name === name);
const vectorColors = {
  koch: solidIndex("Ice"), tree: solidIndex("Green"), hexaflake: solidIndex("Green"), dragon: solidIndex("Autumn"),
  hilbert: solidIndex("Violet"), gosper: solidIndex("Rose"), arrowhead: solidIndex("Gold"),
  fern: solidIndex("Green"), sierpinski: solidIndex("Violet"), levy: solidIndex("Rose"), vicsek: solidIndex("Gold"),
};

function pushHistory(pane) {
  const st = pane === "julia" ? juliaState : mainState;
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  if (!st) return;
  hist.push({ cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation || 0, flipY: !!st.flipY });
  if (hist.length > 50) hist.shift();
}

function popHistory(pane) {
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  const snap = hist.pop();
  if (!snap) return;
  const st = pane === "julia" ? juliaState : mainState;
  st.cx = snap.cx; st.cy = snap.cy; st.scale = snap.scale; st.rotation = snap.rotation ?? 0; st.flipY = !!snap.flipY;
  applyAutoIter();
  renderAll();
}

