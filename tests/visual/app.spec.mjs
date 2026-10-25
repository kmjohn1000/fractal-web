// Renders every fractal/mode, colormap and Surprise-me place, checks the
// frame and layout, and compares a screenshot against its baseline in
// tests/baselines/<project>/. Run through `npm run test:visual`.
/* global FRACTAL_NAMES, EXTRA_MODES, PICKER_LAYOUT */
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { COLORMAP_NAMES, FRACTALS, MODES, PLACES, slug } from "../cases.mjs";

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

// Transient overlays (rotation compass, crosshair flash, speed bubble) are
// timer-driven, so they'd make screenshots flaky. Added to the page as a
// stylesheet: toHaveScreenshot's own `style` option doesn't take effect.
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";

// A frame counts as blank when one color (quantized to 5 bits per channel)
// covers more than this share of the canvas. Thin line art on black (the
// Vicsek fractal, the arrowhead on a wide screen) is ~98% background, so
// this sits just under a truly blank frame's 100%.
const BLANK_DOMINANT_SHARE = 0.995;

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    // Return visitor who has closed the welcome card: no cold-open flight,
    // no card over the baselines (cold-open.spec.mjs covers both).
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
    // Seeded Math.random (mulberry32): the chaos-game modes (fern.js) plot
    // random points, so without this every run draws a different scatter.
    let seed = 0x9e3779b9;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Capture phase: webglcontextlost is dispatched at the canvas and doesn't bubble.
    window.addEventListener("webglcontextlost", () => { window["__vtContextLost"] = (window["__vtContextLost"] || 0) + 1; }, true);
  });
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await waitSettled(page);
});

async function waitSettled(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 60_000, polling: 100 });
  // Two frames, so the last draw has reached the screen.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

function colorStats(png) {
  const { data, width, height } = PNG.sync.read(png);
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const dominant = Math.max(...counts.values()) / (width * height);
  return { dominant, distinct: counts.size };
}

async function checkFrame(page, testInfo, name) {
  await waitSettled(page);
  const s = await page.evaluate(() => window["__vt"].inspect());

  expect.soft(pageErrors, "uncaught page errors").toEqual([]);
  expect.soft(s.error, "error banner").toBeNull();
  expect.soft(s.contextLost, "WebGL context lost (isContextLost)").toBe(false);
  expect.soft(s.contextLostEvents, "webglcontextlost events").toBe(0);
  expect(s.canvas, "a visible canvas").not.toBeNull();

  // Layout: the canvas is centered horizontally, sits fully above the
  // toolbar, and its drawing buffer has the canvas's own shape (a mismatch
  // draws the fractal stretched or shifted off-center).
  const { canvas: c, controls: t, viewport: v, buffer: b } = s;
  const leftGap = c.x, rightGap = v.w - (c.x + c.w);
  expect.soft(Math.abs(leftGap - rightGap), `canvas off-center: ${leftGap}px left vs ${rightGap}px right`).toBeLessThanOrEqual(1);
  expect.soft(c.y, "canvas top above the viewport").toBeGreaterThanOrEqual(-0.5);
  expect.soft(c.w * c.h, "canvas has no area").toBeGreaterThan(0);
  expect.soft(c.y + c.h, `toolbar overlaps canvas: canvas bottom ${c.y + c.h} > toolbar top ${t.y}`).toBeLessThanOrEqual(t.y + 0.5);
  expect.soft(t.y + t.h, "toolbar runs off the bottom of the viewport").toBeLessThanOrEqual(v.h + 0.5);
  if (c.w > 0 && c.h > 0 && b.w > 0 && b.h > 0) {
    const aspectError = Math.abs(b.w / b.h - c.w / c.h) / (c.w / c.h);
    expect.soft(aspectError, `drawing buffer ${b.w}x${b.h} doesn't match canvas ${c.w}x${c.h}`).toBeLessThan(0.02);
  }

  // Blank render: almost every pixel the same color.
  const shot = await page.screenshot({ clip: { x: c.x, y: c.y, width: c.w, height: c.h } });
  const stats = colorStats(shot);
  testInfo.annotations.push({ type: "colors", description: `dominant ${(stats.dominant * 100).toFixed(1)}%, ${stats.distinct} colors` });
  expect.soft(stats.dominant, `frame is mostly one color (${(stats.dominant * 100).toFixed(1)}%)`).toBeLessThanOrEqual(BLANK_DOMINANT_SHARE);

  await expect(page).toHaveScreenshot(`${name}.png`);
}

test("the suite covers everything the app lists", async ({ page }) => {
  const live = await page.evaluate(() => window["__vt"].counts());
  expect(live).toEqual({ fractals: FRACTALS.length, modes: MODES.length, places: PLACES.length, colormaps: COLORMAP_NAMES.length });
});

test("the picker lists every fractal and mode exactly once, in PICKER_LAYOUT order", async ({ page }) => {
  const { expected, shown } = await page.evaluate(() => ({
    expected: [...FRACTAL_NAMES, ...EXTRA_MODES.map((m) => m.key)].sort(),
    shown: [...document.querySelectorAll("#fractalTypeRow button[data-name], #fractalTypeRow button[data-mode]")]
      .map((b) => b.dataset.name || b.dataset.mode),
  }));
  expect([...shown].sort()).toEqual(expected);
  const layout = await page.evaluate(() => PICKER_LAYOUT.flatMap((s) => s.groups.flatMap((g) => g.keys)));
  expect(shown).toEqual(layout);
});

// The checks themselves: each must fire on a frame that really is broken.
test.describe("self-test", () => {
  test("a blank frame is caught", async ({ page }) => {
    await page.evaluate(() => window["__vt"].blackout());
    await waitSettled(page);
    const c = (await page.evaluate(() => window["__vt"].inspect())).canvas;
    const stats = colorStats(await page.screenshot({ clip: { x: c.x, y: c.y, width: c.w, height: c.h } }));
    expect(stats.dominant).toBeGreaterThan(BLANK_DOMINANT_SHARE);
  });

  test("a lost WebGL context is caught", async ({ page }) => {
    await page.evaluate(() => window["__vt"].loseContext());
    await expect.poll(() => page.evaluate(() => window["__vt"].inspect().contextLostEvents)).toBeGreaterThan(0);
    const s = await page.evaluate(() => window["__vt"].inspect());
    expect(s.contextLost).toBe(true);
    expect(s.error).toContain("WebGL context lost");
  });
});

test.describe("fractal", () => {
  for (const name of FRACTALS) {
    test(name, async ({ page }, testInfo) => {
      await page.evaluate((n) => window["__vt"].fractal(n), name);
      await checkFrame(page, testInfo, `fractal-${slug(name)}`);
    });
  }
  for (const key of MODES) {
    test(key, async ({ page }, testInfo) => {
      await page.evaluate((k) => window["__vt"].mode(k), key);
      await checkFrame(page, testInfo, `mode-${key}`);
    });
  }
});

test.describe("colormap", () => {
  for (const name of COLORMAP_NAMES) {
    test(name, async ({ page }, testInfo) => {
      await page.evaluate((n) => window["__vt"].colormap(n), name);
      await checkFrame(page, testInfo, `colormap-${slug(name)}`);
    });
  }
});

test.describe("place", () => {
  for (const p of PLACES) {
    test(`${p.fractal}: ${p.label}`, async ({ page }, testInfo) => {
      await page.evaluate((i) => window["__vt"].place(i), p.index);
      await checkFrame(page, testInfo, `place-${slug(p.fractal)}-${slug(p.label)}`);
    });
  }
});
