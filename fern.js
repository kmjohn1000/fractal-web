"use strict";

// Chaos-game IFS fractals: a few affine transforms, picked at random each
// step (weighted by p) and applied to build a point cloud -- a
// fundamentally different technique from Koch/tree/dragon's deterministic
// recursive polylines. The Barnsley fern was the first; the rest reuse the
// same engine with nothing but a different transform table.

// Classic Barnsley fern. Coefficients are Barnsley's own published values.
const FERN_TRANSFORMS = [
  { p: 0.01, a: 0,     b: 0,     c: 0,    d: 0.16, e: 0, f: 0    },
  { p: 0.85, a: 0.85,  b: 0.04,  c: -0.04, d: 0.85, e: 0, f: 1.6  },
  { p: 0.07, a: 0.20,  b: -0.26, c: 0.23, d: 0.22, e: 0, f: 1.6  },
  { p: 0.07, a: -0.15, b: 0.28,  c: 0.26, d: 0.24, e: 0, f: 0.44 },
];

const SIERPINSKI_TRANSFORMS = [
  { a: 0.5, b: 0, c: 0, d: 0.5, e: 0,    f: 0,   p: 1 / 3 },
  { a: 0.5, b: 0, c: 0, d: 0.5, e: 0.5,  f: 0,   p: 1 / 3 },
  { a: 0.5, b: 0, c: 0, d: 0.5, e: 0.25, f: 0.5, p: 1 / 3 },
];

const LEVY_C_TRANSFORMS = [
  { a: 0.5, b: -0.5, c: 0.5,  d: 0.5, e: 0,   f: 0,   p: 0.5 },
  { a: 0.5, b: 0.5,  c: -0.5, d: 0.5, e: 0.5, f: 0.5, p: 0.5 },
];

const VICSEK_TRANSFORMS = [
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 1 / 3, f: 1 / 3, p: 0.2 }, // center
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 1 / 3, f: 0,     p: 0.2 }, // bottom-mid
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 1 / 3, f: 2 / 3, p: 0.2 }, // top-mid
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 0,     f: 1 / 3, p: 0.2 }, // left-mid
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 2 / 3, f: 1 / 3, p: 0.2 }, // right-mid
];

// Every IFS the view can show, keyed by app.js mode name (EXTRA_MODES
// lists the same keys for the picker).
const IFS_SYSTEMS = {
  fern:       { label: "Barnsley Fern",       transforms: FERN_TRANSFORMS },
  sierpinski: { label: "Sierpinski Triangle", transforms: SIERPINSKI_TRANSFORMS },
  levy:       { label: "Lévy C Curve",        transforms: LEVY_C_TRANSFORMS },
  vicsek:     { label: "Vicsek Fractal",      transforms: VICSEK_TRANSFORMS },
};

function pickTransform(transforms) {
  const r = Math.random();
  let cum = 0;
  for (const tr of transforms) {
    cum += tr.p;
    if (r < cum) return tr;
  }
  return transforms[transforms.length - 1];
}

