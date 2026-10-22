// Fewer sharpening passes on slow deep-zoom views (an opt-in experiment,
// "#passes=8"; see refinePassCount in app.js). These checks hold that the
// normal setting is untouched, that only deep views are reduced, that Save and
// Share still finish all 16 samples, and that the reduced picture stays close
// to the full one. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global Diag, mainRenderer, requestRender, enterDual, captureShareBlob, refineNext, refineTarget, refineDone, TELEPORT_DESTINATIONS */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.removeItem("fractalAtlas.deepPasses");
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
const setPasses = (page, n) => page.evaluate((v) => { Diag.fromLink(`https://example.org/#passes=${v}`); requestRender(); }, n);
const chain = (page) => page.evaluate(() => ({ next: refineNext, target: refineTarget, done: refineDone }));

async function canvasPixels(page) {
  const url = await page.evaluate(() => mainRenderer.canvas.toDataURL("image/png"));
  return PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));
}
// Per pixel, the largest channel difference (0-255): the mean, the 99th percentile and the share over 16.
function compare(a, b) {
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

test("normal setting: a deep view draws all 16 passes", async ({ page }) => {
  expect(await page.evaluate(() => Diag.deepPasses)).toBe(16);
  await goTo(page, "Mandelbrot", "Seahorse Valley");
  await settle(page);
  expect(await chain(page)).toEqual({ next: 16, target: 16, done: true });
});

test("#passes sets and clears it, without a reload, and rejects nonsense", async ({ page }) => {
  await setPasses(page, 8);
  expect(await page.evaluate(() => Diag.deepPasses)).toBe(8);
  await setPasses(page, 16);
  expect(await page.evaluate(() => Diag.deepPasses)).toBe(16);
  for (const bad of ["0", "1", "17", "abc", "8.5", ""]) {
    await setPasses(page, bad);
    expect(await page.evaluate(() => Diag.deepPasses), `#passes=${bad}`).toBe(16);
  }
});

test("#passes=8: a deep view stops at 8, a shallow view still draws 16", async ({ page }) => {
  await setPasses(page, 8);
  await goTo(page, "Mandelbrot", "Seahorse Valley");
  await settle(page);
  expect(await chain(page)).toEqual({ next: 8, target: 8, done: true });
  await goTo(page, "Mandelbrot", "Elephant Valley");
  await settle(page);
  expect(await chain(page), "float32 views are cheap and stay at 16").toEqual({ next: 16, target: 16, done: true });
});

// Half the samples is a real quality trade-off, not a rounding error: measured
// 2026-10-22, 8 passes against 16 differ by a mean of 3.8-4.5 levels at Seahorse
// Valley (9-11% of pixels over 16 levels off) and 1.2-1.8 at Mini Mandelbrot,
// from the extra grain on steep bands. These limits only guard against the
// picture going wrong (a bad blend weight, a missing pass); whether the grain is
// acceptable is judged by eye on a phone. A float32 view is never reduced (0).
const LIMITS = { "Seahorse Valley": [8, 64, 0.2], "Mini Mandelbrot": [5, 56, 0.1], Armada: [0.001, 0, 0] };
for (const [fractal, label] of [["Mandelbrot", "Seahorse Valley"], ["Mandelbrot", "Mini Mandelbrot"], ["Burn. Ship", "Armada"]]) {
  test(`#passes=8 ${label}: the picture is the same picture, with some extra grain`, async ({ page }) => {
    await goTo(page, fractal, label);
    await settle(page);
    const full = await canvasPixels(page);
    await setPasses(page, 8);
    await settle(page);
    const c = compare(full, await canvasPixels(page));
    const [meanMax, p99Max, over16Max] = LIMITS[label];
    expect(c.mean, "mean difference in levels").toBeLessThan(meanMax);
    expect(c.p99, "99th percentile difference").toBeLessThanOrEqual(p99Max);
    expect(c.over16, "share of pixels more than 16 levels off").toBeLessThanOrEqual(over16Max);
  });
}

test("Save and Share still get all 16 samples", async ({ page }) => {
  await goTo(page, "Mandelbrot", "Seahorse Valley");
  await settle(page);
  const full = await canvasPixels(page);
  await setPasses(page, 8);
  await settle(page);
  expect((await chain(page)).next).toBe(8);
  await page.evaluate(() => captureShareBlob()); // what Save image, Save to Photos and Share all call
  expect(await chain(page)).toEqual({ next: 16, target: 16, done: true });
  const c = compare(full, await canvasPixels(page));
  expect(c.mean, "after Save the canvas has all 16 samples again").toBeLessThan(0.05);
});

test("dual view with a deep main pane: both panes follow the setting", async ({ page }) => {
  await goTo(page, "Mandelbrot", "Seahorse Valley");
  await settle(page);
  await page.evaluate(() => enterDual());
  await setPasses(page, 6);
  await settle(page);
  expect(await chain(page)).toEqual({ next: 6, target: 6, done: true });
});

test("a new view starts its own chain: back to 16 for a shallow one after a deep one", async ({ page }) => {
  await setPasses(page, 8);
  await goTo(page, "Mandelbrot", "Seahorse Valley");
  await settle(page);
  expect((await chain(page)).target).toBe(8);
  await goTo(page, "Mandelbrot", "Spiral Cluster");
  await settle(page);
  expect((await chain(page)).target).toBe(16);
});
