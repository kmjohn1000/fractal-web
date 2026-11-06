// The IFS systems of the dot shapes (fern, Sierpinski triangle and pentagon, Lévy C, Vicsek): their
// transform tables, address colors, the chaos game itself and the viewport-adaptive sampler. Split from
// fern.js, which keeps the replay and createIfsView. PENTAGON_RATIO is here, so scripts/make-short.mjs
// patches it in this file; the REPLAY_* constants it also patches stay in fern.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { SOLID_COLORS, hueTurned, isGreyColor } from "./colormaps.js?v=1.70.0";

// Chaos-game IFS fractals: a few affine transforms, picked at random each
// step (weighted by p) and applied to build a point cloud -- a
// fundamentally different technique from Koch/tree/dragon's deterministic
// recursive polylines. The Barnsley fern was the first; the rest reuse the
// same engine with nothing but a different transform table.

// Classic Barnsley fern. Coefficients are Barnsley's own published values.
export const FERN_TRANSFORMS = [
  { p: 0.01, a: 0,     b: 0,     c: 0,    d: 0.16, e: 0, f: 0    },
  { p: 0.85, a: 0.85,  b: 0.04,  c: -0.04, d: 0.85, e: 0, f: 1.6  },
  { p: 0.07, a: 0.20,  b: -0.26, c: 0.23, d: 0.22, e: 0, f: 1.6  },
  { p: 0.07, a: -0.15, b: 0.28,  c: 0.26, d: 0.24, e: 0, f: 0.44 },
];

// Equilateral triangle with vertices (0, 1), (-sqrt(3)/2, -1/2) and
// (sqrt(3)/2, -1/2) (circumradius 1, centered on the origin). Each map
// halves toward one vertex v: p -> p/2 + v/2, so e, f = v/2.
export const SIERPINSKI_TRANSFORMS = [
  { a: 0.5, b: 0, c: 0, d: 0.5, e: 0,                f: 0.5,   p: 1 / 3 },
  { a: 0.5, b: 0, c: 0, d: 0.5, e: -Math.sqrt(3) / 4, f: -0.25, p: 1 / 3 },
  { a: 0.5, b: 0, c: 0, d: 0.5, e: Math.sqrt(3) / 4,  f: -0.25, p: 1 / 3 },
];

// The Sierpinski pentagon (the pentaflake): the chaos game on the five corners of a regular
// pentagon (circumradius 1, point up, centered on the origin), jumping 1 - s of the way to the
// chosen corner v, p -> s*p + (1 - s)*v, with s = 1/phi^2 so that the five copies just touch.
// Corners clockwise from the top; e, f = (1 - s)*v.
export const PENTAGON_RATIO = 1 / (((1 + Math.sqrt(5)) / 2) ** 2); // 0.381966
export const PENTAGON_TRANSFORMS = Array.from({ length: 5 }, (_, k) => {
  const vx = Math.sin(2 * Math.PI * k / 5), vy = Math.cos(2 * Math.PI * k / 5);
  return { a: PENTAGON_RATIO, b: 0, c: 0, d: PENTAGON_RATIO, e: (1 - PENTAGON_RATIO) * vx, f: (1 - PENTAGON_RATIO) * vy, p: 0.2 };
});

export const LEVY_C_TRANSFORMS = [
  { a: 0.5, b: -0.5, c: 0.5,  d: 0.5, e: 0,   f: 0,   p: 0.5 },
  { a: 0.5, b: 0.5,  c: -0.5, d: 0.5, e: 0.5, f: 0.5, p: 0.5 },
];

export const VICSEK_TRANSFORMS = [
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 1 / 3, f: 1 / 3, p: 0.2 }, // center
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 1 / 3, f: 0,     p: 0.2 }, // bottom-mid
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 1 / 3, f: 2 / 3, p: 0.2 }, // top-mid
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 0,     f: 1 / 3, p: 0.2 }, // left-mid
  { a: 1 / 3, b: 0, c: 0, d: 1 / 3, e: 2 / 3, f: 1 / 3, p: 0.2 }, // right-mid
];

