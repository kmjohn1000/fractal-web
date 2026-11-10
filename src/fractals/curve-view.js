// The line curves' Canvas2D view: the polyline stroke, the color ramp and pen constants, and createCurveView, the
// one view that draws every LINE_CURVES entry. Split from the old dragon.js (a pure move); the curve definitions
// and the dragon's walk are in dragon.js, the Hilbert, Gosper and arrowhead walk in lcurves.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { SOLID_COLORS, hueTurned, isGreyColor, strokeWidthFor } from "../render/colormaps.js?v=1.80.4";
import { CURVE_FIT_HH, DRAGON_BUDGET, DRAGON_FIT_HH, DRAGON_LITE_PX_MIN, DRAGON_PX_MIN, DRAGON_ZOOM_SLACK, LINE_CURVES, dragonAdaptive } from "./dragon.js?v=1.80.4";
import { curveAdaptive, lcurveSpec } from "./lcurves.js?v=1.80.4";
import { makePenroseRenderer, penroseClampHalfHeight, penroseRebase } from "./penrose.js?v=1.80.4";
import { VECTOR_CULL_MARGIN, paintBackdrop, vectorAffine } from "../render/vectorgeom.js?v=1.80.4";

// Strokes the polyline of n canvas-pixel x, y pairs in buf, with the pen
// state (width, join) already set. Points closer than half a pixel
// to the last one kept are dropped, and a segment with both ends past the
// same canvas edge isn't drawn, so a curve far larger than the canvas
// costs only what shows. The strokes go out in paths of CURVE_GROUP
// segments: a Canvas2D path costs more than its size grows (stroking
// 65,537 dragon points on a phone-sized canvas took 37 ms in one path and
// 17 ms in groups of 256; the other line curves 4-5 times better still).
// Groups meet end to end, so the pen is set to round caps, which join them
// as a round line join would. With colors (an array of css colors, first to
// last along the curve) each group takes the color for its place along the
// curve, and a short curve gets smaller groups, so that there are about
// CURVE_COLOR_STEPS of them; without it the pen's own color is used. A
// point's place is tb[i], 0 to 1 along the whole curve (a view that draws
// only a slice of it shows that slice of the colors); without tb it is the
// point's index over n.
export const CURVE_GROUP = 256;
export const CURVE_COLOR_STEPS = 96;
export function strokeScreenPolyline(ctx, buf, n, width, height, colors, tb) {
  const lo = -VECTOR_CULL_MARGIN, hiX = width + VECTOR_CULL_MARGIN, hiY = height + VECTOR_CULL_MARGIN;
  const group = colors ? Math.min(CURVE_GROUP, Math.max(1, Math.ceil(n / CURVE_COLOR_STEPS))) : CURVE_GROUP;
  let penDown = false, px = 0, py = 0, pcode = 0, inGroup = 0, groupStart = 0, groupEnd = 0;
  // Strokes the group in progress, in the color for the middle of its stretch of the curve.
  const flush = () => {
    if (colors) {
      const t = tb ? (tb[groupStart] + tb[groupEnd]) / 2 : (groupStart + groupEnd) / (2 * n);
      ctx.strokeStyle = colors[Math.max(0, Math.min(colors.length - 1, Math.floor(t * colors.length)))];
    }
    ctx.stroke();
  };
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
        if (inGroup === 0) groupStart = i - 1;
        ctx.lineTo(sx, sy);
        groupEnd = i;
        if (++inGroup === group) {
          flush();
          ctx.beginPath();
          penDown = false; // the next segment starts a path of its own, from the point just reached
          inGroup = 0;
        }
      }
    }
    px = sx; py = sy; pcode = code;
  }
  if (inGroup > 0) flush();
}

