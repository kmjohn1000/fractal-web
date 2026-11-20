// Flight blend: a time-based low-pass over the picture during a Surprise-me flight, and Reduce Motion's
// crossfade in place of a flight. Needs state.js (els, isInteracting); teleport.js calls it.
//
// Why: a fast zoom sweeps big areas of the picture dark, bright and dark again several times a second, in
// every color style (scripts/flash-check.mjs measured up to 19 luminance transitions a second in 1.82.4,
// against WCAG 2.3.1's limit of 6). An overlay canvas over the main canvas follows the picture through two
// exponential stages of FLIGHT_BLEND_TAU_MS each, so swings faster than a couple a second are flattened
// while the zoom itself still reads (as a motion blur). The WebGL canvas keeps its drawing buffer
// (renderer.js), so copying it on any frame gets the last picture drawn. The overlay is half the canvas's
// pixel size: it is blurred in time anyway, and it fades out once it matches the picture.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { els, isInteracting } from "../core/state.js?v=1.88.2";

// Each stage's time constant. On the five worst flights of 1.82.4 (12 to 19 transitions a second),
// 50 ms brought them to 3 to 5, 70 ms to 2 to 4 and 100 ms to 2 to 3. Over all 86 checked flights 70 ms
// still left Magnet I's Deep Foam at 6 (red flashes in Turbo, the limit itself, every run); 100 ms
// brings it to 4, which leaves a margin (repeat runs vary by about 2) and looks much the same.
export const FLIGHT_BLEND_TAU_MS = 100;
export const BLEND_TAIL_MS = 500;       // keeps following this long after the landing's full-quality redraw
export const BLEND_FADE_MS = 300;       // then fades out (the overlay matches the picture by then)
export const CROSSFADE_MS = 500;        // Reduce Motion's dissolve from the old place to the new one

export let blendOverlay = null;  // the visible canvas: the second stage
export let blendStage = null;    // the first stage, off screen
// active: following the picture (or holding it, for a crossfade); mode: "blend" (a flight) or "crossfade"
// (Reduce Motion); landed: the flight's last frame is drawn; settledAt: when the redraw after it settled;
// tau: the stages' time constant (scripts/flash-check.mjs --tau tries others).
export const blendState = { active: false, mode: null, landed: false, settledAt: 0, lastTs: 0, rafId: 0, fadeTimer: 0, tau: FLIGHT_BLEND_TAU_MS };

export function blendEnsureCanvases() {
  if (blendOverlay) return;
  blendOverlay = document.createElement("canvas");
  blendOverlay.id = "flightBlend";
  blendOverlay.setAttribute("aria-hidden", "true");
  // Out of the flex row (absolute), under the HUD and the other overlays, and never in the way of a touch.
  blendOverlay.style.cssText = "position:absolute;pointer-events:none;display:none;opacity:1;";
  els.mainCanvas.after(blendOverlay);
  blendStage = document.createElement("canvas");
}

// Over the main canvas, at half its pixel size (a new size clears both stages, so it is set only on change).
export function blendPlaceOverlay() {
  const src = els.mainCanvas;
  const s = blendOverlay.style;
  s.left = `${src.offsetLeft}px`; s.top = `${src.offsetTop}px`;
  s.width = `${src.clientWidth}px`; s.height = `${src.clientHeight}px`;
  const w = Math.max(1, Math.round(src.width / 2)), h = Math.max(1, Math.round(src.height / 2));
  for (const c of [blendOverlay, blendStage]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
}

export function blendCopy(dst, src, alpha) {
  const ctx = dst.getContext("2d");
  ctx.globalAlpha = alpha;
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
}

export function blendShow() {
  clearTimeout(blendState.fadeTimer);
  const s = blendOverlay.style;
  s.transition = "none"; s.opacity = "1"; s.display = "block";
}

export function blendFadeOut(ms) {
  blendState.active = false;
  const s = blendOverlay.style;
  s.transition = `opacity ${ms}ms linear`; s.opacity = "0";
  blendState.fadeTimer = setTimeout(() => { s.display = "none"; }, ms + 50);
}

export function blendTick(ts) {
  const b = blendState;
  b.rafId = 0;
  if (!b.active) return;
  const dt = b.lastTs ? Math.min(100, ts - b.lastTs) : 1000 / 60;
  b.lastTs = ts;
  if (b.mode === "blend") {
    blendPlaceOverlay();
    const a = 1 - Math.exp(-dt / b.tau);
    blendCopy(blendStage, els.mainCanvas, a);
    blendCopy(blendOverlay, blendStage, a);
    // After the landing, follow the full-quality redraw for a while, then fade out.
    if (b.landed && !isInteracting) {
      if (!b.settledAt) b.settledAt = ts;
      else if (ts - b.settledAt >= BLEND_TAIL_MS) { blendFadeOut(BLEND_FADE_MS); return; }
    }
  } else if (!isInteracting) {
    // A crossfade holds the old picture until the new place's redraw, then dissolves to it.
    blendFadeOut(CROSSFADE_MS);
    return;
  }
  b.rafId = requestAnimationFrame(blendTick);
}

export function blendRun(mode) {
  const b = blendState;
  b.active = true; b.mode = mode;
  b.landed = false; b.settledAt = 0; b.lastTs = 0;
  if (!b.rafId) b.rafId = requestAnimationFrame(blendTick);
}

// A flight starts: the overlay starts as the picture on screen. A flight straight after another carries on
// from where the overlay is.
export function startFlightBlend() {
  blendEnsureCanvases();
  blendPlaceOverlay();
  if (!(blendState.active && blendState.mode === "blend")) {
    blendCopy(blendStage, els.mainCanvas, 1);
    blendCopy(blendOverlay, blendStage, 1);
  }
  blendShow();
  blendRun("blend");
}

// The flight's last frame is drawn: the overlay fades out after the full-quality redraw has settled in.
export function landFlightBlend() { blendState.landed = true; }

// Reduce Motion: called before the view jumps to the new place, so the overlay holds the old picture.
export function startCrossfade() {
  blendEnsureCanvases();
  blendPlaceOverlay();
  blendCopy(blendOverlay, els.mainCanvas, 1);
  blendShow();
  blendRun("crossfade");
}

// A touch, Back or a fractal switch takes over: the live picture shows at once.
export function cancelFlightBlend() {
  if (!blendOverlay) return;
  blendState.active = false;
  if (blendState.rafId) { cancelAnimationFrame(blendState.rafId); blendState.rafId = 0; }
  clearTimeout(blendState.fadeTimer);
  blendOverlay.style.display = "none";
}

// For the test driver's settled(): true while the overlay is on screen, fading included.
export function flightBlendBusy() {
  return !!blendOverlay && blendOverlay.style.display !== "none";
}
