// Edge cases of the exact view center and the BigInt reference orbit (deep-exact.spec.mjs has the main checks):
// a rotated view, the Burning Ship / Tricorn / Celtic, the Julia pane of a dual view, a real mouse drag, a pinch, and a
// zoom round trip. Plain behavior checks, no screenshot baselines. The picture checks are the shifted-picture kind: a view
// whose exact center moved by (sx, sy) device pixels must show the same picture (sx, sy) pixels over, which needs no oracle.
// Each one also has to pass for the right reason: a control draws the same move with the exact path switched off
// (exactRender.below = 1e-40), where the double center cannot move, and that picture must NOT match.
//
// Centers: c = i (Mandelbrot) and c = -2 (Burning Ship, Tricorn, Celtic) are doubles that hold their value exactly and are
// strictly preperiodic for their maps (0 -> -2 -> 2 -> 2 for all three), so a window of any depth around them is all
// boundary structure; a scan at 1e-20 gave 34 to 105 distinct colors in the window against 89 for c = i.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global mainState, juliaState, mainRenderer, juliaRenderer, setCenter, moveCenter, exactCenter, exactValid, screenToComplex,
   requestRender, enterDual, exactRender, els */

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
// The canvas of a pane ("main" or "julia") as pixels.
async function canvasPixels(page, pane = "main") {
  const url = await page.evaluate((p) => (p === "julia" ? juliaRenderer : mainRenderer).canvas.toDataURL("image/png"), pane);
  return PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));
}

// A deep Mandelbrot-family view: the fractal opened fresh, then centered on (x, y), which is also the exact center.
async function showView(page, v) {
  await page.evaluate((v) => {
    window["__vt"].fractal(v.fractal);
    setCenter(mainState, v.x, v.y);
    mainState.scale = v.scale;
    mainState.rotation = v.rotation || 0;
    mainState.maxIter = v.maxIter || 600;
    mainState.iterAutoLocked = true;
    requestRender();
  }, v);
  await settle(page);
}

