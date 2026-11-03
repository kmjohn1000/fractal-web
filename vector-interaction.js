// Pointer, touch and wheel interaction for the vector views (Koch, tree, hexaflake, the line curves and
// the dot shapes): attachVectorViewInteraction and the nav objects, each view's framing (Reset's
// vectorViewBox, fitVectorView) and activeVectorTarget. Split from interaction.js, which keeps the
// WebGL panes' gestures and the keyboard actions. Needs the state (state.js, state-colors.js),
// render-layout.js, fractal-defs.js and pattern-controls.js (touchDotReplay, inside handlers only).
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { dragonState, dragonView, els, fernView, hexaflakeView, kochView, mode, treeView } from "./state.js?v=1.56.0";
import { LINE_CURVES } from "./dragon.js?v=1.56.0";
import { ifsData } from "./ifs.js?v=1.56.0";
import { isCurveMode, isIfsMode, viewFromBounds } from "./fractal-defs.js?v=1.56.0";
import { endVectorInteracting, markVectorInteracting } from "./state-colors.js?v=1.56.0";
import { requestRender } from "./render-layout.js?v=1.56.0";
import { normalizeAngle } from "./view-math.js?v=1.56.0";
import { touchDotReplay } from "./pattern-controls.js?v=1.56.0";

// The fern's own box-zoom toggle (the dot shapes' control row is separate from the toolbar's, whose
// toggle is in interaction.js). Only this file reads or assigns it.
export let fernBoxZoomActive = false;
els.fernBoxZoomBtn.addEventListener("click", () => {
  fernBoxZoomActive = !fernBoxZoomActive;
  els.fernBoxZoomBtn.classList.toggle("active", fernBoxZoomActive);
  if (!fernBoxZoomActive) els.boxRect.classList.add("hidden");
});

// vectorViewBox's boxes for the line curves, by curve and depth.
export const curveBoxCache = new Map();

// ---------------------------------------------------------------- interaction: Koch canvas

