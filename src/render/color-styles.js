// The color styles (Smooth, Bands, Edge glow, Stripes, Orbs, Rays, Relief, Halo, Paper cut): the style table, the shared
// colorStyle choice, the orbit traps' center and range, and what a view actually draws. Imports only
// configs.js (FTYPE), so renderer.js, state.js and the rest can all depend on it. Split from state.js
// (a pure move); colorStyle is assigned only by setColorStyle in state-colors.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { FTYPE } from "../core/configs.js?v=1.80.2";

// How an escape-time pixel picks its colormap coordinate (see
// COLOR_STYLE_GLSL in shaders.js). Like the colormap, the style is global:
// one choice for every fractal that can draw it, kept across fractal
// switches. `bands` and `shift` apply to every style as
// lutColor(t * bands + shift); Smooth at bands 1 and shift 0 is exactly
// today's coloring. `glsl` is the style's number in the shaders, `variant`
// which compiled version of the escape-time program draws it (COLOR_VARIANT
// in FRAG_SRC: 0 needs no per-iteration work), `types` the fractal types it
// works on (the escape-time types when left out).
// Magnet I and II join the list for Smooth and Bands only (like Phoenix): the styles with `types`
// stay off for them. Their orbits end at the fixed point 1 or escape, which gives the derivative
// and the stripe and trap averages nothing to show (see renderMagnet in shaders.js).
// The sine family (SINE, SINEPLANE) draws Smooth, Bands, Stripes, Orbs and Rays: the four styles lit from the
// derivative (Edge glow, Relief, Halo, Paper cut) stay off for it. Their distance estimate and gradient shading
// assume a polynomial's escape rate (|z| grows like a power, the potential is ln|z| / P^n), which an entire function
// like sin z does not have, and Halo and Paper cut lean on the same assumptions, so they would draw something
// plausible but wrong. Their `types` lists simply do not name the sine types.
export const SINE_TYPES = [FTYPE.SINE, FTYPE.SINEPLANE];
export const ESCAPE_TIME_TYPES = [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC, FTYPE.PHOENIX, FTYPE.SPIDER, FTYPE.MAGNET, ...SINE_TYPES];
export const COLOR_STYLES = [
  { id: "smooth", glsl: 0, variant: 0, label: "Smooth" },
  { id: "bands", glsl: 1, variant: 0, label: "Bands" },
  // Phoenix is left out of the styles that track state per iteration: its
  // two-term recurrence has no derivative worked out, and its deep path is a
  // separate fixed-point shader.
  { id: "glow", glsl: 2, variant: 1, label: "Edge glow", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
  { id: "stripes", glsl: 3, variant: 2, label: "Stripes", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC, FTYPE.SPIDER, ...SINE_TYPES] },
  // Orbit traps color by how close the orbit came to a point or a cross. In a
  // deep view every pixel's orbit looks alike, so the distances fall in a
  // narrow band; the renderer stretches the colormap over the view's real
  // range (trapRange in createFractalRenderer), so they work at any depth.
  // (A style can still be limited with `maxZoom`: past that many times deep
  // it isn't offered and the view draws Smooth. The traps were limited to
  // 1,000 before the auto-range.)
  // Display names are plain words and the same everywhere (tile, segment,
  // note, info card): Orbs is the point trap and Rays the cross trap. The ids
  // (and the share-link codes below) never change.
  { id: "point", glsl: 4, variant: 3, label: "Orbs", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC, FTYPE.SPIDER, ...SINE_TYPES] },
  { id: "cross", glsl: 5, variant: 3, label: "Rays", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC, FTYPE.SPIDER, ...SINE_TYPES] },
  // Relief is lit from the distance estimate's derivative, so it shares Edge
  // glow's compiled program (variant 1) and its limits.
  { id: "relief", glsl: 6, variant: 1, label: "Relief", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
  // Halo (Relief outside, the inside of the set glowing from D) and Paper cut
  // (flat layers with shadows from the gradient of the iteration count) are
  // lit from the same derivative, so they share Relief's compiled program.
  // Halo is left off the Burning Ship and the Celtic: a large part of their
  // non-escaping region has D saturated (it never settles), so the glow there
  // draws as a flat white mass instead of a gradient. On the Mandelbrot
  // family, a Julia set's basins are lit by their own formula (haloCross in
  // shaders.js).
  { id: "halo", glsl: 7, variant: 1, label: "Halo", types: [FTYPE.ESCAPE, FTYPE.TRICORN] },
  { id: "paper", glsl: 8, variant: 1, label: "Paper cut", types: [FTYPE.ESCAPE, FTYPE.SHIP, FTYPE.TRICORN, FTYPE.CELTIC] },
];
export const COLOR_BANDS_RANGE = [0.25, 8];
// A style's id in share links (st=); "c" is taken by the vector modes' solid
// color, so the three fields are st (style), cd (bands) and co (shift).
export const STYLE_LINK_CODES = new Map([["smooth", "sm"], ["bands", "bd"], ["glow", "de"], ["stripes", "sp"], ["point", "pt"], ["cross", "xt"], ["relief", "rl"], ["halo", "ha"], ["paper", "pc"]]);
// trap: an [x, y] override of the orbit traps' center (the checks use it to
// match the oracle); null for the per-fractal default, see trapCenterFor.
export const colorStyle = { style: "smooth", density: 1, offset: 0, trap: null };
export const TRAP_CENTERS = new Map([[FTYPE.ESCAPE, [-0.5, 0]], [FTYPE.SHIP, [-1.75, -0.03]], [FTYPE.TRICORN, [0, 0]], [FTYPE.CELTIC, [-0.5, 0]]]);
export function trapCenterFor(state) {
  if (colorStyle.trap) return colorStyle.trap;
  if (state.isJulia || (state.ftype === FTYPE.ESCAPE && state.power > 2.5)) return [0, 0];
  return TRAP_CENTERS.get(state.ftype) || [0, 0];
}

