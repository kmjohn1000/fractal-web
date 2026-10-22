"use strict";

// Classic (symmetric, 45-degree) Pythagoras tree: each square's top edge is
// split by a right-triangle apex into two child squares scaled by cos/sin of
// the split angle. At 45 degrees cos==sin, so both children are the same
// size (side * 1/sqrt(2)) — verified by hand: with base edge length 1 along
// +x, the apex lands at (0, 1.5) above a unit trunk square sitting on
// [-0.5,0]-[0.5,0], exactly midpoint-plus-half-base-length, which is the
// textbook symmetric-tree apex position.

function rotateVec([x, y], angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c];
}

// Square erected on base edge A->B, turning 90 degrees CCW (consistent
// handedness at every recursion level is what keeps the tree growing
// "outward" the same way at every branch instead of folding back on itself).
// Returns [A, B, topRight, topLeft].
function squareFromBase(A, B) {
  const d = [B[0] - A[0], B[1] - A[1]];
  const perp = [-d[1], d[0]];
  const topRight = [B[0] + perp[0], B[1] + perp[1]];
  const topLeft = [A[0] + perp[0], A[1] + perp[1]];
  return [A, B, topRight, topLeft];
}

const TREE_ANGLE = Math.PI / 4;

// The view no longer draws from this list (treeAdaptive below builds only
// what's on screen, at any zoom); it stays as the plain full-detail
// reference that tests/visual/vector.spec.mjs checks treeAdaptive against.
function pythagorasTree(depth) {
  const squares = [];
  function recurse(A, B, depthLeft) {
    const sq = squareFromBase(A, B);
    squares.push(sq);
    if (depthLeft <= 0) return;
    const topRight = sq[2], topLeft = sq[3];
    const d = [B[0] - A[0], B[1] - A[1]];
    const rot = rotateVec(d, TREE_ANGLE);
    const cosT = Math.cos(TREE_ANGLE);
    const apex = [topLeft[0] + cosT * rot[0], topLeft[1] + cosT * rot[1]];
    recurse(topLeft, apex, depthLeft - 1);
    recurse(apex, topRight, depthLeft - 1);
  }
  recurse([-0.5, 0], [0.5, 0], depth);
  return squares;
}

const TREE_FIT_HH = 2.125;       // half-height of the Reset framing on a wide canvas; render's opts.fitHalfHeight overrides it
// Canvas px, not CSS px: the smallest squares carry the canopy's brightness
// (a depth-12 frame on a 2x phone lost 8% of it at 1 CSS px).
const TREE_PX_MIN = 1;           // canvas px: squares whose children would be smaller aren't split
const TREE_LITE_PX_MIN = 3;      // canvas px: the pixel limit while a drag or pinch is in progress (opts.lite)
const TREE_ZOOM_SLACK = 1.5;     // zoom headroom before a level beyond the slider's depth is added
const TREE_BUDGET = 40000;       // squares per frame; past it the pixel limit grows by half and the frame is redone
const TREE_MAX_LEVEL = 60;
// The tree grown from a square of side s stays within this many s of the
// square's center (measured 3.80 as depth goes to infinity; rounded up).
const TREE_REACH = 3.85;
const TREE_STROKE_MIN_PX = 3;    // squares smaller than this get no outline, or the fine canopy turns gray
const TREE_GROUP = 32;           // squares per fill/stroke path (see render)

