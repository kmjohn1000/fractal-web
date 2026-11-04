// Rendering and layout: updateLUT, layoutCanvasArea, renderAll, progressive refinement, requestRender,
// and the crosshair. The info card is in hud.js (its number and text formatting in hud-format.js), the
// screen/complex conversions in view-math.js. Needs the state (state.js, state-colors.js), deepzoom.js and
// fractal-defs.js; calls into modes, interaction and the later scripts only inside function bodies.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { COLORMAPS, buildLUTBytes } from "./colormaps.js?v=1.66.0";
import { Diag } from "./diag.js?v=1.66.0";
import { isCurveMode, isIfsMode } from "./fractal-defs.js?v=1.66.0";
import { SAMPLE_OFFSETS, deepZoomEligible } from "./deepzoom.js?v=1.66.0";
import { activePane, adaptLiveResolution, dragonState, dragonView, dualActive, els, fernState, fernView, hexaflakeState, hexaflakeView, isInteracting, juliaRenderer, juliaState, kochState, kochView, mainRenderer, mainState, mode, paneHistory, treeState, treeView, vectorColors } from "./state.js?v=1.66.0";
import { colormapIndex, vectorLite } from "./state-colors.js?v=1.66.0";
import { dragonNav, fernNav, hexaflakeNav, kochNav, treeNav, vectorFitHalfHeight } from "./vector-interaction.js?v=1.66.0";
import { flash, prefersReducedMotion, updateCompasses } from "./compass-ui.js?v=1.66.0";
import { cmGradient, labelColorButton } from "./colormap-picker.js?v=1.66.0";
import { COLOR_LOOKS, colorSheetStyles, currentLookId } from "./color-sheet.js?v=1.66.0";
import { updateDragonHud, updateFernHud, updateHexaflakeHud, updateHud, updateJuliaLabel, updateKochHud, updateTreeHud } from "./hud.js?v=1.66.0";

// ---------------------------------------------------------------- rendering + layout

export function updateLUT() {
  const bytes = buildLUTBytes(COLORMAPS[colormapIndex].stops);
  mainRenderer.setLUT(bytes);
  juliaRenderer.setLUT(bytes);
  const cm = COLORMAPS[colormapIndex];
  els.colormapPill.style.background = cmGradient(cm.stops);
  labelColormapButton();
}

// The color button names the palette and the Look (or "Custom") too, so a screen reader hears what the screen is showing: the
// pill can't change without touching the fixed toolbar.
export function labelColormapButton() {
  const name = COLORMAPS[colormapIndex].name;
  if (!colorSheetStyles()) { labelColorButton(els.colormapBtn, "Choose palette", name); return; }
  const look = COLOR_LOOKS.find((l) => l.id === currentLookId());
  labelColorButton(els.colormapBtn, "Choose colors", `${look ? look.label : "Custom"}, ${name}`);
}

export function layoutCanvasArea() {
  const stacked = els.canvasArea.clientWidth < els.canvasArea.clientHeight;
  els.canvasArea.classList.toggle("stacked", dualActive && stacked);
  els.canvasArea.classList.toggle("row", dualActive && !stacked);
}

// The main pane's last render() result: "perturbation", "fixed point" or null.
export let lastMainDeepPath = null;
export let lastJuliaDeepPath = null;

// What the dot shapes' view draws from: its point count and color, and what to
// call as its points fill in; the chaos-game replay (teleport.js) starts from the same.
export function fernRenderOpts() {
  return {
    count: fernState.count,
    colorIndex: vectorColors[fernView.system],
    isActive: () => mode === fernView.system,
    onProgress: updateFernHud,
  };
}

export function renderAll() {
  updateBackButtons();
  if (mode === "fractal") {
    if (isInteracting) adaptLiveResolution();
    if (isInteracting && deepZoomEligible(mainRenderer, mainState)) {
      mainRenderer.renderPreview(mainState);
    } else {
      lastMainDeepPath = mainRenderer.render(mainState);
    }

    // The dual-mode Julia pane can be deep-zoomed too (perturbation covers
    // Julia mode), so it gets the same preview while interacting.
    if (dualActive && juliaState) {
      // The Julia pane's c is always the main pane's center, synced here so
      // every way the main view moves (drag, pinch, wheel, keys, Back,
      // teleport, tap-to-glide, share links) carries the Julia set with it.
      // A deep-zoomed Julia pane keeps its last-frame preview while c moves
      // -- a live float32 frame at that depth would be unrelated content --
      // and re-renders for the new c when the gesture settles.
      juliaState.juliaC = [mainState.cx, mainState.cy];
      if (isInteracting && deepZoomEligible(juliaRenderer, juliaState)) {
        juliaRenderer.renderPreview(juliaState);
      } else {
        lastJuliaDeepPath = juliaRenderer.render(juliaState);
      }
      positionCrosshair();
    }
    updateHud(lastMainDeepPath);
    scheduleRefinement();
  } else if (mode === "koch") {
    kochView.render({ depth: kochState.depth, fill: kochState.fill, colorIndex: vectorColors.koch, fitHalfHeight: vectorFitHalfHeight("koch"), lite: vectorLite });
    updateKochHud();
    // A new generation growing in needs a frame after this one.
    if (kochView.growing) requestRender();
  } else if (mode === "tree") {
    treeView.render({ depth: treeState.depth, colorIndex: vectorColors.tree, fitHalfHeight: vectorFitHalfHeight("tree"), lite: vectorLite });
    updateTreeHud();
  } else if (mode === "hexaflake") {
    hexaflakeView.render({ depth: hexaflakeState.depth, colorIndex: vectorColors.hexaflake, fitHalfHeight: vectorFitHalfHeight("hexaflake"), lite: vectorLite });
    updateHexaflakeHud();
  } else if (isCurveMode(mode)) {
    dragonView.render({
      depth: dragonState.depth, colorIndex: vectorColors[dragonView.curve], lite: vectorLite,
      fitHalfHeight: vectorFitHalfHeight(dragonView.curve), animate: !prefersReducedMotion(),
    });
    updateDragonHud();
    // The Penrose tiling's level change is a cross-fade that needs a frame after this one.
    if (dragonView.animating) requestRender();
  } else {
    fernView.render(fernRenderOpts());
    updateFernHud();
  }
  updateCompasses();
  updateJuliaLabel();
}

