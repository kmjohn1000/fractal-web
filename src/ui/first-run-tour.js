// The app's first-run tour: a few coach marks on the first launch, one small bubble at a time, each
// pointing at the real control (a ring round it) or floating over the picture for the gestures. It
// blocks nothing (user, 2026-11-15): gestures and controls work while it is up, a gesture step goes on
// once the gesture is done, a tap on the ringed control does its job and goes on; a tap on the bubble, or
// Next, goes on; Skip (or Escape) ends it. Shown once, in the iOS app only: the website
// keeps its welcome card (compass-ui.js). People who already had the app see it once too, on the first
// launch after the update that brought it (user, 2026-11-14). Readable by VoiceOver: a non-modal dialog
// whose bubble takes focus at each step.
// The toolbar stays shown while it is up (controls-fade.js controlsBusy reads #tour).
//
// An ES module: every top-level declaration is exported (test-hooks.js relies on it), hence the tour
// prefix on the names (they become flat test globals). Needs platform.js, state.js and controls-fade.js.
import { Platform } from "../core/platform.js?v=1.82.4";
import { els, isInteracting, mainState } from "../core/state.js?v=1.82.4";
import { cfArm, cfToolbar, wakeControls } from "./controls-fade.js?v=1.82.4";

export const TOUR_DELAY_MS = 1200; // after load, so the launch screen has faded into the first picture
export const TOUR_SETTLE_MS = 400; // after a gesture step's gesture ends, before its next step shows

// A step with `targets` points at the first of those controls that shows (the toolbar differs by mode);
// a step whose controls are all hidden is left out. A step without targets floats over the picture.
// The tour lets everything through (user, 2026-11-15): only the bubble takes taps. A step with `gesture`
// goes on by itself once that gesture has changed the view ("move": zoom or pan, "twist": rotation),
// and a tap on a step's ringed control does what the control does and goes on to the next step; while
// a sheet or menu is open the tour waits out of sight.
export const TOUR_STEPS = [
  { gesture: "move", text: "Pinch to zoom, drag to move. Try it." },
  { gesture: "twist", text: "Twist two fingers to turn the picture. Try it." },
  { targets: ["#teleportBtn"], text: "Tap the die to fly somewhere surprising." },
  { targets: ["#colormapBtn", "#fernColorBtn"], text: "Tap Colors for palettes and Looks." },
  { targets: [".fractalMenuBtn"], text: "Tap here to pick another fractal, or browse Places." },
  { targets: [".shareBtn"], text: "Save to Photos, or share a link to this exact view." },
  // Last, since it is about what happens once the tour ends (controls-fade.js).
  { text: "The controls fade while you explore. Touch anywhere to bring them back." },
];

export const tourRing = document.getElementById("tourRing");
export const tourBubble = document.getElementById("tourBubble");
export const tourText = document.getElementById("tourText");
export const tourCount = document.getElementById("tourCount");
export const tourSkip = document.getElementById("tourSkip");
export const tourNextBtn = document.getElementById("tourNext");

export let tourSteps = []; // the steps shown this time
export let tourIndex = -1;
export let tourFocusBefore = null;
export let tourViewAtStep = null; // the view when the current step showed, for a gesture step
export const tourPointers = new Set(); // fingers down now
export let tourPauseTimer = null;
export let tourFocusPending = false; // a step shown while paused takes focus once the tour is back

// The view now: the state object itself (a fractal switch replaces it) and the numbers a gesture moves.
export function tourView() {
  const s = mainState;
  return s ? { s, cx: s.cx, cy: s.cy, scale: s.scale, rotation: s.rotation || 0 } : null;
}

// Whether the current gesture step's gesture has changed the view since the step showed.
export function tourGestureDone(step) {
  const a = tourViewAtStep, b = tourView();
  if (!step?.gesture || !a || !b) return false;
  if (a.s !== b.s) return true;
  if (step.gesture === "twist") return Math.abs(b.rotation - a.rotation) > 0.05; // about 3 degrees
  return b.scale !== a.scale || b.cx !== a.cx || b.cy !== a.cy;
}