// Shared pan/pinch-zoom/wheel-zoom for any Canvas2D vector view (Koch,
// Pythagoras tree) — both createKochView() and createPythagorasTreeView()
// return the same shape ({view, dpr, screenToWorld, ...}), so this one
// function covers both instead of duplicating the gesture logic per mode,
// the way attachFractalInteraction is the single shared handler for the
// two WebGL canvases.
// isBoxZoomActive (optional): when it returns true, a one-finger drag draws
// the shared #boxZoomRect and zooms to it on release instead of panning --
// the vector-view analog of the WebGL panes' box zoom (commitBoxZoom).
//
// Returns { back, clearHistory, checkpoint }: each vector view keeps its own
// pan/zoom history stack, checkpointed at the same moments
// attachFractalInteraction pushes for the WebGL panes (one-finger drag
// start, pinch start, wheel zoom throttled to one checkpoint per 400ms
// burst, box-zoom commit). checkpoint() is that same throttled push, for
// keyboard navigation.
export function attachVectorViewInteraction(canvas, vectorView, isBoxZoomActive = () => false) {
  const pointers = new Map();
  const history = [];
  let lastWheelPush = 0;
  function pushViewHistory() {
    const v = vectorView.view;
    history.push({ cx: v.cx, cy: v.cy, halfHeight: v.halfHeight, rotation: v.rotation || 0 });
    if (history.length > 50) history.shift();
  }
  function back() {
    const snap = history.pop();
    if (!snap) return;
    Object.assign(vectorView.view, snap);
    requestRender();
  }
  const boxPane = `vector:${canvas.id}`;
  const boxDragging = () => isBoxZoomActive()
    && els.boxRect.dataset.pane === boxPane && !els.boxRect.classList.contains("hidden");

  // Same rotation-safe construction as commitBoxZoom: the new center is the
  // world point under the box's screen-center (one screenToWorld query,
  // exact at any rotation), and the new half-height comes from the box's
  // on-screen size, never from differencing two rotated corners. Rotation
  // is left unchanged -- box zoom reframes, it doesn't reorient.
  function commitVectorBoxZoom() {
    const rect = canvas.getBoundingClientRect();
    const w = parseFloat(els.boxRect.style.width);
    const h = parseFloat(els.boxRect.style.height);
    if (w < 4 || h < 4) return;
    const dpr = vectorView.dpr;
    const sx = (parseFloat(els.boxRect.style.left) - rect.left + w / 2) * dpr;
    const sy = (parseFloat(els.boxRect.style.top) - rect.top + h / 2) * dpr;
    const [cx, cy] = vectorView.screenToWorld(sx, sy);
    // halfHeight world units span canvas.height/2 device pixels.
    const unitsPerPx = vectorView.view.halfHeight / (canvas.height / 2);
    const halfH = (h / 2) * dpr * unitsPerPx;
    const halfW = (w / 2) * dpr * unitsPerPx;
    const aspect = canvas.width / canvas.height;
    pushViewHistory();
    vectorView.view.cx = cx;
    vectorView.view.cy = cy;
    vectorView.view.halfHeight = Math.max(halfH, halfW / Math.max(aspect, 1e-6));
    requestRender();
  }
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartHalfHeight = null;
  let pinchStartAngle = null;
  let pinchStartRotation = null;

  // Given a canvas-pixel (dpr-scaled) screen point and the world point that
  // should end up under it, solves for the view center that makes that so
  // — the vector-view analog of centerForAnchor above, needed once these
  // views can rotate (a plain screen-delta pan, which this replaced,
  // doesn't generalize to a rotated view for the same reason
  // centerForAnchor's own comment gives).
  function centerForVectorAnchor(sx, sy, targetX, targetY) {
    const uvx = (sx - canvas.width / 2) / (canvas.height / 2);
    const uvy = (canvas.height / 2 - sy) / (canvas.height / 2);
    const rot = vectorView.view.rotation || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const wx = uvx * cos - uvy * sin;
    const wy = uvx * sin + uvy * cos;
    return {
      cx: targetX - wx * vectorView.view.halfHeight,
      cy: targetY - wy * vectorView.view.halfHeight,
    };
  }

  function localPixel(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * vectorView.dpr, y: (clientY - rect.top) * vectorView.dpr };
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touchDotReplay(); // a touch on the picture ends a default chaos-game replay (the app's own run follows the view)
    if (isBoxZoomActive() && pointers.size === 1) {
      // Same viewport-coordinate bookkeeping as the WebGL panes' box zoom
      // (see attachFractalInteraction's pointerdown for why).
      els.boxRect.classList.remove("hidden");
      els.boxRect.dataset.pane = boxPane;
      els.boxRect.dataset.startClientX = e.clientX;
      els.boxRect.dataset.startClientY = e.clientY;
      els.boxRect.style.left = `${e.clientX}px`;
      els.boxRect.style.top = `${e.clientY}px`;
      els.boxRect.style.width = "0px";
      els.boxRect.style.height = "0px";
      return;
    }
    if (pointers.size === 1) {
      const p = localPixel(e.clientX, e.clientY);
      const world = vectorView.screenToWorld(p.x, p.y);
      panStart = { worldX: world[0], worldY: world[1] };
      pushViewHistory();
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartHalfHeight = vectorView.view.halfHeight;
      pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchStartRotation = vectorView.view.rotation || 0;
      pushViewHistory();
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (boxDragging()) {
      const startClientX = parseFloat(els.boxRect.dataset.startClientX);
      const startClientY = parseFloat(els.boxRect.dataset.startClientY);
      els.boxRect.style.left = `${Math.min(startClientX, e.clientX)}px`;
      els.boxRect.style.top = `${Math.min(startClientY, e.clientY)}px`;
      els.boxRect.style.width = `${Math.abs(e.clientX - startClientX)}px`;
      els.boxRect.style.height = `${Math.abs(e.clientY - startClientY)}px`;
      return;
    }
    if (pointers.size === 1 && panStart) {
      const p = localPixel(e.clientX, e.clientY);
      const anchored = centerForVectorAnchor(p.x, p.y, panStart.worldX, panStart.worldY);
      vectorView.view.cx = anchored.cx;
      vectorView.view.cy = anchored.cy;
      markVectorInteracting();
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = canvas.getBoundingClientRect();
      const midX = ((pts[0].x + pts[1].x) / 2 - rect.left) * vectorView.dpr;
      const midY = ((pts[0].y + pts[1].y) / 2 - rect.top) * vectorView.dpr;
      const before = vectorView.screenToWorld(midX, midY);
      vectorView.view.halfHeight = pinchStartHalfHeight * (pinchStartDist / Math.max(dist, 1));
      // Two-finger twist, same convention as attachFractalInteraction:
      // set rotation before recomputing `after` so the before/after anchor
      // trick keeps the midpoint stable under combined pinch+rotate.
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      vectorView.view.rotation = normalizeAngle(pinchStartRotation + (angle - pinchStartAngle));
      const after = vectorView.screenToWorld(midX, midY);
      vectorView.view.cx += before[0] - after[0];
      vectorView.view.cy += before[1] - after[1];
      markVectorInteracting();
      requestRender();
    }
  });

  function release(e) {
    if (boxDragging()) {
      commitVectorBoxZoom();
      els.boxRect.classList.add("hidden");
      pointers.delete(e.pointerId);
      return;
    }
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [p] = pointers.values();
      const local = localPixel(p.x, p.y);
      const world = vectorView.screenToWorld(local.x, local.y);
      panStart = { worldX: world[0], worldY: world[1] };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
    pinchStartAngle = null;
    // Fingers up: the full-detail frame, now rather than after the timer.
    if (pointers.size === 0) endVectorInteracting();
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function checkpoint() {
    const now = performance.now();
    if (now - lastWheelPush > 400) { pushViewHistory(); lastWheelPush = now; }
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (isBoxZoomActive()) return;
    touchDotReplay();
    checkpoint();
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * vectorView.dpr;
    const sy = (e.clientY - rect.top) * vectorView.dpr;
    const before = vectorView.screenToWorld(sx, sy);
    vectorView.view.halfHeight *= Math.exp(e.deltaY * 0.0015);
    const after = vectorView.screenToWorld(sx, sy);
    vectorView.view.cx += before[0] - after[0];
    vectorView.view.cy += before[1] - after[1];
    markVectorInteracting();
    requestRender();
  }, { passive: false });

  return { back, checkpoint, clearHistory: () => { history.length = 0; }, canGoBack: () => history.length > 0 };
}

