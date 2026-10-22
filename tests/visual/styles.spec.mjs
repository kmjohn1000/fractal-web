// Color styles (COLOR_STYLES in app.js): the style API is strict, each style
// draws on its fractal types, and a handful of states are compared with
// baselines like app.spec.mjs's. The default style's output is guarded by
// scripts/default-identity.mjs, and the styles' colors against the float64
// oracle by scripts/oracle-compare.mjs; this spec holds the app-level
// behavior. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global setColorStyle, colorStyle, colorStyleFor, mainState, enterDual, mainRenderer, markInteracting, renderAll,
   COLORMAPS, captureShareBlob, decodeTrapRange, trapRangeFor */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const BLANK_DOMINANT_SHARE = 0.995;

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
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await waitSettled(page);
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

async function waitSettled(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 100 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const place = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;

// A frame that is one flat color is a broken style (a NaN, a missing uniform).
function dominantShare(png) {
  const { data, width, height } = PNG.sync.read(png);
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Math.max(...counts.values()) / (width * height);
}

async function checkStyled(page, name) {
  await waitSettled(page);
  const s = await page.evaluate(() => window["__vt"].inspect());
  expect.soft(s.error, "error banner").toBeNull();
  expect.soft(s.contextLost, "WebGL context lost").toBe(false);
  const c = s.canvas;
  const shot = await page.screenshot({ clip: { x: c.x, y: c.y, width: c.w, height: c.h } });
  expect.soft(dominantShare(shot), "frame is mostly one color").toBeLessThanOrEqual(BLANK_DOMINANT_SHARE);
  await expect(page).toHaveScreenshot(`${name}.png`);
}

test.describe("the style API", () => {
  test("starts at today's coloring", async ({ page }) => {
    expect(await page.evaluate(() => ({ ...colorStyle }))).toEqual({ style: "smooth", density: 1, offset: 0, trap: null });
  });

  test("is strict about what it accepts", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      const read = () => ({ ...colorStyle });
      setColorStyle({ style: "constructor" }); out.push(read());
      setColorStyle({ style: "bands", density: 100, offset: -0.25 }); out.push(read());
      setColorStyle({ density: 0.001, offset: 1.5 }); out.push(read());
      setColorStyle({ density: NaN, offset: Infinity }); out.push(read());
      setColorStyle({ style: "zz" }); out.push(read());
      return out;
    });
    expect(r[0]).toEqual({ style: "smooth", density: 1, offset: 0, trap: null });
    expect(r[1]).toEqual({ style: "bands", density: 8, offset: 0.75, trap: null });
    expect(r[2]).toEqual({ style: "bands", density: 0.25, offset: 0.5, trap: null });
    expect(r[3]).toEqual({ style: "bands", density: 1, offset: 0, trap: null });
    expect(r[4]).toEqual({ style: "smooth", density: 1, offset: 0, trap: null });
  });

  test("a view draws Smooth when its fractal can't do the chosen style", async ({ page }) => {
    const r = await page.evaluate(() => {
      const drawn = (fractal) => { window["__vt"].fractal(fractal); setColorStyle({ style: "bands" }); return colorStyleFor(mainState).glsl; };
      return { mandelbrot: drawn("Mandelbrot"), phoenix: drawn("Phoenix"), newton: drawn("Newton z³"), carpet: drawn("Carpet") };
    });
    // Newton and Carpet color by their own schemes; Phoenix has Smooth and Bands.
    expect(r).toEqual({ mandelbrot: 1, phoenix: 1, newton: 0, carpet: 0 });
  });

  test("Glow is offered on the types with a derivative and drawn as Smooth elsewhere", async ({ page }) => {
    const r = await page.evaluate(() => {
      const drawn = (fractal) => { window["__vt"].fractal(fractal); setColorStyle({ style: "glow" }); return colorStyleFor(mainState); };
      const out = {};
      for (const f of ["Mandelbrot", "Burn. Ship", "Tricorn", "Celtic", "Multibrot³", "Julia:Rabbit", "Phoenix", "Julia:Phoenix", "Newton z³", "Carpet", "Gasket", "Apollonian"]) {
        const c = drawn(f);
        out[f] = `${c.glsl}/${c.variant}`;
      }
      return out;
    });
    // glsl 2 / variant 1 is Glow; 0/0 is Smooth.
    expect(r).toEqual({ "Mandelbrot": "2/1", "Burn. Ship": "2/1", "Tricorn": "2/1", "Celtic": "2/1", "Multibrot³": "2/1",
      "Julia:Rabbit": "2/1", "Phoenix": "0/0", "Julia:Phoenix": "0/0", "Newton z³": "0/0", "Carpet": "0/0", "Gasket": "0/0",
      "Apollonian": "0/0" });
  });
});

