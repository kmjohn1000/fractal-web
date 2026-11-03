// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { PENROSE_TILING } from "./lsystem.js?v=1.56.0";
import { VECTOR_CULL_MARGIN } from "./vectorgeom.js?v=1.56.0";
import { strokeWidthFor } from "./colormaps.js?v=1.56.0";

// The Penrose tiling (P3, thick and thin rhombs) as an L-system: lsystem.js's
// PENROSE_TILING. Unlike the line curves it needs brackets, four letters that
// draw nothing (M, N, O, P) and F -> nothing, so its string is never walked as
// one polyline. The picture is a patch of the tiling that grows with the depth
// (every unit step is a rhomb edge; a deeper level adds a ring of tiles around
// the old ones rather than finer detail), so the tiles shrink only because
// the patch is fitted to the canvas.
//
// The plain expansion draws each rhomb edge many times over (7,920 steps at
// depth 5 for 1,065 distinct edges; 156,800 at depth 7 for 7,314), because
// neighbouring pieces of the string each draw the edges they share. The
// geometry here walks the same L-system one level at a time and keeps each
// piece (letter, place, heading) once, so it costs what the picture holds:
// the edges it returns are exactly the distinct edges the string draws
// (checked against the plain expansion by tests/visual/penrose.spec.mjs).

export const PENROSE_MIN_DEPTH = 1;     // depth 0 is only the axiom, which draws nothing
export const PENROSE_MAX_DEPTH = 9;     // 49,670 distinct edges, built in about 0.2 s on a laptop; depth 10 is 130,725 and takes about 1 s
export const PENROSE_DEFAULT_DEPTH = 5;   // the picture the mode was approved from: 995 distinct edges
export const PENROSE_COLOR_BINS = 96;
export const PENROSE_HEADINGS = 10;     // the turn is 36 degrees, so ten headings

// The letters and rules of a definition as the walk wants them, and for each
// depth r (levels still to expand) what a letter comes to: where it leaves the
// turtle (dx, dy in its own frame, heading 0; turn in headings) and how many
// steps it draws. A letter with count 0 at some r draws nothing and is skipped.
export const PUSH = -4, POP = -5, LEFT = -2, RIGHT = -3;
export function makePenroseSpec(def = PENROSE_TILING) {
  const names = [...new Set([...Object.keys(def.rules), ...def.drawSymbols])];
  const nv = names.length;
  const vi = Object.fromEntries(names.map((s, i) => [s, i]));
  const nh = Math.round(360 / def.angleDeg);
  const ux = new Float64Array(nh), uy = new Float64Array(nh);
  for (let i = 0; i < nh; i++) {
    const cs = Math.cos((2 * Math.PI * i) / nh), sn = Math.sin((2 * Math.PI * i) / nh);
    ux[i] = Math.abs(cs) < 1e-15 ? 0 : cs;
    uy[i] = Math.abs(sn) < 1e-15 ? 0 : sn;
  }
  const parse = (str) => {
    const list = [];
    for (const ch of str) {
      if (Object.prototype.hasOwnProperty.call(vi, ch)) list.push(vi[ch]);
      else if (ch === "+") list.push(LEFT);
      else if (ch === "-") list.push(RIGHT);
      else if (ch === "[") list.push(PUSH);
      else if (ch === "]") list.push(POP);
    }
    return list;
  };
  const ops = names.map((name) => parse(def.rules[name] ?? ""));
  const axiomOps = parse(def.axiom);
  const isDraw = names.map((name) => def.drawSymbols.includes(name));
  const rows = [];

  // Runs a list of ops from a heading and place, calling onLetter(letter, x, y, heading) for each
  // letter and moving on by what that letter comes to at depth r.
  function run(list, r, x0, y0, h0, onLetter) {
    const prev = rows[r];
    let x = x0, y = y0, hd = h0;
    const stack = [];
    for (const op of list) {
      if (op >= 0) {
        if (onLetter) onLetter(op, x, y, hd);
        x += prev.dx[op] * ux[hd] - prev.dy[op] * uy[hd];
        y += prev.dx[op] * uy[hd] + prev.dy[op] * ux[hd];
        hd = (hd + prev.turn[op]) % nh;
      } else if (op === LEFT) hd = (hd + 1) % nh;
      else if (op === RIGHT) hd = (hd + nh - 1) % nh;
      else if (op === PUSH) stack.push(x, y, hd);
      else { hd = stack.pop(); y = stack.pop(); x = stack.pop(); }
    }
    return { x, y, hd };
  }
  function buildRow(r) {
    const row = { dx: new Float64Array(nv), dy: new Float64Array(nv), turn: new Int32Array(nv), count: new Float64Array(nv) };
    if (r === 0) {
      for (let v = 0; v < nv; v++) if (isDraw[v]) { row.dx[v] = 1; row.count[v] = 1; }
      return row;
    }
    for (let v = 0; v < nv; v++) {
      let count = 0;
      const end = run(ops[v], r - 1, 0, 0, 0, (c) => { count += rows[r - 1].count[c]; });
      row.dx[v] = end.x; row.dy[v] = end.y; row.turn[v] = end.hd; row.count[v] = count;
    }
    return row;
  }
  function ensure(r) {
    while (rows.length <= r) rows.push(buildRow(rows.length));
  }
  return { def, names, nv, nh, ux, uy, ops, axiomOps, isDraw, rows, ensure, run };
}

