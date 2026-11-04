// Spider (z <- z^2 + c, then c <- z + c/2, from z = c = the pixel; the escape-time branch of renderEscapeFast in
// shaders.js): float32 only, so the zoom stops at the floor minScaleFor gives it (SPIDER_MIN_SCALE, or two float32 steps
// of the view's center per pixel). Checks that it draws and agrees with a float64 reference, sits in the picker, round-trips
// through a share link, turns with the twist gesture's rotation, offers only the Looks it can draw, cannot be zoomed past
// its floor, and has no dual view. The default view and the places are also covered by app.spec.mjs's baselines.
// Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global minScaleFor, limitScale, atZoomLimit, mainState, mainRenderer, buildShareHash, COLORMAPS, colormapIndex,
   applyShareLink, applyAutoIter, requestRender, screenToComplex, currentName, FTYPE, PICKER_LAYOUT, commitBoxZoom, els,
   pushHistory, popHistory, setColorStyle, colorStyleFor, TELEPORT_DESTINATIONS, SPIDER_MIN_SCALE */

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
  await page.evaluate(() => new Promise((requestFrame) => requestAnimationFrame(() => requestAnimationFrame(requestFrame))));
}

// The Spider view to look at: the fields given override the opening view.
async function showSpider(page, view = {}) {
  await page.evaluate((v) => {
    window["__vt"].fractal("Spider");
    Object.assign(mainState, v);
    applyAutoIter();
    requestRender();
  }, view);
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

// The spiral eye on the upper arm: a boundary with detail at every scale down to the floor.
const EYE = { cx: -0.3371, cy: 1.1738 };

test("Spider opens as a full, colorful picture in its own palette", async ({ page }) => {
  await showSpider(page);
  const stats = colorStats(await canvasPng(page));
  // The black body is about a quarter of the frame and the smooth field around it is graded, so no one shade dominates.
  expect(stats.dominant, "not a blank or flat frame").toBeLessThan(0.45);
  expect(stats.distinct, "the colormap flows (smooth count, no banding)").toBeGreaterThan(300);
  expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Turbo");
  const v = await page.evaluate(() => ({ s: mainState.scale, b: mainState.baseScale, ftype: mainState.ftype, spider: FTYPE.SPIDER, julia: mainState.isJulia }));
  expect(v.ftype).toBe(v.spider);
  expect(v.julia).toBe(false);
  expect(v.s).toBe(v.b);
});

test("the opening view agrees with a float64 reference on which pixels never escape", async ({ page }) => {
  await showSpider(page);
  const png = await canvasPng(page);
  const samples = await page.evaluate(() => {
    const el = mainRenderer.canvas;
    const out = [];
    const N = 36;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const sx = ((i + 0.5) / N) * el.clientWidth, sy = ((j + 0.5) / N) * el.clientHeight;
        const p = screenToComplex(mainRenderer, mainState, sx, sy);
        // The reference: z = c = the pixel; z <- z^2 + c, then c <- z + c/2; escape past |z| = 256 (the shader's radius).
        let zr = p.x, zi = p.y, cr = p.x, ci = p.y, escaped = false;
        for (let k = 0; k < mainState.maxIter; k++) {
          const nr = zr * zr - zi * zi + cr, ni = 2 * zr * zi + ci;
          zr = nr; zi = ni;
          cr = zr + 0.5 * cr; ci = zi + 0.5 * ci;
          if (zr * zr + zi * zi > 65536) { escaped = true; break; }
        }
        out.push({ fx: (i + 0.5) / N, fy: (j + 0.5) / N, interior: !escaped });
      }
    }
    return out;
  });
  let agree = 0, interior = 0;
  for (const s of samples) {
    const x = Math.min(png.width - 1, Math.floor(s.fx * png.width)), y = Math.min(png.height - 1, Math.floor(s.fy * png.height));
    const i = (y * png.width + x) * 4;
    const black = png.data[i] + png.data[i + 1] + png.data[i + 2] === 0;
    if (black === s.interior) agree++;
    if (s.interior) interior++;
  }
  expect(interior / samples.length, "the body is a real share of the frame").toBeGreaterThan(0.1);
  expect(agree / samples.length, "share of sample points the app and the reference agree on").toBeGreaterThan(0.97);
});

test("the picker lists Spider with the Mandelbrot family, with its thumbnail", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const group = PICKER_LAYOUT.flatMap((s) => s.groups).find((g) => g.keys.includes("Spider"));
    const tile = document.querySelector('#fractalTypeRow button[data-name="Spider"]');
    const img = tile.querySelector("img");
    img.loading = "eager";
    await img.decode();
    return { group: group.label, keys: group.keys, text: tile.textContent.trim(), w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute("src") };
  });
  expect(r.group).toBe("Mandelbrot family");
  expect(r.keys).toContain("Phoenix");
  expect(r.text).toBe("Spider");
  expect(r.src).toBe("icons/thumbs/spider.webp");
  expect(r.w).toBeGreaterThan(0);
  expect(r.w).toBe(r.h);
  await page.evaluate(() => document.querySelector('#fractalTypeRow button[data-name="Spider"]').click());
  await settle(page);
  expect(await page.evaluate(() => currentName)).toBe("Spider");
});

