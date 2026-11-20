// Screen-reader access to the fractal itself. The canvases are pictures, so VoiceOver gets nothing from them
// unless they say what they show. The main canvas in the zoomable fractals is an adjustable element
// (role="slider"): its label names the view ("Elephant Valley, Mandelbrot set"), its value text says how deep
// ("40 times deeper"), and VoiceOver's swipe up / swipe down (increment / decrement) zooms in / out. Every
// other canvas (the pattern modes, the dual view's Julia pane) is an image with a label; the pattern modes have
// no swipe zoom (their depth steppers are real buttons), only the zoomable fractals do.
// WebKit turns VoiceOver's increment/decrement on an ARIA slider into ArrowUp/ArrowRight (increase) and
// ArrowDown/ArrowLeft (decrease) keydown events on that element. The slider canvas has tabindex="-1" (WebKit must be
// able to focus it to send those keys; it stays out of the Tab order) and lets go of focus after a pointer gesture,
// so a sighted keyboard user's focus never sits on it and the document-level arrow-key panning (compass-ui.js) is
// untouched; this file's listener only sees events aimed at the canvas itself, and stops them there.
// Nothing here is visible and no pointer or touch handling changes. Labels are written at most once per
// LABEL_DELAY_MS after the view stops changing (never per frame); a zoom step writes at once.
// An ES module: every top-level declaration is exported (test-hooks.js relies on it).
import { fractalLabel } from "../core/configs.js?v=1.88.1";
import { limitScale } from "../core/deepzoom.js?v=1.88.1";
import { isCurveMode, isIfsMode } from "../fractals/fractal-defs.js?v=1.88.1";
import { cancelTeleport } from "./teleport.js?v=1.88.1";
import { currentName, dualActive, els, mainState, mode, pushHistory, shownGeometry } from "../core/state.js?v=1.88.1";
import { markInteracting } from "../core/state-colors.js?v=1.88.1";
import { requestRender } from "../render/render-layout.js?v=1.88.1";
import { activeVectorTarget } from "./vector-interaction.js?v=1.88.1";
import { landedPlaceName, modeLabel } from "./hud.js?v=1.88.1";
import { dualPresetName } from "./modes.js?v=1.88.1";
import { rotationHudText, zoomPhrase } from "./hud-format.js?v=1.88.1";

export const LABEL_DELAY_MS = 350;
// One swipe zooms by this factor (the keyboard's +/- is 1.25: too small a step for a swipe).
export const A11Y_ZOOM_FACTOR = 2;
// aria-valuenow is log2 of the zoom, from this range (the deepest view is about 2^100).
export const A11Y_ZOOM_MIN = -10;
export const A11Y_ZOOM_MAX = 110;

// "40× deeper" is read "40 x deeper": say "times".
export const speech =(s) => s.replace(/×/g, " times");

export function setCanvasA11y(canvas, role, label, valuetext, valuenow) {
  if (canvas.getAttribute("role") !== role) {
    canvas.setAttribute("role", role);
    for (const a of ["aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext", "aria-orientation"]) {
      if (role !== "slider") canvas.removeAttribute(a);
    }
    if (role === "slider") {
      canvas.setAttribute("aria-valuemin", String(A11Y_ZOOM_MIN));
      canvas.setAttribute("aria-valuemax", String(A11Y_ZOOM_MAX));
      canvas.setAttribute("aria-orientation", "vertical");
    }
  }
  // iOS WebKit focuses the element before it sends the increment's arrow key, so a slider that can't take focus
  // never hears the swipe (VoiceOver just rereads it, found on an iPhone 2026-11-20). -1 keeps it out of the Tab order.
  if (role === "slider") {
    if (canvas.getAttribute("tabindex") !== "-1") canvas.setAttribute("tabindex", "-1");
  } else if (canvas.hasAttribute("tabindex")) canvas.removeAttribute("tabindex");
  if (canvas.getAttribute("aria-label") !== label) canvas.setAttribute("aria-label", label);
  if (role === "slider") {
    const now = String(Math.round(Math.min(A11Y_ZOOM_MAX, Math.max(A11Y_ZOOM_MIN, valuenow)) * 10) / 10);
    if (canvas.getAttribute("aria-valuenow") !== now) canvas.setAttribute("aria-valuenow", now);
    if (canvas.getAttribute("aria-valuetext") !== valuetext) canvas.setAttribute("aria-valuetext", valuetext);
  }
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

// The canvas can now take focus, and a click or tap would give it that focus. Let go after every pointer gesture so
// the document's arrow-key panning (compass-ui.js) keeps working for a sighted keyboard user.
for (const canvas of document.querySelectorAll("#canvasArea canvas")) {
  canvas.addEventListener("pointerup", () => { if (document.activeElement === canvas) canvas.blur(); });
}

export const KEY_DIRECTION = { ArrowUp: true, ArrowRight: true, ArrowDown: false, ArrowLeft: false };
for (const canvas of document.querySelectorAll("#canvasArea canvas")) {
  canvas.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const zoomIn = KEY_DIRECTION[e.key];
    if (zoomIn === undefined || canvas !== els.mainCanvas || mode !== "fractal") return;
    e.preventDefault();
    e.stopPropagation(); // not the document's arrow-key pan
    a11yZoom(zoomIn);
  });
}
