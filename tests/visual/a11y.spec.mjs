// Screen-reader access (canvas-a11y.js, toolbar-a11y.js, #runAnnounce, #errorBanner): the main canvas is an
// adjustable element whose label names the place and whose value text says how deep, a swipe (the ArrowUp /
// ArrowDown keydown WebKit sends for VoiceOver's increment / decrement) zooms it, Surprise me says where it
// landed, the error banner is an alert, and the Color and Places sheets take focus and give it back.
// Plain behavior checks, no screenshot baselines.
import { test, expect } from "@playwright/test";

/* global TELEPORT_DESTINATIONS, mainState, flyToPlace, LABEL_DELAY_MS, setMode */

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
  await page.waitForFunction(() => typeof flyToPlace === "function" && typeof LABEL_DELAY_MS === "number");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const canvas = (page) => page.locator("#mainCanvas");
const flown = (page, i) => page.waitForFunction((n) => mainState.scale === TELEPORT_DESTINATIONS[n].scale, i, { timeout: 30_000 });

test("the main canvas is a slider named for the view, and the label follows a place jump and a zoom", async ({ page }) => {
  await expect(canvas(page)).toHaveAttribute("role", "slider");
  await expect(canvas(page)).toHaveAttribute("aria-label", /Mandelbrot/);
  await expect(canvas(page)).toHaveAttribute("aria-valuetext", /whole shape/);
  const i = await page.evaluate(() => TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === "Mandelbrot" && d.label === "Elephant Valley"));
  await page.evaluate((n) => flyToPlace(n), i);
  await flown(page, i);
  await expect(canvas(page)).toHaveAttribute("aria-label", /^Elephant Valley, .*Mandelbrot/);
  const deep = await canvas(page).getAttribute("aria-valuetext");
  await expect(canvas(page)).toHaveAttribute("aria-valuetext", /deeper/);
  expect(deep).not.toContain("×");
  // A zoom moves the view off the place: the name goes, the depth changes.
  await page.evaluate(() => { mainState.scale *= 0.5; window.requestRender(); });
  await expect(canvas(page)).not.toHaveAttribute("aria-label", /Elephant Valley/);
  await expect.poll(() => canvas(page).getAttribute("aria-valuetext")).not.toBe(deep);
});

test("the label is not written on every frame: a burst of renders writes it once, after the view is still", async ({ page }) => {
  const writes = await page.evaluate(async () => {
    const c = document.getElementById("mainCanvas");
    let n = 0;
    new MutationObserver((m) => { n += m.filter((r) => r.attributeName === "aria-valuenow").length; }).observe(c, { attributes: true });
    for (let k = 0; k < 20; k++) { mainState.scale *= 0.97; window.renderAll(); }
    await new Promise((r) => setTimeout(r, 600));
    return n;
  });
  expect(writes).toBeGreaterThan(0);
  expect(writes).toBeLessThanOrEqual(2);
});

test("an increment (ArrowUp on the canvas) zooms in, a decrement zooms out, and the value text says so", async ({ page }) => {
  const s0 = await page.evaluate(() => mainState.scale);
  const t0 = await canvas(page).getAttribute("aria-valuetext");
  await canvas(page).dispatchEvent("keydown", { key: "ArrowUp" });
  const s1 = await page.evaluate(() => mainState.scale);
  expect(s1).toBeCloseTo(s0 / 2, 10);
  const t1 = await canvas(page).getAttribute("aria-valuetext");
  expect(t1).not.toBe(t0);
  expect(t1).toMatch(/deeper/);
  await canvas(page).dispatchEvent("keydown", { key: "ArrowDown" });
  expect(await page.evaluate(() => mainState.scale)).toBeCloseTo(s0, 10);
  await expect(canvas(page)).toHaveAttribute("aria-valuetext", /whole shape/);
});

test("an arrow key aimed at the page (not the canvas) still pans, as before", async ({ page }) => {
  const cx0 = await page.evaluate(() => mainState.cx);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => mainState.cx)).not.toBe(cx0);
});

test("a pattern mode's canvas is an image with a label, and arrows aimed at it do not zoom", async ({ page }) => {
  await page.evaluate(() => setMode("koch"));
  await expect(page.locator("#kochCanvas")).toHaveAttribute("role", "img");
  await expect(page.locator("#kochCanvas")).toHaveAttribute("aria-label", /Koch/i);
  const h0 = await page.evaluate(() => window.kochView.view.halfHeight);
  await page.locator("#kochCanvas").dispatchEvent("keydown", { key: "ArrowUp" });
  expect(await page.evaluate(() => window.kochView.view.halfHeight)).toBe(h0);
});

test("Surprise me says where it landed in the polite live region, which empties again", async ({ page }) => {
  await page.locator("#teleportBtn").click();
  const region = page.locator("#runAnnounce");
  await expect(region).toHaveText(/\S+, .+/, { timeout: 30_000 });
  const said = await region.textContent();
  const known = await page.evaluate((s) => TELEPORT_DESTINATIONS.some((d) => s.startsWith(`${d.label}, `)), said);
  expect(known, `"${said}" starts with a place name`).toBe(true);
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toHaveText("", { timeout: 8000 });
});

test("the error banner (where the graphics-turned-off message goes) is an alert and shows its text", async ({ page }) => {
  const banner = page.locator("#errorBanner");
  await expect(banner).toHaveAttribute("role", "alert");
  await page.evaluate(() => window.reportError("The browser has turned graphics off for this page."));
  await expect(banner).toBeVisible();
  await expect(banner).toHaveText(/turned graphics off/);
});

test("the Color sheet takes focus when it opens and hands it back to the Color button when it closes; Escape closes it", async ({ page }) => {
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheet")).toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => document.getElementById("colorSheet").contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => document.activeElement.id)).toBe("colormapBtn");
});

test("the Places sheet does the same", async ({ page }) => {
  const opener = page.locator(".fractalMenuBtn:visible").first();
  await opener.click();
  await page.locator("[data-opens-places]:visible").first().click();
  await expect(page.locator("#placesSheet")).toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => document.getElementById("placesSheet").contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
  await expect.poll(() => page.evaluate(() => document.getElementById("placesSheet").contains(document.activeElement))).toBe(false);
});
