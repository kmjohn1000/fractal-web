// Places whose text carries more digits than a double (places.js GOLDEN_RE / GOLDEN_IM, 160 digits): landing on one sets
// the exact center from all of them (view-math.js exactFromPlace, teleport.js flyTo), so a deeper zoom from the place stays
// on its self-similar point. Plain behavior checks, no screenshot baselines.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global mainState, setCenter, moveCenter, exactCenter, exactValid, exactFrac, exactBitsFor, fromExact, selectFractal, requestRender,
   exactFromDecimal, decimalDigits, exactFromPlace, flyToPlace, TELEPORT_DESTINATIONS, GOLDEN_RE, LONG_DECIMAL_DIGITS, mainRenderer */

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
  await page.evaluate(() => {
    // The truth: 1/sqrt5 and 2/sqrt5 at F fraction bits, by integer square root.
    window.goldenAt = (F) => {
      const f = BigInt(F), n = 5n << (2n * f);
      let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
      for (;;) { const y = (x + n / x) >> 1n; if (y >= x) break; x = y; }
      return [x / 5n, (2n * x) / 5n];
    };
    window.placeIndex = (fractal, label) => TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === fractal && d.label === label);
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
function variety(img) {
  const seen = new Set();
  for (let i = 0; i < img.data.length; i += 4 * 97) seen.add((img.data[i] >> 3) * 1024 + (img.data[i + 1] >> 3) * 32 + (img.data[i + 2] >> 3));
  return seen.size;
}
function meanDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) sum += Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
  return sum / (a.data.length / 4);
}
// Flies to a place and waits for the landing.
const flyAndLand = async (page, fractal, label) => {
  await page.evaluate(([f, l]) => { selectFractal(f, { fresh: true }); flyToPlace(window.placeIndex(f, l)); }, [fractal, label]);
  await page.waitForFunction(([f, l]) => window["teleportLandingIndex"] === window.placeIndex(f, l), [fractal, label], { timeout: 90_000, polling: 100 });
  await settle(page);
};

test("decimal text becomes the exact fixed-point value", async ({ page }) => {
  const r = await page.evaluate(() => ({
    half: String(exactFromDecimal("0.5", 8)), neg: String(exactFromDecimal("-0.25", 8)), one: String(exactFromDecimal("1", 8)),
    tenth: exactFromDecimal("0.1", 64) === ((1n << 64n) * 2n + 10n) / 20n,
    third: exactFromDecimal("0.3333333333333333333333333333333333", 128) === ((1n << 128n) / 3n) || exactFromDecimal("0.3333333333333333333333333333333333", 128) === ((1n << 128n) / 3n) - 0n,
    bad: [exactFromDecimal("1e-5", 8), exactFromDecimal("", 8), exactFromDecimal("abc", 8), exactFromDecimal("1.2.3", 8), exactFromDecimal(5, 8)],
    digits: [decimalDigits("0.0045"), decimalDigits("-12.50"), decimalDigits(GOLDEN_RE), decimalDigits("nope")],
    limit: LONG_DECIMAL_DIGITS,
  }));
  expect(r.half).toBe("128");
  expect(r.neg).toBe("-64");
  expect(r.one).toBe("256");
  expect(r.tenth).toBe(true);
  expect(r.bad).toEqual([null, null, null, null, null]);
  expect(r.digits).toEqual([2, 4, 160, 0]);
  expect(r.limit).toBe(18);
});

test("only a place with more digits than a double has an exact center", async ({ page }) => {
  const r = await page.evaluate(() => {
    const plain = TELEPORT_DESTINATIONS.filter((d) => exactFromPlace(d) === null).length;
    const long = TELEPORT_DESTINATIONS.filter((d) => exactFromPlace(d) !== null).map((d) => d.label);
    const dive = TELEPORT_DESTINATIONS[window.placeIndex("Apollonian", "Golden Dive")];
    const e = exactFromPlace(dive), [tx, ty] = window.goldenAt(e.bits);
    // In units of the pair's last bit, the text's 160 digits agree with the true point to about 1e-160.
    const err = (a, b) => Number(a > b ? a - b : b - a) / 2 ** e.bits;
    // For every place with long text, the double the landing uses is the nearest double to the text.
    const doublesAgree = TELEPORT_DESTINATIONS.every((d) => { const x = exactFromPlace(d); return x === null || (x.cx === Number(d.re) && x.cy === Number(d.im)); });
    return { plain, total: TELEPORT_DESTINATIONS.length, long, bits: e.bits, cx: e.cx, reNumber: Number(dive.re), errX: err(e.ex, tx), errY: err(e.ey, ty), doublesAgree };
  });
  expect(r.long, "the two Golden places carry long text").toEqual(expect.arrayContaining(["Golden Dive", "Golden Glide"]));
  expect(r.plain + r.long.length).toBe(r.total);
  expect(r.doublesAgree).toBe(true);
  expect(r.bits % 64).toBe(0);
  expect(r.bits).toBeGreaterThanOrEqual(576);
  expect(r.cx, "the double is the nearest double to the text").toBe(r.reNumber);
  expect(r.errX).toBeLessThan(1e-159);
  expect(r.errY).toBeLessThan(1e-159);
});

