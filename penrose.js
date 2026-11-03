// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { SOLID_COLORS, hueTurned, isGreyColor, strokeWidthFor } from "./colormaps.js?v=1.62.0";
import { VECTOR_CULL_MARGIN } from "./vectorgeom.js?v=1.62.0";

// The Penrose tiling (P3: thick and thin rhombs) by deflation, drawn from the viewport, so zooming
// shows ever finer tiles instead of a fixed patch.
//
// A tile is cut into two Robinson triangles (colour, A, B, C): A is the apex, AB and AC are the two
// rhomb edges (equal length, the ones drawn), BC is the diagonal shared with the mirror-image twin
// that completes the rhomb (never drawn). Colour 0 ("red") is the acute golden triangle 36-72-72:
// two of them make a THIN rhomb. Colour 1 ("blue") is the obtuse gnomon 36-36-108: two of them make
// a THICK rhomb. Deflation by the golden ratio phi:
//   red  (A,B,C): P = A + (B-A)/phi                    -> red (C,P,B), blue (P,C,A)
//   blue (A,B,C): Q = B + (A-B)/phi, R = B + (C-B)/phi -> blue (R,C,A), blue (Q,R,B), red (R,Q,A)
// Every rhomb edge shrinks by 1/phi per level, so all the edges of one level have one length. The
// start (level 0) is the "wheel" of ten red triangles around the origin, turned 18 degrees so that
// every edge points along a multiple of 36 degrees; one deflation makes the five-fold star (five
// thick rhombs at the center, five thin around them). The triangles of any level tile the decagon of
// circumradius 1 exactly, which is the picture's world frame. Triangles per level: 10, 20, 50, 130,
// 340, 890, 2330 ... (times phi^2 = 2.618 each level).
//
// Drawing: the deflation is affine, so it runs on screen coordinates, cutting only the triangles that
// touch the viewport, down to one level (Lc) and the next (Lc + 1) whose edges are about the size the
// zoom asks for, and drawing the two with a cross-fade between them (the fade runs over the middle
// half of each step, so most views show one clean level). See penroseLevel for which level that is.
// Precision: plain doubles hold up to a zoom of about 1e11; past PENROSE_EXACT_HH the view's center is
// exact (a 128-bit fixed-point BigInt, view.ox/oy plus the small double offset view.cx/cy), the
// deflation runs in BigInt relative to that center for all but the last PENROSE_D_STEPS levels, and
// only then turns into doubles (screen pixels, a few hundred at most), so no precision is lost at any
// zoom the view allows.

export const PHI = (1 + Math.sqrt(5)) / 2;
export const INV_PHI = 1 / PHI;
export const LOG_PHI = Math.log(PHI);

export const PENROSE_MIN_DEPTH = 1;       // the first deflation of the wheel: 20 triangles, the star
export const PENROSE_MAX_DEPTH = 8;       // 15,970 triangles on the whole star; it is already about 4-6 px a tile
export const PENROSE_DEFAULT_DEPTH = 5;
export const PENROSE_TILE_PX = 12;        // css px: the zoom adds levels until an edge is no longer than this
export const PENROSE_HH_MIN = 1e-15;      // deepest view (half the view's height, in world units; the star's radius is 1): about 1e15 times
export const PENROSE_HH_MAX = 30;
export const PENROSE_EXACT_HH = 1e-6;     // below this half-height the deflation runs in exact arithmetic
export const PENROSE_D_STEPS = 6;         // levels the exact run leaves to the doubles
export const PENROSE_NB = 48;             // distance colors; the palette is two of them, one per tile type
export const PENROSE_FADE_FROM = 0.25;
export const PENROSE_FADE_TO = 0.75;
export const PENROSE_MAX_NODES = 600000;  // safety cap on triangles visited per frame (never reached in the supported range)
export const PENROSE_TYPE_TURN = 40;      // degrees the picked color's hue turns for the tile-type colors, either way
export const PENROSE_FRAC = 128n;         // fixed point: exact coordinates are integers in units of 2^-128
export const PENROSE_ONE = 1n << PENROSE_FRAC;
export const PENROSE_INV_ONE = 2 ** -128;

