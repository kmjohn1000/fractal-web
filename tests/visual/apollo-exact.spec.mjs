// The Apollonian gasket from an exact center (fractal-defs.js apolloFrameExact, renderer.js, shaders.js u_apoRescale):
// the chain of inversions that brings a deep view back to O(1) now starts from the view's BigInt center, so a pan or a
// zoom about the cursor works at any depth, down to the 1e-100 floor. Plain behavior checks, no screenshot baselines.
// The centre used for the deep views is Golden Dive's exact point (1/sqrt5, 2/sqrt5), a fixed point of the packing's
// self-similarity: its chain never ends, so the picture has structure at every depth.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global mainState, setCenter, moveCenter, exactCenter, exactValid, exactBitsFor, exactFrac, selectFractal, requestRender, apolloFrame,
   apolloFrameExact, exactRender, TELEPORT_DESTINATIONS, buildShareHash, applyShareLink, fromExact, mainRenderer */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;

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
  await page.addScriptTag({ path: DRIVER });
  await settle(page);
  // Helpers in the page: Golden Dive's exact point at F fraction bits.
  await page.evaluate(() => {
    window.goldenAt = (bits) => {
      const F = BigInt(bits);
      const n = 5n << (2n * F);
      let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
      for (;;) { const y = (x + n / x) >> 1n; if (y >= x) break; x = y; }
      return [x / 5n, (2n * x) / 5n];
    };
    window.showGolden = (scale) => {
      selectFractal("Apollonian", { fresh: true });
      const bits = exactBitsFor(scale);
      const [ex, ey] = window.goldenAt(bits);
      setCenter(mainState, fromExact(ex, bits), fromExact(ey, bits), ex, ey, bits);
      mainState.scale = scale;
      mainState.rotation = 0;
      requestRender();
    };
  });
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

async function settle(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 120_000, polling: 50 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
async function canvasPixels(page) {
  const url = await page.evaluate(() => mainRenderer.canvas.toDataURL("image/png"));
  return PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));
}
function compareShifted(a, b, n) {
  const w = a.width, h = a.height;
  let sum = 0, over16 = 0, count = 0;
  for (let y = 0; y < h - n; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, j = ((y + n) * w + x) * 4;
      const e = Math.max(Math.abs(a.data[i] - b.data[j]), Math.abs(a.data[i + 1] - b.data[j + 1]), Math.abs(a.data[i + 2] - b.data[j + 2]));
      sum += e; if (e > 16) over16++; count++;
    }
  }
  return { mean: sum / count, over16: over16 / count };
}
function variety(img) {
  const seen = new Set();
  for (let i = 0; i < img.data.length; i += 4 * 97) seen.add((img.data[i] >> 3) * 1024 + (img.data[i + 1] >> 3) * 32 + (img.data[i + 2] >> 3));
  return seen.size;
}

test("the exact chain matches the float64 chain where doubles still work", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = [];
    const cases = [[0.4472135954957291, 0.8944271910020332, 2.7838699774672232e-12], [0.4472135954957291, 0.8944271910020332, 1e-9],
      [0.3, 0.6, 1e-6], [-0.2, 0.9, 1e-4]];
    for (const [cx, cy, scale] of cases) {
      const d = apolloFrame(cx, cy, scale, 0.46);
      const bits = exactBitsFor(scale);
      const e = apolloFrame(cx, cy, scale, 0.46, { ...exactCenter({ cx, cy, scale }, bits), bits });
      const rel = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(Math.hypot(b[0], b[1]), 1e-300);
      out.push({ scale, steps: [d.steps, e.steps], flip: [d.flip, e.flip], w0: Math.hypot(d.w0[0] - e.w0[0], d.w0[1] - e.w0[1]), k: rel(e.k, d.k), l: rel(e.l, d.l) });
    }
    return out;
  });
  for (const c of r) {
    expect(c.steps[1], `steps at ${c.scale}`).toBe(c.steps[0]);
    expect(c.flip[1]).toBe(c.flip[0]);
    // The float64 chain itself drifts from the truth by ~1e-5 at 2.8e-12, so "equal" means within that.
    expect(c.w0, `w0 at ${c.scale}`).toBeLessThan(1e-4);
    expect(c.k).toBeLessThan(1e-3);
  }
});

