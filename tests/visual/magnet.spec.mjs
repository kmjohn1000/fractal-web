// Magnet I and II (the plane of z -> ((z^2 + c - 1) / (2z + c - 2))^2 and its cubic sibling, z from 0, c the pixel;
// renderMagnet in shaders.js): float32 only, so the zoom stops at MAGNET_MIN_SCALE. An orbit escapes, converges to the
// fixed point 1, or does neither (drawn black). Checks that both draw full, colorful pictures in their own palettes, sit
// in the picker with thumbnails, round-trip through a share link, are symmetric about the real axis, agree with a
// float64 reference of the published formulas about which pixels never end (the black ones), keep the iteration stable
// at the cusp at c = 0 where the textbook form of the formula loses every digit in float32, offer only Smooth and Bands,
// and stop at the zoom floor. The opening views and the places are also covered by app.spec.mjs's per-fractal baselines.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global MAGNET_MIN_SCALE, limitScale, atZoomLimit, mainState, mainRenderer, buildShareHash, COLORMAPS, colormapIndex,
   applyShareLink, applyAutoIter, requestRender, currentName, FTYPE, PICKER_LAYOUT, setColorStyle,
   styleDrawn, colorSheetStyles, showHud, updateHud, els */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
// name, thumbnail slug, default palette, Magnet number, a point on the boundary between an escaping bubble and the field
// that converges to 1 (found by bisection), where a zoom keeps detail.
const MAGNETS = [["Magnet I", "magnet-i", "Classic", 1, [1.5, 1.8748884094216862]], ["Magnet II", "magnet-ii", "Plasma", 2, [1.49, 1.1504434926898104]]];

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

// The view to look at: the fields given override the opening view; cm picks a palette by name.
async function showMagnet(page, name, view = {}, cm = undefined) {
  await page.evaluate(([n, v, c]) => {
    window["__vt"].fractal(n, c === undefined ? undefined : COLORMAPS.findIndex((m) => m.name === c));
    Object.assign(mainState, v);
    if (v.maxIter) mainState.iterAutoLocked = true; else applyAutoIter();
    requestRender();
  }, [name, view, cm]);
  await settle(page);
}

async function canvasPng(page) {
  const c = (await page.evaluate(() => window["__vt"].inspect())).canvas;
  return PNG.sync.read(await page.screenshot({ clip: { x: c.x, y: c.y, width: c.w, height: c.h } }));
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

// How many exact colors each cover at least 0.2% of the frame.
function majorColors(png) {
  const counts = new Map();
  for (let i = 0; i < png.data.length; i += 4) {
    const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.values()].filter((n) => n >= 0.002 * png.width * png.height).length;
}

// The share of horizontally adjacent pixel pairs that differ by a lot: a smooth picture has few, noise has many.
function roughness(png, x0, y0, x1, y1) {
  const { data, width } = png;
  let bad = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x + 1 < x1; x++) {
      const a = (y * width + x) * 4, b = a + 4;
      if (Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) > 40) bad++;
      n++;
    }
  }
  return bad / n;
}

