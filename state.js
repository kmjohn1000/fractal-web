// App state that calls nothing in render-layout.js or share.js: the DOM handles (els), the shared
// `let`s with their setters, the renderers and views, the live-resolution adaptation and the per-pane
// states and histories (the color styles are in color-styles.js). Imports configs.js, fractal-defs.js,
// colormaps.js (SOLID_COLORS), renderer.js and the views from koch.js and friends. Nothing here
// imports the files that use it, and renderer.js does not import this file (it is handed what it
// reads, see rendererHost), so they can depend on this file and it on none of them; state-colors.js
// holds the functions that do call them.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { SOLID_COLORS } from "./colormaps.js?v=1.54.2";
import { FRACTAL_CONFIGS } from "./configs.js?v=1.54.2";
import { LINE_CURVES, createCurveView } from "./dragon.js?v=1.54.2";
import { createIfsView } from "./fern.js?v=1.54.2";
import { createHexaflakeView } from "./hexaflake.js?v=1.54.2";
import { createKochView } from "./koch.js?v=1.54.2";
import { createPythagorasTreeView } from "./pythagoras.js?v=1.54.2";
import { ignoresMaxIter, suggestedMaxIter, viewFromBounds } from "./fractal-defs.js?v=1.54.2";
import { createFractalRenderer } from "./renderer.js?v=1.54.2";

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

// ---------------------------------------------------------------- shared state

export let currentName = "Mandelbrot";
export let dualActive = false;
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

// What the renderers read of this file's state, as calls: renderer.js imports nothing from here (so the
// two files are not a cycle), and these read the live values when a frame is drawn.
export const rendererHost = { isInteracting: () => isInteracting, currentName: () => currentName };
export const mainRenderer = createFractalRenderer(els.mainCanvas, rendererHost);
export const juliaRenderer = createFractalRenderer(els.juliaCanvas, rendererHost);
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
// depth, which left low depths near-black and hard to see. The five chaos-game
// modes (fern.js) each have one too: the picked color is the base that their
// transforms turn the hue of, so each starts in its own color.
export const solidIndex = (name) => SOLID_COLORS.findIndex((c) => c.name === name);
export const vectorColors = {
  koch: solidIndex("Ice"), tree: solidIndex("Green"), hexaflake: solidIndex("Gold"), dragon: solidIndex("Autumn"),
  hilbert: solidIndex("Violet"), gosper: solidIndex("Rose"), arrowhead: solidIndex("Gold"),
  fern: solidIndex("Green"), sierpinski: solidIndex("Violet"), pentagon: solidIndex("Ice"), levy: solidIndex("Rose"), vicsek: solidIndex("Gold"),
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
export function setHudVisible(v) { hudVisible = v; }
export function setActivePane(v) { activePane = v; }
export function setIsInteracting(v) { isInteracting = v; }
export function setSettleTimer(v) { settleTimer = v; }
export function setMainState(v) { mainState = v; }
export function setJuliaState(v) { juliaState = v; }
export function setMainHistory(v) { mainHistory = v; }
export function setJuliaHistory(v) { juliaHistory = v; }
