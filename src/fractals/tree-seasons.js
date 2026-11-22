// Four Seasons, the Pythagoras tree's animated place: the pure part. The cycle's color, depth and sway as
// functions of time, the falling blossoms, leaves and snow as a list of particles, and how a particle is
// drawn. No DOM and no state: tree-seasons-player.js plays it (the tree view draws the color and depth,
// pythagoras.js `season`; the particles go on a canvas of their own above the tree).
// An ES module: every top-level declaration is exported (test-hooks.js relies on it).

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

export const SEASON_PARTICLES = 40;   // the most of one kind at a time (a cast of this many per kind, each with a fixed place in the order)
export const seasonHash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
// How many of a kind fall u seconds into the cycle, 0 to 1 (blossoms in late spring, leaves through autumn, snow in winter).
export const SEASON_KINDS = [
  { kind: "petal", seed: 1, weight: (u) => seasonSmooth((u - 6) / 2) * (1 - seasonSmooth((u - 10) / 2.5)), r: [3, 6], speed: [34, 60], colors: [[250, 188, 208], [244, 156, 188], [255, 214, 226]] },
  { kind: "leaf", seed: 2, weight: (u) => seasonSmooth((u - 16) / 2.5) * (1 - seasonSmooth((u - 22.5) / 1.5)), r: [4, 8], speed: [44, 78], colors: [[236, 188, 56], [228, 112, 34], [200, 52, 36], [186, 96, 74]] },
  { kind: "snow", seed: 3, weight: (u) => seasonSmooth((u - 22.5) / 2.5) * (1 - seasonSmooth((u - 28) / 1.5)), r: [2, 4.5], speed: [28, 52], colors: [[255, 255, 255]] },
];

// The particles to draw t seconds in, for an overlay w by h (css px): [{ x, y, r, rot, a, kind, color }].
// Each one's path is a function of t alone (it falls through the overlay's lower seven eighths and starts again
// at the top, swaying and drifting with the wind), so nothing is stored between frames.
export function seasonParticles(t, w, h) {
  const u = t % SEASON_CYCLE_S;
  const out = [];
  const top = h * 0.12, span = h * 0.88;
  const rnd = seasonHash;
  for (const K of SEASON_KINDS) {
    const wgt = K.weight(u);
    if (wgt <= 0.01) continue;
    for (let i = 0; i < SEASON_PARTICLES; i++) {
      const id = K.seed * 1000 + i;
      // Particle i is in use once the kind's weight passes i / N, and fades in over the next sliver.
      const on = clamp01((wgt * 1.05 - i / SEASON_PARTICLES) * SEASON_PARTICLES / 4);
      if (on <= 0) continue;
      const speed = K.speed[0] + (K.speed[1] - K.speed[0]) * rnd(id + 0.1);
      const phase = rnd(id + 0.2) * span;
      const fall = (phase + speed * t) % span;       // 0 at the top of the fall, span at the bottom
      const f = fall / span;
      const sway = Math.sin(t * (0.7 + rnd(id + 0.3)) + rnd(id + 0.4) * 6.283) * (14 + 22 * rnd(id + 0.5));
      const x = rnd(id + 0.6) * w + sway + 10 * f * (u < 23 ? 1 : 2);
      const edge = Math.min(1, f * 8) * Math.min(1, (1 - f) * 6);   // fades in at the top and out at the bottom
      out.push({
        x, y: top + fall, r: K.r[0] + (K.r[1] - K.r[0]) * rnd(id + 0.7), rot: rnd(id + 0.8) * 6.283 + t * (0.8 + rnd(id + 0.9)) * (K.kind === "snow" ? 0 : 1),
        a: 0.9 * on * edge, kind: K.kind, color: K.colors[Math.floor(rnd(id + 0.95) * K.colors.length)],
      });
    }
  }
  return out;
}

// Draws the list on a Canvas2D context scaled by k (device px per css px).
export function drawSeasonParticles(ctx, list, k) {
  for (const p of list) {
    ctx.save();
    ctx.translate(p.x * k, p.y * k);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.a;
    const r = p.r * k;
    if (p.kind === "snow") {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(235,245,255,0.85)");
      g.addColorStop(1, "rgba(220,235,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 6.2832);
      ctx.fill();
    } else if (p.kind === "petal") {
      ctx.fillStyle = `rgb(${p.color})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.56, 0, 0, 6.2832);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgb(${p.color})`;   // a leaf: a pointed oval
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.quadraticCurveTo(0, -r * 0.7, r, 0);
      ctx.quadraticCurveTo(0, r * 0.7, -r, 0);
      ctx.fill();
    }
    ctx.restore();
  }
}
