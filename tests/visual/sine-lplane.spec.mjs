// The sine L-plane ("Sine L plane", FTYPE.SINE without a juliaC; renderSineFamily in shaders.js): z -> L sin z with L the
// pixel, started at the critical point pi/2, the parameter plane that goes with "Sine Julia" (the Julia set of the same
// map for L = 1 + 0.4i, which is its Julia preset: dualParent, as Julia:Rabbit is Mandelbrot's). Float32 only, so the
// zoom stops at the floor minScaleFor gives it, which follows its center (two float32 steps per pixel, never under
// SINE_MIN_SCALE). Checks the mathematics the picture rests on (the start at pi/2, in float64), that it draws and sits in
// the picker, agrees with a float64 iteration of the same map (the smooth count included), turns with the twist
// gesture's rotation, offers exactly the styles it can draw, stops at its floor by link and wheel, has its places above
// that floor, shows Sine Julia in the dual view's second pane, and that Sine Julia's own Dual button opens the plane
// with the Julia pane on its set. The opening view and places are also covered by app.spec.mjs's per-fractal and
// per-place baselines. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global SINE_MIN_SCALE, minScaleFor, limitScale, atZoomLimit, mainState, juliaState, mainRenderer, buildShareHash, COLORMAPS,
   colormapIndex, applyShareLink, requestRender, currentName, FTYPE, PICKER_LAYOUT, PICKER_BLURBS, enterDual, exitDual, dualActive,
   setColorStyle, styleDrawn, COLOR_STYLES, SAMPLE_OFFSETS, FRACTAL_CONFIGS, TELEPORT_DESTINATIONS, placeId, fractalLabel, els,
   selectFractal, dualPresetName, FLOOR_STEPS, FLOOR_PIXELS, ulp32 */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const KEY = "Sine L plane";

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
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 100 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// The view to look at: the fields given override the opening view. cm: a palette name to pick.
async function show(page, fractal, view = {}, cm = undefined) {
  await page.evaluate(([f, v, cm]) => {
    window["__vt"].fractal(f, cm === undefined ? undefined : COLORMAPS.findIndex((c) => c.name === cm));
    Object.assign(mainState, v);
    requestRender();
  }, [fractal, view, cm]);
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

// ---- the float64 reference: shaders.js's renderSineFamily in doubles (plain Math.sin/cosh, no range reduction)
const csin = (x, y) => [Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y)];
const LNLN50 = Math.log(Math.log(50));
function logAbs(z) {
  const m = Math.max(Math.abs(z[0]), Math.abs(z[1]));
  return Math.log(m) + 0.5 * Math.log((z[0] / m) ** 2 + (z[1] / m) ** 2);
}
// z -> L sin z. kind "lplane": L = p and z starts at z0 (pi/2 unless given); kind "julia": L given, z starts at p.
// Returns { i, n } (the escape iteration and the smooth count), or null when the orbit never escapes.
function orbit(kind, p, maxIter, L = null, z0 = [Math.PI / 2, 0]) {
  const Lc = kind === "lplane" ? p : L;
  let z = kind === "lplane" ? [z0[0], z0[1]] : [p[0], p[1]];
  let prevR2;
  for (let i = 0; i < maxIter; i++) {
    prevR2 = z[0] * z[0] + z[1] * z[1];
    const s = csin(z[0], z[1]);
    z = [Lc[0] * s[0] - Lc[1] * s[1], Lc[0] * s[1] + Lc[1] * s[0]];
    if (z[0] * z[0] + z[1] * z[1] > 2500) {
      const a = Math.log(Math.max(0.5 * Math.log(Math.max(prevR2, 1)), 0.1));
      const b = Math.log(Math.max(logAbs(z), Math.log(50)));
      return { i, n: i + Math.min(1, Math.max(0, (LNLN50 - a) / Math.max(b - a, 1e-6))) };
    }
  }
  return null;
}
const smoothCount = (kind, p, maxIter, L = null) => orbit(kind, p, maxIter, L)?.n ?? null;
// The gray a Grayscale render at Repeat 0.25 gives that count: 255 * fract(n * 0.1 * 0.25), black when it never escapes.
const grayOf = (n) => (n === null ? 0 : 255 * ((n * 0.025) % 1));

