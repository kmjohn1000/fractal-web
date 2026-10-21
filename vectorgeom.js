"use strict";

// Shared by the Canvas2D pattern views (koch.js, pythagoras.js, dragon.js):
// the view's world-to-canvas map as plain numbers, so a render loop can
// transform thousands of points without allocating, and the visibility test
// that lets a recursion skip whatever is off screen.

// Extra room around the canvas (canvas px) inside which a piece still counts
// as visible, so the stroke of a piece just past the edge isn't clipped short.
const VECTOR_CULL_MARGIN = 8;

// The same map as each view's worldToScreen (rotation-aware, y up), written
// as   sx = hw + a * (x - cx) + b * (y - cy)
//      sy = hh + c * (x - cx) + d * (y - cy)
// Offsets are taken from the view center first so precision holds at deep
// zoom, where x and cx agree to many digits. k is canvas px per world unit.
// ok is false for a view the arithmetic can't handle (a non-finite or
// zero halfHeight from a hand-edited link); callers then draw nothing.
function vectorAffine(view, width, height) {
  const k = height / 2 / view.halfHeight;
  const rot = -(view.rotation || 0);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return {
    k, a: k * cs, b: -k * sn, c: -k * sn, d: -k * cs,
    cx: view.cx, cy: view.cy, hw: width / 2, hh: height / 2, w: width, h: height,
    ok: Number.isFinite(k) && k > 0 && Number.isFinite(view.cx) && Number.isFinite(view.cy) && Number.isFinite(cs) && Number.isFinite(sn),
  };
}

// True when a disc (center sx, sy; radius r; canvas px) lies wholly outside
// the canvas plus the cull margin.
function vectorDiscOffscreen(aff, sx, sy, r) {
  const m = r + VECTOR_CULL_MARGIN;
  return sx + m < 0 || sx - m > aff.w || sy + m < 0 || sy - m > aff.h;
}
