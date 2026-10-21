"use strict";

// The line-turtle curves that share one Canvas2D view (and one control
// row in the app): the Heighway dragon plus Hilbert, Gosper and the
// Sierpinski arrowhead. Geometry for all of them comes from the shared
// L-system engine in lsystem.js.

// Each forward step is scaled by (1/sqrt2)^depth so the curve's overall
// bounding box stays bounded as depth increases instead of growing without
// limit -- each generation replaces one segment with two segments each
// 1/sqrt2 the length, the same self-similar-contraction idea as Koch
// dividing into thirds. Verified numerically before shipping: with raw
// unit-length steps the bbox grew from ~30 units wide at depth 10 to ~380
// at depth 16; with this scaling it converges to roughly
// x:[-1.2,1.2] y:[-1.2,0.5] regardless of depth. (Checked point for point
// against the pre-lsystem.js generator at depths 0-16: identical.)
function dragonCurve(depth) {
  return lsystemPolylines(DRAGON_CURVE, depth, { step: Math.pow(Math.SQRT1_2, depth) })[0];
}

const DRAGON_FIT_HH = 0.6;        // typical half-height of the Reset framing on a wide canvas; render's opts.fitHalfHeight overrides it
// Canvas px, not CSS px: the dragon's lines overlap in its dense parts, so
// dropping a level there dims it (a depth-16 frame on a 2x phone lost 17% of
// its brightness when the limit was 1 CSS px).
const DRAGON_PX_MIN = 1;          // canvas px: a chord whose halves would be shorter stays one straight line
const DRAGON_ZOOM_SLACK = 1.5;    // zoom headroom before a level beyond the slider's depth is added
const DRAGON_BUDGET = 120000;     // vertices per frame; past it the pixel limit grows by half and the frame is redone
const DRAGON_MAX_LEVEL = 80;
// The whole dragon between two points lies within this many chord lengths
// of the chord's midpoint (0.897 measured at order 20; rounded up).
const DRAGON_REACH = 0.92;

// The Heighway dragon as the viewport needs it, from the two-map form of
// the curve instead of the L-system string: the curve between A and B is
// the curve between A and C followed by the curve from C back to B, with C
// the corner of the right isosceles triangle on the chord, A + (B-A)(1-i)/2
// (in this app's mirrored orientation). The second half is the same curve
// walked backwards, which is what `rev` carries. Starting from the chord
// (0, 0)->(cos, sin)(depth * 45 degrees) it gives dragonCurve(depth)'s points
// to 4e-15 for depths 0-16 (checked by tests/visual/vector.spec.mjs), and
// keeps going past depth for as long as the view asks.
//   - a chord wholly off screen stays a straight line; the curve it stands
//     for stays within DRAGON_REACH chord lengths of the chord's midpoint;
//   - a chord splits while the slider asks for it (level < depth), and
//     beyond that while it is still longer than refPx (pass Infinity for
//     exactly depth levels); one whose halves would be shorter than pxMin
//     stays a line.
// Writes canvas-pixel x, y pairs to buf. Returns { n, leaves, leafPx:
// summed on-screen leaf length, maxLevel, overflow: the budget ran out and
// buf is incomplete }.
function dragonAdaptive(aff, buf, depth, pxMin, refPx) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const cap = buf.length / 2 - 2;
  const half = Math.SQRT1_2;
  let n = 0, leaves = 0, leafPx = 0, maxLevel = 0, overflow = false;

  function emit(x, y) {
    const dx = x - cx, dy = y - cy;
    buf[2 * n] = hw + a * dx + b * dy;
    buf[2 * n + 1] = hh + c * dx + d * dy;
    n++;
  }

  function chord(ax, ay, bx, by, level, len, rev) {
    if (overflow) return;
    if (n >= cap) { overflow = true; return; }
    const mx = (ax + bx) / 2 - cx, my = (ay + by) / 2 - cy;
    const sx = hw + a * mx + b * my, sy = hh + c * mx + d * my;
    const px = len * k;
    const r = px * DRAGON_REACH + VECTOR_CULL_MARGIN;
    const offscreen = sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h;
    if (!offscreen && level < DRAGON_MAX_LEVEL && px * half >= pxMin && (level < depth || px > refPx)) {
      const dx = bx - ax, dy = by - ay;
      const mcx = ax + (dx + dy) / 2, mcy = ay + (dy - dx) / 2;
      const l2 = len * half;
      if (!rev) {
        chord(ax, ay, mcx, mcy, level + 1, l2, false);
        chord(bx, by, mcx, mcy, level + 1, l2, true);
      } else {
        chord(bx, by, mcx, mcy, level + 1, l2, false);
        chord(ax, ay, mcx, mcy, level + 1, l2, true);
      }
      return;
    }
    if (!offscreen) {
      leaves++;
      leafPx += px;
      if (level > maxLevel) maxLevel = level;
    }
    if (rev) emit(ax, ay);
    else emit(bx, by);
  }

  emit(0, 0);
  chord(0, 0, Math.cos(depth * Math.PI / 4), Math.sin(depth * Math.PI / 4), 0, 1, false);
  return { n, leaves, leafPx, maxLevel, overflow };
}