// Draws a view of `fractal` in Grayscale at Repeat 0.25, then compares a grid of its pixels with the float64 reference
// (the app averages SAMPLE_OFFSETS' 16 jittered samples, so the reference averages the same 16 grays). kind "lplane" for
// the plane; "julia" with juliaC (L) for a Julia set (Sine Julia, or any L as a Julia view of the plane's type).
async function compareWithFloat64(page, { fractal, kind, view, maxIter, juliaC = null }) {
  await page.evaluate(([f, v, mi, jc]) => {
    window["__vt"].fractal(f, COLORMAPS.findIndex((c) => c.name === "Grayscale"));
    setColorStyle({ style: "smooth", density: 0.25, offset: 0 });
    Object.assign(mainState, v, { maxIter: mi, iterAutoLocked: true }, jc ? { isJulia: true, juliaC: jc } : {});
    requestRender();
  }, [fractal, view, maxIter, juliaC]);
  await settle(page);
  return compareGrid(page, "#mainCanvas", { kind, view, maxIter, juliaC });
}

// About 700 blocks of 8x8 drawing-buffer pixels spread over the canvas, each block's mean gray against the float64
// reference's (the 16 pixels at every second row and column of the block, each averaged over SAMPLE_OFFSETS). Block
// means rather than single pixels because the drawing buffer can be smaller than the screenshot (a phone draws at 2x
// and shows at 3x, so the screenshot is a resampled copy) and because float32 and float64 orbits drift apart pixel by
// pixel in the filaments, while the color of a region is what has to agree (the oracle gate does the same, 8x8 blocks).
async function compareGrid(page, selector, { kind, view, maxIter, juliaC = null }) {
  const png = await canvasPng(page, selector);
  const info = await page.evaluate(([sel]) => ({ w: document.querySelector(sel).width, h: document.querySelector(sel).height, offs: SAMPLE_OFFSETS }), [selector]);
  const { w, h } = info;
  const cos = Math.cos(view.rotation || 0), sin = Math.sin(view.rotation || 0);
  const B = 8;
  const stride = Math.max(B, Math.round(Math.sqrt((w * h) / 700)));
  let sum = 0, over = 0, n = 0;
  for (let by = 0; by + B <= h; by += stride) {
    for (let bx = 0; bx + B <= w; bx += stride) {
      let ref = 0, refN = 0;
      for (let dy = 0; dy < B; dy += 2) {
        for (let dx = 0; dx < B; dx += 2) {
          for (const [jx, jy] of info.offs) {
            const u0 = (bx + dx + 0.5 + jx - w / 2) / h, v0 = (h - 1 - (by + dy) + 0.5 + jy - h / 2) / h;
            // main() in shaders.js: the screen offset is turned by the view's rotation before it scales
            const u = u0 * cos - v0 * sin, v = u0 * sin + v0 * cos;
            ref += grayOf(smoothCount(kind, [view.cx + u * view.scale * 2, view.cy + v * view.scale * 2], maxIter, juliaC));
            refN++;
          }
        }
      }
      let app = 0, appN = 0;
      const x0 = Math.floor((bx / w) * png.width), x1 = Math.max(x0 + 1, Math.floor(((bx + B) / w) * png.width));
      const y0 = Math.floor((by / h) * png.height), y1 = Math.max(y0 + 1, Math.floor(((by + B) / h) * png.height));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { app += png.data[(y * png.width + x) * 4]; appN++; }
      const d = Math.abs(app / appN - ref / refN);
      sum += d; if (d > 20) over++; n++;
    }
  }
  return { mean: sum / n, over: over / n };
}

