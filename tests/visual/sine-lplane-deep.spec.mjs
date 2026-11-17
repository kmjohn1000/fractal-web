// The Sine L-plane's deep path (renderSineLPlanePerturbation in shaders.js; sineLDeepEligible, sineLReferenceOrbit and
// chooseSineLReference in deepzoom.js): below the plane's float32 floor (sineLFloat32Floor) the pixel's L is no longer
// resolved by a float32, so the plane is drawn from a float64 reference orbit with a float32 offset per pixel, down to
// SINE_L_DEEP_MIN_SCALE = 1e-10. Checks where the switch happens (a view at the old floor must keep its float32 picture), the
// floor, the reference orbit, the agreement with a float64 iteration of the same map (counting only the pixels float64 itself
// keeps when L moves by one ulp: the plane's speckled filament zones flip under one rounding by nature, so a plain pixel
// diff fails there), the styles that follow the orbit (stripes, orbs), rotation, the drag preview, the info card, and a
// baseline picture of two deep views. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global SINE_MIN_SCALE, SINE_L_DEEP_MIN_SCALE, sineLFloat32Floor, sineLDeepEligible, sineLEscapeF64, sineLReferenceOrbit, minScaleFor,
   limitScale, mainState, mainRenderer, juliaRenderer, COLORMAPS, requestRender, FTYPE, setColorStyle, deepZoomEligible,
   gesturePreviewEligible, enterDual, exitDual, juliaState, applyShareLink, buildShareHash, refinePassCount, SINE_L_PASSES, DEEP_PASSES, FLOOR_STEPS,
   FLOOR_PIXELS, ulp64, chooseSineLReference */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const KEY = "Sine L plane";

// Boundary points of the plane found by zooming (the float32 spike's centers, 2026-11-10): Golden Shells and Dusty Edge near
// |L| 1, Rim Bulb's far side near 2.4, Yellow Fans near 5. At each half-height the center is one that lies on the boundary at
// that depth, so the view is full of filaments.
const CENTERS = {
  "1e-8": { golden: [0.3003257816081156, 0.9893895689150656], dusty: [0.3008872436523437, 0.9894151434536468], rim: [2.396504261016845, 0.18004672830065874], yellow: [5.002051108911987, 0.08355570487915039] },
  "1e-10": { golden: [0.3003257816081156, 0.9893895686175191], dusty: [0.3008872427225112, 0.9894151423569214], rim: [2.396504254736006, 0.18004673681667235], yellow: [5.002051108911987, 0.0835557070249176] },
};

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
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await settle(page);
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

async function settle(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 120_000, polling: 100 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function show(page, view, { cm = "Grayscale", style = null } = {}) {
  await page.evaluate(([key, v, cm, style]) => {
    window["__vt"].fractal(key, cm === null ? undefined : COLORMAPS.findIndex((c) => c.name === cm));
    if (style) setColorStyle(style);
    Object.assign(mainState, v, { iterAutoLocked: true });
    requestRender();
  }, [KEY, view, cm, style]);
  await settle(page);
}

async function canvasPng(page, selector = "#mainCanvas") {
  return PNG.sync.read(await page.locator(selector).screenshot({ animations: "disabled" }));
}

function colorStats(png) {
  const { data, width, height } = png;
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { dominant: Math.max(...counts.values()) / (width * height), distinct: counts.size };
}

// ---- the float64 reference: renderSineFamily in doubles
const csin = (x, y) => [Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y)];
const LNLN50 = Math.log(Math.log(50));
function logAbs(z) {
  const m = Math.max(Math.abs(z[0]), Math.abs(z[1]));
  return Math.log(m) + 0.5 * Math.log((z[0] / m) ** 2 + (z[1] / m) ** 2);
}
// The smooth count of the plane's orbit at L = (lx, ly), or null when it never escapes.
function smooth(lx, ly, maxIter) {
  let zx = Math.PI / 2, zy = 0;
  for (let i = 0; i < maxIter; i++) {
    const prevR2 = zx * zx + zy * zy;
    const s = csin(zx, zy);
    zx = lx * s[0] - ly * s[1]; zy = lx * s[1] + ly * s[0];
    if (zx * zx + zy * zy > 2500) {
      const a = Math.log(Math.max(0.5 * Math.log(Math.max(prevR2, 1)), 0.1));
      const b = Math.log(Math.max(logAbs([zx, zy]), Math.log(50)));
      return i + Math.min(1, Math.max(0, (LNLN50 - a) / Math.max(b - a, 1e-6)));
    }
  }
  return null;
}
const ulp = (x) => 2 ** (Math.floor(Math.log2(Math.abs(x))) - 52);
// The gray Grayscale gives a count at Smooth, Repeat 1: fract(n * 0.1) on its stops (0 -> 0, 0.5 -> 150, 1 -> 255).
const grayOf = (n) => {
  if (n === null) return 0;
  const t = (n * 0.1) % 1;
  return t < 0.5 ? 300 * t : 150 + 210 * (t - 0.5);
};

