// The finish on the eleven pattern shapes (Koch, tree, hexaflake, the four line curves and the four
// chaos-game dot shapes): every one sits on the same very dark navy backdrop (paintBackdrop /
// backdropPixels in vectorgeom.js) that is a little lighter in the middle than at the edges, the
// Save image file keeps it, and the line curves (dragon, Hilbert, Gosper, arrowhead) are colored
// along their length, the picked color's hue turning from one end to the other, with a soft glow
// that is left out while a gesture is in progress (opts.lite). Baselines of the shapes are in
// app.spec.mjs and vector.spec.mjs.
import { test, expect } from "@playwright/test";

/* global setMode, fernView, dragonState, vectorColors, SOLID_COLORS, buildShareHash, applyShareLink, els, mode,
   requestRender, VECTOR_VIEWS, LINE_CURVES, captureShareBlob, BACKDROP_CENTER_RGB, BACKDROP_EDGE_RGB, fittedVectorModes, fitVectorView,
   vectorFitHalfHeight, curveRamp, hueTurned */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const SHAPES = ["koch", "tree", "hexaflake", "dragon", "hilbert", "gosper", "arrowhead", "fern", "sierpinski", "levy", "vicsek"];
const CURVES = ["dragon", "hilbert", "gosper", "arrowhead"];
const IFS = ["fern", "sierpinski", "levy", "vicsek"];

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("index.html");
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await page.waitForFunction(() => typeof setMode === "function" && typeof fernView !== "undefined");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Opens a shape in its default view and waits until it is fully drawn.
async function show(page, m) {
  await page.evaluate((m) => setMode(m), m);
  if (IFS.includes(m)) {
    await page.waitForFunction((m) => fernView.system === m && !fernView.refining && fernView.accepted > 0, m, { timeout: 90_000 });
  }
  await frames(page);
}

// The mean rgb of the w x h block of the shape's canvas with its top-left corner at (x, y).
function block(page, m, x, y, w = 3, h = 3) {
  return page.evaluate(([m, x, y, w, h]) => {
    const canvas = VECTOR_VIEWS[m][1];
    const px = canvas.getContext("2d").getImageData(Math.round(x * canvas.width), Math.round(y * canvas.height), w, h).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let q = 0; q < 3; q++) sum[q] += px[i + q];
    return sum.map((v) => v / (px.length / 4));
  }, [m, x, y, w, h]);
}

const lum = ([r, g, b]) => r + g + b;