// Largest channel difference per pixel between a and b where b is a moved right by sx and down by sy (device pixels).
function compareShifted(a, b, sx, sy) {
  const w = a.width, h = a.height;
  let sum = 0, over16 = 0, count = 0;
  for (let y = Math.max(0, -sy); y < h - Math.max(0, sy); y++) {
    for (let x = Math.max(0, -sx); x < w - Math.max(0, sx); x++) {
      const i = (y * w + x) * 4, j = ((y + sy) * w + (x + sx)) * 4;
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
const THRESHOLDS = { mean: 0.5, over16: 0.005 };
// A control (the exact path off) has to differ from the shifted picture by clearly more than the pass bar: 4x. The first
// calibration, 10x, was set from Chromium's 6.4 and failed on desktop WebKit, whose rotated control measures 3.8 (about 7.6x).
const CONTROL_MEAN = THRESHOLDS.mean * 4;
function expectShifted(d, what) {
  expect(d.mean, `${what}: mean channel difference`).toBeLessThan(THRESHOLDS.mean);
  expect(d.over16, `${what}: share of pixels differing by more than 16`).toBeLessThan(THRESHOLDS.over16);
}

// The world move that puts the picture (sx, sy) device pixels right/down: the center c_b with c_b + off(p + (sx, sy)) = c_a + off(p)
// for every screen point p, off being screenToComplex's offset from the center. Written out from the shader's uv math, with
// the app's own screenToComplex as a check on the signs (rotation and the Burning Ship's mirrored axis both enter here).
const moveForShift = (page, sx, sy) => page.evaluate(([sx, sy]) => {
  const canvas = mainRenderer.canvas, dpr = mainRenderer.dpr, st = mainState;
  const k = 2 * st.scale / canvas.height; // world units per device pixel
  const c = Math.cos(st.rotation), s = Math.sin(st.rotation), flip = st.flipY ? -1 : 1;
  const u = sx, v = -sy; // screen right/down in uv-up terms
  const dx = -(u * c - v * s) * k, dy = -((u * s + v * c) * flip) * k;
  const p = { x: 300, y: 200 };
  const o0 = screenToComplex(mainRenderer, st, p.x, p.y), o1 = screenToComplex(mainRenderer, st, p.x + sx / dpr, p.y + sy / dpr);
  const check = { dx: o0.ox - o1.ox, dy: o0.oy - o1.oy };
  moveCenter(st, dx, dy);
  requestRender();
  return { dx, dy, check, stayed: st.cx, stayedY: st.cy, valid: exactValid(st) };
}, [sx, sy]);

// One shifted-picture check: draw the view, move its exact center so the picture moves (sx, sy), draw again, compare. With
// `control`, the exact path is off for both draws and the pictures must NOT agree (the double center cannot follow the move).
async function shiftedCheck(page, view, sx, sy, control = false) {
  await showView(page, view);
  if (control) await page.evaluate(() => { exactRender.below = 1e-40; requestRender(); }), await settle(page);
  const a = await canvasPixels(page);
  const m = await moveForShift(page, sx, sy);
  await settle(page);
  const b = await canvasPixels(page);
  if (control) await page.evaluate(() => { exactRender.below = 1e-13; });
  // The point of the test: the exact center moved where a double could not follow (a coordinate of 1 or 2 holds no 1e-21; a
  // coordinate of 0 does, so only one of the two is held), and the signs agree with screenToComplex.
  expect(m.stayed === view.x || m.stayedY === view.y, "a double stayed put").toBe(true);
  expect(m.valid).toBe(true);
  const scale = Math.hypot(m.dx, m.dy);
  expect(Math.hypot(m.dx - m.check.dx, m.dy - m.check.dy), "shift vs screenToComplex").toBeLessThan(scale * 1e-9);
  return { a, b, d: compareShifted(a, b, sx, sy), unshifted: compareShifted(a, b, 0, 0) };
}

// ---------------------------------------------------------------- (a) a rotated view
const ROTATED = { fractal: "Mandelbrot", x: 0, y: 1, scale: 1e-20, rotation: 0.7 };
test("rotated 0.7 rad at 1e-20, a move of 60 px along the turned vertical axis shows the same picture 60 px down", async ({ page }) => {
  const r = await shiftedCheck(page, ROTATED, 0, 60);
  expect(variety(r.a), "the view has structure to compare").toBeGreaterThan(8);
  console.log("rotated vertical:", JSON.stringify(r.d), "unshifted:", JSON.stringify(r.unshifted));
  expectShifted(r.d, "rotated");
  expect(r.unshifted.mean).toBeGreaterThan(r.d.mean * 2);
});
test("rotated 0.7 rad at 1e-20, a diagonal move (45 right, 30 down) shows the same picture", async ({ page }) => {
  const r = await shiftedCheck(page, ROTATED, 45, 30);
  console.log("rotated diagonal:", JSON.stringify(r.d), "unshifted:", JSON.stringify(r.unshifted));
  expectShifted(r.d, "rotated diagonal");
  expect(r.unshifted.mean).toBeGreaterThan(r.d.mean * 2);
});
test("control: with the exact path off, the same rotated move does not give the shifted picture", async ({ page }) => {
  const r = await shiftedCheck(page, ROTATED, 0, 60, true);
  console.log("rotated control (exact off):", JSON.stringify(r.d));
  expect(r.d.mean, "the test must be able to fail").toBeGreaterThan(CONTROL_MEAN);
});

// ---------------------------------------------------------------- (b), (c) the other families
const FAMILIES = [
  ["Burn. Ship", 1e-20], ["Burn. Ship", 1e-26], ["Tricorn", 1e-20], ["Celtic", 1e-20],
];
for (const [fractal, scale] of FAMILIES) {
  const view = { fractal, x: -2, y: 0, scale, maxIter: 800 };
  test(`${fractal} at ${scale}, a diagonal move (50 right, 35 down) shows the same picture`, async ({ page }) => {
    const r = await shiftedCheck(page, view, 50, 35);
    expect(variety(r.a), "the view has structure to compare").toBeGreaterThan(8);
    console.log(`${fractal} ${scale}:`, JSON.stringify(r.d), "unshifted:", JSON.stringify(r.unshifted));
    expectShifted(r.d, fractal);
    expect(r.unshifted.mean).toBeGreaterThan(r.d.mean * 2);
  });
}
test("Burn. Ship control: with the exact path off, the shifted picture does not match", async ({ page }) => {
  const r = await shiftedCheck(page, { fractal: "Burn. Ship", x: -2, y: 0, scale: 1e-20, maxIter: 800 }, 50, 35, true);
  console.log("ship control (exact off):", JSON.stringify(r.d));
  expect(r.d.mean).toBeGreaterThan(CONTROL_MEAN);
});

// ---------------------------------------------------------------- (d) the Julia pane of a dual view
// The Julia pane's view center is a point of the z plane with its own exact pair; its c is the main pane's rounded center
// (by design: only the view point is exact). c = i again: z = -1 + i is a repelling point of period 2 of z^2 + i
// (-1+i -> -i -> -1+i), so it lies in the Julia set, and a double holds it exactly; neither coordinate is near 0, so the
// double center cannot follow a 1e-21 move in either.
async function showJuliaDeep(page, scale) {
  await page.evaluate((s) => {
    window["__vt"].fractal("Mandelbrot");
    setCenter(mainState, 0, 1);
    enterDual();
    setCenter(juliaState, -1, 1);
    juliaState.scale = s;
    juliaState.rotation = 0;
    juliaState.maxIter = 600;
    juliaState.iterAutoLocked = true;
    mainState.maxIter = 600;
    mainState.iterAutoLocked = true;
    requestRender();
  }, scale);
  await settle(page);
}
test("dual view: a drag on the Julia pane at 1e-20 moves its exact pair and its picture, and leaves c alone", async ({ page }) => {
  await showJuliaDeep(page, 1e-20);
  const a = await canvasPixels(page, "julia");
  expect(variety(a), "the Julia pane has structure").toBeGreaterThan(8);
  const before = await page.evaluate(() => {
    const e = exactCenter(juliaState), r = els.juliaCanvas.getBoundingClientRect();
    return { ex: String(e.ex), ey: String(e.ey), c: [...juliaState.juliaC], main: [mainState.cx, mainState.cy], dpr: juliaRenderer.dpr,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height }, per: 2 * juliaState.scale * juliaRenderer.dpr / juliaRenderer.canvas.height };
  });
  const DX = 50, DY = 30; // css px
  const x0 = before.rect.left + before.rect.width / 2, y0 = before.rect.top + before.rect.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + DX, y0 + DY, { steps: 5 });
  await page.mouse.up();
  await settle(page);
  const after = await page.evaluate(() => {
    const e = exactCenter(juliaState);
    return { ex: String(e.ex), ey: String(e.ey), valid: exactValid(juliaState), c: [...juliaState.juliaC], main: [mainState.cx, mainState.cy],
      cx: juliaState.cx, cy: juliaState.cy, mainValid: exactValid(mainState) };
  });
  expect(after.valid, "the Julia pane keeps an exact pair").toBe(true);
  expect(after.c, "c is still the main pane's center").toEqual(before.c);
  expect(after.main).toEqual(before.main);
  expect([after.cx, after.cy], "the doubles did not move").toEqual([-1, 1]);
  const dx = Number(BigInt(after.ex) - BigInt(before.ex)) / 2 ** 192, dy = Number(BigInt(after.ey) - BigInt(before.ey)) / 2 ** 192;
  const per = 2 * 1e-20 * before.dpr / (await page.evaluate(() => juliaRenderer.canvas.height)); // world per css px
  expect(Math.abs(dx / (-DX * per) - 1), "exact x moved by the drag").toBeLessThan(1e-6);
  expect(Math.abs(dy / (DY * per) - 1), "exact y moved by the drag").toBeLessThan(1e-6);
  const b = await canvasPixels(page, "julia");
  const d = compareShifted(a, b, Math.round(DX * before.dpr), Math.round(DY * before.dpr));
  console.log("julia pane drag:", JSON.stringify(d), "unshifted:", JSON.stringify(compareShifted(a, b, 0, 0)));
  expectShifted(d, "julia drag");
});
test("dual view control: with the exact path off, the Julia pane's dragged picture does not match", async ({ page }) => {
  await showJuliaDeep(page, 1e-20);
  await page.evaluate(() => { exactRender.below = 1e-40; requestRender(); });
  await settle(page);
  const a = await canvasPixels(page, "julia");
  const rect = await page.evaluate(() => { const r = els.juliaCanvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, dpr: juliaRenderer.dpr }; });
  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.x + 50, rect.y + 30, { steps: 5 });
  await page.mouse.up();
  await settle(page);
  const b = await canvasPixels(page, "julia");
  await page.evaluate(() => { exactRender.below = 1e-13; });
  const d = compareShifted(a, b, Math.round(50 * rect.dpr), Math.round(30 * rect.dpr));
  console.log("julia control (exact off):", JSON.stringify(d));
  expect(d.mean).toBeGreaterThan(CONTROL_MEAN);
});