test("flying to Golden Dive lands on its exact center", async ({ page }) => {
  await flyAndLand(page, "Apollonian", "Golden Dive");
  const r = await page.evaluate(() => {
    const d = TELEPORT_DESTINATIONS[window.placeIndex("Apollonian", "Golden Dive")];
    const F = exactFrac(mainState), [tx, ty] = window.goldenAt(F), c = exactCenter(mainState, F);
    const err = (a, b) => Number(a > b ? a - b : b - a) / 2 ** F;
    return { valid: exactValid(mainState), F, cx: mainState.cx, want: Number(d.re), scale: mainState.scale, errX: err(c.ex, tx), errY: err(c.ey, ty) };
  });
  expect(r.valid).toBe(true);
  expect(r.F).toBeGreaterThanOrEqual(576);
  expect(r.cx).toBe(r.want);
  expect(r.errX).toBeLessThan(1e-159);
  expect(r.errY).toBeLessThan(1e-159);
});

test("zooming on from Golden Dive stays on the point; the doubles alone slide off it", async ({ page }) => {
  await flyAndLand(page, "Apollonian", "Golden Dive");
  await page.evaluate(() => { mainState.scale = 1e-60; moveCenter(mainState, 0, 0); requestRender(); });
  await settle(page);
  const landed = await canvasPixels(page);
  // The same view from the point computed in integers.
  await page.evaluate(() => {
    const bits = exactBitsFor(1e-60), [ex, ey] = window.goldenAt(bits);
    selectFractal("Apollonian", { fresh: true });
    setCenter(mainState, fromExact(ex, bits), fromExact(ey, bits), ex, ey, bits);
    mainState.scale = 1e-60; requestRender();
  });
  await settle(page);
  const truth = await canvasPixels(page);
  // And the same view from the double only, the place as it was before it carried digits.
  await page.evaluate(() => {
    const d = TELEPORT_DESTINATIONS[window.placeIndex("Apollonian", "Golden Dive")];
    selectFractal("Apollonian", { fresh: true });
    setCenter(mainState, Number(d.re), Number(d.im));
    mainState.scale = 1e-60; requestRender();
  });
  await settle(page);
  const doubled = await canvasPixels(page);
  expect(variety(landed), "the landed view has structure at 1e-60").toBeGreaterThan(6);
  expect(meanDiff(landed, truth), "landing = the integer-computed point").toBeLessThan(0.5);
  expect(variety(doubled), "a double's rounding leaves a flat view").toBeLessThan(4);
});

test("landing on a place clears the previous view's exact pair", async ({ page }) => {
  const r = await page.evaluate(async () => {
    selectFractal("Mandelbrot", { fresh: true });
    const i = window.placeIndex("Mandelbrot", "Seahorse Valley"), d = TELEPORT_DESTINATIONS[i];
    // A view on the place's own double with an exact pair that differs from it (a sub-ulp nudge).
    setCenter(mainState, Number(d.re), Number(d.im));
    mainState.scale = 1e-12;
    moveCenter(mainState, 1e-30, 0);
    const before = exactValid(mainState);
    flyToPlace(i);
    return { before, i };
  });
  expect(r.before).toBe(true);
  await page.waitForFunction((i) => window["teleportLandingIndex"] === i, r.i, { timeout: 60_000, polling: 100 });
  const after = await page.evaluate(() => ({ ex: mainState.ex, valid: exactValid(mainState) }));
  expect(after.ex).toBeNull();
  expect(after.valid).toBe(false);
});
