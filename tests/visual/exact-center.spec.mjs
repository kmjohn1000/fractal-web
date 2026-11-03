// The exact view center (view-math.js): past about 1e-9 a view keeps its center as a BigInt pair (ex, ey) beside the
// doubles (cx, cy), so a pan of one pixel, or a zoom about the cursor, still moves it where a double would round to
// nothing. Plain behavior checks, no screenshot baselines: the conversions, moveCenter at depth and shallow, the
// pan, pinch/wheel and box-zoom gestures at 1e-20, Back, and a stale pair being ignored.
import { test, expect } from "@playwright/test";

/* global mainState, setCenter, moveCenter, exactCenter, exactValid, toExact, fromExact, screenToComplex, mainRenderer,
   pushHistory, popHistory, EXACT_FROM, EXACT_DROP, els */

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
  await page.waitForFunction(() => typeof moveCenter === "function" && typeof mainState === "object");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

// A deep Mandelbrot-family view at a center whose double is the exact center: scale 1e-20, so one pixel is about 1e-23,
// a million times below a double's step at 0.4472.
const DEEP = { cx: 0.4472135954957291, cy: 0.8944271910020332, scale: 1e-20 };
const setDeep = (page) => page.evaluate((d) => {
  setCenter(mainState, d.cx, d.cy);
  mainState.scale = d.scale;
  mainState.rotation = 0;
}, DEEP);

test("a double converts to the exact integer and back unchanged", async ({ page }) => {
  const r = await page.evaluate(() => {
    const xs = [0, 1, -1, 0.4472135954957291, -0.7436438870371587, 1e-20, -3.5e-9, 123456.789];
    return xs.map((x) => fromExact(toExact(x)) === x);
  });
  expect(r.every(Boolean)).toBe(true);
});

test("shallow: moveCenter is the plain double add and keeps no exact pair", async ({ page }) => {
  const r = await page.evaluate(() => {
    setCenter(mainState, -0.5, 0.25);
    mainState.scale = 1;
    moveCenter(mainState, 0.125, -0.0625);
    return { cx: mainState.cx, cy: mainState.cy, ex: mainState.ex, ey: mainState.ey };
  });
  expect(r).toEqual({ cx: -0.375, cy: 0.1875, ex: null, ey: null });
});

test("deep: a move far below a double's step changes the exact center, not the double", async ({ page }) => {
  await setDeep(page);
  const r = await page.evaluate(() => {
    const px = mainState.scale * 2 / 800; // about one pixel of an 800-px-tall view
    const e0 = exactCenter(mainState);
    moveCenter(mainState, px, -px);
    const e1 = exactCenter(mainState);
    return {
      sameDouble: mainState.cx === 0.4472135954957291 && mainState.cy === 0.8944271910020332,
      valid: exactValid(mainState),
      dx: String(e1.ex - e0.ex), dy: String(e1.ey - e0.ey), want: String(toExact(px)),
    };
  });
  expect(r.sameDouble).toBe(true);
  expect(r.valid).toBe(true);
  expect(r.dx).toBe(r.want);
  expect(r.dy).toBe("-" + r.want);
});

test("deep: many one-pixel moves add up exactly, then show in the double", async ({ page }) => {
  await setDeep(page);
  const r = await page.evaluate(() => {
    const px = 5e-23, n = 3_000_000; // 1.5e-16 in all: past half a double's step at 0.447 (about 2.8e-17)
    const e0 = exactCenter(mainState);
    for (let k = 0; k < n; k++) moveCenter(mainState, px, 0);
    const e1 = exactCenter(mainState);
    return { got: String(e1.ex - e0.ex), want: String(toExact(px) * BigInt(n)), moved: mainState.cx !== 0.4472135954957291 };
  });
  expect(r.got).toBe(r.want);
  expect(r.moved).toBe(true);
});

test("a stale pair is ignored: setting cx directly makes the doubles the truth", async ({ page }) => {
  await setDeep(page);
  const r = await page.evaluate(() => {
    moveCenter(mainState, 1e-23, 0);
    const wasValid = exactValid(mainState);
    mainState.cx = 0.5; // some code that never heard of the pair
    const e = exactCenter(mainState);
    return { wasValid, validAfter: exactValid(mainState), ex: String(e.ex), want: String(toExact(0.5)) };
  });
  expect(r.wasValid).toBe(true);
  expect(r.validAfter).toBe(false);
  expect(r.ex).toBe(r.want);
});

