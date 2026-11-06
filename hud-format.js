// The info card's text formatting: rotation, zoom ("3.1 billion times deeper"), the scale bar, the center
// coordinates and the Apollonian curvature line. Pure functions of numbers; imports only deepzoom.js and
// fractal-defs.js. Split from render-layout.js (a pure move), which builds the card from these.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { DEEP_ZOOM_THRESHOLD } from "./deepzoom.js?v=1.69.2";
import { apolloCenterCurvature } from "./fractal-defs.js?v=1.69.2";

// Only shown when non-zero. Shared by every mode's HUD (WebGL fractal + all four Canvas2D vector
// views) since they all support the same twist gesture.
export function rotationHudText(rotation) {
  const rotDeg = (rotation || 0) * 180 / Math.PI;
  return Math.abs(rotDeg) > 0.5 ? `Rotated ${rotDeg.toFixed(0)}°` : "";
}

// Magnification relative to the fractal's opening view, in words past a
// thousand ("3.1 billion times"): what a person means by "how far in am I".
export const ZOOM_WORDS = [[1e15, "quadrillion"], [1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
export function formatZoom(baseScale, scale) {
  const z = baseScale / scale;
  if (z < 9.95) return `${Number(z.toFixed(1))}×`;
  if (z < 1000) return `${Math.round(z)}×`;
  const [n, word] = ZOOM_WORDS.find(([limit]) => z >= limit);
  return z / n < 1000 ? `${Number((z / n).toPrecision(2))} ${word} times` : `${z.toExponential(1)}×`;
}

// A count of points, as the chaos-game run's counter shows it: exact with separators below 10,000
// ("1,204"), then in words with one decimal below a hundred of a unit ("12.3 thousand", "1.2 million";
// "1.0 million" is "1 million") and none above ("123 thousand"). A value that rounds up to a thousand
// of its unit moves up to the next one ("999,600" is "1 million").
export const POINT_UNITS = [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
export function formatPointCount(n) {
  const v = Math.max(0, Math.floor(n));
  if (v < 10000) return v.toLocaleString("en-US");
  let i = POINT_UNITS.findIndex(([unit]) => v >= unit);
  const shown = (k) => {
    const x = v / POINT_UNITS[k][0];
    return x < 100 ? Number(x.toFixed(1)) : Math.round(x);
  };
  if (shown(i) >= 1000 && i > 0) i--;
  return `${shown(i).toLocaleString("en-US")} ${POINT_UNITS[i][1]}`;
}

// How deep the view is, for the info card: "415× deeper", "1.8 trillion
// times deeper", "The whole shape", or "Zoomed out 2×".
export function zoomPhrase(baseScale, scale) {
  const z = baseScale / scale;
  if (Math.abs(Math.log(z)) < 0.05) return "the whole shape";
  return z < 1 ? `zoomed out ${formatZoom(scale, baseScale)}` : `${formatZoom(baseScale, scale)} deeper`;
}

// Map-style scale bar for a view showing unitsPerPx world units per CSS
// pixel: the 1, 2 or 5 x 10^n length whose bar comes closest to 64px (in
// log terms, so bars stay roughly 40-100px wide), and its label.
export function scaleBar(unitsPerPx) {
  const target = 64 * unitsPerPx;
  const e = Math.floor(Math.log10(target));
  let best = null;
  for (const k of [e - 1, e, e + 1]) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** k;
      const d = Math.abs(Math.log(v / target));
      if (!best || d < best.d) best = { v, d, m, k };
    }
  }
  const sup = (n) => String(n).replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]);
  const label = best.k >= -4 && best.k <= 3 ? String(Number(best.v.toPrecision(1)))
    : best.m === 1 ? `10${sup(best.k)}` : `${best.m} × 10${sup(best.k)}`;
  return { px: best.v / unitsPerPx, label: `${label} across` };
}

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// World units per CSS pixel for a pane whose view is 2 * halfHeight tall.
export function unitsPerCssPx(halfHeight, canvas) {
  return canvas.clientHeight > 0 ? (2 * halfHeight) / canvas.clientHeight : 0;
}

// Plain decimals while zoomed out (scale >= DEEP_ZOOM_THRESHOLD), where
// "-0.75 + 0.00i / 1.25" reads better than exponents; full-precision
// scientific notation once in deep-zoom territory, where the digits are
// the point.
export function formatHudCoords(cx, cy, scale) {
  // Enough decimals to find the spot again from the card alone: the center
  // to within ~1/1000 of the view height (2 * scale), so one more decimal
  // per decade of zoom. Capped at 17, past which a float64 center holds no
  // more digits. Fixed-point at every depth: the precision that matters is
  // absolute, which scientific notation hides for centers near 0.
  const decimals = Math.min(17, Math.max(2, Math.ceil(3 - Math.log10(2 * scale))));
  const fmt = (v) => {
    let t = v.toFixed(decimals);
    // Trim trailing zeros, but keep at least 2 decimals (0.00, not 0).
    while (t.length - t.indexOf(".") - 1 > 2 && t.endsWith("0")) t = t.slice(0, -1);
    return t.replace(/^-(0\.0+)$/, "$1"); // no "-0.00"
  };
  return {
    center: `${fmt(cx)} + ${fmt(cy)}i`,
    scale: scale < DEEP_ZOOM_THRESHOLD ? scale.toExponential(3) : String(Number(scale.toPrecision(3))),
  };
}

// The Apollonian info card's line about the circle under the center (see
// apolloCenterCurvature), left out while that circle is too small to see:
// a center on the gasket lands in circles far below a pixel. Remembered
// for the last view: updateHud runs every frame, and near the gasket the
// walk can take thousands of steps.
export let apolloCurvatureKey = "", apolloCurvatureLine = "";
export function apolloCurvatureText(cx, cy, scale) {
  const key = `${cx},${cy},${scale}`;
  if (key !== apolloCurvatureKey) {
    const k = apolloCenterCurvature(cx, cy);
    apolloCurvatureKey = key;
    // Radius 1/k at least 1/200 of the view's half-height.
    apolloCurvatureLine = k === null || k * scale > 200 ? ""
      : k < 0 ? "Center: outside the outer circle (curvature −1)"
      : `Circle at center: curvature ${k.toLocaleString("en-US")}`;
  }
  return apolloCurvatureLine;
}
