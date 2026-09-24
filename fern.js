"use strict";

// Classic Barnsley fern: four affine transforms, picked at random each
// step (weighted by p) and applied to build a "chaos game" point cloud --
// a fundamentally different technique from Koch/tree/dragon's deterministic
// recursive polylines. Coefficients are Barnsley's own published values.
const FERN_TRANSFORMS = [
  { p: 0.01, a: 0,     b: 0,     c: 0,    d: 0.16, e: 0, f: 0    },
  { p: 0.85, a: 0.85,  b: 0.04,  c: -0.04, d: 0.85, e: 0, f: 1.6  },
  { p: 0.07, a: 0.20,  b: -0.26, c: 0.23, d: 0.22, e: 0, f: 1.6  },
  { p: 0.07, a: -0.15, b: 0.28,  c: 0.26, d: 0.24, e: 0, f: 0.44 },
];

// Depth doesn't apply to a random point cloud -- density (point count) is
// the equivalent "more detail" control. Returns a flat [x0,y0,x1,y1,...]
// array (not point pairs) so the hot loop in render() avoids allocating a
// sub-array per point.
function fernPoints(n) {
  let x = 0, y = 0;
  const pts = new Float32Array(n * 2);
  let len = 0;
  // First 20 steps are a burn-in transient before the chaos game settles
  // onto the attractor -- skipped so a stray early point near the origin
  // doesn't show up as an outlier.
  for (let i = 0; i < n + 20; i++) {
    const r = Math.random();
    let cum = 0, t = FERN_TRANSFORMS[FERN_TRANSFORMS.length - 1];
    for (const tr of FERN_TRANSFORMS) {
      cum += tr.p;
      if (r < cum) { t = tr; break; }
    }
    const nx = t.a * x + t.b * y + t.e;
    const ny = t.c * x + t.d * y + t.f;
    x = nx; y = ny;
    if (i >= 20) {
      pts[len * 2] = x;
      pts[len * 2 + 1] = y;
      len++;
    }
  }
  return pts.subarray(0, len * 2);
}

// A small dedicated solid-color palette rather than the app's gradient
// COLORMAPS (built for depth-mapped coloring, which doesn't apply to a flat
// point cloud). Index 0 is green -- the natural fern color, and the
// default -- with a few alternates to cycle through.
const FERN_COLORS = [
  { name: "Green",  rgb: [70, 190, 90] },
  { name: "Autumn", rgb: [214, 122, 47] },
  { name: "Violet", rgb: [148, 100, 214] },
  { name: "Ice",    rgb: [92, 176, 214] },
  { name: "Rose",   rgb: [214, 92, 140] },
];

// Same Canvas2D view shape as createKochView/createPythagorasTreeView, so
// attachVectorViewInteraction in app.js works on this unmodified.
function createFernView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0.24, cy: 5.0, halfHeight: 5.3, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let cachedCount = -1;
  let cachedPts = null;

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
    if (cachedCount !== opts.count) {
      cachedPts = fernPoints(opts.count);
      cachedCount = opts.count;
    }
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const color = FERN_COLORS[opts.colorIndex % FERN_COLORS.length];
    ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
    // One Path2D + one fill() call for the whole point cloud, not a
    // separate fillRect per point -- tens of thousands of individual draw
    // calls per frame visibly janks Canvas2D on mobile, and this is a
    // standard point-cloud batching optimization.
    const path = new Path2D();
    const n = cachedPts.length / 2;
    for (let i = 0; i < n; i++) {
      const [sx, sy] = worldToScreen(cachedPts[i * 2], cachedPts[i * 2 + 1]);
      path.rect(sx, sy, 1, 1);
    }
    ctx.fill(path);
  }

  return { view, resize, render, worldToScreen, screenToWorld, get dpr() { return dpr; } };
}
