// The Multibrot's power slider (2 to 6, shown only on Multibrot³): the slider and the info card follow the exponent, a value
// near a whole number snaps, the view re-fits while untouched, share links carry and restore the exponent (pw), powers
// other than 2 and 3 cannot zoom deeper than their float32 floor, other fractals have no slider and the toolbar keeps its
// height. Plain behavior checks, no screenshots. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global mainState, juliaState, buildShareHash */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

let pageErrors = [];

async function open(page, hash = "") {
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

const settle = (page) => page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
const openMultibrot = async (page) => { await open(page); await page.evaluate(() => window["__vt"].fractal("Multibrot³", 0)); await settle(page); };
const setPower = async (page, v) => {
  await page.evaluate((x) => { const s = document.getElementById("powerSlider"); s.value = x; s.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  await settle(page);
};
const toolbarTop = (page) => page.evaluate(() => document.getElementById("fractalControls").getBoundingClientRect().top);

test("the slider shows on Multibrot³ only, and the toolbar keeps its height", async ({ page }) => {
  await open(page);
  const heightMandelbrot = await toolbarTop(page);
  await expect(page.locator("#powerField")).toBeHidden();
  await page.evaluate(() => window["__vt"].fractal("Multibrot³", 0));
  await settle(page);
  await expect(page.locator("#powerField")).toBeVisible();
  expect(await toolbarTop(page)).toBe(heightMandelbrot);
  await page.evaluate(() => window["__vt"].fractal("Mandelbrot", 0));
  await settle(page);
  await expect(page.locator("#powerField")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("moving the slider sets the exponent in the state and the readout, and a value near a whole number snaps", async ({ page }) => {
  await openMultibrot(page);
  expect(await page.evaluate(() => mainState.power)).toBe(3);
  await setPower(page, 4.5);
  expect(await page.evaluate(() => mainState.power)).toBe(4.5);
  await expect(page.locator("#powerVal")).toHaveText("4.50");
  await setPower(page, 5.03);
  expect(await page.evaluate(() => mainState.power)).toBe(5);
  await expect(page.locator("#powerVal")).toHaveText("5");
  expect(pageErrors).toEqual([]);
});

test("an untouched view re-fits to the exponent; a moved one stays where it is", async ({ page }) => {
  await openMultibrot(page);
  const scale3 = await page.evaluate(() => mainState.scale);
  await setPower(page, 5);
  const scale5 = await page.evaluate(() => mainState.scale);
  expect(scale5).not.toBe(scale3); // the opening view of power 5 is its own
  await page.evaluate(() => { mainState.cx += 0.1; mainState.scale *= 0.5; });
  const moved = await page.evaluate(() => ({ cx: mainState.cx, scale: mainState.scale }));
  await setPower(page, 4);
  expect(await page.evaluate(() => ({ cx: mainState.cx, scale: mainState.scale }))).toEqual(moved);
});

test("the share link carries the exponent only when it is not 3, and restores it", async ({ page }) => {
  await openMultibrot(page);
  expect(await page.evaluate(() => buildShareHash())).not.toContain("pw=");
  await setPower(page, 4.25);
  const hash = await page.evaluate(() => buildShareHash());
  expect(hash).toContain("pw=4.25");
  await open(page, hash);
  expect(await page.evaluate(() => mainState.power)).toBe(4.25);
  await expect(page.locator("#powerSlider")).toHaveValue("4.25");
  // A bad or out-of-range pw is ignored, and a link for another fractal ignores pw altogether.
  await open(page, hash.replace("pw=4.25", "pw=9"));
  expect(await page.evaluate(() => mainState.power)).toBe(3);
  await open(page, "#v=1&m=fractal&f=Mandelbrot&x=-0.75&y=0&s=1.3&r=0&i=300&pw=4");
  expect(await page.evaluate(() => mainState.power)).toBe(2);
  expect(pageErrors).toEqual([]);
});

test("a power other than 2 or 3 stops at its float32 floor, 2 and 3 keep their deep zoom", async ({ page }) => {
  await openMultibrot(page);
  await page.evaluate(() => { mainState.scale = 1e-9; });
  await setPower(page, 2.5);
  expect(await page.evaluate(() => mainState.scale)).toBe(5e-5);
  await page.evaluate(() => { mainState.scale = 1e-9; });
  await setPower(page, 3);
  expect(await page.evaluate(() => mainState.scale)).toBeLessThan(5e-5); // power 3's perturbation path goes deeper
});

test("the Julia pane takes the same power in dual view", async ({ page }) => {
  await openMultibrot(page);
  await setPower(page, 4);
  await page.locator("#dualBtn").click();
  await settle(page);
  expect(await page.evaluate(() => juliaState.power)).toBe(4);
  await setPower(page, 2.5);
  expect(await page.evaluate(() => juliaState.power)).toBe(2.5);
  expect(pageErrors).toEqual([]);
});
