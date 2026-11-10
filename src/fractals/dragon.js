// The line-turtle curves' definitions and the Heighway dragon's walk: dragonCurve, dragonAdaptive, its drawing
// constants, normalizedCurve and LINE_CURVES. Split from the old dragon.js (a pure move), whose Hilbert, Gosper
// and arrowhead walk is now lcurves.js and whose Canvas2D view, stroking and colors are curve-view.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { GOSPER_CURVE, HILBERT_CURVE, DRAGON_CURVE, SIERPINSKI_ARROWHEAD, lsystemPolylines, normalizePolylines } from "./lsystem.js?v=1.80.5";
import { PENROSE_DEFAULT_DEPTH, PENROSE_MAX_DEPTH, PENROSE_MIN_DEPTH, penrosePoints } from "./penrose.js?v=1.80.5";
import { VECTOR_CULL_MARGIN } from "../render/vectorgeom.js?v=1.80.5";

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
export function dragonCurve(depth) {
  return lsystemPolylines(DRAGON_CURVE, depth, { step: Math.pow(Math.SQRT1_2, depth) })[0];
}

export const DRAGON_FIT_HH = 0.6;        // typical half-height of the Reset framing on a wide canvas; render's opts.fitHalfHeight overrides it
export const CURVE_FIT_HH = 1.1;         // the same for the Hilbert, Gosper and arrowhead curves (each fits [-1, 1] plus a margin)
// Canvas px, not CSS px: the dragon's lines overlap in its dense parts, so
// dropping a level there dims it (a depth-16 frame on a 2x phone lost 17% of
// its brightness when the limit was 1 CSS px).
export const DRAGON_PX_MIN = 1;          // canvas px: a chord whose halves would be shorter stays one straight line
export const DRAGON_LITE_PX_MIN = 3;     // canvas px: the pixel limit while a drag or pinch is in progress (opts.lite), about 9x fewer segments at depth 16
export const DRAGON_ZOOM_SLACK = 1.5;    // zoom headroom before a level beyond the slider's depth is added
export const DRAGON_BUDGET = 120000;     // vertices per frame; past it the pixel limit grows by half and the frame is redone
export const DRAGON_MAX_LEVEL = 80;
// The whole dragon between two points lies within this many chord lengths
// of the chord's midpoint (0.897 measured at order 20; rounded up).
export const DRAGON_REACH = 0.92;

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
// Writes canvas-pixel x, y pairs to buf. With tb (a Float64Array, one slot
// per point) it also writes each point's place t along the whole curve, 0 at
// the start to 1 at the end, which is what the colors follow: a chord at
// `level` covers 2^-level of the curve, so a zoomed view that draws only a
// slice of it still shows the right slice of the color ramp. Returns { n,
// leaves, leafPx: summed on-screen leaf length, maxLevel, overflow: the budget
// ran out and buf is incomplete }.
export function dragonAdaptive(aff, buf, depth, pxMin, refPx, tb) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const cap = buf.length / 2 - 2;
  const half = Math.SQRT1_2;
  let n = 0, leaves = 0, leafPx = 0, maxLevel = 0, overflow = false;

  function emit(x, y, t) {
    const dx = x - cx, dy = y - cy;
    buf[2 * n] = hw + a * dx + b * dy;
    buf[2 * n + 1] = hh + c * dx + d * dy;
    if (tb) tb[n] = t;
    n++;
  }

  // t0, span: the stretch of the curve (0 to 1) this chord stands for, in
  // curve order, which is the order the calls (and the points) come in.
  function chord(ax, ay, bx, by, level, len, rev, t0, span) {
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
      const l2 = len * half, s2 = span / 2;
      if (!rev) {
        chord(ax, ay, mcx, mcy, level + 1, l2, false, t0, s2);
        chord(bx, by, mcx, mcy, level + 1, l2, true, t0 + s2, s2);
      } else {
        chord(bx, by, mcx, mcy, level + 1, l2, false, t0, s2);
        chord(ax, ay, mcx, mcy, level + 1, l2, true, t0 + s2, s2);
      }
      return;
    }
    if (!offscreen) {
      leaves++;
      leafPx += px;
      if (level > maxLevel) maxLevel = level;
    }
    if (rev) emit(ax, ay, t0 + span);
    else emit(bx, by, t0 + span);
  }

  emit(0, 0, 0);
  chord(0, 0, Math.cos(depth * Math.PI / 4), Math.sin(depth * Math.PI / 4), 0, 1, false, 0, 1);
  return { n, leaves, leafPx, maxLevel, overflow };
}

// The newer curves don't need hand-tuned scaling: normalizePolylines fits
// each depth into [-1, 1]. All three are single connected paths.
export function normalizedCurve(def, depth, turtleOpts) {
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
// The three newer curves are also drawn from the viewport by curveAdaptive,
// from the same definition: def (the L-system), startHeading(depth) (in steps
// of def's angle, what points() starts at), split (how much smaller a node's
// children are, so the pixel limit means the same for each) and frame (how
// levels past the slider's depth sit in the depth's picture, see
// makeLCurveSpec). points() stays the reference the walk is held to, and is
// what the Reset framing measures.
export const LINE_CURVES = {
  dragon: { maxDepth: 16, defaultDepth: 13, points: dragonCurve },
  hilbert: {
    minDepth: 1, maxDepth: 8, defaultDepth: 5,
    points: (depth) => normalizedCurve(HILBERT_CURVE, depth),
    def: HILBERT_CURVE, startHeading: () => 0, split: 2, frame: "square",
  },
  gosper: {
    maxDepth: 6, defaultDepth: 4,
    points: (depth) => normalizedCurve(GOSPER_CURVE, depth),
    def: GOSPER_CURVE, startHeading: () => 0, split: Math.sqrt(7), frame: "chord",
  },
  // The arrowhead's triangle points down at odd depths when started
  // heading +x; starting odd depths at 60 degrees keeps it pointing up.
  arrowhead: {
    maxDepth: 11, defaultDepth: 7,
    points: (depth) => normalizedCurve(SIERPINSKI_ARROWHEAD, depth, { startHeadingDeg: depth % 2 ? 60 : 0 }),
    def: SIERPINSKI_ARROWHEAD, startHeading: (depth) => depth % 2, split: 2, frame: "chord",
  },
  // The Penrose tiling is a patch of rhombs, not a path: penrose.js cuts it from the viewport by
  // deflation and draws the edges (tiling: true; no def/frame, so curveAdaptive and lcurveSpec never
  // see it). points() is the extent of the picture, for the Reset framing.
  penrose: {
    tiling: true, minDepth: PENROSE_MIN_DEPTH, maxDepth: PENROSE_MAX_DEPTH, defaultDepth: PENROSE_DEFAULT_DEPTH,
    points: penrosePoints,
  },
};
