// Four Seasons, the Pythagoras tree's animated place: landing on it and playing it (the pure part, the cycle's
// color, depth, sway and particles, is fractals/tree-seasons.js).
// Choosing the place (Places sheet, flyToSeasonsPlace) opens the tree, frames it whole and plays the cycle: each
// frame hands the tree view a look (treeView.season: a blended color, a fractional depth, a sway) and draws the
// falling blossoms, leaves and snow on a canvas of its own above the tree.
//
// What it changes and what it doesn't: the picked color (vectorColors.tree) and depth (treeState.depth) are never
// written, so the color button, the depth slider, a share link and Back show the user's own choices throughout.
// A touch, drag, pinch or wheel on the tree stops the animation and leaves the tree as drawn at that moment
// (the sway folds into the view's rotation, the look stays) while pan, zoom and twist work as usual. The look
// ends, and the tree returns to the picked color and depth, when the user picks a color, moves the depth slider,
// chooses the place again (it starts over), or leaves the tree (modes.js setMode). With Reduce Motion the place
// lands on the still spring tree, plays nothing and says nothing.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it).
import { treeState, treeView, vectorColors, els, mode, dualActive } from "../core/state.js?v=1.81.0";
import { SEASON_DEEP, SEASON_LABEL, SEASON_PLACES, SEASON_SPRING, drawSeasonParticles, seasonAt, seasonParticles } from "../fractals/tree-seasons.js?v=1.81.0";
import { announce } from "../fractals/chaos-run.js?v=1.81.0";
import { renderAll } from "../render/render-layout.js?v=1.81.0";
import { normalizeAngle } from "../core/view-math.js?v=1.81.0";
import { exitDual, setMode } from "./modes.js?v=1.81.0";
import { fitVectorView, treeNav } from "./vector-interaction.js?v=1.81.0";
import { prefersReducedMotion } from "./compass-ui.js?v=1.81.0";
import { cancelTeleport } from "./teleport.js?v=1.81.0";
import { updateCanvasA11y } from "./canvas-a11y.js?v=1.81.0";

export const SEASONS_FRAME_MS = 33;   // at most about 30 frames a second: the tree is drawn twice while a level blends in

export let seasonsRun = null;   // { gen, t0, overlay, ctx, season } while playing, else null
export let seasonsGeneration = 0;

// True while the cycle is playing (not after a touch has stopped it).
export function seasonsPlaying() { return seasonsRun !== null && treeView.season === seasonsRun.season; }

export function seasonsOverlay() {
  let c = document.getElementById("treeSeasonsFx");
  if (!c) {
    c = document.createElement("canvas");
    c.id = "treeSeasonsFx";
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:absolute;pointer-events:none;";
    els.treeCanvas.insertAdjacentElement("afterend", c);
  }
  return c;
}

// Sizes the overlay to the tree canvas (css box in #canvasArea, device pixels at most 2x) and returns the factor.
export function seasonsFitOverlay(c) {
  const t = els.treeCanvas;
  const k = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, t.clientWidth), h = Math.max(1, t.clientHeight);
  c.style.left = `${t.offsetLeft}px`;
  c.style.top = `${t.offsetTop}px`;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  const pw = Math.round(w * k), ph = Math.round(h * k);
  if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
  return k;
}

export function seasonLook(t) {
  const s = seasonAt(t);
  return { rgb: s.rgb, depth: s.depth, sway: s.sway };
}

// Takes the animation down: the overlay goes, the loop and the touch listeners end. `freeze`: the look stays
// as drawn (a touch stopped it); otherwise the tree view is handed back to the picked color and depth.
export function stopSeasons(freeze = false) {
  const run = seasonsRun;
  if (!run) return;
  seasonsRun = null;
  seasonsGeneration++;
  document.removeEventListener("pointerdown", seasonsTouch, true);
  els.treeCanvas.removeEventListener("wheel", seasonsTouch, true);
  run.overlay.remove();
  if (treeView.season === run.season) {
    if (freeze) {
      // As drawn: the sway becomes the view's own rotation, so nothing moves under the user's first touch.
      treeView.view.rotation = normalizeAngle((treeView.view.rotation || 0) + (run.season.sway || 0));
      run.season.sway = 0;
      run.season.playing = false;
    } else {
      treeView.season = null;
    }
  }
  updateCanvasA11y();
}

// A touch, a drag, a pinch or the wheel on the tree. The capture phase on the document runs before the
// view's own handlers, so its first gesture starts from the frozen tree.
export function seasonsTouch(e) {
  if (e.target !== els.treeCanvas) return;
  stopSeasons(true);
}

// Starts the cycle on the tree now on screen.
export function startSeasons() {
  stopSeasons(false);
  const gen = ++seasonsGeneration;
  const base = { baseColor: vectorColors.tree, baseDepth: treeState.depth };
  const first = seasonLook(0);
  const season = { ...first, ...base, playing: true };   // `playing`: the canvas's screen-reader label says so (canvas-a11y.js)
  const overlay = seasonsOverlay();
  const run = { gen, t0: performance.now(), last: -Infinity, overlay, ctx: overlay.getContext("2d"), season, list: [] };
  seasonsRun = run;
  treeView.season = season;
  document.addEventListener("pointerdown", seasonsTouch, true);
  els.treeCanvas.addEventListener("wheel", seasonsTouch, { capture: true, passive: true });
  const step = (now) => {
    if (seasonsRun !== run || run.gen !== seasonsGeneration) return;
    // Anyone who ended the look (a color or depth picked, another mode) ends the animation with it.
    if (mode !== "tree" || treeView.season !== season) { stopSeasons(false); return; }
    if (now - run.last >= SEASONS_FRAME_MS) {
      run.last = now;
      const t = (now - run.t0) / 1000;
      Object.assign(season, seasonLook(t));
      renderAll();
      const k = seasonsFitOverlay(overlay);
      run.ctx.clearRect(0, 0, overlay.width, overlay.height);
      drawSeasonParticles(run.ctx, seasonParticles(t, overlay.width / k, overlay.height / k, run.list), k);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Lands on the place: the tree, framed whole, then the cycle. Reduce Motion: the still spring tree, nothing said.
export function playSeasonsPlace() {
  cancelTeleport();
  if (dualActive) exitDual();
  stopSeasons(false);
  if (mode !== "tree") setMode("tree");
  treeNav.clearHistory();
  fitVectorView("tree");
  if (prefersReducedMotion()) {
    treeView.season = { rgb: SEASON_SPRING.slice(), depth: SEASON_DEEP, sway: 0, baseColor: vectorColors.tree, baseDepth: treeState.depth };
    renderAll();
    updateCanvasA11y();
    return;
  }
  startSeasons();
  renderAll();
  announce(SEASON_LABEL);
  updateCanvasA11y();
}

// The Places sheet's row for place i of SEASON_PLACES.
export function flyToSeasonsPlace(i = 0) {
  if (SEASON_PLACES[i]?.animation !== "seasons") throw new Error(`No animated place ${i}`);
  playSeasonsPlace();
}
