// The chaos-game run's screen-reader live region (#runAnnounce, chaos-run.js): a line is read as it is written and
// the region is emptied ANNOUNCE_CLEAR_MS later, so no stale "Done. 2,000 points, 99% filled." stays in the top
// left corner where VoiceOver can land on it, in the chaos game or in any other fractal (found on a phone, 1.80.3).
// Plain behavior checks, no screenshot baselines.
import { test, expect } from "@playwright/test";

/* global announce, announceRunDone, ANNOUNCE_CLEAR_MS, setMode */

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
  await page.waitForFunction(() => typeof announce === "function" && typeof setMode === "function");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const said = (page) => page.evaluate(() => document.getElementById("runAnnounce").textContent);

test("a line is in the region when it is written, and the region is empty after ANNOUNCE_CLEAR_MS", async ({ page }) => {
  const ms = await page.evaluate(() => ANNOUNCE_CLEAR_MS);
  await page.evaluate(() => announceRunDone({ points: 2000, coverage: 0.99 }));
  expect(await said(page)).toMatch(/^Done\. .+ points, 99% filled\.$/);
  await page.waitForTimeout(ms + 500);
  expect(await said(page), "nothing left to land on").toBe("");
});

test("a later line restarts the clock, so a line is never cut short", async ({ page }) => {
  const ms = await page.evaluate(() => ANNOUNCE_CLEAR_MS);
  await page.evaluate(() => announce("first"));
  await page.waitForTimeout(ms - 1000);
  await page.evaluate(() => announce("second"));
  await page.waitForTimeout(1500); // past the first line's clock, inside the second's
  expect(await said(page)).toBe("second");
  await page.waitForTimeout(ms);
  expect(await said(page)).toBe("");
});

test("the region is empty after a run ends and another fractal is shown", async ({ page }) => {
  const ms = await page.evaluate(() => ANNOUNCE_CLEAR_MS);
  await page.evaluate(() => { setMode("sierpinski"); announceRunDone({ points: 2000, coverage: 0.99 }); setMode("fractal"); });
  await page.waitForTimeout(ms + 500);
  expect(await said(page)).toBe("");
});
