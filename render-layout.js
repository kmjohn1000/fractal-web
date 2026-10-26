// Rendering and layout: updateLUT, layoutCanvasArea, renderAll, progressive refinement, requestRender,
// the HUD text and screen/complex conversions. Needs the state (state-colors.js), deepzoom.js and
// fractal-defs.js; calls into modes, interaction and the later scripts only inside function bodies.
"use strict";

// ---------------------------------------------------------------- rendering + layout

function updateLUT() {
  const bytes = buildLUTBytes(COLORMAPS[colormapIndex].stops);
  mainRenderer.setLUT(bytes);
  juliaRenderer.setLUT(bytes);
  const cm = COLORMAPS[colormapIndex];
  els.colormapPill.style.background = cmGradient(cm.stops);
  labelColormapButton();
}

// The color button names the palette and the Look (or "Custom") too, so a screen reader hears what the screen is showing: the
// pill can't change without touching the fixed toolbar.
function labelColormapButton() {
  const name = COLORMAPS[colormapIndex].name;
  if (!colorSheetStyles()) { labelColorButton(els.colormapBtn, "Choose colormap", name); return; }
  const look = COLOR_LOOKS.find((l) => l.id === currentLookId());
  labelColorButton(els.colormapBtn, "Choose colors", `${look ? look.label : "Custom"}, ${name}`);
}

function layoutCanvasArea() {
  const stacked = els.canvasArea.clientWidth < els.canvasArea.clientHeight;
  els.canvasArea.classList.toggle("stacked", dualActive && stacked);
  els.canvasArea.classList.toggle("row", dualActive && !stacked);
}

// The main pane's last render() result: "perturbation", "fixed point" or null.
let lastMainDeepPath = null;
let lastJuliaDeepPath = null;

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
  return (renderer.perturbationSupported
    && perturbationEligibleType(state)
    && state.scale < DEEP_ZOOM_THRESHOLD)
    || (renderer.newtonDeepSupported && newtonDeepEligible(state))
    || (renderer.phoenixDeepSupported && phoenixDeepEligible(state));
}