test.describe("the backdrop", () => {
  for (const m of SHAPES) {
    test(`${m}: not pure black at the corners, and darker at the edge than in the middle`, async ({ page }) => {
      await show(page, m);
      // The four corners are backdrop in every default view, and the backdrop's edge color is not black.
      const edge = await page.evaluate(() => BACKDROP_EDGE_RGB);
      for (const [x, y] of [[0, 0], [0.99, 0], [0, 0.99], [0.99, 0.99]]) {
        const c = await block(page, m, x, y);
        expect(lum(c), `corner ${x},${y} is not pure black: ${c}`).toBeGreaterThan(0);
        for (let q = 0; q < 3; q++) expect(Math.abs(c[q] - edge[q]), `corner ${x},${y} channel ${q} near the edge color`).toBeLessThanOrEqual(6);
      }
      // With the shape moved out of the way, the middle is the backdrop's lighter center
      // and the sides are darker.
      await page.evaluate((m) => {
        Object.assign(VECTOR_VIEWS[m][0].view, { cx: 1e6, cy: 1e6, rotation: 0 });
        requestRender();
      }, m);
      await frames(page);
      await frames(page);
      const mid = await block(page, m, 0.5, 0.46);
      const side = await block(page, m, 0.0, 0.46);
      const corner = await block(page, m, 0.99, 0.99);
      const center = await page.evaluate(() => BACKDROP_CENTER_RGB);
      for (let q = 0; q < 3; q++) expect(Math.abs(mid[q] - center[q]), `middle channel ${q} near the center color: ${mid}`).toBeLessThanOrEqual(4);
      expect(lum(side), `left edge ${side} darker than the middle ${mid}`).toBeLessThan(lum(mid) - 10);
      expect(lum(corner), `corner ${corner} darker than the left edge ${side}`).toBeLessThan(lum(side));
      expect(lum(corner)).toBeGreaterThan(0);
    });
  }

  // 1.50.1: the four chaos-game views fill a pixel buffer with the backdrop themselves (backdropPixels), which
  // rounded every pixel to the nearest level and banded in steps about 40 px wide (25 distinct colors in the empty
  // lower part of a phone canvas); the Canvas2D views' gradient was dithered by the browser. Now both are dithered.
  for (const m of ["hilbert", ...IFS]) {
    test(`${m}: the backdrop is dithered, not banded, and its center and edge colors are unchanged`, async ({ page }) => {
      await show(page, m);
      await page.evaluate((m) => {
        Object.assign(VECTOR_VIEWS[m][0].view, { cx: 1e6, cy: 1e6, rotation: 0 });
        requestRender();
      }, m);
      await frames(page);
      await frames(page);
      const r = await page.evaluate((m) => {
        const canvas = VECTOR_VIEWS[m][1], w = canvas.width, h = canvas.height;
        const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
        // The empty strip between 80% and 95% of the height, where the gradient is gentle.
        let pairs = 0, differ = 0;
        for (let y = Math.floor(h * 0.8); y < Math.floor(h * 0.95); y++) {
          for (let x = 1; x < w; x++) {
            const i = (y * w + x) * 4;
            pairs++;
            if (px[i] !== px[i - 4] || px[i + 1] !== px[i - 3] || px[i + 2] !== px[i - 2]) differ++;
          }
        }
        return { changeRate: differ / pairs };
      }, m);
      expect(r.changeRate, `share of horizontal neighbors that differ: ${r.changeRate.toFixed(2)} (banded: 0.02 to 0.06)`).toBeGreaterThan(0.4);
      // The mean over a block is still the backdrop's color: the dither averages out (the corner and center tests above
      // hold the same for all eleven shapes).
      const mid = await block(page, m, 0.5, 0.46, 9, 9);
      const center = await page.evaluate(() => BACKDROP_CENTER_RGB);
      for (let q = 0; q < 3; q++) expect(Math.abs(mid[q] - center[q]), `middle channel ${q}: ${mid}`).toBeLessThanOrEqual(2);
    });
  }

  test("the page around the canvas shows no hard black seam at its edge", async ({ page }) => {
    await show(page, "hilbert");
    // The canvas fills #canvasArea, and its edge pixel is within a few levels of the next pixel in.
    const r = await page.evaluate(() => {
      const c = VECTOR_VIEWS.hilbert[1], g = c.getContext("2d");
      const rect = c.getBoundingClientRect(), area = els.canvasArea.getBoundingClientRect();
      const a = g.getImageData(0, 0, 1, 1).data, b = g.getImageData(4, 4, 1, 1).data;
      return { canvasFills: Math.abs(rect.width - area.width) < 2 && rect.top >= area.top - 1, edge: [a[0], a[1], a[2]], inner: [b[0], b[1], b[2]] };
    });
    expect(r.canvasFills).toBe(true);
    for (let q = 0; q < 3; q++) expect(Math.abs(r.edge[q] - r.inner[q])).toBeLessThanOrEqual(2);
  });
});