// Plain chaos game from the origin. Returns a flat [x0,y0,x1,y1,...] array
// (not point pairs) so hot loops avoid allocating a sub-array per point.
function ifsPoints(transforms, n) {
  let x = 0, y = 0;
  const pts = new Float64Array(n * 2);
  let len = 0;
  // First 20 steps are a burn-in transient before the chaos game settles
  // onto the attractor -- skipped so a stray early point near the origin
  // doesn't show up as an outlier.
  for (let i = 0; i < n + 20; i++) {
    const t = pickTransform(transforms);
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

// Background the fern fades its SOLID_COLORS color from (colormaps.js).
const IFS_BG = [17, 17, 17];

// --- Viewport-adaptive sampling --------------------------------------------
// A single global point cloud (the original approach) goes sparse on zoom:
// the same fixed sample just spreads over more pixels, and plain rejection
// sampling ("run the chaos game, keep what lands in view") doesn't scale
// either -- at 100x zoom only ~1e-4 of points land in view.
//
// Instead this uses the IFS's own self-similarity. The invariant measure
// satisfies mu = sum_i p_i * (f_i pushes mu forward), and expanding
// that recursively along any "cut" of the address tree stays exact:
// mu = sum over cut nodes of (product of p along the address) * (the
// composed map pushes mu forward). So buildLeaves() walks the address tree,
// prunes every node whose image of the attractor's bounding box misses the
// viewport (it contributes nothing visible), and stops expanding once a
// node's image is no bigger than the viewport. Sampling a leaf by weight,
// then pushing a fresh attractor point through its composed map, draws
// exactly from mu restricted near the view -- at any zoom, with most
// samples landing on screen. Any unexpanded node is still a valid cut
// member, so the node cap only costs acceptance rate, never correctness.
const IFS_LEAF_CAP = 20000;
// Chaos-game steps applied to each reused base point before mapping it
// through a leaf: mu is invariant under a random f_i, so the result is still
// mu-distributed, but no longer one of a fixed finite set of points.
const IFS_FRESHEN_STEPS = 4;
const IFS_SLICE_MS = 10;
// Give up on a view once this many samples per target point have been tried
// (e.g. zoomed into empty space) rather than spinning forever.
const IFS_MAX_ATTEMPTS_PER_POINT = 40;

// Per-IFS sampling data, built on first use: the transforms, a base point
// cloud on the attractor (reused by the sampler), and its padded bounds.
const ifsDataCache = new Map();
function ifsData(key) {
  let data = ifsDataCache.get(key);
  if (data) return data;
  const transforms = IFS_SYSTEMS[key].transforms;
  const base = ifsPoints(transforms, 50000);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < base.length; i += 2) {
    x0 = Math.min(x0, base[i]); x1 = Math.max(x1, base[i]);
    y0 = Math.min(y0, base[i + 1]); y1 = Math.max(y1, base[i + 1]);
  }
  // Margin for points the base run didn't reach. The fern keeps its
  // original height-based margin; the others (not all taller than wide)
  // use the larger side.
  const m = 0.02 * (key === "fern" ? y1 - y0 : Math.max(x1 - x0, y1 - y0));
  data = { transforms, base, bounds: [x0 - m, x1 + m, y0 - m, y1 + m] };
  ifsDataCache.set(key, data);
  return data;
}

// Affine map as [a, b, c, d, e, f]: x' = a*x + b*y + e, y' = c*x + d*y + f.
// Returns m after t (m(t(p))), i.e. extending an address by one transform.
function composeAffine(m, t) {
  return [
    m[0] * t.a + m[1] * t.c, m[0] * t.b + m[1] * t.d,
    m[2] * t.a + m[3] * t.c, m[2] * t.b + m[3] * t.d,
    m[0] * t.e + m[1] * t.f + m[4], m[2] * t.e + m[3] * t.f + m[5],
  ];
}

function affineBoxImage(m, box) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [box[0], box[1]]) {
    for (const y of [box[2], box[3]]) {
      const tx = m[0] * x + m[1] * y + m[4];
      const ty = m[2] * x + m[3] * y + m[5];
      x0 = Math.min(x0, tx); x1 = Math.max(x1, tx);
      y0 = Math.min(y0, ty); y1 = Math.max(y1, ty);
    }
  }
  return [x0, x1, y0, y1];
}

// ifs is an ifsData() entry; viewBox is the world-space bounding box of the
// (possibly rotated) screen. Returns { maps, cumWeights } for weighted leaf
// selection; empty if the attractor doesn't intersect the view at all.
function buildLeaves(ifs, viewBox) {
  const viewDiag = Math.hypot(viewBox[1] - viewBox[0], viewBox[3] - viewBox[2]);
  const maps = [], weights = [];
  const stack = [{ m: [1, 0, 0, 1, 0, 0], w: 1 }];
  while (stack.length) {
    const node = stack.pop();
    const img = affineBoxImage(node.m, ifs.bounds);
    if (img[1] < viewBox[0] || img[0] > viewBox[1] || img[3] < viewBox[2] || img[2] > viewBox[3]) continue;
    const diag = Math.hypot(img[1] - img[0], img[3] - img[2]);
    if (diag <= viewDiag || maps.length + stack.length >= IFS_LEAF_CAP) {
      maps.push(node.m); weights.push(node.w);
      continue;
    }
    for (const t of ifs.transforms) stack.push({ m: composeAffine(node.m, t), w: node.w * t.p });
  }
  const cumWeights = new Float64Array(weights.length);
  let sum = 0;
  weights.forEach((w, i) => { sum += w; cumWeights[i] = sum; });
  return { maps, cumWeights };
}