test.describe("Glow", () => {
  for (const [name, fractal] of [["mandelbrot", "Mandelbrot"], ["ship", "Burn. Ship"], ["tricorn", "Tricorn"], ["celtic", "Celtic"],
    ["multibrot", "Multibrot³"], ["julia-rabbit", "Julia:Rabbit"]]) {
    test(`${fractal} opening view`, async ({ page }) => {
      await page.evaluate((f) => { window["__vt"].fractal(f); setColorStyle({ style: "glow" }); }, fractal);
      await checkStyled(page, `style-glow-${name}`);
    });
  }

  test("Seahorse Valley (deep, perturbation)", async ({ page }) => {
    await page.evaluate(`${place("Seahorse Valley")}; setColorStyle({ style: "glow" })`);
    await checkStyled(page, "style-glow-seahorse");
  });

  test("Sunken Crown on Burning Ship (1.2e-12)", async ({ page }) => {
    await page.evaluate(`${place("Sunken Crown")}; setColorStyle({ style: "glow" })`);
    await checkStyled(page, "style-glow-sunken-crown");
  });

  test("the dual view's Julia pane glows too", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); enterDual(); setColorStyle({ style: "glow" }); });
    await checkStyled(page, "style-glow-dual");
  });

  // At depth a drag shows the last accurate frame moved with the gesture
  // (renderPreview), so after a style change that snapshot must be the new
  // style's frame, never the old one.
  test("the deep-zoom drag preview shows the current style", async ({ page }) => {
    await page.evaluate(`${place("Seahorse Valley")}; setColorStyle({ style: "smooth" })`);
    await waitSettled(page);
    await page.evaluate(() => setColorStyle({ style: "glow" }));
    await waitSettled(page);
    const r = await page.evaluate(async () => {
      const canvas = mainRenderer.canvas;
      const grab = () => canvas.toDataURL("image/png");
      const settled = grab();
      markInteracting();
      renderAll(); // draws the snapshot, unmoved
      const preview = grab();
      const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; });
      const pixels = async (src) => {
        const i = await load(src);
        const c = document.createElement("canvas");
        c.width = i.width; c.height = i.height;
        const g = c.getContext("2d");
        g.drawImage(i, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const [a, b] = [await pixels(settled), await pixels(preview)];
      let sum = 0;
      for (let k = 0; k < a.length; k += 4) sum += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
      return sum / (a.length / 4) / 3;
    });
    // The unmoved preview resamples the same frame: nearly identical (a stale
    // Smooth snapshot would differ by tens of levels).
    expect(r).toBeLessThan(2);
  });
});

test.describe("Bands", () => {
  test("Mandelbrot opening view", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); setColorStyle({ style: "bands" }); });
    await checkStyled(page, "style-bands-mandelbrot");
  });

  test("Seahorse Valley (deep, perturbation)", async ({ page }) => {
    await page.evaluate(`${place("Seahorse Valley")}; setColorStyle({ style: "bands" })`);
    await checkStyled(page, "style-bands-seahorse");
  });

  test("bands 2.5 and shift 0.25 on Burning Ship", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Burn. Ship"); setColorStyle({ density: 2.5, offset: 0.25 }); });
    await checkStyled(page, "style-density-shift-ship");
  });
});

test.describe("Stripes", () => {
  const glacier = () => COLORMAPS.findIndex((c) => c.name === "Glacier");
  for (const [name, fractal] of [["mandelbrot", "Mandelbrot"], ["ship", "Burn. Ship"], ["tricorn", "Tricorn"], ["celtic", "Celtic"],
    ["multibrot", "Multibrot³"], ["julia-rabbit", "Julia:Rabbit"]]) {
    test(`${fractal} opening view`, async ({ page }) => {
      await page.evaluate(([f, g]) => { window["__vt"].fractal(f, g); setColorStyle({ style: "stripes" }); }, [fractal, await page.evaluate(glacier)]);
      await checkStyled(page, `style-stripes-${name}`);
    });
  }

  test("Seahorse Valley (deep, perturbation)", async ({ page }) => {
    await page.evaluate(`${place("Seahorse Valley")}; colormapIndex = COLORMAPS.findIndex((c) => c.name === "Glacier"); updateLUT(); setColorStyle({ style: "stripes" })`);
    await checkStyled(page, "style-stripes-seahorse");
  });

  test("Phoenix draws Smooth", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Phoenix"); setColorStyle({ style: "stripes" }); });
    expect(await page.evaluate(() => colorStyleFor(mainState).glsl)).toBe(0);
  });
});

