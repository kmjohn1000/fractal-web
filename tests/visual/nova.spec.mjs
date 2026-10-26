// Nova (Newton's method for z^3 - 1 plus the pixel's c, started at z = 1; renderNova
// in shaders.js): float32 only, so the zoom stops at NOVA_MIN_SCALE. Checks that it
// draws, sits in the picker, round-trips through a share link, turns with the twist
// gesture's rotation, and cannot be zoomed past where float32 holds. The default view
// is also covered by app.spec.mjs's per-fractal baselines. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global NOVA_MIN_SCALE, limitScale, atZoomLimit, mainState, mainRenderer, buildShareHash, COLORMAPS, colormapIndex,
   applyShareLink, applyAutoIter, requestRender, screenToComplex, currentName, FTYPE, PICKER_LAYOUT, commitBoxZoom, els,
   pushHistory, popHistory */

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

// The Nova view to look at: the fields given override the opening view.
async function showNova(page, view = {}) {
  await page.evaluate((v) => {
    window["__vt"].fractal("Nova");
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

// The deep views look at the boundary of the crescent's upper hook.
const BOUNDARY = { cx: -0.32275, cy: 0.27357 };

test("Nova opens as a full, colorful picture in its own palette", async ({ page }) => {
  await showNova(page);
  const stats = colorStats(await canvasPng(page));
  // Most of the plane settles smoothly, so one shade is a good share of the frame, but never most of it.
  expect(stats.dominant, "not a blank or flat frame").toBeLessThan(0.3);
  expect(stats.distinct, "the colormap flows (smooth count, no banding)").toBeGreaterThan(400);
  expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Classic");
  // The crescent opens in view: the fractal's whole box is on screen.
  const v = await page.evaluate(() => ({ s: mainState.scale, b: mainState.baseScale, ftype: mainState.ftype, nova: FTYPE.NOVA }));
  expect(v.ftype).toBe(v.nova);
  expect(v.s).toBe(v.b);
});

test("the picker lists Nova beside Newton's method, with its thumbnail", async ({ page }) => {
  const r = await page.evaluate(async () => {
    const group = PICKER_LAYOUT.flatMap((s) => s.groups).find((g) => g.keys.includes("Nova"));
    const tile = document.querySelector('#fractalTypeRow button[data-name="Nova"]');
    const img = tile.querySelector("img");
    img.loading = "eager";
    await img.decode();
    return { group: group.label, keys: group.keys, text: tile.textContent.trim(), w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute("src") };
  });
  expect(r.keys).toContain("Newton z³");
  expect(r.text).toBe("Nova");
  expect(r.src).toBe("icons/thumbs/nova.webp");
  expect(r.w).toBeGreaterThan(0);
  expect(r.w).toBe(r.h);
  // Picking the tile opens Nova.
  await page.evaluate(() => document.querySelector('#fractalTypeRow button[data-name="Nova"]').click());
  await settle(page);
  expect(await page.evaluate(() => currentName)).toBe("Nova");
});

test("a Nova share link round-trips view, rotation and palette exactly", async ({ page }) => {
  await showNova(page, { cx: -0.3151234567, cy: 0.2712345678, scale: 0.0123456789, rotation: 0.6 });
  const hash = await page.evaluate(() => buildShareHash());
  expect(hash).toContain("f=Nova");
  const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
  await page.evaluate(() => window["__vt"].fractal("Mandelbrot"));
  await settle(page);
  await page.evaluate((h) => applyShareLink("https://example.test/" + h), hash);
  await settle(page);
  const after = await page.evaluate(() => ({ name: currentName, cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, maxIter: mainState.maxIter }));
  // (the parser wraps the rotation into (-pi, pi], which can move its last digit)
  expect(after.rotation).toBeCloseTo(before.rotation, 12);
  expect(after).toEqual({ name: "Nova", ...before, rotation: after.rotation });
  expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Classic");
});

test("a half turn draws the mirror image (Nova is symmetric about the real axis)", async ({ page }) => {
  await showNova(page, { cx: 0.1, cy: 0 });
  const plain = await canvasPng(page);
  await showNova(page, { cx: 0.1, cy: 0, rotation: Math.PI });
  const turned = await canvasPng(page);
  // Rotating by pi maps (x, y) to (-x, -y); with the symmetry c -> conj(c) that is the left-right mirror.
  const { width, height } = plain;
  let bad = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = (y * width + x) * 4, b = (y * width + (width - 1 - x)) * 4;
      const d = Math.abs(plain.data[a] - turned.data[b]) + Math.abs(plain.data[a + 1] - turned.data[b + 1]) + Math.abs(plain.data[a + 2] - turned.data[b + 2]);
      if (d > 90) bad++;
    }
  }
  expect(bad / (width * height), "share of pixels that differ from the mirror").toBeLessThan(0.02);
});

test("a rotated Nova keeps drawing, and the screen center is still the view center", async ({ page }) => {
  await showNova(page, { ...BOUNDARY, scale: 0.02, rotation: 0.7 });
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
  await expect(page).toHaveScreenshot("nova-rotated.png");
});

test("Nova draws sharp detail down to its zoom limit, and the picture is still there at it", async ({ page }) => {
  await showNova(page, { ...BOUNDARY, scale: 5e-5 });
  const deep = colorStats(await canvasPng(page));
  expect(deep.dominant).toBeLessThan(0.5);
  expect(deep.distinct).toBeGreaterThan(300);
  await expect(page).toHaveScreenshot("nova-deep.png");
});

test("the zoom stops at the limit however it is asked for: link, wheel, box and keys", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = { limit: NOVA_MIN_SCALE };
    // limitScale only touches Nova.
    out.mandelbrot = limitScale({ ftype: FTYPE.ESCAPE }, 1e-12);
    out.nova = limitScale({ ftype: FTYPE.NOVA }, 1e-12);
    out.novaFine = limitScale({ ftype: FTYPE.NOVA }, 0.5);
    // A link made by hand deeper than the limit opens at the limit.
    window["__vt"].fractal("Nova");
    const hash = buildShareHash().replace(/([&#])s=[^&]*/, "$1s=1e-9");
    applyShareLink("https://example.test/" + hash);
    out.linked = mainState.scale;
    return out;
  });
  expect(r.mandelbrot).toBe(1e-12);
  expect(r.nova).toBe(r.limit);
  expect(r.novaFine).toBe(0.5);
  expect(r.linked).toBe(r.limit);
  await settle(page);

  // Wheel: scrolling in a long way stops at the limit.
  // (a WheelEvent sent to the canvas: mobile WebKit has no mouse wheel to drive)
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

  // Box zoom: a tiny box at the limit stays there.
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
  expect(boxed).toBe(r.limit);

  // Keys: "+" at the limit goes nowhere, and "-" backs out of it.
  await page.evaluate(() => { for (let i = 0; i < 5; i++) document.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true })); });
  expect(await page.evaluate(() => mainState.scale)).toBe(r.limit);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true })));
  expect(await page.evaluate(() => mainState.scale)).toBeCloseTo(r.limit * 1.25, 12);
  // (Look at the boundary, where there is detail: the opening view's center is a smooth gradient, which
  // at the limit draws a plain picture with fewer colors but isn't broken.)
  await page.evaluate(({ boundary, limit }) => { Object.assign(mainState, boundary, { scale: limit }); requestRender(); }, { boundary: BOUNDARY, limit: r.limit });
  await settle(page);

  // At the limit the info card says so, and what it draws is still a picture.
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

test("Back and Reset work on Nova", async ({ page }) => {
  await showNova(page);
  const start = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }));
  await page.evaluate(() => { pushHistory("main"); Object.assign(mainState, { cx: -0.3, cy: 0.27, scale: 0.01 }); applyAutoIter(); requestRender(); });
  await settle(page);
  await page.evaluate(() => popHistory("main"));
  await settle(page);
  expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }))).toEqual(start);
  await page.evaluate(() => { Object.assign(mainState, { cx: -0.3, cy: 0.27, scale: 0.01 }); requestRender(); document.getElementById("resetBtn").click(); });
  await settle(page);
  expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }))).toEqual(start);
});