// ---------------------------------------------------------------- doubles
export function penroseRootsD() {
  const out = [];
  for (let i = 0; i < 10; i++) {
    // B and C at i and i+1 times 36 degrees, every second triangle mirrored: apexes at the origin.
    let bx = Math.cos((2 * i * Math.PI) / 10), by = Math.sin((2 * i * Math.PI) / 10);
    let cx = Math.cos(((2 * i + 2) * Math.PI) / 10), cy = Math.sin(((2 * i + 2) * Math.PI) / 10);
    if (i % 2 === 0) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; }
    out.push([0, 0, 0, bx, by, cx, cy]);
  }
  return out;
}

// t = [colour, ax, ay, bx, by, cx, cy] -> its children, the same shape
export function penroseSubdivideD(t) {
  const [col, ax, ay, bx, by, cx, cy] = t;
  if (col === 0) {
    const px = ax + (bx - ax) * INV_PHI, py = ay + (by - ay) * INV_PHI;
    return [[0, cx, cy, px, py, bx, by], [1, px, py, cx, cy, ax, ay]];
  }
  const qx = bx + (ax - bx) * INV_PHI, qy = by + (ay - by) * INV_PHI;
  const rx = bx + (cx - bx) * INV_PHI, ry = by + (cy - by) * INV_PHI;
  return [[1, rx, ry, cx, cy, ax, ay], [1, qx, qy, rx, ry, bx, by], [0, rx, ry, qx, qy, ax, ay]];
}

// All the triangles of a level, in doubles (small levels only: the count grows by 2.618 a level).
export function penroseTrianglesD(level) {
  let tris = penroseRootsD();
  for (let l = 0; l < level; l++) tris = tris.flatMap(penroseSubdivideD);
  return tris;
}

// ---------------------------------------------------------------- exact (BigInt fixed point)
export function penroseIsqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}
export const PENROSE_SQRT5 = penroseIsqrt(5n << (2n * PENROSE_FRAC));
export const PENROSE_INV_PHI_B = (PENROSE_SQRT5 - PENROSE_ONE) / 2n;
// cos and sin of j * 18 degrees, j = 0..19, from the closed forms (cos 18 = sin 72, sin 36 = cos 54, ...).
export const PENROSE_COS18 = [];
export const PENROSE_SIN18 = [];
{
  const c18 = penroseIsqrt((10n * PENROSE_ONE + 2n * PENROSE_SQRT5) << PENROSE_FRAC) / 4n;
  const s36 = penroseIsqrt((10n * PENROSE_ONE - 2n * PENROSE_SQRT5) << PENROSE_FRAC) / 4n;
  const c36 = (PENROSE_ONE + PENROSE_SQRT5) / 4n;
  const s18 = (PENROSE_SQRT5 - PENROSE_ONE) / 4n;
  const c5 = [PENROSE_ONE, c18, c36, s36, s18, 0n], s5 = [0n, s18, s36, c36, c18, PENROSE_ONE];
  for (let j = 0; j <= 10; j++) {
    if (j <= 5) { PENROSE_COS18[j] = c5[j]; PENROSE_SIN18[j] = s5[j]; }
    else { PENROSE_COS18[j] = -c5[10 - j]; PENROSE_SIN18[j] = s5[10 - j]; }
  }
  for (let j = 11; j < 20; j++) { PENROSE_COS18[j] = -PENROSE_COS18[j - 10]; PENROSE_SIN18[j] = -PENROSE_SIN18[j - 10]; }
}

export function penroseRootsB() {
  const out = [];
  for (let i = 0; i < 10; i++) {
    const jb = (2 * i) % 20, jc = (2 * i + 2) % 20;
    let bx = PENROSE_COS18[jb], by = PENROSE_SIN18[jb], cx = PENROSE_COS18[jc], cy = PENROSE_SIN18[jc];
    if (i % 2 === 0) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; }
    out.push([0, 0n, 0n, bx, by, cx, cy]);
  }
  return out;
}

export const penroseMulInv = (v) => (v * PENROSE_INV_PHI_B) >> PENROSE_FRAC;

export function penroseSubdivideB(t) {
  const [col, ax, ay, bx, by, cx, cy] = t;
  if (col === 0) {
    const px = ax + penroseMulInv(bx - ax), py = ay + penroseMulInv(by - ay);
    return [[0, cx, cy, px, py, bx, by], [1, px, py, cx, cy, ax, ay]];
  }
  const qx = bx + penroseMulInv(ax - bx), qy = by + penroseMulInv(ay - by);
  const rx = bx + penroseMulInv(cx - bx), ry = by + penroseMulInv(cy - by);
  return [[1, rx, ry, cx, cy, ax, ay], [1, qx, qy, rx, ry, bx, by], [0, rx, ry, qx, qy, ax, ay]];
}