// ---- the mathematics, in float64 only (no page needed): why the plane starts at pi/2
test("the orbit of pi/2 is the plane: other critical points repeat it up to sign, z0 = L is the same orbit one step on, z0 = 0 says nothing", async () => {
  const N = 160, M = 120, maxIter = 100;
  let total = 0, same3 = 0, sameMinus = 0, same5 = 0, shifted = 0, escaped = 0, bothBounded = 0, bounded = 0, zeroBounded = 0, oneDiffers = 0;
  for (let a = 0; a < M; a++) {
    for (let b = 0; b < N; b++) {
      const L = [-5.2 + (10.4 * (b + 0.5)) / N, -3.9 + (7.8 * (a + 0.5)) / M];
      const base = orbit("lplane", L, maxIter)?.i ?? -1;
      const at = (z0) => orbit("lplane", L, maxIter, null, z0)?.i ?? -1;
      total++;
      if (at([3 * Math.PI / 2, 0]) === base) same3++;      // pi/2 + pi: sin = -1, so z1 = -L, then the orbit is the negative
      if (at([-Math.PI / 2, 0]) === base) sameMinus++;
      if (at([5 * Math.PI / 2, 0]) === base) same5++;
      // started at L (what z1 of the plane's orbit is), the orbit is the plane's orbit minus its first term
      const fromL = orbit("julia", L, maxIter, L)?.i ?? -1;
      if (base >= 0) { escaped++; if (fromL === base - 1) shifted++; } else { bounded++; if (fromL === -1) bothBounded++; }
      if (orbit("julia", [0, 0], 50, L) === null) zeroBounded++;   // z0 = 0 is a fixed point of L sin z for every L
      if ((at([1, 0]) === -1) !== (base === -1)) oneDiffers++;      // a start that is not critical does draw another plane
    }
  }
  expect(same3 / total, "pi/2 and 3 pi/2 escape on the same iteration").toBeGreaterThan(0.999);
  expect(sameMinus / total, "pi/2 and -pi/2").toBeGreaterThan(0.999);
  expect(same5 / total, "pi/2 and 5 pi/2").toBeGreaterThan(0.999);
  expect(shifted / escaped, "z0 = L escapes one iteration earlier").toBeGreaterThan(0.999);
  expect(bothBounded / bounded, "and stays bounded where the plane does").toBeGreaterThan(0.99);
  expect(zeroBounded, "z0 = 0 never escapes").toBe(total);
  expect(oneDiffers / total, "z0 = 1 is not the plane").toBeGreaterThan(0.002);
  expect(bounded / total, "the black body is a real share of the box").toBeGreaterThan(0.05);
});

test("where the critical orbit is bounded the Julia set at L has bounded points, and where it escapes it has none", async () => {
  // (the escaping critical orbit leaves L sin z with no attracting cycle, so every point near the Julia set escapes)
  let boundedL = 0, boundedLWithPoints = 0, escapedLWithPoints = 0;
  for (let a = 0; a < 16; a++) {
    for (let b = 0; b < 24; b++) {
      const L = [-5 + (10 * (b + 0.37)) / 24, -3.7 + (7.4 * (a + 0.61)) / 16];
      const critOrbit = orbit("lplane", L, 400);
      const crit = critOrbit === null;
      // Only the clear cases: a critical orbit that escapes late (past 40 steps) means L is next to the black body, where the
      // Julia set has long-lived points that take hundreds of steps to leave; and not near |L| = 1, where 0 repels so weakly
      // that points near it take more than 300 steps to leave.
      if (Math.hypot(L[0], L[1]) < 1.3 || (critOrbit && critOrbit.i >= 40)) continue;
      let points = 0;
      for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 32; x++) {
          if (orbit("julia", [-3.2 + (6.4 * (x + 0.5)) / 32, -2.4 + (4.8 * (y + 0.5)) / 24], 300, L) === null) points++;
        }
      }
      if (crit) { boundedL++; if (points > 0) boundedLWithPoints++; } else if (points > 0) escapedLWithPoints++;
    }
  }
  expect(boundedL, "bounded L in the sample").toBeGreaterThan(8);
  expect(boundedLWithPoints / boundedL).toBeGreaterThan(0.99);
  expect(escapedLWithPoints, "escaping L with a point that never leaves").toBe(0);
});

test("it opens as a full, colorful picture in the Inferno palette, the whole box on screen, not a Julia view", async ({ page }) => {
  await show(page, KEY);
  const stats = colorStats(await canvasPng(page));
  // The black body is a big share of the frame; it is neither blank nor flat.
  expect(stats.dominant, "not a blank or flat frame").toBeLessThan(0.6);
  expect(stats.distinct, "the colormap flows (smooth count, no banding)").toBeGreaterThan(400);
  expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Inferno");
  const v = await page.evaluate(() => ({ s: mainState.scale, b: mainState.baseScale, ftype: mainState.ftype, want: FTYPE.SINE, isJulia: mainState.isJulia, label: fractalLabel("Sine L plane") }));
  expect(v.ftype).toBe(v.want);
  expect(v.isJulia).toBe(false);
  expect(v.s).toBe(v.b);
  expect(v.label).toBe("Sine L-plane");
});