test("a Spider share link round-trips view, rotation and palette exactly", async ({ page }) => {
  await showSpider(page, { cx: -0.3151234567, cy: 0.9712345678, scale: 0.0523456789, rotation: 0.6 });
  const hash = await page.evaluate(() => buildShareHash());
  expect(hash).toContain("f=Spider");
  const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
  await page.evaluate(() => window["__vt"].fractal("Mandelbrot"));
  await settle(page);
  await page.evaluate((h) => applyShareLink("https://example.test/" + h), hash);
  await settle(page);
  const after = await page.evaluate(() => ({ name: currentName, cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
  // (the parser wraps the rotation into (-pi, pi], which can move its last digit)
  expect(after.rotation).toBeCloseTo(before.rotation, 12);
  expect(after).toEqual({ name: "Spider", ...before, rotation: after.rotation });
  expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Turbo");
});

test("a half turn draws the mirror image (Spider is symmetric about the real axis)", async ({ page }) => {
  await showSpider(page, { cx: -0.6, cy: 0 });
  const plain = await canvasPng(page);
  await showSpider(page, { cx: -0.6, cy: 0, rotation: Math.PI });
  const turned = await canvasPng(page);
  // Rotating by pi maps (x, y) to (-x, -y) about the center; with the symmetry c -> conj(c) that is the left-right mirror.
  const { width, height } = plain;
  let bad = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = (y * width + x) * 4, b = (y * width + (width - 1 - x)) * 4;
      const d = Math.abs(plain.data[a] - turned.data[b]) + Math.abs(plain.data[a + 1] - turned.data[b + 1]) + Math.abs(plain.data[a + 2] - turned.data[b + 2]);
      if (d > 90) bad++;
    }
  }
  expect(bad / (width * height), "share of pixels that differ from the mirror").toBeLessThan(0.03);
});

test("a rotated Spider keeps drawing, and the screen center is still the view center", async ({ page }) => {
  await showSpider(page, { ...EYE, scale: 0.02, rotation: 0.7 });
  const stats = colorStats(await canvasPng(page));
  expect(stats.dominant).toBeLessThan(0.6);
  expect(stats.distinct).toBeGreaterThan(300);
  const c = await page.evaluate(() => {
    const el = mainRenderer.canvas;
    const p = screenToComplex(mainRenderer, mainState, el.clientWidth / 2, el.clientHeight / 2);
    return { x: p.x, y: p.y, cx: mainState.cx, cy: mainState.cy };
  });
  expect(c.x).toBeCloseTo(c.cx, 12);
  expect(c.y).toBeCloseTo(c.cy, 12);
  await expect(page).toHaveScreenshot("spider-rotated.png");
});

test("Spider offers Smooth, Bands, Stripes, Orbs and Rays, and draws the derivative Looks as Smooth", async ({ page }) => {
  const r = await page.evaluate(() => {
    window["__vt"].fractal("Spider");
    const out = {};
    for (const id of ["smooth", "bands", "stripes", "point", "cross", "glow", "relief", "halo", "paper"]) {
      setColorStyle({ style: id });
      const c = colorStyleFor(mainState);
      out[id] = `${c.glsl}/${c.variant}`;
    }
    return out;
  });
  expect(r).toEqual({ smooth: "0/0", bands: "1/0", stripes: "3/2", point: "4/3", cross: "5/3",
    glow: "0/0", relief: "0/0", halo: "0/0", paper: "0/0" });
});

test("the Color sheet says which Looks Spider can't draw", async ({ page }) => {
  await page.evaluate(() => window["__vt"].fractal("Spider"));
  await settle(page);
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheetNote-looks")).toContainText("Edge glow, Relief, Halo and Paper cut aren't available for Spider.");
  await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
  const states = await page.locator('#colorSheet [aria-label="Style"] [role="radio"]').evaluateAll((els) => els.map((e) => !e.disabled));
  // Smooth, Bands, Edge glow, Stripes, Orbs, Rays, Relief, Halo, Paper cut
  expect(states).toEqual([true, true, false, true, true, true, false, false, false]);
});

test("Spider has no dual view", async ({ page }) => {
  await showSpider(page);
  expect(await page.evaluate(() => els.dualBtn.disabled)).toBe(true);
});

test("every Spider place is at or above the zoom floor at its own center", async ({ page }) => {
  const r = await page.evaluate(() => TELEPORT_DESTINATIONS.filter((d) => d.fractal === "Spider").map((d) => ({
    label: d.label, scale: d.scale, floor: minScaleFor({ ftype: FTYPE.SPIDER, cx: Number(d.re), cy: Number(d.im), scale: d.scale }),
  })));
  expect(r.length).toBeGreaterThanOrEqual(3);
  for (const p of r) expect(p.scale, `${p.label} is not deeper than the floor`).toBeGreaterThanOrEqual(p.floor);
});

test("the zoom stops at the floor however it is asked for: link, wheel, box and keys", async ({ page }) => {
  await showSpider(page, { ...EYE, scale: 0.02 });
  const limit = await page.evaluate(() => minScaleFor(mainState));
  expect(limit).toBeGreaterThanOrEqual(await page.evaluate(() => SPIDER_MIN_SCALE));
  const r = await page.evaluate(() => {
    const out = {};
    // limitScale only touches Spider here.
    out.mandelbrot = limitScale({ ftype: FTYPE.ESCAPE, cx: -0.3371, cy: 1.1738 }, 1e-12);
    out.spider = limitScale({ ftype: FTYPE.SPIDER, cx: -0.3371, cy: 1.1738 }, 1e-12);
    out.spiderFine = limitScale({ ftype: FTYPE.SPIDER, cx: -0.3371, cy: 1.1738 }, 0.5);
    // A link made by hand deeper than the floor opens at the floor.
    const hash = buildShareHash().replace(/([&#])s=[^&]*/, "$1s=1e-9");
    applyShareLink("https://example.test/" + hash);
    out.linked = mainState.scale;
    return out;
  });
  expect(r.mandelbrot).toBe(1e-12);
  expect(r.spider).toBe(limit);
  expect(r.spiderFine).toBe(0.5);
  expect(r.linked).toBe(limit);
  await settle(page);

  // Wheel: scrolling in a long way stops at the floor (a WheelEvent sent to the canvas: mobile WebKit has no mouse wheel).
  await page.evaluate(() => {
    const el = mainRenderer.canvas;
    const rect = el.getBoundingClientRect();
    for (let i = 0; i < 6; i++) {
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: -2000, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, cancelable: true }));
    }
  });
  await page.waitForTimeout(300);
  await settle(page);
  expect(await page.evaluate(() => mainState.scale)).toBe(limit);

  // Box zoom: a tiny box at the floor stays there.
  const boxed = await page.evaluate(() => {
    els.boxZoomBtn.click();
    const rect = mainRenderer.canvas.getBoundingClientRect();
    els.boxRect.style.left = `${rect.left + 100}px`;
    els.boxRect.style.top = `${rect.top + 100}px`;
    els.boxRect.style.width = "12px";
    els.boxRect.style.height = "12px";
    els.boxRect.classList.remove("hidden");
    els.boxRect.dataset.pane = "main";
    commitBoxZoom("main", mainState, mainRenderer, mainRenderer.canvas);
    return mainState.scale;
  });
  expect(boxed).toBe(limit);

  // Keys: "+" at the floor goes nowhere, and "-" backs out of it.
  await page.evaluate(() => { for (let i = 0; i < 5; i++) document.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true })); });
  expect(await page.evaluate(() => mainState.scale)).toBe(limit);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true })));
  expect(await page.evaluate(() => mainState.scale)).toBeCloseTo(limit * 1.25, 12);
  await page.evaluate(({ eye, limit }) => { Object.assign(mainState, eye, { scale: limit }); requestRender(); }, { eye: EYE, limit });
  await settle(page);

  // At the floor the info card says so, and what it draws is still a picture.
  await page.evaluate(() => {
    if (document.getElementById("hud").classList.contains("hidden")) document.getElementById("hudBtn").click();
  });
  await settle(page);
  const hud = await page.evaluate(() => ({ at: atZoomLimit(mainState), text: document.getElementById("hud").textContent }));
  expect(hud.at).toBe(true);
  expect(hud.text).toContain("As deep as this fractal goes");
  expect(hud.text).toContain("zoom limit");
  expect(colorStats(await canvasPng(page)).distinct).toBeGreaterThan(100);
});

test("Back and Reset work on Spider", async ({ page }) => {
  await showSpider(page);
  const start = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }));
  await page.evaluate(() => { pushHistory("main"); Object.assign(mainState, { cx: -0.3, cy: 1.17, scale: 0.01 }); applyAutoIter(); requestRender(); });
  await settle(page);
  await page.evaluate(() => popHistory("main"));
  await settle(page);
  expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }))).toEqual(start);
  await page.evaluate(() => { Object.assign(mainState, { cx: -0.3, cy: 1.17, scale: 0.01 }); requestRender(); document.getElementById("resetBtn").click(); });
  await settle(page);
  expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }))).toEqual(start);
});
