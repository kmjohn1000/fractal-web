// The sine family (renderSineFamily in shaders.js): "Sine Julia", the Julia set of z -> L sin z for L = 1 + 0.4i, and
// "Sine plane", z -> sin z + cosh c started at z = c. Float32 only, so the zoom stops at SINE_MIN_SCALE. Checks that
// both draw, sit in the picker, round-trip through a share link, turn with the twist gesture's rotation, agree with
// a float64 iteration of the same maps (the app's pixels against this file's own copy of the math, the smooth count
// included), offer exactly the styles they can draw, and can't be zoomed past where float32 holds; the plane's dual
// view draws the plane's Julia sets. The opening views and places are also covered by app.spec.mjs's per-fractal and
// per-place baselines. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global SINE_MIN_SCALE, limitScale, atZoomLimit, mainState, juliaState, mainRenderer, buildShareHash, COLORMAPS, colormapIndex,
   applyShareLink, requestRender, currentName, FTYPE, PICKER_LAYOUT, enterDual, exitDual, dualActive, setColorStyle, styleDrawn,
   COLOR_STYLES, SAMPLE_OFFSETS, FRACTAL_CONFIGS */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";

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
const L = [1, 0.4];
const csin = (x, y) => [Math.sin(x) * Math.cosh(y), Math.cos(x) * Math.sinh(y)];
const ccosh = (x, y) => [Math.cosh(x) * Math.cos(y), Math.sinh(x) * Math.sin(y)];
const LNLN50 = Math.log(Math.log(50));
function logAbs(z) {
  const m = Math.max(Math.abs(z[0]), Math.abs(z[1]));
  return Math.log(m) + 0.5 * Math.log((z[0] / m) ** 2 + (z[1] / m) ** 2);
}
// The smooth count n of a pixel, or null when it never escapes. kind "julia": z -> L sin z; kind "plane": z -> sin z +
// cosh c with c the pixel, or juliaC when given.
function orbit(kind, p, maxIter, juliaC = null) {
  let z = [p[0], p[1]];
  const ch = kind === "plane" ? (juliaC ? ccosh(juliaC[0], juliaC[1]) : ccosh(p[0], p[1])) : null;
  let prevR2;
  for (let i = 0; i < maxIter; i++) {
    prevR2 = z[0] * z[0] + z[1] * z[1];
    const s = csin(z[0], z[1]);
    z = ch ? [s[0] + ch[0], s[1] + ch[1]] : [L[0] * s[0] - L[1] * s[1], L[0] * s[1] + L[1] * s[0]];
    if (z[0] * z[0] + z[1] * z[1] > 2500) {
      const a = Math.log(Math.max(0.5 * Math.log(Math.max(prevR2, 1)), 0.1));
      const b = Math.log(Math.max(logAbs(z), Math.log(50)));
      return { i, n: i + Math.min(1, Math.max(0, (LNLN50 - a) / Math.max(b - a, 1e-6))), loglog: i + 2 - Math.log2(Math.log2(Math.hypot(z[0], z[1]))) };
    }
  }
  return null;
}
const smoothCount = (kind, p, maxIter, juliaC = null) => orbit(kind, p, maxIter, juliaC)?.n ?? null;
// The gray a Grayscale render at Repeat 0.25 gives that count: 255 * fract(n * 0.1 * 0.25), black when it never escapes.
const grayOf = (n) => (n === null ? 0 : 255 * ((n * 0.025) % 1));

// Draws a view of `fractal` in Grayscale at Repeat 0.25, then compares a grid of its pixels with the float64 reference
// (the app averages SAMPLE_OFFSETS' 16 jittered samples, so the reference averages the same 16 grays). pane: "main" or
// "julia" (the dual view's second pane, whose state is juliaState).
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

test("both open as full, colorful pictures in the Inferno palette, whole box on screen", async ({ page }) => {
  for (const [name, ftype] of [["Sine Julia", "SINE"], ["Sine plane", "SINEPLANE"]]) {
    await show(page, name);
    const stats = colorStats(await canvasPng(page));
    // The plane's black body is a big share of the frame; neither is blank or flat.
    expect(stats.dominant, `${name}: not a blank or flat frame`).toBeLessThan(0.6);
    expect(stats.distinct, `${name}: the colormap flows (smooth count, no banding)`).toBeGreaterThan(400);
    expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Inferno");
    const v = await page.evaluate(([f]) => ({ s: mainState.scale, b: mainState.baseScale, ftype: mainState.ftype, want: FTYPE[f] }), [ftype]);
    expect(v.ftype).toBe(v.want);
    expect(v.s).toBe(v.b);
  }
});