// Once every finger is up and the view has settled, a gesture step that was done goes on.
export function tourCheckGesture() {
  if (!tourShowing() || tourPointers.size) return;
  const step = tourSteps[tourIndex];
  if (!step?.gesture) return;
  setTimeout(() => {
    if (!tourShowing() || tourPointers.size || tourSteps[tourIndex] !== step) return;
    if (isInteracting) { tourCheckGesture(); return; }
    if (tourGestureDone(step)) tourNext();
  }, TOUR_SETTLE_MS);
}

// A sheet or menu open in the toolbar (one the tour's control opened, or any other) hides the tour until
// it closes; checked every 250 ms while the tour is up.
export function tourSyncPause() {
  const paused = !!cfToolbar.querySelector(".open");
  const was = els.tour.classList.contains("paused");
  if (paused === was) return;
  els.tour.classList.toggle("paused", paused);
  if (!paused) {
    tourShow(false); // the toolbar may have re-laid out meanwhile
    if (tourFocusPending) { tourFocusPending = false; tourBubble.focus({ preventScroll: true }); }
  }
}

export function tourShowing() {
  return !els.tour.classList.contains("hidden");
}

// The step's control as shown now, or null.
export function tourTarget(step) {
  if (!step.targets) return null;
  for (const sel of step.targets) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (el.offsetParent !== null && r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

// Called once at load (app.js). Starts the tour after TOUR_DELAY_MS when it is due.
export function maybeStartTour() {
  if (!Platform.tour.isDue()) return;
  setTimeout(startTour, TOUR_DELAY_MS);
}

export function startTour() {
  if (tourShowing()) return;
  tourSteps = TOUR_STEPS.filter((s) => !s.targets || tourTarget(s));
  if (!tourSteps.length) return;
  tourFocusBefore = document.activeElement;
  wakeControls();
  els.tour.classList.remove("hidden", "paused");
  tourIndex = 0;
  tourShow(true);
  clearInterval(tourPauseTimer);
  tourPauseTimer = setInterval(tourSyncPause, 250);
}

export function tourNext() {
  if (tourIndex + 1 >= tourSteps.length) { endTour(); return; }
  tourIndex++;
  tourShow(true);
}

export function endTour() {
  if (!tourShowing()) return;
  Platform.tour.done();
  els.tour.classList.add("hidden");
  els.tour.classList.remove("paused");
  clearInterval(tourPauseTimer);
  tourPauseTimer = null;
  tourFocusPending = false;
  tourIndex = -1;
  const back = tourFocusBefore;
  tourFocusBefore = null;
  if (back && back !== document.body && back.isConnected && typeof back.focus === "function") back.focus({ preventScroll: true });
  else if (els.tour.contains(document.activeElement)) document.activeElement.blur();
  cfArm(); // the toolbar's idle wait starts now
}

// Draws the current step. `fresh` is a new step (it animates in and takes focus); a re-layout redraws
// in place.
export function tourShow(fresh = false) {
  const step = tourSteps[tourIndex];
  if (!step) return;
  const last = tourIndex === tourSteps.length - 1;
  tourText.textContent = step.text;
  tourCount.textContent = `${tourIndex + 1} of ${tourSteps.length}`;
  tourNextBtn.textContent = last ? "Done" : "Next";
  tourSkip.classList.toggle("hidden", last);

  if (fresh) {
    tourViewAtStep = tourView();
    tourBubble.classList.add("again"); // restart the fade-in
    void tourBubble.offsetWidth;
    tourBubble.classList.remove("again");
  }

  const W = window.innerWidth, H = window.innerHeight, M = 12;
  const bw = tourBubble.offsetWidth, bh = tourBubble.offsetHeight;
  const target = tourTarget(step);
  tourBubble.classList.remove("above", "below");
  if (target) {
    const r = target.getBoundingClientRect();
    const pad = 4;
    Object.assign(tourRing.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`,
      width: `${r.width + 2 * pad}px`, height: `${r.height + 2 * pad}px`,
    });
    tourRing.classList.remove("hidden");
    const cx = r.left + r.width / 2;
    const left = Math.min(Math.max(cx - bw / 2, M), Math.max(M, W - bw - M));
    const above = r.top + r.height / 2 > H / 2;
    // Above a toolbar control the bubble clears the whole toolbar (its slider row too), not only the
    // control; the ring does the pointing, so the bubble only has to sit over the same side.
    const barTop = cfToolbar.getBoundingClientRect().top;
    const top = above ? Math.min(r.top - pad, barTop) - 12 - bh : r.bottom + pad + 12;
    tourBubble.style.left = `${left}px`;
    tourBubble.style.top = `${Math.min(Math.max(top, M), Math.max(M, H - bh - M))}px`;
    tourBubble.classList.add(above ? "above" : "below");
  } else {
    tourRing.classList.add("hidden");
    // Near the top of the picture, so the middle stays free for the fingers (a gesture that starts on
    // the bubble never reaches the picture); below the status bar and the row of the HUD and compass.
    const area = els.canvasArea.getBoundingClientRect();
    const safeTop = parseFloat(getComputedStyle(els.tour).paddingTop) || 0;
    const top = Math.max(area.top, safeTop) + 60;
    tourBubble.style.left = `${Math.max(M, (W - bw) / 2)}px`;
    tourBubble.style.top = `${Math.min(Math.max(top, M), Math.max(M, H - bh - M))}px`;
  }

  if (fresh) {
    // Focus stays in an open sheet; the bubble takes it when the tour comes back (tourSyncPause).
    if (cfToolbar.querySelector(".open")) tourFocusPending = true;
    else tourBubble.focus({ preventScroll: true });
  }
}

// Only the bubble takes taps (#tour lets the rest through): a tap on it is Next, Skip ends the tour.
els.tour.addEventListener("click", (e) => {
  e.stopPropagation();
  if (e.target === tourSkip) endTour();
  else tourNext();
});
// The fingers on the screen, for the gesture steps. These only watch (capture, passive).
window.addEventListener("pointerdown", (e) => { if (tourShowing()) tourPointers.add(e.pointerId); }, { capture: true, passive: true });
for (const type of ["pointerup", "pointercancel"]) {
  window.addEventListener(type, (e) => {
    tourPointers.delete(e.pointerId);
    tourCheckGesture();
  }, { capture: true, passive: true });
}
// A wheel or trackpad zoom counts too (an iPad with a trackpad).
window.addEventListener("wheel", () => tourCheckGesture(), { capture: true, passive: true });
// A tap on the ringed control does what the control does, then the tour goes on; a sheet it opens hides
// the tour until it closes (tourSyncPause runs first, so the next step waits for it).
window.addEventListener("click", (e) => {
  if (!tourShowing() || els.tour.contains(e.target)) return;
  const target = tourTarget(tourSteps[tourIndex] || {});
  if (!target || !target.contains(e.target)) return;
  setTimeout(() => { tourSyncPause(); tourNext(); }, 0);
}, { capture: true, passive: true });
// The tour's keys stay in the tour: Escape skips, Tab cycles Skip and Next, and nothing reaches the
// app's own shortcuts (compass-ui.js, toolbar-a11y.js listen on the document).
els.tour.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Escape") { e.preventDefault(); endTour(); return; }
  if (e.key === "Tab") {
    e.preventDefault();
    const order = [tourSkip, tourNextBtn].filter((b) => !b.classList.contains("hidden"));
    const i = order.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? order.length - 1 : i - 1) : (i + 1) % order.length;
    order[next].focus({ preventScroll: true });
  }
});
// The toolbar re-lays out on a rotation or resize; follow it on the next frame.
window.addEventListener("resize", () => {
  if (tourShowing()) requestAnimationFrame(() => tourShow(false));
});