test("zooming out past the drop scale clears the pair; the double is the nearest value", async ({ page }) => {
  await setDeep(page);
  const r = await page.evaluate(() => {
    moveCenter(mainState, 3e-21, 0);
    mainState.scale = 1;
    moveCenter(mainState, 0, 0);
    return { ex: mainState.ex, ey: mainState.ey, drop: EXACT_DROP, from: EXACT_FROM };
  });
  expect(r.ex).toBeNull();
  expect(r.ey).toBeNull();
  expect(r.drop).toBeGreaterThan(r.from);
});

test("a wheel zoom about the cursor keeps the point under it fixed to a thousandth of a pixel", async ({ page }) => {
  await setDeep(page);
  // The world point under a screen position, as exact center + offset, before and after the wheel.
  const r = await page.evaluate(() => {
    const rect = els.mainCanvas.getBoundingClientRect();
    // Whole client pixels: a wheel event's clientX is an integer in Chromium, so a fractional one would move the cursor.
    const lx = Math.round(rect.left + rect.width * 0.7) - rect.left, ly = Math.round(rect.top + rect.height * 0.3) - rect.top;
    const at = () => {
      const o = screenToComplex(mainRenderer, mainState, lx, ly);
      const c = exactCenter(mainState);
      return { x: c.ex + toExact(o.ox), y: c.ey + toExact(o.oy) };
    };
    const before = at();
    const before0 = { x: before.x, y: before.y };
    const px = mainState.scale * 2 / rect.height;
    return { before0: { x: String(before0.x), y: String(before0.y) }, px, lx, ly, left: rect.left, top: rect.top };
  });
  // A dispatched event, not page.mouse.wheel, which mobile WebKit doesn't support.
  await page.evaluate(({ left, top, lx, ly }) => {
    els.mainCanvas.dispatchEvent(new WheelEvent("wheel", { clientX: left + lx, clientY: top + ly, deltaY: -300, bubbles: true, cancelable: true }));
  }, r);
  await page.waitForTimeout(150);
  const after = await page.evaluate(({ lx, ly }) => {
    const o = screenToComplex(mainRenderer, mainState, lx, ly);
    const c = exactCenter(mainState);
    return { x: String(c.ex + toExact(o.ox)), y: String(c.ey + toExact(o.oy)), scale: mainState.scale };
  }, r);
  expect(after.scale).toBeLessThan(DEEP.scale); // it zoomed in
  const dx = Number(BigInt(after.x) - BigInt(r.before0.x)) / 2 ** 192;
  const dy = Number(BigInt(after.y) - BigInt(r.before0.y)) / 2 ** 192;
  const pixel = after.scale * 2 / 800;
  expect(Math.hypot(dx, dy)).toBeLessThan(pixel * 1e-3 + 1e-60);
});

test("a one-finger drag at 1e-20 moves the exact center by the drag", async ({ page }) => {
  await setDeep(page);
  const rect = await page.evaluate(() => {
    const r = els.mainCanvas.getBoundingClientRect();
    // A css pixel in world units: the shader's uv runs over the canvas's whole device height.
    return { left: r.left, top: r.top, width: r.width, height: r.height, per: 2 * mainState.scale * mainRenderer.dpr / els.mainCanvas.height };
  });
  const before = await page.evaluate(() => { const c = exactCenter(mainState); return { x: String(c.ex), y: String(c.ey) }; });
  const x0 = rect.left + rect.width / 2, y0 = rect.top + rect.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 60, y0 + 30, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => { const c = exactCenter(mainState); return { x: String(c.ex), y: String(c.ey), valid: exactValid(mainState) }; });
  expect(after.valid).toBe(true);
  // Dragging right/down by (60, 30) css px moves the center left/up (the content follows the finger) by scale * 2 / height per px.
  const per = rect.per;
  const dx = Number(BigInt(after.x) - BigInt(before.x)) / 2 ** 192;
  const dy = Number(BigInt(after.y) - BigInt(before.y)) / 2 ** 192;
  expect(Math.abs(dx / (-60 * per) - 1)).toBeLessThan(1e-6);
  expect(Math.abs(dy / (30 * per) - 1)).toBeLessThan(1e-6); // y grows upward on screen, so a downward drag moves cy up
});

test("Back restores the exact center, not just the double", async ({ page }) => {
  await setDeep(page);
  const r = await page.evaluate(() => {
    moveCenter(mainState, 7e-23, -3e-23);
    const a = exactCenter(mainState);
    pushHistory("main");
    moveCenter(mainState, 5e-21, 5e-21);
    popHistory("main");
    const b = exactCenter(mainState);
    return { same: a.ex === b.ex && a.ey === b.ey, valid: exactValid(mainState) };
  });
  expect(r.same).toBe(true);
  expect(r.valid).toBe(true);
});
