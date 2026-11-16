// The app's first-run tour (first-run-tour.js): coach marks one at a time that block nothing (a tap on
// the bubble, the gesture itself or the ringed control goes on), Skip on each, shown once. The tour is the iOS app's only, so on the web build (what Playwright loads)
// it never starts by itself; each test starts it through the test hook (startTour). Plain behavior
// checks, no baselines. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global startTour, endTour, mainState, tourSteps, maybeStartTour, Platform, TOUR_STEPS,
   TOUR_DELAY_MS, setControlsFade, controlsFaded, tourCheckGesture */

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
// A tap on the bubble, clear of its buttons (only the bubble takes taps; the rest reaches the app).
const tapBubble = (page) => page.locator("#tourBubble").click({ position: { x: 8, y: 8 } });

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
  await expect(page.locator("#tour")).toHaveAttribute("aria-modal", "false");

  // Step 1 floats over the picture: no ring, and the bubble has focus for VoiceOver.
  await expect(text(page)).toContainText("Pinch");
  await expect(page.locator("#tourCount")).toHaveText(`1 of ${n}`);
  await expect(page.locator("#tourRing")).toBeHidden();
  await expect(page.locator("#tourBubble")).toBeFocused();

  // The tour blocks nothing: a drag on the picture moves the view, and once it settles the tour goes on.
  const cx = await page.evaluate(() => mainState.cx);
  await page.mouse.move(60, 120);
  await page.mouse.down();
  await page.mouse.move(140, 160, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => mainState.cx)).not.toBe(cx);
  await expect(text(page)).toContainText("Twist");
  // A twist step waits for the picture to turn, not just to move.
  await page.evaluate(() => { mainState.cx += 1e-3; tourCheckGesture(); });
  await page.waitForTimeout(800);
  await expect(text(page)).toContainText("Twist");
  await page.evaluate(() => { mainState.rotation = (mainState.rotation || 0) + 0.3; tourCheckGesture(); });

  // The die: the ring sits round it and the bubble above it.
  await expect(text(page)).toContainText("die");
  const ring = await page.locator("#tourRing").boundingBox();
  const die = await page.locator("#teleportBtn").boundingBox();
  expect(ring.x).toBeLessThanOrEqual(die.x);
  expect(ring.x + ring.width).toBeGreaterThanOrEqual(die.x + die.width);
  expect(ring.y).toBeLessThanOrEqual(die.y);
  const bubble = await page.locator("#tourBubble").boundingBox();
  expect(bubble.y + bubble.height).toBeLessThan(die.y);
  await expect(page.locator("#tourBubble")).toHaveClass(/above/);

  // A tap on the bubble is Next.
  await tapBubble(page);
  await expect(text(page)).toContainText("Colors");
  // A tap on the ringed control does its job (the sheet opens) and the tour waits out of sight until
  // the sheet closes, then shows the next step.
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheet")).toHaveClass(/open/);
  await expect(page.locator("#tourBubble")).toBeHidden();
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
  await expect(page.locator("#tourBubble")).toBeVisible();
  await expect(text(page)).toContainText("Places");
  await expect(page.locator("#tourBubble")).toBeFocused();

  await tapBubble(page);
  await expect(text(page)).toContainText("share a link");
  await expect(page.locator("#tourNext")).toHaveText("Next");

  // The last step floats over the picture again (the fading controls), says Done and has no Skip; it
  // ends the tour and remembers it.
  await tapBubble(page);
  await expect(text(page)).toContainText("Touch anywhere to bring them back");
  await expect(page.locator("#tourCount")).toHaveText(`${n} of ${n}`);
  await expect(page.locator("#tourRing")).toBeHidden();
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
  await tapBubble(page);
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

test("only its own flag stops it: an existing user's stored state does not", async ({ page }) => {
  await load(page);
  // Someone who used the app on earlier days (the rating prompt's record) still sees the tour once.
  await page.evaluate(() => localStorage.setItem("fractalAtlas.review", JSON.stringify({ days: ["2026-11-02", "2026-11-10"], askedOn: null })));
  await page.evaluate(() => startTour());
  await expect(tour(page)).toBeVisible();
  await page.locator("#tourSkip").click();
  expect(await tourDone(page)).toBe("1");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("each bubble stays on screen, and follows a rotation", async ({ page }) => {
    await load(page);
    await page.evaluate(() => startTour());
    const n = await page.evaluate(() => tourSteps.length);
    let W = 390, H = 844;
    for (let i = 0; i < n; i++) {
      const b = await page.locator("#tourBubble").boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(W);
      expect(b.y + b.height).toBeLessThanOrEqual(H);
      if (i === n - 1) break;
      if (i === n - 2) { // the Share step (the last one has no ring): rotate, the ring follows
        [W, H] = [844, 390];
        await page.setViewportSize({ width: W, height: H });
        await page.waitForTimeout(300);
        const share = await page.locator(".shareBtn").filter({ visible: true }).first().boundingBox();
        const ring = await page.locator("#tourRing").boundingBox();
        expect(Math.abs(ring.x + ring.width / 2 - (share.x + share.width / 2))).toBeLessThan(2);
      }
      await page.locator("#tourBubble").tap({ position: { x: 8, y: 8 } });
      await expect(page.locator("#tourCount")).toHaveText(new RegExp(`^${i + 2} of `));
    }
  });
});
