// Color styles (COLOR_STYLES in app.js): the style API is strict, each style
// draws on its fractal types, and a handful of states are compared with
// baselines like app.spec.mjs's. The default style's output is guarded by
// scripts/default-identity.mjs, and the styles' colors against the float64
// oracle by scripts/oracle-compare.mjs; this spec holds the app-level
// behavior. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global setColorStyle, colorStyle, colorStyleFor, mainState, enterDual, mainRenderer, markInteracting, renderAll,
   COLORMAPS */

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

test.describe("Orbit traps (Point and Cross)", () => {
  const plasma = () => COLORMAPS.findIndex((c) => c.name === "Plasma");
  for (const [name, fractal, style] of [["point-mandelbrot", "Mandelbrot", "point"], ["cross-mandelbrot", "Mandelbrot", "cross"],
    ["cross-ship", "Burn. Ship", "cross"], ["point-julia-rabbit", "Julia:Rabbit", "point"], ["cross-julia-rabbit", "Julia:Rabbit", "cross"]]) {
    test(`${style} on ${fractal}`, async ({ page }) => {
      await page.evaluate(([f, g, s]) => { window["__vt"].fractal(f, g); setColorStyle({ style: s }); }, [fractal, await page.evaluate(plasma), style]);
      await checkStyled(page, `style-trap-${name}`);
    });
  }

  // The traps go flat as you zoom in, so past about 1,000x deep the view
  // draws Smooth (the style stays chosen and returns when you zoom back out).
  test("are offered up to about 1,000x deep and draw Smooth beyond", async ({ page }) => {
    const r = await page.evaluate(() => {
      window["__vt"].fractal("Mandelbrot");
      setColorStyle({ style: "point" });
      const at = (zoom) => { mainState.scale = mainState.baseScale / zoom; return colorStyleFor(mainState).glsl; };
      return { opening: at(1), x500: at(500), x1000: at(1000), x2000: at(2000), deep: at(1e9), back: at(10), chosen: colorStyle.style };
    });
    expect(r).toEqual({ opening: 4, x500: 4, x1000: 4, x2000: 0, deep: 0, back: 4, chosen: "point" });
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
