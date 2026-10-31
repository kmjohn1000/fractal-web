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

// Equilateral triangle with vertices (0, 1), (-sqrt(3)/2, -1/2) and
// (sqrt(3)/2, -1/2) (circumradius 1, centered on the origin). Each map
// halves toward one vertex v: p -> p/2 + v/2, so e, f = v/2.
const SIERPINSKI_TRANSFORMS = [
  { a: 0.5, b: 0, c: 0, d: 0.5, e: 0,                f: 0.5,   p: 1 / 3 },
  { a: 0.5, b: 0, c: 0, d: 0.5, e: -Math.sqrt(3) / 4, f: -0.25, p: 1 / 3 },
  { a: 0.5, b: 0, c: 0, d: 0.5, e: Math.sqrt(3) / 4,  f: -0.25, p: 1 / 3 },
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

// Every IFS the view can show, keyed by fractal-defs.js mode name (EXTRA_MODES
// lists the same keys for the picker). hueOffsets: the degrees each transform
// turns the picked color's hue, so every self-similar piece takes its own tint
// (see "Coloring by address" below).
const IFS_SYSTEMS = {
  fern:       { transforms: FERN_TRANSFORMS, hueOffsets: [-21, 0, 27, 50] },
  sierpinski: { transforms: SIERPINSKI_TRANSFORMS, hueOffsets: [-45, 0, 45] },
  levy:       { transforms: LEVY_C_TRANSFORMS, hueOffsets: [-33, 33] },
  vicsek:     { transforms: VICSEK_TRANSFORMS, hueOffsets: [0, -49, 49, -25, 25] },
};
// White has no hue to turn, so its transforms differ in brightness instead:
// the one with the lowest hue offset takes this share of the picked color,
// the one with the highest the whole of it, the rest in between by offset.
const IFS_GREY_DIM_MIN = 0.7;
// Each transform knows its place in its table (.ci), for the color tables.
for (const sys of Object.values(IFS_SYSTEMS)) sys.transforms.forEach((t, i) => { t.ci = i; });

// One rgb per transform of a system: the picked SOLID_COLORS color, hue-turned
// by that transform's offset (hueTurned, colormaps.js); for a color with no hue
// the offset sets the brightness instead (IFS_GREY_DIM_MIN).
function ifsTransformColors(key, colorIndex) {
  const base = SOLID_COLORS[colorIndex % SOLID_COLORS.length].rgb;
  const offsets = IFS_SYSTEMS[key].hueOffsets;
  if (!isGreyColor(base)) return offsets.map((deg) => hueTurned(base, deg));
  const lo = Math.min(...offsets), span = Math.max(...offsets) - lo;
  return offsets.map((deg) => {
    const f = IFS_GREY_DIM_MIN + (1 - IFS_GREY_DIM_MIN) * (deg - lo) / span;
    return base.map((v) => v * f);
  });
}

// Where the chaos game's random numbers come from. Tests replace it with a
// seeded generator to get a repeatable sequence of transforms; the sampling
// of the normal render (runSlice) stays on Math.random.
let ifsRandom = Math.random;
// The way tests and scripts install that generator (another file can't assign this variable).
function setIfsRandom(v) { ifsRandom = v; }

function pickTransform(transforms) {
  const r = ifsRandom();
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

// Same chaos game as ifsPoints, and each point also keeps the mix of
// transforms that led to it: a running average in which the newest transform
// weighs half, the one before a quarter, and so on, so the mix (summing to 1)
// says which piece of the attractor the point is in, coarse to fine. Returns
// { pts, mix } with mix holding transforms.length weights per point.
function ifsAddressPoints(transforms, n) {
  const T = transforms.length;
  const pts = new Float64Array(n * 2), mix = new Float32Array(n * T);
  const now = new Float32Array(T).fill(1 / T);
  let x = 0, y = 0;
  for (let i = 0; i < n + 20; i++) { // 20 burn-in steps, as ifsPoints
    const t = pickTransform(transforms);
    const nx = t.a * x + t.b * y + t.e;
    y = t.c * x + t.d * y + t.f;
    x = nx;
    for (let q = 0; q < T; q++) now[q] = 0.5 * now[q] + (q === t.ci ? 0.5 : 0);
    if (i >= 20) {
      pts[(i - 20) * 2] = x;
      pts[(i - 20) * 2 + 1] = y;
      mix.set(now, (i - 20) * T);
    }
  }
  return { pts, mix };
}

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
  const { pts: base, mix: baseMix } = ifsAddressPoints(transforms, 50000);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < base.length; i += 2) {
    x0 = Math.min(x0, base[i]); x1 = Math.max(x1, base[i]);
    y0 = Math.min(y0, base[i + 1]); y1 = Math.max(y1, base[i + 1]);
  }
  // Margin for points the base run didn't reach. The fern keeps its
  // original height-based margin; the others (not all taller than wide)
  // use the larger side.
  const m = 0.02 * (key === "fern" ? y1 - y0 : Math.max(x1 - x0, y1 - y0));
  data = { transforms, base, baseMix, bounds: [x0 - m, x1 + m, y0 - m, y1 + m] };
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
// (possibly rotated) screen; cols is ifsTransformColors for the system.
// Returns { maps, cumWeights } for weighted leaf selection (empty if the
// attractor doesn't intersect the view at all), and per leaf the color its
// address gives the coarse digits (leafRGB, the transforms' colors weighing
// 1/2, 1/4, ... from the outermost map in, scaled to the share they keep) and
// the share left for the finer digits of a point drawn through it (leafS,
// 1/2^depth but never below a half: deep inside one piece the coarse digits
// are all alike, so the point's own digits must still tint what is in view).
function buildLeaves(ifs, viewBox, cols) {
  const viewDiag = Math.hypot(viewBox[1] - viewBox[0], viewBox[3] - viewBox[2]);
  const maps = [], weights = [], leafRGB = [], leafS = [];
  const stack = [{ m: [1, 0, 0, 1, 0, 0], w: 1, c: [0, 0, 0], s: 1 }];
  while (stack.length) {
    const node = stack.pop();
    const img = affineBoxImage(node.m, ifs.bounds);
    if (img[1] < viewBox[0] || img[0] > viewBox[1] || img[3] < viewBox[2] || img[2] > viewBox[3]) continue;
    const diag = Math.hypot(img[1] - img[0], img[3] - img[2]);
    if (diag <= viewDiag || maps.length + stack.length >= IFS_LEAF_CAP) {
      // The address' own digits weigh 1 - node.s in all; they keep 1 - share of the color.
      const share = Math.max(node.s, 0.5), k = node.s < 1 ? (1 - share) / (1 - node.s) : 0;
      maps.push(node.m); weights.push(node.w); leafRGB.push(k * node.c[0], k * node.c[1], k * node.c[2]); leafS.push(share);
      continue;
    }
    for (const t of ifs.transforms) {
      const col = cols[t.ci], h = node.s * 0.5;
      stack.push({
        m: composeAffine(node.m, t), w: node.w * t.p,
        c: [node.c[0] + h * col[0], node.c[1] + h * col[1], node.c[2] + h * col[2]], s: h,
      });
    }
  }
  const cumWeights = new Float64Array(weights.length);
  let sum = 0;
  weights.forEach((w, i) => { sum += w; cumWeights[i] = sum; });
  return { maps, cumWeights, leafRGB: Float32Array.from(leafRGB), leafS: Float32Array.from(leafS) };
}

// --- Chaos-game replay -------------------------------------------------------
// The Play button of the dot shapes shows the chaos game itself: from an empty
// backdrop a bright dot sits at a point, flies to its image under a randomly
// chosen transform and leaves a point in that transform's address color; the
// first REPLAY_SLOW_JUMPS jumps are slow and one by one, then the pace grows
// until `count` points are down and the picture has emerged. The points go into
// the same hit counts the normal render fills, so the last frame is the normal
// frame and the hand-off to render() needs nothing but a call. The schedule
// below is pure (time <-> jumps done); createIfsView plays it.
const REPLAY_SLOW_JUMPS = 24;    // jumps shown one at a time
const REPLAY_GAP_FIRST_S = 0.30; // seconds per jump at 1x: the first ...
const REPLAY_GAP_LAST_S = 0.06;  // ... down to the last of the slow ones
const REPLAY_RAMP_S = 4.5;       // from there, seconds to put down all `count` points
const REPLAY_CAP_S = 10;         // at 1x, however slow the device: the rest is the normal render's job
const REPLAY_HOLD = 0.3;         // share of a jump the dot sits at its point before it flies
const REPLAY_BURN_IN = 12;       // jumps whose points are only shown, not counted (still off the shape)
const REPLAY_MARKS = 20000;      // points drawn as marks over the picture, big at first, shrinking into it
const REPLAY_STAMP_RAD = 1.5;    // css px: marks smaller than this are written into the picture's pixels
const REPLAY_SPARSE_GAIN = 1.2;  // extra brightness of single-pixel points when the marks have gone (n = REPLAY_MARKS), fading to none at the end
const REPLAY_SEQ = 100;        // the first points in order (the trail, the tests), world coordinates
const REPLAY_FRAME_MS = 8;       // per-frame budget for the jumps and the redraw
const REPLAY_GAP_RATIO = Math.pow(REPLAY_GAP_LAST_S / REPLAY_GAP_FIRST_S, 1 / (REPLAY_SLOW_JUMPS - 1));
// Seconds at 1x when the first n slow jumps are done (n <= REPLAY_SLOW_JUMPS).
const replaySlowTime = (n) => REPLAY_GAP_FIRST_S * (1 - Math.pow(REPLAY_GAP_RATIO, n)) / (1 - REPLAY_GAP_RATIO);
const REPLAY_SLOW_S = replaySlowTime(REPLAY_SLOW_JUMPS);

// How many jumps are done (a fraction: the one under way counts by how far it
// has flown) after t seconds, for a replay of `total` points. The ramp grows
// geometrically from the slow phase's last pace, eased in, so the rate carries on
// from there; the first points are spread evenly in log(n).
function replayJumpsAt(t, total) {
  if (t <= 0) return 0;
  if (t >= REPLAY_SLOW_S + REPLAY_RAMP_S) return total;
  if (t < REPLAY_SLOW_S) {
    const k = Math.floor(Math.log(Math.max(1e-9, 1 - t * (1 - REPLAY_GAP_RATIO) / REPLAY_GAP_FIRST_S)) / Math.log(REPLAY_GAP_RATIO));
    const k0 = Math.min(REPLAY_SLOW_JUMPS - 1, Math.max(0, k));
    return k0 + (t - replaySlowTime(k0)) / (REPLAY_GAP_FIRST_S * Math.pow(REPLAY_GAP_RATIO, k0));
  }
  const s = (t - REPLAY_SLOW_S) / REPLAY_RAMP_S;
  return REPLAY_SLOW_JUMPS * Math.pow(total / REPLAY_SLOW_JUMPS, 0.25 * s + 0.75 * s * s);
}

// The inverse: the time at which n jumps are done.
function replayTimeOf(n, total) {
  if (n <= 0) return 0;
  if (n < REPLAY_SLOW_JUMPS) {
    const k = Math.floor(n);
    return replaySlowTime(k) + (n - k) * REPLAY_GAP_FIRST_S * Math.pow(REPLAY_GAP_RATIO, k);
  }
  const u = Math.log(Math.min(n, total) / REPLAY_SLOW_JUMPS) / Math.log(total / REPLAY_SLOW_JUMPS);
  const s = (-0.25 + Math.sqrt(0.0625 + 3 * u)) / 1.5;
  return REPLAY_SLOW_S + REPLAY_RAMP_S * s;
}

// Same Canvas2D view shape as createKochView/createPythagorasTreeView, so
// attachVectorViewInteraction in interaction.js works on this unmodified. One view
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
    endReplay(); // its picture belongs to the system being left
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
  // Coloring by address: the picked color, per transform (cols), and per
  // device pixel the sum of its hits' colors (sumR/G/B, divided by counts to
  // get the pixel's mean color). baseRGB is each base point's own color.
  let colorIndex = 0, cols = null, baseRGB = null;
  let sumR = null, sumG = null, sumB = null;
  let bgPix = null;      // the backdrop, 3 bytes per pixel, built once per canvas size (vectorgeom.js)

  // The chaos-game replay in progress (or paused), or null; see "Chaos-game replay" below.
  let replay = null;
  let drawGain = 1;

  const keyNow = () => `${system},${view.cx},${view.cy},${view.halfHeight},${view.rotation},${canvas.width},${canvas.height},${colorIndex}`;

  function resetForView() {
    const W = canvas.width, H = canvas.height;
    const key = keyNow();
    if (key === viewKey) return;
    viewKey = key;
    cols = ifsTransformColors(system, colorIndex);
    const T = ifs.transforms.length, nBase = ifs.base.length / 2;
    baseRGB = new Float32Array(nBase * 3);
    for (let i = 0; i < nBase; i++) {
      for (let q = 0; q < T; q++) {
        const w = ifs.baseMix[i * T + q];
        baseRGB[i * 3] += w * cols[q][0]; baseRGB[i * 3 + 1] += w * cols[q][1]; baseRGB[i * 3 + 2] += w * cols[q][2];
      }
    }
    if (!counts || counts.length !== W * H) {
      counts = new Uint32Array(W * H);
      sumR = new Float32Array(W * H); sumG = new Float32Array(W * H); sumB = new Float32Array(W * H);
      imageData = ctx.createImageData(W, H);
      bgPix = backdropPixels(W, H);
    } else {
      counts.fill(0); sumR.fill(0); sumG.fill(0); sumB.fill(0);
    }
    nonzero = 0; accepted = 0; attempts = 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [sx, sy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const [x, y] = screenToWorld(sx, sy);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    leaves = buildLeaves(ifs, [x0, x1, y0, y1], cols);
  }

  function isDone(target) {
    return accepted >= target
      || leaves.maps.length === 0
      || attempts >= target * IFS_MAX_ATTEMPTS_PER_POINT;
  }

  // Runs the sampler for about IFS_SLICE_MS, binning on-screen hits.
  function runSlice(target) {
    const W = canvas.width, H = canvas.height;
    const { maps, cumWeights, leafRGB, leafS } = leaves;
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
        let cr = baseRGB[bi * 3], cg = baseRGB[bi * 3 + 1], cb = baseRGB[bi * 3 + 2];
        for (let s = 0; s < IFS_FRESHEN_STEPS; s++) {
          const t = pickTransform(transforms);
          const nx = t.a * x + t.b * y + t.e;
          y = t.c * x + t.d * y + t.f;
          x = nx;
          const col = cols[t.ci]; // the newest transform weighs half, as in the base points' mix
          cr = 0.5 * cr + 0.5 * col[0]; cg = 0.5 * cg + 0.5 * col[1]; cb = 0.5 * cb + 0.5 * col[2];
        }
        // The leaf's own address gives the coarse digits, the point the fine ones.
        const ls = leafS[lo];
        cr = leafRGB[lo * 3] + ls * cr; cg = leafRGB[lo * 3 + 1] + ls * cg; cb = leafRGB[lo * 3 + 2] + ls * cb;
        const wx = m[0] * x + m[1] * y + m[4] - view.cx;
        const wy = m[2] * x + m[3] * y + m[5] - view.cy;
        const px = Math.floor(W / 2 + wx * kc - wy * ks);
        const py = Math.floor(H / 2 - (wx * ks + wy * kc));
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const idx = py * W + px;
        if (counts[idx]++ === 0) nonzero++;
        sumR[idx] += cr; sumG[idx] += cg; sumB[idx] += cb;
        accepted++;
      }
      if (performance.now() > deadline) break;
    }
  }

  // Log-density shading: a pixel's brightness grows with log(hits),
  // normalized against 1.5x the mean hits per lit pixel, so sparse
  // regions render as a soft, dim haze rather than isolated hard dots and
  // the dense rachis doesn't blow everything else out. The pixel's color is
  // the mean of its hits' address colors, faded in from the background by
  // that brightness, over the backdrop's own color at that pixel.
  function draw() {
    shade();
    ctx.putImageData(imageData, 0, 0);
  }
  function shade() {
    const out = new Uint32Array(imageData.data.buffer);
    // drawGain: 1 for the normal render; a replay brightens its sparse middle, where the points
    // are single pixels, down to 1 by its last frame.
    const ref = Math.log1p(Math.max(1, 1.5 * accepted / Math.max(1, nonzero))) / drawGain;
    const lut = new Float32Array(64); // counts are small; cache the common ones
    const tMax = 1 + 0.5 * (drawGain - 1); // over-exposed (clipped) while the gain is on
    for (let c = 0; c < lut.length; c++) lut[c] = Math.min(tMax, Math.log1p(c) / ref);
    for (let i = 0; i < counts.length; i++) {
      const c = counts[i], o = i * 3;
      const bgR = bgPix[o], bgG = bgPix[o + 1], bgB = bgPix[o + 2];
      if (c === 0) { out[i] = (255 << 24) | (bgB << 16) | (bgG << 8) | bgR; continue; } // little-endian RGBA
      const t = c < 64 ? lut[c] : Math.min(tMax, Math.log1p(c) / ref), inv = 1 / c;
      const r = Math.round(bgR + (sumR[i] * inv - bgR) * t);
      const g = Math.round(bgG + (sumG[i] * inv - bgG) * t);
      const b = Math.round(bgB + (sumB[i] * inv - bgB) * t);
      out[i] = (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
    }
  }

  // --- Chaos-game replay: the engine (the schedule is above createIfsView) ---
  // startReplay clears the picture and plays the real chaos game from the origin
  // with ifsRandom's numbers: the dot at the current point flies to the image of a
  // chosen transform, and each landed point goes into the hit counts (after the
  // first REPLAY_BURN_IN, which are still off the shape) -- the same counts, colors
  // and log-density shading as the normal render, so its last frame is the normal
  // frame. The first points are also kept as marks drawn over the picture, big
  // at first and shrinking into it. It plays the view as it is; the caller frames
  // the shape first (fitVectorView).

  // Lands the jumps up to target (or until the deadline), the dot's next jump
  // already chosen: x, y is the point it is at, nx, ny, nci where it flies next.
  function replayLand(target, deadline) {
    const r = replay, W = canvas.width, H = canvas.height;
    const trs = ifs.transforms, last = trs.length - 1, cum = r.cum, rnd = ifsRandom;
    const rot = -(view.rotation || 0), k = (H / 2) / view.halfHeight;
    const kc = Math.cos(rot) * k, ks = Math.sin(rot) * k; // worldToScreen, as in runSlice
    let { x, y, nx, ny, nci, cr, cg, cb, n } = r;
    while (n < target) {
      const stop = Math.min(target, n + 2048);
      while (n < stop) {
        x = nx; y = ny; // the dot lands, in the color of the transform that took it there
        const col = cols[nci]; // a point's color mixes its transforms' colors, the newest weighing half, as ifsAddressPoints
        cr = 0.5 * cr + 0.5 * col[0]; cg = 0.5 * cg + 0.5 * col[1]; cb = 0.5 * cb + 0.5 * col[2];
        n++;
        const wx = x - view.cx, wy = y - view.cy;
        const fx = W / 2 + wx * kc - wy * ks, fy = H / 2 - (wx * ks + wy * kc);
        if (n <= REPLAY_MARKS) {
          const m = r.marks[nci];
          m[2 * r.markLen[nci]] = fx; m[2 * r.markLen[nci]++ + 1] = fy;
          if (n <= REPLAY_SEQ) { r.seqX[n] = x; r.seqY[n] = y; r.seqC[n] = nci; }
        }
        if (n > REPLAY_BURN_IN) {
          const px = Math.floor(fx), py = Math.floor(fy);
          attempts++;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            const idx = py * W + px;
            if (counts[idx]++ === 0) nonzero++;
            sumR[idx] += cr; sumG[idx] += cg; sumB[idx] += cb;
            accepted++;
          }
        }
        const u = rnd();
        let q = 0;
        while (q < last && u >= cum[q]) q++;
        const t = trs[q];
        nci = q;
        nx = t.a * x + t.b * y + t.e;
        ny = t.c * x + t.d * y + t.f;
      }
      if (performance.now() > deadline) break;
    }
    Object.assign(r, { x, y, nx, ny, nci, cr, cg, cb, n });
  }

  // How big and how opaque the marks are after n jumps: 3.4 css px in radius in the slow phase,
  // shrinking with log(n) until REPLAY_MARKS, where they have faded into the picture's own pixels.
  function replayMarkLook(n) {
    const f = Math.min(1, Math.max(0, Math.log(Math.max(n, 1) / REPLAY_SLOW_JUMPS) / Math.log(REPLAY_MARKS / REPLAY_SLOW_JUMPS)));
    const s = Math.min(1, Math.max(0, (f - 0.85) / 0.15));
    // down to one pixel across at the end, where a mark is the picture's own pixel and fades into it
    return { rad: dpr * (0.25 + 3.15 * Math.pow(1 - f, 1.8)), alpha: 1 - s * s * (3 - 2 * s) };
  }

  // The small marks, as little squares written into the picture's pixels (thousands a frame
  // are too many for the canvas's own drawing): over what draw() just shaded, so only after it.
  function stampMarks(look) {
    const r = replay, W = canvas.width, H = canvas.height, data = imageData.data;
    const half = Math.max(0.5, look.rad);
    for (let q = 0; q < cols.length; q++) {
      const m = r.marks[q], col = cols[q];
      for (let i = 0; i < r.markLen[q]; i++) {
        const x0 = Math.max(0, Math.floor(m[2 * i] - half + 0.5)), x1 = Math.min(W - 1, Math.floor(m[2 * i] + half - 0.5));
        const y0 = Math.max(0, Math.floor(m[2 * i + 1] - half + 0.5)), y1 = Math.min(H - 1, Math.floor(m[2 * i + 1] + half - 0.5));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0, o = (y * W + x0) * 4; x <= x1; x++, o += 4) {
            data[o] += (col[0] - data[o]) * look.alpha;
            data[o + 1] += (col[1] - data[o + 1]) * look.alpha;
            data[o + 2] += (col[2] - data[o + 2]) * look.alpha;
          }
        }
      }
    }
  }

  // Everything over the picture, in canvas pixels: marks, the Sierpinski's corners, the
  // trail, the landing ripple, the dot. jumps is the schedule's (fractional) count.
  function replayOverlay(jumps) {
    const r = replay, W = canvas.width, H = canvas.height, n = r.n, u = dpr;
    const rot = -(view.rotation || 0), k = (H / 2) / view.halfHeight;
    const kc = Math.cos(rot) * k, ks = Math.sin(rot) * k;
    const sx = (x, y) => W / 2 + (x - view.cx) * kc - (y - view.cy) * ks;
    const sy = (x, y) => H / 2 - ((x - view.cx) * ks + (y - view.cy) * kc);
    const rgb = cols.map((c) => `${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])}`);
    const clamp01 = (v) => Math.min(1, Math.max(0, v));
    // The dot, trail and corners go over the 60 jumps after the slow ones.
    const live = 1 - clamp01((n - REPLAY_SLOW_JUMPS) / 60);
    // Big marks are round discs; once they are down to a few pixels (see stampMarks) they are in the picture itself.
    const look = replayMarkLook(n);
    if (look.rad >= REPLAY_STAMP_RAD * u && look.alpha > 0) {
      ctx.globalAlpha = look.alpha;
      for (let q = -1; q < rgb.length; q++) {
        ctx.fillStyle = q < 0 ? "rgb(236,240,248)" : `rgb(${rgb[q]})`;
        ctx.beginPath();
        if (q < 0) { ctx.arc(sx(0, 0), sy(0, 0), look.rad, 0, 2 * Math.PI); } // the start
        else {
          for (let i = 0; i < r.markLen[q]; i++) {
            const x = r.marks[q][2 * i], y = r.marks[q][2 * i + 1];
            ctx.moveTo(x + look.rad, y);
            ctx.arc(x, y, look.rad, 0, 2 * Math.PI);
          }
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    r.dot = null;
    if (live <= 0 || n >= r.total) return;
    // The jump under way: the dot sits a moment, then flies, taking the chosen transform's color.
    const frac = clamp01(jumps - n), ft = clamp01((frac - REPLAY_HOLD) / (1 - REPLAY_HOLD));
    const e = ft < 0.5 ? 4 * ft * ft * ft : 1 - Math.pow(-2 * ft + 2, 3) / 2;
    const dx = r.x + (r.nx - r.x) * e, dy = r.y + (r.ny - r.y) * e;
    const tint = clamp01(ft * 2.5), chosen = cols[r.nci];
    const dotRGB = [0, 1, 2].map((q) => Math.round(255 + (0.75 * chosen[q] + 0.25 * 255 - 255) * tint)).join(",");
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    // Corner marks (Sierpinski): faint rings at the three fixed points; the chosen one lights up in flight.
    if (system === "sierpinski") {
      ifs.transforms.forEach((t, q) => {
        const fx = t.e / (1 - t.a), fy = t.f / (1 - t.d); // the fixed point of x -> a*x + e (a == d, no shear)
        const lit = q === r.nci && ft > 0 ? Math.sin(Math.PI * ft) : 0;
        ctx.strokeStyle = `rgba(${rgb[q]},${(0.32 + 0.6 * lit) * live})`;
        ctx.lineWidth = 1.4 * u;
        ctx.beginPath();
        ctx.arc(sx(fx, fy), sy(fx, fy), (7 + 3 * lit) * u, 0, 2 * Math.PI);
        ctx.stroke();
      });
    }
    // The last few jumps as a fading trail, and the flight so far.
    for (let j = n; j >= Math.max(1, n - 6); j--) {
      ctx.strokeStyle = `rgba(${rgb[r.seqC[j]]},${0.5 * Math.pow(1 - (n - j) / 7, 1.5) * live})`;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(sx(r.seqX[j - 1], r.seqY[j - 1]), sy(r.seqX[j - 1], r.seqY[j - 1]));
      ctx.lineTo(sx(r.seqX[j], r.seqY[j]), sy(r.seqX[j], r.seqY[j]));
      ctx.stroke();
    }
    if (e > 0) {
      ctx.strokeStyle = `rgba(${rgb[r.nci]},${0.8 * live})`;
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(sx(r.x, r.y), sy(r.x, r.y));
      ctx.lineTo(sx(dx, dy), sy(dx, dy));
      ctx.stroke();
    }
    // A ring spreads from the point each jump landed on.
    const age = n >= 1 ? (r.t - replayTimeOf(n, r.total)) / 0.4 : 1;
    if (age >= 0 && age < 1) {
      ctx.strokeStyle = `rgba(${rgb[r.seqC[n]]},${0.7 * (1 - age) * (1 - age) * live})`;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      ctx.arc(sx(r.x, r.y), sy(r.x, r.y), (4 + 14 * age) * u, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const gx = sx(dx, dy), gy = sy(dx, dy), R = 20 * u;
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, R);
    glow.addColorStop(0, `rgba(255,255,255,${live})`);
    glow.addColorStop(0.12, `rgba(${dotRGB},${0.95 * live})`);
    glow.addColorStop(0.4, `rgba(${dotRGB},${0.3 * live})`);
    glow.addColorStop(1, `rgba(${dotRGB},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(gx, gy, R, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${live})`;
    ctx.beginPath();
    ctx.arc(gx, gy, 2.4 * u, 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    r.dot = { x: gx, y: gy, rgb: dotRGB, flying: e > 0 };
  }

  // One frame of the replay: dt real seconds on (times the speed), the jumps the schedule has
  // reached (as many as budgetMs allows: if the device falls behind, the schedule slows to
  // what it did), then the picture and the overlay. At the cap the rest is left to render().
  function replayFrame(dt, budgetMs) {
    const r = replay, speed = r.speed();
    r.t += dt * speed;
    r.wall += dt * speed;
    if (r.wall >= REPLAY_CAP_S) { replayHandOff(); return; }
    const jumps = replayJumpsAt(r.t, r.total);
    const target = Math.min(r.total, Math.floor(jumps));
    replayLand(target, performance.now() + budgetMs);
    if (r.n < target) r.t = replayTimeOf(r.n, r.total);
    const t0 = performance.now();
    // The picture is shaded again only when points landed; the small marks are stamped into it
    // then, and putImageData also drops last frame's overlay.
    if (r.n !== r.drawnN) {
      r.drawnN = r.n;
      drawGain = 1 + REPLAY_SPARSE_GAIN * (1 - Math.min(1, Math.max(0, Math.log(Math.max(r.n, 1) / REPLAY_MARKS) / Math.log(r.total / REPLAY_MARKS))));
      shade();
      const look = replayMarkLook(r.n);
      if (look.rad < REPLAY_STAMP_RAD * dpr && look.alpha > 0) stampMarks(look);
    }
    ctx.putImageData(imageData, 0, 0);
    replayOverlay(r.n < target ? r.n : jumps);
    r.drawMs = 0.7 * r.drawMs + 0.3 * (performance.now() - t0);
    if (r.n >= r.total) replayHandOff();
  }

  // The replay is over (all points down, or the cap): back to the normal render, which has
  // the counts as they are and tops up whatever is missing.
  function replayHandOff() {
    const opts = lastOpts;
    endReplay();
    render(opts);
    opts.onProgress();
  }

  function replayLoop(now) {
    const r = replay;
    if (!r || r.paused) return;
    r.raf = 0;
    if (!lastOpts.isActive()) { endReplay(); return; }
    const dt = r.last ? Math.min(0.1, (now - r.last) / 1000) : 1 / 60; // a hidden tab doesn't skip ahead
    r.last = now;
    replayFrame(dt, Math.max(2, REPLAY_FRAME_MS - r.drawMs));
    if (replay === r) {
      lastOpts.onProgress();
      r.raf = requestAnimationFrame(replayLoop);
    }
  }

  // opts: render's (count, colorIndex, isActive, onProgress) plus speed() (the
  // schedule's speed, 1 = REPLAY_SLOW_S + REPLAY_RAMP_S seconds), onChange() (started,
  // paused, resumed or ended) and manual (tests: no animation frames, replayStep advances).
  function startReplay(opts) {
    endReplay();
    lastOpts = opts;
    resize();
    colorIndex = opts.colorIndex;
    viewKey = ""; // an empty picture, even over an unchanged view
    resetForView();
    const T = ifs.transforms.length;
    let sum = 0;
    replay = {
      count: opts.count, total: opts.count + REPLAY_BURN_IN, speed: opts.speed || (() => 1),
      onChange: opts.onChange || (() => {}), manual: !!opts.manual,
      cum: ifs.transforms.map((t) => (sum += t.p)),
      t: 0, wall: 0, n: 0, drawnN: -1, drawMs: 0, paused: false, raf: 0, last: 0, dot: null,
      x: 0, y: 0, nx: 0, ny: 0, nci: 0, // the point the dot is at, and the one it flies to next
      cr: cols.reduce((s, c) => s + c[0] / T, 0), cg: cols.reduce((s, c) => s + c[1] / T, 0), cb: cols.reduce((s, c) => s + c[2] / T, 0),
      // The landed points as marks, per transform (canvas px, x then y), and the first ones in order (world).
      marks: cols.map(() => new Float32Array(2 * REPLAY_MARKS)), markLen: new Int32Array(T),
      seqX: new Float64Array(REPLAY_SEQ + 1), seqY: new Float64Array(REPLAY_SEQ + 1),
      seqC: new Int8Array(REPLAY_SEQ + 1).fill(-1), // the start point, number 0, has no transform
    };
    // The first jump's transform is chosen like all the others: land nothing, pick.
    const r = replay, u = ifsRandom();
    let q = 0;
    while (q < T - 1 && u >= r.cum[q]) q++;
    const t = ifs.transforms[q];
    r.nci = q; r.nx = t.e; r.ny = t.f;
    replayFrame(0, Infinity); // the empty picture, with the dot at the start
    opts.onProgress();
    if (!replay.manual) replay.raf = requestAnimationFrame(replayLoop);
    replay.onChange();
  }
  function pauseReplay() {
    if (!replay || replay.paused) return;
    cancelAnimationFrame(replay.raf);
    replay.raf = 0;
    replay.paused = true;
    replay.onChange();
  }
  function resumeReplay() {
    if (!replay || !replay.paused) return;
    replay.paused = false;
    replay.last = 0;
    if (!replay.manual) replay.raf = requestAnimationFrame(replayLoop);
    replay.onChange();
  }
  // Drops the replay without drawing; the caller renders (requestRender). True if there was one.
  function endReplay() {
    if (!replay) return false;
    cancelAnimationFrame(replay.raf);
    const { onChange } = replay;
    replay = null;
    drawGain = 1;
    onChange();
    return true;
  }

  // opts: { count (target on-screen samples), colorIndex, isActive(),
  // onProgress() }. Keeps refining on later animation frames until count is
  // reached; isActive lets the caller stop that when the mode switches away.
  let lastOpts = null;
  function render(opts) {
    lastOpts = opts; // a pending refinement frame picks up the newest opts
    resize();
    colorIndex = opts.colorIndex;
    if (replay) {
      // Nothing changed since the replay drew: it owns the canvas. Anything else
      // (view, size, color, count) ends it and gets the normal render.
      if (keyNow() === viewKey && opts.count === replay.count) return;
      endReplay();
    }
    resetForView();
    if (accepted > opts.count) { // slider lowered: start over
      viewKey = "";
      resetForView();
    }
    runSlice(opts.count);
    draw();
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
    get refining() { return pendingFrame !== 0 || (replay !== null && !replay.paused); },
    startReplay, pauseReplay, resumeReplay, cancelReplay: endReplay,
    // True from startReplay until it ends (cancelled, or all points down), paused or not.
    get replaying() { return replay !== null; },
    get replayRunning() { return replay !== null && !replay.paused; },
    // Test hooks: advance a manual replay by dt seconds (budgetMs of jumps, by default no limit),
    // and read where it is.
    replayStep(dt, budgetMs = Infinity) { if (replay) replayFrame(dt, budgetMs); },
    get replayState() {
      if (!replay) return null;
      const r = replay, top = Math.min(r.n, REPLAY_SEQ);
      return {
        n: r.n, t: r.t, total: r.total, paused: r.paused, x: r.x, y: r.y, nx: r.nx, ny: r.ny, nci: r.nci,
        dot: r.dot, burnIn: REPLAY_BURN_IN, perTransform: Array.from(r.markLen), // jumps per transform, among the first REPLAY_MARKS
        seq: Array.from({ length: top + 1 }, (_, i) => ({ x: r.seqX[i], y: r.seqY[i], ci: r.seqC[i] })),
      };
    },
  };
}
