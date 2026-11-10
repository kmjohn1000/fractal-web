// The Sine L-plane's heavy views (sineLHeavy in deepzoom.js: its iteration count is at least SINE_L_HEAVY_ITER, which the
// auto iteration count reaches as you zoom in): a drag moves the last frame (renderPreview) instead of drawing a live
// float32 frame, as Phoenix's does (phoenix-drag-preview.spec.mjs), and the sharpening stops at SINE_L_PASSES = 12 of the
// 16 passes. The opening view (380 iterations) is light and keeps live frames and all 16 passes. Plain behavior checks,
// no screenshot baselines: they count the calls to the renderer. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global mainRenderer, mainState, selectFractal, sineLHeavy, SINE_L_HEAVY_ITER, finishRefinement, refineNext, refineTarget, refineDone */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const GOLDEN = "#v=1&m=fractal&f=Sine+L+plane&x=0.3002522816081156&y=0.9895126626650655&s=0.00011920928955078125&r=0&i=1200";

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.removeItem("fractalAtlas.deepPasses"); // the default pass count, not the suite's pin of 16
    } catch { /* storage blocked */ }
  });
  await page.setViewportSize({ width: 393, height: 852 });
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

async function open(page, hash) {
  await page.goto("index.html" + hash);
  await page.addScriptTag({ path: DRIVER });
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
}

// The renderer calls made from now on: render (with its sample indexes) and renderPreview.
async function watch(page) {
  await page.evaluate(() => {
    window.__calls = { render: 0, preview: 0, samples: [] };
    const render = mainRenderer.render, preview = mainRenderer.renderPreview;
    mainRenderer.render = (s, i = 0) => { window.__calls.render++; window.__calls.samples.push(i); return render.call(mainRenderer, s, i); };
    mainRenderer.renderPreview = (...a) => { window.__calls.preview++; return preview.apply(mainRenderer, a); };
  });
}

async function drag(page) {
  const box = await page.locator("#mainCanvas").boundingBox();
  const x0 = box.x + box.width * 0.5, y0 = box.y + box.height * 0.4;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.evaluate(() => { window.__calls.render = 0; window.__calls.preview = 0; }); // only the moves count
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(x0 + i * 8, y0 + i * 3);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
  }
  const during = await page.evaluate(() => ({ render: window.__calls.render, preview: window.__calls.preview }));
  await page.mouse.up();
  await page.waitForTimeout(1500); // the settle timer draws the accurate frame
  const after = await page.evaluate(() => ({ render: window.__calls.render, preview: window.__calls.preview }));
  return { during, after };
}


const settle = (page) => page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
const chain = (page) => page.evaluate(() => ({ next: refineNext, target: refineTarget, done: refineDone }));

test("a zoomed-in view is heavy and the opening view is not", async ({ page }) => {
  await open(page, GOLDEN);
  expect(await page.evaluate(() => mainState.maxIter)).toBeGreaterThanOrEqual(await page.evaluate(() => SINE_L_HEAVY_ITER));
  expect(await page.evaluate(() => sineLHeavy(mainState))).toBe(true);
  await page.evaluate(() => selectFractal("Mandelbrot"));
  expect(await page.evaluate(() => sineLHeavy(mainState)), "other fractals are never heavy in this sense").toBe(false);

  await open(page, "");
  await page.evaluate(() => selectFractal("Sine L plane"));
  await settle(page);
  expect(await page.evaluate(() => mainState.maxIter), "the opening view's iteration count").toBeLessThan(500);
  expect(await page.evaluate(() => sineLHeavy(mainState))).toBe(false);
});

test("a heavy view stops sharpening at 12 passes, and Save and Share still finish all 16", async ({ page }) => {
  await open(page, GOLDEN);
  expect(await chain(page)).toEqual({ next: 12, target: 12, done: true });
  await page.evaluate(() => finishRefinement());
  await settle(page);
  expect(await chain(page)).toEqual({ next: 16, target: 16, done: true });
});

test("the opening view sharpens through all 16 passes", async ({ page }) => {
  await open(page, "");
  await page.evaluate(() => selectFractal("Sine L plane"));
  await settle(page);
  expect(await chain(page)).toEqual({ next: 16, target: 16, done: true });
});

test("a drag on a heavy view moves the last frame and draws the real one once you stop", async ({ page }) => {
  await open(page, GOLDEN);
  await watch(page);
  const r = await drag(page);
  expect(r.during.preview, "the drag drew previews").toBeGreaterThan(0);
  expect(r.during.render, "and no live frames").toBe(0);
  expect(r.after.render, "the accurate frame is drawn after the drag").toBeGreaterThan(0);
});

test("a drag at the opening view still draws live frames (unchanged)", async ({ page }) => {
  await open(page, "");
  await page.evaluate(() => selectFractal("Sine L plane"));
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
  await watch(page);
  const r = await drag(page);
  expect(r.during.render, "live frames while dragging").toBeGreaterThan(0);
  expect(r.during.preview, "no previews at the opening view").toBe(0);
});
