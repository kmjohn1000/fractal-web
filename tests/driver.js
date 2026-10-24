"use strict";
/* global FRACTAL_CONFIGS, EXTRA_MODES, TELEPORT_DESTINATIONS, dualActive, exitDual, selectFractal,
   setMode, mainState, applyAutoIter, updateLUT, requestRender, renderPending, isInteracting,
   refineDone, mode, isIfsMode, fernView, colormapIndex:writable, colormapPicked:writable, applyDefaultColormap,
   mainRenderer, juliaRenderer */

// In-page helpers for the visual suite (tests/visual/app.spec.mjs). Added to
// the page as a classic <script> after the app's scripts load, so it sees their
// top-level declarations just as the app's own code does. Each loader puts
// the app in one state the same way the app itself would (selectFractal,
// setMode, a Surprise-me landing) without animating there.
window.__vt = {
  counts() {
    return {
      fractals: Object.keys(FRACTAL_CONFIGS).length,
      modes: EXTRA_MODES.length,
      places: TELEPORT_DESTINATIONS.length,
      colormaps: COLORMAPS.length,
    };
  },

  // cm: a COLORMAPS index to pick, as the user does in the Color sheet; left
  // out, nothing is picked and the fractal opens in its own default palette.
  fractal(name, cm) {
    if (dualActive) exitDual();
    colormapPicked = cm !== undefined;
    if (cm !== undefined) colormapIndex = cm;
    selectFractal(name, { fresh: true });
    updateLUT();
    requestRender();
  },

  colormap(name) {
    const i = COLORMAPS.findIndex((c) => c.name === name);
    if (i < 0) throw new Error(`no colormap ${name}`);
    this.fractal("Mandelbrot", i);
  },

  mode(key) {
    colormapIndex = 0;
    updateLUT();
    setMode(key);
  },

  // A Surprise-me landing, as teleport() leaves it once the flight ends.
  place(index, cm) {
    const d = TELEPORT_DESTINATIONS[index];
    this.fractal(d.fractal, cm);
    applyDefaultColormap(d); // the place's own palette, if it has one and none was picked
    Object.assign(mainState, { cx: Number(d.re), cy: Number(d.im), scale: d.scale });
    if (d.rotation !== undefined) mainState.rotation = d.rotation;
    if (d.maxIter) {
      mainState.maxIter = d.maxIter;
      mainState.iterAutoLocked = true;
    } else {
      mainState.iterAutoLocked = false;
      applyAutoIter();
    }
    requestRender();
  },

  // For the checks' self-tests: a view deep inside the Mandelbrot set's
  // main cardioid (every pixel black), and a forced WebGL context loss.
  blackout() {
    this.fractal("Mandelbrot");
    Object.assign(mainState, { cx: -0.1, cy: 0, scale: 1e-3 });
    requestRender();
  },
  loseContext() {
    const r = mainRenderer;
    r.canvas.getContext(r.webgl2 ? "webgl2" : "webgl").getExtension("WEBGL_lose_context").loseContext();
  },

  // True once the frame is final: no render queued, every supersample of a
  // WebGL fractal blended in, and an IFS mode's points all plotted.
  settled() {
    if (renderPending || isInteracting) return false;
    if (mode === "fractal") return refineDone;
    if (isIfsMode(mode)) return !fernView.refining;
    return true;
  },

  // Layout and GL state for the checks in app.spec.mjs.
  inspect() {
    const canvas = [...document.querySelectorAll("#canvasArea canvas")].find((c) => c.offsetWidth > 0);
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const renderers = mode === "fractal" ? [mainRenderer, dualActive ? juliaRenderer : null].filter(Boolean) : [];
    const banner = document.getElementById("errorBanner");
    return {
      canvasId: canvas ? canvas.id : null,
      canvas: canvas ? rect(canvas) : null,
      buffer: canvas ? { w: canvas.width, h: canvas.height } : null,
      controls: rect(document.getElementById("controls")),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      // getContext with the renderer's own type returns its existing context.
      contextLost: renderers.some((r) => r.canvas.getContext(r.webgl2 ? "webgl2" : "webgl").isContextLost()),
      contextLostEvents: window["__vtContextLost"] || 0,
      error: banner.classList.contains("hidden") ? null : banner.textContent,
    };
  },
};
