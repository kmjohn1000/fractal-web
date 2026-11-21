// Home Screen quick action "Surprise Me" (quick-actions.js): the JS side of the app's long-press shortcut.
// The shortcut itself (Info.plist, the Swift QuickActionsPlugin) can't be produced here, so these stub the
// platform bridge (Platform.quickActions) and call what the plugin would trigger: a cold start's pending
// action skips the opening flight and rolls the die (unless the first-run tour is due), no pending action
// leaves the opening flight alone, a warm action rolls, and is ignored during a flight, with a sheet or menu
// open and with the tour up; the website's bridge does nothing. The Swift side and a real shortcut are
// checked by hand on a phone. Plain behavior checks, no baselines.
import { test, expect } from "@playwright/test";

/* global startQuickActions, handleQuickAction, quickActionBlockedBy, isFlying, cancelTeleport, els, Platform,
   startTour, endTour, mainState */

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
  await page.evaluate(() => { window.__haptics = 0; Platform.tapHaptic = () => { window.__haptics++; }; });
}

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

// A cold start with `pending` as the action the Swift side kept (null for none); resolves to what
// startQuickActions reported plus whether the opening flight callback ran and whether a flight began.
async function coldStart(page, pending, { tourDue = false } = {}) {
  return page.evaluate(async ({ pending, tourDue }) => {
    const listeners = [];
    Platform.quickActions.takePending = () => Promise.resolve(pending);
    Platform.quickActions.onQuickAction = (h) => listeners.push(h);
    Platform.tour.isDue = () => tourDue;
    cancelTeleport();
    let opening = 0;
    const rolled = await startQuickActions(() => { opening++; }, 0);
    const flyingAtOnce = isFlying();
    await new Promise((r) => setTimeout(r, 300)); // two frames and the (zero) delay
    return { rolled, opening, flyingAtOnce, flying: isFlying(), listeners: listeners.length };
  }, { pending, tourDue });
}

test("cold start with a pending surprise: no opening flight, the die is rolled instead", async ({ page }) => {
  await load(page);
  const r = await coldStart(page, "surprise");
  expect(r).toEqual({ rolled: true, opening: 0, flyingAtOnce: false, flying: true, listeners: 1 });
});

test("cold start with no pending action: the opening flight runs and nothing is rolled", async ({ page }) => {
  await load(page);
  const r = await coldStart(page, null);
  expect(r).toEqual({ rolled: false, opening: 1, flyingAtOnce: false, flying: false, listeners: 1 });
});

test("cold start with an unknown action: treated as none", async ({ page }) => {
  await load(page);
  const r = await coldStart(page, "lastview");
  expect(r.rolled).toBe(false);
  expect(r.opening).toBe(1);
  expect(r.flying).toBe(false);
});

test("cold start while the first-run tour is due: the shortcut is ignored, the usual opening runs", async ({ page }) => {
  await load(page);
  const r = await coldStart(page, "surprise", { tourDue: true });
  expect(r).toEqual({ rolled: false, opening: 1, flyingAtOnce: false, flying: false, listeners: 1 });
});

test("warm: the action rolls the die with a haptic", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const before = { cx: mainState.cx, cy: mainState.cy, scale: mainState.scale };
    const blocked = quickActionBlockedBy();
    const rolled = handleQuickAction("surprise");
    return { before, blocked, rolled, flying: isFlying(), haptics: window.__haptics };
  });
  expect(r.blocked).toBe("");
  expect(r.rolled).toBe(true);
  expect(r.flying).toBe(true);
  expect(r.haptics).toBe(1);
  await page.waitForFunction((b) => mainState.scale !== b.scale || mainState.cx !== b.cx, r.before, { timeout: 5000 });
});

test("warm: an unknown action does nothing", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => ({ rolled: handleQuickAction("lastview"), flying: isFlying(), haptics: window.__haptics }));
  expect(r).toEqual({ rolled: false, flying: false, haptics: 0 });
});

test("warm: ignored during a flight, and counts again once it ends", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    handleQuickAction("surprise");
    const inAir = { blocked: quickActionBlockedBy(), rolled: handleQuickAction("surprise"), haptics: window.__haptics };
    cancelTeleport();
    const after = { blocked: quickActionBlockedBy(), rolled: handleQuickAction("surprise"), haptics: window.__haptics };
    return { inAir, after };
  });
  expect(r.inAir).toEqual({ blocked: "flight", rolled: false, haptics: 1 });
  expect(r.after).toEqual({ blocked: "", rolled: true, haptics: 2 });
});

test("warm: ignored with a toolbar sheet or menu open", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    els.diveMenu.classList.add("open");
    const open = { blocked: quickActionBlockedBy(), rolled: handleQuickAction("surprise"), flying: isFlying() };
    els.diveMenu.classList.remove("open");
    return { open, closed: quickActionBlockedBy() };
  });
  expect(r.open).toEqual({ blocked: "dialog", rolled: false, flying: false });
  expect(r.closed).toBe("");
});

test("warm: ignored while the first-run tour is up", async ({ page }) => {
  await load(page);
  await page.evaluate(() => startTour());
  await expect(page.locator("#tour")).toBeVisible();
  const up = await page.evaluate(() => ({ blocked: quickActionBlockedBy(), rolled: handleQuickAction("surprise"), flying: isFlying() }));
  expect(up).toEqual({ blocked: "tour", rolled: false, flying: false });
  await page.evaluate(() => endTour());
  expect(await page.evaluate(() => handleQuickAction("surprise"))).toBe(true);
});

test("the website's bridge does nothing: no pending action, no listener, the opening flight runs", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(async () => {
    let opening = 0;
    const pending = await Platform.quickActions.takePending();
    const registered = Platform.quickActions.onQuickAction(() => {});
    const rolled = await startQuickActions(() => { opening++; }, 0);
    await new Promise((r) => setTimeout(r, 300));
    return { pending, registered: registered === undefined, rolled, opening, flying: isFlying(), native: Platform.isNative };
  });
  expect(r).toEqual({ pending: null, registered: true, rolled: false, opening: 1, flying: false, native: false });
});
