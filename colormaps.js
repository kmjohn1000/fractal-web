"use strict";

// The escape-time colormaps, in picker order (the first is the default).
// Inferno, Plasma, Viridis, Turbo and Twilight are matplotlib's own tables
// sampled at 33 evenly spaced stops (linear interpolation between stops is
// visually indistinguishable from the 256-entry originals). Hot, Ember,
// Glacier, Classic, Fire and Spectrum are hand-tuned.
// Share links store a colormap's name (cm=Classic), so entries can be
// reordered freely. Renaming or removing one makes old links using it open in
// the default colormap (the first entry), so keep the names stable.
const COLORMAPS = [
  { name: "Inferno", stops: [
    [0.0000,   0,   0,   4], [0.0312,   4,   3,  18], [0.0625,  11,   7,  36],
    [0.0938,  21,  11,  55], [0.1250,  33,  12,  74], [0.1562,  47,  10,  91],
    [0.1875,  61,   9, 101], [0.2188,  74,  12, 107], [0.2500,  87,  16, 110],
    [0.2812, 100,  21, 110], [0.3125, 113,  25, 110], [0.3438, 125,  30, 109],
    [0.3750, 138,  34, 106], [0.4062, 151,  39, 102], [0.4375, 163,  44,  97],
    [0.4688, 176,  49,  91], [0.5000, 188,  55,  84], [0.5312, 199,  62,  76],
    [0.5625, 210,  70,  68], [0.5938, 219,  80,  59], [0.6250, 228,  90,  49],
    [0.6562, 235, 102,  40], [0.6875, 241, 115,  29], [0.7188, 246, 128,  19],
    [0.7500, 249, 142,   9], [0.7812, 251, 157,   7], [0.8125, 252, 172,  17],
    [0.8438, 251, 188,  33], [0.8750, 249, 203,  53], [0.9062, 245, 219,  76],
    [0.9375, 242, 234, 105], [0.9688, 243, 246, 138], [1.0000, 252, 255, 164],
  ]},
  // Blue, white, orange, black: the familiar Mandelbrot poster palette.
  // Cyclic (start == end).
  { name: "Classic", stops: [
    [0.00,   0,   7, 100], [0.16,  32, 107, 203], [0.42, 237, 255, 255],
    [0.6425, 255, 170,   0], [0.8575,   0,   2,   0], [1.00,   0,   7, 100],
  ]},
  // Black, deep red, orange, yellow, cream. Sequential, so it has a hard
  // seam where the cream end wraps back to black; that suits the Burning Ship.
  { name: "Fire", stops: [
    [0.00,   0,   0,   0], [0.20,  80,   5,   0], [0.40, 190,  30,   0],
    [0.60, 250, 110,   0], [0.80, 255, 200,  40], [1.00, 255, 250, 200],
  ]},
  { name: "Hot", stops: [
    [0.00,  11,   0,   0], [0.365, 255,   0,   0], [0.746, 255, 255,   0],
    [1.00, 255, 255, 255],
  ]},
  { name: "Ember", stops: [
    [0.00, 8, 5, 3], [0.30, 62, 32, 16], [0.55, 145, 80, 42],
    [0.78, 210, 138, 82], [0.92, 240, 200, 155], [1.00, 255, 246, 232],
  ]},
  { name: "Plasma", stops: [
    [0.0000,  13,   8, 135], [0.0312,  34,   6, 144], [0.0625,  49,   5, 151],
    [0.0938,  63,   4, 156], [0.1250,  76,   2, 161], [0.1562,  89,   1, 165],
    [0.1875, 102,   0, 167], [0.2188, 114,   1, 168], [0.2500, 126,   3, 168],
    [0.2812, 138,   9, 165], [0.3125, 149,  17, 161], [0.3438, 160,  26, 156],
    [0.3750, 170,  35, 149], [0.4062, 179,  44, 142], [0.4375, 188,  53, 135],
    [0.4688, 196,  62, 127], [0.5000, 204,  71, 120], [0.5312, 211,  81, 113],
    [0.5625, 218,  90, 106], [0.5938, 224,  99,  99], [0.6250, 230, 108,  92],
    [0.6562, 235, 118,  85], [0.6875, 240, 128,  78], [0.7188, 245, 139,  71],
    [0.7500, 248, 149,  64], [0.7812, 251, 161,  57], [0.8125, 253, 172,  51],
    [0.8438, 254, 184,  44], [0.8750, 253, 197,  39], [0.9062, 252, 210,  37],
    [0.9375, 248, 223,  37], [0.9688, 244, 237,  39], [1.0000, 240, 249,  33],
  ]},
  // Sequential (start != end) by design -- don't make these cyclic.
  { name: "Viridis", stops: [
    [0.0000,  68,   1,  84], [0.0312,  71,  13,  96], [0.0625,  72,  24, 106],
    [0.0938,  72,  35, 116], [0.1250,  71,  45, 123], [0.1562,  69,  55, 129],
    [0.1875,  66,  64, 134], [0.2188,  62,  73, 137], [0.2500,  59,  82, 139],
    [0.2812,  55,  91, 141], [0.3125,  51,  99, 141], [0.3438,  47, 107, 142],
    [0.3750,  44, 114, 142], [0.4062,  41, 122, 142], [0.4375,  38, 130, 142],
    [0.4688,  35, 137, 142], [0.5000,  33, 145, 140], [0.5312,  31, 152, 139],
    [0.5625,  31, 160, 136], [0.5938,  34, 167, 133], [0.6250,  40, 174, 128],
    [0.6562,  50, 182, 122], [0.6875,  63, 188, 115], [0.7188,  78, 195, 107],
    [0.7500,  94, 201,  98], [0.7812, 112, 207,  87], [0.8125, 132, 212,  75],
    [0.8438, 152, 216,  62], [0.8750, 173, 220,  48], [0.9062, 194, 223,  35],
    [0.9375, 216, 226,  25], [0.9688, 236, 229,  27], [1.0000, 253, 231,  37],
  ]},
  { name: "Turbo", stops: [
    [0.0000,  48,  18,  59], [0.0312,  57,  42, 115], [0.0625,  64,  64, 162],
    [0.0938,  68,  86, 199], [0.1250,  70, 107, 227], [0.1562,  70, 128, 246],
    [0.1875,  66, 148, 255], [0.2188,  55, 168, 250], [0.2500,  40, 188, 235],
    [0.2812,  28, 205, 216], [0.3125,  24, 221, 194], [0.3438,  31, 233, 175],
    [0.3750,  50, 242, 152], [0.4062,  78, 249, 125], [0.4375, 109, 254,  98],
    [0.4688, 139, 255,  75], [0.5000, 164, 252,  60], [0.5312, 185, 246,  53],
    [0.5625, 205, 236,  52], [0.5938, 223, 223,  55], [0.6250, 238, 207,  58],
    [0.6562, 248, 190,  57], [0.6875, 253, 172,  52], [0.7188, 254, 150,  43],
    [0.7500, 251, 126,  33], [0.7812, 244, 102,  23], [0.8125, 235,  80,  14],
    [0.8438, 223,  63,   8], [0.8750, 208,  47,   5], [0.9062, 190,  33,   2],
    [0.9375, 169,  22,   1], [0.9688, 146,  11,   1], [1.0000, 122,   4,   3],
  ]},
  { name: "Glacier", stops: [
    [0.00, 6, 4, 12], [0.30, 15, 60, 90], [0.55, 20, 130, 150],
    [0.78, 100, 210, 190], [0.92, 220, 245, 220], [1.00, 255, 255, 255],
  ]},
  { name: "Twilight", stops: [
    [0.0000, 226, 217, 226], [0.0312, 215, 215, 221], [0.0625, 196, 206, 212],
    [0.0938, 172, 194, 204], [0.1250, 149, 181, 199], [0.1562, 129, 166, 195],
    [0.1875, 114, 151, 193], [0.2188, 104, 135, 190], [0.2500,  98, 118, 186],
    [0.2812,  95, 100, 181], [0.3125,  94,  81, 173], [0.3438,  93,  61, 161],
    [0.3750,  89,  42, 143], [0.4062,  81,  27, 119], [0.4375,  69,  19,  92],
    [0.4688,  56,  17,  69], [0.5000,  47,  20,  54], [0.5312,  58,  17,  58],
    [0.5625,  74,  19,  66], [0.5938,  95,  23,  74], [0.6250, 116,  30,  79],
    [0.6562, 135,  39,  80], [0.6875, 152,  53,  80], [0.7188, 166,  69,  80],
    [0.7500, 178,  86,  82], [0.7812, 187, 105,  88], [0.8125, 194, 124,  99],
    [0.8438, 200, 144, 115], [0.8750, 204, 163, 137], [0.9062, 209, 182, 163],
    [0.9375, 216, 199, 190], [0.9688, 223, 212, 214], [1.0000, 226, 217, 226],
  ]},
  // Cyclic rainbow (the old "Gist Rainbow"; the garish pure-hue HSV was dropped).
  { name: "Spectrum", stops: [
    [0.00, 255,   0,  41], [0.17, 255, 165,   0], [0.33, 200, 255,   0],
    [0.50,   0, 255, 128], [0.67,   0, 128, 255], [0.83, 128,   0, 255],
    [1.00, 255,   0,  41],
  ]},
  { name: "Grayscale", stops: [[0.00, 0, 0, 0], [1.00, 255, 255, 255]] },
];

// Flat colors for the modes that aren't depth-mapped escape-time images:
// the fern/IFS point clouds and the Koch/tree/line-curve drawings. Those
// used to sample COLORMAPS at depth/maxDepth, which puts low depths at the
// colormap's dark end -- near-invisible on the black background. Index 0
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