export const penroseToFixed = (x) => BigInt(Math.round(x * 2 ** 128));
export const penroseFromFixed = (b) => Number(b) * PENROSE_INV_ONE;

export const PENROSE_ROOTS_D = penroseRootsD();
export const PENROSE_ROOTS_B = penroseRootsB();

// The corners of the picture (the decagon), for the Reset framing.
export function penrosePoints() {
  return PENROSE_ROOTS_D.flatMap((t) => [[t[3], t[4]], [t[5], t[6]]]);
}

// ---------------------------------------------------------------- the view's exact center

// The view keeps its center as an exact origin (view.ox, view.oy: BigInt, units of 2^-128) plus the
// double offset (view.cx, view.cy) that the gestures work on, so the gesture code stays in plain
// doubles and the picture stays exact at any zoom. rebase() folds the offset into the origin while
// zoomed in (so the offset stays small, and keeps its full precision) and back out while zoomed out
// (so a shallow view is plain doubles again). Callers do it only where no world point is held across
// the call: when a gesture starts, and at each wheel tick.
export function penroseRebase(view) {
  if (view.ox === undefined) return;
  if (view.halfHeight < PENROSE_EXACT_HH * 1e3) {
    if (view.cx !== 0) { view.ox += penroseToFixed(view.cx); view.cx = 0; }
    if (view.cy !== 0) { view.oy += penroseToFixed(view.cy); view.cy = 0; }
  } else if (view.ox !== 0n || view.oy !== 0n) {
    view.cx += penroseFromFixed(view.ox); view.cy += penroseFromFixed(view.oy);
    view.ox = 0n; view.oy = 0n;
  }
}
export const penroseClampHalfHeight = (hh) => (Number.isFinite(hh) ? Math.min(PENROSE_HH_MAX, Math.max(PENROSE_HH_MIN, hh)) : 1);

// The center as exact fixed point (origin plus offset), and as doubles.
export const penroseCenterB = (view) => [(view.ox || 0n) + penroseToFixed(view.cx), (view.oy || 0n) + penroseToFixed(view.cy)];
export const penroseCenterD = (view) => [penroseFromFixed(view.ox || 0n) + view.cx, penroseFromFixed(view.oy || 0n) + view.cy];

// Share link fields of the center: x and y as doubles, and, once the view is deep enough for doubles
// to blur it, ex and ey as signed hex of the exact fixed-point value.
export const PENROSE_SHARE_EXACT_HH = 1e-6;
export const PENROSE_EXACT_BITS = 150;      // |exact center| < 2^(150-128) world units
export function penroseCenterFields(view) {
  const [x, y] = penroseCenterD(view);
  const out = { x, y };
  if (view.halfHeight < PENROSE_SHARE_EXACT_HH) {
    const [bx, by] = penroseCenterB(view);
    const lim = 1n << BigInt(PENROSE_EXACT_BITS);
    if (bx > -lim && bx < lim && by > -lim && by < lim) {
      out.ex = (bx < 0n ? "-" : "") + (bx < 0n ? -bx : bx).toString(16);
      out.ey = (by < 0n ? "-" : "") + (by < 0n ? -by : by).toString(16);
    }
  }
  return out;
}
// A link's exact coordinate: strict (signed lowercase hex, at most 40 digits, inside the bound), or null.
export function penroseParseExact(s) {
  if (typeof s !== "string" || !/^-?[0-9a-f]{1,40}$/.test(s)) return null;
  const v = s[0] === "-" ? -BigInt("0x" + s.slice(1)) : BigInt("0x" + s);
  const lim = 1n << BigInt(PENROSE_EXACT_BITS);
  return v > -lim && v < lim ? v : null;
}

// ---------------------------------------------------------------- which level to draw