test("the picker lists both after Nova, with their thumbnails", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const group = PICKER_LAYOUT.flatMap((s) => s.groups).find((g) => g.keys.includes("Sine Julia"));
    const out = { keys: group.keys, tiles: [] };
    for (const name of ["Sine Julia", "Sine plane"]) {
      const tile = document.querySelector(`#fractalTypeRow button[data-name="${name}"]`);
      const img = tile.querySelector("img");
      img.loading = "eager";
      await img.decode();
      out.tiles.push({ text: tile.textContent.trim(), w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute("src") });
    }
    return out;
  });
  expect(r.keys.indexOf("Sine Julia")).toBe(r.keys.indexOf("Nova") + 1);
  expect(r.keys.indexOf("Sine plane")).toBe(r.keys.indexOf("Nova") + 2);
  expect(r.tiles.map((t) => t.text)).toEqual(["Sine Julia", "Sine plane"]);
  expect(r.tiles.map((t) => t.src)).toEqual(["icons/thumbs/sine-julia.webp", "icons/thumbs/sine-plane.webp"]);
  for (const t of r.tiles) { expect(t.w).toBeGreaterThan(0); expect(t.w).toBe(t.h); }
  await page.evaluate(() => document.querySelector('#fractalTypeRow button[data-name="Sine plane"]').click());
  await settle(page);
  expect(await page.evaluate(() => currentName)).toBe("Sine plane");
});

test("the Julia entry is the Julia set for L = 1 + 0.4i, and the plane has no fixed c", async ({ page }) => {
  const r = await page.evaluate(() => {
    window["__vt"].fractal("Sine Julia");
    const julia = { isJulia: mainState.isJulia, juliaC: mainState.juliaC, dual: FRACTAL_CONFIGS["Sine Julia"].dual };
    window["__vt"].fractal("Sine plane");
    return { julia, plane: { isJulia: mainState.isJulia, dual: FRACTAL_CONFIGS["Sine plane"].dual } };
  });
  expect(r.julia).toEqual({ isJulia: true, juliaC: [1, 0.4], dual: false });
  expect(r.plane).toEqual({ isJulia: false, dual: true });
});