function renderAll() {
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
  } else if (mode === "tree") {
    treeView.render({ depth: treeState.depth, colorIndex: vectorColors.tree, fitHalfHeight: vectorFitHalfHeight("tree"), lite: vectorLite });
    updateTreeHud();
  } else if (mode === "hexaflake") {
    hexaflakeView.render({ depth: hexaflakeState.depth, colorIndex: vectorColors.hexaflake, fitHalfHeight: vectorFitHalfHeight("hexaflake"), lite: vectorLite });
    updateHexaflakeHud();
  } else if (isCurveMode(mode)) {
    dragonView.render({
      depth: dragonState.depth, colorIndex: vectorColors[dragonView.curve], lite: vectorLite,
      // Only the dragon is drawn from the viewport; the other curves have a fixed depth.
      fitHalfHeight: dragonView.curve === "dragon" ? vectorFitHalfHeight("dragon") : undefined,
    });
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
let refineGeneration = 0;
// False from the moment a render starts a refinement chain until that chain
// draws its last sample; share capture waits on it (captureShareBlob).
let refineDone = true;
let refineNext = 1; // the next sample this chain draws
let refineTarget = SAMPLE_OFFSETS.length; // how many samples it draws in all
// Deep-zoom passes (perturbation and the exact paths) take 40-230 ms each on a
// phone, so the 16 of a full refinement take seconds. Those views stop after
// DEEP_PASSES: on an iPhone 15, 8 of 16 looked the same as 16 at Seahorse
// Valley, Mini Mandelbrot and a deep Newton view, 4 was slightly grainier
// (2026-10-22; TODO.md). Views drawn in plain float32 are cheap and always get
// all 16, and Save and Share finish the rest (finishRefinement). Diag.passesOverride
// ("#passes=16" for full quality, "#passes=6" to try fewer) replaces it for tests
// and tuning.
const DEEP_PASSES = 8;
function refinePassCount() {
  const deep = lastMainDeepPath || (dualActive && lastJuliaDeepPath);
  const n = Diag.passesOverride ?? DEEP_PASSES;
  return deep ? Math.min(SAMPLE_OFFSETS.length, n) : SAMPLE_OFFSETS.length;
}
function refineStep(gen) {
  if (gen !== refineGeneration || mode !== "fractal" || isInteracting) return;
  mainRenderer.render(mainState, refineNext);
  if (dualActive && juliaState) juliaRenderer.render(juliaState, refineNext);
  if (++refineNext < refineTarget) requestAnimationFrame(() => refineStep(gen));
  else refineDone = true;
}
function scheduleRefinement() {
  const gen = ++refineGeneration;
  refineDone = false;
  refineNext = 1;
  refineTarget = refinePassCount();
  if (isInteracting) return;
  requestAnimationFrame(() => refineStep(gen));
}
// A saved or shared image gets all 16 samples even where the screen stopped
// short: draw the rest now (a no-op for any view that already has them).
function finishRefinement() {
  if (refineTarget >= SAMPLE_OFFSETS.length || mode !== "fractal" || isInteracting) return;
  refineTarget = SAMPLE_OFFSETS.length;
  if (refineDone) {
    refineDone = false;
    const gen = refineGeneration;
    requestAnimationFrame(() => refineStep(gen));
  }
}

let renderPending = false;
// Back is dimmed while there's nothing to go back to. Every history push,
// pop or clear is followed by a render (gestures, Back, Reset, fractal and
// mode switches), so renderAll refreshes it instead of each of those sites.
// The vector navs are declared further down; renderAll first runs after
// they exist.
function updateBackButtons() {
  const nav = mode === "koch" ? kochNav : mode === "tree" ? treeNav : mode === "hexaflake" ? hexaflakeNav
    : isCurveMode(mode) ? dragonNav : isIfsMode(mode) ? fernNav : null;
  const canGoBack = nav ? nav.canGoBack() : (activePane === "julia" ? juliaHistory : mainHistory).length > 0;
  const btn = nav ? els[`${isCurveMode(mode) ? "dragon" : isIfsMode(mode) ? "fern" : mode}BackBtn`] : els.backBtn;
  if (btn.disabled === canGoBack) btn.disabled = !canGoBack;
}

function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderAll(); });
}

// Only shown when non-zero. Shared by every mode's HUD (WebGL fractal + all four Canvas2D vector
// views) since they all support the same twist gesture.
function rotationHudText(rotation) {
  const rotDeg = (rotation || 0) * 180 / Math.PI;
  return Math.abs(rotDeg) > 0.5 ? `Rotated ${rotDeg.toFixed(0)}°` : "";
}