// One pass (sample 0, the pixel center) of the view in Grayscale, compared pixel by pixel on a grid with the float64 truth.
// A pixel is reliable when float64 itself keeps its answer when L moves one ulp (the same escape state, counts within a quarter
// of an iteration), and wrong when it is reliable and the app's gray is more than 20 levels (0.8 of an iteration) from the
// truth's. Returns { reliable, wrong } as shares of the grid's pixels and of the reliable ones. `rotation` turns the view.
async function compareReliable(page, { view, maxIter, step = 11 }) {
  await page.evaluate(([key, v, mi]) => {
    window["__vt"].fractal(key, COLORMAPS.findIndex((c) => c.name === "Grayscale"));
    setColorStyle({ style: "smooth", density: 1, offset: 0 });
    Object.assign(mainState, v, { maxIter: mi, iterAutoLocked: true });
    requestRender();
  }, [KEY, view, maxIter]);
  await settle(page);
  // one center-sample pass on its own, read from the drawing buffer (no screenshot resampling)
  const shot = await page.evaluate(() => {
    mainRenderer.render(mainState, 0);
    const c = mainRenderer.canvas, t = document.createElement("canvas");
    t.width = c.width; t.height = c.height;
    const g = t.getContext("2d");
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let s = "";
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: c.width, h: c.height, b64: btoa(s), path: null };
  });
  const data = Buffer.from(shot.b64, "base64");
  const { w, h } = shot;
  const cos = Math.cos(view.rotation || 0), sin = Math.sin(view.rotation || 0);
  let n = 0, rel = 0, wrong = 0, relWrongEsc = 0;
  for (let py = step >> 1; py < h; py += step) {
    for (let px = step >> 1; px < w; px += step) {
      const u0 = (px + 0.5 - w / 2) / h, v0 = (h - 1 - py + 0.5 - h / 2) / h;
      const u = u0 * cos - v0 * sin, v = u0 * sin + v0 * cos;
      const lx = view.cx + u * view.scale * 2, ly = view.cy + v * view.scale * 2;
      const t0 = smooth(lx, ly, maxIter), t1 = smooth(lx + ulp(lx), ly, maxIter);
      n++;
      const stable = (t0 === null) === (t1 === null) && (t0 === null || Math.abs(t0 - t1) <= 0.25);
      if (!stable) continue;
      rel++;
      const gray = data[(py * w + px) * 4];
      if (Math.abs(gray - grayOf(t0)) > 20) { wrong++; if (t0 !== null) relWrongEsc++; }
    }
  }
  return { n, reliable: rel / n, wrong: wrong / rel, wrongEscaped: relWrongEsc / rel };
}

// ---- where it switches, and the floor
test("the deep path starts under the float32 floor only, and the floor is the deep one", async ({ page }) => {
  const r = await page.evaluate(() => {
    const plane = (cx, cy, scale) => ({ ftype: FTYPE.SINE, power: 2, isJulia: false, cx, cy, scale });
    const julia = (cx, cy, scale) => ({ ftype: FTYPE.SINE, power: 2, isJulia: true, cx, cy, scale });
    const f32 = sineLFloat32Floor(plane(0.3, 0.99, 1));
    return {
      family: SINE_MIN_SCALE, deepMin: SINE_L_DEEP_MIN_SCALE, f32,
      atFloor: sineLDeepEligible(plane(0.3, 0.99, f32)), justUnder: sineLDeepEligible(plane(0.3, 0.99, f32 * 0.9)), above: sineLDeepEligible(plane(0.3, 0.99, f32 * 2)),
      whole: sineLDeepEligible(plane(1.5, 0, 3.9)), julia: sineLDeepEligible(julia(0.3, 0.99, 1e-8)), plusSineplane: sineLDeepEligible({ ftype: FTYPE.SINEPLANE, isJulia: false, cx: 0, cy: 1.17, scale: 1e-8 }),
      floor1: minScaleFor(plane(0.3, 0.99, 1)), floor24: minScaleFor(plane(2.4, 0.18, 1)), floor5: minScaleFor(plane(5, 0.085, 1)), floorHuge: minScaleFor(plane(1000, 0, 1)),
      want5: FLOOR_STEPS * ulp64(5) * FLOOR_PIXELS / 2, juliaFloor: minScaleFor(julia(3.14, 0, 1)),
      limited: limitScale(plane(0.3, 0.99, 1), 1e-14), kept: limitScale(plane(0.3, 0.99, 1), 1e-8),
    };
  });
  expect(r.atFloor, "a view at the old floor keeps its float32 picture").toBe(false);
  expect(r.justUnder).toBe(true);
  expect(r.above).toBe(false);
  expect(r.whole).toBe(false);
  expect(r.julia, "Sine Julia has no deep path").toBe(false);
  expect(r.plusSineplane, "the Sine plane has none either").toBe(false);
  expect(r.deepMin).toBe(1e-10);
  expect(r.floor1).toBe(1e-10);
  expect(r.floor24).toBe(1e-10);
  expect(r.floor5).toBe(Math.max(1e-10, r.want5));
  expect(r.floorHuge, "a far center keeps two doubles' steps per pixel").toBeGreaterThan(1e-10);
  expect(r.juliaFloor, "the Julia views keep the family's floor").toBe(r.family);
  expect(r.limited).toBe(1e-10);
  expect(r.kept).toBe(1e-8);
});