test("its configuration: a dual plane, and Sine Julia is its Julia preset without a Julia-set label", async ({ page }) => {
  const r = await page.evaluate(() => {
    const plane = FRACTAL_CONFIGS["Sine L plane"], julia = FRACTAL_CONFIGS["Sine Julia"];
    return { planeJuliaC: plane.juliaC, planeDual: plane.dual, planeParent: plane.dualParent, juliaParent: julia.dualParent, juliaDual: julia.dual,
      juliaGroup: julia.group ?? null, juliaLabel: fractalLabel("Sine Julia"), sameFtype: plane.ftype === julia.ftype, differsFromSinePlane: plane.ftype !== FRACTAL_CONFIGS["Sine plane"].ftype };
  });
  expect(r).toEqual({ planeJuliaC: null, planeDual: true, planeParent: undefined, juliaParent: "Sine L plane", juliaDual: false, juliaGroup: null,
    juliaLabel: "Sine Julia", sameFtype: true, differsFromSinePlane: true });
});

test("the picker lists it in the Mandelbrot family right after Sine plane, with its thumbnail and a one-line blurb", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const group = PICKER_LAYOUT.flatMap((s) => s.groups).find((g) => g.keys.includes("Sine L plane"));
    const tile = document.querySelector('#fractalTypeRow button[data-name="Sine L plane"]');
    const img = tile.querySelector("img");
    img.loading = "eager";
    await img.decode();
    return { group: group.label, keys: group.keys, text: tile.querySelector(".pickName").textContent.trim(), aria: tile.getAttribute("aria-label"),
      src: img.getAttribute("src"), w: img.naturalWidth, h: img.naturalHeight, blurb: PICKER_BLURBS["Sine L plane"],
      shown: tile.querySelector(".pickBlurb")?.textContent ?? null };
  });
  expect(r.group).toBe("Mandelbrot family");
  expect(r.keys.indexOf("Sine L plane")).toBe(r.keys.indexOf("Sine plane") + 1);
  expect(r.text).toBe("Sine L-plane");
  expect(r.aria).toBe("Sine L-plane");
  expect(r.src).toBe("icons/thumbs/sine-l-plane.webp");
  expect(r.w).toBeGreaterThan(0);
  expect(r.w).toBe(r.h);
  expect(r.blurb).toMatch(/\.$/);
  expect(r.blurb.length).toBeGreaterThanOrEqual(40);
  expect(r.blurb.length).toBeLessThanOrEqual(80);
  expect(r.blurb).toContain("Dual view");
  await page.evaluate(() => document.querySelector('#fractalTypeRow button[data-name="Sine L plane"]').click());
  await settle(page);
  expect(await page.evaluate(() => currentName)).toBe("Sine L plane");
});

test("a share link round-trips view, rotation and palette exactly", async ({ page }) => {
  await show(page, KEY, { cx: 0.3151234567, cy: 0.9712345678, scale: 0.0123456789, rotation: 0.6 });
  const hash = await page.evaluate(() => buildShareHash());
  expect(decodeURIComponent(hash.replace(/\+/g, " "))).toContain(`f=${KEY}`);
  const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
  await page.evaluate(() => window["__vt"].fractal("Mandelbrot"));
  await settle(page);
  await page.evaluate((h) => applyShareLink("https://example.test/" + h), hash);
  await settle(page);
  const after = await page.evaluate(() => ({ name: currentName, cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter, isJulia: mainState.isJulia }));
  expect(after.rotation).toBeCloseTo(before.rotation, 12);
  expect(after).toEqual({ name: KEY, ...before, rotation: after.rotation, isJulia: false });
  expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Inferno");
});

