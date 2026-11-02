// Rendering and layout: updateLUT, layoutCanvasArea, renderAll, progressive refinement, requestRender,
// and the HUD card (its number and text formatting is in hud-format.js, the screen/complex conversions
// in view-math.js). Needs the state (state.js, state-colors.js), deepzoom.js and
// fractal-defs.js; calls into modes, interaction and the later scripts only inside function bodies.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { COLORMAPS, buildLUTBytes } from "./colormaps.js?v=1.54.2";
import { FRACTAL_CONFIGS, FTYPE, fractalLabel } from "./configs.js?v=1.54.2";
import { Diag } from "./diag.js?v=1.54.2";
import { EXTRA_MODES, SHAPE_INFO, apolloFrame, digitFractalDepth, isCurveMode, isDigitFractal, isIfsMode } from "./fractal-defs.js?v=1.54.2";
import { DEEP_ZOOM_THRESHOLD, SAMPLE_OFFSETS, atZoomLimit, newtonDeepEligible, perturbationEligibleType, phoenixDeepEligible } from "./deepzoom.js?v=1.54.2";
import { TELEPORT_DESTINATIONS } from "./places.js?v=1.54.2";
import { COLOR_STYLES, ESCAPE_TIME_TYPES, colorStyle, styleDrawn } from "./color-styles.js?v=1.54.2";
import { activePane, adaptLiveResolution, currentName, dragonState, dragonView, dualActive, els, fernState, fernView, hexaflakeState, hexaflakeView, hudVisible, isInteracting, juliaHistory, juliaRenderer, juliaState, kochState, kochView, mainHistory, mainRenderer, mainState, mode, treeState, treeView, vectorColors } from "./state.js?v=1.54.2";
import { colormapIndex, vectorLite } from "./state-colors.js?v=1.54.2";
import { dualPresetName } from "./modes.js?v=1.54.2";
import { dragonNav, fernNav, hexaflakeNav, kochNav, treeNav, vectorFitHalfHeight } from "./interaction.js?v=1.54.2";
import { flash, updateCompasses } from "./compass-ui.js?v=1.54.2";
import { teleportLandingIndex } from "./teleport.js?v=1.54.2";
import { cmGradient, labelColorButton } from "./colormap-picker.js?v=1.54.2";
import { COLOR_LOOKS, bandsText, colorSheetStyles, currentLookId, lookPalette, shiftText } from "./color-sheet.js?v=1.54.2";
import { apolloCurvatureText, capitalize, formatHudCoords, rotationHudText, scaleBar, unitsPerCssPx, zoomPhrase } from "./hud-format.js?v=1.54.2";
import { normalizeAngle } from "./view-math.js?v=1.54.2";

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
  if (!colorSheetStyles()) { labelColorButton(els.colormapBtn, "Choose colormap", name); return; }
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
export function deepZoomEligible(renderer, state) {
  return (renderer.perturbationSupported
    && perturbationEligibleType(state)
    && state.scale < DEEP_ZOOM_THRESHOLD)
    || (renderer.newtonDeepSupported && newtonDeepEligible(state))
    || (renderer.phoenixDeepSupported && phoenixDeepEligible(state));
}

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
    updateHud();
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
      fitHalfHeight: vectorFitHalfHeight(dragonView.curve),
    });
    updateDragonHud();
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
  const canGoBack = nav ? nav.canGoBack() : (activePane === "julia" ? juliaHistory : mainHistory).length > 0;
  const btn = nav ? els[`${isCurveMode(mode) ? "dragon" : isIfsMode(mode) ? "fern" : mode}BackBtn`] : els.backBtn;
  if (btn.disabled === canGoBack) btn.disabled = !canGoBack;
}

export function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderAll(); });
}

// Info overlay (see #hud in index.html): the title (a place name, or the
// fractal or pattern), a plain-language line (how deep, rotation), a scale
// bar for the pane's height in world units (unitsPerPx), and for the WebGL
// fractals the center point and a quieter technical readout. A pattern shape
// also passes `about` ({ lines: [two short lines], credit } from SHAPE_INFO):
// a short description between the title and the plain line, and a quiet
// credit line when it has one. Left out, that block stays hidden.
// Runs every render frame, so it does nothing while the overlay is hidden
// (showing it re-renders, see applyHudVisibility) or when nothing changed.
export let lastHudKey = "";
export function setHud(name, plainParts, { unitsPerPx = 0, center = "", tech = "", about = null } = {}) {
  if (!hudVisible) return;
  const parts = plainParts.filter(Boolean);
  const bar = unitsPerPx > 0 && Number.isFinite(unitsPerPx) ? scaleBar(unitsPerPx) : null;
  const key = [name, about && about.lines.join("\n"), about && about.credit, ...parts, bar && bar.px.toFixed(1), bar && bar.label, center, tech].join("\n");
  if (key === lastHudKey) return;
  lastHudKey = key;
  els.hudName.textContent = name;
  els.hudAbout.classList.toggle("hidden", !about);
  if (about) {
    els.hudAboutLines.forEach((p, i) => { p.textContent = about.lines[i] || ""; });
    els.hudCredit.textContent = about.credit || "";
    els.hudCredit.classList.toggle("hidden", !about.credit);
  }
  els.hudPlain.replaceChildren(...parts.map((t) => {
    const span = document.createElement("span");
    span.textContent = t;
    return span;
  }));
  els.hudScale.classList.toggle("hidden", !bar);
  if (bar) {
    els.hudBar.style.width = `${bar.px.toFixed(1)}px`;
    els.hudScaleText.textContent = bar.label;
  }
  els.hudCenter.textContent = center;
  els.hudCenter.classList.toggle("hidden", !center);
  els.hudStats.textContent = tech;
  els.hudStats.classList.toggle("hidden", !tech);
  fitHudAbout(); // last: it measures the card as it now is
}