// The curves are drawn in color steps along their length: the picked color's
// hue turns CURVE_HUE_SPAN degrees from the start to the end of the curve
// (half either side of the picked color), and it lifts a little toward white
// at the far end, so the path reads as a path and a dense curve shows where
// its two ends are. White has no hue to turn, so it runs from dim to bright
// instead. One css color per step, cached for the last picked color.
export const CURVE_HUE_SPAN = 56;
export const CURVE_LIFT_START = 0.04, CURVE_LIFT_END = 0.2; // share of the way to white
export const CURVE_GREY_DIM_START = 0.62;  // White: brightness at the start of the curve (1 at the end)
export const CURVE_RAMP_STEPS = 128;
export const CURVE_CORE_MIN_PX = 1.1;       // css px
export const CURVE_CORE_ALPHA = 0.95, CURVE_CORE_ALPHA_DENSE = 0.8;
export const CURVE_GLOW_WIDTH = 3.5;        // times the core's width
export const CURVE_GLOW_ALPHA = 0.1;
export const CURVE_GLOW_MIN_SEG = 2.5;      // css px: below this segment length the lines are a mesh the glow would only haze, and stroking it twice costs the most
// The same pen as the numbers above, for penrose.js (which can't import them back without a cycle).
export const CURVE_LOOK = {
  coreMinPx: CURVE_CORE_MIN_PX, coreAlpha: CURVE_CORE_ALPHA, coreAlphaDense: CURVE_CORE_ALPHA_DENSE,
  glowWidth: CURVE_GLOW_WIDTH, glowAlpha: CURVE_GLOW_ALPHA, glowMinSeg: CURVE_GLOW_MIN_SEG,
};
export let curveRampKey = -1, curveRampColors = [];
export function curveRamp(colorIndex) {
  if (colorIndex === curveRampKey) return curveRampColors;
  const base = SOLID_COLORS[colorIndex].rgb, grey = isGreyColor(base);
  curveRampColors = [];
  for (let k = 0; k < CURVE_RAMP_STEPS; k++) {
    const t = k / (CURVE_RAMP_STEPS - 1);
    const lift = CURVE_LIFT_START + (CURVE_LIFT_END - CURVE_LIFT_START) * t;
    const dim = grey ? CURVE_GREY_DIM_START + (1 - CURVE_GREY_DIM_START) * t : 1;
    const [r, g, b] = hueTurned(base, (t - 0.5) * CURVE_HUE_SPAN).map((v) => Math.round(v * dim + (255 - v * dim) * lift));
    curveRampColors.push(`rgb(${r},${g},${b})`);
  }
  curveRampKey = colorIndex;
  return curveRampColors;
}