test("a share link of the dual view round-trips, with the Julia pane on the plane's center", async ({ page }) => {
  await show(page, KEY, { cx: 1.25, cy: 0.5, scale: 1.5 });
  await page.evaluate(() => enterDual());
  await settle(page);
  const hash = await page.evaluate(() => buildShareHash());
  await page.evaluate(() => { exitDual(); window["__vt"].fractal("Mandelbrot"); });
  await settle(page);
  await page.evaluate((h) => applyShareLink("https://example.test/" + h), hash);
  await settle(page);
  const st = await page.evaluate(() => ({ name: currentName, dual: dualActive, c: juliaState.juliaC, jIsJulia: juliaState.isJulia, jftype: juliaState.ftype, want: FTYPE.SINE, cx: mainState.cx, cy: mainState.cy }));
  expect(st).toEqual({ name: KEY, dual: true, c: [1.25, 0.5], jIsJulia: true, jftype: st.want, want: st.want, cx: 1.25, cy: 0.5 });
  await page.evaluate(() => exitDual());
});

test("the pictures agree with a float64 iteration of the same map", async ({ page }) => {
  const cases = [
    { fractal: KEY, kind: "lplane", view: { cx: 1.5, cy: 0, scale: 3.9 }, maxIter: 120 },
    { fractal: KEY, kind: "lplane", view: { cx: 0, cy: 0, scale: 4.4 }, maxIter: 80 },
    { fractal: KEY, kind: "lplane", view: { cx: 2.4, cy: 0.17553971307238725, scale: 0.02 }, maxIter: 150 },
    { fractal: KEY, kind: "lplane", view: { cx: 4.9, cy: 0.18, scale: 0.8 }, maxIter: 120 },
    // The Julia set for one L, as the dual view's second pane draws it (the plane's own type, isJulia set).
    { fractal: KEY, kind: "julia", view: { cx: 0, cy: 0, scale: 2.4 }, maxIter: 100, juliaC: [1.5, 0] },
  ];
  for (const c of cases) {
    const r = await compareWithFloat64(page, c);
    const tag = `${c.fractal} ${JSON.stringify(c.view)}${c.juliaC ? " Julia" : ""}`;
    // (measured about 0.3-2 mean and under 2% over 20 levels; the rest is float32 against double in the filaments)
    expect(r.mean, `${tag}: mean gray difference`).toBeLessThan(4);
    expect(r.over, `${tag}: share of pixels more than 20 levels off`).toBeLessThan(0.03);
  }
});

test("the twist rotation is wired: a turned view agrees with float64 turned the same way", async ({ page }) => {
  // The plane is symmetric under z -> -z, but a turn by a quarter or a third is not a symmetry of anything, so a
  // dropped or doubled rotation would show; the view is off-center so a rotation about the wrong point would too.
  for (const c of [
    { fractal: KEY, kind: "lplane", view: { cx: 1.5, cy: 0.3, scale: 2.5, rotation: 0.7 }, maxIter: 120 },
    { fractal: KEY, kind: "lplane", view: { cx: 2.4, cy: 0.17553971307238725, scale: 0.3, rotation: -1.1 }, maxIter: 120 },
  ]) {
    const r = await compareWithFloat64(page, c);
    expect(r.mean, `${c.fractal}: mean gray difference`).toBeLessThan(4);
    expect(r.over, `${c.fractal}: share of pixels more than 20 levels off`).toBeLessThan(0.03);
  }
});

test("a rotated plane keeps drawing, and the screen center is still the view center", async ({ page }) => {
  await show(page, KEY, { cx: 2.4, cy: 0.17553971307238725, scale: 0.3, rotation: 0.7 });
  const stats = colorStats(await canvasPng(page));
  expect(stats.dominant).toBeLessThan(0.85);
  expect(stats.distinct).toBeGreaterThan(300);
  await expect(page).toHaveScreenshot("sine-lplane-rotated.png");
});

test("it draws Smooth, Bands, Stripes, Orbs and Rays, and falls back to Smooth for the derivative Looks", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    window["__vt"].fractal("Sine L plane");
    for (const s of COLOR_STYLES) out[s.id] = styleDrawn(s.id, mainState);
    return out;
  });
  expect(r).toEqual({ smooth: "smooth", bands: "bands", glow: "smooth", stripes: "stripes", point: "point", cross: "cross", relief: "smooth", halo: "smooth", paper: "smooth" });
});

