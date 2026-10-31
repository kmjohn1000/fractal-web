// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).

// Shared by the Canvas2D pattern views (koch.js, pythagoras.js, dragon.js):
// the view's world-to-canvas map as plain numbers, so a render loop can
// transform thousands of points without allocating, and the visibility test
// that lets a recursion skip whatever is off screen.

// The backdrop of every pattern view (the eleven shapes): a very dark navy
// that is lightest around the middle of the canvas and fades to near-black at
// the edges, so the drawing sits in a little light instead of on a flat black
// hole. Subtle on purpose: the shapes carry the color. The Canvas2D views
// paint it with paintBackdrop; the chaos-game views, which draw straight into
// a pixel buffer, take the same colors from backdropPixels.
export const BACKDROP_CENTER_RGB = [16, 23, 34];
export const BACKDROP_EDGE_RGB = [2, 3, 6];
export const BACKDROP_CENTER_Y = 0.46;  // where the light sits, as a share of the height from the top
export const BACKDROP_RADIUS = 0.55;    // of the canvas diagonal

export function paintBackdrop(ctx, w, h) {
  const cy = h * BACKDROP_CENTER_Y;
  const g = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, Math.hypot(w, h) * BACKDROP_RADIUS);
  g.addColorStop(0, `rgb(${BACKDROP_CENTER_RGB.join(",")})`);
  g.addColorStop(1, `rgb(${BACKDROP_EDGE_RGB.join(",")})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// The same backdrop as w * h * 3 bytes (r, g, b per pixel, row by row).
export function backdropPixels(w, h) {
  const out = new Uint8Array(w * h * 3);
  const cx = w / 2, cy = h * BACKDROP_CENTER_Y, radius = Math.hypot(w, h) * BACKDROP_RADIUS;
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const t = Math.min(1, Math.hypot(x + 0.5 - cx, dy + 0.5) / radius), o = (y * w + x) * 3;
      // Interleaved gradient noise (Jimenez), one value per pixel, shifts the rounding, so
      // the dark gradient dithers instead of banding in 40 px steps.
      let dn = 0.06711056 * x + 0.00583715 * y;
      dn = 52.9829189 * (dn - Math.floor(dn));
      dn = dn - Math.floor(dn) - 0.5;
      for (let q = 0; q < 3; q++) out[o + q] = Math.round(BACKDROP_CENTER_RGB[q] + (BACKDROP_EDGE_RGB[q] - BACKDROP_CENTER_RGB[q]) * t + dn);
    }
  }
  return out;
}

// Extra room around the canvas (canvas px) inside which a piece still counts
// as visible, so the stroke of a piece just past the edge isn't clipped short.
export const VECTOR_CULL_MARGIN = 8;

// The same map as each view's worldToScreen (rotation-aware, y up), written
// as   sx = hw + a * (x - cx) + b * (y - cy)
//      sy = hh + c * (x - cx) + d * (y - cy)
// Offsets are taken from the view center first so precision holds at deep
// zoom, where x and cx agree to many digits. k is canvas px per world unit.
// ok is false for a view the arithmetic can't handle (a non-finite or
// zero halfHeight from a hand-edited link); callers then draw nothing.
export function vectorAffine(view, width, height) {
  const k = height / 2 / view.halfHeight;
  const rot = -(view.rotation || 0);
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return {
    k, a: k * cs, b: -k * sn, c: -k * sn, d: -k * cs,
    cx: view.cx, cy: view.cy, hw: width / 2, hh: height / 2, w: width, h: height,
    ok: Number.isFinite(k) && k > 0 && Number.isFinite(view.cx) && Number.isFinite(view.cy) && Number.isFinite(cs) && Number.isFinite(sn),
  };
}

// True when a disc (center sx, sy; radius r; canvas px) lies wholly outside
// the canvas plus the cull margin.
export function vectorDiscOffscreen(aff, sx, sy, r) {
  const m = r + VECTOR_CULL_MARGIN;
  return sx + m < 0 || sx - m > aff.w || sy + m < 0 || sy - m > aff.h;
}