// Every IFS the view can show, keyed by fractal-defs.js mode name (EXTRA_MODES
// lists the same keys for the picker). hueOffsets: the degrees each transform
// turns the picked color's hue, so every self-similar piece takes its own tint
// (see "Coloring by address" in createIfsView, fern.js). corners: the maps are jumps toward fixed
// corner points (no shear), so the replay marks those points with rings.
export const IFS_SYSTEMS = {
  fern:       { transforms: FERN_TRANSFORMS, hueOffsets: [-21, 0, 27, 50] },
  sierpinski: { transforms: SIERPINSKI_TRANSFORMS, hueOffsets: [-45, 0, 45], corners: true },
  // (the pentagon's hues run left to right: top, upper right, lower right, lower left, upper left)
  pentagon:   { transforms: PENTAGON_TRANSFORMS, hueOffsets: [0, 24, 48, -48, -24], corners: true },
  levy:       { transforms: LEVY_C_TRANSFORMS, hueOffsets: [-33, 33] },
  vicsek:     { transforms: VICSEK_TRANSFORMS, hueOffsets: [0, -49, 49, -25, 25] },
  // Corner Rules (corner-rules.js): a chaos game on a polygon's corners with a memory, so not a plain IFS.
  // corner-rules.js fills in the transforms and hues of the rule on screen (applyCornerRule) and `build`,
  // which ifsData calls instead of ifsAddressPoints.
  corners:    { transforms: [], hueOffsets: [], corners: true, build: null },
};
// White has no hue to turn, so its transforms differ in brightness instead:
// the one with the lowest hue offset takes this share of the picked color,
// the one with the highest the whole of it, the rest in between by offset.
export const IFS_GREY_DIM_MIN = 0.7;
// Each transform knows its place in its table (.ci), for the color tables.
for (const sys of Object.values(IFS_SYSTEMS)) sys.transforms.forEach((t, i) => { t.ci = i; });

// One rgb per transform of a system: the picked SOLID_COLORS color, hue-turned
// by that transform's offset (hueTurned, colormaps.js); for a color with no hue
// the offset sets the brightness instead (IFS_GREY_DIM_MIN).
export function ifsTransformColors(key, colorIndex) {
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
export let ifsRandom = Math.random;
// The way tests and scripts install that generator (another file can't assign this variable).
export function setIfsRandom(v) { ifsRandom = v; }

export function pickTransform(transforms) {
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
export function ifsPoints(transforms, n) {
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
export function ifsAddressPoints(transforms, n) {
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
export const IFS_LEAF_CAP = 20000;
// Chaos-game steps applied to each reused base point before mapping it
// through a leaf: mu is invariant under a random f_i, so the result is still
// mu-distributed, but no longer one of a fixed finite set of points.
export const IFS_FRESHEN_STEPS = 4;
export const IFS_SLICE_MS = 10;
// Give up on a view once this many samples per target point have been tried
// (e.g. zoomed into empty space) rather than spinning forever.
export const IFS_MAX_ATTEMPTS_PER_POINT = 40;

// Per-IFS sampling data, built on first use: the transforms, a base point
// cloud on the attractor (reused by the sampler), and its padded bounds.
export const ifsDataCache = new Map();
export function ifsData(key) {
  let data = ifsDataCache.get(key);
  if (data) return data;
  if (IFS_SYSTEMS[key].build) { // a system with a memory (Corner Rules) builds its own data
    data = IFS_SYSTEMS[key].build();
    ifsDataCache.set(key, data);
    return data;
  }
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
export function composeAffine(m, t) {
  return [
    m[0] * t.a + m[1] * t.c, m[0] * t.b + m[1] * t.d,
    m[2] * t.a + m[3] * t.c, m[2] * t.b + m[3] * t.d,
    m[0] * t.e + m[1] * t.f + m[4], m[2] * t.e + m[3] * t.f + m[5],
  ];
}

export function affineBoxImage(m, box) {
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
export function buildLeaves(ifs, viewBox, cols) {
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
