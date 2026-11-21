// Haptics at key moments (platform.js haptic(kind)): the web has none, so these check that each moment asks
// for the right kind of tap by replacing Platform.haptic with a recorder, plus that the real helper is a
// quiet no-op on the web. How the taps feel is checked by hand on a phone. Plain behavior checks, no baselines.
import { test, expect } from "@playwright/test";

/* global Platform, crossedUpright, pickColormap, resetRotation, mainState, teleport, isFlying, cancelTeleport, els, COLORMAPS */

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
  await page.waitForFunction(() => window["__faHooks"] > 0, null, { timeout: 90_000 });
}

const record = (page) => page.evaluate(() => {
  window["__kinds"] = [];
  Platform.haptic = (k) => { window["__kinds"].push(k); };
});
const kinds = (page) => page.evaluate(() => window["__kinds"]);

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("the real helper is a quiet no-op on the web and loads nothing", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const before = document.querySelectorAll("script[src='capacitor.js']").length;
    const out = ["tick", "snap", "land", "reset", "nonsense"].map((k) => Platform.haptic(k));
    return { out, before, after: document.querySelectorAll("script[src='capacitor.js']").length };
  });
  expect(r.out).toEqual([undefined, undefined, undefined, undefined, undefined]);
  expect(r.after).toBe(r.before);
});

test("crossing 0 degrees counts only for a short step through upright", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => ({
    up: crossedUpright(-0.05, 0.05),
    down: crossedUpright(0.05, -0.05),
    onto: crossedUpright(-0.05, 0),
    same: crossedUpright(0.2, 0.3),
    away: crossedUpright(0, 0.1),
    wrap: crossedUpright(3.1, -3.1), // the 180 degree wrap, not upright
  }));
  expect(r).toEqual({ up: true, down: true, onto: true, same: false, away: false, wrap: false });
});

test("picking a palette ticks, a landing taps, Reset taps, the compass snap clicks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // flights and the compass turn finish at once
  await load(page);
  await record(page);

  await page.evaluate((i) => pickColormap(i), 3);
  expect(await kinds(page)).toEqual(["tick"]);

  await page.evaluate(() => teleport());
  await expect.poll(() => page.evaluate(() => isFlying())).toBe(false);
  expect(await kinds(page)).toContain("land");

  await page.evaluate(() => { window["__kinds"].length = 0; els.resetBtn.click(); });
  expect(await kinds(page)).toEqual(["reset"]);

  await page.evaluate(() => { cancelTeleport(); window["__kinds"].length = 0; mainState.rotation = 0.6; resetRotation("main"); });
  await expect.poll(() => kinds(page)).toContain("snap");
  expect(await page.evaluate(() => mainState.rotation)).toBe(0);
});

test("a colormap name still resolves after picking (the tick does not break the pick)", async ({ page }) => {
  await load(page);
  await record(page);
  const name = await page.evaluate(() => { pickColormap(2); return COLORMAPS[2].name; });
  expect(name).toBeTruthy();
});
