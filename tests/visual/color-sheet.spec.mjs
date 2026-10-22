// The Color sheet (behind the styles flag, see stylesEnabled in app.js): the
// existing color button opens it on the fractals the styles can color, with
// a Looks tab and a Custom tab. These checks cover the flag, the controls
// and their accessibility, that opening it never resizes the canvas, and
// baselines for both tabs. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global colorStyle, setColorStyle, COLORMAPS, colormapIndex */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";

let pageErrors = [];

async function load(page, { flag }) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((on) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      if (on) localStorage.setItem("fractalAtlas.styles", "1"); else localStorage.removeItem("fractalAtlas.styles");
    } catch { /* storage blocked */ }
  }, flag);
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await settle(page);
}

async function settle(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 100 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const place = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;
const imagesLoaded = (page) => page.waitForFunction(() => [...document.querySelectorAll("#colorSheet img")].every((i) => i.complete && i.naturalWidth > 0));

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test.describe("with the flag off", () => {
  test("the color button opens the plain palette list", async ({ page }) => {
    await load(page, { flag: false });
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colormapMenu")).toHaveClass(/open/);
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
  });
});

test.describe("with the flag on", () => {
  test.beforeEach(async ({ page }) => { await load(page, { flag: true }); });

  test("the color button opens the sheet on Looks, with the current Look checked", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    await expect(page.locator("#colormapMenu")).not.toHaveClass(/open/);
    await expect(page.locator("#colorSheet")).toHaveAttribute("role", "dialog");
    await expect(page.locator('#colorSheet [role="tab"]')).toHaveText(["Looks", "Custom"]);
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Looks");
    await expect(page.locator('#colorSheet [role="radiogroup"][aria-label="Looks"] [role="radio"]')).toHaveCount(8);
    // The default (Smooth on Inferno) is the Inferno Look.
    await expect(page.locator('#colorSheet [role="radio"][aria-checked="true"]')).toHaveText("Inferno");
  });

  test("picking a Look sets its style and its palette, and the color button shows it", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [data-key="look-orbit-trap"]').click();
    const r = await page.evaluate(() => ({ style: colorStyle.style, palette: COLORMAPS[colormapIndex].name }));
    expect(r).toEqual({ style: "point", palette: "Twilight" });
    await expect(page.locator("#colormapBtn")).toHaveAttribute("aria-label", "Choose colormap (Twilight)");
    await expect(page.locator('#colorSheet [role="radio"][aria-checked="true"]')).toHaveText("Orbit trap");
    await page.locator('#colorSheet [data-key="look-edge-glow"]').click();
    expect(await page.evaluate(() => ({ style: colorStyle.style, palette: COLORMAPS[colormapIndex].name }))).toEqual({ style: "glow", palette: "Inferno" });
  });

  test("touching a control makes it Custom, and the sheet opens on Custom after that", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await page.locator('#colorSheet input[aria-label="Color shift"]').fill("0.3");
    expect(await page.evaluate(() => colorStyle.offset)).toBeCloseTo(0.3, 5);
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    await expect(page.locator('#colorSheet [role="radio"][aria-checked="true"]')).toHaveText("Custom");
    // Close and reopen: lands on Custom, because the settings match no Look.
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await page.locator("#colormapBtn").click();
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Custom");
  });

  test("Custom has the style, palette, bands and shift controls with names", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await expect(page.locator('#colorSheet [aria-label="Style"] [role="radio"]')).toHaveText(["Smooth", "Bands", "Glow", "Stripes", "Point", "Cross"]);
    await expect(page.locator('#colorSheet [aria-label="Palette"] [role="radio"]')).toHaveCount(await page.evaluate(() => COLORMAPS.length));
    await page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Stripes" }).click();
    expect(await page.evaluate(() => colorStyle.style)).toBe("stripes");
    await page.locator('#colorSheet [aria-label="Palette"] [role="radio"]', { hasText: "Glacier" }).click();
    expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Glacier");
    // Bands is a log slider: its middle is exactly 1x (today's coloring), and it snaps there.
    const bands = page.locator('#colorSheet input[aria-label="Color bands"]');
    await bands.fill("1");
    expect(await page.evaluate(() => colorStyle.density)).toBeCloseTo(2, 5);
    await expect(bands).toHaveAttribute("aria-valuetext", "2×");
    // (set directly: fill() rejects a value that isn't on the slider's step)
    await bands.evaluate((el) => { el.value = "0"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(await page.evaluate(() => colorStyle.density)).toBe(1);
    const shift = page.locator('#colorSheet input[aria-label="Color shift"]');
    await shift.fill("0.5");
    await expect(shift).toHaveAttribute("aria-valuetext", "50%");
  });

  test("at depth the orbit traps are greyed out, with the reason", async ({ page }) => {
    await page.evaluate(`${place("Seahorse Valley")}`);
    await settle(page);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const point = page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Point" });
    await expect(point).toBeDisabled();
    await expect(point).toHaveAttribute("aria-describedby", "colorSheetNote");
    await expect(page.locator("#colorSheetNote")).toContainText("need a shallower view. Zoom out past about 1,000× to use them.");
    await expect(page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Glow" })).toBeEnabled();
    // The Looks tab ghosts the trap Looks and ignores a tap on one.
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    const trap = page.locator('#colorSheet [data-key="look-orbit-trap"]');
    await expect(trap).toHaveAttribute("aria-disabled", "true");
    await trap.click({ force: true }); // aria-disabled, so Playwright won't click it unforced
    expect(await page.evaluate(() => colorStyle.style)).toBe("smooth");
  });

  test("Phoenix offers only Smooth and Bands", async ({ page }) => {
    await page.evaluate(() => window["__vt"].fractal("Phoenix"));
    await settle(page);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const states = await page.locator('#colorSheet [aria-label="Style"] [role="radio"]').evaluateAll((els) => els.map((e) => !e.disabled));
    expect(states).toEqual([true, true, false, false, false, false]);
    await expect(page.locator("#colorSheetNote")).toContainText("aren't available for Phoenix.");
  });

  test("Newton, Carpet, Gasket and Apollonian keep the plain palette list", async ({ page }) => {
    for (const f of ["Newton z³", "Carpet", "Gasket", "Apollonian"]) {
      await page.evaluate((n) => window["__vt"].fractal(n), f);
      await settle(page);
      await page.locator("#colormapBtn").click();
      await expect(page.locator("#colormapMenu"), f).toHaveClass(/open/);
      await expect(page.locator("#colorSheet"), f).not.toHaveClass(/open/);
      await page.locator("#colormapBtn").click();
    }
  });

  test("opening and closing never resizes the canvas, and Escape and an outside tap close it", async ({ page }) => {
    const rect = () => page.evaluate(() => { const r = document.getElementById("mainCanvas").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const before = await rect();
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    expect(await rect()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    await page.mouse.click(5, 5); // on the canvas, away from the sheet
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    expect(await rect()).toEqual(before);
    // The fractal picker closes it too.
    await page.locator("#colormapBtn").click();
    await page.locator(".fractalMenuBtn:visible").first().click();
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await expect(page.locator("#fractalTypeRow")).toHaveClass(/open/);
  });

  test("the sheet stays inside the screen at the largest text size", async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
    await page.locator("#colormapBtn").click();
    for (const tab of ["Looks", "Custom"]) {
      await page.locator('#colorSheet [role="tab"]', { hasText: tab }).click();
      const r = await page.evaluate(() => {
        const s = document.getElementById("colorSheet"), b = s.getBoundingClientRect();
        return { top: b.top, left: b.left, right: b.right, vw: window.innerWidth, noSideScroll: s.scrollWidth <= s.clientWidth + 1 };
      });
      expect(r.top, `${tab}: top edge on screen`).toBeGreaterThanOrEqual(0);
      expect(r.left, `${tab}: left edge`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${tab}: right edge`).toBeLessThanOrEqual(r.vw);
      expect(r.noSideScroll, `${tab}: no sideways scroll`).toBe(true);
    }
  });

  test("Looks tab", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await imagesLoaded(page);
    await expect(page.locator("#colorSheet")).toHaveScreenshot("color-sheet-looks.png");
  });

  test("Custom tab", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); setColorStyle({ style: "glow", density: 1.5, offset: 0.25 }); });
    await settle(page);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await expect(page.locator("#colorSheet")).toHaveScreenshot("color-sheet-custom.png");
  });
});
