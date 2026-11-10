// A share link this version cannot read (share.js shareHashNeedsNewer, showLinkNotice): a link from a newer version of
// the app (a format number above 1, or a well-formed link naming a fractal or mode that is not here) opens the default
// view and says the link needs a newer version; a damaged link or a good one says nothing. Plain behavior checks, no
// screenshots. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global mainState, currentName */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

let pageErrors = [];

async function open(page, hash) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  });
  await page.goto("index.html" + hash);
  await page.addScriptTag({ path: DRIVER });
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
}

const notice = (page) => page.locator("#linkNotice");

test("a link naming a fractal this version does not have says it needs a newer version", async ({ page }) => {
  await open(page, "#v=1&m=fractal&f=Future+Fractal&x=0.1&y=0.2&s=0.5&r=0&i=300");
  await expect(notice(page)).toHaveClass(/shown/);
  await expect(notice(page)).toContainText("needs a newer version");
  // The default view, and the hash is gone so a reload does not repeat it.
  expect(await page.evaluate(() => currentName)).toBe("Mandelbrot");
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(pageErrors).toEqual([]);
});

test("a link with a newer format number says so too", async ({ page }) => {
  await open(page, "#v=2&m=fractal&f=Mandelbrot&x=0&y=0&s=1&r=0&i=300");
  await expect(notice(page)).toContainText("needs a newer version");
});

test("a link naming a mode this version does not have says so", async ({ page }) => {
  await open(page, "#v=1&m=futuremode&x=0&y=0&s=1&r=0");
  await expect(notice(page)).toContainText("needs a newer version");
});

test("tapping the notice dismisses it", async ({ page }) => {
  await open(page, "#v=1&m=fractal&f=Future+Fractal&x=0&y=0&s=1&r=0&i=300");
  await expect(notice(page)).toHaveClass(/shown/);
  await notice(page).click();
  await expect(notice(page)).not.toHaveClass(/shown/);
});

test("a damaged link, a plain page and a good link say nothing", async ({ page }) => {
  // A known fractal with a view field that is not a number: damaged, not newer.
  await open(page, "#v=1&m=fractal&f=Mandelbrot&x=abc&y=0&s=1&r=0&i=300");
  await expect(notice(page)).toHaveCount(0);
});

test("a good link opens its view with no notice", async ({ page }) => {
  await open(page, "#v=1&m=fractal&f=Mandelbrot&x=-0.75&y=0&s=2.7&r=0&i=300");
  await expect(notice(page)).toHaveCount(0);
  expect(await page.evaluate(() => mainState.cx)).toBe(-0.75);
});

test("no hash at all says nothing", async ({ page }) => {
  await open(page, "");
  await expect(notice(page)).toHaveCount(0);
});