// The level (continuous: 5.5 is half way between the tilings of levels 5 and 6) the view shows.
//   - slider: the depth slider, the floor level: at the opening zoom the picture is that level, so the
//     slider builds the tiling one level at a time;
//   - every phi of zoom adds a level, so the tiles stay the size the slider's level has: finer tiles
//     keep appearing as you zoom in;
//   - between 1x and 10x of zoom the level also rises to floorLevel (the first level whose edges are
//     at most PENROSE_TILE_PX), so past 10x the tiles are never coarser than that, whatever the slider
//     says. (A slider above floorLevel keeps its finer tiles.)
export function penroseFloorLevel(kFit, tilePx) {
  return Math.max(1, Math.ceil(Math.log(kFit / tilePx) / LOG_PHI - 1e-9));
}
export function penroseLevel(slider, zoom, floorLevel) {
  const lz = Math.log(zoom) / LOG_PHI;
  const t = Math.min(1, Math.max(0, Math.log10(zoom)));
  const w = t * t * (3 - 2 * t);
  return Math.max(1, slider + lz + w * Math.max(0, floorLevel - slider));
}
// 0 (the coarse level alone) to 1 (the next level alone) for the fractional part of a level.
export function penroseFadeWeight(f) {
  const t = Math.min(1, Math.max(0, (f - PENROSE_FADE_FROM) / (PENROSE_FADE_TO - PENROSE_FADE_FROM)));
  return t * t * (3 - 2 * t);
}

// The slider's level as the picture shows it: it follows the slider at a steady pace, so one step of
// Play (or a slide of the slider) cross-fades between the two tilings instead of jumping. at() gives
// the level for now; busy says it is still on its way (the caller draws another frame). Not animated
// (animate false, or the first call) it is the slider's value straight away.
export function makePenroseLevelAnimator() {
  const a = { value: NaN, from: 0, to: 0, t0: 0, dur: 1, busy: false };
  a.at = (target, now, animate) => {
    if (!animate || !Number.isFinite(a.value)) { a.value = target; a.to = target; a.busy = false; return target; }
    if (target !== a.to) {
      a.from = a.value; a.to = target; a.t0 = now;
      a.dur = Math.min(900, Math.max(450, Math.abs(target - a.from) * 400));
    }
    const p = Math.min(1, (now - a.t0) / a.dur);
    a.value = a.from + (a.to - a.from) * p;
    a.busy = p < 1;
    return a.value;
  };
  a.snap = () => { a.value = NaN; a.busy = false; };
  return a;
}

// ---------------------------------------------------------------- colors

