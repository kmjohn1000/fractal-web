// Four Seasons, the Pythagoras tree's animated place: the pure part. The cycle's color, depth and sway as
// functions of time, the falling blossoms, leaves and snow as a list of particles, and how a particle is
// drawn. No DOM and no state: tree-seasons-player.js plays it (the tree view draws the color and depth,
// pythagoras.js `season`; the particles go on a canvas of their own above the tree).
// An ES module: every top-level declaration is exported (test-hooks.js relies on it).
import { kochSnowflake } from "./koch.js?v=1.88.4";

// The Places sheet lists these under the fractal named by `fractal` (a PICKER_LAYOUT key), after that
// fractal's flown-to places (TELEPORT_DESTINATIONS has only the zoomable fractals' places). `animation`
// names what the place plays; its thumbnail is icons/places/<placeId>.webp like the others.
export const SEASON_PLACES = [
  { fractal: "tree", label: "Four Seasons", animation: "seasons" },
];

// What a screen reader hears when the place starts, and the tree canvas's label while the cycle plays (canvas-a11y.js).
export const SEASON_LABEL = "Four Seasons, Pythagoras tree";
export const SEASON_PLAYING_LABEL = `${SEASON_LABEL}, changing through the seasons`;

export const SEASON_CYCLE_S = 30;  // seconds from one spring to the next
export const SEASON_INTRO_S = 5;    // the first spring: the tree grows from its trunk (later springs regrow from the bare winter tree)
export const SEASON_DEEP = 13;      // the full tree's depth
export const SEASON_BARE = 7;       // the winter tree's depth: the finest levels have fallen
export const SEASON_SWAY_BASE = 0.006;   // radians: the gentle sway's size in spring and summer
export const SEASON_SWAY_WIND = 0.008;   // radians more through autumn and winter

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const seasonSmooth = (x) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

// Colors are mixed in OKLab, so green to pink or gold to red turns cleanly with no muddy midpoint.
export const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const fromLin =(c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export function seasonToLab([r, g, b]) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function seasonFromLab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    .map((v) => Math.max(0, Math.min(255, fromLin(clamp01(v)))));
}

export const SEASON_SPRING = [150, 214, 104];
export const SEASON_BLOSSOM = [244, 156, 188];
export const SEASON_SUMMER = [36, 148, 66];
export const SEASON_GOLD = [236, 188, 56];
export const SEASON_ORANGE = [228, 112, 34];
export const SEASON_RED = [200, 52, 36];
export const SEASON_RUST = [186, 96, 74];
export const SEASON_WINTER = [206, 226, 246];
export const SEASON_THAW = [176, 222, 124];
// [seconds into the cycle, color]: held between a pair of equal colors, mixed (eased) between unequal ones.
// The last key is the first, so the loop closes.
export const SEASON_COLOR_KEYS = [
  [0, SEASON_SPRING], [5, SEASON_SPRING], [8, SEASON_BLOSSOM], [9.5, SEASON_BLOSSOM], [12, SEASON_SUMMER], [14, SEASON_SUMMER],
  [16, SEASON_GOLD], [17.7, SEASON_ORANGE], [19.4, SEASON_RED], [21, SEASON_RUST], [23, SEASON_WINTER], [26.5, SEASON_WINTER],
  [29, SEASON_THAW], [30, SEASON_SPRING],
];

// The tree's color u seconds into the cycle (0 <= u <= SEASON_CYCLE_S): [r, g, b], not rounded.
export function seasonColor(u) {
  const keys = SEASON_COLOR_KEYS;
  if (u <= keys[0][0]) return keys[0][1].slice();
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const k = seasonSmooth((u - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
      const a = seasonToLab(keys[i - 1][1]), b = seasonToLab(keys[i][1]);
      return seasonFromLab(a.map((v, j) => v + (b[j] - v) * k));
    }
  }
  return keys[keys.length - 1][1].slice();
}

// The tree's depth t seconds after the animation began (a fraction: the next level fades in over the floor).
// Full in spring through summer, the finest levels shed through autumn, bare in winter, regrown in the
// last seconds before the next spring. The first spring (intro) grows from nothing.
export function seasonDepth(t, intro = true) {
  const u = t % SEASON_CYCLE_S;
  const span = SEASON_DEEP - SEASON_BARE;
  let d = SEASON_DEEP - span * seasonSmooth((u - 16) / 6) + span * seasonSmooth((u - 27) / 3);
  if (intro && t < SEASON_INTRO_S) d *= Math.pow(seasonSmooth(t / SEASON_INTRO_S), 0.9);
  return d;
}

