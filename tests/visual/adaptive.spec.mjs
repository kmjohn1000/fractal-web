// Adaptive refinement (the opt-in experiment in createFractalRenderer, switched
// on with #adaptive): the first four supersamples are drawn in full, then only
// the pixels whose samples still disagree get the other twelve. These checks
// hold that it is off unless asked for, that when it is on the stencil mask is
// really used, and that the finished picture stays close to the full 16 passes.
// Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global Diag, mainRenderer, juliaRenderer, requestRender, enterDual, TELEPORT_DESTINATIONS */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.removeItem("fractalAtlas.adaptive");
    } catch { /* storage blocked */ }
  });
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await settle(page);
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

async function settle(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const goTo = (page, fractal, label) => page.evaluate(([f, l]) => {
  window["__vt"].place(TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === f && d.label === l));
}, [fractal, label]);

// The main canvas as it is now, decoded; preserveDrawingBuffer keeps it readable.
async function canvasPixels(page, which = "main") {
  const url = await page.evaluate((w) => (w === "main" ? mainRenderer : juliaRenderer).canvas.toDataURL("image/png"), which);
  return PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));
}

// Per pixel, the largest channel difference (0-255); returns the mean, the 99th percentile and the share over 16.
function compare(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  const n = a.width * a.height;
  const d = new Uint8Array(n);
  let sum = 0, over16 = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const e = Math.max(Math.abs(a.data[j] - b.data[j]), Math.abs(a.data[j + 1] - b.data[j + 1]), Math.abs(a.data[j + 2] - b.data[j + 2]));
    d[i] = e; sum += e; if (e > 16) over16++;
  }
  const sorted = Uint8Array.from(d).sort();
  return { mean: sum / n, p99: sorted[Math.floor(n * 0.99)], over16: over16 / n };
}

const stats = (page, which = "main") => page.evaluate((w) => ({ ...(w === "main" ? mainRenderer : juliaRenderer).adaptiveStats }), which);
const turnOn = (page) => page.evaluate(() => { Diag.fromLink("https://example.org/#adaptive"); requestRender(); });

test("off unless asked for: no mask is ever drawn", async ({ page }) => {
  expect(await page.evaluate(() => Diag.adaptive)).toBe(false);
  await goTo(page, "Mandelbrot", "Elephant Valley");
  await settle(page);
  expect(await stats(page)).toEqual({ chains: 0, maskedPasses: 0 });
});

test("#adaptive turns it on and #adaptive=0 off, without a reload", async ({ page }) => {
  await page.evaluate(() => Diag.fromLink("https://example.org/#adaptive"));
  expect(await page.evaluate(() => Diag.adaptive)).toBe(true);
  await page.evaluate(() => Diag.fromLink("https://example.org/#adaptive=0"));
  expect(await page.evaluate(() => Diag.adaptive)).toBe(false);
});

for (const [fractal, label] of [
  ["Mandelbrot", "Elephant Valley"], // float32
  ["Mandelbrot", "Seahorse Valley"], // deep perturbation
  ["Burn. Ship", "Armada"],
  ["Julia:Rabbit", "Rabbit Hole"],
]) {
  test(`${fractal} ${label}: the mask is used and the picture stays close to 16 full passes`, async ({ page }) => {
    await goTo(page, fractal, label);
    await settle(page);
    const full = await canvasPixels(page);
    await turnOn(page);
    await settle(page);
    const s = await stats(page);
    expect(s.chains, "a refinement chain was masked").toBeGreaterThan(0);
    expect(s.maskedPasses, "samples 5-16 were drawn under the mask").toBeGreaterThan(0);
    const c = compare(full, await canvasPixels(page));
    expect(c.mean, "mean difference in levels").toBeLessThan(0.5);
    expect(c.p99, "99th percentile difference").toBeLessThanOrEqual(4);
    expect(c.over16, "share of pixels more than 16 levels off").toBeLessThan(0.001);
  });
}

test("dual view: both panes are masked and the main pane stays close", async ({ page }) => {
  await goTo(page, "Mandelbrot", "Spiral Cluster");
  await settle(page);
  await page.evaluate(() => enterDual());
  await settle(page);
  const full = await canvasPixels(page, "main");
  await turnOn(page);
  await settle(page);
  expect((await stats(page, "main")).maskedPasses).toBeGreaterThan(0);
  expect((await stats(page, "julia")).maskedPasses).toBeGreaterThan(0);
  const c = compare(full, await canvasPixels(page, "main"));
  expect(c.mean).toBeLessThan(0.5);
  expect(c.over16).toBeLessThan(0.001);
});

test("a view change restarts the chain: the old mask never carries over", async ({ page }) => {
  await goTo(page, "Mandelbrot", "Elephant Valley");
  await settle(page);
  await turnOn(page);
  await settle(page);
  // Move to another place and compare with the same place drawn in full.
  await goTo(page, "Mandelbrot", "Spiral Cluster");
  await settle(page);
  const adaptive = await canvasPixels(page);
  await page.evaluate(() => { Diag.fromLink("https://example.org/#adaptive=0"); requestRender(); });
  await settle(page);
  const c = compare(await canvasPixels(page), adaptive);
  expect(c.mean).toBeLessThan(0.5);
  expect(c.over16).toBeLessThan(0.001);
});