// Save and Share capture the canvas through captureShareBlob (plus a
// watermark pill, bottom right): the file must be the frame on screen.
test.describe("Save image", () => {
  for (const style of ["glow", "stripes", "point", "bands"]) {
    test(`the saved image of a ${style} view is the frame on screen`, async ({ page }) => {
      await page.evaluate((s) => { window["__vt"].fractal("Mandelbrot"); setColorStyle({ style: s, density: 1.5, offset: 0.1 }); }, style);
      await waitSettled(page);
      const r = await page.evaluate(async () => {
        const blob = await captureShareBlob();
        const img = await createImageBitmap(blob);
        const canvas = mainRenderer.canvas;
        const grab = (src, w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(src, 0, 0); return g.getImageData(0, 0, w, h).data; };
        const a = grab(canvas, canvas.width, canvas.height), b = grab(img, img.width, img.height);
        if (img.width !== canvas.width || img.height !== canvas.height) return { size: [img.width, img.height, canvas.width, canvas.height] };
        let sum = 0, n = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (x > canvas.width * 0.55 && y > canvas.height * 0.85) continue; // the watermark pill
            const i = (y * canvas.width + x) * 4;
            sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
            n += 3;
          }
        }
        return { mean: sum / n };
      });
      expect(r.size, "saved image has the canvas's size").toBeUndefined();
      expect(r.mean).toBeLessThan(0.5);
    });
  }
});