test.describe("Save image keeps the backdrop", () => {
  for (const m of ["koch", "hilbert", "fern"]) {
    test(`${m}: the saved picture has the backdrop, the frame on screen, and its watermark`, async ({ page }) => {
      await show(page, m);
      const r = await page.evaluate(async (m) => {
        const blob = await captureShareBlob();
        const img = await createImageBitmap(blob);
        const canvas = VECTOR_VIEWS[m][1];
        const grab = (src) => { const c = document.createElement("canvas"); c.width = src.width; c.height = src.height; const g = c.getContext("2d"); g.drawImage(src, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
        const a = grab(canvas), b = grab(img);
        if (img.width !== canvas.width || img.height !== canvas.height) return { size: [img.width, img.height, canvas.width, canvas.height] };
        const at = (d, fx, fy) => { const i = (Math.floor(fy * canvas.height) * canvas.width + Math.floor(fx * canvas.width)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        let sum = 0, n = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (x > canvas.width * 0.5 && y > canvas.height * 0.9) continue; // the watermark pill
            const i = (y * canvas.width + x) * 4;
            sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
            n += 3;
          }
        }
        // Part of the pill is darker than the backdrop; the white wordmark is lighter.
        let pillBright = 0;
        for (let y = Math.floor(canvas.height * 0.93); y < canvas.height; y++) {
          for (let x = Math.floor(canvas.width * 0.6); x < canvas.width; x++) { const i = (y * canvas.width + x) * 4; if (b[i] > 200 && b[i + 1] > 200 && b[i + 2] > 200) pillBright++; }
        }
        return { mean: sum / n, topLeft: at(b, 0.001, 0.001), left: at(b, 0.001, 0.46), pillBright };
      }, m);
      expect(r.size, "saved image has the canvas's size").toBeUndefined();
      expect(r.mean, "the saved picture is the canvas (mean channel difference)").toBeLessThan(0.5);
      expect(lum(r.topLeft), `top-left of the file is the backdrop, not black: ${r.topLeft}`).toBeGreaterThan(0);
      expect(lum(r.left), `left edge of the file ${r.left}`).toBeGreaterThan(0);
      expect(r.pillBright, "the wordmark is still drawn").toBeGreaterThan(50);
    });
  }
});

// The hue (degrees) of the bright pixels in a window of a shape's canvas, circular mean, with how many there were.
function windowHue(page, m, sx, sy, radius = 14) {
  return page.evaluate(([m, sx, sy, radius]) => {
    const canvas = VECTOR_VIEWS[m][1];
    const x0 = Math.max(0, Math.round(sx - radius)), y0 = Math.max(0, Math.round(sy - radius));
    const w = Math.min(canvas.width, Math.round(sx + radius)) - x0, h = Math.min(canvas.height, Math.round(sy + radius)) - y0;
    const px = canvas.getContext("2d").getImageData(x0, y0, w, h).data;
    let cx = 0, cy = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 110 || max === min) continue;
      let hh;
      if (max === r) hh = ((g - b) / (max - min)) % 6; else if (max === g) hh = (b - r) / (max - min) + 2; else hh = (r - g) / (max - min) + 4;
      hh = hh * 60 * Math.PI / 180;
      cx += Math.cos(hh); cy += Math.sin(hh); n++;
    }
    return { n, hue: (Math.atan2(cy, cx) * 180 / Math.PI + 360) % 360 };
  }, [m, sx, sy, radius]);
}

const pickedHue = (page, m) => page.evaluate((m) => {
  const [r, g, b] = SOLID_COLORS[vectorColors[m]].rgb, max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
}, m);
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

// Where the start and the end of a curve are on the canvas (canvas px).
function curveEnds(page, m, depth) {
  return page.evaluate(([m, depth]) => {
    const pts = LINE_CURVES[m].points(depth);
    const view = VECTOR_VIEWS[m][0];
    return [view.worldToScreen(pts[0][0], pts[0][1]), view.worldToScreen(pts[pts.length - 1][0], pts[pts.length - 1][1]), VECTOR_VIEWS[m][1].width, VECTOR_VIEWS[m][1].height];
  }, [m, depth]);
}