for (const [name, slug, palette, , edge] of MAGNETS) {
  test(`${name} opens as a full, colorful picture in its own palette`, async ({ page }) => {
    await showMagnet(page, name);
    const stats = colorStats(await canvasPng(page));
    // The big black bulbs and the far field are large flat areas, but neither is most of the frame.
    expect(stats.dominant, "not a blank or flat frame").toBeLessThan(0.45);
    expect(stats.distinct, "the colormap flows (smooth counts, no banding)").toBeGreaterThan(400);
    expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe(palette);
    const v = await page.evaluate(() => ({ s: mainState.scale, b: mainState.baseScale, ftype: mainState.ftype, magnet: FTYPE.MAGNET, power: mainState.power }));
    expect(v.ftype).toBe(v.magnet);
    expect(v.s).toBe(v.b);
  });

  test(`the picker lists ${name} with the Mandelbrot family, with its thumbnail`, async ({ page }) => {
    const r = await page.evaluate(async (n) => {
      const group = PICKER_LAYOUT.flatMap((s) => s.groups).find((g) => g.keys.includes(n));
      const tile = document.querySelector(`#fractalTypeRow button[data-name="${n}"]`);
      const img = tile.querySelector("img");
      img.loading = "eager";
      await img.decode();
      return { group: group.label, keys: group.keys, text: tile.textContent.trim(), w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute("src") };
    }, name);
    expect(r.group).toBe("Mandelbrot family");
    expect(r.keys).toContain("Spider");
    expect(r.text).toBe(name);
    expect(r.src).toBe(`icons/thumbs/${slug}.webp`);
    expect(r.w).toBeGreaterThan(0);
    expect(r.w).toBe(r.h);
    await page.evaluate((n) => document.querySelector(`#fractalTypeRow button[data-name="${n}"]`).click(), name);
    await settle(page);
    expect(await page.evaluate(() => currentName)).toBe(name);
  });

  test(`a ${name} share link round-trips view, rotation and palette exactly`, async ({ page }) => {
    await showMagnet(page, name, { cx: 1.5123456789, cy: 0.4212345678, scale: 0.0123456789, rotation: 0.6 });
    const hash = await page.evaluate(() => buildShareHash());
    expect(hash).toContain(`f=${name.replace(" ", "+")}`);
    const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
    await page.evaluate(() => window["__vt"].fractal("Mandelbrot"));
    await settle(page);
    await page.evaluate((h) => applyShareLink("https://example.test/" + h), hash);
    await settle(page);
    const after = await page.evaluate(() => ({ name: currentName, cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
    expect(after.rotation).toBeCloseTo(before.rotation, 12);
    expect(after).toEqual({ name, ...before, rotation: after.rotation });
    expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe(palette);
  });

  test(`${name} is symmetric about the real axis`, async ({ page }) => {
    // The orbit of conj(c) is the conjugate of c's, so a view centered on the axis equals its top-bottom mirror.
    await showMagnet(page, name, { cy: 0 });
    const png = await canvasPng(page);
    const { width, height, data } = png;
    let bad = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = (y * width + x) * 4, b = ((height - 1 - y) * width + x) * 4;
        if (Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]) > 90) bad++;
      }
    }
    expect(bad / (width * height), "share of pixels that differ from the mirror").toBeLessThan(0.02);
  });

  test(`a rotated ${name} keeps drawing, and the screen center is still the view center`, async ({ page }) => {
    await showMagnet(page, name, { cx: edge[0], cy: edge[1], scale: 0.01, rotation: 0.7 });
    const stats = colorStats(await canvasPng(page));
    expect(stats.dominant).toBeLessThan(0.6);
    expect(stats.distinct).toBeGreaterThan(300);
    const c = await page.evaluate(() => {
      const el = mainRenderer.canvas;
      const p = window["screenToComplex"](mainRenderer, mainState, el.clientWidth / 2, el.clientHeight / 2);
      return { x: p.x, y: p.y, cx: mainState.cx, cy: mainState.cy };
    });
    expect(c.x).toBeCloseTo(c.cx, 12);
    expect(c.y).toBeCloseTo(c.cy, 12);
  });
}

// The published formulas in float64 (the textbook form, nothing rewritten), for one pixel: "escape" past |z| > 100,
// "converge" to 1, or "none" after the iteration budget. The shader works on e = z - 1 (see renderMagnet), so
// agreement here also checks that rewrite.
function reference(num, cr, ci, maxIter) {
  let zr = 0, zi = 0;
  const mul = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];
  for (let i = 0; i < maxIter; i++) {
    let a, b;
    if (num === 1) {
      const [sr, si] = mul(zr, zi, zr, zi);
      a = [sr + cr - 1, si + ci];
      b = [2 * zr + cr - 2, 2 * zi + ci];
    } else {
      const [z2r, z2i] = mul(zr, zi, zr, zi);
      const [z3r, z3i] = mul(z2r, z2i, zr, zi);
      const [k1r, k1i] = mul(cr - 1, ci, zr, zi);
      const [kr, ki] = mul(cr - 1, ci, cr - 2, ci);
      a = [z3r + 3 * k1r + kr, z3i + 3 * k1i + ki];
      const [k2r, k2i] = mul(cr - 2, ci, zr, zi);
      b = [3 * z2r + 3 * k2r + kr + 1, 3 * z2i + 3 * k2i + ki];
    }
    const d = b[0] * b[0] + b[1] * b[1];
    if (d === 0) return "escape";
    const w = [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
    if (w[0] * w[0] + w[1] * w[1] > 100) return "escape";
    [zr, zi] = mul(w[0], w[1], w[0], w[1]);
    if ((zr - 1) ** 2 + zi ** 2 < 1e-16) return "converge";
  }
  return "none";
}

for (const [name, , , num] of MAGNETS) {
  test(`${name}: the pixels the app draws black are the ones that never end in a float64 reference`, async ({ page }) => {
    // Viridis has no pure black, so a black pixel is an orbit that neither escaped nor converged.
    // (the second view is the black two-lobed shape of Magnet II on the real axis, with the edge of Magnet I's big discs;
    // a view of the dusty lace gives float32 and float64 genuinely different orbits at many pixels, so it isn't compared)
    for (const view of [{}, { cx: 1.65, cy: 0, scale: 0.35 }]) {
      await showMagnet(page, name, { ...view, maxIter: 300 }, "Viridis");
      const png = await canvasPng(page);
      const { geom } = await page.evaluate(() => {
        const el = mainRenderer.canvas;
        return { geom: { w: el.width, h: el.height, cx: mainState.cx, cy: mainState.cy, s: mainState.scale, cw: el.clientWidth, ch: el.clientHeight } };
      });
      // Pixel centers on a 64 x 64 grid over the screenshot (it is in CSS pixels), the world point from the view.
      let agree = 0, count = 0;
      for (let gy = 0; gy < 64; gy++) {
        for (let gx = 0; gx < 64; gx++) {
          const px = Math.floor(((gx + 0.5) / 64) * png.width), py = Math.floor(((gy + 0.5) / 64) * png.height);
          const u = ((px + 0.5) - 0.5 * png.width) / png.height, v = -((py + 0.5) - 0.5 * png.height) / png.height;
          const cls = reference(num, geom.cx + u * geom.s * 2, geom.cy + v * geom.s * 2, 300);
          const i = (py * png.width + px) * 4;
          const black = png.data[i] + png.data[i + 1] + png.data[i + 2] === 0;
          if ((cls === "none") === black) agree++;
          count++;
        }
      }
      expect(agree / count, `${name} ${JSON.stringify(view)}: share of sampled pixels where black matches the reference`).toBeGreaterThan(0.97);
    }
  });
}