// A pattern's description must not cover the shape: the card may reach down
// to the middle of the canvas area (where the shape sits) and no further. It
// tries the full description (two lines and the credit), then the first line
// alone, then none, whichever first leaves the card above that line (CSS:
// #hud[data-about], index.html). So a landscape phone, where the base card
// already reaches the middle, and very large text show the card as it was
// before descriptions. Measured only when the card's content changes or the
// canvas area is resized (refitHud), never per frame.
export const HUD_ABOUT_LEVELS = ["full", "first", "none"];
export function fitHudAbout() {
  if (els.hudAbout.classList.contains("hidden")) { delete els.hud.dataset.about; return; }
  const limit = els.canvasArea.clientHeight / 2;
  let level = "";
  for (level of HUD_ABOUT_LEVELS) {
    els.hud.dataset.about = level;
    if (els.hud.offsetTop + els.hud.offsetHeight <= limit) break;
  }
}
// The next setHud re-renders the card and re-fits it (called when the canvas area changes size).
export function refitHud() {
  lastHudKey = "";
}

// Dual view: a small label on the Julia pane, shown with the info card.
export function updateJuliaLabel() {
  const show = hudVisible && mode === "fractal" && dualActive;
  els.juliaLabel.classList.toggle("hidden", !show);
  if (!show) return;
  const preset = dualPresetName();
  const text = preset ? `${FRACTAL_CONFIGS[preset].label}: Julia set of the center point` : "Julia set of the center point";
  if (els.juliaLabel.textContent !== text) els.juliaLabel.textContent = text;
  els.juliaLabel.style.top = `${els.juliaCanvas.offsetTop + 10}px`;
  els.juliaLabel.style.left = `${els.juliaCanvas.offsetLeft + 10}px`;
}

export function updateHud() {
  const s = mainState;
  const eligibleType = perturbationEligibleType(s);
  // Carpet/Gasket ignore the iter slider entirely (zoom-derived depth in
  // the shader) — showing "maxIter: 300" would misleadingly imply it still
  // does something, the same mismatch that caused the coloring bug.
  const usesFixedDepth = isDigitFractal(s.ftype);
  const c = mainRenderer.canvas;
  const apollo = s.ftype === FTYPE.APOLLONIAN ? apolloFrame(s.cx, s.cy, s.scale, c.width / c.height) : null;
  let precision = "float32";
  if (apollo) {
    if (apollo.steps > 0) precision = "composed inversions (deep zoom)";
  } else if (usesFixedDepth) {
    if (s.scale < DEEP_ZOOM_THRESHOLD) precision = "cell rebasing (deep zoom)";
  } else if (s.ftype === FTYPE.NOVA) {
    // Float32 only; limitScale holds the zoom where it stops being sharp.
    precision = atZoomLimit(s) ? "float32 (zoom limit: no deeper without losing detail)" : "float32";
  } else if (isInteracting && deepZoomEligible(mainRenderer, s)) {
    precision = "preview (renders at deep zoom once you stop)";
  } else if (lastMainDeepPath) {
    precision = `${lastMainDeepPath} (deep zoom)`;
  } else if (s.scale < DEEP_ZOOM_THRESHOLD) {
    // Newton near 0 and Phoenix above 1e-4 are float32 by design (see
    // newtonDeepEligible, PHOENIX_DEEP_THRESHOLD); past that, say why the
    // fixed-point path isn't drawing.
    const fixedReason = mainRenderer.webgl2
      ? "float32 (deep zoom unavailable: failed its self-test on this device)"
      : "float32 (deep zoom unavailable: needs WebGL2)";
    if (s.ftype === FTYPE.NEWTON) {
      if (newtonDeepEligible(s)) precision = fixedReason;
    } else if (s.ftype === FTYPE.PHOENIX) {
      if (phoenixDeepEligible(s)) precision = fixedReason;
    } else if (!mainRenderer.perturbationSupported) {
      precision = "float32 (deep zoom unavailable: no float texture support)";
    } else if (!eligibleType) {
      precision = "float32 (deep zoom unsupported for this fractal type)";
    }
  }
  const depth = usesFixedDepth ? digitFractalDepth(s.ftype, s.scale, c.height, c.width / c.height) : 0;
  const iterText = apollo ? `depth: ${apollo.steps} inversions`
    : usesFixedDepth ? `depth: ${depth} (auto)` : `maxIter: ${s.maxIter}${s.iterAutoLocked ? "" : " (auto)"}`;
  // A Surprise-me destination's name, for as long as the view is still the
  // one the flight landed on -- including its rotation, for a destination
  // that sets one (any turn away from it ends the match; mod 2pi, so a
  // landing at PI still matches a rotation stored as -PI).
  const d = TELEPORT_DESTINATIONS[teleportLandingIndex];
  const sameTurn = !d || d.rotation === undefined || Math.abs(normalizeAngle((s.rotation || 0) - d.rotation)) < 1e-12;
  const place = d && d.fractal === currentName && Number(d.re) === s.cx && Number(d.im) === s.cy && d.scale === s.scale && sameTurn ? d.label : "";
  const f = formatHudCoords(s.cx, s.cy, s.scale);
  const label = fractalLabel(currentName);
  const deep = zoomPhrase(s.baseScale, s.scale);
  const styleHud = colorStyleHud(s);
  setHud(place || label, [
    place ? `${label}, ${deep}` : capitalize(deep),
    apollo ? apolloCurvatureText(s.cx, s.cy, s.scale) : "",
    atZoomLimit(s) ? "As deep as this fractal goes" : "",
    rotationHudText(s.rotation),
    styleHud.plain,
  ], {
    unitsPerPx: unitsPerCssPx(s.scale, mainRenderer.canvas),
    center: f.center,
    tech: `scale: ${f.scale}   ${iterText}   precision: ${precision}${styleHud.tech}`,
  });
}

