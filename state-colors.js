// The state functions that call into render-layout.js or share.js, so they can't live in state.js:
// the default-colormap bookkeeping (colormapIndex and friends), setColorStyle, the interaction
// timers, Back (popHistory) and the WebGL context-loss handlers. Needs state.js, configs.js,
// colormaps.js and, inside function bodies only, render-layout.js and share.js.
"use strict";

// ---------------------------------------------------------------- default colormaps

let colormapIndex = 0;

// Each fractal opens in its own palette (defaultColormap in FRACTAL_CONFIGS;
// the first colormap, Inferno, when it names none), and a Surprise-me place
// can name one too (colormap in places.js). That holds until the user picks
// a palette (the Color sheet's palettes, a Look, or a share link naming one
// that isn't the fractal's own): from then on the pick applies everywhere,
// as the colormap has been one global since 1.17.0. colormapPicked is in
// memory only, like fractalMemory: a new launch starts on the defaults.
// fractalMemory keeps views, not palettes, so a remembered fractal comes back
// in its default too unless something was picked.
let colormapPicked = false;
// The palette that is the default for what is on screen (the fractal's or
// the landed place's): what the Default Look and Reset return to.
let colormapDefaultIndex = 0;

function colormapIndexNamed(name) {
  return Math.max(0, COLORMAPS.findIndex((c) => c.name === name));
}
// The default palette's name for a fractal, or for one of its places.
function defaultColormapName(fractal, place = null) {
  return (place && place.colormap) || FRACTAL_CONFIGS[fractal].defaultColormap || COLORMAPS[0].name;
}
// The user's own pick: it holds for every fractal and place from now on.
function pickColormap(i) {
  colormapPicked = true;
  colormapIndex = i;
  updateLUT();
}
// Called when the fractal changes (selectFractal) or a flight starts
// (flyTo, with the place it lands on): moves to the default unless a palette
// has been picked.
function applyDefaultColormap(place = null) {
  colormapDefaultIndex = colormapIndexNamed(defaultColormapName(currentName, place));
  if (colormapPicked || colormapDefaultIndex === colormapIndex) return;
  colormapIndex = colormapDefaultIndex;
  updateLUT();
}
// Back to the defaults: the Default Look and Reset in the Color sheet.
function releaseColormapPick() {
  colormapPicked = false;
  if (colormapIndex !== colormapDefaultIndex) {
    colormapIndex = colormapDefaultIndex;
    updateLUT();
  }
}

// ---------------------------------------------------------------- color style

// Strict: anything unknown or out of range falls back to today's coloring
// (or keeps the current value for a field left out), never throws.
function setColorStyle(next = {}) {
  const prev = { ...colorStyle };
  if (next.style !== undefined) colorStyle.style = COLOR_STYLES.some((s) => s.id === next.style) ? next.style : "smooth";
  if (next.density !== undefined) {
    colorStyle.density = Number.isFinite(next.density)
      ? Math.min(COLOR_BANDS_RANGE[1], Math.max(COLOR_BANDS_RANGE[0], next.density)) : 1;
  }
  if (next.offset !== undefined) {
    const o = next.offset;
    // (a value already in 0..1 is kept exactly; the wrap would add rounding)
    colorStyle.offset = !Number.isFinite(o) ? 0 : o >= 0 && o < 1 ? o : ((o % 1) + 1) % 1;
  }
  if (next.trap !== undefined) {
    colorStyle.trap = Array.isArray(next.trap) && next.trap.length === 2 && next.trap.every(Number.isFinite) ? [next.trap[0], next.trap[1]] : null;
  }
  if (prev.style !== colorStyle.style || prev.density !== colorStyle.density || prev.offset !== colorStyle.offset
    || String(prev.trap) !== String(colorStyle.trap)) {
    labelColormapButton();
    requestRender();
  }
}

// ---------------------------------------------------------------- interaction timers

// (isInteracting and settleTimer are declared in state.js, with the comment on what the delay costs.)
function markInteracting() {
  isInteracting = true;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    isInteracting = false;
    settleTimer = null;
    applyAutoIter();
    requestRender();
  }, 200);
}

// The vector views' counterpart: while a drag, pinch or wheel zoom is in
// progress they draw at a coarser pixel limit (opts.lite), because a full
// frame of the dragon at depth 16 took 200-400 ms per move on a phone-speed
// CPU and the pinch looked frozen. Full detail returns when the last finger
// lifts, or 150 ms after the last wheel tick.
let vectorLite = false;
let vectorLiteTimer = null;
function markVectorInteracting() {
  vectorLite = true;
  if (vectorLiteTimer) clearTimeout(vectorLiteTimer);
  vectorLiteTimer = setTimeout(endVectorInteracting, 150);
}
function endVectorInteracting() {
  if (vectorLiteTimer) clearTimeout(vectorLiteTimer);
  vectorLiteTimer = null;
  if (!vectorLite) return;
  vectorLite = false;
  requestRender();
}

// ---------------------------------------------------------------- WebGL context loss

// iOS Safari has historically been more willing than desktop browsers to
// silently drop a WebGL context under memory pressure — exactly the kind of
// load a deep-zoom perturbation session creates. There's no cheap way to
// reconstruct every GL resource (buffers, textures, compiled shaders, the
// two-pass FBOs) in place, so rather than risk a half-reinitialized,
// subtly-broken renderer, this does the simple, reliable thing: freeze the
// canvas, tell the user, and reload once the context comes back.
[els.mainCanvas, els.juliaCanvas].forEach((canvas) => {
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    reportError("WebGL context lost (likely memory pressure). Waiting to recover — the page will reload automatically once it does.");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    // Carry the current view across the reload as a share link, so a deep
    // zoom isn't lost at exactly the moment memory pressure hits.
    // replaceState, not location.hash: that would fire hashchange, whose
    // handler strips the hash again before the reload commits.
    try { history.replaceState(null, "", location.pathname + location.search + buildShareHash()); } catch { /* reload to the default view */ }
    location.reload();
  });
});

// ---------------------------------------------------------------- Back

function popHistory(pane) {
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  const snap = hist.pop();
  if (!snap) return;
  const st = pane === "julia" ? juliaState : mainState;
  st.cx = snap.cx; st.cy = snap.cy; st.scale = snap.scale; st.rotation = snap.rotation ?? 0; st.flipY = !!snap.flipY;
  applyAutoIter();
  renderAll();
}
