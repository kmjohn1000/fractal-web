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
export const EXACT_BITS = 192;    // the same as a Number, and the pair's default fraction length
export const EXACT_FROM = 1e-9;   // a view with a smaller scale gets an exact center
export const EXACT_DROP = 1e-4;   // zoomed back out past this, the doubles are enough again and ex/ey are cleared
export const EXACT_ONE = 2 ** 192;

// The pair's fraction length. 192 bits is enough for every view down to a scale of about 1e-39, which is below
// the escape-time family's floor (1e-30), so those views never leave it. The Sierpinski types have no floor of
// that kind (their pattern is the same at every depth), so a view deeper than 2^-128 asks for more: the
// fraction grows in steps of 64 bits so that its last bit stays 2^-64 of the view's half-height, as small as the
// pan and the cell frame need. state.ef is the length the pair is stored at (absent means 192); it only grows
// while the pair lives, so zooming out and back in does not lose the center's low bits. Everything that
// reads the pair as 2^-192 units asks exactCenter(state), which converts.
export function exactBitsFor(scale) {
  return scale > 0 ? Math.max(EXACT_BITS, 64 * Math.ceil((64 - Math.log2(scale)) / 64)) : EXACT_BITS;
}
export const exactFrac = (state) => (typeof state.ef === "number" ? state.ef : EXACT_BITS);
// The length to work at now: the stored one, or what the current scale needs if that is longer.
export const exactFracFor = (state) => Math.max(exactFrac(state), exactBitsFor(state.scale));

export const pow2 = (e) => { const h = Math.trunc(e / 2); return 2 ** h * 2 ** (e - h); };
// round(x * 2^F) for a double x, exact in the double's own bits at any F (x * 2^F overflows a double past F = 1000).
export function bigFromDouble(x, F) {
  if (x === 0 || !Number.isFinite(x)) return 0n;
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const be = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e = -1074;
  if (be !== 0) { m |= 1n << 52n; e = be - 1075; }
  const sh = e + F;
  let v;
  if (sh >= 0) v = m << BigInt(sh);
  else if (sh < -60) v = 0n;
  else v = (m + (1n << BigInt(-sh - 1))) >> BigInt(-sh);
  return hi >>> 31 ? -v : v;
}

// A double as the exact fixed-point integer, F fraction bits (any double with |x| >= 2^-139 converts without
// rounding at the default 192).
export const toExact = (x, F = EXACT_BITS) => (F === EXACT_BITS ? BigInt(Math.round(x * EXACT_ONE)) : bigFromDouble(x, F));
// The nearest double to an exact value (ties to even, the same at every F for the same number).
export function fromExact(b, F = EXACT_BITS) {
  if (F === EXACT_BITS) return Number(b) / EXACT_ONE;
  if (b === 0n) return 0;
  const neg = b < 0n, a = neg ? -b : b;
  const sh = a.toString(2).length - 53;
  let m = a;
  if (sh > 0) {
    const s = BigInt(sh);
    m = a >> s;
    const rem = a - (m << s), half = 1n << (s - 1n);
    if (rem > half || (rem === half && (m & 1n) === 1n)) m += 1n;
  }
  const v = Number(m) * pow2(Math.max(sh, 0) - F);
  return neg ? -v : v;
}
// A value held at `from` fraction bits, held at F instead (extra low bits are dropped).
export const reframe = (v, from, F) => (from === F ? v : from < F ? v << BigInt(F - from) : v >> BigInt(from - F));

export function exactValid(state) {
  const F = exactFrac(state);
  return typeof state.ex === "bigint" && typeof state.ey === "bigint"
    && fromExact(state.ex, F) === state.cx && fromExact(state.ey, F) === state.cy;
}

// The view's exact center at F fraction bits (default 192): ex/ey if they match the doubles, else the doubles
// themselves.
export function exactCenter(state, F = EXACT_BITS) {
  if (!exactValid(state)) return { ex: toExact(state.cx, F), ey: toExact(state.cy, F) };
  const f = exactFrac(state);
  return { ex: reframe(state.ex, f, F), ey: reframe(state.ey, f, F) };
}

// Moves the center by a world offset (dx, dy), keeping the exact pair in step. The offset is a double and
// is fine as one: it is a few pixels' worth, so it has as much precision as it needs relative to the scale.
export function moveCenter(state, dx, dy) {
  if (state.scale < EXACT_FROM || exactValid(state)) {
    const F = exactFracFor(state);
    const c = exactCenter(state, F);
    state.ex = c.ex + toExact(dx, F);
    state.ey = c.ey + toExact(dy, F);
    state.ef = F;
    state.cx = fromExact(state.ex, F);
    state.cy = fromExact(state.ey, F);
    if (state.scale > EXACT_DROP) { state.ex = null; state.ey = null; state.ef = null; }
  } else {
    state.cx += dx;
    state.cy += dy;
    state.ex = null; state.ey = null; state.ef = null;
  }
}