// ---- the reference orbit, in float64
test("the reference orbit is the float64 orbit, with sin Z and cos Z as the texture's first row and Z's remainder in the second", async ({ page }) => {
  const r = await page.evaluate(() => {
    const L = [0.3003257816081156, 0.9893895689150656];
    const o = sineLReferenceOrbit(L[0], L[1], 300);
    const len = o.length;
    let zx = Math.PI / 2, zy = 0, worstSin = 0, worstCos = 0, worstZ = 0, worstRem = 0;
    for (let n = 0; n < len - 1; n++) { // (not the escaping last point, whose huge value float32 holds only in range)
      const sx = Math.sin(zx) * Math.cosh(zy), sy = Math.cos(zx) * Math.sinh(zy);
      const cx = Math.cos(zx) * Math.cosh(zy), cy = -Math.sin(zx) * Math.sinh(zy);
      const k = n * 4, m = (len + n) * 4;
      const rel = (a, b) => Math.abs(a - b) / Math.max(1e-30, Math.abs(b), 1e-3);
      worstSin = Math.max(worstSin, rel(o.data[k], sx), rel(o.data[k + 1], sy));
      worstCos = Math.max(worstCos, rel(o.data[k + 2], cx), rel(o.data[k + 3], cy));
      worstZ = Math.max(worstZ, Math.abs(o.data[m] + o.data[m + 2] - zx), Math.abs(o.data[m + 1] + o.data[m + 3] - zy));
      worstRem = Math.max(worstRem, Math.abs(o.data[m + 2]) / Math.max(1e-30, Math.abs(zx) * 2 ** -23), 0);
      const s = [Math.sin(zx) * Math.cosh(Math.max(-80, Math.min(zy, 80))), Math.cos(zx) * Math.sinh(Math.max(-80, Math.min(zy, 80)))];
      const nx = L[0] * s[0] - L[1] * s[1], ny = L[0] * s[1] + L[1] * s[0];
      zx = nx; zy = ny;
    }
    return { len, size: o.data.length, worstSin, worstCos, worstZ, worstRem, esc: sineLEscapeF64(L[0], L[1], 300), expected: Number.isFinite(sineLEscapeF64(L[0], L[1], 300)) };
  });
  expect(r.size).toBe(r.len * 8);
  expect(r.worstSin, "sin Z in float32 of the float64 value").toBeLessThan(2e-7);
  expect(r.worstCos).toBeLessThan(2e-7);
  expect(r.worstZ, "Z hi + lo is Z to float32's remainder's own rounding").toBeLessThan(1e-12 + 6e-8 * 6e-8 * 1e3);
  expect(r.worstRem, "the remainder is under one float32 step").toBeLessThan(1.01);
  // an escaping orbit stops one step after it crosses the bailout, a surviving one runs maxIter steps
  if (r.expected) expect(r.len).toBe(r.esc + 2);
  else expect(r.len).toBe(301);
});