// The region each vector view shows in full when its mode first opens and
// on Reset: the measured extent of its geometry plus a small margin, fitted
// to the canvas aspect with the same viewFromBounds the WebGL fractals use
// (a fixed zoom level cut the sides off wide shapes on portrait phones).
// Koch spans x +-0.866, y +-1 (its box leaves the tips about 8% of the width
// from the sides of a phone); the tree (depth 12) x +-2.95, y 0..3.95; the
// hexaflake x +-1, y +-0.866; the fern FERN_BOUNDS. The dragon rotates 45 degrees per depth level, so a
// box covering every depth would open it badly zoomed out -- it's fitted
// to the current depth instead.
export function vectorViewBox(modeKey) {
  if (modeKey === "koch") return [-1.03, 1.03, -1.12, 1.12];
  if (modeKey === "tree") return [-3.0, 3.0, -0.1, 4.05];
  if (modeKey === "hexaflake") return [-1.08, 1.08, -0.96, 0.96];
  if (modeKey === "fern") return [-2.4, 2.9, -0.2, 10.25];
  if (isIfsMode(modeKey)) {
    const [x0, x1, y0, y1] = ifsData(modeKey).bounds;
    const m = 0.04 * Math.max(x1 - x0, y1 - y0);
    return [x0 - m, x1 + m, y0 - m, y1 + m];
  }
  // Every render asks (vectorFitHalfHeight), so the box is cached per curve
  // and depth; computing it walks all the curve's points.
  const key = `${modeKey},${dragonState.depth}`;
  let box = curveBoxCache.get(key);
  if (!box) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of LINE_CURVES[modeKey].points(dragonState.depth)) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const m = 0.06 * Math.max(x1 - x0, y1 - y0);
    box = [x0 - m, x1 + m, y0 - m, y1 + m];
    curveBoxCache.set(key, box);
  }
  return box;
}