export const penroseSpec = makePenroseSpec();

// Steps the plain string would draw at this depth (duplicates included): 1,780 at 4, 7,920 at 5.
export function penroseStepCount(depth) {
  penroseSpec.ensure(depth);
  let total = 0;
  penroseSpec.run(penroseSpec.axiomOps, depth, 0, 0, 0, (c) => { total += penroseSpec.rows[depth].count[c]; });
  return total;
}

// Each distinct (letter, place, heading) once. Positions are rounded to 1/1024 of a step, which
// is far below the float error of any depth that matters (positions stay under about 1000).
export const PENROSE_KEY_OFFSET = 1 << 21;
export const PENROSE_KEY_WIDTH = 1 << 22;
export function penroseNodeKey(x, y, hd, v, nh, nv) {
  return (((Math.round(x * 1024) + PENROSE_KEY_OFFSET) * PENROSE_KEY_WIDTH + (Math.round(y * 1024) + PENROSE_KEY_OFFSET)) * nh + hd) * nv + v;
}

// The distinct edges of the tiling at a depth, as { n, x, y, h } with the steps' start (x, y) and
// heading h (0-4, in 36 degrees: the other five headings are these backwards, so every edge starts
// at its end that heads 0-144 degrees), unit length, in tile units around the star's center.
export function penroseEdges(depth, spec = penroseSpec) {
  const { nh, nv, ux, uy, ops, axiomOps, rows } = spec;
  spec.ensure(depth);
  let level = new Map(), list = [];
  const add = (r, v, x, y, hd) => {
    if (rows[r].count[v] === 0) return;
    const key = penroseNodeKey(x, y, hd, v, nh, nv);
    if (level.has(key)) return;
    level.set(key, true);
    list.push(v, x, y, hd);
  };
  spec.run(axiomOps, depth, 0, 0, 0, (v, x, y, hd) => add(depth, v, x, y, hd));
  for (let r = depth; r >= 1; r--) {
    const nextLevel = new Map(), nextList = [];
    const cur = list;
    level = nextLevel; list = nextList;
    for (let i = 0; i < cur.length; i += 4) {
      spec.run(ops[cur[i]], r - 1, cur[i + 1], cur[i + 2], cur[i + 3], (c, x, y, hd) => add(r - 1, c, x, y, hd));
    }
  }
  // list now holds the steps (level 0: only letters that draw are kept), each once per direction.
  const seen = new Set(), xs = [], ys = [], hs = [];
  for (let i = 0; i < list.length; i += 4) {
    let x = list[i + 1], y = list[i + 2], hd = list[i + 3];
    if (hd >= nh / 2) { x += ux[hd]; y += uy[hd]; hd -= nh / 2; }
    const key = penroseNodeKey(x, y, hd, 0, nh, nv);
    if (seen.has(key)) continue;
    seen.add(key);
    xs.push(x); ys.push(y); hs.push(hd);
  }
  return { n: xs.length, x: Float64Array.from(xs), y: Float64Array.from(ys), h: Uint8Array.from(hs) };
}