// Progressive supersampling: after renderAll draws sample 0, add the rest of
// SAMPLE_OFFSETS one per animation frame. Any later renderAll (every gesture
// frame, colormap change, etc.) bumps refineGeneration, which abandons the
// in-flight chain -- the canvas it was blending into was just overwritten
// by a fresh sample 0 for the new view. Skipped while interacting so
// gestures stay at full frame rate; the settle timer's requestRender then
// starts a fresh chain once the view stops moving.
export let refineGeneration = 0;
// False from the moment a render starts a refinement chain until that chain
// draws its last sample; share capture waits on it (captureShareBlob).
export let refineDone = true;
export let refineNext = 1; // the next sample this chain draws
export let refineTarget = SAMPLE_OFFSETS.length; // how many samples it draws in all
// Deep-zoom passes (perturbation and the exact paths) take 40-230 ms each on a
// phone, so the 16 of a full refinement take seconds. Those views stop after
// DEEP_PASSES: on an iPhone 15, 8 of 16 looked the same as 16 at Seahorse
// Valley, Mini Mandelbrot and a deep Newton view, 4 was slightly grainier
// (2026-10-22; TODO.md). Views drawn in plain float32 are cheap and always get
// all 16, and Save and Share finish the rest (finishRefinement). Diag.passesOverride
// ("#passes=16" for full quality, "#passes=6" to try fewer) replaces it for tests
// and tuning.
export const DEEP_PASSES = 8;
export function refinePassCount() {
  const deep = lastMainDeepPath || (dualActive && lastJuliaDeepPath);
  const n = Diag.passesOverride ?? DEEP_PASSES;
  return deep ? Math.min(SAMPLE_OFFSETS.length, n) : SAMPLE_OFFSETS.length;
}
export function refineStep(gen) {
  if (gen !== refineGeneration || mode !== "fractal" || isInteracting) return;
  mainRenderer.render(mainState, refineNext);
  if (dualActive && juliaState) juliaRenderer.render(juliaState, refineNext);
  if (++refineNext < refineTarget) requestAnimationFrame(() => refineStep(gen));
  else refineDone = true;
}
export function scheduleRefinement() {
  const gen = ++refineGeneration;
  refineDone = false;
  refineNext = 1;
  refineTarget = refinePassCount();
  if (isInteracting) return;
  requestAnimationFrame(() => refineStep(gen));
}
// A saved or shared image gets all 16 samples even where the screen stopped
// short: draw the rest now (a no-op for any view that already has them).
export function finishRefinement() {
  if (refineTarget >= SAMPLE_OFFSETS.length || mode !== "fractal" || isInteracting) return;
  refineTarget = SAMPLE_OFFSETS.length;
  if (refineDone) {
    refineDone = false;
    const gen = refineGeneration;
    requestAnimationFrame(() => refineStep(gen));
  }
}

export let renderPending = false;
// Back is dimmed while there's nothing to go back to. Every history push,
// pop or clear is followed by a render (gestures, Back, Reset, fractal and
// mode switches), so renderAll refreshes it instead of each of those sites.
// The vector navs are declared further down; renderAll first runs after
// they exist.
export function updateBackButtons() {
  const nav = mode === "koch" ? kochNav : mode === "tree" ? treeNav : mode === "hexaflake" ? hexaflakeNav
    : isCurveMode(mode) ? dragonNav : isIfsMode(mode) ? fernNav : null;
  const canGoBack = nav ? nav.canGoBack() : paneHistory(activePane).length > 0;
  const btn = nav ? els[`${isCurveMode(mode) ? "dragon" : isIfsMode(mode) ? "fern" : mode}BackBtn`] : els.backBtn;
  if (btn.disabled === canGoBack) btn.disabled = !canGoBack;
}

export function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderAll(); });
}

// Dual view's crosshair marks the main pane's center -- the Julia pane's c.
// Like the rotation compass, it shows while the main view moves (and once
// when dual view opens) and fades once it's still.
export const crosshairFlash = { hideTimer: null, lastView: null };
export function positionCrosshair() {
  if (!dualActive) { els.crosshair.classList.add("hidden"); return; }
  const rect = els.mainCanvas.getBoundingClientRect();
  els.crosshair.classList.remove("hidden");
  els.crosshair.style.left = `${rect.left + rect.width / 2}px`;
  els.crosshair.style.top = `${rect.top + rect.height / 2}px`;
  const v = crosshairFlash.lastView;
  const s = mainState;
  if (!v || v.cx !== s.cx || v.cy !== s.cy || v.scale !== s.scale || v.rotation !== s.rotation) {
    crosshairFlash.lastView = { cx: s.cx, cy: s.cy, scale: s.scale, rotation: s.rotation };
    flash(els.crosshair, crosshairFlash);
  }
}