test("Magnet II at the cusp c = 0 is smooth, not the noisy wash float32 gave with the textbook formula", async ({ page }) => {
  // Near c = 0 the numerator and denominator of the textbook Magnet II map each subtract terms of size 3 to leave c^2,
  // so float32 stalled the orbit a few 1e-5 from 1 and it never counted as converged. The shader iterates e = z - 1.
  await showMagnet(page, "Magnet II", { cx: -0.15, cy: 0, scale: 0.05, maxIter: 400 });
  const png = await canvasPng(page);
  expect(roughness(png, 0, 0, png.width, png.height), "share of rough neighbours").toBeLessThan(0.05);
  await showMagnet(page, "Magnet II", { cx: -0.15, cy: 0, scale: 0.5, maxIter: 400 });
  const wide = await canvasPng(page);
  expect(roughness(wide, 0, 0, wide.width, wide.height), "share of rough neighbours (wider view)").toBeLessThan(0.05);
});

test("the Magnets offer Smooth and Bands only, and Bands draws the same shape in fewer colors", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const f of ["Magnet I", "Magnet II"]) {
      window["__vt"].fractal(f);
      for (const style of ["smooth", "bands", "glow", "stripes", "point", "cross", "relief", "halo", "paper"]) {
        setColorStyle({ style });
        out[`${f} ${style}`] = styleDrawn(style, mainState);
      }
      out[`${f} sheet`] = colorSheetStyles();
    }
    setColorStyle({ style: "smooth" });
    return out;
  });
  for (const f of ["Magnet I", "Magnet II"]) {
    expect(r[`${f} smooth`]).toBe("smooth");
    expect(r[`${f} bands`]).toBe("bands");
    for (const style of ["glow", "stripes", "point", "cross", "relief", "halo", "paper"]) expect(r[`${f} ${style}`], `${f} ${style} draws Smooth`).toBe("smooth");
    expect(r[`${f} sheet`], `${f} gets the styles sheet`).toBe(true);
  }
  // Bands (whole-number counts) paints flat bands with hard edges: over the far field, where Smooth is a gradient, far
  // fewer colors each cover a share of the frame.
  await showMagnet(page, "Magnet I", { cx: 3.2, cy: 0, scale: 1.2 }, "Viridis");
  const smooth = majorColors(await canvasPng(page));
  await page.evaluate(() => setColorStyle({ style: "bands" }));
  await settle(page);
  const bands = majorColors(await canvasPng(page));
  await page.evaluate(() => setColorStyle({ style: "smooth" }));
  expect(bands, "whole-number counts give hard bands").toBeLessThan(smooth * 0.5);
  expect(bands).toBeGreaterThan(3);
});

test("the zoom stops at the floor for both Magnets however it is asked for, and the info card says so", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = { limit: MAGNET_MIN_SCALE };
    for (const f of ["Magnet I", "Magnet II"]) {
      window["__vt"].fractal(f);
      const hash = buildShareHash().replace(/([&#])s=[^&]*/, "$1s=1e-9");
      applyShareLink("https://example.test/" + hash);
      out[f] = mainState.scale;
    }
    out.mandelbrot = limitScale({ ftype: FTYPE.ESCAPE }, 1e-12);
    out.fine = limitScale({ ftype: FTYPE.MAGNET }, 0.5);
    return out;
  });
  expect(r.limit).toBe(2e-4);
  expect(r["Magnet I"]).toBe(r.limit);
  expect(r["Magnet II"]).toBe(r.limit);
  expect(r.mandelbrot).toBe(1e-12);
  expect(r.fine).toBe(0.5);
  // Wheel, on a view at the boundary of Magnet I's bubbles: scrolling in a long way stops at the limit.
  await showMagnet(page, "Magnet I", { cx: MAGNETS[0][4][0], cy: MAGNETS[0][4][1], scale: 0.01 });
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
  const hud = await page.evaluate(() => {
    showHud();
    updateHud(null);
    return { plain: els.hudPlain.textContent, atLimit: atZoomLimit(mainState) };
  });
  expect(hud.atLimit).toBe(true);
  expect(hud.plain).toContain("As deep as this fractal goes");
  // Still a full picture at the limit.
  const stats = colorStats(await canvasPng(page));
  expect(stats.dominant).toBeLessThan(0.8);
});