export const VECTOR_VIEWS = {
  koch: [kochView, els.kochCanvas], tree: [treeView, els.treeCanvas],
  dragon: [dragonView, els.dragonCanvas], fern: [fernView, els.fernCanvas],
  sierpinski: [fernView, els.fernCanvas], pentagon: [fernView, els.fernCanvas], levy: [fernView, els.fernCanvas],
  vicsek: [fernView, els.fernCanvas], hexaflake: [hexaflakeView, els.hexaflakeCanvas],
  hilbert: [dragonView, els.dragonCanvas], gosper: [dragonView, els.dragonCanvas],
  arrowhead: [dragonView, els.dragonCanvas],
};
export const fittedVectorModes = new Set();
// The framing Reset gives a pattern mode on its canvas as it is now.
export function vectorFitView(modeKey) {
  const canvas = VECTOR_VIEWS[modeKey][1];
  const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
  return viewFromBounds(vectorViewBox(modeKey), aspect);
}
export function fitVectorView(modeKey) {
  const v = vectorFitView(modeKey);
  Object.assign(VECTOR_VIEWS[modeKey][0].view, { cx: v.cx, cy: v.cy, halfHeight: v.scale, rotation: 0 });
  fittedVectorModes.add(modeKey);
}
// True while a pattern view is still at the framing Reset would give it: not
// panned, zoomed or turned since.
export function vectorViewIsFitted(modeKey) {
  const fit = vectorFitView(modeKey);
  const v = VECTOR_VIEWS[modeKey][0].view;
  const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  return same(v.cx, fit.cx) && same(v.cy, fit.cy) && same(v.halfHeight, fit.scale) && same(v.rotation || 0, 0);
}
// Koch, tree and dragon add detail beyond the depth slider as you zoom in
// past this framing's half-height, so the views are told what it is.
export const vectorFitHalfHeight = (modeKey) => vectorFitView(modeKey).scale;

export const kochNav = attachVectorViewInteraction(els.kochCanvas, kochView);
export const treeNav = attachVectorViewInteraction(els.treeCanvas, treeView);
export const hexaflakeNav = attachVectorViewInteraction(els.hexaflakeCanvas, hexaflakeView);
export const dragonNav = attachVectorViewInteraction(els.dragonCanvas, dragonView);
export const fernNav = attachVectorViewInteraction(els.fernCanvas, fernView, () => fernBoxZoomActive);
els.kochBackBtn.addEventListener("click", () => kochNav.back());
els.treeBackBtn.addEventListener("click", () => treeNav.back());
els.hexaflakeBackBtn.addEventListener("click", () => hexaflakeNav.back());
els.dragonBackBtn.addEventListener("click", () => dragonNav.back());
els.fernBackBtn.addEventListener("click", () => fernNav.back());

// The vector view, its canvas, nav (history) and Reset button for the
// active non-fractal mode.
export function activeVectorTarget() {
  if (mode === "koch") return { v: kochView, canvas: els.kochCanvas, nav: kochNav, resetBtn: els.kochResetBtn };
  if (mode === "tree") return { v: treeView, canvas: els.treeCanvas, nav: treeNav, resetBtn: els.treeResetBtn };
  if (mode === "hexaflake") return { v: hexaflakeView, canvas: els.hexaflakeCanvas, nav: hexaflakeNav, resetBtn: els.hexaflakeResetBtn };
  if (isCurveMode(mode)) return { v: dragonView, canvas: els.dragonCanvas, nav: dragonNav, resetBtn: els.dragonResetBtn };
  if (isIfsMode(mode)) return { v: fernView, canvas: els.fernCanvas, nav: fernNav, resetBtn: els.fernResetBtn };
  return null;
}
