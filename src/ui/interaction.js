// Pointer, touch and keyboard interaction: the two fractal canvases (the WebGL panes) and the
// keyboard actions. The vector views' gestures and framing are in vector-interaction.js.
// Needs the state (state.js, state-colors.js), render-layout.js and fractal-defs.js; calls the later
// scripts (cancelTeleport, glideMainTo, ...) only inside function bodies.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { applyAutoIter, dualActive, els, isInteracting, juliaRenderer, juliaState, mainRenderer, mainState, pushHistory, setActivePane } from "../core/state.js?v=1.80.5";
import { limitScale } from "../core/deepzoom.js?v=1.80.5";
import { cancelSettle, markInteracting } from "../core/state-colors.js?v=1.80.5";
import { renderAll, requestRender } from "../render/render-layout.js?v=1.80.5";
import { EXACT_FROM, centerForAnchor, exactValid, moveCenter, normalizeAngle, screenToComplex } from "../core/view-math.js?v=1.80.5";
import { cancelTeleport, glideMainTo } from "./teleport.js?v=1.80.5";
import { colorSheetTapJustClosed } from "./color-sheet.js?v=1.80.5";

// ---------------------------------------------------------------- box zoom

// The toolbar's box-zoom toggle: drag a box to zoom to it. The fern has its own toggle, as its
// control row is separate (fernBoxZoomActive, in vector-interaction.js). Only this file reads or
// assigns this one.
export let boxZoomActive = false;
els.boxZoomBtn.addEventListener("click", () => {
  boxZoomActive = !boxZoomActive;
  els.boxZoomBtn.classList.toggle("active", boxZoomActive);
  if (!boxZoomActive) els.boxRect.classList.add("hidden");
});

// ---------------------------------------------------------------- interaction: fractal canvases

export function attachFractalInteraction(canvas, getState, paneName, renderer) {
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
    setActivePane(paneName);
    downPos = { x: e.clientX, y: e.clientY };

    if (boxZoomActive) {
      // The main canvas can be showing a frozen, stale frame if this drag
      // starts while a previous gesture's settle delay hasn't fired yet
      // (see markInteracting/renderAll) — force it caught up to the actual
      // current state first, so the box is always drawn on top of exactly
      // the pixels commitBoxZoom's math will use.
      if (isInteracting) {
        cancelSettle();
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
      panStart = { worldX: world.x, worldY: world.y, localX: local.x, localY: local.y };
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
      if (st.scale < EXACT_FROM || exactValid(st)) {
        // Deep: the grabbed point is an absolute world point that a double can't hold to a pixel, so move
        // by the offset between where the finger was and where it is now (the same grab, in steps).
        const prev = screenToWorldHere(panStart.localX, panStart.localY);
        const now = screenToWorldHere(local.x, local.y);
        moveCenter(st, prev.ox - now.ox, prev.oy - now.oy);
        panStart.localX = local.x; panStart.localY = local.y;
      } else {
        const anchored = centerForAnchor(renderer, st, local.x, local.y, panStart.worldX, panStart.worldY);
        st.cx = anchored.cx;
        st.cy = anchored.cy;
      }
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
      moveCenter(st, before.ox - after.ox, before.oy - after.oy);
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
      panStart = { worldX: world.x, worldY: world.y, localX: local.x, localY: local.y };
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
    setActivePane(paneName);
    const now = performance.now();
    if (now - lastZoomPush > 400) { pushHistory(paneName); lastZoomPush = now; }
    const st = getState();
    const local = toLocal(e.clientX, e.clientY);
    const before = screenToWorldHere(local.x, local.y);
    st.scale = limitScale(st, st.scale * Math.exp(e.deltaY * 0.0015));
    const after = screenToWorldHere(local.x, local.y);
    moveCenter(st, before.ox - after.ox, before.oy - after.oy);
    markInteracting();
    requestRender();
  }, { passive: false });
}

export function commitBoxZoom(paneName, state, renderer, canvas) {
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
  // rotation is intentionally left unchanged — box-zoom reframes, it
  // doesn't reorient. The scale goes first so a box zoom into a deep view moves an exact center; the
  // offset is from the old center, whichever scale the state now has.
  state.scale = newScale;
  moveCenter(state, centerPoint.ox, centerPoint.oy);
  applyAutoIter();
  requestRender();
}

attachFractalInteraction(els.mainCanvas, () => mainState, "main", mainRenderer);
attachFractalInteraction(els.juliaCanvas, () => juliaState, "julia", juliaRenderer);

// ---------------------------------------------------------------- interaction: keyboard

// Desktop keyboard navigation for every mode: arrows pan, Shift+Left/Right
// rotate (Google Maps' convention; Ctrl+arrows switch Spaces on macOS),
// +/- zoom about the center, R resets. Everything is expressed in screen
// terms and mapped through the view's own screen-to-world function, so
// "up" is always screen-up however the view is rotated. Held keys
// auto-repeat; history is checkpointed once per 400ms burst, like the
// wheel, so one Back undoes a whole held-key move.
export const KEY_PAN_FRACTION = 0.1;              // of the canvas's shorter side
export const KEY_ZOOM_FACTOR = 1.25;
export const KEY_ROTATE_STEP = 5 * Math.PI / 180; // + is clockwise, like the twist

export function keyAction(e) {
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

