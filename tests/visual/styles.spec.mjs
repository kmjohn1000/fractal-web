// Color styles (COLOR_STYLES in app.js): the style API is strict, each style
// draws on its fractal types, and a handful of states are compared with
// baselines like app.spec.mjs's. The default style's output is guarded by
// scripts/default-identity.mjs, and the styles' colors against the float64
// oracle by scripts/oracle-compare.mjs; this spec holds the app-level
// behavior. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global setColorStyle, colorStyle, colorStyleFor, mainState */

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
    expect(await page.evaluate(() => ({ ...colorStyle }))).toEqual({ style: "smooth", density: 1, offset: 0 });
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
    expect(r[0]).toEqual({ style: "smooth", density: 1, offset: 0 });
    expect(r[1]).toEqual({ style: "bands", density: 8, offset: 0.75 });
    expect(r[2]).toEqual({ style: "bands", density: 0.25, offset: 0.5 });
    expect(r[3]).toEqual({ style: "bands", density: 1, offset: 0 });
    expect(r[4]).toEqual({ style: "smooth", density: 1, offset: 0 });
  });

  test("a view draws Smooth when its fractal can't do the chosen style", async ({ page }) => {
    const r = await page.evaluate(() => {
      const drawn = (fractal) => { window["__vt"].fractal(fractal); setColorStyle({ style: "bands" }); return colorStyleFor(mainState).glsl; };
      return { mandelbrot: drawn("Mandelbrot"), phoenix: drawn("Phoenix"), newton: drawn("Newton z³"), carpet: drawn("Carpet") };
    });
    // Newton and Carpet color by their own schemes; Phoenix has Smooth and Bands.
    expect(r).toEqual({ mandelbrot: 1, phoenix: 1, newton: 0, carpet: 0 });
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