// Strokes the polyline of n canvas-pixel x, y pairs in buf, with the pen
// state (width, color, join) already set. Points closer than half a pixel
// to the last one kept are dropped, and a segment with both ends past the
// same canvas edge isn't drawn, so a curve far larger than the canvas
// costs only what shows. The strokes go out in paths of CURVE_GROUP
// segments: a Canvas2D path costs more than its size grows (stroking
// 65,537 dragon points on a phone-sized canvas took 37 ms in one path and
// 17 ms in groups of 256; the other line curves 4-5 times better still).
// Groups meet end to end, so the pen is set to round caps, which join them
// as a round line join would.
const CURVE_GROUP = 256;
function strokeScreenPolyline(ctx, buf, n, width, height) {
  const lo = -VECTOR_CULL_MARGIN, hiX = width + VECTOR_CULL_MARGIN, hiY = height + VECTOR_CULL_MARGIN;
  let penDown = false, px = 0, py = 0, pcode = 0, inGroup = 0;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const sx = buf[2 * i], sy = buf[2 * i + 1];
    if (i > 0 && i < n - 1) {
      const ddx = sx - px, ddy = sy - py;
      if (ddx * ddx + ddy * ddy < 0.25) continue;
    }
    const code = (sx < lo ? 1 : 0) | (sx > hiX ? 2 : 0) | (sy < lo ? 4 : 0) | (sy > hiY ? 8 : 0);
    if (i > 0) {
      if (code & pcode) {
        penDown = false;
      } else {
        if (!penDown) { ctx.moveTo(px, py); penDown = true; }
        ctx.lineTo(sx, sy);
        if (++inGroup === CURVE_GROUP) {
          ctx.stroke();
          ctx.beginPath();
          penDown = false; // the next segment starts a path of its own, from the point just reached
          inGroup = 0;
        }
      }
    }
    px = sx; py = sy; pcode = code;
  }
  ctx.stroke();
}

// The newer curves don't need hand-tuned scaling: normalizePolylines fits
// each depth into [-1, 1]. All three are single connected paths.
function normalizedCurve(def, depth, turtleOpts) {
  return normalizePolylines(lsystemPolylines(def, depth, turtleOpts))[0];
}

// maxDepth caps are per curve, from measured growth (segments per level:
// Hilbert x4, Gosper x7, arrowhead x3, dragon x2), kept at or under the
// ~200k segments of Koch's existing depth-8 cap, the heaviest line
// drawing the app already ships: Hilbert 8 = 65,535 (9 = 262,143);
// Gosper 6 = 117,649 (7 = 823,543); arrowhead 11 = 177,147
// (12 = 531,441). Each extra level also takes 3-7x longer to generate.
// minDepth (default 0): Hilbert's axiom "A" has no F, so depth 0 draws
// nothing at all -- an empty point list that the renderer and the
// view-fitting bounds can't handle. Its first real shape is depth 1.
const LINE_CURVES = {
  dragon: { maxDepth: 16, defaultDepth: 13, points: dragonCurve },
  hilbert: {
    minDepth: 1, maxDepth: 8, defaultDepth: 5,
    points: (depth) => normalizedCurve(HILBERT_CURVE, depth),
  },
  gosper: {
    maxDepth: 6, defaultDepth: 4,
    points: (depth) => normalizedCurve(GOSPER_CURVE, depth),
  },
  // The arrowhead's triangle points down at odd depths when started
  // heading +x; starting odd depths at 60 degrees keeps it pointing up.
  arrowhead: {
    maxDepth: 11, defaultDepth: 7,
    points: (depth) => normalizedCurve(SIERPINSKI_ARROWHEAD, depth, { startHeadingDeg: depth % 2 ? 60 : 0 }),
  },
};

