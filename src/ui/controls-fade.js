// The toolbar fades away when the screen is left alone and comes back on any touch, pointer-down, mouse
// move (fine pointer) or key press. A load-time module: importing it attaches the listeners and starts the
// timer, so app.js imports it before toolbar-a11y. An ES module: every top-level declaration is exported
// (test-hooks.js relies on it), hence the cf prefix on the names (they become flat test globals).
// Needs state.js (els) and compass-ui.js (prefersReducedMotion).
//
// What fades is #controls as a whole (its bar, whichever mode's control row shows, and the closed sheets),
// by opacity only, so the controls stay in the accessibility tree and keep their tab order; the canvas does
// not resize (the toolbar stays in flow). While faded the toolbar takes no taps (class "inert": pointer-events
// none), and the touch that wakes it keeps it inert until that touch ends, so it never presses a button or
// moves a slider under the finger. The listeners only watch (capture, passive): canvas gestures run as usual.
//
// Never fades while: a sheet or menu inside the toolbar is open, a slider is held, keyboard focus is in the
// toolbar (:focus-visible), or the website welcome card or the app's first-run tour shows. Focus moving into the toolbar wakes it.
// Under automation (Playwright) it is off by default so screenshots and timings stay deterministic; the
// controls-fade spec turns it on with setControlsFade.
import { dualActive, els, isInteracting, mainState, mode, setToolbarGrow, toolbarGrow } from "../core/state.js?v=1.88.1";
import { resizeView } from "../core/view-math.js?v=1.88.1";
import { layoutCanvasArea, renderAll, requestRender } from "../render/render-layout.js?v=1.88.1";
import { prefersReducedMotion } from "./compass-ui.js?v=1.88.1";

// The picture grows into the toolbar's space while the toolbar is faded (a single fractal view only: the
// vector modes and dual view fade the toolbar but keep their size). The toolbar becomes a fixed overlay
// (class "overlay"), so the canvas area fills the screen; the view is adjusted (resizeView) so the picture
// stays where it is and new rows appear at the bottom, then drawn at once, in the same task as the layout
// change, so there is no stretched or blank frame. Waking puts the toolbar back over the bottom of the
// picture; the canvas does not shrink again until an ordinary layout change (window resize, a mode switch,
// dual view): restoreToolbarFlow puts the view back to the shown-toolbar geometry first.
// Returns true when grown, "busy" when a gesture or flight is running (try again soon), false otherwise.
export function growIntoToolbar() {
  if (toolbarGrow) return true;
  if (mode !== "fractal" || dualActive || !mainState) return false;
  if (isInteracting) return "busy";
  const hs = els.mainCanvas.clientHeight;
  cfToolbar.classList.add("overlay");
  const ht = els.mainCanvas.clientHeight; // reading it lays the page out
  if (ht <= hs + 1) { cfToolbar.classList.remove("overlay"); return false; }
  resizeView(mainState, hs, ht);
  setToolbarGrow({ hs, ht });
  layoutCanvasArea();
  renderAll();
  return true;
}

// Back to the toolbar in the page flow, with the view in the shown geometry. The caller renders (or is
// about to). Wakes the toolbar: a layout change is an interaction.
export function restoreToolbarFlow() {
  if (!toolbarGrow) return;
  const g = toolbarGrow;
  setToolbarGrow(null);
  if (mainState) resizeView(mainState, g.ht, g.hs);
  cfToolbar.classList.remove("overlay");
  if (cfFaded) wakeControls();
  layoutCanvasArea();
}

export const CF_DEFAULT_MS = 4000;

export const cfToolbar = document.getElementById("controls");
export const cfConfig = { enabled: true, delayMs: CF_DEFAULT_MS };
try {
  if (navigator.webdriver === true || localStorage.getItem("fractalAtlas.test") === "1") cfConfig.enabled = false;
} catch { /* storage blocked: leave it on */ }

export let cfTimer = 0;
export let cfSliderHeld = false;
export let cfFaded = false;
export let cfInertTimer = 0;
export let cfSwallowClickUntil = 0;
export let cfGrowTimer = 0;

export function controlsFaded() { return cfFaded; }

