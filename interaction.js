// Pointer, touch and keyboard interaction: the fractal canvases, the vector views (Koch, tree,
// dragon, fern) and the keyboard actions. Needs the state (state.js, state-colors.js), render-layout.js and
// fractal-defs.js; calls the later scripts (cancelTeleport, glideMainTo, ...) only inside function bodies.
"use strict";

// ---------------------------------------------------------------- interaction: fractal canvases

function attachFractalInteraction(canvas, getState, paneName, renderer) {
  const pointers = new Map();
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartScale = null;
  let pinchStartAngle = null;
  let pinchStartRotation = null;
  let downPos = null;
  let lastZoomPush = 0;
  // True for the whole span from a second finger touching down until every
  // finger has lifted — guards the tap-to-set-Julia-c check below, which
  // otherwise fires on the LAST finger of a pinch/rotate to release: downPos
  // gets overwritten by every pointerdown (not tracked per-pointer), so once
  // the first finger lifts, the remaining (second) finger's release is
  // checked against ITS OWN down position, and a finger that acted as a
  // relatively stationary pinch/rotate anchor can easily stay under the 6px
  // tap threshold from where IT went down, even though a real two-finger
  // gesture happened.
  let multiTouch = false;

  function screenToWorldHere(sx, sy) {
    return screenToComplex(renderer, getState(), sx, sy);
  }

  // screenToComplex expects coordinates relative to this canvas's own
  // top-left corner, but pointer/wheel events report page-relative
  // clientX/clientY — the canvas isn't flush with the page origin (the HUD
  // sits above it, and in dual mode the Julia pane sits beside/below it), so
  // this offset must be subtracted before any zoom-anchoring math.
  function toLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    cancelTeleport();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) multiTouch = true;
    activePane = paneName;
    downPos = { x: e.clientX, y: e.clientY };

    if (boxZoomActive) {
      // The main canvas can be showing a frozen, stale frame if this drag
      // starts while a previous gesture's settle delay hasn't fired yet
      // (see markInteracting/renderAll) — force it caught up to the actual
      // current state first, so the box is always drawn on top of exactly
      // the pixels commitBoxZoom's math will use.
      if (isInteracting) {
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
        isInteracting = false;
        renderAll();
      }
      // boxRect is position:fixed, so its geometry lives entirely in
      // viewport (clientX/clientY) coordinates during the drag — storing
      // the start point here and reusing it directly in pointermove avoids
      // re-deriving it via a fresh canvas rect on every move, which used to
      // drift the box whenever the canvas's on-screen position shifted
      // mid-drag (e.g. Safari's toolbar collapsing/expanding).
      els.boxRect.classList.remove("hidden");
      els.boxRect.dataset.pane = paneName;
      els.boxRect.dataset.startClientX = e.clientX;
      els.boxRect.dataset.startClientY = e.clientY;
      els.boxRect.style.left = `${e.clientX}px`;
      els.boxRect.style.top = `${e.clientY}px`;
      els.boxRect.style.width = "0px";
      els.boxRect.style.height = "0px";
      return;
    }

    if (pointers.size === 1) {
      // Anchor on the world point under the finger, not a screen-space
      // delta from it — a delta-based pan doesn't generalize to a rotated
      // view (see centerForAnchor), and this is exact regardless of
      // rotation.
      const local = toLocal(e.clientX, e.clientY);
      const world = screenToWorldHere(local.x, local.y);
      panStart = { worldX: world.x, worldY: world.y };
      // Pinch/wheel/box-zoom all push a history checkpoint before they
      // change the view; a plain one-finger drag never did, so Back after
      // zoom -> drag skipped straight past the drag to the pre-zoom state,
      // silently discarding the pan. Matches the pinch branch below exactly
      // (push immediately at gesture start, before any movement).
      pushHistory(paneName);
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScale = getState().scale;
      pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchStartRotation = getState().rotation || 0;
      pushHistory(paneName);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (boxZoomActive && els.boxRect.dataset.pane === paneName && !els.boxRect.classList.contains("hidden")) {
      const startClientX = parseFloat(els.boxRect.dataset.startClientX);
      const startClientY = parseFloat(els.boxRect.dataset.startClientY);
      const left = Math.min(startClientX, e.clientX);
      const top = Math.min(startClientY, e.clientY);
      els.boxRect.style.left = `${left}px`;
      els.boxRect.style.top = `${top}px`;
      els.boxRect.style.width = `${Math.abs(e.clientX - startClientX)}px`;
      els.boxRect.style.height = `${Math.abs(e.clientY - startClientY)}px`;
      return;
    }

    const st = getState();
    if (pointers.size === 1 && panStart) {
      const local = toLocal(e.clientX, e.clientY);
      const anchored = centerForAnchor(renderer, st, local.x, local.y, panStart.worldX, panStart.worldY);
      st.cx = anchored.cx;
      st.cy = anchored.cy;
      markInteracting();
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midClient = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const mid = toLocal(midClient.x, midClient.y);
      const before = screenToWorldHere(mid.x, mid.y);
      st.scale = limitScale(st, pinchStartScale * (pinchStartDist / Math.max(dist, 1)));
      // Two-finger twist: rotate by however much the finger-pair's angle has
      // changed since the gesture started. Setting rotation here, before
      // recomputing `after`, means the existing before/after anchor trick
      // below keeps the midpoint under the fingers stable under combined
      // pinch+rotate, exactly like it already does for pinch+pan.
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      st.rotation = normalizeAngle(pinchStartRotation + (angle - pinchStartAngle));
      const after = screenToWorldHere(mid.x, mid.y);
      st.cx += before.x - after.x;
      st.cy += before.y - after.y;
      markInteracting();
      requestRender();
    }
  });

  function release(e) {
    if (boxZoomActive && els.boxRect.dataset.pane === paneName && !els.boxRect.classList.contains("hidden")) {
      commitBoxZoom(paneName, getState(), renderer, canvas);
      els.boxRect.classList.add("hidden");
      pointers.delete(e.pointerId);
      if (pointers.size === 0) multiTouch = false;
      return;
    }

    // Tap-to-recenter: only on the main pane while dual mode is active,
    // only if the pointer barely moved (a click, not a drag), and only
    // outside a multi-touch gesture -- downPos isn't tracked per-pointer,
    // so without the multiTouch guard the last finger to lift from a
    // pinch/rotate gets checked against its OWN down position and can read
    // as a "tap" even though two fingers were down (see multiTouch's
    // comment above).
    if (paneName === "main" && dualActive && downPos && pointers.size === 1 && !multiTouch && !colorSheetTapJustClosed()) {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved < 6) {
        const local = toLocal(e.clientX, e.clientY);
        const world = screenToWorldHere(local.x, local.y);
        glideMainTo(world.x, world.y); // the Julia pane follows the center

      }
    }

    pointers.delete(e.pointerId);
    if (pointers.size === 0) multiTouch = false;
    if (pointers.size === 1) {
      const [p] = pointers.values();
      const local = toLocal(p.x, p.y);
      const world = screenToWorldHere(local.x, local.y);
      panStart = { worldX: world.x, worldY: world.y };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
    pinchStartAngle = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (boxZoomActive) return;
    cancelTeleport();
    activePane = paneName;
    const now = performance.now();
    if (now - lastZoomPush > 400) { pushHistory(paneName); lastZoomPush = now; }
    const st = getState();
    const local = toLocal(e.clientX, e.clientY);
    const before = screenToWorldHere(local.x, local.y);
    st.scale = limitScale(st, st.scale * Math.exp(e.deltaY * 0.0015));
    const after = screenToWorldHere(local.x, local.y);
    st.cx += before.x - after.x;
    st.cy += before.y - after.y;
    markInteracting();
    requestRender();
  }, { passive: false });
}

