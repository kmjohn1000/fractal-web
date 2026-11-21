// Shake to roll the dice (shake.js): the JS side of the app's shake. The shake itself (UIKit's motionEnded,
// the Swift plugin) can't be produced here, so these call the handler the plugin would call and check what
// it does: on by default, rolls the die when on, ignores a shake during a flight, with a sheet or menu open
// or the tour up, and within a second of the last roll; the toggle's storage; and that the website hides
// the toggle. The Swift side and a real shake are checked by hand on a phone. Plain behavior checks, no
// baselines. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global handleShake, setShakeEnabled, shakeEnabled, shakeBlockedBy, isFlying, cancelTeleport, els, Platform,
   mainState, startTour, endTour, SHAKE_KEY, SHAKE_COOLDOWN_MS */

let pageErrors = [];

async function load(page, init) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((stored) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      if (stored) localStorage.setItem("fractalAtlas.shakeToRoll", stored);
    } catch { /* storage blocked */ }
  }, init || null);
  await page.goto("index.html");
  await page.waitForFunction(() => window["__faHooks"] > 0, null, { timeout: 90_000 });
  // Count haptics instead of calling the (app-only) plugin.
  await page.evaluate(() => { window.__haptics = 0; Platform.tapHaptic = () => { window.__haptics++; }; });
}

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("on by default: a shake rolls, and the website hides the toggle", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => ({
    enabled: shakeEnabled,
    blocked: shakeBlockedBy(),
    rolled: handleShake(10_000),
    flying: isFlying(),
    haptics: window.__haptics,
    toggleHidden: els.shakeToggle.classList.contains("hidden"),
    canShake: Platform.canShake,
  }));
  expect(r).toEqual({ enabled: true, blocked: "", rolled: true, flying: true, haptics: 1, toggleHidden: true, canShake: false });
});

test("turned off (stored 0): a shake does nothing", async ({ page }) => {
  await load(page, "0");
  const r = await page.evaluate(() => ({ enabled: shakeEnabled, blocked: shakeBlockedBy(), rolled: handleShake(10_000), flying: isFlying(), haptics: window.__haptics }));
  expect(r).toEqual({ enabled: false, blocked: "off", rolled: false, flying: false, haptics: 0 });
});

test("on: a shake rolls the die with a haptic, and a second shake within a second does not", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    setShakeEnabled(true);
    const before = { cx: mainState.cx, cy: mainState.cy, scale: mainState.scale };
    const first = handleShake(10_000);
    const flyingAfterFirst = isFlying();
    cancelTeleport(); // out of the air, so only the cooldown can refuse the next one
    const tooSoon = handleShake(10_000 + SHAKE_COOLDOWN_MS - 1);
    const later = handleShake(10_000 + SHAKE_COOLDOWN_MS);
    return { before, first, flyingAfterFirst, tooSoon, later, haptics: window.__haptics };
  });
  expect(r.first).toBe(true);
  expect(r.flyingAfterFirst).toBe(true);
  expect(r.tooSoon).toBe(false);
  expect(r.later).toBe(true);
  expect(r.haptics).toBe(2);
  // The flight is really under way: the view leaves where it started.
  await page.waitForFunction((b) => mainState.scale !== b.scale || mainState.cx !== b.cx, r.before, { timeout: 5000 });
});

test("a shake is ignored during a flight and counts again once it lands", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    setShakeEnabled(true);
    handleShake(0);
    const inAir = { flying: isFlying(), blocked: shakeBlockedBy(), rolled: handleShake(5_000), haptics: window.__haptics };
    return inAir;
  });
  expect(r).toEqual({ flying: true, blocked: "flight", rolled: false, haptics: 1 });
  await page.waitForFunction(() => !isFlying(), null, { timeout: 20_000 });
  expect(await page.evaluate(() => handleShake(100_000))).toBe(true);
});

test("a shake is ignored while a sheet or menu is open or the tour is up", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    setShakeEnabled(true);
    const out = {};
    for (const name of ["colorSheet", "placesSheet", "shareMenu", "diveMenu", "fractalTypeRow"]) {
      els[name].classList.add("open");
      out[name] = [shakeBlockedBy(), handleShake(1_000_000)];
      els[name].classList.remove("open");
    }
    startTour();
    out.tour = [shakeBlockedBy(), handleShake(2_000_000)];
    endTour();
    out.clear = [shakeBlockedBy(), window.__haptics];
    return out;
  });
  for (const name of ["colorSheet", "placesSheet", "shareMenu", "diveMenu", "fractalTypeRow"]) expect(r[name]).toEqual(["dialog", false]);
  expect(r.tour).toEqual(["tour", false]);
  expect(r.clear).toEqual(["", 0]);
});

test("the toggle is kept on the device and read back on the next load", async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    els.shakeToggle.classList.remove("hidden"); // the website hides it; show it to drive its click handler
    els.diveMenu.classList.add("open");
  });
  const btn = page.locator("#shakeToggle");
  await expect(btn).toHaveAttribute("aria-checked", "true"); // on by default
  await btn.click();
  await expect(btn).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem(SHAKE_KEY))).toBe("0");
  await page.reload();
  await page.waitForFunction(() => window["__faHooks"] > 0, null, { timeout: 90_000 });
  expect(await page.evaluate(() => shakeEnabled)).toBe(false); // the choice to turn it off is kept
  await page.evaluate(() => { els.shakeToggle.classList.remove("hidden"); els.diveMenu.classList.add("open"); });
  await btn.click();
  expect(await page.evaluate(() => [shakeEnabled, localStorage.getItem(SHAKE_KEY)])).toEqual([true, "1"]);
});
