// The zoom floor (deepzoom.js, minScaleFor): every way of zooming stops where a view's center can no longer follow a
// one-pixel pan. The escape-time family stops at 1e-30 (its exact BigInt center, float32 deltas); Apollonian, Newton and
// Phoenix stop a few steps of their center's last digit; Nova keeps its own limit and Spider stops two float32 steps of its center per pixel; Carpet and Gasket have an exact center that grows with the zoom, so their floor is only the scale's own
// double, 1e-300 (tests/visual/digit-infinite.spec.mjs).
// Plain behavior checks, no screenshot baselines.
import { test, expect } from "@playwright/test";

/* global mainState, setCenter, minScaleFor, limitScale, atZoomLimit, selectFractal, updateHud, showHud, els, TELEPORT_DESTINATIONS,
   FRACTAL_CONFIGS, FTYPE, ulp64, ulp32, FLOOR_STEPS, FLOOR_PIXELS */

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
  await page.waitForFunction(() => typeof minScaleFor === "function" && typeof mainState === "object");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test("each family's floor", async ({ page }) => {
  const r = await page.evaluate(() => {
    const at = (ftype, cx, cy, power = 2) => minScaleFor({ ftype, power, cx, cy, scale: 1e-20 });
    return {
      mandelbrot: at(FTYPE.ESCAPE, 0.3, 0.5), ship: at(FTYPE.SHIP, -1.7, -0.03), tricorn: at(FTYPE.TRICORN, 0, 0), celtic: at(FTYPE.CELTIC, 0.1, 0.1),
      apollonian: at(FTYPE.APOLLONIAN, 0.4472135954957291, 0.8944271910020332), apollonianNearZero: at(FTYPE.APOLLONIAN, 1e-6, 0),
      newton: at(FTYPE.NEWTON, 1, 0), phoenix: at(FTYPE.PHOENIX, 0.5, 0.5), phoenixNearZero: at(FTYPE.PHOENIX, 1e-3, 0), nova: at(FTYPE.NOVA, 1, 1),
      // Spider: two float32 steps per pixel at the nominal canvas, never under 2e-5 (see SPIDER_MIN_SCALE)
      spiderNearZero: at(FTYPE.SPIDER, 0, 0), spiderNear03: at(FTYPE.SPIDER, 0.3, 0.1), spiderNear05: at(FTYPE.SPIDER, -0.5, 0.2),
      spiderNear12: at(FTYPE.SPIDER, -0.3371, 1.1738), spiderFar: at(FTYPE.SPIDER, 1.4, 0),
      spiderWant: [0.3, 0.5, 1.1738, 1.4].map((r) => FLOOR_STEPS * ulp32(r) * FLOOR_PIXELS / 2),
      carpet: at(FTYPE.CARPET, 0.5, 0.5), gasket: at(FTYPE.GASKET, 0.5, 0.5),
      steps: FLOOR_STEPS, pixels: FLOOR_PIXELS, ulp1: ulp64(0.8944271910020332),
      phoenixWant: FLOOR_STEPS * ulp64(0.5) * FLOOR_PIXELS / 2,
    };
  });
  expect(r.mandelbrot).toBe(1e-30);
  expect(r.ship).toBe(1e-30);
  expect(r.tricorn).toBe(1e-30);
  expect(r.celtic).toBe(1e-30);
  expect(r.nova).toBe(4e-5);
  // Spider (float32 only): two float32 steps of the larger coordinate per pixel at the nominal canvas, never under 2e-5.
  expect(r.spiderNearZero).toBe(2e-5);
  expect(r.spiderNear03).toBe(r.spiderWant[0]);
  expect(r.spiderNear05).toBe(r.spiderWant[1]);
  expect(r.spiderNear12).toBe(r.spiderWant[2]);
  expect(r.spiderFar).toBe(r.spiderWant[3]);
  expect(r.spiderNear12, "deeper in the view's center, the floor rises").toBeGreaterThan(r.spiderNear05);
  expect(r.carpet).toBe(1e-300);
  expect(r.gasket).toBe(1e-300);
  // The Apollonian gasket runs its chain of inversions from the exact center, so its floor is a choice (1e-100), the
  // same wherever the center is.
  expect(r.apollonian).toBe(1e-100);
  expect(r.apollonianNearZero).toBe(1e-100);
  expect(r.newton, "Newton at |c| = 1 is on the fixed-point grid, 2^-48").toBe(r.steps * 2 ** -48 * r.pixels / 2);
  // Phoenix: the double-center formula (a pan needs a few steps of the center's last digit) at |c| = 0.5, and never
  // deeper than 1e-13 (where its Julia views start to lose pixels, tests/visual/phoenix-depth.spec.mjs).
  expect(r.phoenix).toBe(r.phoenixWant);
  expect(r.phoenixNearZero).toBe(1e-13);
});

