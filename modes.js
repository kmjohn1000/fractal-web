// Fractal-type and mode switching: selectFractal, dual view, setMode and the menu's active state.
// Needs the state (state-colors.js), render-layout.js, places.js and fractal-defs.js; calls into
// interaction.js and the later scripts only inside function bodies.
"use strict";

// ---------------------------------------------------------------- fractal-type / mode switching

// Leaving a fractal stashes its live view here, and picking it again restores
// it, so switching never costs you your place (the colormap is already one
// global). In memory only: a fresh launch starts from the default views.
// Reset and share links want a clean slate and pass { fresh: true }.
const fractalMemory = new Map();

function selectFractal(name, { fresh = false } = {}) {
  cancelTeleport();
  if (dualActive && FRACTAL_CONFIGS[name].dualParent) { openPresetInDual(name); return; }
  // Picking the fractal already showing keeps its view; it only leaves a
  // vector mode (whose switch back lands here too).
  if (!fresh && name === currentName) { setMode("fractal"); return; }
  fractalMemory.set(currentName, { mainState, juliaState, mainHistory, juliaHistory });
  const remembered = fresh ? null : fractalMemory.get(name);
  currentName = name;
  const config = FRACTAL_CONFIGS[name];
  mainState = remembered ? remembered.mainState : freshState(config);
  mainHistory = remembered ? remembered.mainHistory : [];
  juliaHistory = [];
  // Same reasoning as exitDual(): if activePane was left on "julia" from
  // before this switch, Back would try to pop an empty array and silently
  // do nothing.
  activePane = "main";
  if (dualActive && !config.dual) dualActive = false;
  // dualActive stays one app-wide toggle; a remembered Julia pane (its own
  // view and Back history) comes back with its fractal.
  if (dualActive) enterDual(remembered && remembered.juliaState ? remembered : null);
  els.dualBtn.disabled = !config.dual && !config.dualParent;
  els.dualBtn.classList.toggle("active", dualActive);
  // Zoom-only tools. Everything in FRACTAL_CONFIGS is "zoom" today, but the
  // category is the rule; teleport also needs curated destinations, which
  // a new zoom fractal may not have yet.
  const isZoom = config.category === "zoom";
  els.boxZoomBtn.classList.toggle("hidden", !isZoom);
  els.teleportBtn.classList.toggle("hidden", !isZoom || !TELEPORT_DESTINATIONS.some((d) => d.fractal === name));
  // Carpet/Gasket and the Apollonian gasket set their own depth
  // (ignoresMaxIter) — the iter slider does
  // nothing for them, and leaving it enabled implied otherwise, which is
  // exactly the mismatch that made them render as almost solid black
  // before that was caught and fixed.
  const usesFixedDepth = ignoresMaxIter(config.ftype);
  els.iterSlider.disabled = usesFixedDepth;
  els.iterField.classList.toggle("hidden", usesFixedDepth);
  els.juliaCanvas.classList.toggle("hidden", !dualActive);
  if (!dualActive) els.crosshair.classList.add("hidden");
  layoutCanvasArea();
  setMode("fractal");
  // Refit now that layout is final: freshState ran above while the canvas
  // could still be hidden (coming from a vector mode) or about to change
  // size (Julia pane / iter slider shown or hidden). setMode only schedules
  // the render, so it picks this up. A remembered view is left as it was.
  if (!remembered) {
    const fitted = viewFromBounds(config.view, mainCanvasAspect());
    Object.assign(mainState, fitted, { baseScale: fitted.scale });
  }
  // A new fractal (or Reset) starts in auto iter mode; a remembered one
  // keeps its lock, and auto mode re-derives from its zoom.
  applyAutoIter();
  labelColormapButton(); // the Look it names depends on what this fractal draws
}

// from: a remembered { juliaState, juliaHistory } (see selectFractal) to bring
// back instead of opening a fresh Julia pane.
function enterDual(from = null) {
  const config = FRACTAL_CONFIGS[currentName];
  if (!config.dual) return;
  dualActive = true;
  // The Julia pane opens on the whole Julia set: no more zoomed in than the
  // fractal's own opening view. (It used to copy the main pane's zoom, which
  // from any zoomed-in view -- every Surprise-me place -- was a magnified
  // patch around the origin, a flat color that still paid for a deep render.)
  const juliaScale = Math.max(mainState.scale, mainState.baseScale);
  const sameZoom = juliaScale === mainState.scale;
  juliaState = from ? from.juliaState : {
    cx: 0, cy: 0, scale: juliaScale, rotation: 0,
    ftype: mainState.ftype, power: mainState.power,
    isJulia: true, juliaC: [mainState.cx, mainState.cy],
    // The slider drives both panes, so a manual lock carries over; auto
    // mode counts zoom from this pane's own opening scale. A pane at its
    // own, shallower zoom takes its own iteration budget, not the main
    // pane's (thousands, for a deep place).
    maxIter: sameZoom ? mainState.maxIter : suggestedMaxIter(juliaScale, juliaScale),
    baseScale: juliaScale,
    iterAutoLocked: sameZoom ? mainState.iterAutoLocked : false,
  };
  // c is the main pane's center, whichever pane this is.
  juliaState.juliaC = [mainState.cx, mainState.cy];
  crosshairFlash.lastView = null; // flash the crosshair as dual view opens
  juliaHistory = from ? from.juliaHistory : [];
  els.juliaCanvas.classList.remove("hidden");
  layoutCanvasArea();
  requestRender();
}

