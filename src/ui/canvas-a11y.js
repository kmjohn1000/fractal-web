// Screen-reader access to the fractal itself. The canvases are pictures, so VoiceOver gets nothing from them
// unless they say what they show. In the zoomable fractals the screen-reader handle is #a11yZoom, an invisible
// native range input laid over the main canvas (the canvas itself is hidden from VoiceOver): its label names the
// view ("Elephant Valley, Mandelbrot set"), its value text says how deep ("40 times deeper"), and VoiceOver's
// swipe up / swipe down (increment / decrement) changes its value, which zooms in / out. A real input is
// needed: on an iPhone (2026-11-20) the swipe did nothing on an ARIA slider on the canvas (not with arrow-key
// handlers, not with tabindex), while native range inputs, like the toolbar's detail slider, adjust fine.
// Every other canvas (the pattern modes, the dual view's Julia pane) is an image with a label; the pattern modes
// have no swipe zoom (their depth steppers are real buttons), only the zoomable fractals do.
// Nothing here is visible and no pointer or touch handling changes (the input takes no pointer events, and the
// document-level arrow-key panning in compass-ui.js is untouched). Labels are written at most once per
// LABEL_DELAY_MS after the view stops changing (never per frame); a zoom step writes at once.
// An ES module: every top-level declaration is exported (test-hooks.js relies on it).
import { fractalLabel } from "../core/configs.js?v=1.88.3";
import { limitScale } from "../core/deepzoom.js?v=1.88.3";
import { isCurveMode, isIfsMode } from "../fractals/fractal-defs.js?v=1.88.3";
import { cancelTeleport } from "./teleport.js?v=1.88.3";
import { currentName, dualActive, els, mainState, mode, pushHistory, shownGeometry } from "../core/state.js?v=1.88.3";
import { markInteracting } from "../core/state-colors.js?v=1.88.3";
import { requestRender } from "../render/render-layout.js?v=1.88.3";
import { activeVectorTarget } from "./vector-interaction.js?v=1.88.3";
import { landedPlaceName, modeLabel } from "./hud.js?v=1.88.3";
import { dualPresetName } from "./modes.js?v=1.88.3";
import { rotationHudText, zoomPhrase } from "./hud-format.js?v=1.88.3";
import { announce } from "../fractals/chaos-run.js?v=1.88.3";

export const LABEL_DELAY_MS = 350;
// One swipe zooms by this factor (the keyboard's +/- is 1.25: too small a step for a swipe).
export const A11Y_ZOOM_FACTOR = 2;
// aria-valuenow is log2 of the zoom, from this range (the deepest view is about 2^100).
export const A11Y_ZOOM_MIN = -10;
export const A11Y_ZOOM_MAX = 110;

// "40× deeper" is read "40 x deeper": say "times".
export const speech =(s) => s.replace(/×/g, " times");

export const zoomInput = document.getElementById("a11yZoom");
export const zoomInBtn = document.getElementById("a11yZoomIn");
export const zoomOutBtn = document.getElementById("a11yZoomOut");
// The slider and the two buttons come and go together: only the zoomable fractals have a screen-reader zoom.
export function showZoomHandles(show) {
  for (const el of [zoomInput, zoomInBtn, zoomOutBtn]) if (el.hidden === show) el.hidden = !show;
}
// The value the input shows now; a change away from it is a VoiceOver swipe (up = larger = zoom in).
export let a11yValue = 0;

export function setCanvasA11y(canvas, role, label, valuetext, valuenow) {
  if (role === "slider") {
    // The input speaks for the canvas; hide the picture itself so VoiceOver doesn't stop on both.
    if (canvas.getAttribute("aria-hidden") !== "true") canvas.setAttribute("aria-hidden", "true");
    for (const a of ["role", "aria-label"]) canvas.removeAttribute(a);
    showZoomHandles(true);
    if (zoomInput.getAttribute("aria-label") !== label) zoomInput.setAttribute("aria-label", label);
    if (zoomInput.getAttribute("aria-valuetext") !== valuetext) zoomInput.setAttribute("aria-valuetext", valuetext);
    // Whole steps: WebKit raises and lowers a native range with stepUp()/stepDown(), which refuse step="any"; the
    // depth the person hears is in aria-valuetext, so rounding the number loses nothing.
    const now = Math.round(Math.min(A11Y_ZOOM_MAX, Math.max(A11Y_ZOOM_MIN, valuenow)));
    if (Number(zoomInput.value) !== now) zoomInput.value = String(now);
    a11yValue = Number(zoomInput.value);
    return;
  }
  if (canvas === els.mainCanvas) showZoomHandles(false);
  canvas.removeAttribute("aria-hidden");
  if (canvas.getAttribute("role") !== role) canvas.setAttribute("role", role);
  if (canvas.getAttribute("aria-label") !== label) canvas.setAttribute("aria-label", label);
}

