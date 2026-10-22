// On-device diagnostics (diag.js): off unless the page is opened with #diag,
// then a "diag" button opens a report of GL facts, shader link times and
// per-pass timings, and the flag never reaches a share link. Run through
// `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global Diag, buildShareUrl */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

let pageErrors = [];

async function load(page, { hash = "", stored = false } = {}) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((on) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      if (on) localStorage.setItem("fractalAtlas.diag", "1");
    } catch { /* storage blocked */ }
  }, stored);
  await page.goto(`index.html${hash}`);
  await page.addScriptTag({ path: DRIVER });
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
}

const pill = (page) => page.getByRole("button", { name: "diag", exact: true });

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test("off by default: no button, no pass timings", async ({ page }) => {
  await load(page);
  await expect(pill(page)).toHaveCount(0);
  expect(await page.evaluate(() => Diag.enabled)).toBe(false);
});

test("#diag shows the button and a report with GL facts, shader links and timed passes", async ({ page }) => {
  await load(page, { hash: "#diag" });
  await expect(pill(page)).toBeVisible();
  await pill(page).click();
  const report = page.locator("pre");
  // Passes are timed by a fence polled after submit, so give them a moment to land.
  await expect(report).toContainText("mainCanvas ESCAPE float32, first pass", { timeout: 15_000 });
  const text = await report.innerText();
  expect(text).toContain("EXT_color_buffer_float");
  expect(text).toContain("KHR_parallel_shader_compile");
  expect(text).toContain("MAX_TEXTURE_SIZE");
  expect(text).toContain("mainCanvas escape-time variant 0:");
  expect(text).toMatch(/WebGPU:/);
  // A timed pass has real numbers, not dashes, on a WebGL2 context.
  const row = text.split("\n").find((l) => l.includes("mainCanvas ESCAPE float32, first pass"));
  expect(row).toMatch(/GPU \d/);
});

test("#diag=0 turns it off again and removes the button", async ({ page }) => {
  await load(page, { hash: "#diag=0", stored: true });
  await expect(pill(page)).toHaveCount(0);
  expect(await page.evaluate(() => Diag.enabled)).toBe(false);
});

test("Turn off removes the button, and share links never carry the flag", async ({ page }) => {
  await load(page, { hash: "#diag" });
  expect(await page.evaluate(() => buildShareUrl())).not.toContain("diag");
  await pill(page).click();
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(pill(page)).toHaveCount(0);
  expect(await page.evaluate(() => Diag.enabled)).toBe(false);
});