test("the reference is the view's center when its orbit lasts, else a longer-lasting point inside the view", async ({ page }) => {
  const r = await page.evaluate(() => {
    // a center whose orbit lasts all 400 iterations (inside the black body), and a boundary point whose orbit escapes
    const bounded = { ftype: FTYPE.SINE, cx: 0.3, cy: 0.2, scale: 1e-9, maxIter: 400, rotation: 0 };
    const escaping = { ftype: FTYPE.SINE, cx: 0.3008872427225112, cy: 0.9894151423569214, scale: 1e-10, maxIter: 1200, rotation: 0.4 };
    const a = chooseSineLReference(bounded, 600, 800);
    const b = chooseSineLReference(escaping, 600, 800);
    const own = sineLEscapeF64(escaping.cx, escaping.cy, escaping.maxIter);
    const chosen = sineLEscapeF64(escaping.cx + b.dx, escaping.cy + b.dy, escaping.maxIter);
    return { a, boundedLasts: sineLEscapeF64(bounded.cx, bounded.cy, bounded.maxIter), b, own, chosen, within: Math.hypot(b.dx, b.dy) / escaping.scale };
  });
  expect(r.boundedLasts).toBe(Infinity);
  expect(r.a).toEqual({ dx: 0, dy: 0 });
  expect(r.chosen, "the pick lasts at least as long as the center").toBeGreaterThanOrEqual(r.own);
  expect(r.within, "and lies inside the view (half-height 1 in these units, with the half-width and the diagonal)").toBeLessThan(2.5);
});