export const penroseGeometries = new Map();
// The edges of a depth with their frame (the bounding box centered on the origin, its longer side
// spanning [-1, 1], like normalizePolylines) and the edges sorted into PENROSE_COLOR_BINS color bins.
export function penroseGeometry(depth) {
  let g = penroseGeometries.get(depth);
  if (g) return g;
  const e = penroseEdges(depth);
  const { ux, uy } = penroseSpec;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < e.n; i++) {
    const ex = e.x[i] + ux[e.h[i]], ey = e.y[i] + uy[e.h[i]];
    x0 = Math.min(x0, e.x[i], ex); x1 = Math.max(x1, e.x[i], ex);
    y0 = Math.min(y0, e.y[i], ey); y1 = Math.max(y1, e.y[i], ey);
  }
  const ox = (x0 + x1) / 2, oy = (y0 + y1) / 2, kk = 2 / Math.max(x1 - x0, y1 - y0, 1e-12);
  // The color of an edge follows its distance from the star's center (see penroseColorPlace).
  const bin = new Uint8Array(e.n), counts = new Int32Array(PENROSE_COLOR_BINS + 1);
  let reach = 1e-12;
  for (let i = 0; i < e.n; i++) reach = Math.max(reach, Math.hypot(e.x[i], e.y[i]));
  for (let i = 0; i < e.n; i++) {
    const t = penroseColorPlace(e.x[i] + ux[e.h[i]] / 2, e.y[i] + uy[e.h[i]] / 2, reach);
    bin[i] = Math.min(PENROSE_COLOR_BINS - 1, Math.max(0, Math.floor(t * PENROSE_COLOR_BINS)));
    counts[bin[i] + 1]++;
  }
  for (let b = 0; b < PENROSE_COLOR_BINS; b++) counts[b + 1] += counts[b];
  const start = counts.slice(), fill = counts.slice(0, PENROSE_COLOR_BINS);
  const sx = new Float64Array(e.n), sy = new Float64Array(e.n), sh = new Uint8Array(e.n);
  for (let i = 0; i < e.n; i++) {
    const j = fill[bin[i]]++;
    sx[j] = (e.x[i] - ox) * kk; sy[j] = (e.y[i] - oy) * kk; sh[j] = e.h[i];
  }
  g = { depth, n: e.n, x: sx, y: sy, h: sh, binStart: start, kk, ox, oy, step: kk, bounds: [x0, x1, y0, y1] };
  penroseGeometries.set(depth, g);
  return g;
}

// Where an edge sits for the color, 0 (the star's center) to 1 (the farthest edge). The ramp is
// the line curves' (the picked color's hue turning along it), so the center and the newest ring
// differ and the patch reads as grown outward. Tried and dropped, by eye: by the angle around the
// center (a hard seam where the angle wraps) and by the edge's direction (five near-identical colors).
export function penroseColorPlace(x, y, reach) {
  return Math.min(1, Math.hypot(x, y) / reach);
}

// The points that give the picture its extent, in the normalized frame the view uses (two opposite
// corners and the extreme points around the center), for the framing Reset gives.
export function penrosePoints(depth) {
  const g = penroseGeometry(depth), { ux, uy } = penroseSpec;
  const best = new Map();
  const pts = [];
  for (let i = 0; i < g.n; i++) {
    for (const end of [0, 1]) {
      const x = g.x[i] + (end ? ux[g.h[i]] * g.kk : 0), y = g.y[i] + (end ? uy[g.h[i]] * g.kk : 0);
      const sector = Math.floor(((Math.atan2(y, x) / Math.PI + 1) / 2) * 72) % 72, r = x * x + y * y;
      const b = best.get(sector);
      if (!b || r > b.r) best.set(sector, { r, x, y });
    }
  }
  for (const b of best.values()) pts.push([b.x, b.y]);
  pts.push([-1, -1], [1, 1]);
  return pts;
}