test("each drawable style gives a full picture", async ({ page }) => {
  for (const style of ["bands", "stripes", "point", "cross"]) {
    await page.evaluate((s) => { window["__vt"].fractal("Sine L plane"); setColorStyle({ style: s }); }, style);
    await settle(page);
    const stats = colorStats(await canvasPng(page));
    expect(stats.dominant, `${style}: not blank`).toBeLessThan(0.95);
    expect(stats.distinct, `${style}: has color`).toBeGreaterThan(60);
  }
  await page.evaluate(() => setColorStyle({ style: "smooth" }));
});

test("the Color sheet disables the derivative Looks for it, as for the other sine entries", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const f of ["Sine plane", "Sine L plane"]) {
      window["__vt"].fractal(f);
      out[f] = COLOR_STYLES.filter((s) => styleDrawn(s.id, mainState) !== s.id).map((s) => s.id);
    }
    return out;
  });
  expect(r["Sine L plane"]).toEqual(["glow", "relief", "halo", "paper"]);
  expect(r["Sine L plane"]).toEqual(r["Sine plane"]);
});

// Baselines for the styles it can draw, each in the palette its Look uses (Stripes: Glacier, Orbs: Twilight, Rays: Plasma,
// Bands: Turbo), on a view with detail (the opening view is mostly smooth color).
for (const [name, style, cm, view] of [
  ["stripes", "stripes", "Glacier", { cx: 1.2, cy: 1.0, scale: 0.5 }],
  ["orbs", "point", "Twilight", { cx: 1.2, cy: 1.0, scale: 0.5 }],
  ["rays", "cross", "Plasma", { cx: 2.4, cy: 0.17553971307238725, scale: 0.05 }],
  ["bands", "bands", "Turbo", { cx: 1.2, cy: 1.0, scale: 0.5 }],
]) {
  test(`the L-plane in ${style}`, async ({ page }) => {
    await show(page, KEY, view, cm);
    await page.evaluate((s) => setColorStyle({ style: s }), style);
    await settle(page);
    expect(colorStats(await canvasPng(page)).distinct, "has color").toBeGreaterThan(60);
    await expect(page).toHaveScreenshot(`sine-lplane-${name}.png`);
  });
}

test("its floor follows its center, and the Julia views of the same type keep the family's 1e-4", async ({ page }) => {
  const r = await page.evaluate(() => {
    const plane = (cx, cy) => minScaleFor({ ftype: FTYPE.SINE, power: 2, isJulia: false, cx, cy, scale: 1e-20 });
    const julia = (cx, cy) => minScaleFor({ ftype: FTYPE.SINE, power: 2, isJulia: true, cx, cy, scale: 1e-20 });
    const want = (r) => FLOOR_STEPS * ulp32(r) * FLOOR_PIXELS / 2;
    return { family: SINE_MIN_SCALE, near0: plane(0.1, 0.1), at08: plane(0.3, 0.8), at1: plane(1, 0), at24: plane(2.4, 0.18), at5: plane(5, 0.085), julia3: julia(3.14, 0), julia0: julia(0, 0),
      want08: want(0.8), want1: want(1), want24: want(2.4), want5: want(5), swapped: plane(0.18, 2.4) };
  });
  expect(r.near0).toBe(r.family);
  expect(r.at08).toBe(Math.max(r.family, r.want08));
  expect(r.at1).toBe(r.want1);
  expect(r.at24).toBe(r.want24);
  expect(r.at5).toBe(r.want5);
  expect(r.swapped, "the larger coordinate decides").toBe(r.at24);
  expect(r.at24).toBeGreaterThan(r.at1);
  expect(r.at5).toBeGreaterThan(r.at24);
  expect(r.julia3).toBe(r.family);
  expect(r.julia0).toBe(r.family);
});