// The orbit traps' range from a probe's RGBA bytes (see probeTrapRange in the
// renderer): red and green are the distance's log in 16 bits over
// ln(1e-12) .. ln(1e2) (the same constants as trapColor in shaders.js), blue is
// the escaped flag. The range is the 2nd-98th percentile of the escaped
// pixels' distances, or of every pixel when almost none escaped (a view inside
// the set, where the traps color the interior). null when it can't be told.
export const TRAP_LN_LO = -27.6310211, TRAP_LN_SPAN = 32.2361913;
export function decodeTrapRange(px) {
  const all = [], escaped = [];
  for (let i = 0; i + 3 < px.length; i += 4) {
    const d = Math.exp(TRAP_LN_LO + ((px[i] * 256 + px[i + 1]) / 65535) * TRAP_LN_SPAN);
    all.push(d);
    if (px[i + 2] > 127) escaped.push(d);
  }
  const pool = escaped.length >= Math.max(24, all.length * 0.08) ? escaped : all;
  if (pool.length < 8) return null;
  pool.sort((a, b) => a - b);
  const lo = pool[Math.floor(0.02 * (pool.length - 1))];
  let hi = pool[Math.ceil(0.98 * (pool.length - 1))];
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (!(hi > lo)) hi = lo * 1.01 + 1e-9; // a flat view: any range will do
  return { lo, hi };
}

// The range the traps use. A shallow view has its far field in the
// percentile (orbits that escape far from the trap), and stretching over it
// paled everything near the set, so the fixed range (0..1 Point, 0..0.2
// Cross) stays in force while the probe's range is as wide as it is; as the
// probe's range narrows to half of it or less (a deep view, whose distances
// sit in a narrow band) the colormap moves smoothly onto the probe's range,
// so there's no jump while zooming. fixed = { lo, hi }.
export function trapRangeFor(px, fixed) {
  const r = decodeTrapRange(px);
  if (!r) return fixed;
  if (r.lo >= fixed.hi) return r; // everything lies beyond the fixed range
  const w = Math.min(1, Math.max(0, (fixed.hi - r.hi) / (0.5 * (fixed.hi - fixed.lo))));
  const lo = fixed.lo + w * (r.lo - fixed.lo);
  const hi = fixed.hi + w * (r.hi - fixed.hi);
  return { lo, hi: hi > lo ? hi : lo * 1.01 + 1e-9 };
}

// The style a view actually draws: the chosen one if its fractal can do it,
// otherwise Smooth. Newton, Carpet, Gasket and Apollonian color by their own
// schemes (the shaders never read the style).
export function styleDrawn(id, state) {
  const s = COLOR_STYLES.find((c) => c.id === id);
  return s && !styleBlocked(s, state) ? s.id : "smooth";
}

// Why a style can't be drawn for this view: "type" (its fractal can't do it)
// or "depth" (too deep for the orbit traps), else null. The small allowance
// keeps a view set to exactly maxZoom on the right side of rounding.
export function styleBlocked(style, state) {
  if (!(style.types || ESCAPE_TIME_TYPES).includes(state.ftype)) return "type";
  if (style.maxZoom && !(state.baseScale / state.scale <= style.maxZoom * 1.001)) return "depth";
  return null;
}

// What the renderer sends the shaders for one view.
export function colorStyleFor(state) {
  const s = COLOR_STYLES.find((c) => c.id === styleDrawn(colorStyle.style, state));
  return { glsl: s.glsl, variant: s.variant, density: colorStyle.density, offset: colorStyle.offset,
    trap: s.variant === 3 ? trapCenterFor(state) : [0, 0] };
}
