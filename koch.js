// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { SOLID_COLORS, hueTurned, solidCss, strokeWidthFor } from "./colormaps.js?v=1.53.11";
import { KOCH_SNOWFLAKE, lsystemPolylines } from "./lsystem.js?v=1.53.11";
import { VECTOR_CULL_MARGIN, paintBackdrop, vectorAffine } from "./vectorgeom.js?v=1.53.11";

// Koch snowflake: a Canvas2D view with the same pan/zoom/animate/fill/
// colormap feature set as the original koch.py port -- pure vector
// geometry at these depths, so it needs no shader.

// Geometry comes from the shared L-system engine (lsystem.js,
// KOCH_SNOWFLAKE). The turtle is placed so the result is exactly the old
// koch.py port's snowflake -- a triangle on the unit circle with vertices at
// 90/210/330 degrees, spanning x +-0.866, y -0.5..1 at depth 0 -- which
// interaction.js's vectorViewBox("koch") is fitted to: start at the top vertex
// heading -60 degrees, one step = edge length sqrt(3) / 3^depth.
// KOCH_SNOWFLAKE turns right at the corners (clockwise), so bumps go out
// to the left; the old code walked the triangle counter-clockwise, so
// the list is reversed to keep the same vertex order. Checked point for
// point against the old kochSegment/kochSnowflake at depths 0-8 (max
// difference 1.6e-13) before they were removed.
// The view no longer draws from this list (kochAdaptive below builds only
// what's on screen, at any zoom); it stays as the plain full-detail
// reference that tests/visual/vector.spec.mjs checks kochAdaptive against.
export function kochSnowflake(depth) {
  const [verts] = lsystemPolylines(KOCH_SNOWFLAKE, depth, {
    start: [0, 1], startHeadingDeg: -60, step: Math.sqrt(3) / Math.pow(3, depth),
  });
  return verts.reverse();
}

export const KOCH_EDGE = Math.sqrt(3);   // world length of the depth-0 triangle's sides
export const KOCH_FIT_HH = 1.12;        // half-height of the Reset framing on a wide canvas; render's opts.fitHalfHeight overrides it
export const KOCH_PX_MIN = 1;            // CSS px: a piece whose thirds would be shorter stays one straight line
export const KOCH_LITE_PX_MIN = 3;       // CSS px: the pixel limit while a drag or pinch is in progress (opts.lite)
export const KOCH_ZOOM_SLACK = 1.5;      // zoom headroom before a level beyond the slider's depth is added
export const KOCH_BUDGET = 100000;       // vertices per frame; past it the pixel limit grows by half and the frame is redone
export const KOCH_MAX_LEVEL = 40;        // 3^-40 is already below double precision for any view