// The sway, radians: a small rotation of the view that picks up through autumn and winter. Continuous in t
// across the loop (its phases run on t, its size on the cycle).
export function seasonSway(t) {
  const u = t % SEASON_CYCLE_S;
  const wind = seasonSmooth((u - 14) / 8) * (1 - seasonSmooth((u - 27) / 3));
  const amp = (SEASON_SWAY_BASE + SEASON_SWAY_WIND * wind) * seasonSmooth(t / 3);
  return amp * (Math.sin(2 * Math.PI * t / 5.3) + 0.45 * Math.sin(2 * Math.PI * t / 2.9 + 1.3));
}

// Everything at t seconds: { rgb, depth, sway, u (seconds into the cycle), season (its name) }.
export function seasonAt(t, intro = true) {
  const u = t % SEASON_CYCLE_S;
  return { rgb: seasonColor(u), depth: seasonDepth(t, intro), sway: seasonSway(t), u, season: seasonName(u) };
}
// The season a point in the cycle belongs to, by where its color is: spring to the first blossom, summer
// from its green, autumn from the first gold, winter from its pale color.
export function seasonName(u) {
  if (u < 12) return "spring";
  if (u < 16) return "summer";
  if (u < 23) return "autumn";
  if (u < 27) return "winter";
  return "spring";
}

// ---------------------------------------------------------------- the falling things