export let penroseScratch = new Float64Array(0); // the screen ends of a frame's edges, reused between frames

// Draws the tiling for a view. aff is vectorAffine's map; opts has depth, colors (css colors from the
// start to the end of the ramp), dpr, lite (a gesture is in progress: no glow) and look, the pen the
// line curves share (dragon.js's CURVE_* numbers: coreMinPx, coreAlpha, coreAlphaDense, glowWidth,
// glowAlpha, glowMinSeg). Edges wholly past one side of the canvas are skipped, so a zoomed view
// pays only for what shows. Returns { n } (edges drawn) and segPx (an edge's length in canvas px).
export function drawPenrose(ctx, aff, opts) {
  const g = penroseGeometry(opts.depth), { ux, uy } = penroseSpec;
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const dpr = opts.dpr || 1, colors = opts.colors, look = opts.look;
  const segPx = g.step * k;
  const core = Math.max(look.coreMinPx * dpr, strokeWidthFor(segPx, dpr));
  const crowd = Math.min(1, Math.max(0, (segPx / dpr - 2) / 4));
  const lo = -VECTOR_CULL_MARGIN, hiX = w + VECTOR_CULL_MARGIN, hiY = h + VECTOR_CULL_MARGIN;
  // Screen ends of every edge that shows, kept in bin order so that one color is one path.
  if (penroseScratch.length < 4 * g.n) penroseScratch = new Float64Array(4 * g.n);
  const sxy = penroseScratch, binEnd = new Int32Array(PENROSE_COLOR_BINS);
  let n = 0;
  for (let bn = 0; bn < PENROSE_COLOR_BINS; bn++) {
    for (let i = g.binStart[bn]; i < g.binStart[bn + 1]; i++) {
      const wx0 = g.x[i] - cx, wy0 = g.y[i] - cy, wx1 = wx0 + ux[g.h[i]] * g.kk, wy1 = wy0 + uy[g.h[i]] * g.kk;
      const x0 = hw + a * wx0 + b * wy0, y0 = hh + c * wx0 + d * wy0;
      const x1 = hw + a * wx1 + b * wy1, y1 = hh + c * wx1 + d * wy1;
      if ((x0 < lo && x1 < lo) || (x0 > hiX && x1 > hiX) || (y0 < lo && y1 < lo) || (y0 > hiY && y1 > hiY)) continue;
      sxy[4 * n] = x0; sxy[4 * n + 1] = y0; sxy[4 * n + 2] = x1; sxy[4 * n + 3] = y1;
      n++;
    }
    binEnd[bn] = n;
  }
  const strokeAll = () => {
    let from = 0;
    for (let bn = 0; bn < PENROSE_COLOR_BINS; bn++) {
      if (binEnd[bn] === from) continue;
      ctx.strokeStyle = colors[Math.min(colors.length - 1, Math.floor(((bn + 0.5) / PENROSE_COLOR_BINS) * colors.length))];
      ctx.beginPath();
      for (let i = from; i < binEnd[bn]; i++) {
        ctx.moveTo(sxy[4 * i], sxy[4 * i + 1]);
        ctx.lineTo(sxy[4 * i + 2], sxy[4 * i + 3]);
      }
      ctx.stroke();
      from = binEnd[bn];
    }
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (!opts.lite && segPx >= look.glowMinSeg * dpr) {
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = core * look.glowWidth;
    ctx.globalAlpha = look.glowAlpha;
    strokeAll();
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.lineWidth = core;
  ctx.globalAlpha = look.coreAlphaDense + (look.coreAlpha - look.coreAlphaDense) * crowd;
  strokeAll();
  ctx.globalAlpha = 1;
  return { n, segPx };
}
