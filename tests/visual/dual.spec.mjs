// Dual view (a fractal beside its Julia set). The Julia pane used to open at the
// main pane's zoom, centered on the origin: from any zoomed-in view (every
// Surprise-me place) a magnified flat patch that was blank and still paid for a
// deep render. It now opens on the whole Julia set, with its own iteration
// budget. These checks hold that for several places and styles, and that the
// pane isn't redrawn once it is done. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global enterDual, exitDual, mainState, juliaState, dualActive, setColorStyle, SAMPLE_OFFSETS */

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
      localStorage.setItem("fractalAtlas.styles", "1");
    } catch { /* storage blocked */ }
    // Count draws per canvas, to see how often the Julia pane is redrawn.
    const draws = {};
    window["__draws"] = draws;
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
      for (const fn of ["drawArrays", "drawElements"]) {
        const orig = C.prototype[fn];
        C.prototype[fn] = function (...a) {
          const id = this.canvas && this.canvas.id;
          draws[id] = (draws[id] || 0) + 1;
          return orig.apply(this, a);
        };
      }
    }
  });
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await settle(page);
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

async function settle(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const place = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;

// Share of the frame taken by its most common color (5 bits a channel): the suite's blank check.
function dominantShare(png) {
  const { data, width, height } = PNG.sync.read(png);
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Math.max(...counts.values()) / (width * height);
}

// Places from each dual-capable family, from shallow to 1e-12.
const PLACES = ["Seahorse Valley", "Sunburst Fan", "Antenna Minibrot", "Stingray", "Baby Tricorn", "Manta", "Seahorse Curl"];

for (const style of ["smooth", "glow", "stripes"]) {
  test(`dual view from every kind of place: neither pane is blank (${style})`, async ({ page }) => {
    const problems = [];
    for (const label of PLACES) {
      await page.evaluate(([p, style]) => {
        if (dualActive) exitDual();
        window["__vt"].fractal("Mandelbrot");
        eval(p); // __vt.place(...)
        setColorStyle({ style });
        enterDual();
      }, [place(label), style]);
      await settle(page);
      for (const pane of ["#mainCanvas", "#juliaCanvas"]) {
        const share = dominantShare(await page.locator(pane).screenshot());
        if (share > BLANK_DOMINANT_SHARE) problems.push(`${label} ${pane}: ${(share * 100).toFixed(1)}% one color`);
      }
      const s = await page.evaluate(() => window["__vt"].inspect());
      if (s.error) problems.push(`${label}: error banner ${s.error}`);
      if (s.contextLost) problems.push(`${label}: WebGL context lost`);
    }
    expect(problems).toEqual([]);
  });
}

test("the Julia pane opens on the whole Julia set, with its own iteration budget", async ({ page }) => {
  const r = await page.evaluate((p) => {
    eval(p);
    const main = { scale: mainState.scale, base: mainState.baseScale, maxIter: mainState.maxIter, locked: mainState.iterAutoLocked };
    enterDual();
    return { main, julia: { scale: juliaState.scale, base: juliaState.baseScale, maxIter: juliaState.maxIter, locked: juliaState.iterAutoLocked } };
  }, place("Seahorse Valley"));
  expect(r.main.scale, "the main pane is deep").toBeLessThan(1e-8);
  expect(r.julia.scale, "no more zoomed in than the fractal's opening view").toBeGreaterThanOrEqual(r.main.base);
  expect(r.julia.base).toBe(r.julia.scale);
  expect(r.julia.maxIter, "not the main pane's deep-place budget").toBeLessThan(r.main.maxIter);
  expect(r.julia.locked).toBe(false);
  // From the opening view (or zoomed out) nothing changes: the panes share a zoom, as before.
  const same = await page.evaluate(() => {
    exitDual();
    window["__vt"].fractal("Mandelbrot");
    mainState.scale = mainState.baseScale * 2;
    enterDual();
    return juliaState.scale === mainState.scale;
  });
  expect(same, "zoomed out: the panes keep one scale").toBe(true);
});

test("once both panes are drawn the Julia pane isn't redrawn, and toggling draws it once through", async ({ page }) => {
  await page.evaluate(`${place("Seahorse Valley")}`);
  await settle(page);
  await page.evaluate(() => { for (const k of Object.keys(window["__draws"])) window["__draws"][k] = 0; enterDual(); });
  await settle(page);
  const passes = await page.evaluate(() => SAMPLE_OFFSETS.length);
  const afterToggle = await page.evaluate(() => ({ ...window["__draws"] }));
  expect(afterToggle.juliaCanvas, "one pass per sample while the Julia pane refines").toBeLessThanOrEqual(passes + 2);
  // Idle: no further draws on either pane.
  await page.waitForTimeout(600);
  const later = await page.evaluate(() => ({ ...window["__draws"] }));
  expect(later.juliaCanvas, "no redraws of the Julia pane while idle").toBe(afterToggle.juliaCanvas);
  expect(later.mainCanvas, "no redraws of the main pane while idle").toBe(afterToggle.mainCanvas);
});