// The palette of a frame: PENROSE_NB colors for each of the two tile types (thick first, so the thin
// rhombs, drawn last, keep all four of their sides where they share an edge with a thick one). The
// distance colors are the line curves' ramp (the picked color turning along it) by an edge's
// distance from the star's center, which is what the tiling shows when the whole star is in view.
// A few thousand times in, one distance is one color across the whole screen, so the colors blend
// to the tile type's (the picked color turned either way, the thin rhombs lighter) as m goes 0 to 1:
// deep views read as thin and thick rhombs, whatever the depth.
export function makePenroseColors() {
  const c = { rampRef: null, rgb: [], key: "", palette: [] };
  const parse = (css) => /(\d+),\s*(\d+),\s*(\d+)/.exec(css).slice(1, 4).map(Number);
  c.get = (ramp, colorIndex, m) => {
    const mq = Math.round(m * 16);
    const key = `${colorIndex}|${mq}`;
    if (c.rampRef === ramp && c.key === key) return c.palette;
    if (c.rampRef !== ramp) { c.rgb = ramp.map(parse); c.rampRef = ramp; }
    const base = SOLID_COLORS[colorIndex].rgb, grey = isGreyColor(base);
    const lift = (rgb, s) => rgb.map((v) => v + (255 - v) * s);
    const types = grey
      ? [lift(base.map((v) => v * 0.66), 0.1), lift(base, 0.3)]
      : [lift(hueTurned(base, -PENROSE_TYPE_TURN), 0.05), lift(hueTurned(base, PENROSE_TYPE_TURN), 0.3)];
    const mix = mq / 16;
    c.palette = [];
    for (let t = 0; t < 2; t++) {
      for (let b = 0; b < PENROSE_NB; b++) {
        const d = c.rgb[Math.min(c.rgb.length - 1, Math.floor(((b + 0.5) / PENROSE_NB) * c.rgb.length))];
        const rgb = d.map((v, i) => Math.round(v + (types[t][i] - v) * mix));
        c.palette.push(`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
      }
    }
    c.key = key;
    return c.palette;
  };
  return c;
}
// How far the colors have blended to the tile types at a zoom: none to 10x, all of it from about 320x.
export function penroseTypeMix(zoom) {
  return Math.min(1, Math.max(0, (Math.log10(zoom) - 1) / 1.5));
}

// ---------------------------------------------------------------- the renderer

// One renderer per view: its per-frame state lives in the closure (no allocation per frame once the
// buffers have grown), and `layers` keeps the edges of the last frame for the tests.
export function makePenroseRenderer() {
  const mkLayer = () => ({ cap: 1 << 15, xy: new Float32Array(4 << 15), bin: new Uint8Array(1 << 15), n: 0, tris: 0, lev: 0, segPx: 0, drawn: false });
  const layers = [mkLayer(), mkLayer()];
  const level = makePenroseLevelAnimator();
  const colors = makePenroseColors();
  const stats = { tris: 0, trisC: 0, trisF: 0, nodes: 0, capped: false, level: 1, lam: 1, top: 1, nominalPx: 0, zoom: 1, exact: false, busy: false, mix: 0, floorLevel: 1 };
  const counts = new Int32Array(2 * PENROSE_NB + 1);
  let scratch = new Float32Array(1 << 16);

  // The frame in progress.
  let fa = 1, fb = 0, fc = 0, fd = 1, hw = 0, hh = 0, W = 0, H = 0, margin = 8, invK = 1, s0x = 0, s0y = 0;
  let lc = 1, lf = 2, needC = true, needF = false, hand = 0, nodes = 0, capped = false, needDist = true;

  function pushEdge(L, x0, y0, x1, y1, b) {
    if (L.n === L.cap) {
      L.cap *= 2;
      const xy = new Float32Array(L.cap * 4); xy.set(L.xy); L.xy = xy;
      const bin = new Uint8Array(L.cap); bin.set(L.bin); L.bin = bin;
    }
    const i = L.n++;
    L.xy[4 * i] = x0; L.xy[4 * i + 1] = y0; L.xy[4 * i + 2] = x1; L.xy[4 * i + 3] = y1; L.bin[i] = b;
  }
  const distBin = (x, y) => {
    const d = Math.hypot(x - s0x, y - s0y) * invK;
    return d >= 1 ? PENROSE_NB - 1 : (d * PENROSE_NB) | 0;
  };
  function emit(li, col, ax, ay, bx, by, cx, cy) {
    const L = layers[li];
    L.tris++;
    const slot = (1 - col) * PENROSE_NB; // thick (colour 1) first, thin last
    let b0 = slot, b1 = slot;
    if (needDist) { b0 += distBin((ax + bx) * 0.5, (ay + by) * 0.5); b1 += distBin((ax + cx) * 0.5, (ay + cy) * 0.5); }
    pushEdge(L, ax, ay, bx, by, b0);   // the two rhomb edges; BC, the shared diagonal, is never drawn
    pushEdge(L, ax, ay, cx, cy, b1);
  }

  // The deflation on screen coordinates (canvas px).
  function rec(lev, col, ax, ay, bx, by, cx, cy) {
    const lo = -margin, hiX = W + margin, hiY = H + margin;
    if ((ax < lo && bx < lo && cx < lo) || (ax > hiX && bx > hiX && cx > hiX) ||
        (ay < lo && by < lo && cy < lo) || (ay > hiY && by > hiY && cy > hiY)) return;
    if (++nodes > PENROSE_MAX_NODES) { capped = true; return; }
    if (lev === lc) { if (needC) emit(0, col, ax, ay, bx, by, cx, cy); if (!needF) return; }
    else if (lev === lf) { emit(1, col, ax, ay, bx, by, cx, cy); return; }
    if (col === 0) {
      const px = ax + (bx - ax) * INV_PHI, py = ay + (by - ay) * INV_PHI;
      rec(lev + 1, 0, cx, cy, px, py, bx, by);
      rec(lev + 1, 1, px, py, cx, cy, ax, ay);
    } else {
      const qx = bx + (ax - bx) * INV_PHI, qy = by + (ay - by) * INV_PHI;
      const rx = bx + (cx - bx) * INV_PHI, ry = by + (cy - by) * INV_PHI;
      rec(lev + 1, 1, rx, ry, cx, cy, ax, ay);
      rec(lev + 1, 1, qx, qy, rx, ry, bx, by);
      rec(lev + 1, 0, rx, ry, qx, qy, ax, ay);
    }
  }

  // The same deflation in exact arithmetic, coordinates relative to the view's center, until `hand`.
  function recB(lev, col, ax, ay, bx, by, cx, cy) {
    const fax = Number(ax) * PENROSE_INV_ONE, fay = Number(ay) * PENROSE_INV_ONE, fbx = Number(bx) * PENROSE_INV_ONE, fby = Number(by) * PENROSE_INV_ONE;
    const fcx = Number(cx) * PENROSE_INV_ONE, fcy = Number(cy) * PENROSE_INV_ONE;
    const sax = hw + fa * fax + fb * fay, say = hh + fc * fax + fd * fay;
    const sbx = hw + fa * fbx + fb * fby, sby = hh + fc * fbx + fd * fby;
    const scx = hw + fa * fcx + fb * fcy, scy = hh + fc * fcx + fd * fcy;
    const lo = -margin, hiX = W + margin, hiY = H + margin;
    if ((sax < lo && sbx < lo && scx < lo) || (sax > hiX && sbx > hiX && scx > hiX) ||
        (say < lo && sby < lo && scy < lo) || (say > hiY && sby > hiY && scy > hiY)) return;
    if (lev >= hand) { rec(lev, col, sax, say, sbx, sby, scx, scy); return; }
    nodes++;
    if (col === 0) {
      const px = ax + penroseMulInv(bx - ax), py = ay + penroseMulInv(by - ay);
      recB(lev + 1, 0, cx, cy, px, py, bx, by);
      recB(lev + 1, 1, px, py, cx, cy, ax, ay);
    } else {
      const qx = bx + penroseMulInv(ax - bx), qy = by + penroseMulInv(ay - by);
      const rx = bx + penroseMulInv(cx - bx), ry = by + penroseMulInv(cy - by);
      recB(lev + 1, 1, rx, ry, cx, cy, ax, ay);
      recB(lev + 1, 1, qx, qy, rx, ry, bx, by);
      recB(lev + 1, 0, rx, ry, qx, qy, ax, ay);
    }
  }

  // Strokes one layer's edges, a path per color: a soft glow under a brighter core (see the line
  // curves' pen), then the next color. Edges are sorted into their color bins first (a counting sort).
  function strokeLayer(ctx, L, alpha, palette, pen) {
    if (!L.n || alpha < 0.01) return;
    const nb = 2 * PENROSE_NB;
    counts.fill(0);
    for (let i = 0; i < L.n; i++) counts[L.bin[i] + 1]++;
    for (let b = 0; b < nb; b++) counts[b + 1] += counts[b];
    if (scratch.length < 4 * L.n) scratch = new Float32Array(Math.ceil(4 * L.n * 1.5));
    for (let i = 0; i < L.n; i++) {
      const j = counts[L.bin[i]]++;
      scratch[4 * j] = L.xy[4 * i]; scratch[4 * j + 1] = L.xy[4 * i + 1]; scratch[4 * j + 2] = L.xy[4 * i + 2]; scratch[4 * j + 3] = L.xy[4 * i + 3];
    }
    // counts[b] is now the end of bin b (the start of bin b + 1).
    const look = pen.look, dpr = pen.dpr;
    const core = Math.max(look.coreMinPx * dpr, strokeWidthFor(L.segPx, dpr));
    const crowd = Math.min(1, Math.max(0, (L.segPx / dpr - 2) / 4));
    const coreAlpha = (look.coreAlphaDense + (look.coreAlpha - look.coreAlphaDense) * crowd) * alpha;
    const glow = !pen.lite && L.segPx >= look.glowMinSeg * dpr;
    let from = 0;
    for (let b = 0; b < nb; b++) {
      const to = counts[b];
      if (to === from) continue;
      ctx.strokeStyle = palette[b];
      ctx.beginPath();
      for (let i = from; i < to; i++) { ctx.moveTo(scratch[4 * i], scratch[4 * i + 1]); ctx.lineTo(scratch[4 * i + 2], scratch[4 * i + 3]); }
      if (glow) {
        ctx.globalCompositeOperation = "lighter";
        ctx.lineWidth = core * look.glowWidth; ctx.globalAlpha = look.glowAlpha * alpha;
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.lineWidth = core; ctx.globalAlpha = coreAlpha;
      ctx.stroke();
      from = to;
    }
  }

  // Draws the tiling. aff is vectorAffine's map of the view, view the curve view's own object (cx, cy,
  // halfHeight, rotation and the exact origin ox, oy); opts has depth (the slider), fitHalfHeight (the
  // half-height of the opening view: zoom is measured from it), colorIndex and ramp (the line curves'
  // css colors), dpr, lite (a gesture is in progress: one level coarser, one layer, no glow), animate
  // (cross-fade between slider levels), look (the line curves' pen) and now (a time, for the tests).
  // Returns the frame's stats.
  function render(ctx, view, aff, opts) {
    const dpr = opts.dpr || 1;
    W = aff.w; H = aff.h; hw = aff.hw; hh = aff.hh; fa = aff.a; fb = aff.b; fc = aff.c; fd = aff.d;
    margin = VECTOR_CULL_MARGIN + 8 * dpr;
    const k = aff.k, zoom = opts.fitHalfHeight / view.halfHeight, kFit = k / zoom;
    const floorLevel = penroseFloorLevel(kFit, PENROSE_TILE_PX * dpr);
    const slider = level.at(opts.depth, opts.now ?? performance.now(), opts.animate !== false);
    let lam = penroseLevel(slider, zoom, floorLevel);
    if (opts.lite) lam = Math.max(1, Math.round(lam) - 1);
    lc = Math.floor(lam + 1e-9);
    const f = lam - lc, wf = opts.lite ? 0 : penroseFadeWeight(f), wc = 1 - wf;
    lf = lc + 1;
    needC = wc > 0.012; needF = wf > 0.012;
    const mix = penroseTypeMix(zoom);
    needDist = mix < 0.999;
    invK = 1 / k;
    const exact = view.halfHeight < PENROSE_EXACT_HH;
    const [cxd, cyd] = penroseCenterD(view);
    s0x = hw - fa * cxd - fb * cyd; s0y = hh - fc * cxd - fd * cyd;
    for (const L of layers) { L.n = 0; L.tris = 0; L.drawn = false; }
    layers[0].lev = lc; layers[1].lev = lf;
    layers[0].segPx = k * Math.pow(PHI, -lc); layers[1].segPx = k * Math.pow(PHI, -lf);
    nodes = 0; capped = false;
    if (exact) {
      hand = Math.max(0, (needF ? lf : lc) - PENROSE_D_STEPS);
      const [xB, yB] = penroseCenterB(view);
      for (const r of PENROSE_ROOTS_B) recB(0, r[0], r[1] - xB, r[2] - yB, r[3] - xB, r[4] - yB, r[5] - xB, r[6] - yB);
    } else {
      for (const r of PENROSE_ROOTS_D) {
        const ax = r[1] - cxd, ay = r[2] - cyd, bx = r[3] - cxd, by = r[4] - cyd, cx = r[5] - cxd, cy = r[6] - cyd;
        rec(0, r[0], hw + fa * ax + fb * ay, hh + fc * ax + fd * ay, hw + fa * bx + fb * by, hh + fc * bx + fd * by, hw + fa * cx + fb * cy, hh + fc * cx + fd * cy);
      }
    }
    layers[0].drawn = needC; layers[1].drawn = needF;
    const palette = colors.get(opts.ramp, opts.colorIndex, mix);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const pen = { look: opts.look, dpr, lite: opts.lite };
    if (needC) strokeLayer(ctx, layers[0], wc, palette, pen);
    if (needF) strokeLayer(ctx, layers[1], wf, palette, pen);
    ctx.globalAlpha = 1;
    stats.trisC = needC ? layers[0].tris : 0; stats.trisF = needF ? layers[1].tris : 0; stats.tris = stats.trisC + stats.trisF;
    stats.nodes = nodes; stats.capped = capped; stats.level = lc; stats.lam = lam; stats.top = needF ? lf : lc;
    stats.nominalPx = (k * Math.pow(PHI, -lam)) / dpr; stats.zoom = zoom; stats.exact = exact; stats.busy = level.busy;
    stats.mix = mix; stats.floorLevel = floorLevel;
    return stats;
  }

  return { render, layers, stats, level };
}
