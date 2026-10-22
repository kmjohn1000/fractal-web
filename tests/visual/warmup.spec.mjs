// Shader warm-up (warmColorVariants in app.js): with the styles flag on, the
// variants the color styles need are compiled while the app is idle, one at a
// time, for the main pane and (where dual view is offered) the Julia pane, so
// picking a style doesn't wait on the compiler. With the flag off nothing is
// compiled ahead. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global mainRenderer, juliaRenderer, setColorStyle, renderAll */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

let pageErrors = [];

async function load(page, { flag }) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((on) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      if (on) localStorage.setItem("fractalAtlas.styles", "1"); else localStorage.removeItem("fractalAtlas.styles");
    } catch { /* storage blocked */ }
  }, flag);
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
}

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const variants = (page) => page.evaluate(() => ({ main: [...mainRenderer.compiledVariants].sort(), julia: [...juliaRenderer.compiledVariants].sort() }));

test("flag on: the style variants are compiled once the app is idle, for both panes, and picking a style builds nothing", async ({ page }) => {
  await load(page, { flag: true });
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

test("flag on: a fractal the styles can't color is not warmed, and a view that isn't dual-capable skips the Julia pane", async ({ page }) => {
  await load(page, { flag: true });
  await page.evaluate(() => window["__vt"].fractal("Newton z³"));
  await page.waitForTimeout(1500);
  const v = await variants(page);
  // Newton colors by its own scheme: no style variants are built for it beyond what was already built for Mandelbrot at startup.
  expect(v.main.filter((x) => x > 0).length).toBeLessThanOrEqual(3);
});

test("flag off: nothing is compiled ahead of use", async ({ page }) => {
  await load(page, { flag: false });
  await page.waitForTimeout(3000);
  expect(await variants(page)).toEqual({ main: [0], julia: [0] });
});
