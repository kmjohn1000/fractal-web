// The toolbar fade (controls-fade.js): the toolbar fades when the screen is left alone and wakes on
// touch, pointer, key or focus, without pressing what is under the waking touch and without
// swallowing canvas gestures. Plain behavior checks, no baselines; the fade is off under automation, so
// each test turns it on with a 300 ms delay. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global setControlsFade, controlsFaded, mainState, els */

const DELAY = 300;
let pageErrors = [];

async function load(page, { dismissed = true } = {}) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((d) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      if (d) localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  }, dismissed);
  await page.goto("index.html");
  await page.waitForFunction(() => window["__faHooks"] > 0, null, { timeout: 90_000 });
}

const bar = (page) => page.locator("#controls");
const fadeOn = (page, delay = DELAY) => page.evaluate((ms) => setControlsFade({ enabled: true, delayMs: ms }), delay);
const isFaded = (page) => page.evaluate(() => controlsFaded());
const waitFaded = (page) => expect.poll(() => isFaded(page), { timeout: 5000 }).toBe(true);
async function center(loc) {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test("off by default under automation, then fades after the idle delay", async ({ page }) => {
  await load(page);
  await page.waitForTimeout(DELAY * 3);
  expect(await isFaded(page)).toBe(false);
  await fadeOn(page);
  await waitFaded(page);
  await expect(bar(page)).toHaveCSS("opacity", "0", { timeout: 3000 });
  expect(pageErrors).toEqual([]);
});

// Real touches: with a mouse, the move to the button already wakes the toolbar (desktop behavior).
test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("a tap on the faded toolbar wakes it and does not press the button under it", async ({ page }) => {
    await load(page);
    await fadeOn(page, 1500); // long enough that it doesn't fade again while the test looks
    await waitFaded(page);
    const { x, y } = await center(page.locator("#boxZoomBtn"));
    await page.touchscreen.tap(x, y);
    expect(await isFaded(page)).toBe(false);
    await page.waitForTimeout(150);
    await expect(page.locator("#boxZoomBtn")).not.toHaveClass(/\bactive\b/);
    await expect(bar(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
    await expect(bar(page)).not.toHaveClass(/\binert\b/, { timeout: 3000 });
    const again = await center(page.locator("#boxZoomBtn"));
    await page.touchscreen.tap(again.x, again.y);
    await expect(page.locator("#boxZoomBtn")).toHaveClass(/\bactive\b/);
    expect(pageErrors).toEqual([]);
  });

  test("a tap on the faded slider wakes the toolbar and does not move the slider", async ({ page }) => {
    await load(page);
    await fadeOn(page);
    await waitFaded(page);
    const before = await page.locator("#iterSlider").inputValue();
    const b = await page.locator("#iterSlider").boundingBox();
    await page.touchscreen.tap(b.x + b.width - 4, b.y + b.height / 2);
    expect(await page.locator("#iterSlider").inputValue()).toBe(before);
    expect(await isFaded(page)).toBe(false);
  });
});

test("a mouse move wakes the toolbar on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "no fine pointer on the phone setups");
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  await page.mouse.move(5, 5);
  await page.mouse.move(20, 20);
  expect(await isFaded(page)).toBe(false);
});

test("a drag on the picture still pans while it wakes the toolbar", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy }));
  const c = await center(page.locator("#mainCanvas"));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 90, c.y + 60, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy }));
  expect(after.cx !== before.cx || after.cy !== before.cy).toBe(true);
  expect(await isFaded(page)).toBe(false);
});

test("it does not fade while the Color sheet is open, and fades after it closes", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheet")).toHaveClass(/\bopen\b/);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
  // Closed by a pointer (the same button again), not Escape: Escape hands focus back to the button as
  // keyboard focus, which rightly keeps the toolbar shown.
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheet")).not.toHaveClass(/\bopen\b/);
  await waitFaded(page);
});

test("it does not fade while the Share menu is open", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await page.locator("#shareBtn").click();
  await expect(page.locator("#shareMenu")).toHaveClass(/\bopen\b/);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
});

test("it does not fade while a slider is held", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  const b = await page.locator("#iterSlider").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
  await page.mouse.up();
  await waitFaded(page);
});

test("it does not fade while the welcome card shows", async ({ page }) => {
  await load(page, { dismissed: false });
  await expect(page.locator("#welcome")).not.toHaveClass(/\bhidden\b/);
  await fadeOn(page);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
  await page.locator("#welcomeClose").click();
  await waitFaded(page);
});

test("keyboard focus in the toolbar keeps it shown, and every button stays reachable while faded", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  // Faded controls are still in the accessibility tree and the tab order.
  await expect(page.locator("#boxZoomBtn")).toHaveAttribute("aria-label", "Box zoom");
  await expect(bar(page)).not.toHaveCSS("visibility", "hidden");
  await expect(bar(page)).not.toHaveCSS("display", "none");
  // A key press first (keyboard modality, and it wakes the toolbar), then focus lands in the toolbar.
  await page.keyboard.press("Shift");
  await waitFaded(page);
  await page.locator("#boxZoomBtn").focus();
  expect(await page.evaluate(() => !!document.activeElement?.closest("#controls"))).toBe(true);
  expect(await isFaded(page)).toBe(false);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
});

test("a key press wakes the toolbar", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  await page.keyboard.press("Shift");
  expect(await isFaded(page)).toBe(false);
});

test("reduced motion hides the toolbar with no transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  await expect(bar(page)).toHaveCSS("transition-duration", "0s");
  expect(await bar(page).evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
});

test("with motion allowed the fade takes about half a second", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await load(page);
  await expect(bar(page)).toHaveCSS("transition-duration", "0.5s");
});

test("the other modes' control rows fade with the same toolbar", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { els.fractalControls.classList.add("hidden"); els.kochControls.classList.remove("hidden"); });
  await fadeOn(page);
  await waitFaded(page);
  await expect(page.locator("#kochControls")).toBeVisible(); // still laid out, only transparent
  await expect(bar(page)).toHaveCSS("opacity", "0", { timeout: 3000 });
});