test("the zoom stops at the floor however it is asked for: link and wheel; the info card says so", async ({ page }) => {
  await show(page, KEY, { cx: 2.4, cy: 0.17553971307238725, scale: 0.5 });
  const r = await page.evaluate(() => {
    const out = {};
    out.floor = minScaleFor({ ...mainState, scale: 1 });
    out.limited = limitScale({ ...mainState }, 1e-12);
    out.fine = limitScale({ ...mainState }, 0.5);
    const hash = buildShareHash().replace(/([&#])s=[^&]*/, "$1s=1e-9");
    applyShareLink("https://example.test/" + hash);
    out.linked = mainState.scale;
    return out;
  });
  expect(r.floor).toBeGreaterThan(1e-4);
  expect(r.limited).toBe(r.floor);
  expect(r.fine).toBe(0.5);
  expect(r.linked).toBe(r.floor);
  await settle(page);

  await page.evaluate(() => {
    const el = mainRenderer.canvas;
    const rect = el.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -2000, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
    }
  });
  await page.waitForTimeout(300);
  await settle(page);
  // (the wheel zooms about the cursor, so the center moves a little and the floor with it only if it crosses a power of two)
  expect(await page.evaluate(() => mainState.scale)).toBe(await page.evaluate(() => minScaleFor(mainState)));

  await page.evaluate(() => {
    if (document.getElementById("hud").classList.contains("hidden")) document.getElementById("hudBtn").click();
  });
  await settle(page);
  const hud = await page.evaluate(() => ({ at: atZoomLimit(mainState), text: document.getElementById("hud").textContent }));
  expect(hud.at).toBe(true);
  expect(hud.text).toContain("As deep as this fractal goes");
  expect(hud.text).toContain("float32");
  expect(colorStats(await canvasPng(page)).distinct).toBeGreaterThan(100);
});

test("the plane at its floor near |L| = 1 still draws a full picture", async ({ page }) => {
  const floor = await page.evaluate(() => minScaleFor({ ftype: FTYPE.SINE, power: 2, isJulia: false, cx: 0.3, cy: 0.99000463319974052, scale: 1 }));
  await show(page, KEY, { cx: 0.3, cy: 0.99000463319974052, scale: floor * 1.2 });
  const stats = colorStats(await canvasPng(page));
  expect(stats.dominant).toBeLessThan(0.85);
  expect(stats.distinct).toBeGreaterThan(200);
  await expect(page).toHaveScreenshot("sine-lplane-deep.png");
});

test("its five places are named, unique, above the floor at their own center, and have thumbnails", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const mine = TELEPORT_DESTINATIONS.filter((d) => d.fractal === "Sine L plane");
    const out = { labels: mine.map((d) => d.label), below: [], notUnique: [], thumbs: [], deepest: Infinity };
    for (const d of mine) {
      const f = minScaleFor({ ftype: FTYPE.SINE, power: 2, isJulia: false, cx: Number(d.re), cy: Number(d.im), scale: d.scale });
      if (d.scale < f) out.below.push(d.label);
      out.deepest = Math.min(out.deepest, d.scale / f);
      if (TELEPORT_DESTINATIONS.filter((e) => e.label === d.label).length !== 1) out.notUnique.push(d.label);
      const res = await fetch(`icons/places/${placeId(d)}.webp`);
      out.thumbs.push(res.ok);
    }
    return out;
  });
  expect(r.labels).toEqual(["Touching Discs", "Rim Bulb", "Far Copy", "Yellow Fans", "Dusty Edge"]);
  expect(r.below).toEqual([]);
  expect(r.notUnique).toEqual([]);
  expect(r.thumbs).toEqual([true, true, true, true, true]);
  expect(r.deepest, "the deepest place is not cut short, and is not far above its floor either").toBeLessThan(10);
});

