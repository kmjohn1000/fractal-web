// Deep views drawn from the exact center (deepzoom.js: chooseReferenceExact, computeReferenceOrbitExact; view-math.js):
// below EXACT_RENDER_BELOW the reference orbit comes from the BigInt center, so a view one pixel over is a different
// picture, where the double center, a million times coarser than a pixel, could not tell them apart.
// Plain behavior checks, no screenshot baselines. The main check needs no oracle: two views whose exact centers differ by
// N pixels must show the same picture N pixels apart. The center is the Misiurewicz point c = i, which a double holds
// exactly and whose neighbourhood is all structure at any depth.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global mainState, mainRenderer, setCenter, moveCenter, exactCenter, requestRender, toExact, stepOrbitExact, computeReferenceOrbit,
   computeReferenceOrbitExact, chooseReferenceExact, EXACT_ONE, FTYPE, exactRender, TELEPORT_DESTINATIONS */

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
const showDeep = (page, scale) => page.evaluate((s) => {
  setCenter(mainState, 0, 1);
  mainState.scale = s;
  mainState.rotation = 0;
  mainState.maxIter = 600;
  mainState.iterAutoLocked = true;
  requestRender();
}, scale);

// Largest channel difference per pixel between a's rows [0, h - n) and b's rows [n, h): b is a moved down by n.
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

test("the BigInt orbit matches the float64 orbit where doubles still work", async ({ page }) => {
  const r = await page.evaluate(() => {
    const state = { ftype: FTYPE.ESCAPE, power: 2, maxIter: 400 };
    const c = [-0.743643887037158, 0.131825904205330];
    const a = computeReferenceOrbit(state, 0, 0, c[0], c[1]);
    const b = computeReferenceOrbitExact(state, 0n, 0n, toExact(c[0]), toExact(c[1]));
    let worst = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n * 4; i += 4) worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]));
    return { la: a.length, lb: b.length, worst };
  });
  expect(r.lb).toBe(r.la);
  expect(r.worst).toBeLessThan(1e-4); // float32 texels of a chaotic orbit; the first hundred are far closer
});

test("each family's exact step matches its float64 step", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    const cases = { escape: [FTYPE.ESCAPE, 2], cubic: [FTYPE.ESCAPE, 3], ship: [FTYPE.SHIP, 2], tricorn: [FTYPE.TRICORN, 2], celtic: [FTYPE.CELTIC, 2] };
    for (const [name, [ftype, power]] of Object.entries(cases)) {
      const zf = [0.3, -0.45];
      const zb = [toExact(0.3), toExact(-0.45)];
      const c = [-0.2, 0.55];
      let worst = 0;
      for (let n = 0; n < 6; n++) {
        stepOrbitExact(ftype, power, zb, toExact(c[0]), toExact(c[1]));
        // the float64 step, written out here from the same definitions
        const [zr, zi] = zf;
        let nr, ni;
        if (ftype === FTYPE.SHIP) { const ar = Math.abs(zr), ai = Math.abs(zi); nr = ar * ar - ai * ai + c[0]; ni = 2 * ar * ai + c[1]; }
        else if (ftype === FTYPE.CELTIC) { nr = Math.abs(zr * zr - zi * zi) + c[0]; ni = 2 * zr * zi + c[1]; }
        else if (ftype === FTYPE.TRICORN) { nr = zr * zr - zi * zi + c[0]; ni = -2 * zr * zi + c[1]; }
        else if (power === 3) { const a = zr * zr - zi * zi, b = 2 * zr * zi; nr = a * zr - b * zi + c[0]; ni = a * zi + b * zr + c[1]; }
        else { nr = zr * zr - zi * zi + c[0]; ni = 2 * zr * zi + c[1]; }
        zf[0] = nr; zf[1] = ni;
        worst = Math.max(worst, Math.abs(Number(zb[0]) / EXACT_ONE - nr), Math.abs(Number(zb[1]) / EXACT_ONE - ni));
      }
      out[name] = worst;
    }
    return out;
  });
  for (const [name, worst] of Object.entries(r)) expect(worst, name).toBeLessThan(1e-9); // a formula slip is off by 0.1 or more; a chaotic step amplifies double rounding to ~1e-12
});

test("the reference search finds a surviving point at 1e-20 and offsets stay within the view", async ({ page }) => {
  await showDeep(page, 1e-20);
  const r = await page.evaluate(() => {
    const ref = chooseReferenceExact(mainState, 800, 1000);
    return { dx: ref.dx, dy: ref.dy, scale: mainState.scale };
  });
  expect(Math.abs(r.dx)).toBeLessThanOrEqual(r.scale * 2);
  expect(Math.abs(r.dy)).toBeLessThanOrEqual(r.scale * 2);
});

