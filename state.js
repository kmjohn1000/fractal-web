// App state that calls nothing in render-layout.js or share.js: the DOM handles (els), the shared
// `let`s with their setters, the color styles (COLOR_STYLES, trap ranges), the renderers and views,
// the live-resolution adaptation and the per-pane states and histories. Needs configs.js,
// fractal-defs.js, colormaps.js (SOLID_COLORS), renderer.js and the views from koch.js and friends
// (all load before it). Nothing here reaches into the later scripts, so they can depend on this
// file and it on none of them; state-colors.js holds the functions that do call them.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
// It still reads the plain scripts' names as globals (configs.js, fractal-defs.js, colormaps.js and the
// views from koch.js and friends), which works because a module runs after every plain script.
import { createFractalRenderer } from "./renderer.js?v=1.53.8";

// ---------------------------------------------------------------- app state

export const els = {
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
  remProbe: document.getElementById("remProbe"),
  hudAbout: document.querySelector("#hud .hudAbout"),
  hudAboutLines: document.querySelectorAll("#hud .hudAboutLine"),
  hudCredit: document.querySelector("#hud .hudCredit"),
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

export let mode = "fractal"; // "fractal" | "koch" | "tree" | "hexaflake" | a LINE_CURVES key ("dragon", ...) | an IFS_SYSTEMS key ("fern", ...)

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
export const ESCAPE_TIME_TYPES = [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC, FTYPE.PHOENIX];
export const COLOR_STYLES = [
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
export const COLOR_BANDS_RANGE = [0.25, 8];
// A style's id in share links (st=); "c" is taken by the vector modes' solid
// color, so the three fields are st (style), cd (bands) and co (shift).
export const STYLE_LINK_CODES = new Map([["smooth", "sm"], ["bands", "bd"], ["glow", "de"], ["stripes", "sp"], ["point", "pt"], ["cross", "xt"], ["relief", "rl"]]);
// trap: an [x, y] override of the orbit traps' center (the checks use it to
// match the oracle); null for the per-fractal default, see trapCenterFor.
export const colorStyle = { style: "smooth", density: 1, offset: 0, trap: null };
export const TRAP_CENTERS = new Map([[FTYPE.ESCAPE, [-0.5, 0]], [FTYPE.SHIP, [-1.75, -0.03]], [FTYPE.TRICORN, [0, 0]], [FTYPE.CELTIC, [-0.5, 0]]]);
export function trapCenterFor(state) {
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
export const TRAP_LN_LO = -27.6310211, TRAP_LN_SPAN = 32.2361913;
export function decodeTrapRange(px) {
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
export function trapRangeFor(px, fixed) {
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
export function styleDrawn(id, state) {
  const s = COLOR_STYLES.find((c) => c.id === id);
  return s && !styleBlocked(s, state) ? s.id : "smooth";
}

// Why a style can't be drawn for this view: "type" (its fractal can't do it)
// or "depth" (too deep for the orbit traps), else null. The small allowance
// keeps a view set to exactly maxZoom on the right side of rounding.
export function styleBlocked(style, state) {
  if (!(style.types || ESCAPE_TIME_TYPES).includes(state.ftype)) return "type";
  if (style.maxZoom && !(state.baseScale / state.scale <= style.maxZoom * 1.001)) return "depth";
  return null;
}

// What the renderer sends the shaders for one view.
export function colorStyleFor(state) {
  const s = COLOR_STYLES.find((c) => c.id === styleDrawn(colorStyle.style, state));
  return { glsl: s.glsl, variant: s.variant, density: colorStyle.density, offset: colorStyle.offset,
    trap: s.variant === 3 ? trapCenterFor(state) : [0, 0] };
}

// ---------------------------------------------------------------- shared state

export let currentName = "Mandelbrot";
export let dualActive = false;
export let boxZoomActive = false;
export let fernBoxZoomActive = false; // separate toggle: the fern has its own control row
// Info overlay (#hud): hidden by default, one app-wide toggle shared by every
// mode's control row, so it persists across mode switches.
export let hudVisible = false;
export let activePane = "main"; // "main" | "julia" — which pane Back/box-zoom targets

// Perturbation rendering runs a CPU reference search (chooseReference) plus
// a heavy full-frame GPU pass — slow on mobile, often 100s of ms at high
// maxIter. The main canvas shows a moving preview (see renderAll) for the whole time
// isInteracting is true, so this delay only affects how soon it snaps back
// to an accurate render after you stop — no correctness risk either way,
// just responsiveness.
export let isInteracting = false;
export let settleTimer = null;

// Live frames at a frame-time-driven resolution. During a flight or a pinch
// each frame is one full-size pass; on a phone a heavy view or style can take
// longer than a frame, and the flight or pinch stutters. When frames arrive
// late (two frames' worth of time between draws, three times running) the
// next live frames are drawn at a step smaller, scaled up; when they're on
// time for a good while, a step bigger. The step is kept between gestures that
// follow each other, and starts over at full size after a pause. The render
// when the gesture or flight settles is always full size.
export const LIVE_STEPS = [1, 1.5, 2, 3, 4];
export const liveRes = { step: 0, last: 0, late: 0, onTime: 0 };
export function adaptLiveResolution(now = performance.now()) {
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

export const mainRenderer = createFractalRenderer(els.mainCanvas);
export const juliaRenderer = createFractalRenderer(els.juliaCanvas);
export const kochView = createKochView(els.kochCanvas);
export const treeView = createPythagorasTreeView(els.treeCanvas);
export const hexaflakeView = createHexaflakeView(els.hexaflakeCanvas);
export const dragonView = createCurveView(els.dragonCanvas);
export const fernView = createIfsView(els.fernCanvas);

if (!mainRenderer) reportError("WebGL context creation failed on mainCanvas — this browser/device may not support WebGL.");
if (!juliaRenderer) reportError("WebGL context creation failed on juliaCanvas.");

export function mainCanvasAspect() {
  const c = els.mainCanvas;
  return c.clientWidth > 0 && c.clientHeight > 0 ? c.clientWidth / c.clientHeight : 1;
}

export function freshState(config) {
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
export function applyAutoIter() {
  for (const st of [mainState, dualActive ? juliaState : null]) {
    if (!st || st.iterAutoLocked) continue;
    if (ignoresMaxIter(st.ftype)) continue;
    st.maxIter = suggestedMaxIter(st.baseScale, st.scale);
  }
  const shown = activePane === "julia" && dualActive && juliaState ? juliaState : mainState;
  els.iterSlider.value = shown.maxIter;
}

export let mainState = freshState(FRACTAL_CONFIGS[currentName]);
export let juliaState = null; // populated when dual mode is entered
export let mainHistory = [];
export let juliaHistory = [];

export const curveBoxCache = new Map(); // vectorViewBox's boxes for the line curves, by curve and depth
export const kochState = { depth: 4, fill: true };
export const treeState = { depth: 9 };
export const HEXAFLAKE_DEFAULT_DEPTH = 4;
export const HEXAFLAKE_MAX_DEPTH = 6; // the depth slider's max in index.html: at the fitted view level 6 is already about a pixel across
export const hexaflakeState = { depth: HEXAFLAKE_DEFAULT_DEPTH };
// Each line curve keeps its own depth; dragonState.depth reads/writes the
// one currently shown, so code written for the dragon alone still works.
export const curveDepths = Object.fromEntries(Object.entries(LINE_CURVES).map(([k, c]) => [k, c.defaultDepth]));
export const dragonState = {
  get depth() { return curveDepths[dragonView.curve]; },
  set depth(v) { curveDepths[dragonView.curve] = v; },
};
export const fernState = { count: 1000000 };
// Solid color (a SOLID_COLORS index) per line/shape mode. The escape-time
// fractals keep the gradient colormapIndex; these used to sample it by
// depth, which left low depths near-black and hard to see. The four chaos-game
// modes (fern.js) each have one too: the picked color is the base that their
// transforms turn the hue of, so each starts in its own color.
export const solidIndex = (name) => SOLID_COLORS.findIndex((c) => c.name === name);
export const vectorColors = {
  koch: solidIndex("Ice"), tree: solidIndex("Green"), hexaflake: solidIndex("Gold"), dragon: solidIndex("Autumn"),
  hilbert: solidIndex("Violet"), gosper: solidIndex("Rose"), arrowhead: solidIndex("Gold"),
  fern: solidIndex("Green"), sierpinski: solidIndex("Violet"), levy: solidIndex("Rose"), vicsek: solidIndex("Gold"),
};

export function pushHistory(pane) {
  const st = pane === "julia" ? juliaState : mainState;
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  if (!st) return;
  hist.push({ cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation || 0, flipY: !!st.flipY });
  if (hist.length > 50) hist.shift();
}

// ---------------------------------------------------------------- setters

// A file can read another file's top-level `let` but only the file that declares it can assign it
// (an imported binding is read-only in an ES module), so every other file goes through these.
export function setModeKey(v) { mode = v; } // not setMode: modes.js has a function of that name, the mode switcher
export function setCurrentName(v) { currentName = v; }
export function setDualActive(v) { dualActive = v; }
export function setBoxZoomActive(v) { boxZoomActive = v; }
export function setFernBoxZoomActive(v) { fernBoxZoomActive = v; }
export function setHudVisible(v) { hudVisible = v; }
export function setActivePane(v) { activePane = v; }
export function setIsInteracting(v) { isInteracting = v; }
export function setSettleTimer(v) { settleTimer = v; }
export function setMainState(v) { mainState = v; }
export function setJuliaState(v) { juliaState = v; }
export function setMainHistory(v) { mainHistory = v; }
export function setJuliaHistory(v) { juliaHistory = v; }
