"use strict";

// Koch snowflake: a Canvas2D view with the same pan/zoom/animate/fill/
// colormap feature set as the original koch.py port -- pure vector
// geometry at these depths, so it needs no shader.

// Geometry comes from the shared L-system engine (lsystem.js,
// KOCH_SNOWFLAKE). The turtle is placed so the result is exactly the old
// koch.py port's snowflake -- a triangle on the unit circle with vertices at
// 90/210/330 degrees, spanning x +-0.866, y -0.5..1 at depth 0 -- which
// app.js's vectorViewBox("koch") is fitted to: start at the top vertex
// heading -60 degrees, one step = edge length sqrt(3) / 3^depth.
// KOCH_SNOWFLAKE turns right at the corners (clockwise), so bumps go out
// to the left; the old code walked the triangle counter-clockwise, so
// the list is reversed to keep the same vertex order. Checked point for
// point against the old kochSegment/kochSnowflake at depths 0-8 (max
// difference 1.6e-13) before they were removed.
// The view no longer draws from this list (kochAdaptive below builds only
// what's on screen, at any zoom); it stays as the plain full-detail
// reference that tests/visual/vector.spec.mjs checks kochAdaptive against.
function kochSnowflake(depth) {
  const [verts] = lsystemPolylines(KOCH_SNOWFLAKE, depth, {
    start: [0, 1], startHeadingDeg: -60, step: Math.sqrt(3) / Math.pow(3, depth),
  });
  return verts.reverse();
}

const KOCH_EDGE = Math.sqrt(3);   // world length of the depth-0 triangle's sides
const KOCH_FIT_HH = 1.08;         // half-height of the Reset framing on a wide canvas; render's opts.fitHalfHeight overrides it
const KOCH_PX_MIN = 1;            // CSS px: a piece whose thirds would be shorter stays one straight line
const KOCH_ZOOM_SLACK = 1.5;      // zoom headroom before a level beyond the slider's depth is added
const KOCH_BUDGET = 100000;       // vertices per frame; past it the pixel limit grows by half and the frame is redone
const KOCH_MAX_LEVEL = 40;        // 3^-40 is already below double precision for any view

// The snowflake as the viewport needs it, in the order and orientation of
// kochSnowflake(depth) (counter-clockwise from the top vertex), written to
// buf as canvas-pixel x, y pairs. Each side is split recursively:
//   - a piece wholly off screen stays a straight chord. A Koch piece lies
//     inside the triangle on its chord, which sits inside the disc around
//     the chord's midpoint with the chord as diameter, so the chord and the
//     piece differ only off screen (the fill stays right);
//   - a piece splits while the slider asks for it (level < depth), and
//     beyond that while it is still longer than refPx, so zooming in keeps
//     adding levels instead of showing straight edges. Pass Infinity for
//     refPx to get exactly depth levels;
//   - a piece whose thirds would be shorter than pxMin stays one line: its
//     bump is under a pixel high.
// Returns { n: vertex count, leaves, leafPx: summed on-screen leaf length,
// maxLevel, overflow: the budget ran out and buf is incomplete }.
function kochAdaptive(aff, buf, depth, pxMin, refPx) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const cap = buf.length / 2 - 2;
  let n = 0, leaves = 0, leafPx = 0, maxLevel = 0, overflow = false;

  function emit(x, y) {
    const dx = x - cx, dy = y - cy;
    buf[2 * n] = hw + a * dx + b * dy;
    buf[2 * n + 1] = hh + c * dx + d * dy;
    n++;
  }

  // Draws A->B's piece, ending at B. len is the chord's world length.
  function piece(ax, ay, bx, by, level, len) {
    if (overflow) return;
    if (n >= cap) { overflow = true; return; }
    const mx = (ax + bx) / 2 - cx, my = (ay + by) / 2 - cy;
    const sx = hw + a * mx + b * my, sy = hh + c * mx + d * my;
    const px = len * k;
    const r = px / 2 + VECTOR_CULL_MARGIN;
    if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) { emit(bx, by); return; }
    if (level < KOCH_MAX_LEVEL && px / 3 >= pxMin && (level < depth || px > refPx)) {
      const ux = (bx - ax) / 3, uy = (by - ay) / 3;
      const p1x = ax + ux, p1y = ay + uy, p2x = p1x + ux, p2y = p1y + uy;
      // The bump turns the middle third a sixth of a turn to the right,
      // which is outward for a counter-clockwise outline.
      const tx = p1x + ux * 0.5 + uy * (Math.sqrt(3) / 2), ty = p1y + uy * 0.5 - ux * (Math.sqrt(3) / 2);
      const l3 = len / 3;
      piece(ax, ay, p1x, p1y, level + 1, l3);
      piece(p1x, p1y, tx, ty, level + 1, l3);
      piece(tx, ty, p2x, p2y, level + 1, l3);
      piece(p2x, p2y, bx, by, level + 1, l3);
    } else {
      leaves++;
      leafPx += px;
      if (level > maxLevel) maxLevel = level;
      emit(bx, by);
    }
  }

  const half = KOCH_EDGE / 2;
  emit(0, 1);
  piece(0, 1, -half, -0.5, 0, KOCH_EDGE);
  piece(-half, -0.5, half, -0.5, 0, KOCH_EDGE);
  piece(half, -0.5, 0, 1, 0, KOCH_EDGE);
  return { n, leaves, leafPx, maxLevel, overflow };
}