test("limitScale stops at the floor and leaves everything above it alone", async ({ page }) => {
  const r = await page.evaluate(() => {
    const m = { ftype: FTYPE.ESCAPE, power: 2, cx: 0, cy: 0 };
    const a = { ftype: FTYPE.APOLLONIAN, power: 2, cx: 0.4472135954957291, cy: 0.8944271910020332 };
    const c = { ftype: FTYPE.CARPET, power: 2, cx: 0.5, cy: 0.5 };
    return {
      mandelbrotBelow: limitScale(m, 1e-40), mandelbrotAbove: limitScale(m, 1e-20),
      apolloBelow: limitScale(a, 1e-120), apolloAbove: limitScale(a, 1e-9), apolloFloor: minScaleFor(a),
      carpetDeep: limitScale(c, 1e-20), gasketBelow: limitScale({ ftype: FTYPE.GASKET, power: 2, cx: 0.5, cy: 0.5 }, 1e-310),
    };
  });
  expect(r.mandelbrotBelow).toBe(1e-30);
  expect(r.mandelbrotAbove).toBe(1e-20);
  expect(r.apolloBelow).toBe(r.apolloFloor);
  expect(r.apolloAbove).toBe(1e-9);
  expect(r.carpetDeep).toBe(1e-20);
  expect(r.gasketBelow).toBe(1e-300);
});

test("every place is above the floor of its own view, so no place is cut short", async ({ page }) => {
  const r = await page.evaluate(() => {
    const below = [];
    for (const d of TELEPORT_DESTINATIONS) {
      const cfg = FRACTAL_CONFIGS[d.fractal];
      const f = minScaleFor({ ftype: cfg.ftype, power: cfg.power, cx: Number(d.re), cy: Number(d.im), scale: d.scale });
      if (d.scale < f) below.push(`${d.fractal} | ${d.label}`);
    }
    return { below, count: TELEPORT_DESTINATIONS.length };
  });
  expect(r.count).toBeGreaterThan(100);
  expect(r.below).toEqual([]);
});

test("a wheel zoom in on the Apollonian gasket stops at the floor and the info card says so", async ({ page }) => {
  const r = await page.evaluate(() => {
    selectFractal("Apollonian", { fresh: true });
    setCenter(mainState, 0.4472135954957291, 0.8944271910020332);
    mainState.scale = minScaleFor(mainState) * 1.5;
    const floor = minScaleFor(mainState);
    const rect = els.mainCanvas.getBoundingClientRect();
    // Several big wheel steps in: each would take it well past the floor.
    for (let i = 0; i < 4; i++) {
      els.mainCanvas.dispatchEvent(new WheelEvent("wheel", { clientX: Math.round(rect.left + rect.width / 2), clientY: Math.round(rect.top + rect.height / 2), deltaY: -600, bubbles: true, cancelable: true }));
    }
    showHud(); // the info card is closed by default and draws nothing then
    updateHud(null);
    return { scale: mainState.scale, floor, atLimit: atZoomLimit(mainState), hud: els.hudPlain.textContent.includes("As deep as this fractal goes") };
  });
  expect(r.scale).toBe(r.floor);
  expect(r.atLimit).toBe(true);
  expect(r.hud).toBe(true);
});

test("a link deeper than the floor opens at the floor", async ({ page }) => {
  const r = await page.evaluate(() => {
    const hash = "#v=1&m=fractal&f=Mandelbrot&x=0&y=1&s=1e-40&r=0&i=500&cm=Classic";
    window["applyShareLink"]("https://example.test/" + hash);
    return { scale: mainState.scale, name: mainState.ftype };
  });
  expect(r.scale).toBe(1e-30);
});