// ---------------------------------------------------------------- (e) a real mouse drag on the main pane
test("a mouse drag at 1e-20 followed by the render shows the original picture moved by the drag", async ({ page }) => {
  await showView(page, { fractal: "Mandelbrot", x: 0, y: 1, scale: 1e-20 });
  const a = await canvasPixels(page);
  const rect = await page.evaluate(() => { const r = els.mainCanvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, dpr: mainRenderer.dpr }; });
  const DX = 60, DY = 30;
  await page.mouse.move(rect.x, rect.y);
  await page.mouse.down();
  await page.mouse.move(rect.x + DX, rect.y + DY, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  const st = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, valid: exactValid(mainState) }));
  expect(st.cy, "y = 1 holds no 1e-21").toBe(1);
  expect(st.valid).toBe(true);
  const b = await canvasPixels(page);
  const d = compareShifted(a, b, Math.round(DX * rect.dpr), Math.round(DY * rect.dpr));
  console.log("mouse drag:", JSON.stringify(d), "unshifted:", JSON.stringify(compareShifted(a, b, 0, 0)));
  expectShifted(d, "mouse drag");
});

// ---------------------------------------------------------------- (f) a zoom round trip keeps the exact center
// Out by a wheel and back in by the same wheel about the same cursor, and the same with a two-finger pinch: the scale returns
// and the exact center must return to within a thousandth of a pixel. (Zoomed out past EXACT_DROP the pair is dropped by
// design, so the trip stays inside it: 1e-20 out to about 1e-11.)
const roundTrip = async (page, run, scale = 1e-20) => {
  await page.evaluate((s) => {
    window["__vt"].fractal("Mandelbrot");
    setCenter(mainState, 0.4472135954957291, 0.8944271910020332);
    mainState.scale = s;
    mainState.rotation = 0.3;
    moveCenter(mainState, 3.3e-3 * s, -1.7e-3 * s);
  }, scale);
  const read = () => page.evaluate(() => { const e = exactCenter(mainState); return { x: String(e.ex), y: String(e.ey), scale: mainState.scale, valid: exactValid(mainState), px: 2 * mainState.scale / mainRenderer.canvas.height }; });
  const s0 = await read();
  await run();
  const s1 = await read();
  const dx = Number(BigInt(s1.x) - BigInt(s0.x)) / 2 ** 192, dy = Number(BigInt(s1.y) - BigInt(s0.y)) / 2 ** 192;
  return { s0, s1, pixels: Math.hypot(dx, dy) / s0.px };
};
test("a wheel zoom out and back in returns to the same exact center (a thousandth of a pixel)", async ({ page }) => {
  const r = await roundTrip(page, async () => {
    await page.evaluate(() => {
      const rect = els.mainCanvas.getBoundingClientRect();
      const cx = Math.round(rect.left + rect.width * 0.7), cy = Math.round(rect.top + rect.height * 0.3);
      const wheel = (deltaY) => els.mainCanvas.dispatchEvent(new WheelEvent("wheel", { clientX: cx, clientY: cy, deltaY, bubbles: true, cancelable: true }));
      for (let i = 0; i < 4; i++) wheel(2000); // each exp(3): out to about 1e-20 * e^12 = 1.6e-15
      window["trip"] = mainState.scale;
      for (let i = 0; i < 4; i++) wheel(-2000);
    });
  });
  console.log("wheel round trip:", r.pixels, "pixels; scale", r.s0.scale, "->", r.s1.scale);
  expect(await page.evaluate(() => window["trip"]), "it did zoom out").toBeGreaterThan(1e-16);
  expect(r.s1.valid).toBe(true);
  expect(Math.abs(r.s1.scale / r.s0.scale - 1)).toBeLessThan(1e-12);
  expect(r.pixels).toBeLessThan(1e-3);
});
// A pinch is not a closed path in the app's own arithmetic: the fingers' events arrive one pointer at a time, so the midpoint
// the zoom anchors on wanders a little between events, and the center ends some pixels from where it began. That is the same
// number of pixels at any depth, so the check is against the same gesture at scale 1e-3, where doubles are plenty: the exact
// center must follow the gesture as well as a double does.
test("a two-finger pinch out and back in ends where the same pinch ends at a shallow scale (chromium only: CDP touch)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "multi-touch is driven through the Chrome DevTools protocol");
  const cdp = await page.context().newCDPSession(page);
  const pinch = async () => {
    const rect = await page.evaluate(() => { const b = els.mainCanvas.getBoundingClientRect(); return { x: b.left + b.width * 0.55, y: b.top + b.height * 0.45 }; });
    const pts = (half) => [{ x: rect.x - half, y: rect.y, id: 0 }, { x: rect.x + half, y: rect.y, id: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(150) });
    for (const half of [140, 120, 100, 80, 60, 40, 20]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(half) });
    await page.waitForTimeout(100);
    await page.evaluate(() => { window["trip"] = mainState.scale; });
    for (const half of [40, 60, 80, 100, 120, 140, 150]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(half) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(100);
  };
  // The end offset in pixels, as a vector, so that the two depths can be compared.
  const trip = async (scale) => {
    const r = await roundTrip(page, pinch, scale);
    const dx = Number(BigInt(r.s1.x) - BigInt(r.s0.x)) / 2 ** 192, dy = Number(BigInt(r.s1.y) - BigInt(r.s0.y)) / 2 ** 192;
    expect(await page.evaluate(() => window["trip"]), "it did zoom out").toBeGreaterThan(scale * 5);
    expect(Math.abs(r.s1.scale / r.s0.scale - 1)).toBeLessThan(1e-12);
    return { x: dx / r.s0.px, y: dy / r.s0.px, valid: r.s1.valid };
  };
  const shallow = await trip(1e-3);
  const deep = await trip(1e-20);
  console.log("pinch round trip, end offset in px: shallow", JSON.stringify(shallow), "deep", JSON.stringify(deep));
  expect(deep.valid).toBe(true);
  expect(Math.hypot(deep.x - shallow.x, deep.y - shallow.y)).toBeLessThan(1e-3);
});
