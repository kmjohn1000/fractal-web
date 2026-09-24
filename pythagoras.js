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

// Same Canvas2D view shape as createKochView (view/resize/render/
// worldToScreen/screenToWorld/dpr) so attachVectorViewInteraction in app.js
// works on this unmodified.
function createPythagorasTreeView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0, cy: 2.3, halfHeight: 2.9 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cachedDepth = -1;
  let cachedSquares = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function worldToScreen(x, y) {
    const sx = canvas.width / 2 + ((x - view.cx) / view.halfHeight) * (canvas.height / 2);
    const sy = canvas.height / 2 - ((y - view.cy) / view.halfHeight) * (canvas.height / 2);
    return [sx, sy];
  }

  function screenToWorld(sx, sy) {
    const x = view.cx + ((sx - canvas.width / 2) / (canvas.height / 2)) * view.halfHeight;
    const y = view.cy - ((sy - canvas.height / 2) / (canvas.height / 2)) * view.halfHeight;
    return [x, y];
  }

  function render(opts) {
    resize();
    if (cachedDepth !== opts.depth) {
      cachedSquares = pythagorasTree(opts.depth);
      cachedDepth = opts.depth;
    }
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const [r, g, b] = sampleColor(COLORMAPS[opts.colormapIndex].stops, opts.depth / 12);
    ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;

    cachedSquares.forEach((sq) => {
      ctx.beginPath();
      sq.forEach((v, i) => {
        const [sx, sy] = worldToScreen(v[0], v[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }

  return { view, resize, render, worldToScreen, screenToWorld, get dpr() { return dpr; } };
}
