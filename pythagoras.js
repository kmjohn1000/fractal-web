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

// The look. true: the picked color is shaded as if lit from the upper left
// (a square's lean sets how much light its top face catches), brightens from
// trunk to twigs, and alternates with a hue-shifted partner on every other
// level. false: the old flat single color. render's opts.shaded overrides it.
const TREE_SHADED = true;
const TREE_LIGHT_UV = [-0.55, 0.835];  // toward the light, on screen (x right, y up); the light stays put as the view rotates
const TREE_LEAN_MIN = 0.5;       // brightness of a face turned fully from the light (1 = fully lit)
const TREE_DEPTH_MIN = 0.72;     // brightness at the trunk; it rises to 1 by TREE_DEPTH_BANDS-1 bands out
const TREE_DEPTH_BANDS = 6;      // trunk-to-twig brightness steps (two levels each)
const TREE_ALT_HUE = -22;        // degrees the odd levels' hue is turned from the picked color's (-45 read as olive camouflage on Green)
const TREE_WOOD_RGB = [158, 104, 62];  // the trunk and first two branches' wood, whatever color is picked (a blend of brown and green read as khaki)
const TREE_WOOD_BANDS = 1;     // bands (two levels each) of wood from the trunk up; the picked color carries the canopy

// The squares of the tree the viewport needs, in the order and with the
// geometry of pythagorasTree(depth), written to buf as world-space base
// edges (ax, ay, bx, by; the square stands on the left of A->B). A square
// whose whole subtree is off screen is skipped along with it. A square
// splits while the slider asks for it (level < depth), and beyond that
// while it is longer than refPx, so zooming in keeps adding levels (pass
// Infinity for exactly depth levels); one whose children would be shorter
// than pxMin stays a leaf.
// sty, if given (a Uint8Array as long as buf / 4), receives each square's
// style byte beside it: lean (its base edge's turn from the trunk's, in
// 45-degree steps mod 8) | level parity << 3 | trunk-to-twig band << 4. It
// depends only on the square's place in the tree, never on the view.
// Returns { n, maxLevel, overflow: the budget ran out and buf is incomplete }.
function treeAdaptive(aff, buf, depth, pxMin, refPx, sty) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const cap = buf.length / 4 - 2;
  const half = Math.SQRT1_2;
  let n = 0, maxLevel = 0, visits = 0, overflow = false;

  function square(ax, ay, bx, by, level, len, lean) {
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
      if (sty) sty[n] = (lean & 7) | ((level & 1) << 3) | (Math.min(level >> 1, TREE_DEPTH_BANDS - 1) << 4);
      n++;
      if (level > maxLevel) maxLevel = level;
    }
    if (level < TREE_MAX_LEVEL && px * half >= pxMin && (level < depth || px > refPx)) {
      // Same construction as pythagorasTree: the apex sits a half-turn of
      // the 45-degree split above the top-left corner.
      const tlx = ax - dy, tly = ay + dx, trx = bx - dy, try_ = by + dx;
      const apx = tlx + (dx - dy) / 2, apy = tly + (dx + dy) / 2;
      const l2 = len * half;
      square(tlx, tly, apx, apy, level + 1, l2, lean + 1);   // the left child turns 45 degrees left
      square(apx, apy, trx, try_, level + 1, l2, lean - 1);  // the right child 45 degrees right
    }
  }

  square(-0.5, 0, 0.5, 0, 0, 1, 0);
  return { n, maxLevel, overflow };
}