test.describe("color along the curves", () => {
  for (const m of CURVES) {
    test(`${m}: the hue turns by tens of degrees from its start to its end, around the picked color`, async ({ page }) => {
      await page.evaluate((m) => { setMode(m); }, m);
      const depth = m === "dragon" ? 8 : 5;
      await page.evaluate(([m, d]) => { dragonState.depth = d; fittedVectorModes.add(m); fitVectorView(m); requestRender(); }, [m, depth]);
      await frames(page);
      const [a, b, w, h] = await curveEnds(page, m, depth);
      expect(a[0] > 0 && a[0] < w && a[1] > 0 && a[1] < h && b[0] > 0 && b[0] < w && b[1] > 0 && b[1] < h, `both ends of the ${m} are on screen: ${a} ${b}`).toBe(true);
      const start = await windowHue(page, m, a[0], a[1]);
      const end = await windowHue(page, m, b[0], b[1]);
      expect(start.n, "start has line pixels").toBeGreaterThan(5);
      expect(end.n, "end has line pixels").toBeGreaterThan(5);
      const picked = await pickedHue(page, m);
      // 1.50.1 narrowed the sweep from 90 to 56 OKLCH degrees (Gold drifted to salmon and lime), which reads as
      // about 40 degrees of HSV hue on the dragon's Autumn: still tens of degrees, so the bound is 30, not 40.
      expect(hueGap(start.hue, end.hue), `start hue ${start.hue.toFixed(0)}, end hue ${end.hue.toFixed(0)}`).toBeGreaterThan(30);
      expect(hueGap(start.hue, picked), `start hue ${start.hue.toFixed(0)} vs picked ${picked.toFixed(0)}`).toBeLessThan(60);
      expect(hueGap(end.hue, picked), `end hue ${end.hue.toFixed(0)} vs picked ${picked.toFixed(0)}`).toBeLessThan(60);
      // The other way round: nearer the middle, the picked color's own hue.
      const picks = await page.evaluate(([m, depth]) => {
        const pts = LINE_CURVES[m].points(depth), p = pts[pts.length >> 1];
        return VECTOR_VIEWS[m][0].worldToScreen(p[0], p[1]);
      }, [m, depth]);
      const mid = await windowHue(page, m, picks[0], picks[1]);
      expect(hueGap(mid.hue, picked), `mid hue ${mid.hue.toFixed(0)} vs picked ${picked.toFixed(0)}`).toBeLessThan(30);
    });
  }

  // The brightness of the line pixels (the brightest quarter of the window's lit pixels, so the dark backdrop
  // and antialiasing don't count) around a canvas point.
  function windowBrightness(page, m, sx, sy, radius = 14) {
    return page.evaluate(([m, sx, sy, radius]) => {
      const canvas = VECTOR_VIEWS[m][1];
      const x0 = Math.max(0, Math.round(sx - radius)), y0 = Math.max(0, Math.round(sy - radius));
      const w = Math.min(canvas.width, Math.round(sx + radius)) - x0, h = Math.min(canvas.height, Math.round(sy + radius)) - y0;
      const px = canvas.getContext("2d").getImageData(x0, y0, w, h).data;
      const sums = [];
      for (let i = 0; i < px.length; i += 4) sums.push(px[i] + px[i + 1] + px[i + 2]);
      sums.sort((a, b) => b - a);
      const top = sums.slice(0, Math.max(5, sums.length >> 2));
      return top.reduce((a, b) => a + b, 0) / top.length;
    }, [m, sx, sy, radius]);
  }

  for (const m of CURVES) {
    test(`${m} in White: no hue to turn, so it runs from dim to bright along its length`, async ({ page }) => {
      await page.evaluate((m) => { setMode(m); vectorColors[m] = SOLID_COLORS.findIndex((c) => c.name === "White"); }, m);
      const depth = m === "dragon" ? 8 : 5;
      await page.evaluate(([m, d]) => { dragonState.depth = d; fittedVectorModes.add(m); fitVectorView(m); requestRender(); }, [m, depth]);
      await frames(page);
      // The ramp itself: dim at the start, bright at the end, brightening all the way.
      const ramp = await page.evaluate(() => curveRamp(SOLID_COLORS.findIndex((c) => c.name === "White")).map((c) => c.match(/\d+/g).map(Number)));
      const sum = (c) => c[0] + c[1] + c[2];
      expect(sum(ramp[0]), `start ${ramp[0]} vs end ${ramp[ramp.length - 1]}`).toBeLessThan(sum(ramp[ramp.length - 1]) * 0.72);
      for (let i = 1; i < ramp.length; i++) expect(sum(ramp[i]), `step ${i}`).toBeGreaterThanOrEqual(sum(ramp[i - 1]));
      // ... and the drawn line really is dimmer at the start of the curve than at its end.
      const [a, b] = await curveEnds(page, m, depth);
      const start = await windowBrightness(page, m, a[0], a[1]);
      const end = await windowBrightness(page, m, b[0], b[1]);
      expect(start, `line brightness at the start ${start.toFixed(0)} vs the end ${end.toFixed(0)}`).toBeLessThan(end * 0.85);
      expect(start, "but the start is still clearly visible (the backdrop's sum is about 70)").toBeGreaterThan(150);
    });
  }

  test("picking another color moves the whole curve to it", async ({ page }) => {
    await page.evaluate(() => setMode("hilbert"));
    await page.evaluate(() => { dragonState.depth = 4; fittedVectorModes.add("hilbert"); fitVectorView("hilbert"); requestRender(); });
    await frames(page);
    const [a] = await curveEnds(page, "hilbert", 4);
    const violet = await windowHue(page, "hilbert", a[0], a[1]);
    await page.locator("#dragonColormapBtn").click();
    await page.locator('#colormapMenu [role="menuitemradio"]', { hasText: "Green" }).click();
    await frames(page);
    const green = await windowHue(page, "hilbert", a[0], a[1]);
    expect(await page.evaluate(() => SOLID_COLORS[vectorColors.hilbert].name)).toBe("Green");
    expect(hueGap(violet.hue, green.hue), `${violet.hue.toFixed(0)} -> ${green.hue.toFixed(0)}`).toBeGreaterThan(60);
  });

  test("a hairline curve is at least 1.1 css px wide, and still visible", async ({ page }) => {
    // The densest levels used to draw 0.75 pt lines that nearly vanish; the core is at least 1.1 px.
    await page.evaluate(() => setMode("hilbert"));
    await page.evaluate(() => { dragonState.depth = 8; fittedVectorModes.add("hilbert"); fitVectorView("hilbert"); requestRender(); });
    await frames(page);
    const widths = await page.evaluate(() => {
      const seen = [];
      const set = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "lineWidth");
      Object.defineProperty(CanvasRenderingContext2D.prototype, "lineWidth", { ...set, set(v) { seen.push(v); set.set.call(this, v); } });
      VECTOR_VIEWS.hilbert[0].render({ depth: 8, colorIndex: vectorColors.hilbert, lite: true });
      Object.defineProperty(CanvasRenderingContext2D.prototype, "lineWidth", set);
      return { seen, dpr: VECTOR_VIEWS.hilbert[0].dpr };
    });
    expect(Math.min(...widths.seen) / widths.dpr).toBeGreaterThanOrEqual(1.1 - 1e-9);
  });
});