// What keeps the toolbar showing right now.
export function controlsBusy() {
  if (cfSliderHeld) return true;
  if (cfToolbar.querySelector(".open")) return true; // color, places, share, fractal picker
  if (els.welcome && !els.welcome.classList.contains("hidden")) return true;
  if (els.tour && !els.tour.classList.contains("hidden")) return true; // the app's first-run tour points at the toolbar
  if (cfToolbar.querySelector(":focus-visible")) return true;
  // VoiceOver or Switch Control is running (the app sets this from Swift): touch exploration isn't a pointer-down,
  // so nothing would ever wake the toolbar for these users. Found on an iPhone 2026-11-20.
  if (document.documentElement.dataset.screenReader === "1") return true;
  return false;
}

export function cfArm() {
  clearTimeout(cfTimer);
  if (!cfConfig.enabled) return;
  cfTimer = setTimeout(() => {
    if (controlsBusy()) { cfArm(); return; }
    cfFade();
  }, cfConfig.delayMs);
}

export function cfFade() {
  cfFaded = true;
  cfToolbar.classList.add("inert");
  cfToolbar.classList.toggle("noFadeAnim", prefersReducedMotion());
  cfToolbar.classList.add("faded");
  cfGrowSoon();
}

export function cfGrowSoon() {
  clearTimeout(cfGrowTimer);
  if (!cfFaded) return;
  if (growIntoToolbar() === "busy") cfGrowTimer = setTimeout(cfGrowSoon, 500);
}

export function cfDropInert() {
  clearTimeout(cfInertTimer);
  cfToolbar.classList.remove("inert");
}

// fromDown: the wake is a pointer-down. The toolbar stays inert until that pointer ends.
export function wakeControls(fromDown = false, onToolbar = false) {
  clearTimeout(cfGrowTimer);
  if (cfFaded) {
    cfFaded = false;
    cfToolbar.classList.toggle("noFadeAnim", prefersReducedMotion());
    cfToolbar.classList.remove("faded");
    if (fromDown) {
      if (onToolbar) cfSwallowClickUntil = performance.now() + 700;
      const end = () => { setTimeout(() => { cfSwallowClickUntil = 0; cfDropInert(); }, 60); };
      window.addEventListener("pointerup", end, { once: true, capture: true });
      window.addEventListener("pointercancel", end, { once: true, capture: true });
      clearTimeout(cfInertTimer);
      cfInertTimer = setTimeout(cfDropInert, 3000); // failsafe if the pointer's end is never seen
    } else {
      cfDropInert();
    }
  }
  cfArm();
}

// Test hook: turn the fade on or off, or change the delay.
export function setControlsFade({ enabled = cfConfig.enabled, delayMs = cfConfig.delayMs } = {}) {
  cfConfig.enabled = enabled;
  cfConfig.delayMs = delayMs;
  if (!enabled) {
    clearTimeout(cfTimer);
    cfFaded = false;
    if (toolbarGrow) { restoreToolbarFlow(); requestRender(); }
    cfDropInert();
    cfToolbar.classList.remove("faded");
  } else {
    wakeControls();
  }
}

window.addEventListener("pointerdown", (e) => {
  const t = e.target instanceof Element ? e.target : null;
  if (t && t.matches('input[type="range"]') && cfToolbar.contains(t) && !cfToolbar.classList.contains("inert")) {
    cfSliderHeld = true;
    const end = () => { cfSliderHeld = false; cfArm(); };
    window.addEventListener("pointerup", end, { once: true, capture: true });
    window.addEventListener("pointercancel", end, { once: true, capture: true });
  }
  wakeControls(true, !!t && cfToolbar.contains(t));
}, { capture: true, passive: true });
// VoiceOver turned on while the toolbar is faded: bring it back now (and stay up, see controlsBusy).
window.addEventListener("screenreaderchange", () => wakeControls());
window.addEventListener("pointermove", (e) => {
  if (e.pointerType === "mouse") wakeControls();
}, { capture: true, passive: true });
window.addEventListener("keydown", () => wakeControls(), { capture: true, passive: true });
// A window resize or an orientation change is an ordinary layout change: back to the toolbar in the flow
// (and showing); the app's own resize listener renders.
window.addEventListener("resize", () => {
  if (!toolbarGrow) return;
  restoreToolbarFlow();
  requestRender();
});
cfToolbar.addEventListener("focusin", () => wakeControls());
cfToolbar.addEventListener("focusout", () => cfArm());
// A tap that woke the toolbar must not also click a button in it.
window.addEventListener("click", (e) => {
  if (performance.now() < cfSwallowClickUntil && e.target instanceof Element && cfToolbar.contains(e.target) && e.target !== cfToolbar) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

cfArm();