function commitBoxZoom(paneName, state, renderer, canvas) {
  const rect = canvas.getBoundingClientRect();
  const left = parseFloat(els.boxRect.style.left) - rect.left;
  const top = parseFloat(els.boxRect.style.top) - rect.top;
  const w = parseFloat(els.boxRect.style.width);
  const h = parseFloat(els.boxRect.style.height);
  if (w < 4 || h < 4) return;

  // Center: the world point under the box's screen-center. A single-point
  // query through screenToComplex is exact at any rotation.
  const centerPoint = screenToComplex(renderer, state, left + w / 2, top + h / 2);

  // Half-extents: derived from the box's on-screen size and the current
  // scale directly, NOT from subtracting two rotated corners (c2 - c1) —
  // rotation is a rigid transform, so it doesn't change how many world
  // units a screen pixel spans, but it does rotate the corner-difference
  // vector, which would silently distort this if rotation is nonzero.
  // (Reduces to the exact previous corner-difference formula at rotation=0,
  // verified by hand before this was shipped.)
  const dpr = renderer.dpr;
  const halfW = (w / 2) * dpr / canvas.height * state.scale * 2.0;
  const halfH = (h / 2) * dpr / canvas.height * state.scale * 2.0;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const newScale = limitScale(state, Math.max(halfH, halfW / Math.max(aspect, 1e-6)));

  pushHistory(paneName);
  const cx = centerPoint.x, cy = centerPoint.y;
  // rotation is intentionally left unchanged — box-zoom reframes, it
  // doesn't reorient
  state.cx = cx; state.cy = cy; state.scale = newScale;
  applyAutoIter();
  requestRender();
}