for (const [label, scale] of [["1e-20", 1e-20], ["1e-50", 1e-50], ["1e-100", 1e-100]]) {
  test(`at ${label}, exactBitsFor(scale) bits give the chain's w0 right to the last double`, async ({ page }) => {
    const r = await page.evaluate((s) => {
      const bits = exactBitsFor(s), truthBits = 1200;
      const [ex, ey] = window.goldenAt(bits), [tx, ty] = window.goldenAt(truthBits);
      const f = apolloFrameExact({ ex, ey, bits }, s, 0.46);
      const t = apolloFrameExact({ ex: tx, ey: ty, bits: truthBits }, s, 0.46);
      return { steps: [f.steps, t.steps], err: Math.hypot(f.w0[0] - t.w0[0], f.w0[1] - t.w0[1]), bits };
    }, scale);
    expect(r.steps[0]).toBe(r.steps[1]);
    expect(r.steps[0], "the chain is long: this view has structure at every depth").toBeGreaterThan(40);
    expect(r.err).toBeLessThan(1e-6);
  });

  test(`at ${label}, a view moved N pixels shows the same picture N pixels over`, async ({ page }) => {
    await page.evaluate((s) => window.showGolden(s), scale);
    await settle(page);
    const a = await canvasPixels(page);
    expect(variety(a), "the view has structure to compare").toBeGreaterThan(6);
    const N = 60;
    const info = await page.evaluate((n) => {
      const px = 2 * mainState.scale / mainRenderer.canvas.height;
      const cy0 = mainState.cy;
      moveCenter(mainState, 0, n * px);
      requestRender();
      return { cyMoved: mainState.cy !== cy0, valid: exactValid(mainState) };
    }, N);
    // At 1e-20 and deeper a move of 60 pixels is far below a double's step at 0.89.
    expect(info.cyMoved).toBe(false);
    expect(info.valid).toBe(true);
    await settle(page);
    const b = await canvasPixels(page);
    const d = compareShifted(a, b, N);
    const same = compareShifted(a, b, 0);
    console.log(`apollonian shifted compare at ${label}:`, JSON.stringify(d), "unshifted:", JSON.stringify(same));
    expect(d.mean, "mean channel difference").toBeLessThan(0.5);
    expect(d.over16, "share of pixels differing by more than 16").toBeLessThan(0.01);
    expect(same.mean, "the views really differ").toBeGreaterThan(d.mean * 3);
  });
}

test("a deep link round-trips the exact center and opens at the same picture", async ({ page }) => {
  await page.evaluate(() => window.showGolden(1e-50));
  const r = await page.evaluate(() => {
    moveCenter(mainState, 3.1e-52, -1.3e-52);
    const a = exactCenter(mainState, exactFrac(mainState));
    const hash = buildShareHash();
    selectFractal("Mandelbrot", { fresh: true });
    applyShareLink("https://example.test/" + hash);
    const b = exactCenter(mainState, exactFrac(mainState));
    return { hasFields: /[&]ex=/.test(hash), same: a.ex === b.ex && a.ey === b.ey, bitsA: exactFrac(mainState), valid: exactValid(mainState),
      name: mainState.ftype, scale: mainState.scale };
  });
  expect(r.hasFields).toBe(true);
  expect(r.valid).toBe(true);
  expect(r.same).toBe(true);
  expect(r.scale).toBe(1e-50);
});

// Every Apollonian place, drawn as shipped and again with the exact chain and the K * scale form forced on: same picture.
const APOLLO_PLACES = ["Golden Dive", "Jacob's Ladder", "Triangle Dive"];
for (const name of APOLLO_PLACES) {
  test(`Apollonian ${name}: the exact chain with rescaled K and L draws what the float64 chain draws`, async ({ page }) => {
    await page.evaluate((l) => window["__vt"].place(TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === "Apollonian" && d.label === l)), name);
    await settle(page);
    const a = await canvasPixels(page);
    await page.evaluate(() => { exactRender.apollo = 1; exactRender.apolloRescale = 1; requestRender(); });
    await settle(page);
    const b = await canvasPixels(page);
    await page.evaluate(() => { exactRender.apollo = 1e-13; exactRender.apolloRescale = 1e-15; });
    const d = compareShifted(a, b, 0);
    console.log(`apollonian ${name}, exact+rescaled vs float64:`, JSON.stringify(d));
    expect(variety(a), "the place has structure").toBeGreaterThan(6);
    expect(d.mean).toBeLessThan(1.5);
    expect(d.over16).toBeLessThan(0.02);
  });
}
