// The app's first-run tour (first-run-tour.js): coach marks one at a time, a tap anywhere for the next,
// Skip on each, shown once. The tour is the iOS app's only, so on the web build (what Playwright loads)
// it never starts by itself; each test starts it through the test hook (startTour). Plain behavior
// checks, no baselines. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global startTour, endTour, mainState, tourSteps, tourIsReturning, maybeStartTour, Platform, TOUR_STEPS,
   TOUR_DELAY_MS, setControlsFade, controlsFaded, REVIEW_KEY */

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

const tour = (page) => page.locator("#tour");
const text = (page) => page.locator("#tourText");
const tourDone = (page) => page.evaluate(() => localStorage.getItem("fractalAtlas.tourDone"));
// A tap on the scrim, clear of the bubble and the toolbar.
const tapScrim = (page) => page.locator("#tour").click({ position: { x: 8, y: 8 } });

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("the website never starts the tour by itself", async ({ page }) => {
  await load(page);
  expect(await page.evaluate(() => Platform.tour.isDue())).toBe(false);
  await page.evaluate(() => maybeStartTour());
  await page.waitForTimeout(await page.evaluate(() => TOUR_DELAY_MS) + 500);
  await expect(tour(page)).toBeHidden();
  expect(await tourDone(page)).toBeNull();
});

test("walks through every step: gestures over the picture, then a ring round each control", async ({ page }) => {
  await load(page);
  await page.evaluate(() => startTour());
  await expect(tour(page)).toBeVisible();
  const n = await page.evaluate(() => tourSteps.length);
  expect(n).toBe(await page.evaluate(() => TOUR_STEPS.length)); // Mandelbrot's toolbar has every control
  await expect(page.locator("#tour")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#tour")).toHaveAttribute("aria-modal", "true");

  // Step 1 floats over the picture: no ring, and the bubble has focus for VoiceOver.
  await expect(text(page)).toContainText("Pinch");
  await expect(page.locator("#tourCount")).toHaveText(`1 of ${n}`);
  await expect(page.locator("#tourRing")).toBeHidden();
  await expect(page.locator("#tourBubble")).toBeFocused();

  await tapScrim(page);
  await expect(text(page)).toContainText("Twist");

  // The die: the ring sits round it and the bubble above it.
  await tapScrim(page);
  await expect(text(page)).toContainText("die");
  const ring = await page.locator("#tourRing").boundingBox();
  const die = await page.locator("#teleportBtn").boundingBox();
  expect(ring.x).toBeLessThanOrEqual(die.x);
  expect(ring.x + ring.width).toBeGreaterThanOrEqual(die.x + die.width);
  expect(ring.y).toBeLessThanOrEqual(die.y);
  const bubble = await page.locator("#tourBubble").boundingBox();
  expect(bubble.y + bubble.height).toBeLessThan(die.y);
  await expect(page.locator("#tourBubble")).toHaveClass(/above/);

  // A tap on the ringed control is Next, not a press of that control.
  await tapScrim(page);
  await expect(text(page)).toContainText("Colors");
  const color = await page.locator("#colormapBtn").boundingBox();
  await page.mouse.click(color.x + color.width / 2, color.y + color.height / 2);
  await expect(text(page)).toContainText("Places");
  await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);

  // The last step says Done and has no Skip; it ends the tour and remembers it.
  await tapScrim(page);
  await expect(text(page)).toContainText("share a link");
  await expect(page.locator("#tourNext")).toHaveText("Done");
  await expect(page.locator("#tourSkip")).toBeHidden();
  expect(await tourDone(page)).toBeNull();
  await page.locator("#tourNext").click();
  await expect(tour(page)).toBeHidden();
  expect(await tourDone(page)).toBe("1");
});

test("Skip and Escape end the tour at once and remember it", async ({ page }) => {
  await load(page);
  await page.evaluate(() => startTour());
  await tapScrim(page);
  await page.locator("#tourSkip").click();
  await expect(tour(page)).toBeHidden();
  expect(await tourDone(page)).toBe("1");

  await page.evaluate(() => { localStorage.removeItem("fractalAtlas.tourDone"); startTour(); });
  await expect(tour(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour(page)).toBeHidden();
  expect(await tourDone(page)).toBe("1");
});

test("keys stay in the tour: Tab cycles Skip and Next, arrows don't move the view", async ({ page }) => {
  await load(page);
  await page.evaluate(() => startTour());
  const cx = await page.evaluate(() => mainState.cx);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => mainState.cx)).toBe(cx);
  await page.keyboard.press("Tab");
  await expect(page.locator("#tourSkip")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#tourNext")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#tourSkip")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#tourNext")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#tourCount")).toHaveText(/^2 of /);
});

test("the toolbar stays shown while the tour is up, and fades after it ends", async ({ page }) => {
  await load(page);
  await page.evaluate(() => setControlsFade({ enabled: true, delayMs: 300 }));
  await page.evaluate(() => startTour());
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => controlsFaded())).toBe(false);
  await page.evaluate(() => endTour());
  await expect.poll(() => page.evaluate(() => controlsFaded()), { timeout: 5000 }).toBe(true);
});

test("someone who opened the app on an earlier day counts as returning", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const out = {};
    localStorage.removeItem(REVIEW_KEY);
    out.none = tourIsReturning("2026-11-14");
    localStorage.setItem(REVIEW_KEY, JSON.stringify({ days: ["2026-11-14"], askedOn: null }));
    out.today = tourIsReturning("2026-11-14");
    localStorage.setItem(REVIEW_KEY, JSON.stringify({ days: ["2026-11-02", "2026-11-14"], askedOn: null }));
    out.earlier = tourIsReturning("2026-11-14");
    return out;
  });
  expect(r).toEqual({ none: false, today: false, earlier: true });
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("each bubble stays on screen, and follows a rotation", async ({ page }) => {
    await load(page);
    await page.evaluate(() => startTour());
    const n = await page.evaluate(() => tourSteps.length);
    for (let i = 0; i < n; i++) {
      const b = await page.locator("#tourBubble").boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(390);
      expect(b.y + b.height).toBeLessThanOrEqual(844);
      if (i === n - 1) {
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(300);
        const share = await page.locator(".shareBtn").filter({ visible: true }).first().boundingBox();
        const ring = await page.locator("#tourRing").boundingBox();
        expect(Math.abs(ring.x + ring.width / 2 - (share.x + share.width / 2))).toBeLessThan(2);
        break;
      }
      await page.locator("#tour").tap({ position: { x: 8, y: 8 } });
      await expect(page.locator("#tourCount")).toHaveText(new RegExp(`^${i + 2} of `));
    }
  });
});