// What the current view is, for the canvas the mode shows. Plain data, no DOM writes.
export function describeCanvas() {
  if (mode === "fractal") {
    const s = shownGeometry(mainState); // the same depth whether or not the picture grew under a faded toolbar
    const place = landedPlaceName();
    const label = fractalLabel(currentName);
    const turn = rotationHudText(s.rotation);
    const deep = speech(zoomPhrase(s.baseScale, s.scale));
    return {
      canvas: els.mainCanvas, role: "slider",
      label: place ? `${place}, ${label}` : label,
      valuetext: turn ? `${deep}, ${turn.toLowerCase()}` : deep,
      valuenow: Math.log2(s.baseScale / s.scale),
    };
  }
  const t = activeVectorTarget();
  if (!t) return null;
  // The pattern's picker name (the same one the info card titles it with), and the turn if it has one. The
  // depth stays on the mode's own buttons and info card; these views have no a11y zoom (see the header).
  const key = isCurveMode(mode) ? t.v.curve : isIfsMode(mode) ? t.v.system : mode;
  const turn = rotationHudText(t.v.view.rotation);
  return { canvas: t.canvas, role: "img", label: `${modeLabel(key)}${turn ? `, ${turn.toLowerCase()}` : ""}`, valuetext: "", valuenow: 0 };
}

export function updateCanvasA11y() {
  const d = describeCanvas();
  if (mode !== "fractal") {
    // Pattern modes: no zoom handle, and the main canvas isn't on screen.
    showZoomHandles(false);
    els.mainCanvas.removeAttribute("aria-hidden");
  }
  if (d) setCanvasA11y(d.canvas, d.role, d.label, d.valuetext, d.valuenow);
  // The dual view's second pane: a picture of the Julia set of the center point.
  if (mode === "fractal" && dualActive) {
    const preset = dualPresetName();
    setCanvasA11y(els.juliaCanvas, "img", `${preset ? `${fractalLabel(preset)}: ` : ""}Julia set of the center point`, "", 0);
  }
}

export let timer = 0;
// Called after every render; only restarts a timer, so a gesture's frames cost nothing here.
export function scheduleCanvasA11y() {
  clearTimeout(timer);
  timer = setTimeout(updateCanvasA11y, LABEL_DELAY_MS);
}

// One swipe's zoom: in (factor > 1) or out, through the same calls as the keyboard's +/- (compass-ui.js).
export function a11yZoom(zoomIn) {
  const f = zoomIn ? 1 / A11Y_ZOOM_FACTOR : A11Y_ZOOM_FACTOR;
  cancelTeleport();
  if (mode !== "fractal") return;
  pushHistory("main");
  mainState.scale = limitScale(mainState, mainState.scale * f);
  markInteracting();
  requestRender();
  updateCanvasA11y();
}

// VoiceOver's swipe up / down (or a screen reader's, or a keyboard's arrows on the focused input) moves the input's
// value; the direction of the change is the zoom, whatever the size of the step. a11yZoom then writes the real
// depth back into the input.
// The buttons: one double-tap = one zoom step, and the new depth is spoken (a button only rereads its own name).
export function a11yZoomButton(zoomIn) {
  a11yZoom(zoomIn);
  const d = describeCanvas();
  if (d?.valuetext) announce(d.valuetext);
}
zoomInBtn.addEventListener("click", () => a11yZoomButton(true));
zoomOutBtn.addEventListener("click", () => a11yZoomButton(false));
zoomInput.addEventListener("input", () => {
  const v = Number(zoomInput.value);
  if (v === a11yValue) return;
  a11yZoom(v > a11yValue);
  a11yValue = Number(zoomInput.value);
});
