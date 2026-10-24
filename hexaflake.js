"use strict";

// The Hexaflake: a regular hexagon (circumradius 1, vertices at 0, 60, ...
// degrees) is replaced by seven hexagons of 1/3 the size, one in the middle
// and one centered 2/3 of the way out toward each corner, so every outer one
// shares its far corner with the parent's and touches the middle one at a
// vertex. All seven keep the parent's orientation, so a hexagon is only a
// center and a size: the level-L hexagons are 3^-L across the corners.
// Dimension ln 7 / ln 3. Drawn like the Pythagoras tree (pythagoras.js):
// exactly, level by level, only what the viewport needs, with a shade per
// level so the gaps show the parent.

const HEX_SQ3_2 = Math.sqrt(3) / 2;
// A hexagon's corner directions (unit vectors at 0, 60, ... degrees), which
// are also the directions of its six outer children.
const HEX_DIRS = [[1, 0], [0.5, HEX_SQ3_2], [-0.5, HEX_SQ3_2], [-1, 0], [-0.5, -HEX_SQ3_2], [0.5, -HEX_SQ3_2]];

const HEX_MAX_LEVEL = 40;        // 3^-40 is 1e-19 of the whole; float64 positions give out long before
const HEX_SCALE = Array.from({ length: HEX_MAX_LEVEL + 2 }, (_, level) => Math.pow(3, -level));  // circumradius by level

// The view draws from hexaflakeAdaptive below; this plain full-detail list
// stays as the reference tests/visual/vector.spec.mjs checks it against:
// [x, y, level] of every hexagon down to depth, parents before children,
// the middle child first.
function hexaflakeHexagons(depth) {
  const out = [];
  (function recurse(x, y, level) {
    out.push([x, y, level]);
    if (level >= depth) return;
    const s = HEX_SCALE[level], o = s * 2 / 3;
    recurse(x, y, level + 1);
    for (const [dx, dy] of HEX_DIRS) recurse(x + o * dx, y + o * dy, level + 1);
  })(0, 0, 0);
  return out;
}

const HEX_FIT_HH = 1.0;          // half-height of the Reset framing; render's opts.fitHalfHeight overrides it
// Canvas px (not CSS px), as in the tree: the smallest hexagons carry the
// fine texture's brightness.
const HEX_PX_MIN = 1;            // canvas px: hexagons whose children would have a smaller radius aren't split
const HEX_LITE_PX_MIN = 3;       // the pixel limit while a drag or pinch is in progress (opts.lite)
const HEX_ZOOM_SLACK = 1.5;      // zoom headroom before a level beyond the slider's depth is added
const HEX_BUDGET = 40000;        // hexagons per frame; past it the pixel limit grows by half and the frame is redone
const HEX_GROUP = 32;            // hexagons per fill path (see render)
const HEX_CLIP_PX = 4000;        // hexagons with a larger radius (canvas px) are clipped to the canvas before drawing:
                                 // Canvas2D paths are float32 inside, and a corner 1e9 px away is off by tens of px

// The look: a flat shade per level, drawn from the outermost level inward so
// the gaps show the parent's. Each level turns the picked color's hue by
// HEX_HUE_STEP degrees (the tree turns every other level by 45) and is
// brighter than the one above it, up to HEX_BRIGHT_LEVELS levels in.
const HEX_HUE_STEP = -18;
const HEX_BRIGHT_MIN = 0.42;     // brightness of the outermost hexagon (1 = the picked color's own)
const HEX_BRIGHT_LEVELS = 5;