// The look. Each generation of triangles (the level-0 triangle, then the bumps
// each split adds, see kochAdaptive) has its own flat shade, brighter than its
// parent's and with its hue closer to the picked color's, up to
// KOCH_BRIGHT_LEVELS generations in; the finest generation of a snowflake with
// that many or fewer is the picked color itself, so the shading spreads over
// however many levels there are. Past KOCH_BRIGHT_LEVELS the shade holds (the
// hue never wanders, however deep a zoom goes) except that every other
// generation is dimmer, so a generation is told from its parent at any depth.
// The level-0 triangle, the biggest area, is a deep, slightly radial gradient.
// Where the triangles are big enough a thin dark gutter runs along each one's
// base edge, between it and its parent. One fill per generation, never one per
// triangle.
export const KOCH_HUE_SPAN = -6;          // degrees (OKLCH, see hueTurned) the level-0 triangle's hue is turned from the picked color's
export const KOCH_BRIGHT_MIN = 0.74;      // brightness of the level-0 triangle (1 = the picked color's own); it is most of the area, so not too deep
export const KOCH_BRIGHT_LEVELS = 4;
export const KOCH_ALT_DIM = 0.82;         // brightness of every other generation past KOCH_BRIGHT_LEVELS
export const KOCH_CORE_GAIN = 1.10;      // the level-0 gradient: this brightness at the center ...
export const KOCH_EDGE_GAIN = 0.9;       // ... and this at the corners
export const KOCH_GRADIENT_MAX_K = 1e6;   // canvas px per world unit: past this zoom the level-0 gradient is a flat fill
export const KOCH_GUTTER_PX_MIN = 8;     // canvas px: triangles with a shorter edge get no gutter
export const KOCH_GUTTER_RGB = "rgba(4,7,14,0.6)";  // near-black navy, not pure black
export const KOCH_TRI_BUDGET = 40000;     // triangles shaded per frame; the rest keep the underlay's flat color
export const KOCH_LITE_TRI_BUDGET = 1200; // the same while a drag or pinch is in progress (opts.lite)
export const KOCH_GLOW_MAX_VERTS = 20000; // no glow around a silhouette with more vertices than this
export const KOCH_GLOW_WIDTH = 7;         // css px, the wide soft pass
export const KOCH_GLOW_ALPHA = 0.07;
export const KOCH_LINE_LIGHTEN = 0.18;    // share of the way to white the outline's line is lightened
export const KOCH_CORE_MIN_PX = 1.3;     // css px: the outline's line is never thinner
export const KOCH_GROW_MS = 320;          // a new generation grows in over this long (the depth slider's step)
export const KOCH_GROW_STEP_SHARE = 0.6;  // ... and never over more than this share of a depth-play step

// The shade of generation g for the picked color: brightness and hue climb
// from the level-0 triangle to the picked color over `span` generations.
// (Also read by the color button's pill, colormap-picker.js.)
export function kochShade(base, g, span) {
  const t = span > 0 ? Math.min(g, KOCH_BRIGHT_LEVELS, span) / span : 1;
  let f = KOCH_BRIGHT_MIN + (1 - KOCH_BRIGHT_MIN) * t;
  if (g > KOCH_BRIGHT_LEVELS && (g - KOCH_BRIGHT_LEVELS) % 2) f *= KOCH_ALT_DIM;
  return hueTurned(base, KOCH_HUE_SPAN * (1 - t)).map((v) => Math.max(0, Math.min(255, Math.round(v * f))));
}

// The buffers kochAdaptive collects triangles into (a bump is made of three
// vertices of the walk, so the vertex budget bounds them).
export function makeKochTris(maxVerts) {
  const cap = Math.floor(maxVerts / 3) + 4;
  return {
    pts: new Float64Array(6 * cap), gen: new Uint8Array(cap), order: new Uint32Array(cap),
    count: new Uint32Array(KOCH_MAX_LEVEL + 2), start: new Uint32Array(KOCH_MAX_LEVEL + 3),
    n: 0, growGen: 0, growS: 1,
  };
}