test("the dual view's Julia pane is Sine Julia at L = the plane's center, and agrees with float64", async ({ page }) => {
  await page.evaluate(() => {
    window["__vt"].fractal("Sine L plane", COLORMAPS.findIndex((c) => c.name === "Grayscale"));
    setColorStyle({ style: "smooth", density: 0.25, offset: 0 });
    Object.assign(mainState, { cx: 1.5, cy: 0, scale: 3.9 });
    enterDual();
  });
  await settle(page);
  const st = await page.evaluate(() => ({ dual: dualActive, juliaC: juliaState.juliaC, isJulia: juliaState.isJulia, ftype: juliaState.ftype, cx: juliaState.cx, cy: juliaState.cy,
    scale: juliaState.scale, rotation: juliaState.rotation || 0, maxIter: juliaState.maxIter, want: FTYPE.SINE,
    floor: minScaleFor(juliaState), planeFloor: minScaleFor(mainState) }));
  expect(st.dual).toBe(true);
  expect(st.isJulia).toBe(true);
  expect(st.ftype).toBe(st.want);
  expect(st.juliaC).toEqual([1.5, 0]);
  expect(st.floor, "the Julia pane keeps the family's floor").toBe(1e-4);
  for (const pane of ["#mainCanvas", "#juliaCanvas"]) {
    expect(colorStats(await canvasPng(page, pane)).dominant, `${pane} is not one color`).toBeLessThan(0.9);
  }
  const r = await compareGrid(page, "#juliaCanvas", { kind: "julia", view: { cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation }, maxIter: st.maxIter, juliaC: st.juliaC });
  expect(r.mean, "mean gray difference of the Julia pane").toBeLessThan(4);
  expect(r.over, "share of the Julia pane's pixels more than 20 levels off").toBeLessThan(0.03);
  await page.evaluate(() => exitDual());
});

test("Sine Julia's Dual button opens the plane centered on L = 1 + 0.4i with Sine Julia in the second pane, and closes back to it", async ({ page }) => {
  await show(page, "Sine Julia", { cx: 0.5, cy: 0.25, scale: 1.2 });
  expect(await page.evaluate(() => els.dualBtn.disabled), "the Dual button is available on Sine Julia").toBe(false);
  await page.evaluate(() => els.dualBtn.click());
  await settle(page);
  const st = await page.evaluate(() => ({ name: currentName, dual: dualActive, cx: mainState.cx, cy: mainState.cy, planeScale: mainState.scale, planeBase: mainState.baseScale,
    mainIsJulia: mainState.isJulia, c: juliaState.juliaC, jIsJulia: juliaState.isJulia, jftype: juliaState.ftype, want: FTYPE.SINE,
    jscale: juliaState.scale, jcx: juliaState.cx, jcy: juliaState.cy, preset: dualPresetName() }));
  expect(st.name).toBe("Sine L plane");
  expect(st.dual).toBe(true);
  expect([st.cx, st.cy], "the plane is centered on the preset's L").toEqual([1, 0.4]);
  expect(st.planeScale).toBeCloseTo(st.planeBase / 4, 12);
  expect(st.mainIsJulia).toBe(false);
  expect(st.c).toEqual([1, 0.4]);
  expect(st.jIsJulia).toBe(true);
  expect(st.jftype).toBe(st.want);
  expect([st.jcx, st.jcy, st.jscale], "the Julia pane keeps the view Sine Julia had").toEqual([0.5, 0.25, 1.2]);
  expect(st.preset).toBe("Sine Julia");
  for (const pane of ["#mainCanvas", "#juliaCanvas"]) {
    expect(colorStats(await canvasPng(page, pane)).distinct, `${pane} has color`).toBeGreaterThan(100);
  }
  // The button again goes back to the preset it came from, in the view its pane has.
  await page.evaluate(() => els.dualBtn.click());
  await settle(page);
  const back = await page.evaluate(() => ({ name: currentName, dual: dualActive, cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, c: mainState.juliaC }));
  expect(back).toEqual({ name: "Sine Julia", dual: false, cx: 0.5, cy: 0.25, scale: 1.2, c: [1, 0.4] });
});

test("picking Sine Julia while the dual view is on opens the plane around it", async ({ page }) => {
  await show(page, KEY);
  await page.evaluate(() => { enterDual(); });
  await settle(page);
  await page.evaluate(() => selectFractal("Sine Julia"));
  await settle(page);
  const st = await page.evaluate(() => ({ name: currentName, dual: dualActive, c: juliaState.juliaC, cx: mainState.cx, cy: mainState.cy }));
  expect(st).toEqual({ name: "Sine L plane", dual: true, c: [1, 0.4], cx: 1, cy: 0.4 });
  await page.evaluate(() => exitDual());
});

test("Back and Reset work", async ({ page }) => {
  await show(page, KEY);
  const start = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }));
  await page.evaluate(() => { Object.assign(mainState, { cx: 2.4, cy: 0.17, scale: 0.01 }); requestRender(); document.getElementById("resetBtn").click(); });
  await settle(page);
  expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }))).toEqual(start);
});