// The hexagons of the flake the viewport needs, in the order of
// hexaflakeHexagons(depth) (the ones that are visible, only), written to buf
// as x, y pairs with their levels in lvl. A hexagon whose whole subtree is
// off screen is skipped along with it (the subtree stays inside the hexagon,
// so one disc test covers both). One splits while the slider asks for it
// (level < depth), and beyond that while its radius is over refPx, so zooming
// in keeps adding levels (pass Infinity for exactly depth levels); one whose
// children would have a radius under pxMin stays a leaf.
// Returns { n, maxLevel, coverLevel, overflow }: coverLevel is the deepest
// level with a hexagon that covers the whole canvas, which paints over
// everything of the levels above it (those need not be drawn); overflow
// means the budget ran out and buf is incomplete.
function hexaflakeAdaptive(aff, buf, lvl, depth, pxMin, refPx) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const cap = lvl.length - 2;
  const needR = Math.min(w, h) / 2 / HEX_SQ3_2;   // a hexagon smaller than this can't cover the canvas
  let n = 0, maxLevel = 0, coverLevel = 0, visits = 0, overflow = false;

  // Whether the canvas's four corners all lie inside the hexagon at screen
  // (sx, sy) of radius R px, two px in from its edges.
  function covers(sx, sy, R) {
    const e = 2 / R;
    for (let i = 0; i < 4; i++) {
      const dx = (i & 1 ? w : 0) - sx, dy = (i & 2 ? h : 0) - sy;
      // Screen offset to the hexagon's own unit coordinates. The view's
      // matrix [a b; c d] is k times a reflection, so it is its own inverse
      // up to k^2 (and the radius is s * k).
      const ux = Math.abs(a * dx + b * dy) / (k * R), uy = Math.abs(c * dx + d * dy) / (k * R);
      if (uy > HEX_SQ3_2 - e || HEX_SQ3_2 * 2 * ux + uy > 2 * HEX_SQ3_2 - 2 * e) return false;
    }
    return true;
  }

  function hexagon(x, y, level) {
    if (overflow) return;
    // Hexagons off screen whose subtree reaches the screen count as visits
    // but not toward n, so they get their own limit.
    if (n >= cap || ++visits > cap * 8) { overflow = true; return; }
    const mx = x - cx, my = y - cy;
    const sx = hw + a * mx + b * my, sy = hh + c * mx + d * my;
    const s = HEX_SCALE[level], R = s * k;
    const r = R + VECTOR_CULL_MARGIN;
    if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) return;
    buf[2 * n] = x; buf[2 * n + 1] = y; lvl[n] = level;
    n++;
    if (level > maxLevel) maxLevel = level;
    if (R >= needR && level > coverLevel && covers(sx, sy, R)) coverLevel = level;
    if (level < HEX_MAX_LEVEL && R / 3 >= pxMin && (level < depth || R > refPx)) {
      const o = s * 2 / 3;
      hexagon(x, y, level + 1);
      for (let j = 0; j < 6; j++) hexagon(x + o * HEX_DIRS[j][0], y + o * HEX_DIRS[j][1], level + 1);
    }
  }

  hexagon(0, 0, 0);
  return { n, maxLevel, coverLevel, overflow };
}

