// The accent color (accent.js): selected states take the hue of the current palette's bright end, kept
// readable on the dark toolbar, and fall back to the original blue when the palette has no hue. Plain
// behavior checks, no baselines.
import { test, expect } from "@playwright/test";

/* global COLORMAPS, SOLID_COLORS, accentFromStops, accentFromRgb, contrastRatio, ACCENT_BACKDROP,
   pickColormap, syncAccent, rgbToHsl, setMode, vectorColors */

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

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("every palette's accent is readable on the toolbar and its fill holds white text", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => COLORMAPS.map((c) => {
    const a = accentFromStops(c.stops);
    if (!a) return { name: c.name, fallback: true };
    return {
      name: c.name,
      onToolbar: contrastRatio(a.accent, ACCENT_BACKDROP),
      whiteOnFill: contrastRatio(a.fill, [255, 255, 255]),
    };
  }));
  for (const c of r) {
    if (c.fallback) continue;
    expect(c.onToolbar, `${c.name} accent on the toolbar`).toBeGreaterThanOrEqual(4.5);
    expect(c.whiteOnFill, `${c.name} white on the fill`).toBeGreaterThanOrEqual(4.5);
  }
  expect(r.filter((c) => !c.fallback).length).toBeGreaterThan(r.length / 2);
});

test("the accent follows the palette: different palettes give different hues, set on :root", async ({ page }) => {
  await load(page);
  const hues = await page.evaluate(() => {
    const out = {};
    for (const name of ["Inferno", "Glacier", "Viridis", "Fire"]) {
      pickColormap(COLORMAPS.findIndex((c) => c.name === name));
      out[name] = {
        css: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
        hue: Math.round(rgbToHsl(accentFromStops(COLORMAPS.find((c) => c.name === name).stops).accent)[0]),
      };
    }
    return out;
  });
  expect(hues.Glacier.css).toMatch(/^rgb\(/);
  expect(new Set(Object.values(hues).map((h) => h.css)).size).toBeGreaterThan(2);
  // Glacier is teal, Fire is orange.
  expect(hues.Glacier.hue).toBeGreaterThan(150);
  expect(hues.Glacier.hue).toBeLessThan(260);
  expect(hues.Fire.hue).toBeLessThan(60);
});

test("a colorless source keeps the original blue", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const grey = accentFromStops([[0, 10, 10, 10], [1, 240, 240, 240]]);
    const white = accentFromRgb([255, 255, 255]);
    const root = document.documentElement.style;
    root.setProperty("--accent", "rgb(1, 2, 3)");
    syncAccent(); // a fractal on its palette: sets the variable again
    return { grey, white, hasProp: root.getPropertyValue("--accent") !== "" };
  });
  expect(r.grey).toBeNull();
  expect(r.white).toBeNull();
  expect(r.hasProp).toBe(true);
  // The stylesheet's own fallback is the original blue.
  const base = await page.evaluate(() => {
    document.documentElement.style.removeProperty("--accent");
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  });
  expect(base).toBe("#6cf");
});

test("a pattern shape's solid color sets the accent; going back to a fractal restores the palette's", async ({ page }) => {
  await load(page);
  const r = await page.evaluate(() => {
    const read = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const fractal = read();
    vectorColors.koch = SOLID_COLORS.findIndex((c) => c.name === "Green");
    setMode("koch");
    const koch = read();
    const green = accentFromRgb(SOLID_COLORS[vectorColors.koch].rgb);
    setMode("fractal");
    return { fractal, koch, greenCss: `rgb(${green.accent.join(", ")})`, back: read() };
  });
  expect(r.fractal).toMatch(/^rgb\(/);
  expect(r.koch).toBe(r.greenCss);
  expect(r.koch).not.toBe(r.fractal);
  expect(r.back).toBe(r.fractal);
});