// A Julia preset in dual view: its parent set (dualParent) in the main pane,
// centered on the preset's c and zoomed in PRESET_DUAL_ZOOM times so you can
// see which part of the set c is in (the crosshair marks it), and the preset
// in the Julia pane -- at its opening framing, or at juliaView (the preset's
// own view, when the dual button is pressed on it). Panning the main pane
// moves c as usual; the Julia pane's label names the preset until it does.
const PRESET_DUAL_ZOOM = 4;
let dualPreset = null; // { name, c } of the last preset opened this way
function openPresetInDual(name, juliaView = null) {
  const preset = FRACTAL_CONFIGS[name];
  const [cx, cy] = preset.juliaC;
  dualActive = true;
  selectFractal(preset.dualParent, { fresh: true });
  Object.assign(mainState, { cx, cy, scale: mainState.baseScale / PRESET_DUAL_ZOOM });
  const jc = els.juliaCanvas;
  const aspect = jc.clientWidth > 0 && jc.clientHeight > 0 ? jc.clientWidth / jc.clientHeight : 1;
  const opening = viewFromBounds(preset.view, aspect);
  const jv = juliaView || { ...opening, rotation: 0, baseScale: opening.scale };
  Object.assign(juliaState, { cx: jv.cx, cy: jv.cy, scale: jv.scale, rotation: jv.rotation, baseScale: jv.baseScale, juliaC: [cx, cy] });
  if (juliaView && juliaView.iterAutoLocked) Object.assign(juliaState, { maxIter: juliaView.maxIter, iterAutoLocked: true });
  dualPreset = { name, c: [cx, cy], fromButton: !!juliaView };
  applyAutoIter();
  requestRender();
}

// The dual button closes a dual view it opened on a Julia preset by going back
// to that preset, in the view its pane has now, with its Back history: the
// Julia set was where you started, so dual view should add and remove the
// Mandelbrot, not the Julia. Once the main pane has moved c (a drag, or a tap
// that glides to a point) the Julia pane is no longer the preset, and a dual
// view that came from the picker started in the parent set; both just close
// the Julia pane (exitDual).
function closeDual() {
  const name = dualPreset && dualPreset.fromButton ? dualPresetName() : null;
  if (!name) { exitDual(); return; }
  const j = { ...juliaState };
  const history = juliaHistory;
  exitDual();
  selectFractal(name, { fresh: true });
  Object.assign(mainState, {
    cx: j.cx, cy: j.cy, scale: j.scale, rotation: j.rotation, baseScale: j.baseScale,
    maxIter: j.maxIter, iterAutoLocked: j.iterAutoLocked,
  });
  mainHistory = history;
  dualPreset = null;
  applyAutoIter();
  requestRender();
}

// The preset whose c the main pane is still centered on, if any.
function dualPresetName() {
  if (!dualActive || !dualPreset) return null;
  const p = FRACTAL_CONFIGS[dualPreset.name];
  return currentName === p.dualParent && mainState.cx === dualPreset.c[0] && mainState.cy === dualPreset.c[1] ? dualPreset.name : null;
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
  stopDepthPlay();
  mode = next;
  els.fractalTypeRow.classList.remove("open"); // collapse the picker on any mode switch
  els.shareMenu.classList.remove("open");
  els.colormapMenu.classList.remove("open");
  els.colorSheet.classList.remove("open");
  els.fractalControls.classList.toggle("hidden", mode !== "fractal");
  els.kochControls.classList.toggle("hidden", mode !== "koch");
  els.treeControls.classList.toggle("hidden", mode !== "tree");
  els.hexaflakeControls.classList.toggle("hidden", mode !== "hexaflake");
  els.dragonControls.classList.toggle("hidden", !isCurveMode(mode));
  els.fernControls.classList.toggle("hidden", !isIfsMode(mode));
  els.mainCanvas.classList.toggle("hidden", mode !== "fractal");
  els.juliaCanvas.classList.toggle("hidden", mode !== "fractal" || !dualActive);
  els.kochCanvas.classList.toggle("hidden", mode !== "koch");
  els.treeCanvas.classList.toggle("hidden", mode !== "tree");
  els.hexaflakeCanvas.classList.toggle("hidden", mode !== "hexaflake");
  els.dragonCanvas.classList.toggle("hidden", !isCurveMode(mode));
  if (isCurveMode(mode)) {
    // Same sharing as the IFS modes below, plus the depth slider, whose
    // range is per curve.
    if (dragonView.curve !== mode) {
      dragonView.setCurve(mode);
      dragonNav.clearHistory();
    }
    updateColorSwatches();
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

