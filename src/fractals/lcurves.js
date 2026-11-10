// The Hilbert, Gosper and Sierpinski arrowhead curves drawn from the viewport: the per-curve tables built from
// their L-system rules and the walk that expands only the nodes the view can see. Split from the old dragon.js
// (a pure move); the curve definitions (LINE_CURVES) and the dragon's own walk are in dragon.js, the Canvas2D
// view in curve-view.js.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { LINE_CURVES } from "./dragon.js?v=1.80.5";
import { VECTOR_CULL_MARGIN } from "../render/vectorgeom.js?v=1.80.5";

// ---------------------------------------------------------------- Hilbert, Gosper and the arrowhead from the viewport

// These three are drawn from their L-system the way the dragon is drawn from
// its two maps: a node is a variable (A or B) with r levels still to expand,
// and the walk only expands the nodes the view can see, to about a pixel.
// Everything it needs about a node comes from tables built once per curve
// from the same rules lsystem.js expands, for each variable v and level r, in
// the node's own frame (unit steps, heading 0, start at the origin):
//   - disp: where the node's drawing ends; turn: how far it has turned (in
//     heading steps) by then; count: how many segments it draws;
//   - a circle that holds every vertex it draws (rotation-invariant, so one
//     table serves every heading), for culling and for the pixel limit.
// A node that isn't expanded (off screen, or too small to show detail) is
// drawn as the one chord from where it starts to where it ends, so the
// vertices that join one node to the next are always the exact ones; a node
// that is expanded draws what its rule says, the terminal F (or, at level 0,
// the variable itself for Gosper and the arrowhead) as one step.
// With no pixel limit and no extra levels every node is expanded to level 0 and
// the points are LINE_CURVES[curve].points(depth)'s, in order.
//
// The frame maps node space to the world: the depth-d curve is fitted into
// [-1, 1] by its bounding box (normalizePolylines), which the bounding-box
// tables give in closed form. Past the slider's depth the walk draws level
// D > d of the same curve inside that frame, so zoom shows finer structure of
// the same picture:
//   - Gosper and the arrowhead keep the curve's two ends where they were (a
//     similarity from the level-D chord to the level-d one); their level-d
//     vertices are all vertices of level D (checked by the tests), so the
//     picture doesn't move when a level is added;
//   - Hilbert's centers-of-cells polyline isn't nested, so it keeps the square
//     of cells instead (step halves per level, bounding-box center fixed);
//     a level added moves the polyline by at most a quarter of a cell's
//     diagonal (0.354 of a step).
// Precision: positions are float64 world coordinates summed from the node
// starts (error about 1e-16 of the curve's size per step, at most CURVE_MAX_EXTRA
// levels deep), the walk stops adding levels when one step would be shorter than
// CURVE_ZMIN, 2^-40 of the curve (about 1e-12), and views zoomed in that far are
// exact to a pixel; deeper zoom keeps drawing that level.
export const CURVE_ZMIN = Math.pow(2, -40);
export const CURVE_MAX_EXTRA = 60;

export const lcurveSpecs = new Map();
export function lcurveSpec(key) {
  let spec = lcurveSpecs.get(key);
  if (!spec) {
    spec = makeLCurveSpec(LINE_CURVES[key]);
    lcurveSpecs.set(key, spec);
  }
  return spec;
}

// The smallest circle (about: a few rounds of nudging toward the farthest one)
// holding the circles in c, flat x, y, radius triples.
export function enclosingCircle(c) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < c.length; i += 3) {
    x0 = Math.min(x0, c[i] - c[i + 2]); x1 = Math.max(x1, c[i] + c[i + 2]);
    y0 = Math.min(y0, c[i + 1] - c[i + 2]); y1 = Math.max(y1, c[i + 1] + c[i + 2]);
  }
  let x = (x0 + x1) / 2, y = (y0 + y1) / 2, best = null;
  for (let it = 1; it <= 80; it++) {
    let far = 0, farD = -1;
    for (let i = 0; i < c.length; i += 3) {
      const dd = Math.hypot(c[i] - x, c[i + 1] - y) + c[i + 2];
      if (dd > farD) { farD = dd; far = i; }
    }
    if (!best || farD < best.rho) best = { x, y, rho: farD };
    x += (c[far] - x) / (it + 1);
    y += (c[far + 1] - y) / (it + 1);
  }
  return best;
}