// The exact center's share-link fields: signed lowercase hex of the BigInt (no prefix), at exactBitsFor(scale)
// fraction bits, which the reader works out from the scale the link carries. A coordinate beyond +-4096 world
// units has no use as a fractal view, and the bound keeps a hand-made link small.
export const EXACT_HEX_LIMIT = 1n << (EXACT_FRAC + 12n);
export const exactToHex = (b) => (b < 0n ? "-" : "") + (b < 0n ? -b : b).toString(16);
// A link's exact coordinate: strict (signed lowercase hex, at most 52 digits at the default 192 bits, inside the
// bound), or null.
export function exactFromHex(s, F = EXACT_BITS) {
  if (typeof s !== "string" || !new RegExp(`^-?[0-9a-f]{1,${Math.ceil((F + 12) / 4) + 1}}$`).test(s)) return null;
  const v = s[0] === "-" ? -BigInt("0x" + s.slice(1)) : BigInt("0x" + s);
  const limit = 1n << BigInt(F + 12);
  return v > -limit && v < limit ? v : null;
}

// The pair to write into a link: [ex, ey] as hex, or null when the doubles already are the center (the view is
// shallow, has no exact pair, or its pair is exactly its doubles) so the link carries nothing extra.
export function exactLinkFields(state) {
  if (state.scale >= EXACT_FROM || !exactValid(state)) return null;
  const F = exactBitsFor(state.scale);
  const c = exactCenter(state, F);
  if (c.ex === toExact(state.cx, F) && c.ey === toExact(state.cy, F)) return null;
  return [exactToHex(c.ex), exactToHex(c.ey)];
}

// Reads a pair back from the link's parameters, or null. Lenient: a missing, malformed or out-of-bound pair, or
// one that doesn't round to the doubles x and y it travels with (an edited link), is left out and the link opens
// at its doubles, the view an older build shows. scale is the link's own: it sets the pair's fraction length.
// Returns [ex, ey, bits].
export function exactFromLink(params, kx, ky, x, y, scale) {
  const F = exactBitsFor(scale);
  const ex = exactFromHex(params.get(kx), F), ey = exactFromHex(params.get(ky), F);
  return ex !== null && ey !== null && fromExact(ex, F) === x && fromExact(ey, F) === y ? [ex, ey, F] : null;
}

// ---------------------------------------------------------------- long-decimal places
// A place (places.js) names its center as decimal text, re and im. A double holds 15-17 of its digits; a place that
// is a self-similar point (Golden Dive) can carry many more, and landing on it then sets the exact center from all
// of them, so a deeper zoom stays on the structure instead of sliding off the double's rounding.
export const LONG_DECIMAL_DIGITS = 18;  // significant digits past which a place's text is longer than a double

// A plain decimal ("-0.447213...", digits and at most one point, no exponent) as a fixed-point BigInt with F
// fraction bits, rounded to nearest; null for anything else.
export function exactFromDecimal(str, F) {
  const m = typeof str === "string" ? /^(-?)(\d*)\.?(\d*)$/.exec(str) : null;
  if (!m || (m[2] === "" && m[3] === "")) return null;
  const den = 10n ** BigInt(m[3].length);
  const v = ((BigInt(m[2] + m[3]) << BigInt(F)) * 2n + den) / (2n * den);
  return m[1] ? -v : v;
}
// How many significant digits a decimal's text carries (0 if it is not a plain decimal).
export function decimalDigits(str) {
  const m = typeof str === "string" ? /^-?(\d*)\.?(\d*)$/.exec(str) : null;
  return m ? (m[1] + m[2]).replace(/^0+/, "").length : 0;
}
// The exact center a place's text names, or null when neither coordinate has more digits than a double holds
// (the doubles are then the center, as always). The fraction length covers the text's own digits (they are the
// precision there is) and what the place's scale needs, in the 64-bit steps exactBitsFor uses.
export function exactFromPlace(place) {
  const digits = Math.max(decimalDigits(place.re), decimalDigits(place.im));
  if (digits < LONG_DECIMAL_DIGITS) return null;
  const bits = Math.max(exactBitsFor(place.scale), 64 * Math.ceil((digits * Math.log2(10) + 8) / 64));
  const ex = exactFromDecimal(place.re, bits), ey = exactFromDecimal(place.im, bits);
  return ex === null || ey === null ? null : { ex, ey, bits, cx: fromExact(ex, bits), cy: fromExact(ey, bits) };
}

// Sets the center outright. ex and ey (BigInt, ef fraction bits) are optional; without them the doubles are the
// exact center.
export function setCenter(state, cx, cy, ex = null, ey = null, ef = EXACT_BITS) {
  state.cx = cx; state.cy = cy;
  const ok = typeof ex === "bigint" && typeof ey === "bigint" && fromExact(ex, ef) === cx && fromExact(ey, ef) === cy;
  state.ex = ok ? ex : null;
  state.ey = ok ? ey : null;
  state.ef = ok ? ef : null;
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