// The info card's color style items, empty unless the view isn't drawn in
// the default coloring (Smooth): "Edge glow" (a Look) or
// "Custom: stripes, Plasma" on the plain line, and the technical line adds
// style, bands and shift where they aren't the defaults.
export function colorStyleHud(s) {
  const none = { plain: "", tech: "" };
  if (!ESCAPE_TIME_TYPES.includes(s.ftype)) return none;
  const id = styleDrawn(colorStyle.style, s);
  const { density, offset } = colorStyle;
  if (id === "smooth" && density === 1 && offset === 0) return none;
  const palette = COLORMAPS[colormapIndex].name;
  const look = density === 1 && offset === 0 ? COLOR_LOOKS.find((l) => l.style === id && lookPalette(l) === palette) : null;
  const label = COLOR_STYLES.find((c) => c.id === id).label;
  const tech = [id !== "smooth" ? `style: ${label}` : "", density !== 1 ? `repeat: ${bandsText(density)}` : "", offset !== 0 ? `shift: ${shiftText(offset)}` : ""]
    .filter(Boolean).join("   ");
  return { plain: look ? look.label : `Custom: ${label}, ${palette}`, tech: tech ? `   ${tech}` : "" };
}

// Pattern modes are titled with their picker label (EXTRA_MODES).
export function modeLabel(key) {
  return EXTRA_MODES.find((m) => m.key === key).label;
}

// Scale bar for a pattern's view (Canvas2D views keep halfHeight).
// and the shape's description from SHAPE_INFO (key: its EXTRA_MODES key).
export const patternBar = (view, canvas, key) => ({ unitsPerPx: unitsPerCssPx(view.halfHeight, canvas), about: SHAPE_INFO[key] });

// "Depth 8" plus, once zooming in has added levels beyond the slider's, the
// number added: "Depth 8 (+3 from zoom)".
export const depthHudText = (depth, extraLevels) => `Depth ${depth}${extraLevels > 0 ? ` (+${extraLevels} from zoom)` : ""}`;

export function updateKochHud() {
  setHud(modeLabel("koch"), [`${depthHudText(kochState.depth, kochView.extraLevels)}, ${kochState.fill ? "filled" : "outline"}`, rotationHudText(kochView.view.rotation)],
    patternBar(kochView.view, els.kochCanvas, "koch"));
}

export function updateTreeHud() {
  setHud(modeLabel("tree"), [depthHudText(treeState.depth, treeView.extraLevels), rotationHudText(treeView.view.rotation)],
    patternBar(treeView.view, els.treeCanvas, "tree"));
}

export function updateHexaflakeHud() {
  setHud(modeLabel("hexaflake"), [depthHudText(hexaflakeState.depth, hexaflakeView.extraLevels), rotationHudText(hexaflakeView.view.rotation)],
    patternBar(hexaflakeView.view, els.hexaflakeCanvas, "hexaflake"));
}

export function updateDragonHud() {
  setHud(modeLabel(dragonView.curve), [depthHudText(dragonState.depth, dragonView.extraLevels), rotationHudText(dragonView.view.rotation)],
    patternBar(dragonView.view, els.dragonCanvas, dragonView.curve));
}

export function updateFernHud() {
  // accepted = points actually on screen so far; it climbs toward the
  // target as refinement runs, and resets on every pan/zoom.
  setHud(modeLabel(fernView.system), [`${fernView.accepted.toLocaleString()} of ${fernState.count.toLocaleString()} points`, rotationHudText(fernView.view.rotation)],
    patternBar(fernView.view, els.fernCanvas, fernView.system));
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