// The snowflake as the viewport needs it, in the order and orientation of
// kochSnowflake(depth) (counter-clockwise from the top vertex), written to
// buf as canvas-pixel x, y pairs. Each side is split recursively:
//   - a piece wholly off screen stays a straight chord. A Koch piece lies
//     inside the triangle on its chord, which sits inside the disc around
//     the chord's midpoint with the chord as diameter, so the chord and the
//     piece differ only off screen (the fill stays right);
//   - a piece splits while the slider asks for it (level < depth), and
//     beyond that while it is still longer than refPx, so zooming in keeps
//     adding levels instead of showing straight edges. Pass Infinity for
//     refPx to get exactly depth levels;
//   - a piece whose thirds would be shorter than pxMin stays one line: its
//     bump is under a pixel high.
// Returns { n: vertex count, leaves, leafPx: summed on-screen leaf length,
// maxLevel, overflow: the budget ran out and buf is incomplete }.
//
// tri (optional, see makeKochTris) also collects the triangles the splits add,
// the way the view shades them generation by generation: every split at level L
// adds one bump, a triangle of generation L + 1 (the level-0 triangle is
// generation 0), written to tri.pts as canvas-pixel x, y pairs for its base
// corners and its tip, tagged in tri.gen and counted in tri.count. While a new
// generation grows in (tri.growGen > 0 and tri.growS < 1) that generation's
// tips are pulled back toward their base edges by growS, and no piece is split
// to a level past it.
export function kochAdaptive(aff, buf, depth, pxMin, refPx, tri) {
  const { k, a, b, c, d, cx, cy, hw, hh, w, h } = aff;
  const cap = buf.length / 2 - 2;
  let n = 0, leaves = 0, leafPx = 0, maxLevel = 0, overflow = false;
  const growGen = tri ? tri.growGen : 0, growS = tri ? tri.growS : 1;
  const capLevel = growGen > 0 ? growGen : KOCH_MAX_LEVEL;
  if (tri) { tri.n = 0; tri.count.fill(0); }

  function emit(x, y) {
    const dx = x - cx, dy = y - cy;
    buf[2 * n] = hw + a * dx + b * dy;
    buf[2 * n + 1] = hh + c * dx + d * dy;
    n++;
  }

  // Draws A->B's piece, ending at B. len is the chord's world length.
  function piece(ax, ay, bx, by, level, len) {
    if (overflow) return;
    if (n >= cap) { overflow = true; return; }
    const mx = (ax + bx) / 2 - cx, my = (ay + by) / 2 - cy;
    const sx = hw + a * mx + b * my, sy = hh + c * mx + d * my;
    const px = len * k;
    const r = px / 2 + VECTOR_CULL_MARGIN;
    if (sx + r < 0 || sx - r > w || sy + r < 0 || sy - r > h) { emit(bx, by); return; }
    if (level < capLevel && px / 3 >= pxMin && (level < depth || px > refPx)) {
      const ux = (bx - ax) / 3, uy = (by - ay) / 3;
      const p1x = ax + ux, p1y = ay + uy, p2x = p1x + ux, p2y = p1y + uy;
      // The bump turns the middle third a sixth of a turn to the right,
      // which is outward for a counter-clockwise outline.
      let tx = p1x + ux * 0.5 + uy * (Math.sqrt(3) / 2), ty = p1y + uy * 0.5 - ux * (Math.sqrt(3) / 2);
      if (level + 1 === growGen && growS < 1) {
        const mx = p1x + ux * 0.5, my = p1y + uy * 0.5;   // middle of the base edge
        tx = mx + (tx - mx) * growS;
        ty = my + (ty - my) * growS;
      }
      if (tri) {
        const o = 6 * tri.n;
        let dx = p1x - cx, dy = p1y - cy;
        tri.pts[o] = hw + a * dx + b * dy; tri.pts[o + 1] = hh + c * dx + d * dy;
        dx = tx - cx; dy = ty - cy;
        tri.pts[o + 2] = hw + a * dx + b * dy; tri.pts[o + 3] = hh + c * dx + d * dy;
        dx = p2x - cx; dy = p2y - cy;
        tri.pts[o + 4] = hw + a * dx + b * dy; tri.pts[o + 5] = hh + c * dx + d * dy;
        tri.gen[tri.n++] = level + 1;
        tri.count[level + 1]++;
      }
      const l3 = len / 3;
      piece(ax, ay, p1x, p1y, level + 1, l3);
      piece(p1x, p1y, tx, ty, level + 1, l3);
      piece(tx, ty, p2x, p2y, level + 1, l3);
      piece(p2x, p2y, bx, by, level + 1, l3);
    } else {
      leaves++;
      leafPx += px;
      if (level > maxLevel) maxLevel = level;
      emit(bx, by);
    }
  }

  const half = KOCH_EDGE / 2;
  emit(0, 1);
  piece(0, 1, -half, -0.5, 0, KOCH_EDGE);
  piece(-half, -0.5, half, -0.5, 0, KOCH_EDGE);
  piece(half, -0.5, 0, 1, 0, KOCH_EDGE);
  return { n, leaves, leafPx, maxLevel, overflow };
}

