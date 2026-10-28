"use strict";

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
function dragonCurve(depth) {
  return lsystemPolylines(DRAGON_CURVE, depth, { step: Math.pow(Math.SQRT1_2, depth) })[0];
}

const DRAGON_FIT_HH = 0.6;        // typical half-height of the Reset framing on a wide canvas; render's opts.fitHalfHeight overrides it
const CURVE_FIT_HH = 1.1;         // the same for the Hilbert, Gosper and arrowhead curves (each fits [-1, 1] plus a margin)
// Canvas px, not CSS px: the dragon's lines overlap in its dense parts, so
// dropping a level there dims it (a depth-16 frame on a 2x phone lost 17% of
// its brightness when the limit was 1 CSS px).
const DRAGON_PX_MIN = 1;          // canvas px: a chord whose halves would be shorter stays one straight line
const DRAGON_LITE_PX_MIN = 3;     // canvas px: the pixel limit while a drag or pinch is in progress (opts.lite), about 9x fewer segments at depth 16
const DRAGON_ZOOM_SLACK = 1.5;    // zoom headroom before a level beyond the slider's depth is added
const DRAGON_BUDGET = 120000;     // vertices per frame; past it the pixel limit grows by half and the frame is redone
const DRAGON_MAX_LEVEL = 80;
// The whole dragon between two points lies within this many chord lengths
// of the chord's midpoint (0.897 measured at order 20; rounded up).
const DRAGON_REACH = 0.92;

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
function dragonAdaptive(aff, buf, depth, pxMin, refPx, tb) {
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
const CURVE_ZMIN = Math.pow(2, -40);
const CURVE_MAX_EXTRA = 60;

const lcurveSpecs = new Map();
function lcurveSpec(key) {
  let spec = lcurveSpecs.get(key);
  if (!spec) {
    spec = makeLCurveSpec(LINE_CURVES[key]);
    lcurveSpecs.set(key, spec);
  }
  return spec;
}

// The smallest circle (about: a few rounds of nudging toward the farthest one)
// holding the circles in c, flat x, y, radius triples.
function enclosingCircle(c) {
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

function makeLCurveSpec(curve) {
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
function curveAdaptive(key, aff, buf, depth, pxMin, refPx, tb) {
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
const hilbertAdaptive = (...args) => curveAdaptive("hilbert", ...args);
const gosperAdaptive = (...args) => curveAdaptive("gosper", ...args);
const arrowheadAdaptive = (...args) => curveAdaptive("arrowhead", ...args);

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
const CURVE_GROUP = 256;
const CURVE_COLOR_STEPS = 96;
function strokeScreenPolyline(ctx, buf, n, width, height, colors, tb) {
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

// The newer curves don't need hand-tuned scaling: normalizePolylines fits
// each depth into [-1, 1]. All three are single connected paths.
function normalizedCurve(def, depth, turtleOpts) {
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
const LINE_CURVES = {
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
};

// The curves are drawn in color steps along their length: the picked color's
// hue turns CURVE_HUE_SPAN degrees from the start to the end of the curve
// (half either side of the picked color), and it lifts a little toward white
// at the far end, so the path reads as a path and a dense curve shows where
// its two ends are. White has no hue to turn, so it runs from dim to bright
// instead. One css color per step, cached for the last picked color.
const CURVE_HUE_SPAN = 56;
const CURVE_LIFT_START = 0.04, CURVE_LIFT_END = 0.2; // share of the way to white
const CURVE_GREY_DIM_START = 0.62;  // White: brightness at the start of the curve (1 at the end)
const CURVE_RAMP_STEPS = 128;
const CURVE_CORE_MIN_PX = 1.1;       // css px
const CURVE_CORE_ALPHA = 0.95, CURVE_CORE_ALPHA_DENSE = 0.8;
const CURVE_GLOW_WIDTH = 3.5;        // times the core's width
const CURVE_GLOW_ALPHA = 0.1;
const CURVE_GLOW_MIN_SEG = 2.5;      // css px: below this segment length the lines are a mesh the glow would only haze, and stroking it twice costs the most
let curveRampKey = -1, curveRampColors = [];
function curveRamp(colorIndex) {
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
// attachVectorViewInteraction in interaction.js works on this unmodified. One view
// serves every LINE_CURVES entry; setCurve switches which one it draws,
// keeping each curve's pan/zoom separately.
function createCurveView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: -0.35, cy: -0.24, halfHeight: 1.0, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let curve = "dragon";
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

  function render(opts) {
    resize();
    paintBackdrop(ctx, canvas.width, canvas.height);
    extraLevels = 0;
    const aff = vectorAffine(view, canvas.width, canvas.height);
    if (!aff.ok) return;

    // Built from the viewport each frame, so there's no depth limit to zoom
    // into. refPx: how long a segment may stay at the slider's depth: the
    // length a depth-sized segment has when the curve is fitted to this
    // canvas (the half-height interaction.js's Reset framing uses), with some
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
    // Levels the last render added beyond the depth slider because of zoom.
    get extraLevels() { return extraLevels; },
  };
}
