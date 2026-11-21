// The accent color of the selected states (picker rings, active buttons, slider fill, the sheets' "Done"),
// taken from the current palette's bright end instead of one fixed blue, so the controls match the art.
// index.html declares --accent, --accent-rgb and --accent-fill on :root (the original iOS blue, which is
// also what stays when a palette has no usable color, like a grey ramp); syncAccent() overwrites them.
// Contrast on the dark toolbar is kept by clamping: saturation and lightness stay in a band, the accent
// is lifted until it has WCAG contrast 4.5 against the toolbar, and the fill is darkened until white text
// on it does too.
// Needs colormaps.js and the state; syncAccent is called from updateLUT (palette changes) and
// updateColorSwatches (the pattern shapes' solid colors, a mode change).
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { COLORMAPS, SOLID_COLORS, sampleColor } from "../render/colormaps.js?v=1.88.4";
import { isCurveMode, isIfsMode } from "../fractals/fractal-defs.js?v=1.88.4";
import { dragonView, fernView, mode, vectorColors } from "../core/state.js?v=1.88.4";
import { colormapIndex } from "../core/state-colors.js?v=1.88.4";

// The toolbar's backdrop is near-black (rgba(28,28,30,...) over the art); contrast is judged against this.
export const ACCENT_BACKDROP = [28, 28, 30];
export const ACCENT_MIN_CONTRAST = 4.5;
// Below this saturation a palette's bright end is grey (Hot's white, a white solid): no hue to follow.
export const ACCENT_MIN_CHROMA = 0.16;

export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The hue to follow: of 33 samples along the palette (the upper part weighs more: "bright end"), the one
// that is both bright and colorful. Null when nothing has a hue (a grey ramp).
export function brightEndHue(stops) {
  let best = null, bestScore = 0;
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const [h, s, l] = rgbToHsl(sampleColor(stops, t));
    if (s < ACCENT_MIN_CHROMA || l < 0.25) continue;
    // Colorfulness at a lightness near the middle (very pale ends carry little hue), nudged toward the bright end.
    const score = s * (1 - Math.abs(l - 0.6)) + 0.25 * t;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}

// { accent, fill } as [r, g, b] for a hue, clamped for the dark toolbar.
export function accentForHue(h) {
  let l = 0.7;
  let accent = hslToRgb([h, 0.9, l]);
  while (contrastRatio(accent, ACCENT_BACKDROP) < ACCENT_MIN_CONTRAST && l < 0.9) { l += 0.02; accent = hslToRgb([h, 0.9, l]); }
  let fl = 0.42;
  let fill = hslToRgb([h, 0.5, fl]);
  while (contrastRatio(fill, [255, 255, 255]) < ACCENT_MIN_CONTRAST && fl > 0.1) { fl -= 0.02; fill = hslToRgb([h, 0.5, fl]); }
  return { accent, fill };
}

// The same from a palette's stops or one solid color: null (use the fallback blue) when there is no hue.
export function accentFromStops(stops) {
  const h = brightEndHue(stops);
  return h === null ? null : accentForHue(h);
}
export function accentFromRgb(rgb) {
  const [h, s] = rgbToHsl(rgb);
  return s < ACCENT_MIN_CHROMA ? null : accentForHue(h);
}

// What the toolbar should be accented by right now: the escape-time palette, or the pattern shape's solid color.
export function currentAccent() {
  if (mode === "fractal") return accentFromStops(COLORMAPS[colormapIndex].stops);
  const key = isIfsMode(mode) ? fernView.system : isCurveMode(mode) ? dragonView.curve : mode;
  const solid = SOLID_COLORS[vectorColors[key]];
  return solid ? accentFromRgb(solid.rgb) : null;
}

export let accentCss = null; // the accent last applied as "rgb(r, g, b)", null while on the fallback blue
export function applyAccent(colors) {
  const root = document.documentElement.style;
  if (!colors) {
    ["--accent", "--accent-rgb", "--accent-fill"].forEach((p) => root.removeProperty(p));
    accentCss = null;
    return;
  }
  root.setProperty("--accent", `rgb(${colors.accent.join(", ")})`);
  root.setProperty("--accent-rgb", colors.accent.join(", "));
  root.setProperty("--accent-fill", `rgb(${colors.fill.join(", ")})`);
  accentCss = `rgb(${colors.accent.join(", ")})`;
}

export function syncAccent() {
  try { applyAccent(currentAccent()); } catch { applyAccent(null); }
}