// Same Canvas2D view shape as createKochView/createPythagorasTreeView, so
// attachVectorViewInteraction in vector-interaction.js works on this unmodified. One view
// serves every LINE_CURVES entry; setCurve switches which one it draws,
// keeping each curve's pan/zoom separately.
export function createCurveView(canvas) {
  const ctx = canvas.getContext("2d");
  // While the Penrose tiling is shown the view also has ox, oy: the exact origin of its center (BigInt, see
  // penrose.js), cx and cy then being the offset from it. The other curves' views have no such fields.
  const view = { cx: -0.35, cy: -0.24, halfHeight: 1.0, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let curve = "dragon";
  const penrose = makePenroseRenderer();
  let penroseBusy = false;
  const savedViews = new Map(); // curve key -> its view while another is shown
  // Canvas-pixel points of the frame being drawn, and each one's place along
  // the curve (0 to 1), which the adaptive walks write.
  const buf = new Float64Array(2 * (DRAGON_BUDGET + 2));
  const tbuf = new Float64Array(DRAGON_BUDGET + 2);
  let extraLevels = 0;

  // view is shared with attachVectorViewInteraction by reference, so it's
  // swapped in place rather than replaced.
  function setCurve(key) {
    if (key === curve) return;
    savedViews.set(curve, { ...view });
    curve = key;
    const saved = savedViews.get(key);
    if (saved) Object.assign(view, saved);
    if (key === "penrose") { view.ox ??= 0n; view.oy ??= 0n; } else { delete view.ox; delete view.oy; }
    penrose.level.snap(); // no cross-fade from the depth a mode was left at
    penroseBusy = false;
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

  // Rotation-aware; matches view-math.js's screenToComplex/centerForAnchor
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
    paintBackdrop(ctx, canvas.width, canvas.height);
    extraLevels = 0;
    penroseBusy = false;
    if (LINE_CURVES[curve].tiling) view.halfHeight = penroseClampHalfHeight(view.halfHeight); // the zoom limits (also set by the gestures)
    const aff = vectorAffine(view, canvas.width, canvas.height);
    if (!aff.ok) return;
    if (LINE_CURVES[curve].tiling) { // the tiling, cut from the viewport by deflation: finer tiles as you zoom in
      const r = penrose.render(ctx, view, aff, {
        depth: opts.depth, fitHalfHeight: opts.fitHalfHeight || 1, colorIndex: opts.colorIndex, ramp: curveRamp(opts.colorIndex),
        dpr, lite: opts.lite, animate: opts.animate, look: CURVE_LOOK,
      });
      extraLevels = Math.max(0, r.top - opts.depth);
      penroseBusy = r.busy;
      return;
    }

    // Built from the viewport each frame, so there's no depth limit to zoom
    // into. refPx: how long a segment may stay at the slider's depth: the
    // length a depth-sized segment has when the curve is fitted to this
    // canvas (the half-height vector-interaction.js's Reset framing uses), with some
    // headroom. It doesn't change as you zoom, so zooming in is what adds
    // levels.
    const fitPx = canvas.height / 2 / (opts.fitHalfHeight || (curve === "dragon" ? DRAGON_FIT_HH : CURVE_FIT_HH));
    const refPx = (curve === "dragon" ? Math.pow(Math.SQRT1_2, opts.depth) : lcurveSpec(curve).stepLength(opts.depth, opts.depth)) * fitPx * DRAGON_ZOOM_SLACK;
    const walk = curve === "dragon" ? dragonAdaptive : (...args) => curveAdaptive(curve, ...args);
    let pxMin = opts.lite ? DRAGON_LITE_PX_MIN : DRAGON_PX_MIN;
    let r = walk(aff, buf, opts.depth, pxMin, refPx, tbuf);
    for (let tries = 0; r.overflow && tries < 12; tries++) {
      pxMin *= 1.5;
      r = walk(aff, buf, opts.depth, pxMin, refPx, tbuf);
    }
    extraLevels = Math.max(0, r.maxLevel - opts.depth);
    const n = r.n;
    // The segments are all about one length, so their mean sets the width.
    const segPx = r.leaves ? r.leafPx / r.leaves : 0;
    // A soft glow (added to the backdrop's light) under a bright core, the
    // color turning along the curve (curveRamp). The core is never thinner
    // than CURVE_CORE_MIN_PX, so the hairlines of a dense Hilbert, Gosper or
    // arrowhead don't vanish; where lines crowd (short segments) it is also a
    // little translucent, so the mesh doesn't blow out to solid. The glow is
    // skipped while a gesture is in progress (opts.lite) and on a dense mesh
    // (CURVE_GLOW_MIN_SEG).
    const colors = curveRamp(opts.colorIndex);
    const core = Math.max(CURVE_CORE_MIN_PX * dpr, strokeWidthFor(segPx, dpr));
    const crowd = Math.min(1, Math.max(0, (segPx / dpr - 2) / 4));
    ctx.lineJoin = "round";
    if (!opts.lite && segPx >= CURVE_GLOW_MIN_SEG * dpr) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = core * CURVE_GLOW_WIDTH;
      ctx.globalAlpha = CURVE_GLOW_ALPHA;
      strokeScreenPolyline(ctx, buf, n, canvas.width, canvas.height, colors, tbuf);
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.lineWidth = core;
    ctx.globalAlpha = CURVE_CORE_ALPHA_DENSE + (CURVE_CORE_ALPHA - CURVE_CORE_ALPHA_DENSE) * crowd;
    strokeScreenPolyline(ctx, buf, n, canvas.width, canvas.height, colors, tbuf);
    ctx.globalAlpha = 1;
  }

  return {
    view, resize, render, worldToScreen, screenToWorld, setCurve,
    get curve() { return curve; },
    get dpr() { return dpr; },
    // The Penrose tiling's renderer (its last frame's edges and stats), the view's zoom limits and the
    // fold of the gestures' offset into the exact origin (vector-interaction.js calls these when set).
    penrose,
    get animating() { return penroseBusy; }, // a level change is still cross-fading: draw another frame
    clampHalfHeight: (h) => (curve === "penrose" ? penroseClampHalfHeight(h) : h),
    rebase: () => { if (curve === "penrose") penroseRebase(view); },
    // Levels the last render added beyond the depth slider because of zoom.
    get extraLevels() { return extraLevels; },
  };
}