export function makeLCurveSpec(curve) {
  const def = curve.def;
  const names = Object.keys(def.rules);
  const nv = names.length;
  const vi = Object.fromEntries(names.map((s, i) => [s, i]));
  const nh = Math.round(360 / def.angleDeg);
  const ux = new Float64Array(nh), uy = new Float64Array(nh);
  for (let i = 0; i < nh; i++) {
    const cs = Math.cos(2 * Math.PI * i / nh), sn = Math.sin(2 * Math.PI * i / nh);
    ux[i] = Math.abs(cs) < 1e-15 ? 0 : cs;
    uy[i] = Math.abs(sn) < 1e-15 ? 0 : sn;
  }
  // Each rule as ops: a variable's index (>= 0), DRAW, LEFT, RIGHT.
  const DRAW = -1, LEFT = -2, RIGHT = -3;
  const ops = names.map((name) => {
    const list = [];
    for (const ch of def.rules[name]) {
      if (Object.prototype.hasOwnProperty.call(vi, ch)) list.push(vi[ch]);
      else if (def.drawSymbols.includes(ch)) list.push(DRAW);
      else if (ch === "+") list.push(LEFT);
      else if (ch === "-") list.push(RIGHT);
    }
    return list;
  });
  const isDraw = names.map((name) => def.drawSymbols.includes(name));
  const root = vi[def.axiom];
  const rows = [];

  function buildRow(r) {
    const row = {
      dx: new Float64Array(nv), dy: new Float64Array(nv), turn: new Int32Array(nv), count: new Float64Array(nv),
      cx: new Float64Array(nv), cy: new Float64Array(nv), rho: new Float64Array(nv),
    };
    if (r === 0) {
      for (let v = 0; v < nv; v++) {
        if (isDraw[v]) { row.dx[v] = 1; row.count[v] = 1; row.cx[v] = 0.5; row.rho[v] = 0.5; }
      }
      return row;
    }
    const prev = rows[r - 1];
    for (let v = 0; v < nv; v++) {
      const circles = [0, 0, 0];
      let x = 0, y = 0, hd = 0, count = 0;
      for (const op of ops[v]) {
        if (op >= 0) {
          circles.push(x + prev.cx[op] * ux[hd] - prev.cy[op] * uy[hd], y + prev.cx[op] * uy[hd] + prev.cy[op] * ux[hd], prev.rho[op]);
          x += prev.dx[op] * ux[hd] - prev.dy[op] * uy[hd];
          y += prev.dx[op] * uy[hd] + prev.dy[op] * ux[hd];
          hd = (hd + prev.turn[op]) % nh;
          count += prev.count[op];
          circles.push(x, y, 0);
        } else if (op === DRAW) {
          x += ux[hd]; y += uy[hd]; count++;
          circles.push(x, y, 0);
        } else if (op === LEFT) hd = (hd + 1) % nh;
        else hd = (hd + nh - 1) % nh;
      }
      const e = enclosingCircle(circles);
      row.dx[v] = x; row.dy[v] = y; row.turn[v] = hd; row.count[v] = count;
      row.cx[v] = e.x; row.cy[v] = e.y; row.rho[v] = e.rho;
    }
    return row;
  }
  function ensure(r) {
    while (rows.length <= r) rows.push(buildRow(rows.length));
  }

  // The bounding box [x0, y0, x1, y1] of every vertex node v draws with r
  // levels to go, from the origin, started at heading step h.
  const boxes = new Map();
  function box(v, r, h) {
    const key = (r * nv + v) * nh + h;
    let bb = boxes.get(key);
    if (bb) return bb;
    if (r === 0) {
      bb = isDraw[v] ? [Math.min(0, ux[h]), Math.min(0, uy[h]), Math.max(0, ux[h]), Math.max(0, uy[h])] : [0, 0, 0, 0];
    } else {
      const prev = rows[r - 1];
      let x = 0, y = 0, hd = h, x0 = 0, y0 = 0, x1 = 0, y1 = 0;
      for (const op of ops[v]) {
        if (op >= 0) {
          const cb = box(op, r - 1, hd);
          x0 = Math.min(x0, x + cb[0]); y0 = Math.min(y0, y + cb[1]); x1 = Math.max(x1, x + cb[2]); y1 = Math.max(y1, y + cb[3]);
          const ex = prev.dx[op] * ux[hd] - prev.dy[op] * uy[hd], ey = prev.dx[op] * uy[hd] + prev.dy[op] * ux[hd];
          x += ex; y += ey;
          hd = (hd + prev.turn[op]) % nh;
        } else if (op === DRAW) {
          x += ux[hd]; y += uy[hd];
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        } else if (op === LEFT) hd = (hd + 1) % nh;
        else hd = (hd + nh - 1) % nh;
      }
      bb = [x0, y0, x1, y1];
    }
    boxes.set(key, bb);
    return bb;
  }

  // The depth-d curve's frame: normalizePolylines's scale and center.
  const bases = new Map();
  function base(depth) {
    let bs = bases.get(depth);
    if (!bs) {
      ensure(depth);
      const h0 = curve.startHeading(depth);
      const bb = box(root, depth, h0);
      const kk = 2 / Math.max(bb[2] - bb[0], bb[3] - bb[1], 1e-12);
      bs = { h0, kk, p0x: -(bb[0] + bb[2]) / 2 * kk, p0y: -(bb[1] + bb[3]) / 2 * kk };
      bases.set(depth, bs);
    }
    return bs;
  }
  // World length of one step of the level-D curve in depth d's frame.
  function stepLength(depth, D) {
    const bs = base(depth);
    if (D === depth) return bs.kk;
    ensure(D);
    if (curve.frame === "square") return bs.kk * Math.pow(2, depth - D);
    return bs.kk * Math.hypot(rows[depth].dx[root], rows[depth].dy[root]) / Math.hypot(rows[D].dx[root], rows[D].dy[root]);
  }
  // The level to draw: depth, plus levels while a step is longer than refPx
  // canvas px at k px per world unit, and one step stays above CURVE_ZMIN.
  function level(depth, k, refPx) {
    let D = depth;
    while (D < depth + CURVE_MAX_EXTRA && stepLength(depth, D) * k > refPx && stepLength(depth, D + 1) >= CURVE_ZMIN) D++;
    return D;
  }
  // Level D in depth d's frame: the world position of the start, and the
  // complex scale (zr + i zi) from node space, with the start heading.
  function frame(depth, D) {
    const bs = base(depth);
    if (D === depth) return { p0x: bs.p0x, p0y: bs.p0y, zr: bs.kk, zi: 0, h0: bs.h0 };
    ensure(D);
    const h0 = curve.startHeading(D);
    if (curve.frame === "square") {
      const z = bs.kk * Math.pow(2, depth - D), bb = box(root, D, h0);
      return { p0x: -(bb[0] + bb[2]) / 2 * z, p0y: -(bb[1] + bb[3]) / 2 * z, zr: z, zi: 0, h0 };
    }
    // The chord between the curve's ends, level d's in the world over level D's in node space.
    const hd = bs.h0;
    const wr = bs.kk * (rows[depth].dx[root] * ux[hd] - rows[depth].dy[root] * uy[hd]);
    const wi = bs.kk * (rows[depth].dx[root] * uy[hd] + rows[depth].dy[root] * ux[hd]);
    const nr = rows[D].dx[root] * ux[h0] - rows[D].dy[root] * uy[h0];
    const ni = rows[D].dx[root] * uy[h0] + rows[D].dy[root] * ux[h0];
    const q = nr * nr + ni * ni;
    return { p0x: bs.p0x, p0y: bs.p0y, zr: (wr * nr + wi * ni) / q, zi: (wi * nr - wr * ni) / q, h0 };
  }
  return { nv, nh, ux, uy, ops, root, rows, ensure, level, frame, stepLength, split: curve.split, DRAW, LEFT };
}

