// Dive styles (dive-style.js) and the flight blend (flight-blend.js). Touch and hold Surprise me for a
// menu: Full Motion (the default: every frame of the flight) or Blur (an overlay over the main canvas
// follows the picture through a time-based low-pass, so a fast zoom can't flash, and fades away after the
// landing). With Reduce Motion on, a flight is a crossfade either way: the view jumps to the place and the
// old picture dissolves into it. Function checks, no screenshots (scripts/flash-check.mjs measures the
// flashing itself). Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global TELEPORT_DESTINATIONS, mainState, flyToPlace, blendState, teleportLandingIndex, enterDual, diveStyle, isInteracting,
   lastMainDeepPath, mainRenderer, SPIRAL_DIVE_MS */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
let pageErrors = [];

// dive: the stored dive style to start with (null: none stored, the default).
// view: the share-link view to open (the whole set by default).
async function load(page, dive = "blur", view = "x=-0.5&y=0&s=1.2&r=0") {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((d) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.setItem("fractalAtlas.tourDone", "1");
      if (d && !sessionStorage.getItem("diveSet")) { localStorage.setItem("fractalAtlas.diveStyle", d); sessionStorage.setItem("diveSet", "1"); }
    } catch { /* storage blocked */ }
  }, dive);
  await page.goto(`index.html#v=1&m=fractal&f=Mandelbrot&${view}`);
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
const shown = async (page) => (await overlay(page))?.shown ?? false;
const menu = (page) => page.locator("#diveMenu");
// Touch and hold the die: press, wait past the hold time, lift.
async function holdDie(page) {
  const box = await page.locator("#teleportBtn").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
}

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test.describe("dive style", () => {
  test("Full Motion is the default: a flight draws every frame, with no blend over it", async ({ page }) => {
    await load(page, null);
    expect(await page.evaluate(() => diveStyle)).toBe("full");
    await page.locator("#teleportBtn").click();
    await page.waitForFunction(() => isInteracting, null, { timeout: 5_000 });
    expect(await shown(page), "no overlay in Full Motion").toBe(false);
    await page.waitForTimeout(400);
    expect(await shown(page), "nor later in the flight").toBe(false);
    await settle(page);
    expect(await page.evaluate(() => teleportLandingIndex), "it landed on a place").toBeGreaterThanOrEqual(0);
  });

  test("touching and holding the die opens the menu without flying; picking Blur is kept", async ({ page }) => {
    await load(page, null);
    const before = await page.evaluate(() => mainState.scale);
    await holdDie(page);
    await expect(menu(page)).toHaveClass(/open/);
    expect(await page.evaluate(() => mainState.scale), "the hold didn't fly").toBe(before);
    await expect(menu(page).locator('[data-dive="full"]')).toHaveAttribute("aria-checked", "true");
    await expect(menu(page).locator('[data-dive="full"]'), "focus goes to the current style").toBeFocused();
    const m = await menu(page).boundingBox(), d = await page.locator("#teleportBtn").boundingBox();
    expect(m.y + m.height, "the menu sits above the die").toBeLessThanOrEqual(d.y);
    const vw = page.viewportSize().width;
    expect(m.x >= 0 && m.x + m.width <= vw, "and inside the screen").toBe(true);

    await menu(page).locator('[data-dive="blur"]').click();
    await expect(menu(page)).not.toHaveClass(/open/);
    expect(await page.evaluate(() => [diveStyle, localStorage.getItem("fractalAtlas.diveStyle")])).toEqual(["blur", "blur"]);
    await page.reload();
    await page.addScriptTag({ path: DRIVER });
    expect(await page.evaluate(() => diveStyle), "remembered after a reload").toBe("blur");
  });

  test("a right-click opens the menu too; Escape and a tap elsewhere close it", async ({ page }) => {
    await load(page, null);
    await page.locator("#teleportBtn").click({ button: "right" });
    await expect(menu(page)).toHaveClass(/open/);
    await page.keyboard.press("Escape");
    await expect(menu(page)).not.toHaveClass(/open/);
    await page.locator("#teleportBtn").click({ button: "right" });
    await expect(menu(page)).toHaveClass(/open/);
    const c = await page.locator("#mainCanvas").boundingBox();
    await page.mouse.click(c.x + c.width / 2, c.y + c.height / 3);
    await expect(menu(page)).not.toHaveClass(/open/);
  });

  test("a plain tap on the die with the menu open closes it and flies", async ({ page }) => {
    await load(page, null);
    await page.locator("#teleportBtn").click({ button: "right" });
    await expect(menu(page)).toHaveClass(/open/);
    await page.locator("#teleportBtn").click();
    await expect(menu(page)).not.toHaveClass(/open/);
    // The flight's first frame is on the next animation frame: wait for it before waiting for the landing.
    await page.waitForFunction(() => isInteracting, null, { timeout: 5_000 });
    await settle(page);
    expect(await page.evaluate(() => teleportLandingIndex), "it flew to a place").toBeGreaterThanOrEqual(0);
  });
});