// Same Canvas2D view shape as createPythagorasTreeView (view/resize/render/
// worldToScreen/screenToWorld/dpr) so attachVectorViewInteraction in
// interaction.js works on this unmodified.
function createHexaflakeView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0, cy: 0, halfHeight: 1.1, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const buf = new Float64Array(2 * (HEX_BUDGET + 2));
  const lvl = new Uint8Array(HEX_BUDGET + 2);          // hexaflakeAdaptive's level per hexagon
  const order = new Uint32Array(HEX_BUDGET + 2);       // hexagons' indices grouped by level (see render)
  const levelStart = new Uint32Array(HEX_MAX_LEVEL + 3);
  let extraLevels = 0;
  let cssKey = -1, css = [];                           // the fill per level for one picked color

  // The picked color with its hue turned by deg degrees (the same turn as
  // the tree's alternate levels, pythagoras.js).
  function hueTurned([r, g, b], deg) {
    const ha = deg * Math.PI / 180, hc = Math.cos(ha), hs = Math.sin(ha);
    return [
      r * (0.213 + hc * 0.787 - hs * 0.213) + g * (0.715 - hc * 0.715 - hs * 0.715) + b * (0.072 - hc * 0.072 + hs * 0.928),
      r * (0.213 - hc * 0.213 + hs * 0.143) + g * (0.715 + hc * 0.285 + hs * 0.140) + b * (0.072 - hc * 0.072 - hs * 0.283),
      r * (0.213 - hc * 0.213 - hs * 0.787) + g * (0.715 - hc * 0.715 + hs * 0.715) + b * (0.072 + hc * 0.928 + hs * 0.072),
    ];
  }

  function levelFills(colorIndex) {
    if (colorIndex === cssKey) return css;
    const base = SOLID_COLORS[colorIndex].rgb;
    const byte = (v) => Math.max(0, Math.min(255, Math.round(v)));
    css = [];
    for (let level = 0; level <= HEX_MAX_LEVEL; level++) {
      const f = HEX_BRIGHT_MIN + (1 - HEX_BRIGHT_MIN) * Math.min(level, HEX_BRIGHT_LEVELS) / HEX_BRIGHT_LEVELS;
      const [r, g, b] = hueTurned(base, HEX_HUE_STEP * level);
      css.push(`rgb(${byte(r * f)},${byte(g * f)},${byte(b * f)})`);
    }
    cssKey = colorIndex;
    return css;
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

  // The polygon pts ([x0, y0, x1, y1, ...]) clipped to the canvas plus a
  // margin (Sutherland-Hodgman, in float64).
  function clipToCanvas(pts, w, h) {
    const m = 16;
    const edges = [
      [(x) => x >= -m, (x1, y1, x2, y2) => [-m, y1 + (y2 - y1) * (-m - x1) / (x2 - x1)]],
      [(x) => x <= w + m, (x1, y1, x2, y2) => [w + m, y1 + (y2 - y1) * (w + m - x1) / (x2 - x1)]],
      [(x, y) => y >= -m, (x1, y1, x2, y2) => [x1 + (x2 - x1) * (-m - y1) / (y2 - y1), -m]],
      [(x, y) => y <= h + m, (x1, y1, x2, y2) => [x1 + (x2 - x1) * (h + m - y1) / (y2 - y1), h + m]],
    ];
    for (const [inside, cut] of edges) {
      const out = [];
      for (let i = 0; i < pts.length; i += 2) {
        const j = (i + 2) % pts.length;
        const x1 = pts[i], y1 = pts[i + 1], x2 = pts[j], y2 = pts[j + 1];
        const in1 = inside(x1, y1), in2 = inside(x2, y2);
        if (in1) out.push(x1, y1);
        if (in1 !== in2) out.push(...cut(x1, y1, x2, y2));
      }
      pts = out;
      if (!pts.length) break;
    }
    return pts;
  }

  function render(opts) {
    resize();
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    extraLevels = 0;
    const aff = vectorAffine(view, canvas.width, canvas.height);
    if (!aff.ok) return;

    // refPx: how large a hexagon may stay at the slider's depth: the radius a
    // depth-level hexagon has when the flake is fitted to this canvas (the
    // half-height interaction.js's Reset framing uses), with some headroom. It
    // doesn't change as you zoom, so zooming in is what adds levels.
    const refPx = Math.pow(1 / 3, opts.depth) * (canvas.height / 2 / (opts.fitHalfHeight || HEX_FIT_HH)) * HEX_ZOOM_SLACK;
    let pxMin = opts.lite ? HEX_LITE_PX_MIN : HEX_PX_MIN;
    let r = hexaflakeAdaptive(aff, buf, lvl, opts.depth, pxMin, refPx);
    for (let tries = 0; r.overflow && tries < 12; tries++) {
      pxMin *= 1.5;
      r = hexaflakeAdaptive(aff, buf, lvl, opts.depth, pxMin, refPx);
    }
    extraLevels = Math.max(0, r.maxLevel - opts.depth);

    // Painter's order: a counting sort puts the hexagons' indices in order[],
    // outermost level first, so every level is painted over its parent's. A
    // hexagon covering the whole canvas hides the levels above it.
    levelStart.fill(0);
    for (let i = 0; i < r.n; i++) levelStart[lvl[i] + 1]++;
    for (let l = 0; l <= HEX_MAX_LEVEL; l++) levelStart[l + 1] += levelStart[l];
    const fillAt = levelStart.slice();
    for (let i = 0; i < r.n; i++) order[fillAt[lvl[i]]++] = i;

    // The six corners of a unit hexagon on screen (a hexagon of size s puts
    // its corners s times these from its center).
    const { a, b, c, d, cx, cy, hw, hh } = aff;
    const vx = new Float64Array(6), vy = new Float64Array(6);
    for (let j = 0; j < 6; j++) {
      vx[j] = a * HEX_DIRS[j][0] + b * HEX_DIRS[j][1];
      vy[j] = c * HEX_DIRS[j][0] + d * HEX_DIRS[j][1];
    }
    const fills = levelFills(opts.colorIndex);
    const pts = new Array(12);
    // One path per group of hexagons, instead of a path and a fill per
    // hexagon (the tree's reasoning, pythagoras.js: Canvas2D's cost per path
    // grows faster than its size). Every hexagon winds the same way, so a
    // group's fill is the union of its hexagons.
    // (render's opts.cover === false draws them anyway, to test that.)
    for (let level = opts.cover === false ? 0 : r.coverLevel; level <= r.maxLevel; level++) {
      const from = levelStart[level], to = levelStart[level + 1];
      if (to <= from) continue;
      ctx.fillStyle = fills[level];
      const s = HEX_SCALE[level], R = s * aff.k;
      for (let g = from; g < to; g += HEX_GROUP) {
        const end = Math.min(to, g + HEX_GROUP);
        ctx.beginPath();
        for (let j = g; j < end; j++) {
          const i = order[j];
          const mx = buf[2 * i] - cx, my = buf[2 * i + 1] - cy;
          const sx = hw + a * mx + b * my, sy = hh + c * mx + d * my;
          if (R > HEX_CLIP_PX) {
            for (let q = 0; q < 6; q++) { pts[2 * q] = sx + s * vx[q]; pts[2 * q + 1] = sy + s * vy[q]; }
            const poly = clipToCanvas(pts.slice(), aff.w, aff.h);
            if (poly.length < 6) continue;
            ctx.moveTo(poly[0], poly[1]);
            for (let q = 2; q < poly.length; q += 2) ctx.lineTo(poly[q], poly[q + 1]);
          } else {
            ctx.moveTo(sx + s * vx[0], sy + s * vy[0]);
            for (let q = 1; q < 6; q++) ctx.lineTo(sx + s * vx[q], sy + s * vy[q]);
          }
          ctx.closePath();
        }
        ctx.fill();
      }
    }
  }

  return {
    view, resize, render, worldToScreen, screenToWorld,
    get dpr() { return dpr; },
    // Levels the last render added beyond the depth slider because of zoom.
    get extraLevels() { return extraLevels; },
  };
}