attachFractalInteraction(els.mainCanvas, () => mainState, "main", mainRenderer);
attachFractalInteraction(els.juliaCanvas, () => juliaState, "julia", juliaRenderer);

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
function attachVectorViewInteraction(canvas, vectorView, isBoxZoomActive = () => false) {
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
    stopDotReplay(); // a touch on the picture ends a chaos-game replay (the dot shapes')
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
    stopDotReplay();
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
function vectorViewBox(modeKey) {
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

const VECTOR_VIEWS = {
  koch: [kochView, els.kochCanvas], tree: [treeView, els.treeCanvas],
  dragon: [dragonView, els.dragonCanvas], fern: [fernView, els.fernCanvas],
  sierpinski: [fernView, els.fernCanvas], levy: [fernView, els.fernCanvas],
  vicsek: [fernView, els.fernCanvas], hexaflake: [hexaflakeView, els.hexaflakeCanvas],
  hilbert: [dragonView, els.dragonCanvas], gosper: [dragonView, els.dragonCanvas],
  arrowhead: [dragonView, els.dragonCanvas],
};
const fittedVectorModes = new Set();
// The framing Reset gives a pattern mode on its canvas as it is now.
function vectorFitView(modeKey) {
  const canvas = VECTOR_VIEWS[modeKey][1];
  const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
  return viewFromBounds(vectorViewBox(modeKey), aspect);
}
function fitVectorView(modeKey) {
  const v = vectorFitView(modeKey);
  Object.assign(VECTOR_VIEWS[modeKey][0].view, { cx: v.cx, cy: v.cy, halfHeight: v.scale, rotation: 0 });
  fittedVectorModes.add(modeKey);
}
// True while a pattern view is still at the framing Reset would give it: not
// panned, zoomed or turned since.
function vectorViewIsFitted(modeKey) {
  const fit = vectorFitView(modeKey);
  const v = VECTOR_VIEWS[modeKey][0].view;
  const same = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  return same(v.cx, fit.cx) && same(v.cy, fit.cy) && same(v.halfHeight, fit.scale) && same(v.rotation || 0, 0);
}
// Koch, tree and dragon add detail beyond the depth slider as you zoom in
// past this framing's half-height, so the views are told what it is.
const vectorFitHalfHeight = (modeKey) => vectorFitView(modeKey).scale;

const kochNav = attachVectorViewInteraction(els.kochCanvas, kochView);
const treeNav = attachVectorViewInteraction(els.treeCanvas, treeView);
const hexaflakeNav = attachVectorViewInteraction(els.hexaflakeCanvas, hexaflakeView);
const dragonNav = attachVectorViewInteraction(els.dragonCanvas, dragonView);
const fernNav = attachVectorViewInteraction(els.fernCanvas, fernView, () => fernBoxZoomActive);
els.kochBackBtn.addEventListener("click", () => kochNav.back());
els.treeBackBtn.addEventListener("click", () => treeNav.back());
els.hexaflakeBackBtn.addEventListener("click", () => hexaflakeNav.back());
els.dragonBackBtn.addEventListener("click", () => dragonNav.back());
els.fernBackBtn.addEventListener("click", () => fernNav.back());

// ---------------------------------------------------------------- interaction: keyboard

// Desktop keyboard navigation for every mode: arrows pan, Shift+Left/Right
// rotate (Google Maps' convention; Ctrl+arrows switch Spaces on macOS),
// +/- zoom about the center, R resets. Everything is expressed in screen
// terms and mapped through the view's own screen-to-world function, so
// "up" is always screen-up however the view is rotated. Held keys
// auto-repeat; history is checkpointed once per 400ms burst, like the
// wheel, so one Back undoes a whole held-key move.
const KEY_PAN_FRACTION = 0.1;              // of the canvas's shorter side
const KEY_ZOOM_FACTOR = 1.25;
const KEY_ROTATE_STEP = 5 * Math.PI / 180; // + is clockwise, like the twist

function keyAction(e) {
  const k = e.key;
  if (e.shiftKey && (k === "ArrowLeft" || k === "ArrowRight")) {
    return { rotate: k === "ArrowRight" ? KEY_ROTATE_STEP : -KEY_ROTATE_STEP };
  }
  if (e.shiftKey && (k === "ArrowUp" || k === "ArrowDown")) return null;
  if (k === "ArrowLeft") return { pan: [-1, 0] };
  if (k === "ArrowRight") return { pan: [1, 0] };
  if (k === "ArrowUp") return { pan: [0, -1] };   // screen y grows downward
  if (k === "ArrowDown") return { pan: [0, 1] };
  if (k === "+" || k === "=") return { zoom: 1 / KEY_ZOOM_FACTOR };
  if (k === "-" || k === "_") return { zoom: KEY_ZOOM_FACTOR };
  if ((k === "r" || k === "R") && !e.shiftKey) return { reset: true };
  return null;
}

// The vector view, its canvas, nav (history) and Reset button for the
// active non-fractal mode.
function activeVectorTarget() {
  if (mode === "koch") return { v: kochView, canvas: els.kochCanvas, nav: kochNav, resetBtn: els.kochResetBtn };
  if (mode === "tree") return { v: treeView, canvas: els.treeCanvas, nav: treeNav, resetBtn: els.treeResetBtn };
  if (mode === "hexaflake") return { v: hexaflakeView, canvas: els.hexaflakeCanvas, nav: hexaflakeNav, resetBtn: els.hexaflakeResetBtn };
  if (isCurveMode(mode)) return { v: dragonView, canvas: els.dragonCanvas, nav: dragonNav, resetBtn: els.dragonResetBtn };
  if (isIfsMode(mode)) return { v: fernView, canvas: els.fernCanvas, nav: fernNav, resetBtn: els.fernResetBtn };
  return null;
}