test("a share link round-trips view, rotation and palette exactly", async ({ page }) => {
  for (const name of ["Sine Julia", "Sine plane"]) {
    await show(page, name, { cx: -0.3151234567, cy: 0.2712345678, scale: 0.0123456789, rotation: 0.6 });
    const hash = await page.evaluate(() => buildShareHash());
    expect(decodeURIComponent(hash.replace(/\+/g, " "))).toContain(`f=${name}`);
    const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
    await page.evaluate(() => window["__vt"].fractal("Mandelbrot"));
    await settle(page);
    await page.evaluate((h) => applyShareLink("https://example.test/" + h), hash);
    await settle(page);
    const after = await page.evaluate(() => ({ name: currentName, cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
    expect(after.rotation).toBeCloseTo(before.rotation, 12);
    expect(after).toEqual({ name, ...before, rotation: after.rotation });
    expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Inferno");
  }
});

test("the pictures agree with a float64 iteration of the same maps", async ({ page }) => {
  const cases = [
    { fractal: "Sine Julia", kind: "julia", view: { cx: 0, cy: 0, scale: 2.4 }, maxIter: 100 },
    { fractal: "Sine Julia", kind: "julia", view: { cx: 3.1415927410125732, cy: 0, scale: 0.05 }, maxIter: 100 },
    { fractal: "Sine plane", kind: "plane", view: { cx: 0, cy: 0, scale: 4.4 }, maxIter: 60 },
    { fractal: "Sine plane", kind: "plane", view: { cx: 0, cy: 1.1713652610778809, scale: 0.01 }, maxIter: 100 },
    // The plane's Julia set for one c, as the dual view's second pane draws it.
    { fractal: "Sine plane", kind: "plane", view: { cx: 0, cy: 0, scale: 3 }, maxIter: 60, juliaC: [0.349609375, 1.099609375] },
  ];
  for (const c of cases) {
    const r = await compareWithFloat64(page, c);
    const tag = `${c.fractal} ${JSON.stringify(c.view)}${c.juliaC ? " Julia" : ""}`;
    // (measured about 0.2-2 mean and under 1.5% over 20 levels; the rest is float32 against double in the filaments)
    expect(r.mean, `${tag}: mean gray difference`).toBeLessThan(4);
    expect(r.over, `${tag}: share of pixels more than 20 levels off`).toBeLessThan(0.03);
  }
});

test("the smooth count has no jump at an iteration band's edge (float64: the count the shader implements)", async () => {
  // Walk fine lines through the plane, find every place where the escape iteration changes by one, bisect it onto the
  // edge and look at the jump of the smooth count there. The count the shader draws (the crossing of the bailout circle,
  // placed in ln ln |z| across the last step) meets itself at most edges; the log-log count of the polynomial maps
  // (i + 2 - log2 log2 |z|) jumps by about 2 at nearly all of them, which is why it is not used.
  let edges = 0, joined = 0, loglogJoined = 0;
  for (const [p0, dir, len] of [[[-1, 2.3], [1, 0], 2.4], [[0.5, 1.5], [0, 1], 2]]) {
    const at = (t) => orbit("plane", [p0[0] + dir[0] * t, p0[1] + dir[1] * t], 200);
    const STEPS = 30000;
    let prev = null, prevT = 0;
    for (let k = 0; k <= STEPS; k++) {
      const t = (k / STEPS) * len;
      const r = at(t);
      if (prev && r && Math.abs(r.i - prev.i) === 1) {
        let lo = prevT, hi = t, rl = prev, rh = r;
        for (let b = 0; b < 40; b++) {
          const m = (lo + hi) / 2, rm = at(m);
          if (rm && rm.i === rl.i) { lo = m; rl = rm; } else if (rm && rm.i === rh.i) { hi = m; rh = rm; } else break;
        }
        edges++;
        if (Math.abs(rh.n - rl.n) < 0.01) joined++;
        if (Math.abs(rh.loglog - rl.loglog) < 0.01) loglogJoined++;
      }
      prev = r; prevT = t;
    }
  }
  expect(edges, "edges found").toBeGreaterThan(100);
  expect(joined / edges, "share of edges the shader's count meets").toBeGreaterThan(0.65);
  expect(loglogJoined / edges, "share of edges the log-log count meets").toBeLessThan(0.05);
});

test("the twist rotation is wired: a turned view agrees with float64 turned the same way", async ({ page }) => {
  for (const c of [
    { fractal: "Sine Julia", kind: "julia", view: { cx: 0.5, cy: 0.25, scale: 1.2, rotation: 0.7 }, maxIter: 100 },
    { fractal: "Sine plane", kind: "plane", view: { cx: 0, cy: 1.1713652610778809, scale: 0.4, rotation: -1.1 }, maxIter: 100 },
  ]) {
    const r = await compareWithFloat64(page, c);
    expect(r.mean, `${c.fractal}: mean gray difference`).toBeLessThan(4);
    expect(r.over, `${c.fractal}: share of pixels more than 20 levels off`).toBeLessThan(0.03);
  }
});

test("a rotated Sine plane keeps drawing, and the screen center is still the view center", async ({ page }) => {
  await show(page, "Sine plane", { cx: 0, cy: 1.1713652610778809, scale: 0.3, rotation: 0.7 });
  const stats = colorStats(await canvasPng(page));
  expect(stats.dominant).toBeLessThan(0.85);
  expect(stats.distinct).toBeGreaterThan(300);
  await expect(page).toHaveScreenshot("sine-plane-rotated.png");
});

test("both draw Smooth, Bands, Stripes, Orbs and Rays, and fall back to Smooth for the derivative Looks", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const f of ["Sine Julia", "Sine plane"]) {
      window["__vt"].fractal(f);
      out[f] = {};
      for (const s of COLOR_STYLES) out[f][s.id] = styleDrawn(s.id, mainState);
    }
    return out;
  });
  const want = { smooth: "smooth", bands: "bands", glow: "smooth", stripes: "stripes", point: "point", cross: "cross", relief: "smooth", halo: "smooth", paper: "smooth" };
  expect(r).toEqual({ "Sine Julia": want, "Sine plane": want });
});

test("each drawable style gives a full picture on both", async ({ page }) => {
  for (const fractal of ["Sine Julia", "Sine plane"]) {
    for (const style of ["bands", "stripes", "point", "cross"]) {
      await page.evaluate(([f, s]) => { window["__vt"].fractal(f); setColorStyle({ style: s }); }, [fractal, style]);
      await settle(page);
      const stats = colorStats(await canvasPng(page));
      expect(stats.dominant, `${fractal} ${style}: not blank`).toBeLessThan(0.95);
      expect(stats.distinct, `${fractal} ${style}: has color`).toBeGreaterThan(60);
    }
  }
  await page.evaluate(() => setColorStyle({ style: "smooth" }));
});