// The squares of the tree the viewport needs, in the order and with the
// geometry of pythagorasTree(depth), written to buf as world-space base
// edges (ax, ay, bx, by; the square stands on the left of A->B). A square
// whose whole subtree is off screen is skipped along with it. A square
// splits while the slider asks for it (level < depth), and beyond that
// while it is longer than refPx, so zooming in keeps adding levels (pass
// Infinity for exactly depth levels); one whose children would be shorter
// than pxMin stays a leaf.
// Returns { n, maxLevel, overflow: the budget ran out and buf is incomplete }.
function treeAdaptive(aff, buf, depth, pxMin, refPx) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const cap = buf.length / 4 - 2;
  const half = Math.SQRT1_2;
  let n = 0, maxLevel = 0, visits = 0, overflow = false;

  function square(ax, ay, bx, by, level, len) {
    if (overflow) return;
    // Squares off screen whose subtree reaches the screen count as visits
    // but not toward n, so they get their own limit.
    if (n >= cap || ++visits > cap * 8) { overflow = true; return; }
    const dx = bx - ax, dy = by - ay;
    const mx = ax + (dx - dy) / 2 - cx, my = ay + (dy + dx) / 2 - cy; // the square's center
    const sx = hw + a * mx + b * my, sy = hh + c * mx + d * my;
    const px = len * k;
    let r = px * TREE_REACH + VECTOR_CULL_MARGIN;
    if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) return;
    r = px * half + VECTOR_CULL_MARGIN;
    if (!(sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h)) {
      buf[4 * n] = ax; buf[4 * n + 1] = ay; buf[4 * n + 2] = bx; buf[4 * n + 3] = by;
      n++;
      if (level > maxLevel) maxLevel = level;
    }
    if (level < TREE_MAX_LEVEL && px * half >= pxMin && (level < depth || px > refPx)) {
      // Same construction as pythagorasTree: the apex sits a half-turn of
      // the 45-degree split above the top-left corner.
      const tlx = ax - dy, tly = ay + dx, trx = bx - dy, try_ = by + dx;
      const apx = tlx + (dx - dy) / 2, apy = tly + (dx + dy) / 2;
      const l2 = len * half;
      square(tlx, tly, apx, apy, level + 1, l2);
      square(apx, apy, trx, try_, level + 1, l2);
    }
  }

  square(-0.5, 0, 0.5, 0, 0, 1);
  return { n, maxLevel, overflow };
}

// Same Canvas2D view shape as createKochView (view/resize/render/
// worldToScreen/screenToWorld/dpr) so attachVectorViewInteraction in app.js
// works on this unmodified.
function createPythagorasTreeView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0, cy: 2.3, halfHeight: 2.9, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const buf = new Float64Array(4 * (TREE_BUDGET + 2));
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
  // convention exactly, see koch.js's identical functions for the full
  // comment.
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

    // refPx: how large a square may stay at the slider's depth: the size a
    // depth-sized square has when the tree is fitted to this canvas (the
    // half-height app.js's Reset framing uses), with some headroom. It
    // doesn't change as you zoom, so zooming in is what adds levels.
    const refPx = Math.pow(Math.SQRT1_2, opts.depth) * (canvas.height / 2 / (opts.fitHalfHeight || TREE_FIT_HH)) * TREE_ZOOM_SLACK;
    let pxMin = opts.lite ? TREE_LITE_PX_MIN : TREE_PX_MIN;
    let r = treeAdaptive(aff, buf, opts.depth, pxMin, refPx);
    for (let tries = 0; r.overflow && tries < 12; tries++) {
      pxMin *= 1.5;
      r = treeAdaptive(aff, buf, opts.depth, pxMin, refPx);
    }
    extraLevels = Math.max(0, r.maxLevel - opts.depth);

    ctx.fillStyle = solidCss(opts.colorIndex);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;

    // One path per group of squares for the fills and one for the outlines
    // of the larger ones, instead of a path and two draw calls per square.
    // The groups stay small because Canvas2D's cost per path grows faster
    // than its size: measured on 8,191 squares, filling them in one path
    // took 150 ms, in groups of 32 about 5 ms. Every square winds the same
    // way, so a group's fill is the union of its squares.
    const { a, b, c, d, cx, cy, hw, hh } = aff;
    const strokeMinSq = TREE_STROKE_MIN_PX * TREE_STROKE_MIN_PX;
    const addSquare = (i) => {
      const ax = buf[4 * i], ay = buf[4 * i + 1];
      const dx = buf[4 * i + 2] - ax, dy = buf[4 * i + 3] - ay;
      const x0 = hw + a * (ax - cx) + b * (ay - cy), y0 = hh + c * (ax - cx) + d * (ay - cy);
      const ex = a * dx + b * dy, ey = c * dx + d * dy;     // A->B on screen
      const px = b * dx - a * dy, py = d * dx - c * dy;     // A->top-left on screen
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + ex, y0 + ey);
      ctx.lineTo(x0 + ex + px, y0 + ey + py);
      ctx.lineTo(x0 + px, y0 + py);
      ctx.closePath();
    };
    for (let from = 0; from < r.n; from += TREE_GROUP) {
      const end = Math.min(r.n, from + TREE_GROUP);
      ctx.beginPath();
      for (let i = from; i < end; i++) addSquare(i);
      ctx.fill();
      ctx.beginPath();
      for (let i = from; i < end; i++) {
        const ex = buf[4 * i + 2] - buf[4 * i], ey = buf[4 * i + 3] - buf[4 * i + 1];
        if ((ex * ex + ey * ey) * aff.k * aff.k >= strokeMinSq) addSquare(i);
      }
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