// A cast per kind, each with a fixed place in the order (SEASON_KINDS[].n): the most of that kind at a time.
// The hard cap on particles on screen is SEASON_PARTICLES_MAX, the sum of the casts (the kinds overlap only
// while the last leaves thin out under the first snow). Sizes `r` are in css px, the half-length of a petal or
// leaf and the circumradius of a snowflake: every leaf is bigger than every petal, every petal bigger than every flake.
export const SEASON_PARTICLES = 40;       // the petals' cast (kept for the spec's sake: the old size of every cast)
export const SEASON_LEAVES = 150;         // the leaves' cast: 3.75 times the old 40
export const SEASON_FLAKES = 70;          // the snowflakes' cast: tiny, so more of them than before keeps the snowfall as full
export const SEASON_PARTICLES_MAX = SEASON_PARTICLES + SEASON_LEAVES + SEASON_FLAKES;   // 260
export const seasonHash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
export const seasonCss = ([r, g, b]) => `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
export const LEAF_BASES = [[236, 188, 56], [228, 112, 34], [200, 52, 36], [186, 96, 74], [150, 84, 38], [214, 150, 40]];   // gold, orange, red, rust, brown, amber
// Each base in six shades (a little lighter, darker, warmer), mixed once here: a leaf picks one by number.
export const LEAF_COLORS = LEAF_BASES.flatMap((c, bi) => Array.from({ length: 6 }, (_, j) => {
  const v = 0.78 + 0.4 * seasonHash(bi * 10 + j + 0.5), warm = seasonHash(bi * 10 + j + 0.7) * 24 - 12;
  return seasonCss([c[0] * v + warm * 0.5, c[1] * v, c[2] * v - warm * 0.5].map((x) => Math.max(0, Math.min(255, x))));
}));
// How many of a kind fall u seconds into the cycle, 0 to 1 (blossoms in late spring, leaves through autumn as a
// gust that builds to a peak and thins, snow in winter).
export const SEASON_KINDS = [
  { kind: "petal", seed: 1, n: SEASON_PARTICLES, weight: (u) => seasonSmooth((u - 6) / 2) * (1 - seasonSmooth((u - 10) / 2.5)), r: [3, 6], speed: [34, 60], css: [[250, 188, 208], [244, 156, 188], [255, 214, 226]].map(seasonCss) },
  { kind: "leaf", seed: 2, n: SEASON_LEAVES, weight: (u) => seasonSmooth((u - 15.5) / 4.2) * (1 - seasonSmooth((u - 20.2) / 3.3)), r: [7, 11], speed: [40, 70], css: LEAF_COLORS },
  { kind: "snow", seed: 3, n: SEASON_FLAKES, weight: (u) => seasonSmooth((u - 22.5) / 2.5) * (1 - seasonSmooth((u - 28) / 1.5)), r: [1.4, 2.8], speed: [26, 48], css: ["rgb(255,255,255)"] },
];

// The particles to draw t seconds in, for an overlay w by h (css px): [{ x, y, r, rot, flip, a, kind, color }]
// (`flip`: a leaf's apparent width as it tumbles, 0.12 to 1; `color`: a css color).
// Each one's path is a function of t alone (it falls through the overlay's lower seven eighths and starts again
// at the top, swaying and drifting with the wind), so nothing is stored between frames. The objects and the
// returned array are reused from one call to the next (pass `out` to keep your own), so a frame allocates nothing.
export const pool = [];
export function seasonParticles(t, w, h, out = []) {
  const u = t % SEASON_CYCLE_S;
  let n = 0;
  const top = h * 0.12, span = h * 0.88;
  const rnd = seasonHash;
  for (const K of SEASON_KINDS) {
    const wgt = K.weight(u);
    if (wgt <= 0.01) continue;
    const leaf = K.kind === "leaf", snow = K.kind === "snow";
    for (let i = 0; i < K.n; i++) {
      const id = K.seed * 1000 + i;
      // Particle i is in use once the kind's weight passes i / N, and fades in over the next sliver.
      const on = clamp01((wgt * 1.05 - i / K.n) * K.n / 4);
      if (on <= 0) continue;
      const speed = K.speed[0] + (K.speed[1] - K.speed[0]) * rnd(id + 0.1);
      const phase = rnd(id + 0.2) * span;
      const fall = (phase + speed * t) % span;       // 0 at the top of the fall, span at the bottom
      const f = fall / span;
      const sway = Math.sin(t * (0.7 + rnd(id + 0.3)) + rnd(id + 0.4) * 6.283) * (14 + 22 * rnd(id + 0.5) + (leaf ? 14 : 0));
      const x = rnd(id + 0.6) * w + sway + 10 * f * (u < 23 ? 1 : 2) + (leaf ? 40 * f * rnd(id + 0.55) : 0);
      const edge = Math.min(1, f * 8) * Math.min(1, (1 - f) * 6);   // fades in at the top and out at the bottom
      const spin = (rnd(id + 0.9) - 0.5) * 2;
      const p = pool[n] || (pool[n] = { x: 0, y: 0, r: 0, rot: 0, flip: 1, a: 0, kind: "", color: "" });
      p.x = x; p.y = top + fall;
      p.r = K.r[0] + (K.r[1] - K.r[0]) * rnd(id + 0.7);
      // Leaves turn about a lengthwise axis as they tumble (their width goes through a thin edge-on moment), snow turns slowly.
      p.rot = rnd(id + 0.8) * 6.283 + t * (snow ? 0.35 * spin : leaf ? 0.5 + 1.4 * spin : 0.8 + rnd(id + 0.9));
      p.flip = leaf ? 0.12 + 0.88 * Math.abs(Math.cos(t * (1.1 + 1.6 * rnd(id + 0.35)) + rnd(id + 0.45) * 6.283)) : 1;
      p.a = (snow ? 0.8 : 0.92) * on * edge;
      p.kind = K.kind;
      p.color = K.css[Math.floor(rnd(id + 0.95) * K.css.length)];
      out[n++] = p;
    }
  }
  out.length = n;
  return out;
}

// Draws the list on a Canvas2D context scaled by k (device px per css px).
// The shapes, built once on first use (unit size: a leaf's length is 2 along x, a flake's circumradius 1) and
// reused with a transform per particle, so a frame builds no geometry and makes no gradients.
export let shapes = null;
export function seasonShapes() {
  if (shapes) return shapes;
  // A leaf: a pointed oval a little fuller at the stem end and bent to one side, its midrib, and a short curved stem.
  const leaf = new Path2D();
  leaf.moveTo(-1, 0.02);
  leaf.bezierCurveTo(-0.7, -0.66, 0.25, -0.62, 1, -0.08);
  leaf.bezierCurveTo(0.3, 0.5, -0.65, 0.58, -1, 0.02);
  leaf.closePath();
  const veins = new Path2D();
  veins.moveTo(-1.32, 0.12);                     // the stem
  veins.quadraticCurveTo(-1.12, 0.08, -0.9, 0.02);
  veins.quadraticCurveTo(0, -0.1, 0.9, -0.07);   // the midrib
  // A snowflake: the app's own Koch geometry (koch.js, depth 2: 48 corners, plenty at a few px).
  const flake = new Path2D();
  const v = kochSnowflake(2);
  flake.moveTo(v[0][0], -v[0][1]);
  for (let i = 1; i < v.length; i++) flake.lineTo(v[i][0], -v[i][1]);
  flake.closePath();
  const petal = new Path2D();
  petal.ellipse(0, 0, 1, 0.56, 0, 0, 6.2832);
  shapes = { leaf, veins, flake, petal };
  return shapes;
}

// Draws the list on a Canvas2D context scaled by k (device px per css px). One setTransform per particle (a
// rotation, then a squeeze across for a tumbling leaf) and one or two fills: no save/restore, no gradients.
export function drawSeasonParticles(ctx, list, k) {
  const S = seasonShapes();
  ctx.lineCap = "round";
  ctx.lineWidth = 0.075;   // in a leaf's own units, so the vein is a hairline that grows with the leaf
  ctx.strokeStyle = "rgba(70,30,8,0.55)";
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const s = p.r * k, c = Math.cos(p.rot) * s, d = Math.sin(p.rot) * s, fl = p.flip;
    ctx.setTransform(c, d, -d * fl, c * fl, p.x * k, p.y * k);
    ctx.globalAlpha = p.a;
    ctx.fillStyle = p.color;
    if (p.kind === "leaf") {
      ctx.fill(S.leaf);
      ctx.stroke(S.veins);
    } else {
      ctx.fill(p.kind === "snow" ? S.flake : S.petal);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}