// Baselines for the styles it can draw, each in the palette its Look uses (Stripes: Glacier, Orbs and Rays: Plasma,
// Bands: Turbo), on a view with detail (the opening views are mostly smooth color).
for (const [name, fractal, style, cm, view] of [
  ["stripes-julia", "Sine Julia", "stripes", "Glacier", { cx: 0, cy: 0, scale: 0.9 }],
  ["stripes-plane", "Sine plane", "stripes", "Glacier", { cx: 0, cy: 1.17, scale: 0.4 }],
  ["orbs-julia", "Sine Julia", "point", "Twilight", { cx: 0, cy: 0, scale: 0.9 }],
  ["rays-plane", "Sine plane", "cross", "Plasma", { cx: 0, cy: 1.17, scale: 0.4 }],
  ["bands-julia", "Sine Julia", "bands", "Turbo", { cx: 0, cy: 0, scale: 0.9 }],
]) {
  test(`${fractal} in ${style}`, async ({ page }) => {
    await show(page, fractal, view, cm);
    await page.evaluate((s) => setColorStyle({ style: s }), style);
    await settle(page);
    expect(colorStats(await canvasPng(page)).distinct, "has color").toBeGreaterThan(60);
    await expect(page).toHaveScreenshot(`sine-${name}.png`);
  });
}

test("the zoom stops at the limit however it is asked for: link and wheel; the info card says so", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = { limit: SINE_MIN_SCALE };
    out.mandelbrot = limitScale({ ftype: FTYPE.ESCAPE }, 1e-12);
    out.julia = limitScale({ ftype: FTYPE.SINE }, 1e-12);
    out.plane = limitScale({ ftype: FTYPE.SINEPLANE }, 1e-12);
    out.fine = limitScale({ ftype: FTYPE.SINE }, 0.5);
    window["__vt"].fractal("Sine Julia");
    const hash = buildShareHash().replace(/([&#])s=[^&]*/, "$1s=1e-9");
    applyShareLink("https://example.test/" + hash);
    out.linked = mainState.scale;
    return out;
  });
  expect(r.limit).toBe(1e-4);
  expect(r.mandelbrot).toBe(1e-12);
  expect(r.julia).toBe(r.limit);
  expect(r.plane).toBe(r.limit);
  expect(r.fine).toBe(0.5);
  expect(r.linked).toBe(r.limit);
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
  expect(await page.evaluate(() => mainState.scale)).toBe(r.limit);

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

test("Sine Julia at the zoom limit, near a spiral's eye at pi", async ({ page }) => {
  await show(page, "Sine Julia", { cx: 3.1415927410125732, cy: 0, scale: 1.5e-4 });
  const stats = colorStats(await canvasPng(page));
  expect(stats.dominant).toBeLessThan(0.5);
  expect(stats.distinct).toBeGreaterThan(300);
  await expect(page).toHaveScreenshot("sine-julia-deep.png");
});

test("the plane's dual view draws its Julia sets: both panes full, and the Julia pane agrees with float64", async ({ page }) => {
  await show(page, "Sine plane", { cx: 0.349609375, cy: 1.099609375, scale: 1.5 });
  await page.evaluate(() => { window["__vt"].fractal("Sine plane", COLORMAPS.findIndex((c) => c.name === "Grayscale")); setColorStyle({ style: "smooth", density: 0.25, offset: 0 }); Object.assign(mainState, { cx: 0.349609375, cy: 1.099609375, scale: 1.5 }); enterDual(); });
  await settle(page);
  const st = await page.evaluate(() => ({ dual: dualActive, juliaC: juliaState.juliaC, isJulia: juliaState.isJulia, ftype: juliaState.ftype, cx: juliaState.cx, cy: juliaState.cy,
    scale: juliaState.scale, rotation: juliaState.rotation || 0, maxIter: juliaState.maxIter, want: FTYPE.SINEPLANE }));
  expect(st.dual).toBe(true);
  expect(st.isJulia).toBe(true);
  expect(st.ftype).toBe(st.want);
  expect(st.juliaC).toEqual([0.349609375, 1.099609375]);
  for (const pane of ["#mainCanvas", "#juliaCanvas"]) {
    expect(colorStats(await canvasPng(page, pane)).dominant, `${pane} is not one color`).toBeLessThan(0.9);
  }
  const r = await compareGrid(page, "#juliaCanvas", { kind: "plane", view: { cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation }, maxIter: st.maxIter, juliaC: st.juliaC });
  expect(r.mean, "mean gray difference of the Julia pane").toBeLessThan(4);
  expect(r.over, "share of the Julia pane's pixels more than 20 levels off").toBeLessThan(0.03);
  await page.evaluate(() => exitDual());
});

test("Back and Reset work on the sine family", async ({ page }) => {
  await show(page, "Sine plane");
  const start = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }));
  await page.evaluate(() => { Object.assign(mainState, { cx: 0, cy: 1.17, scale: 0.01 }); requestRender(); document.getElementById("resetBtn").click(); });
  await settle(page);
  expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }))).toEqual(start);
});
