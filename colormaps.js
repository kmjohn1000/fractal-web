"use strict";

// Hand-picked approximations of a handful of matplotlib colormaps' visual
// character (stop positions/colors eyeballed, not colorimetrically exact) —
// good enough to give each colormap a distinct, recognizable look.
const COLORMAPS = [
  { name: "Inferno", stops: [
    [0.00,   0,   0,   4], [0.13,  31,  12,  72], [0.29,  85,  15, 109],
    [0.43, 136,  34, 106], [0.58, 186,  54,  85], [0.71, 227,  89,  51],
    [0.83, 249, 140,  10], [0.92, 249, 201,  50], [1.00, 252, 255, 164],
  ]},
  { name: "Magma", stops: [
    [0.00,   0,   0,   4], [0.13,  28,  16,  68], [0.29,  79,  18, 123],
    [0.43, 129,  37, 129], [0.58, 181,  54, 122], [0.71, 229,  80, 100],
    [0.83, 251, 135,  97], [0.92, 254, 194, 135], [1.00, 252, 253, 191],
  ]},
  { name: "Plasma", stops: [
    [0.00,  13,   8, 135], [0.13,  84,   2, 163], [0.29, 139,  10, 165],
    [0.43, 185,  50, 137], [0.58, 219,  92, 104], [0.71, 244, 136,  73],
    [0.83, 254, 188,  43], [1.00, 240, 249,  33],
  ]},
  { name: "Hot", stops: [
    [0.00,  11,   0,   0], [0.365, 255,   0,   0], [0.746, 255, 255,   0],
    [1.00, 255, 255, 255],
  ]},
  { name: "Twilight", stops: [
    [0.00, 226, 217, 226], [0.25,  93,  94, 163], [0.50,  23,  23,  23],
    [0.75, 113,  49,  89], [1.00, 226, 217, 226],
  ]},
  { name: "HSV", stops: [
    [0.00, 255,   0,   0], [0.17, 255, 255,   0], [0.33,   0, 255,   0],
    [0.50,   0, 255, 255], [0.67,   0,   0, 255], [0.83, 255,   0, 255],
    [1.00, 255,   0,   0],
  ]},
  { name: "Gist Rainbow", stops: [
    [0.00, 255,   0,  41], [0.17, 255, 165,   0], [0.33, 200, 255,   0],
    [0.50,   0, 255, 128], [0.67,   0, 128, 255], [0.83, 128,   0, 255],
    [1.00, 255,   0,  41],
  ]},
  // Sequential (start != end) by design -- don't make these cyclic.
  { name: "Viridis", stops: [
    [0.00, 68, 1, 84], [0.13, 72, 40, 120], [0.25, 62, 74, 137],
    [0.38, 49, 104, 142], [0.50, 38, 130, 142], [0.63, 31, 158, 137],
    [0.75, 53, 183, 121], [0.88, 109, 205, 89], [1.00, 253, 231, 37],
  ]},
  { name: "Turbo", stops: [
    [0.00, 48, 18, 59], [0.13, 70, 107, 227], [0.25, 39, 168, 224],
    [0.38, 49, 208, 152], [0.50, 145, 234, 64], [0.63, 216, 216, 45],
    [0.75, 245, 140, 39], [0.88, 231, 61, 21], [1.00, 122, 4, 3],
  ]},
  { name: "Glacier", stops: [
    [0.00, 6, 4, 12], [0.30, 15, 60, 90], [0.55, 20, 130, 150],
    [0.78, 100, 210, 190], [0.92, 220, 245, 220], [1.00, 255, 255, 255],
  ]},
  { name: "Ember", stops: [
    [0.00, 8, 5, 3], [0.30, 62, 32, 16], [0.55, 145, 80, 42],
    [0.78, 210, 138, 82], [0.92, 240, 200, 155], [1.00, 255, 246, 232],
  ]},
  { name: "Grayscale", stops: [[0.00, 0, 0, 0], [1.00, 255, 255, 255]] },
];

// Flat colors for the modes that aren't depth-mapped escape-time images:
// the fern/IFS point clouds and the Koch/tree/line-curve drawings. Those
// used to sample COLORMAPS at depth/maxDepth, which puts low depths at the
// colormap's dark end -- near-invisible on the #111 background. Index 0
// (green) is the fern's default; each line mode has its own default in
// app.js (vectorColors).
const SOLID_COLORS = [
  { name: "Green",  rgb: [70, 190, 90] },
  { name: "Autumn", rgb: [214, 122, 47] },
  { name: "Violet", rgb: [148, 100, 214] },
  { name: "Ice",    rgb: [92, 176, 214] },
  { name: "Rose",   rgb: [214, 92, 140] },
  { name: "Gold",   rgb: [226, 186, 64] },
  { name: "White",  rgb: [236, 236, 240] },
];
const solidCss = (i) => `rgb(${SOLID_COLORS[i].rgb.join(", ")})`;

// Line width (canvas px) for a line drawing whose segments are segPx long
// on screen: bold (2.5pt) while segments are long -- the early depths --
// thinning to a 0.75pt hairline as they get dense, so deep levels don't
// merge into a solid block. dpr converts points to canvas pixels.
function strokeWidthFor(segPx, dpr) {
  return Math.min(2.5 * dpr, Math.max(0.75 * dpr, 0.3 * segPx));
}

function sampleColor(stops, t) {
  // Wrap into [0, 1) -- except exactly 1.0, which is the colormap's end
  // color, not its start: plain % made every palette's final stop
  // unreachable (depth-max Koch/tree/dragon, and index 255 of the LUT
  // buildLUTBytes bakes for the shader).
  t = t === 1 ? 1 : ((t % 1) + 1) % 1;
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, r0, g0, b0] = stops[i];
    const [p1, r1, g1, b1] = stops[i + 1];
    if (t >= p0 && t <= p1) {
      const f = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

function buildLUTBytes(stops, size = 256) {
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const [r, g, b] = sampleColor(stops, i / (size - 1));
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}