// Full Motion's flights since 1.86.0 (1.85's "Slow dive" test style).
test.describe("Full Motion flights", () => {
  test("the menu has two styles, and 1.85's stored Slow dive reads as Full Motion", async ({ page }) => {
    await load(page, "slow");
    expect(await page.evaluate(() => diveStyle)).toBe("full");
    await page.locator("#teleportBtn").click({ button: "right" });
    await expect(menu(page).locator("[data-dive]")).toHaveCount(2);
    await expect(menu(page).locator('[data-dive="full"]')).toHaveAttribute("aria-checked", "true");
  });

  test("a plain flight is slower and draws its deep frames live; landing clears the flight's reference", async ({ page }) => {
    await load(page, null);
    const i = await place(page, "Mini Mandelbrot");
    // Watch the flight from inside the page: the deepest frame drawn and the path it took.
    const seen = await page.evaluate((n) => new Promise((resolve) => {
      const t0 = performance.now();
      let deepLive = 0, deepPreview = 0;
      flyToPlace(n);
      const watch = () => {
        if (isInteracting && mainState.scale < 1e-4) {
          if (lastMainDeepPath === "perturbation (flight)") deepLive++; else deepPreview++;
        }
        if (teleportLandingIndex === n) resolve({ ms: performance.now() - t0, deepLive, deepPreview });
        else requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    }), i);
    expect(seen.ms, "slower than Full Motion's 1.8 s").toBeGreaterThan(4000);
    expect(seen.deepLive, "deep frames drawn live").toBeGreaterThan(0);
    expect(seen.deepPreview, "none of them the stretched last frame").toBe(0);
    await settle(page);
    expect(await page.evaluate(() => mainRenderer.flightDeepLive(Object.assign({}, mainState))), "no flight reference after landing").toBe(false);
  });

  test("a deep-to-deep flight draws its way out live too, from a reference at the start", async ({ page }) => {
    // Start at Mini Mandelbrot (1.5e-12) and fly to Seahorse Valley (4e-10): the path climbs out of the start
    // above DEEP_ZOOM_THRESHOLD before diving into the destination.
    await load(page, null, "x=-1.749003357223038&y=0&s=1.5e-12&r=0&i=2000");
    expect(await page.evaluate(() => mainState.scale), "it starts deep").toBe(1.5e-12);
    const i = await place(page, "Seahorse Valley");
    const seen = await page.evaluate((n) => new Promise((resolve) => {
      let out = true, peak = mainState.scale;
      const legs = { out: { live: 0, preview: 0 }, in: { live: 0, preview: 0 } };
      flyToPlace(n);
      const watch = () => {
        if (isInteracting && teleportLandingIndex !== n) {
          // Past the top of the path once well below its highest point (a frame can round a hair below the last).
          peak = Math.max(peak, mainState.scale);
          if (mainState.scale < peak / 2) out = false;
          if (mainState.scale < 1e-4) legs[out ? "out" : "in"][lastMainDeepPath === "perturbation (flight)" ? "live" : "preview"]++;
        }
        if (teleportLandingIndex === n) resolve(legs);
        else requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    }), i);
    expect(seen.out.live, `deep frames on the way out drawn live (${JSON.stringify(seen)})`).toBeGreaterThan(0);
    expect(seen.out.preview, "none of them the stretched last frame").toBe(0);
    expect(seen.in.live, "deep frames on the way in drawn live").toBeGreaterThan(0);
    expect(seen.in.preview, "none of them the stretched last frame").toBe(0);
  });

  test("Blur keeps the quick flight", async ({ page }) => {
    await load(page, "blur");
    const i = await place(page, "Mini Mandelbrot");
    const ms = await page.evaluate((n) => new Promise((resolve) => {
      const t0 = performance.now();
      flyToPlace(n);
      const watch = () => (teleportLandingIndex === n ? resolve(performance.now() - t0) : requestAnimationFrame(watch));
      requestAnimationFrame(watch);
    }), i);
    expect(ms, "Mini Mandelbrot in about 1.8 s, not Full Motion's 7").toBeLessThan(3500);
  });

  test("a spiral dive keeps its own pace", async ({ page }) => {
    await load(page, null);
    await page.evaluate(() => window["__vt"].fractal("Julia:Rabbit"));
    await settle(page);
    const ms = await page.evaluate(() => new Promise((resolve) => {
      const n = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === "Julia:Rabbit" && d.spiral);
      const t0 = performance.now();
      flyToPlace(n);
      const watch = () => (teleportLandingIndex === n ? resolve({ took: performance.now() - t0, want: SPIRAL_DIVE_MS }) : requestAnimationFrame(watch));
      requestAnimationFrame(watch);
    }));
    expect(Math.abs(ms.took - ms.want), "the spiral dive's own 7 s").toBeLessThan(500);
  });
});

test("the website's first-visit flight always blurs, whatever the dive style", async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  // A fresh visitor (no visited flag), no share link: the cold open flies to a showpiece.
  await page.goto("index.html");
  await page.waitForFunction(() => typeof diveStyle === "string" && isInteracting, null, { timeout: 30_000, polling: 20 });
  expect(await page.evaluate(() => diveStyle), "the visitor's own style is the default").toBe("full");
  expect(await shown(page), "the flight blurs anyway").toBe(true);
});

test.describe("Blur", () => {
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
    expect(await shown(page)).toBe(false);
    expect(await page.evaluate(() => teleportLandingIndex)).toBe(i);
    expect(await page.evaluate((n) => mainState.scale === TELEPORT_DESTINATIONS[n].scale, i)).toBe(true);
  });

  test("a touch during a flight takes the blend away at once", async ({ page }) => {
    await load(page);
    await page.evaluate((n) => flyToPlace(n), await place(page, "Mini Mandelbrot"));
    await page.waitForTimeout(300);
    expect(await shown(page)).toBe(true);
    const box = await page.locator("#mainCanvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await shown(page), "hidden on the pointerdown").toBe(false);
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
});

test.describe("with Reduce Motion on", () => {
  test.use({ reducedMotion: "reduce" });

  for (const dive of ["full", "blur"]) {
    test(`a flight is a crossfade in ${dive === "full" ? "Full Motion" : "Blur"}: the view is on the place at once, and the old picture dissolves`, async ({ page }) => {
      await load(page, dive);
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
      expect(await shown(page)).toBe(false);
    });
  }
});