test.describe("no glow in lite mode", () => {
  for (const m of CURVES) {
    test(`${m}: a lite frame strokes the curve once, a full frame twice, and lights fewer pixels`, async ({ page }) => {
      await page.evaluate((m) => { setMode(m); }, m);
      // Long segments (a low depth), where the glow is drawn.
      const depth = m === "dragon" ? 6 : m === "hilbert" ? 3 : m === "gosper" ? 2 : 4;
      await page.evaluate(([m, d]) => { dragonState.depth = d; fittedVectorModes.add(m); fitVectorView(m); requestRender(); }, [m, depth]);
      await frames(page);
      const r = await page.evaluate(([m, depth]) => {
        const view = VECTOR_VIEWS[m][0], canvas = VECTOR_VIEWS[m][1], g = canvas.getContext("2d");
        const proto = CanvasRenderingContext2D.prototype, real = proto.stroke;
        const run = (lite) => {
          let strokes = 0;
          proto.stroke = function (...a) { strokes++; return real.apply(this, a); };
          view.render({ depth, colorIndex: vectorColors[m], lite, fitHalfHeight: m === "dragon" ? vectorFitHalfHeight("dragon") : undefined });
          proto.stroke = real;
          const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
          let lit = 0;
          for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 120) lit++; // well above the backdrop
          return { strokes, lit };
        };
        const full = run(false), lite = run(true);
        return { full, lite };
      }, [m, depth]);
      expect(r.lite.strokes, "a lite frame strokes only the core").toBeGreaterThan(0);
      expect(r.full.strokes, `full ${r.full.strokes} strokes vs lite ${r.lite.strokes}`).toBeGreaterThanOrEqual(2 * r.lite.strokes);
      expect(r.full.lit, `lit pixels, full ${r.full.lit} vs lite ${r.lite.lit}`).toBeGreaterThan(r.lite.lit * 1.15);
    });
  }
});

