// The info card (#hud): drawing it (setHud, fitting its description), what it says for the WebGL fractals
// (updateHud) and for each pattern mode (update…Hud), the Julia pane's label and the pattern titles.
// The number and text formatting is in hud-format.js. Split from render-layout.js (a pure move apart from
// updateHud taking the main pane's last deep-zoom path as an argument), which calls the updaters after each
// frame; this file imports nothing from render-layout.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { COLORMAPS } from "./colormaps.js?v=1.65.0";
import { FRACTAL_CONFIGS, FTYPE, fractalLabel } from "./configs.js?v=1.65.0";
import { EXTRA_MODES, SHAPE_INFO, apolloFrame, digitFractalDepth, isDigitFractal } from "./fractal-defs.js?v=1.65.0";
import { DEEP_ZOOM_THRESHOLD, atZoomLimit, deepZoomEligible, newtonDeepEligible, perturbationEligibleType, phoenixDeepEligible } from "./deepzoom.js?v=1.65.0";
import { TELEPORT_DESTINATIONS } from "./places.js?v=1.65.0";
import { COLOR_STYLES, ESCAPE_TIME_TYPES, colorStyle, styleDrawn } from "./color-styles.js?v=1.65.0";
import { currentName, dragonState, dragonView, dualActive, els, fernState, fernView, hexaflakeState, hexaflakeView, isInteracting, kochState, kochView, mainRenderer, mainState, mode, treeState, treeView } from "./state.js?v=1.65.0";
import { colormapIndex } from "./state-colors.js?v=1.65.0";
import { dualPresetName } from "./modes.js?v=1.65.0";
import { teleportLandingIndex } from "./teleport.js?v=1.65.0";
import { hudVisible } from "./compass-ui.js?v=1.65.0";
import { COLOR_LOOKS, bandsText, lookPalette, shiftText } from "./color-sheet.js?v=1.65.0";
import { apolloCurvatureText, capitalize, formatHudCoords, rotationHudText, scaleBar, unitsPerCssPx, zoomPhrase } from "./hud-format.js?v=1.65.0";
import { normalizeAngle } from "./view-math.js?v=1.65.0";
import { runHudParts, updateRunChip } from "./chaos-run.js?v=1.65.0";
import { cornerAbout, currentCornerRule } from "./corner-rules.js?v=1.65.0";

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
  // The Places sheet lists the zoom fractals' places; the pattern shapes (the ones with an `about`) have none.
  els.hudPlaces.classList.toggle("hidden", !!about);
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
  // Each item is kept whole (nowrap) so a narrow card breaks between "scale: 2.7" and "maxIter: 300", never inside one
  // ("precision:" alone on a line); the spaces between them stay text, so the card reads as it always did.
  els.hudStats.replaceChildren(...tech.split(/( {2,})/).filter(Boolean).map((piece) => {
    if (/^ +$/.test(piece)) return document.createTextNode(piece);
    const item = document.createElement("span");
    item.className = "hudStat";
    item.textContent = piece;
    return item;
  }));
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

// deepPath: the main pane's last render() result ("perturbation", "fixed point" or null), which
// render-layout.js remembers (lastMainDeepPath).
export function updateHud(deepPath) {
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
  } else if (deepPath) {
    precision = `${deepPath} (deep zoom)`;
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
export const patternBar = (view, canvas, key) => ({ unitsPerPx: unitsPerCssPx(view.halfHeight, canvas), about: key === "corners" ? cornerAbout() : SHAPE_INFO[key] });

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
  // (a chaos-game run's counter and seed come in through runHudParts, chaos-run.js)
  setHud(modeLabel(fernView.system), [...runHudParts(`${fernView.accepted.toLocaleString()} of ${fernState.count.toLocaleString()} points`), rotationHudText(fernView.view.rotation)],
    patternBar(fernView.view, els.fernCanvas, fernView.system));
  updateRunChip();
  updateRuleChip();
}

// Corner Rules: the rule on screen is named in a chip over the canvas (the info card says it too, but is
// off until asked for). setMode shows the chip in that mode only; this keeps its text current.
export function updateRuleChip() {
  const text = currentCornerRule().title;
  if (els.ruleChip.textContent !== text) els.ruleChip.textContent = text;
}
