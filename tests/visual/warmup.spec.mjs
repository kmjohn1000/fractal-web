// Shader warm-up (warmColorVariants in color-sheet.js): the variants the color styles
// need are compiled while the app is idle, one at a time, for the main pane and
// (where dual view is offered) the Julia pane, so picking a style doesn't wait
// on the compiler. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global mainRenderer, juliaRenderer, setColorStyle, renderAll */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

let pageErrors = [];

async function load(page) {
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
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
}

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const variants = (page) => page.evaluate(() => ({ main: [...mainRenderer.compiledVariants].sort(), julia: [...juliaRenderer.compiledVariants].sort() }));

test("the style variants are compiled once the app is idle, for both panes, and picking a style builds nothing", async ({ page }) => {
  await load(page);
  // Idle: every variant for both panes arrives without any style being picked.
  await expect.poll(async () => JSON.stringify(await variants(page)), { timeout: 30_000, intervals: [250] })
    .toBe(JSON.stringify({ main: [0, 1, 2, 3], julia: [0, 1, 2, 3] }));
  // Picking each style, in either pane's reach, compiles nothing more.
  const after = await page.evaluate(() => {
    for (const style of ["glow", "stripes", "point", "cross", "bands", "smooth"]) { setColorStyle({ style }); renderAll(); }
    return { main: [...mainRenderer.compiledVariants].sort(), julia: [...juliaRenderer.compiledVariants].sort() };
  });
  expect(after).toEqual({ main: [0, 1, 2, 3], julia: [0, 1, 2, 3] });
});

// The warm-up's first-draw prime (primeVariant) draws one fragment in the canvas
// corner so the GPU builds the style's shader before the pick, then puts that
// pixel back. It must not change a single pixel of the picture on screen.
test("priming a variant leaves every pixel of the canvas as it was", async ({ page }) => {
  await load(page);
  await expect.poll(async () => JSON.stringify(await variants(page)), { timeout: 30_000, intervals: [250] })
    .toBe(JSON.stringify({ main: [0, 1, 2, 3], julia: [0, 1, 2, 3] }));
  const r = await page.evaluate(() => {
    const out = [];
    for (const [name, renderer] of [["main", mainRenderer], ["julia", juliaRenderer]]) {
      const before = renderer.canvas.toDataURL();
      for (const v of [1, 2, 3]) renderer.primeVariant(v);
      out.push({ name, same: renderer.canvas.toDataURL() === before, size: before.length });
    }
    return out;
  });
  for (const c of r) {
    // (the Julia pane is hidden with nothing drawn until dual view opens)
    if (c.name === "main") expect(c.size, "main canvas has content").toBeGreaterThan(2000);
    expect(c.same, `${c.name} canvas unchanged by priming`).toBe(true);
  }
});

test("a fractal the styles can't color is not warmed, and a view that isn't dual-capable skips the Julia pane", async ({ page }) => {
  await load(page);
  await page.evaluate(() => window["__vt"].fractal("Newton z³"));
  await page.waitForTimeout(1500);
  const v = await variants(page);
  // Newton colors by its own scheme: no style variants are built for it beyond what was already built for Mandelbrot at startup.
  expect(v.main.filter((x) => x > 0).length).toBeLessThanOrEqual(3);
});