// Same Canvas2D view shape as createKochView/createPythagorasTreeView, so
// attachVectorViewInteraction in app.js works on this unmodified. One view
// (one canvas) serves every IFS in IFS_SYSTEMS; setSystem switches which
// one it shows, keeping each system's pan/zoom separately.
function createIfsView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0.24, cy: 5.0, halfHeight: 5.3, rotation: 0 };
  let system = "fern";
  let ifs = ifsData(system);
  const savedViews = new Map(); // system key -> its view while another is shown
  let dpr = Math.min(window.devicePixelRatio || 1, 2);

  // view is shared with attachVectorViewInteraction by reference, so it's
  // swapped in place rather than replaced.
  function setSystem(key) {
    if (key === system) return;
    savedViews.set(system, { ...view });
    system = key;
    ifs = ifsData(key);
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

  // Per-view accumulation state, reset whenever the system, view or canvas
  // changes.
  let viewKey = "";
  let counts = null;     // hits per device pixel
  let nonzero = 0;       // pixels with count > 0, for density normalization
  let accepted = 0;      // samples that landed on screen
  let attempts = 0;
  let leaves = null;
  let imageData = null;
  let pendingFrame = 0;

  function resetForView() {
    const W = canvas.width, H = canvas.height;
    const key = `${system},${view.cx},${view.cy},${view.halfHeight},${view.rotation},${W},${H}`;
    if (key === viewKey) return;
    viewKey = key;
    if (!counts || counts.length !== W * H) {
      counts = new Uint32Array(W * H);
      imageData = ctx.createImageData(W, H);
    } else {
      counts.fill(0);
    }
    nonzero = 0; accepted = 0; attempts = 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const [x, y] = screenToWorld(sx, sy);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    leaves = buildLeaves(ifs, [x0, x1, y0, y1]);
  }

  function isDone(target) {
    return accepted >= target
      || leaves.maps.length === 0
      || attempts >= target * IFS_MAX_ATTEMPTS_PER_POINT;
  }

  // Runs the sampler for about IFS_SLICE_MS, binning on-screen hits.
  function runSlice(target) {
    const W = canvas.width, H = canvas.height;
    const { maps, cumWeights } = leaves;
    const { base, transforms } = ifs;
    const total = cumWeights[cumWeights.length - 1];
    const nBase = base.length / 2;
    // worldToScreen, inlined with its constants hoisted for the hot loop.
    const rot = -(view.rotation || 0);
    const k = (H / 2) / view.halfHeight;
    const kc = Math.cos(rot) * k, ks = Math.sin(rot) * k;
    const deadline = performance.now() + IFS_SLICE_MS;
    while (!isDone(target)) {
      for (let batch = 0; batch < 2000; batch++) {
        attempts++;
        const r = Math.random() * total;
        let lo = 0, hi = cumWeights.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (cumWeights[mid] < r) lo = mid + 1; else hi = mid;
        }
        const m = maps[lo];
        const bi = (Math.random() * nBase) | 0;
        let x = base[bi * 2], y = base[bi * 2 + 1];
        for (let s = 0; s < IFS_FRESHEN_STEPS; s++) {
          const t = pickTransform(transforms);
          const nx = t.a * x + t.b * y + t.e;
          y = t.c * x + t.d * y + t.f;
          x = nx;
        }
        const wx = m[0] * x + m[1] * y + m[4] - view.cx;
        const wy = m[2] * x + m[3] * y + m[5] - view.cy;
        const px = Math.floor(W / 2 + wx * kc - wy * ks);
        const py = Math.floor(H / 2 - (wx * ks + wy * kc));
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const idx = py * W + px;
        if (counts[idx]++ === 0) nonzero++;
        accepted++;
      }
      if (performance.now() > deadline) break;
    }
  }

  // Log-density shading: a pixel's brightness grows with log(hits),
  // normalized against 1.5x the mean hits per lit pixel, so sparse
  // regions render as a soft, dim haze rather than isolated hard dots and
  // the dense rachis doesn't blow everything else out.
  function draw(colorIndex) {
    const fg = SOLID_COLORS[colorIndex % SOLID_COLORS.length].rgb;
    const palette = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const r = Math.round(IFS_BG[0] + (fg[0] - IFS_BG[0]) * t);
      const g = Math.round(IFS_BG[1] + (fg[1] - IFS_BG[1]) * t);
      const b = Math.round(IFS_BG[2] + (fg[2] - IFS_BG[2]) * t);
      palette[i] = (255 << 24) | (b << 16) | (g << 8) | r; // little-endian RGBA
    }
    const out = new Uint32Array(imageData.data.buffer);
    const ref = Math.log1p(Math.max(1, 1.5 * accepted / Math.max(1, nonzero)));
    const lut = new Uint32Array(64); // counts are small; cache the common ones
    for (let c = 0; c < lut.length; c++) {
      lut[c] = palette[Math.min(255, Math.round(255 * Math.log1p(c) / ref))];
    }
    for (let i = 0; i < counts.length; i++) {
      const c = counts[i];
      out[i] = c < 64 ? lut[c] : palette[Math.min(255, Math.round(255 * Math.log1p(c) / ref))];
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // opts: { count (target on-screen samples), colorIndex, isActive(),
  // onProgress() }. Keeps refining on later animation frames until count is
  // reached; isActive lets the caller stop that when the mode switches away.
  let lastOpts = null;
  function render(opts) {
    lastOpts = opts; // a pending refinement frame picks up the newest opts
    resize();
    resetForView();
    if (accepted > opts.count) { // slider lowered: start over
      viewKey = "";
      resetForView();
    }
    runSlice(opts.count);
    draw(opts.colorIndex);
    if (!isDone(opts.count) && !pendingFrame) {
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        if (!lastOpts.isActive()) return;
        render(lastOpts);
        lastOpts.onProgress();
      });
    }
  }

  return {
    view, resize, render, worldToScreen, screenToWorld, setSystem,
    get system() { return system; },
    get bounds() { return ifs.bounds; },
    get dpr() { return dpr; },
    get accepted() { return accepted; },
    // True while refinement frames are still pending (see render); share
    // capture waits for this so it doesn't save a half-filled image.
    get refining() { return pendingFrame !== 0; },
  };
}
