// Screen/world coordinate math for the WebGL panes: screenToComplex, centerForAnchor and normalizeAngle,
// and the exact (BigInt) view center that deep views carry beside cx and cy.
// Pure functions of a renderer's canvas and a view state; imports nothing. Split from render-layout.js
// (a pure move).
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).

export function screenToComplex(renderer, state, sx, sy) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const uvx = (sx * dpr - 0.5 * canvas.width) / canvas.height;
  const uvy = (0.5 * canvas.height - sy * dpr) / canvas.height;
  const rot = state.rotation || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  // Rotate the screen-space offset into world axes before scaling — must
  // stay in sync with FRAG_SRC's identical rotation of uv, or the rendered
  // fractal and every pointer/gesture computation that goes through this
  // function (pan, box-zoom, the Julia-c crosshair) disagree about "up".
  const wx = uvx * cos - uvy * sin;
  // flipY (the Burning Ship): the rotated offset's imaginary part is
  // mirrored, last, as FRAG_SRC's main() does with u_flipY.
  const wy = (uvx * sin + uvy * cos) * (state.flipY ? -1 : 1);
  // ox and oy are the same point as an offset from the center: past ~1e-9 the center is a big number
  // (see moveCenter), and x - cx of two doubles has nothing left, but the offset is exact to a double.
  const ox = wx * state.scale * 2.0, oy = wy * state.scale * 2.0;
  return { x: state.cx + ox, y: state.cy + oy, ox, oy };
}

// ---------------------------------------------------------------- exact center
// Past about 1e-9 a view's center needs more than a double's 53 bits: one pixel is then below a double's
// step at the center, so a pan or a zoom about the cursor would round to nothing. A deep view keeps
// state.ex / state.ey, the center as a signed BigInt in units of 2^-192 (about 1.6e-58, far below the
// 1e-30 floor), beside state.cx / state.cy, which stay the double nearest to it. Everything that reads
// the doubles (the HUD, history, places, flights) works unchanged; the renderer asks exactCenter(state)
// for the full value. Only moveCenter, setCenter and restoreCenter write the pair, so the two can't
// disagree; a pair that does (some code set cx or cy directly) is detected by exactValid and the
// doubles are taken as the truth, which is the view such code meant.
export const EXACT_FRAC = 192n;
export const EXACT_FROM = 1e-9;   // a view with a smaller scale gets an exact center
export const EXACT_DROP = 1e-4;   // zoomed back out past this, the doubles are enough again and ex/ey are cleared
export const EXACT_ONE = 2 ** 192;

// A double as the exact fixed-point integer (any double with |x| >= 2^-139 converts without rounding).
export const toExact = (x) => BigInt(Math.round(x * EXACT_ONE));
// The nearest double to an exact value.
export const fromExact = (b) => Number(b) / EXACT_ONE;

export function exactValid(state) {
  return typeof state.ex === "bigint" && typeof state.ey === "bigint"
    && fromExact(state.ex) === state.cx && fromExact(state.ey) === state.cy;
}

// The view's exact center: ex/ey if they match the doubles, else the doubles themselves.
export function exactCenter(state) {
  return exactValid(state) ? { ex: state.ex, ey: state.ey } : { ex: toExact(state.cx), ey: toExact(state.cy) };
}

// Moves the center by a world offset (dx, dy), keeping the exact pair in step. The offset is a double and
// is fine as one: it is a few pixels' worth, so it has as much precision as it needs relative to the scale.
export function moveCenter(state, dx, dy) {
  if (state.scale < EXACT_FROM || exactValid(state)) {
    const c = exactCenter(state);
    state.ex = c.ex + toExact(dx);
    state.ey = c.ey + toExact(dy);
    state.cx = fromExact(state.ex);
    state.cy = fromExact(state.ey);
    if (state.scale > EXACT_DROP) { state.ex = null; state.ey = null; }
  } else {
    state.cx += dx;
    state.cy += dy;
    state.ex = null; state.ey = null;
  }
}

// The exact center's share-link fields: signed lowercase hex of the BigInt (no prefix). A coordinate beyond
// +-4096 world units has no use as a fractal view, and the bound keeps a hand-made link small.
export const EXACT_HEX_LIMIT = 1n << (EXACT_FRAC + 12n);
export const exactToHex = (b) => (b < 0n ? "-" : "") + (b < 0n ? -b : b).toString(16);
// A link's exact coordinate: strict (signed lowercase hex, at most 52 digits, inside the bound), or null.
export function exactFromHex(s) {
  if (typeof s !== "string" || !/^-?[0-9a-f]{1,52}$/.test(s)) return null;
  const v = s[0] === "-" ? -BigInt("0x" + s.slice(1)) : BigInt("0x" + s);
  return v > -EXACT_HEX_LIMIT && v < EXACT_HEX_LIMIT ? v : null;
}

// The pair to write into a link: [ex, ey] as hex, or null when the doubles already are the center (the view is
// shallow, has no exact pair, or its pair is exactly its doubles) so the link carries nothing extra.
export function exactLinkFields(state) {
  if (state.scale >= EXACT_FROM || !exactValid(state)) return null;
  if (state.ex === toExact(state.cx) && state.ey === toExact(state.cy)) return null;
  return [exactToHex(state.ex), exactToHex(state.ey)];
}

// Reads a pair back from the link's parameters, or null. Lenient: a missing, malformed or out-of-bound pair, or
// one that doesn't round to the doubles x and y it travels with (an edited link), is left out and the link opens
// at its doubles, the view an older build shows.
export function exactFromLink(params, kx, ky, x, y) {
  const ex = exactFromHex(params.get(kx)), ey = exactFromHex(params.get(ky));
  return ex !== null && ey !== null && fromExact(ex) === x && fromExact(ey) === y ? [ex, ey] : null;
}

// Sets the center outright. ex and ey (BigInt) are optional; without them the doubles are the exact center.
export function setCenter(state, cx, cy, ex = null, ey = null) {
  state.cx = cx; state.cy = cy;
  state.ex = typeof ex === "bigint" && typeof ey === "bigint" && fromExact(ex) === cx && fromExact(ey) === cy ? ex : null;
  state.ey = state.ex === null ? null : ey;
}

// Wraps an angle to (-PI, PI]. cos/sin are periodic, so this never changes
// what's rendered (rotation=720deg looks identical to 0deg either way) —
// it's purely for the HUD display, which otherwise showed "720deg" instead
// of wrapping back toward 0deg after a couple of full spins, and to keep
// the rotation's cos/sin (computed on the CPU for the shader's
// u_rotCos/u_rotSin) operating on a bounded input rather than one that
// grows without limit over a long session.
export function normalizeAngle(a) {
  return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// Inverse of screenToComplex, solved for (cx, cy): the center a view would
// need so that local screen point (sx, sy) maps exactly to world point
// (targetX, targetY) at the view's current scale/rotation. This is the
// "grab a point and drag it" primitive — pan uses it directly, and it's
// what the pinch/wheel zoom's before/after-diff anchoring is equivalent to.
export function centerForAnchor(renderer, state, sx, sy, targetX, targetY) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const uvx = (sx * dpr - 0.5 * canvas.width) / canvas.height;
  const uvy = (0.5 * canvas.height - sy * dpr) / canvas.height;
  const rot = state.rotation || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const wx = uvx * cos - uvy * sin;
  const wy = (uvx * sin + uvy * cos) * (state.flipY ? -1 : 1); // see screenToComplex
  return { cx: targetX - wx * state.scale * 2.0, cy: targetY - wy * state.scale * 2.0 };
}