function createKochView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0, cy: 0, halfHeight: 1.4, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const buf = new Float64Array(2 * (KOCH_BUDGET + 2));
  let extraLevels = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Rotation-aware; matches app.js's screenToComplex/centerForAnchor
  // convention exactly (rotate the screen-space offset by +rotation to get
  // world axes, by -rotation for the inverse) so attachVectorViewInteraction's
  // two-finger twist and pan both work the same way the WebGL canvases do.
  function worldToScreen(x, y) {
    const wx = (x - view.cx) / view.halfHeight;
    const wy = (y - view.cy) / view.halfHeight;
    const rot = -(view.rotation || 0);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const uvx = wx * cos - wy * sin;
    const uvy = wx * sin + wy * cos;
    const sx = canvas.width / 2 + uvx * (canvas.height / 2);
    const sy = canvas.height / 2 - uvy * (canvas.height / 2);
    return [sx, sy];
  }

  function screenToWorld(sx, sy) {
    const uvx = (sx - canvas.width / 2) / (canvas.height / 2);
    const uvy = (canvas.height / 2 - sy) / (canvas.height / 2);
    const rot = view.rotation || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const wx = uvx * cos - uvy * sin;
    const wy = uvx * sin + uvy * cos;
    return [view.cx + wx * view.halfHeight, view.cy + wy * view.halfHeight];
  }

  function render(opts) {
    resize();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    extraLevels = 0;
    const aff = vectorAffine(view, canvas.width, canvas.height);
    if (!aff.ok) return;

    // refPx: how long a piece may stay at the slider's depth: the length a
    // depth-sized piece has when the shape is fitted to this canvas (the
    // half-height app.js's Reset framing uses), with some headroom. It
    // doesn't change as you zoom, so zooming in is what adds levels.
    const refPx = KOCH_EDGE * Math.pow(1 / 3, opts.depth) * (canvas.height / 2 / (opts.fitHalfHeight || KOCH_FIT_HH)) * KOCH_ZOOM_SLACK;
    let pxMin = KOCH_PX_MIN * dpr;
    let r = kochAdaptive(aff, buf, opts.depth, pxMin, refPx);
    for (let tries = 0; r.overflow && tries < 12; tries++) {
      pxMin *= 1.5;
      r = kochAdaptive(aff, buf, opts.depth, pxMin, refPx);
    }
    extraLevels = Math.max(0, r.maxLevel - opts.depth);

    ctx.beginPath();
    ctx.moveTo(buf[0], buf[1]);
    for (let i = 1; i < r.n; i++) ctx.lineTo(buf[2 * i], buf[2 * i + 1]);
    ctx.closePath();

    const color = solidCss(opts.colorIndex);
    if (opts.fill) {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      // The pieces are all about one length, so their mean sets the width.
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidthFor(r.leaves ? r.leafPx / r.leaves : 0, dpr);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }

  return {
    view, resize, render, worldToScreen, screenToWorld,
    get dpr() { return dpr; },
    // Levels the last render added beyond the depth slider because of zoom.
    get extraLevels() { return extraLevels; },
  };
}