test.describe("Orbit traps (Point and Cross)", () => {
  const plasma = () => COLORMAPS.findIndex((c) => c.name === "Plasma");
  for (const [name, fractal, style] of [["point-mandelbrot", "Mandelbrot", "point"], ["cross-mandelbrot", "Mandelbrot", "cross"],
    ["cross-ship", "Burn. Ship", "cross"], ["point-julia-rabbit", "Julia:Rabbit", "point"], ["cross-julia-rabbit", "Julia:Rabbit", "cross"]]) {
    test(`${style} on ${fractal}`, async ({ page }) => {
      await page.evaluate(([f, g, s]) => { window["__vt"].fractal(f, g); setColorStyle({ style: s }); }, [fractal, await page.evaluate(plasma), style]);
      await checkStyled(page, `style-trap-${name}`);
    });
  }

  // The traps' colormap range is set per view from a probe (trapRange in
  // createFractalRenderer), so they work at any depth: they're offered at all
  // zooms, and a deep view still has real contrast, where a fixed range
  // painted it one color (the contrast across a deep view fell to 0%).
  test("are offered at any depth", async ({ page }) => {
    const r = await page.evaluate(() => {
      window["__vt"].fractal("Mandelbrot");
      setColorStyle({ style: "point" });
      const at = (zoom) => { mainState.scale = mainState.baseScale / zoom; return colorStyleFor(mainState).glsl; };
      return { opening: at(1), x2000: at(2000), x1e9: at(1e9), x1e13: at(1e13), back: at(10), chosen: colorStyle.style };
    });
    expect(r).toEqual({ opening: 4, x2000: 4, x1e9: 4, x1e13: 4, back: 4, chosen: "point" });
  });

  const placeCall = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;
  for (const [place, style] of [["Seahorse Valley", "point"], ["Seahorse Valley", "cross"], ["Mini Mandelbrot", "point"], ["Mini Mandelbrot", "cross"]]) {
    test(`${style} at ${place} (deep) has real contrast, not one flat color`, async ({ page }) => {
      await page.evaluate(`${placeCall(place)}; setColorStyle({ style: ${JSON.stringify(style)} });`);
      await waitSettled(page);
      const r = await page.evaluate(() => {
        const c = document.getElementById("mainCanvas");
        const t = document.createElement("canvas"); t.width = 120; t.height = 120;
        const g = t.getContext("2d");
        g.drawImage(c, 0, 0, 120, 120);
        const d = g.getImageData(0, 0, 120, 120).data;
        const lum = [];
        for (let i = 0; i < d.length; i += 4) lum.push(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]);
        const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
        const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
        return { sd, scale: mainState.scale, drawn: colorStyleFor(mainState).glsl };
      });
      expect(r.scale).toBeLessThan(1e-9);
      expect(r.drawn, "the trap style is drawn at depth").toBeGreaterThanOrEqual(4);
      // A flat frame has a standard deviation near 0; the auto-ranged traps measure 25-70.
      expect(r.sd, "the deep frame spans the colormap").toBeGreaterThan(15);
    });
  }

  // The probe's bytes: red and green hold ln(distance) over ln(1e-12) .. ln(1e2)
  // in 16 bits, blue the escaped flag; the range is the 2nd-98th percentile.
  test("the range decoded from a probe is the percentile of the escaped distances", async ({ page }) => {
    const r = await page.evaluate(() => {
      const enc = (d) => { const q = Math.round(((Math.log(d) + 27.6310211) / 32.2361913) * 65535); return [q >> 8, q & 255]; };
      const px = [];
      for (let i = 0; i < 100; i++) { const d = 0.001 + i * 0.0001; px.push(...enc(d), 255, 255); } // escaped: 0.001 .. 0.0109
      for (let i = 0; i < 40; i++) px.push(...enc(0.5), 0, 255);                                       // interior: far away
      const a = decodeTrapRange(Uint8Array.from(px));
      // Almost nothing escaped: every pixel counts.
      const few = [];
      for (let i = 0; i < 50; i++) few.push(...enc(0.2 + i * 0.001), i < 3 ? 255 : 0, 255);
      const b = decodeTrapRange(Uint8Array.from(few));
      // A flat view still gets a usable range, and garbage gives null.
      const flat = [];
      for (let i = 0; i < 30; i++) flat.push(...enc(0.25), 255, 255);
      return { a, b, flat: decodeTrapRange(Uint8Array.from(flat)), none: decodeTrapRange(new Uint8Array(0)) };
    });
    expect(r.a.lo).toBeGreaterThan(0.00099); expect(r.a.lo).toBeLessThan(0.0013);
    expect(r.a.hi).toBeGreaterThan(0.0105); expect(r.a.hi).toBeLessThan(0.0112);
    expect(r.b.hi, "mostly interior: the range covers every pixel").toBeGreaterThan(0.24);
    expect(r.flat.hi).toBeGreaterThan(r.flat.lo);
    expect(r.none).toBeNull();
  });

  // The fixed range stays while the probe's is as wide as it is (a shallow
  // view, whose far field would stretch it, keeps its contrast); as the
  // probe's narrows to half of it or less the colormap moves onto it.
  test("the range is the fixed one for a shallow view and the probe's for a deep one", async ({ page }) => {
    const r = await page.evaluate(() => {
      const enc = (d) => { const q = Math.round(((Math.log(d) + 27.6310211) / 32.2361913) * 65535); return [q >> 8, q & 255]; };
      const make = (f) => { const px = []; for (let i = 0; i < 100; i++) px.push(...enc(f(i)), 255, 255); return Uint8Array.from(px); };
      const fixed = { lo: 0, hi: 1 };
      return {
        shallow: trapRangeFor(make((i) => 0.02 + i * 0.03), fixed),   // 0.02 .. 3: the far field is wider than the fixed range
        mid: trapRangeFor(make((i) => 0.05 + i * 0.007), fixed),      // 0.05 .. 0.74: half way onto the probe's range
        deep: trapRangeFor(make((i) => 0.30 + i * 0.0001), fixed),    // a narrow band inside it
        far: trapRangeFor(make((i) => 2 + i * 0.01), fixed),          // everything beyond the fixed range: not clamped to nothing
        none: trapRangeFor(new Uint8Array(0), fixed),
      };
    });
    expect(r.shallow).toEqual({ lo: 0, hi: 1 });
    expect(r.mid.hi, "between the fixed and the probe's end").toBeGreaterThan(0.74); expect(r.mid.hi).toBeLessThan(1);
    expect(r.mid.lo).toBeGreaterThan(0); expect(r.mid.lo).toBeLessThan(0.1);
    expect(r.deep.hi).toBeLessThan(0.311); expect(r.deep.hi).toBeGreaterThan(0.309);
    expect(r.deep.lo).toBeGreaterThan(0.2999);
    expect(r.far.hi).toBeGreaterThan(r.far.lo);
    expect(r.none).toEqual({ lo: 0, hi: 1 });
  });

  test("Newton, Carpet and Phoenix never draw them", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const f of ["Newton z³", "Carpet", "Phoenix", "Julia:Phoenix"]) { window["__vt"].fractal(f); setColorStyle({ style: "cross" }); out.push(colorStyleFor(mainState).glsl); }
      return out;
    });
    expect(r).toEqual([0, 0, 0, 0]);
  });
});