test("a share link deeper than the floor opens at the floor, and a link at 1e-10 round-trips", async ({ page }) => {
  const [cx, cy] = CENTERS["1e-10"].golden;
  await show(page, { cx, cy, scale: 1e-10 }, { cm: "Inferno" });
  const r = await page.evaluate(() => {
    const out = {};
    const hash = buildShareHash();
    out.hash = hash;
    applyShareLink("https://example.test/" + hash.replace(/([&#])s=[^&]*/, "$1s=1e-14"));
    out.deeper = mainState.scale;
    applyShareLink("https://example.test/" + hash);
    out.round = [mainState.cx, mainState.cy, mainState.scale];
    out.limited = limitScale(mainState, 1e-14);
    return out;
  });
  expect(r.deeper).toBe(1e-10);
  expect(r.round).toEqual([cx, cy, 1e-10]);
  expect(r.limited).toBe(1e-10);
});

// ---- agreement with float64, counting only the reliable pixels
test("at 1e-8 and 1e-10 the deep path agrees with float64 on the reliable pixels, where the float32 shader does not", async ({ page }) => {
  test.setTimeout(240_000);
  const out = [];
  for (const [h, centers] of Object.entries(CENTERS)) {
    for (const [name, [cx, cy]] of Object.entries(centers)) {
      const r = await compareReliable(page, { view: { cx, cy, scale: Number(h) }, maxIter: 1200 });
      out.push({ name, h, ...r });
    }
  }
  console.log(JSON.stringify(out));
  for (const r of out) {
    expect(r.reliable, `${r.name} ${r.h}: a real share of the grid is reliable`).toBeGreaterThan(0.25);
    // measured 0.05% to 7% on the desktop canvases and up to 8.9% on the iPhone's (Golden Shells at 1e-8 is the worst, and
    // the share falls with depth: 0.1% to 2.7% at 1e-10); the float32 shader is 91-100% off from 1e-8 down
    expect(r.wrong, `${r.name} ${r.h}: share of the reliable pixels more than 20 levels off`).toBeLessThan(0.11);
  }
});

// ---- rotation and the styles that follow the orbit
test("rotated, the deep path still agrees with float64 turned the same way", async ({ page }) => {
  const [cx, cy] = CENTERS["1e-10"].dusty;
  const r = await compareReliable(page, { view: { cx, cy, scale: 1e-10, rotation: 0.7 }, maxIter: 1200 });
  expect(r.reliable).toBeGreaterThan(0.25);
  expect(r.wrong, "share of the reliable pixels more than 20 levels off").toBeLessThan(0.11);
});

test("Stripes, Orbs, Rays and Bands draw full pictures from the deep path", async ({ page }) => {
  const [cx, cy] = CENTERS["1e-8"].golden;
  for (const style of ["stripes", "point", "cross", "bands"]) {
    await show(page, { cx, cy, scale: 1e-8 }, { cm: "Inferno", style: { style, density: 1, offset: 0 } });
    const path = await page.evaluate(() => mainRenderer.render(mainState, 0));
    expect(path, `${style} is drawn by the offset path`).toBe("perturbation");
    const stats = colorStats(await canvasPng(page));
    expect(stats.dominant, `${style} is not one color`).toBeLessThan(0.85);
    expect(stats.distinct, `${style} has color`).toBeGreaterThan(style === "bands" ? 5 : 60);
  }
});

// ---- no view that worked before changes
test("a view at the old floor is still the float32 shader's picture, and one just under it is the deep path's", async ({ page }) => {
  await show(page, { cx: 0.3002522816081156, cy: 0.9895126626650655, scale: 1.1920928955078125e-4 }, { cm: "Inferno" });
  expect(await page.evaluate(() => ({ path: mainRenderer.render(mainState, 0), deep: sineLDeepEligible(mainState) }))).toEqual({ path: null, deep: false });
  await page.evaluate(() => { mainState.scale = 1.1e-4; requestRender(); });
  await settle(page);
  expect(await page.evaluate(() => mainRenderer.render(mainState, 0))).toBe("perturbation");
});

// ---- the drag preview and the info card
test("a deep view's drag shows the moving last frame, and the info card names the path", async ({ page }) => {
  const [cx, cy] = CENTERS["1e-10"].dusty;
  await show(page, { cx, cy, scale: 1e-10 }, { cm: "Inferno" });
  const r = await page.evaluate(() => ({ eligible: deepZoomEligible(mainRenderer, mainState), preview: gesturePreviewEligible(mainRenderer, mainState), julia: deepZoomEligible(mainRenderer, { ...mainState, isJulia: true }) }));
  expect(r.eligible).toBe(true);
  expect(r.preview).toBe(true);
  expect(r.julia, "a Julia view of the same type is not").toBe(false);
  await page.evaluate(() => { if (document.getElementById("hud").classList.contains("hidden")) document.getElementById("hudBtn").click(); });
  await settle(page);
  const hud = await page.evaluate(() => document.getElementById("hud").textContent);
  expect(hud).toContain("perturbation (deep zoom)");
  expect(hud).toContain("As deep as this fractal goes");
  expect(hud).not.toContain("float32");
});

test("its deep views sharpen through 12 passes", async ({ page }) => {
  // the suite pins 16 passes (playwright.config.mjs); this one wants the default
  await page.evaluate(() => localStorage.removeItem("fractalAtlas.deepPasses"));
  await page.reload();
  await page.addScriptTag({ path: DRIVER });
  await settle(page);
  const [cx, cy] = CENTERS["1e-8"].dusty;
  await show(page, { cx, cy, scale: 1e-8 }, { cm: "Inferno" });
  expect(await page.evaluate(() => ({ n: refinePassCount(), sine: SINE_L_PASSES, deep: DEEP_PASSES }))).toEqual({ n: 12, sine: 12, deep: 8 });
  await page.evaluate(() => { mainState.scale = 0.5; requestRender(); });
  await settle(page);
  expect(await page.evaluate(() => refinePassCount()), "a shallow view of the plane keeps all 16").toBe(16);
});

// ---- the dual view: the Julia pane is a different map and stays float32
test("in the dual view the Julia pane keeps the float32 shader and its own floor", async ({ page }) => {
  const [cx, cy] = CENTERS["1e-8"].dusty;
  await page.evaluate(([key, cx, cy]) => {
    window["__vt"].fractal(key, COLORMAPS.findIndex((c) => c.name === "Inferno"));
    Object.assign(mainState, { cx, cy, scale: 1e-8, iterAutoLocked: true });
    enterDual();
  }, [KEY, cx, cy]);
  await settle(page);
  const r = await page.evaluate(() => ({ dual: !!juliaState, juliaDeep: deepZoomEligible(juliaRenderer, juliaState), juliaFloor: minScaleFor(juliaState), family: SINE_MIN_SCALE,
    mainDeep: sineLDeepEligible(mainState), juliaC: juliaState.juliaC, main: [mainState.cx, mainState.cy] }));
  expect(r.dual).toBe(true);
  expect(r.juliaDeep).toBe(false);
  expect(r.juliaFloor).toBe(r.family);
  expect(r.mainDeep).toBe(true);
  expect(r.juliaC).toEqual(r.main);
  expect(colorStats(await canvasPng(page, "#juliaCanvas")).distinct).toBeGreaterThan(20);
  expect(colorStats(await canvasPng(page, "#mainCanvas")).distinct).toBeGreaterThan(60);
  await page.evaluate(() => exitDual());
});

// ---- baselines of two deep views (Golden Shells' neighborhood at 1e-8, Rim Bulb's at 1e-10)
for (const [name, h] of [["golden", "1e-8"], ["rim", "1e-10"]]) {
  test(`the L-plane's deep path at ${name} ${h}`, async ({ page }) => {
    const [cx, cy] = CENTERS[h][name];
    await show(page, { cx, cy, scale: Number(h) }, { cm: "Inferno" });
    const stats = colorStats(await canvasPng(page));
    expect(stats.dominant).toBeLessThan(0.85);
    expect(stats.distinct).toBeGreaterThan(200);
    await expect(page).toHaveScreenshot(`sine-lplane-deep-path-${name}-${h}.png`);
  });
}
