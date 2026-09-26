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
  dragon: { label: "Dragon Curve", maxDepth: 16, defaultDepth: 13, points: dragonCurve },
  hilbert: {
    label: "Hilbert Curve", minDepth: 1, maxDepth: 8, defaultDepth: 5,
    points: (depth) => normalizedCurve(HILBERT_CURVE, depth),
  },
  gosper: {
    label: "Gosper Curve", maxDepth: 6, defaultDepth: 4,
    points: (depth) => normalizedCurve(GOSPER_CURVE, depth),
  },
  // The arrowhead's triangle points down at odd depths when started
  // heading +x; starting odd depths at 60 degrees keeps it pointing up.
  arrowhead: {
    label: "Sierpinski Arrowhead", maxDepth: 11, defaultDepth: 7,
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
  let cachedPts = null;

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
    const key = `${curve},${opts.depth}`;
    if (cachedKey !== key) {
      cachedPts = LINE_CURVES[curve].points(opts.depth);
      cachedKey = key;
    }
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // All of a curve's segments are the same length, so the first one sets
    // the width (see strokeWidthFor).
    const [ax, ay] = worldToScreen(cachedPts[0][0], cachedPts[0][1]);
    const [bx, by] = worldToScreen(cachedPts[1][0], cachedPts[1][1]);
    ctx.strokeStyle = solidCss(opts.colorIndex);
    ctx.lineWidth = strokeWidthFor(Math.hypot(bx - ax, by - ay), dpr);
    ctx.lineJoin = "round";
    ctx.beginPath();
    cachedPts.forEach((p, i) => {
      const [sx, sy] = worldToScreen(p[0], p[1]);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  }

  return {
    view, resize, render, worldToScreen, screenToWorld, setCurve,
    get curve() { return curve; },
    get dpr() { return dpr; },
  };
}