// Magnification relative to the fractal's opening view, in words past a
// thousand ("3.1 billion times"): what a person means by "how far in am I".
const ZOOM_WORDS = [[1e15, "quadrillion"], [1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
function formatZoom(baseScale, scale) {
  const z = baseScale / scale;
  if (z < 9.95) return `${Number(z.toFixed(1))}×`;
  if (z < 1000) return `${Math.round(z)}×`;
  const [n, word] = ZOOM_WORDS.find(([limit]) => z >= limit);
  return z / n < 1000 ? `${Number((z / n).toPrecision(2))} ${word} times` : `${z.toExponential(1)}×`;
}

// How deep the view is, for the info card: "415× deeper", "1.8 trillion
// times deeper", "The whole shape", or "Zoomed out 2×".
function zoomPhrase(baseScale, scale) {
  const z = baseScale / scale;
  if (Math.abs(Math.log(z)) < 0.05) return "the whole shape";
  return z < 1 ? `zoomed out ${formatZoom(scale, baseScale)}` : `${formatZoom(baseScale, scale)} deeper`;
}

// Map-style scale bar for a view showing unitsPerPx world units per CSS
// pixel: the 1, 2 or 5 x 10^n length whose bar comes closest to 64px (in
// log terms, so bars stay roughly 40-100px wide), and its label.
function scaleBar(unitsPerPx) {
  const target = 64 * unitsPerPx;
  const e = Math.floor(Math.log10(target));
  let best = null;
  for (const k of [e - 1, e, e + 1]) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** k;
      const d = Math.abs(Math.log(v / target));
      if (!best || d < best.d) best = { v, d, m, k };
    }
  }
  const sup = (n) => String(n).replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]);
  const label = best.k >= -4 && best.k <= 3 ? String(Number(best.v.toPrecision(1)))
    : best.m === 1 ? `10${sup(best.k)}` : `${best.m} × 10${sup(best.k)}`;
  return { px: best.v / unitsPerPx, label: `${label} across` };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Info overlay (see #hud in index.html): the title (a place name, or the
// fractal or pattern), a plain-language line (how deep, rotation), a scale
// bar for the pane's height in world units (unitsPerPx), and for the WebGL
// fractals the center point and a quieter technical readout.
// Runs every render frame, so it does nothing while the overlay is hidden
// (showing it re-renders, see applyHudVisibility) or when nothing changed.
let lastHudKey = "";
function setHud(name, plainParts, { unitsPerPx = 0, center = "", tech = "" } = {}) {
  if (!hudVisible) return;
  const parts = plainParts.filter(Boolean);
  const bar = unitsPerPx > 0 && Number.isFinite(unitsPerPx) ? scaleBar(unitsPerPx) : null;
  const key = [name, ...parts, bar && bar.px.toFixed(1), bar && bar.label, center, tech].join("\n");
  if (key === lastHudKey) return;
  lastHudKey = key;
  els.hudName.textContent = name;
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
}

// Dual view: a small label on the Julia pane, shown with the info card.
function updateJuliaLabel() {
  const show = hudVisible && mode === "fractal" && dualActive;
  els.juliaLabel.classList.toggle("hidden", !show);
  if (!show) return;
  const preset = dualPresetName();
  const text = preset ? `${FRACTAL_CONFIGS[preset].label}: Julia set of the center point` : "Julia set of the center point";
  if (els.juliaLabel.textContent !== text) els.juliaLabel.textContent = text;
  els.juliaLabel.style.top = `${els.juliaCanvas.offsetTop + 10}px`;
  els.juliaLabel.style.left = `${els.juliaCanvas.offsetLeft + 10}px`;
}

// World units per CSS pixel for a pane whose view is 2 * halfHeight tall.
function unitsPerCssPx(halfHeight, canvas) {
  return canvas.clientHeight > 0 ? (2 * halfHeight) / canvas.clientHeight : 0;
}

// Plain decimals while zoomed out (scale >= DEEP_ZOOM_THRESHOLD), where
// "-0.75 + 0.00i / 1.25" reads better than exponents; full-precision
// scientific notation once in deep-zoom territory, where the digits are
// the point.
function formatHudCoords(cx, cy, scale) {
  // Enough decimals to find the spot again from the card alone: the center
  // to within ~1/1000 of the view height (2 * scale), so one more decimal
  // per decade of zoom. Capped at 17, past which a float64 center holds no
  // more digits. Fixed-point at every depth: the precision that matters is
  // absolute, which scientific notation hides for centers near 0.
  const decimals = Math.min(17, Math.max(2, Math.ceil(3 - Math.log10(2 * scale))));
  const fmt = (v) => {
    let t = v.toFixed(decimals);
    // Trim trailing zeros, but keep at least 2 decimals (0.00, not 0).
    while (t.length - t.indexOf(".") - 1 > 2 && t.endsWith("0")) t = t.slice(0, -1);
    return t.replace(/^-(0\.0+)$/, "$1"); // no "-0.00"
  };
  return {
    center: `${fmt(cx)} + ${fmt(cy)}i`,
    scale: scale < DEEP_ZOOM_THRESHOLD ? scale.toExponential(3) : String(Number(scale.toPrecision(3))),
  };
}

// The Apollonian info card's line about the circle under the center (see
// apolloCenterCurvature), left out while that circle is too small to see:
// a center on the gasket lands in circles far below a pixel. Remembered
// for the last view: updateHud runs every frame, and near the gasket the
// walk can take thousands of steps.
let apolloCurvatureKey = "", apolloCurvatureLine = "";
function apolloCurvatureText(cx, cy, scale) {
  const key = `${cx},${cy},${scale}`;
  if (key !== apolloCurvatureKey) {
    const k = apolloCenterCurvature(cx, cy);
    apolloCurvatureKey = key;
    // Radius 1/k at least 1/200 of the view's half-height.
    apolloCurvatureLine = k === null || k * scale > 200 ? ""
      : k < 0 ? "Center: outside the outer circle (curvature −1)"
      : `Circle at center: curvature ${k.toLocaleString("en-US")}`;
  }
  return apolloCurvatureLine;
}

function updateHud() {
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
function colorStyleHud(s) {
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
function modeLabel(key) {
  return EXTRA_MODES.find((m) => m.key === key).label;
}

// Scale bar for a pattern's view (Canvas2D views keep halfHeight).
const patternBar = (view, canvas) => ({ unitsPerPx: unitsPerCssPx(view.halfHeight, canvas) });

// "Depth 8" plus, once zooming in has added levels beyond the slider's, the
// number added: "Depth 8 (+3 from zoom)".
const depthHudText = (depth, extraLevels) => `Depth ${depth}${extraLevels > 0 ? ` (+${extraLevels} from zoom)` : ""}`;

function updateKochHud() {
  setHud(modeLabel("koch"), [`${depthHudText(kochState.depth, kochView.extraLevels)}, ${kochState.fill ? "filled" : "outline"}`, rotationHudText(kochView.view.rotation)],
    patternBar(kochView.view, els.kochCanvas));
}

function updateTreeHud() {
  setHud(modeLabel("tree"), [depthHudText(treeState.depth, treeView.extraLevels), rotationHudText(treeView.view.rotation)],
    patternBar(treeView.view, els.treeCanvas));
}

function updateHexaflakeHud() {
  setHud(modeLabel("hexaflake"), [depthHudText(hexaflakeState.depth, hexaflakeView.extraLevels), rotationHudText(hexaflakeView.view.rotation)],
    patternBar(hexaflakeView.view, els.hexaflakeCanvas));
}

function updateDragonHud() {
  setHud(modeLabel(dragonView.curve), [depthHudText(dragonState.depth, dragonView.extraLevels), rotationHudText(dragonView.view.rotation)],
    patternBar(dragonView.view, els.dragonCanvas));
}

function updateFernHud() {
  // accepted = points actually on screen so far; it climbs toward the
  // target as refinement runs, and resets on every pan/zoom.
  setHud(modeLabel(fernView.system), [`${fernView.accepted.toLocaleString()} of ${fernState.count.toLocaleString()} points`, rotationHudText(fernView.view.rotation)],
    patternBar(fernView.view, els.fernCanvas));
}

// Dual view's crosshair marks the main pane's center -- the Julia pane's c.
// Like the rotation compass, it shows while the main view moves (and once
// when dual view opens) and fades once it's still.
const crosshairFlash = { hideTimer: null, lastView: null };
function positionCrosshair() {
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
  // flipY (the Burning Ship): the rotated offset's imaginary part is
  // mirrored, last, as FRAG_SRC's main() does with u_flipY.
  const wy = (uvx * sin + uvy * cos) * (state.flipY ? -1 : 1);
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
  const wy = (uvx * sin + uvy * cos) * (state.flipY ? -1 : 1); // see screenToComplex
  return { cx: targetX - wx * state.scale * 2.0, cy: targetY - wy * state.scale * 2.0 };
}