// Same Canvas2D view shape as createKochView/createPythagorasTreeView, so
// attachVectorViewInteraction in app.js works on this unmodified. One view
// serves every LINE_CURVES entry; setCurve switches which one it draws,
// keeping each curve's pan/zoom separately.
function createCurveView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: -0.35, cy: -0.24, halfHeight: 1.0, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let curve = "dragon";
  const savedViews = new Map(); // curve key -> its view while another is shown
  let cachedKey = "";
  let cachedPts = null; // the other curves' points, flat x, y pairs in world space
  // Canvas-pixel points of the frame being drawn: the dragon's adaptive
  // walk writes it, and so does the transform of the other curves' points.
  // The arrowhead's depth 11 is the longest fixed curve: 177,148 points.
  const buf = new Float64Array(2 * Math.max(DRAGON_BUDGET + 2, 177148));
  let extraLevels = 0;

  // view is shared with attachVectorViewInteraction by reference, so it's
  // swapped in place rather than replaced.
  function setCurve(key) {
    if (key === curve) return;
    savedViews.set(curve, { ...view });
    curve = key;
    const saved = savedViews.get(key);
    if (saved) Object.assign(view, saved);
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

    let n, segPx;
    if (curve === "dragon") {
      // Built from the viewport each frame, so there's no depth limit to
      // zoom into. refPx: how long a segment may stay at the slider's
      // depth: the length a depth-sized segment has when the curve is
      // fitted to this canvas (the half-height app.js's Reset framing
      // uses), with some headroom. It doesn't change as you zoom, so
      // zooming in is what adds levels.
      const refPx = Math.pow(Math.SQRT1_2, opts.depth) * (canvas.height / 2 / (opts.fitHalfHeight || DRAGON_FIT_HH)) * DRAGON_ZOOM_SLACK;
      const budgetBuf = buf.subarray(0, 2 * (DRAGON_BUDGET + 2));
      let pxMin = DRAGON_PX_MIN;
      let r = dragonAdaptive(aff, budgetBuf, opts.depth, pxMin, refPx);
      for (let tries = 0; r.overflow && tries < 12; tries++) {
        pxMin *= 1.5;
        r = dragonAdaptive(aff, budgetBuf, opts.depth, pxMin, refPx);
      }
      extraLevels = Math.max(0, r.maxLevel - opts.depth);
      n = r.n;
      // The segments are all about one length, so their mean sets the width.
      segPx = r.leaves ? r.leafPx / r.leaves : 0;
    } else {
      const key = `${curve},${opts.depth}`;
      if (cachedKey !== key) {
        const pts = LINE_CURVES[curve].points(opts.depth);
        cachedPts = new Float64Array(2 * pts.length);
        pts.forEach((p, i) => { cachedPts[2 * i] = p[0]; cachedPts[2 * i + 1] = p[1]; });
        cachedKey = key;
      }
      n = cachedPts.length / 2;
      const { a, b, c, d, cx, cy, hw, hh } = aff;
      for (let i = 0; i < n; i++) {
        const dx = cachedPts[2 * i] - cx, dy = cachedPts[2 * i + 1] - cy;
        buf[2 * i] = hw + a * dx + b * dy;
        buf[2 * i + 1] = hh + c * dx + d * dy;
      }
      // All of a curve's segments are the same length, so the first one
      // sets the width (see strokeWidthFor).
      segPx = n > 1 ? Math.hypot(buf[2] - buf[0], buf[3] - buf[1]) : 0;
    }
    ctx.strokeStyle = solidCss(opts.colorIndex);
    ctx.lineWidth = strokeWidthFor(segPx, dpr);
    ctx.lineJoin = "round";
    strokeScreenPolyline(ctx, buf, n, canvas.width, canvas.height);
  }

  return {
    view, resize, render, worldToScreen, screenToWorld, setCurve,
    get curve() { return curve; },
    get dpr() { return dpr; },
    // Levels the last render added beyond the depth slider because of zoom
    // (the dragon only; the other curves are fixed-depth).
    get extraLevels() { return extraLevels; },
  };
}
