// The flight blend (flight-blend.js): during a Surprise-me flight an overlay over the main canvas
// follows the picture through a time-based low-pass, so a fast zoom can't flash; it fades away after
// the landing. With Reduce Motion on, a flight is a crossfade instead: the view jumps to the place and
// the old picture dissolves into it. Function checks, no screenshots (scripts/flash-check.mjs measures
// the flashing itself). Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global TELEPORT_DESTINATIONS, mainState, flyToPlace, blendState, teleportLandingIndex, enterDual */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
let pageErrors = [];

async function load(page) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.setItem("fractalAtlas.tourDone", "1");
    } catch { /* storage blocked */ }
  });
  await page.goto("index.html#v=1&m=fractal&f=Mandelbrot&x=-0.5&y=0&s=1.2&r=0");
  await page.addScriptTag({ path: DRIVER });
  await settle(page);
}
const settle = (page) => page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
const place = (page, label) => page.evaluate((l) => TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === "Mandelbrot" && d.label === l), label);
const overlay = (page) => page.evaluate(() => {
  const o = document.getElementById("flightBlend");
  if (!o) return null;
  const r = o.getBoundingClientRect(), c = document.getElementById("mainCanvas").getBoundingClientRect();
  return {
    shown: o.style.display !== "none", opacity: Number(getComputedStyle(o).opacity),
    pointerEvents: getComputedStyle(o).pointerEvents, mode: blendState.mode, active: blendState.active,
    over: [r.x - c.x, r.y - c.y, r.width - c.width, r.height - c.height].every((v) => Math.abs(v) < 0.5),
  };
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test("a flight shows the blend over the canvas, and it is gone once the place has settled", async ({ page }) => {
  await load(page);
  expect(await overlay(page), "no overlay before the first flight").toBeNull();
  const i = await place(page, "Seahorse Valley");
  await page.evaluate((n) => flyToPlace(n), i);
  const o = await overlay(page);
  expect(o.shown && o.active && o.mode === "blend").toBe(true);
  expect(o.over, "the overlay covers the main canvas exactly").toBe(true);
  expect(o.pointerEvents, "touches go through to the canvas").toBe("none");
  // settled() waits for the overlay (the driver's flightBlendBusy), so screenshots never catch it.
  await settle(page);
  expect((await overlay(page)).shown).toBe(false);
  expect(await page.evaluate(() => teleportLandingIndex)).toBe(i);
  expect(await page.evaluate((n) => mainState.scale === TELEPORT_DESTINATIONS[n].scale, i)).toBe(true);
});

test("a touch during a flight takes the blend away at once", async ({ page }) => {
  await load(page);
  await page.evaluate((n) => flyToPlace(n), await place(page, "Mini Mandelbrot"));
  await page.waitForTimeout(300);
  expect((await overlay(page)).shown).toBe(true);
  const box = await page.locator("#mainCanvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await overlay(page)).shown, "hidden on the pointerdown").toBe(false);
  await page.mouse.up();
  expect(await page.evaluate(() => teleportLandingIndex), "the flight never landed").not.toBe(await place(page, "Mini Mandelbrot"));
});

test("in dual view the overlay covers only the main pane", async ({ page }) => {
  await load(page);
  await page.evaluate(() => enterDual());
  await settle(page);
  await page.evaluate((n) => flyToPlace(n), await place(page, "Elephant Valley"));
  const o = await overlay(page);
  expect(o.shown && o.over).toBe(true);
  await settle(page);
});

test.describe("with Reduce Motion on", () => {
  test.use({ reducedMotion: "reduce" });

  test("a flight is a crossfade: the view is on the place at once, and the old picture dissolves", async ({ page }) => {
    await load(page);
    const i = await place(page, "Sunburst Fan");
    const at = await page.evaluate((n) => {
      flyToPlace(n);
      const d = TELEPORT_DESTINATIONS[n];
      return { scale: mainState.scale === d.scale, landed: teleportLandingIndex === n };
    }, i);
    expect(at, "no frames in between: the view jumps straight to the place").toEqual({ scale: true, landed: true });
    const o = await overlay(page);
    expect(o.shown && o.mode === "crossfade" && o.opacity === 1, "the old picture holds while the new one draws").toBe(true);
    // Once the new place has drawn in full, the overlay dissolves (opacity heads to 0) and goes.
    await page.waitForFunction(() => Number(getComputedStyle(document.getElementById("flightBlend")).opacity) < 1, null, { timeout: 30_000 });
    await settle(page);
    expect((await overlay(page)).shown).toBe(false);
  });
});