// Same Canvas2D view shape as createKochView (view/resize/render/
// worldToScreen/screenToWorld/dpr) so attachVectorViewInteraction in interaction.js
// works on this unmodified.
function createPythagorasTreeView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0, cy: 2.3, halfHeight: 2.9, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const buf = new Float64Array(4 * (TREE_BUDGET + 2));
  const sty = new Uint8Array(TREE_BUDGET + 2);       // treeAdaptive's style byte per square
  const order = new Uint32Array(TREE_BUDGET + 2);    // squares' indices grouped by style (see render)
  const styCount = new Uint32Array(128);
  let extraLevels = 0;
  let cssKey = "", css = [];                         // the style table for one color and view rotation

  // CSS fill per style byte for the picked color. A square's lean sets how
  // much of the light from TREE_LIGHT_UV its top face catches; the band dims
  // the trunk and brightens toward the twigs; odd levels use the picked
  // color turned TREE_ALT_HUE degrees around the hue wheel. The trunk and
  // the first two branches are wood (TREE_WOOD_RGB) whatever the picked
  // color; everything above them is the picked color.
  function styleTable(colorIndex, rotation) {
    const key = colorIndex + "|" + rotation;
    if (key === cssKey) return css;
    const base = SOLID_COLORS[colorIndex].rgb;
    const alt = hueTurned(base, TREE_ALT_HUE);
    // The light in world coordinates (screenToWorld's rotation of a screen vector).
    const rc = Math.cos(rotation), rs = Math.sin(rotation);
    const lx = TREE_LIGHT_UV[0] * rc - TREE_LIGHT_UV[1] * rs, ly = TREE_LIGHT_UV[0] * rs + TREE_LIGHT_UV[1] * rc;
    const byte = (v) => Math.max(0, Math.min(255, Math.round(v)));
    css = [];
    for (let band = 0; band < TREE_DEPTH_BANDS; band++) {
      const depthF = TREE_DEPTH_MIN + (1 - TREE_DEPTH_MIN) * band / (TREE_DEPTH_BANDS - 1);
      for (let parity = 0; parity < 2; parity++) {
        const src = band < TREE_WOOD_BANDS ? TREE_WOOD_RGB : parity ? alt : base;
        for (let lean = 0; lean < 8; lean++) {
          const ang = lean * Math.PI / 4 + Math.PI / 2;     // the face's outward normal
          const lit = 0.5 + 0.5 * (Math.cos(ang) * lx + Math.sin(ang) * ly);
          const f = depthF * (TREE_LEAN_MIN + (1 - TREE_LEAN_MIN) * lit);
          css[lean | parity << 3 | band << 4] = `rgb(${byte(src[0] * f)},${byte(src[1] * f)},${byte(src[2] * f)})`;
        }
      }
    }
    cssKey = key;
    return css;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Rotation-aware; matches render-layout.js's screenToComplex/centerForAnchor
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
    paintBackdrop(ctx, canvas.width, canvas.height);
    extraLevels = 0;
    const aff = vectorAffine(view, canvas.width, canvas.height);
    if (!aff.ok) return;

    // refPx: how large a square may stay at the slider's depth: the size a
    // depth-sized square has when the tree is fitted to this canvas (the
    // half-height interaction.js's Reset framing uses), with some headroom. It
    // doesn't change as you zoom, so zooming in is what adds levels.
    const refPx = Math.pow(Math.SQRT1_2, opts.depth) * (canvas.height / 2 / (opts.fitHalfHeight || TREE_FIT_HH)) * TREE_ZOOM_SLACK;
    let pxMin = opts.lite ? TREE_LITE_PX_MIN : TREE_PX_MIN;
    const shaded = opts.shaded ?? TREE_SHADED;
    const styOut = shaded ? sty : undefined;
    let r = treeAdaptive(aff, buf, opts.depth, pxMin, refPx, styOut);
    for (let tries = 0; r.overflow && tries < 12; tries++) {
      pxMin *= 1.5;
      r = treeAdaptive(aff, buf, opts.depth, pxMin, refPx, styOut);
    }
    extraLevels = Math.max(0, r.maxLevel - opts.depth);

    // Squares are drawn grouped by style (the fill color is set once per
    // style, not per square): a counting sort puts their indices in order[],
    // low style bytes first, so the twig bands are painted over the trunk's.
    // Flat mode is one run in tree order.
    let fills;
    if (shaded) {
      fills = styleTable(opts.colorIndex, view.rotation || 0);
      styCount.fill(0);
      for (let i = 0; i < r.n; i++) styCount[sty[i]]++;
      for (let s = 0, sum = 0; s < 128; s++) { const c = styCount[s]; styCount[s] = sum; sum += c; }
      for (let i = 0; i < r.n; i++) order[styCount[sty[i]]++] = i;
      // styCount[s] is now where style s's run ends.
    } else {
      for (let i = 0; i < r.n; i++) order[i] = i;
    }
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
    // Draws order[runFrom..runEnd) in the current fill style.
    const drawRun = (runFrom, runEnd) => {
      for (let from = runFrom; from < runEnd; from += TREE_GROUP) {
        const end = Math.min(runEnd, from + TREE_GROUP);
        ctx.beginPath();
        for (let j = from; j < end; j++) addSquare(order[j]);
        ctx.fill();
        ctx.beginPath();
        for (let j = from; j < end; j++) {
          const i = order[j];
          const ex = buf[4 * i + 2] - buf[4 * i], ey = buf[4 * i + 3] - buf[4 * i + 1];
          if ((ex * ex + ey * ey) * aff.k * aff.k >= strokeMinSq) addSquare(i);
        }
        ctx.stroke();
      }
    };
    if (shaded) {
      for (let s = 0, runFrom = 0; s < 128; s++) {
        const runEnd = styCount[s];
        if (runEnd > runFrom) {
          ctx.fillStyle = fills[s];
          drawRun(runFrom, runEnd);
        }
        runFrom = runEnd;
      }
    } else {
      ctx.fillStyle = solidCss(opts.colorIndex);
      drawRun(0, r.n);
    }
  }

  return {
    view, resize, render, worldToScreen, screenToWorld,
    get dpr() { return dpr; },
    // Levels the last render added beyond the depth slider because of zoom.
    get extraLevels() { return extraLevels; },
  };
}