// The walk. aff as for dragonAdaptive; buf and tb (optional, as there) get the
// canvas-pixel points and their place along the curve; depth is the slider's;
// pxMin and refPx as for the dragon (refPx Infinity: exactly depth levels).
// Returns { n, leaves, leafPx, maxLevel, overflow, level } like
// dragonAdaptive, plus the level drawn.
export function curveAdaptive(key, aff, buf, depth, pxMin, refPx, tb) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const spec = lcurveSpec(key);
  const D = spec.level(depth, k, refPx);
  const fr = spec.frame(depth, D);
  const { nh, ops, rows, ux, uy, DRAW, LEFT } = spec;
  const zabs = Math.hypot(fr.zr, fr.zi);
  const zr = new Float64Array(nh), zi = new Float64Array(nh);
  for (let i = 0; i < nh; i++) {
    zr[i] = fr.zr * ux[i] - fr.zi * uy[i];
    zi[i] = fr.zr * uy[i] + fr.zi * ux[i];
  }
  const total = rows[D].count[spec.root];
  const cap = buf.length / 2 - 2;
  const nodeCap = 6 * cap;
  // A node is expanded while its circle's diameter is at least this many px (its children's, about pxMin).
  const splitPx = pxMin * spec.split;
  let n = 0, nodes = 0, done = 0, leaves = 0, leafPx = 0, maxLevel = 0, overflow = false;

  function emit(x, y) {
    const dx = x - cx, dy = y - cy;
    buf[2 * n] = hw + a * dx + b * dy;
    buf[2 * n + 1] = hh + c * dx + d * dy;
    if (tb) tb[n] = done / total;
    n++;
  }

  // Node v with r levels to go, starting at x, y heading h (steps).
  function walk(v, r, x, y, hd) {
    if (overflow) return;
    if (n >= cap || ++nodes > nodeCap) { overflow = true; return; }
    const row = rows[r];
    const ex = row.dx[v], ey = row.dy[v];
    const cxw = x + zr[hd] * row.cx[v] - zi[hd] * row.cy[v], cyw = y + zr[hd] * row.cy[v] + zi[hd] * row.cx[v];
    const dx = cxw - cx, dy = cyw - cy;
    const sx = hw + a * dx + b * dy, sy = hh + c * dx + d * dy;
    const rad = row.rho[v] * zabs * k;
    const rm = rad + VECTOR_CULL_MARGIN;
    const offscreen = sx + rm < 0 || sx - rm > w || sy + rm < 0 || sy - rm > h;
    if (r > 0 && !offscreen && 2 * rad >= splitPx) {
      let px = x, py = y, hn = hd;
      const prev = rows[r - 1];
      for (const op of ops[v]) {
        if (op >= 0) {
          walk(op, r - 1, px, py, hn);
          px += zr[hn] * prev.dx[op] - zi[hn] * prev.dy[op];
          py += zr[hn] * prev.dy[op] + zi[hn] * prev.dx[op];
          hn = (hn + prev.turn[op]) % nh;
        } else if (op === DRAW) {
          px += zr[hn]; py += zi[hn];
          done++;
          // A step of the level being drawn (the node is on screen, or it wouldn't be expanded).
          leaves++;
          leafPx += zabs * k;
          maxLevel = D;
          emit(px, py);
        } else if (op === LEFT) hn = (hn + 1) % nh;
        else hn = (hn + nh - 1) % nh;
      }
      return;
    }
    if (row.count[v] > 0) {
      const qx = x + zr[hd] * ex - zi[hd] * ey, qy = y + zr[hd] * ey + zi[hd] * ex;
      done += row.count[v];
      if (!offscreen) {
        leaves++;
        leafPx += Math.hypot(qx - x, qy - y) * k;
        if (D - r > maxLevel) maxLevel = D - r;
      }
      emit(qx, qy);
    }
  }

  emit(fr.p0x, fr.p0y);
  walk(spec.root, D, fr.p0x, fr.p0y, fr.h0);
  return { n, leaves, leafPx, maxLevel, overflow, level: D };
}
export const hilbertAdaptive = (...args) => curveAdaptive("hilbert", ...args);
export const gosperAdaptive = (...args) => curveAdaptive("gosper", ...args);
export const arrowheadAdaptive = (...args) => curveAdaptive("arrowhead", ...args);