// hueTurned (colormaps.js) turns a color's hue in OKLCH since 1.50.1: lightness and chroma stay, the hue moves by the
// angle asked, and a turned color outside sRGB loses chroma (never lightness or hue) until it fits.
test.describe("hueTurned", () => {
  test("keeps lightness and chroma and rotates the hue by the angle asked", async ({ page }) => {
    const rows = await page.evaluate(() => {
      const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const lch = ([r, g, b]) => {
        const R = lin(r), G = lin(g), B = lin(b);
        const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
        const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
        const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
        const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, C: Math.hypot(a, bb), h: Math.atan2(bb, a) * 180 / Math.PI };
      };
      const out = [];
      for (const { name, rgb } of SOLID_COLORS) {
        if (rgb.every((v) => Math.abs(v - rgb[0]) < 8)) continue;   // White: no hue to turn
        for (const deg of [-56, -28, -10, 10, 28, 56]) {
          const turned = hueTurned(rgb, deg), a = lch(rgb), b = lch(turned);
          out.push({ name, deg, dL: b.L - a.L, dh: ((b.h - a.h - deg + 540) % 360) - 180, cRatio: b.C / a.C, inRange: turned.every((v) => v >= 0 && v <= 255) });
        }
      }
      return out;
    });
    // Nine chromatic colors (all but White) x six turns; 1.52.0 added Blue, Teal and Coral to the six, so 36 became 54.
    expect(await page.evaluate(() => SOLID_COLORS.length)).toBe(10);
    expect(rows.length).toBe(9 * 6);
    for (const r of rows) {
      const msg = `${r.name} ${r.deg}: dL ${r.dL.toFixed(4)}, hue error ${r.dh.toFixed(2)}, chroma x${r.cRatio.toFixed(2)}`;
      expect(Math.abs(r.dL), msg).toBeLessThan(0.005);
      expect(Math.abs(r.dh), msg).toBeLessThan(0.5);
      expect(r.cRatio, msg).toBeLessThan(1.01);
      // Blue (1.52.0) sits at the sRGB edge: turned toward cyan (negative degrees) it keeps 91% of its chroma at -10 degrees,
      // 75% at -21 and about 60% from -45 on, like Green turned toward yellow (69% at +45), so its floors are a little
      // lower. Turned the other way (toward violet) it keeps all of it.
      const floors = r.name === "Blue" && r.deg < 0 ? [0.88, 0.65, 0.55] : [0.95, 0.75, 0.6];
      expect(r.cRatio, msg).toBeGreaterThan(Math.abs(r.deg) <= 10 ? floors[0] : Math.abs(r.deg) <= 28 ? floors[1] : floors[2]);
      expect(r.inRange, msg).toBe(true);
    }
    // And a turn of 0 gives the color back.
    const same = await page.evaluate(() => SOLID_COLORS.map((c) => hueTurned(c.rgb, 0).map((v, q) => Math.abs(v - c.rgb[q]))));
    for (const diffs of same) for (const d of diffs) expect(d).toBeLessThan(0.5);
  });
});

test.describe("share links and the color picker", () => {
  test("a curve's link carries its color and opens in it", async ({ page }) => {
    await show(page, "gosper");
    const hash = await page.evaluate(() => { vectorColors.gosper = SOLID_COLORS.findIndex((c) => c.name === "Ice"); return buildShareHash(); });
    expect(hash).toMatch(/[?&#]c=3(&|$)/);
    await show(page, "hilbert");
    await page.evaluate((h) => { vectorColors.gosper = 0; applyShareLink(`https://example.org/${h}`); }, hash);
    const seen = await page.evaluate(() => ({ mode, gosper: SOLID_COLORS[vectorColors.gosper].name, hilbert: SOLID_COLORS[vectorColors.hilbert].name }));
    expect(seen).toMatchObject({ mode: "gosper", gosper: "Ice", hilbert: "Violet" });
  });

  test("the color picker still changes a dot shape and a curve, each its own", async ({ page }) => {
    await show(page, "sierpinski");
    await page.locator("#fernColorBtn").click();
    await page.locator('#colormapMenu [role="menuitemradio"]', { hasText: "Ice" }).click();
    await show(page, "arrowhead");
    await page.locator("#dragonColormapBtn").click();
    await page.locator('#colormapMenu [role="menuitemradio"]', { hasText: "Rose" }).click();
    const names = await page.evaluate(() => ["sierpinski", "arrowhead", "dragon", "hilbert", "gosper"].map((m) => SOLID_COLORS[vectorColors[m]].name));
    expect(names).toEqual(["Ice", "Rose", "Autumn", "Violet", "Rose"]);
  });
});