export function createKochView(canvas) {
  const ctx = canvas.getContext("2d");
  const view = { cx: 0, cy: 0, halfHeight: 1.4, rotation: 0 };
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  const buf = new Float64Array(2 * (KOCH_BUDGET + 2));
  const tri = makeKochTris(KOCH_BUDGET + 2);
  let extraLevels = 0;
  // A generation growing in (see startGrow), or null.
  let growth = null;
  // What the last frame drew, for the tests: triangles collected and shaded, fills and strokes issued, glow,
  // gutters, the finest generation, and (outline) the line's width in canvas px.
  let lastStats = { tris: 0, shaded: 0, fills: 0, strokes: 0, glow: false, gutters: 0, finest: 0, core: 0 };

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
  // convention exactly (rotate the screen-space offset by +rotation to get
  // world axes, by -rotation for the inverse) so attachVectorViewInteraction's
  // two-finger twist and pan both work the same way the WebGL canvases do.
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

  // The next generation (the one the depth slider just added) grows in over
  // ms: its triangles rise from their base edges, easing out. It ends by
  // itself at the final frame, and ends at once when the depth changes again,
  // a gesture is under way or the view moves (render checks all three), or
  // cancelGrow() is called (mode switch, Save image).
  function startGrow(gen, ms) {
    growth = { gen, ms, t0: performance.now(), view: { cx: view.cx, cy: view.cy, halfHeight: view.halfHeight, rotation: view.rotation || 0 } };
  }
  function cancelGrow() { growth = null; }

  function render(opts) {
    resize();
    paintBackdrop(ctx, canvas.width, canvas.height);
    extraLevels = 0;
    const stats = lastStats = { tris: 0, shaded: 0, fills: 0, strokes: 0, glow: false, gutters: 0, finest: 0, core: 0 };
    const aff = vectorAffine(view, canvas.width, canvas.height);
    if (!aff.ok) return;

    let growS = 1;
    if (growth) {
      const moved = view.cx !== growth.view.cx || view.cy !== growth.view.cy
        || view.halfHeight !== growth.view.halfHeight || (view.rotation || 0) !== growth.view.rotation;
      const t = ((opts.now !== undefined ? opts.now : performance.now()) - growth.t0) / growth.ms;
      if (opts.lite || moved || opts.depth !== growth.gen || t >= 1) growth = null;
      else growS = 1 - Math.pow(1 - Math.max(0, t), 3);
    }
    tri.growGen = growth ? growth.gen : 0;
    tri.growS = growS;

    // refPx: how long a piece may stay at the slider's depth: the length a
    // depth-sized piece has when the shape is fitted to this canvas (the
    // half-height interaction.js's Reset framing uses), with some headroom. It
    // doesn't change as you zoom, so zooming in is what adds levels.
    const refPx = KOCH_EDGE * Math.pow(1 / 3, opts.depth) * (canvas.height / 2 / (opts.fitHalfHeight || KOCH_FIT_HH)) * KOCH_ZOOM_SLACK;
    let pxMin = (opts.lite ? KOCH_LITE_PX_MIN : KOCH_PX_MIN) * dpr;
    let r = kochAdaptive(aff, buf, opts.depth, pxMin, refPx, tri);
    for (let tries = 0; r.overflow && tries < 12; tries++) {
      pxMin *= 1.5;
      r = kochAdaptive(aff, buf, opts.depth, pxMin, refPx, tri);
    }
    extraLevels = Math.max(0, r.maxLevel - opts.depth);
    // A generation too small to show has nothing to grow.
    if (growth && tri.count[growth.gen] === 0) { growth = null; growS = 1; }

    const base = SOLID_COLORS[opts.colorIndex].rgb;
    const color = solidCss(opts.colorIndex);
    const silhouette = () => {
      ctx.beginPath();
      ctx.moveTo(buf[0], buf[1]);
      for (let i = 1; i < r.n; i++) ctx.lineTo(buf[2 * i], buf[2 * i + 1]);
      ctx.closePath();
    };
    // The outline again for the glow, with the vertices closer together than a
    // quarter of the glow's width left out: a soft wide stroke can't show them,
    // and stroking every vertex of a dense outline costs most of the glow.
    const glowPath = (width) => {
      const gap2 = (width / 4) * (width / 4);
      let lx = buf[0], ly = buf[1];
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      for (let i = 1; i < r.n; i++) {
        const x = buf[2 * i], y = buf[2 * i + 1];
        if ((x - lx) * (x - lx) + (y - ly) * (y - ly) >= gap2) { ctx.lineTo(x, y); lx = x; ly = y; }
      }
      ctx.closePath();
    };
    const glowOk = !opts.lite && r.n <= KOCH_GLOW_MAX_VERTS;

    if (!opts.fill) {
      // A bright line, never thinner than KOCH_CORE_MIN_PX: the pieces are all
      // about one length, so their mean sets the width above that.
      const core = Math.max(KOCH_CORE_MIN_PX * dpr, strokeWidthFor(r.leaves ? r.leafPx / r.leaves : 0, dpr));
      ctx.lineJoin = "round";
      if (glowOk) {
        stats.glow = true;
        const gw = Math.max(core * 3.5, KOCH_GLOW_WIDTH * 0.8 * dpr);
        glowPath(gw);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color;
        ctx.globalAlpha = KOCH_GLOW_ALPHA * 1.6;
        ctx.lineWidth = gw;
        ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        stats.strokes++;
      }
      silhouette();
      // The line itself a touch lighter than the picked color, so it holds against the glow.
      ctx.strokeStyle = `rgb(${base.map((v) => Math.round(v + (255 - v) * KOCH_LINE_LIGHTEN)).join(",")})`;
      ctx.lineWidth = core;
      ctx.stroke();
      stats.strokes++;
      stats.finest = r.maxLevel;
      stats.core = core;
      return;
    }

    // How many generations the shades are spread over: all of them up to
    // KOCH_BRIGHT_LEVELS; while a new generation grows in, one fewer plus its
    // progress, so the colors slide rather than jump.
    const fin = r.maxLevel;
    const span = Math.min(KOCH_BRIGHT_LEVELS, growth ? growth.gen - 1 + growS : fin);
    const css = (g) => `rgb(${kochShade(base, g, span).join(",")})`;
    stats.finest = fin;
    stats.tris = tri.n;

    // Sort the triangles by generation, and see how many generations fit the
    // frame's budget; the rest are left to the underlay's flat color.
    const budget = opts.lite ? KOCH_LITE_TRI_BUDGET : KOCH_TRI_BUDGET;
    let acc = 0, shadedTo = 0;
    for (let g = 0; g <= KOCH_MAX_LEVEL + 1; g++) {
      tri.start[g] = acc;
      acc += tri.count[g];
    }
    tri.start[KOCH_MAX_LEVEL + 2] = acc;
    const pos = tri.start.slice();
    for (let i = 0; i < tri.n; i++) tri.order[pos[tri.gen[i]]++] = i;
    // The finest generation is the underlay's own shade (below), so its
    // triangles, the most numerous and the smallest, are only drawn when they
    // are big enough to carry a gutter.
    const edgeOf = (g) => KOCH_EDGE / Math.pow(3, g) * aff.k;
    const gutterOn = (g) => !opts.lite && edgeOf(g) >= KOCH_GUTTER_PX_MIN * dpr;
    const top = gutterOn(fin) ? fin : fin - 1;
    let cum = 0;
    for (let g = 1; g <= top && cum + tri.count[g] <= budget; g++) { cum += tri.count[g]; shadedTo = g; }
    stats.shaded = cum;

    // Underneath: the soft glow, then the silhouette in the finest generation's
    // shade. It colors the generations that aren't drawn one by one, and under
    // the others it hides the hairline between neighbors.
    if (glowOk) {
      stats.glow = true;
      glowPath(KOCH_GLOW_WIDTH * dpr);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineJoin = "bevel";
      ctx.strokeStyle = color;
      ctx.globalAlpha = KOCH_GLOW_ALPHA;
      ctx.lineWidth = KOCH_GLOW_WIDTH * dpr;
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      stats.strokes++;
    }
    silhouette();
    ctx.fillStyle = css(fin);
    ctx.fill();
    stats.fills++;

    // The level-0 triangle, a deep radial gradient.
    const c0 = kochShade(base, 0, span);
    const sx = (x, y) => aff.hw + aff.a * (x - aff.cx) + aff.b * (y - aff.cy);
    const sy = (x, y) => aff.hh + aff.c * (x - aff.cx) + aff.d * (y - aff.cy);
    const half = KOCH_EDGE / 2;
    const gain = (m) => `rgb(${c0.map((v) => Math.min(255, Math.round(v * m))).join(",")})`;
    // The gradient shader over most of the screen costs a couple of ms, so a lite
    // frame (and a zoom so deep the gradient is flat and its numbers huge, which
    // some browsers refuse) fills the triangle flat, in the gradient's shade
    // where the view is centered, but never lighter than 1: the first
    // generation's shade (0.74 + 0.065 = 0.8 of the picked color) must stay
    // above the triangle it grows from, and the gradient's core alone is not.
    if (opts.lite || !(aff.k < KOCH_GRADIENT_MAX_K)) {
      ctx.fillStyle = gain(Math.min(1, KOCH_CORE_GAIN + (KOCH_EDGE_GAIN - KOCH_CORE_GAIN) * Math.min(1, Math.hypot(view.cx, view.cy))));
    } else {
      const grad = ctx.createRadialGradient(sx(0, 0), sy(0, 0), 0, sx(0, 0), sy(0, 0), aff.k);
      grad.addColorStop(0, gain(KOCH_CORE_GAIN));
      grad.addColorStop(1, gain(KOCH_EDGE_GAIN));
      ctx.fillStyle = grad;
    }
    ctx.beginPath();
    ctx.moveTo(sx(0, 1), sy(0, 1));
    ctx.lineTo(sx(-half, -0.5), sy(-half, -0.5));
    ctx.lineTo(sx(half, -0.5), sy(half, -0.5));
    ctx.closePath();
    ctx.fill();
    stats.fills++;

    // Each generation's triangles in one path, with its gutters (the base
    // edges, which run between a triangle and its parent) in another.
    ctx.lineJoin = "round";
    for (let g = 1; g <= shadedTo; g++) {
      const from = tri.start[g], to = from + tri.count[g];
      if (to <= from) continue;
      ctx.fillStyle = css(g);
      ctx.beginPath();
      for (let i = from; i < to; i++) {
        const o = 6 * tri.order[i];
        ctx.moveTo(tri.pts[o], tri.pts[o + 1]);
        ctx.lineTo(tri.pts[o + 2], tri.pts[o + 3]);
        ctx.lineTo(tri.pts[o + 4], tri.pts[o + 5]);
        ctx.closePath();
      }
      ctx.fill();
      stats.fills++;
      if (gutterOn(g)) {
        ctx.strokeStyle = KOCH_GUTTER_RGB;
        ctx.lineWidth = Math.min(1.6 * dpr, edgeOf(g) * 0.06);
        ctx.beginPath();
        for (let i = from; i < to; i++) {
          const o = 6 * tri.order[i];
          ctx.moveTo(tri.pts[o], tri.pts[o + 1]);
          ctx.lineTo(tri.pts[o + 4], tri.pts[o + 5]);
        }
        ctx.stroke();
        stats.strokes++;
        stats.gutters++;
      }
    }
  }

  return {
    view, resize, render, worldToScreen, screenToWorld, startGrow, cancelGrow,
    get dpr() { return dpr; },
    // Levels the last render added beyond the depth slider because of zoom.
    get extraLevels() { return extraLevels; },
    // True from startGrow until the render that draws the finished frame.
    get growing() { return growth !== null; },
    get growStart() { return growth ? growth.t0 : 0; },
    get growMs() { return growth ? growth.ms : 0; },
    get stats() { return lastStats; },
  };
}