// Against the trusted path: places where the float64 reference still works are drawn twice, once as shipped (the
// double center, exactRender.below at its default) and once with the limit raised so the exact BigInt path draws
// them. Both must give the same picture. The shifted-picture tests below show the exact path is consistent at depth;
// this shows it is right where the old path can be compared with it. One place per family that has a deep path.
const PLACES = [
  ["Mandelbrot", "Seahorse Valley"], ["Mandelbrot", "Mini Mandelbrot"], ["Mandelbrot", "Sunburst Fan"],
  ["Burn. Ship", "Sunken Crown"], ["Tricorn", "Flame Minibrot"], ["Celtic", "Halo Bell"], ["Multibrot³", "Spiral Galaxy"],
];
for (const [fractal, name] of PLACES) {
  test(`${fractal} ${name}: the exact path draws what the float64 path draws`, async ({ page }) => {
    await page.evaluate(([f, l]) => window["__vt"].place(TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === f && d.label === l)), [fractal, name]);
    await settle(page);
    const a = await canvasPixels(page);
    await page.evaluate(() => { exactRender.below = 1; requestRender(); });
    await settle(page);
    const b = await canvasPixels(page);
    await page.evaluate(() => { exactRender.below = 1e-13; });
    const d = compareShifted(a, b, 0);
    console.log(`exact vs float64 at ${fractal} ${name}:`, JSON.stringify(d));
    expect(variety(a), "the place has structure").toBeGreaterThan(8);
    // Not identical: the two orbits differ in the last digits of a chaotic orbit, and a float32 perturbation render has
    // grain wherever its reference runs out (the next test shows the exact path is no grainier). A wrong orbit or step
    // formula gives a different picture, tens of levels apart on average.
    expect(d.mean).toBeLessThan(8);
    expect(d.over16).toBeLessThan(0.15);
  });

  // Where the two paths differ, which is more self-consistent? A picture moved N pixels (center plus N pixels, drawn
  // afresh with its own reference orbit) should equal the original moved N pixels. The Burning Ship's mirrored axis
  // reverses the direction of the move, so it is left to the test above.
  if (fractal !== "Burn. Ship") test(`${fractal} ${name}: moved N pixels, the exact path agrees with itself at least as well as the float64 path`, async ({ page }) => {
    await page.evaluate(([f, l]) => window["__vt"].place(TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === f && d.label === l)), [fractal, name]);
    await settle(page);
    const N = 60;
    const run = async (below) => {
      await page.evaluate((b) => { exactRender.below = b; requestRender(); }, below);
      await settle(page);
      const a = await canvasPixels(page);
      await page.evaluate((n) => {
        const px = 2 * mainState.scale / mainRenderer.canvas.height;
        moveCenter(mainState, 0, n * px);
        requestRender();
      }, N);
      await settle(page);
      const b = await canvasPixels(page);
      await page.evaluate((n) => {
        const px = 2 * mainState.scale / mainRenderer.canvas.height;
        moveCenter(mainState, 0, -n * px);
      }, N);
      return compareShifted(a, b, N);
    };
    const viaFloat = await run(0);
    const viaExact = await run(1);
    await page.evaluate(() => { exactRender.below = 1e-13; });
    console.log(`shift agreement at ${fractal} ${name}: float64 ${JSON.stringify(viaFloat)}, exact ${JSON.stringify(viaExact)}`);
    expect(viaExact.mean).toBeLessThanOrEqual(viaFloat.mean + 0.25);
  });
}

for (const [label, scale] of [["1e-16", 1e-16], ["1e-20", 1e-20], ["1e-26", 1e-26], ["1e-30", 1e-30], ["1e-33", 1e-33], ["1e-36", 1e-36]]) {
  test(`at ${label}, a view moved N pixels shows the same picture N pixels over`, async ({ page }) => {
    await showDeep(page, scale);
    await settle(page);
    const a = await canvasPixels(page);
    expect(variety(a), "the view has structure to compare").toBeGreaterThan(8);
    const N = 60;
    const info = await page.evaluate((n) => {
      const px = 2 * mainState.scale / mainRenderer.canvas.height; // world units per device pixel
      moveCenter(mainState, 0, n * px);
      requestRender();
      return { cy: mainState.cy, valid: exactCenter(mainState).ey !== toExact(mainState.cy) };
    }, N);
    // The point of the test: the double never moved, only the exact center did.
    expect(info.cy).toBe(1);
    expect(info.valid).toBe(true);
    await settle(page);
    const b = await canvasPixels(page);
    const d = compareShifted(a, b, N);
    console.log(`shifted compare at ${label}:`, JSON.stringify(d), "unshifted:", JSON.stringify(compareShifted(a, b, 0)));
    expect(d.mean, "mean channel difference").toBeLessThan(0.5);
    expect(d.over16, "share of pixels differing by more than 16").toBeLessThan(0.005);
    // And it is not the stalled picture: unshifted, the two images differ.
    const same = compareShifted(a, b, 0);
    expect(same.mean).toBeGreaterThan(d.mean * 2);
  });
}
