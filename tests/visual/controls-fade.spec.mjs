// The toolbar fade (controls-fade.js): the toolbar fades when the screen is left alone and wakes on
// touch, pointer, key or focus, without pressing what is under the waking touch and without
// swallowing canvas gestures. Plain behavior checks, no baselines; the fade is off under automation, so
// each test turns it on with a 300 ms delay. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global setControlsFade, controlsFaded, mainState, els, toolbarGrow, setCenter, applyAutoIter, requestRender, lastMainDeepPath,
   mainRenderer, buildShareUrl, applyShareState, parseShareHash, pushHistory, popHistory, setMode, enterDual,
   TELEPORT_DESTINATIONS, currentName, setTeleportLandingIndex, landedPlaceName, describeCanvas */

const DELAY = 300;
let pageErrors = [];

async function load(page, { dismissed = true } = {}) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((d) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      if (d) localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  }, dismissed);
  await page.goto("index.html");
  await page.waitForFunction(() => window["__faHooks"] > 0, null, { timeout: 90_000 });
}

const bar = (page) => page.locator("#controls");
const fadeOn = (page, delay = DELAY) => page.evaluate((ms) => setControlsFade({ enabled: true, delayMs: ms }), delay);
const isFaded = (page) => page.evaluate(() => controlsFaded());
const waitFaded = (page) => expect.poll(() => isFaded(page), { timeout: 5000 }).toBe(true);
async function center(loc) {
  const b = await loc.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test("off by default under automation, then fades after the idle delay", async ({ page }) => {
  await load(page);
  await page.waitForTimeout(DELAY * 3);
  expect(await isFaded(page)).toBe(false);
  await fadeOn(page);
  await waitFaded(page);
  await expect(bar(page)).toHaveCSS("opacity", "0", { timeout: 3000 });
  expect(pageErrors).toEqual([]);
});

test("never fades while VoiceOver or Switch Control runs, and turning it on wakes a faded toolbar", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  // The app's Swift side sets the flag and sends this event.
  await page.evaluate(() => {
    document.documentElement.dataset.screenReader = "1";
    window.dispatchEvent(new Event("screenreaderchange"));
  });
  expect(await isFaded(page)).toBe(false);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
  // Off again: the idle fade comes back.
  await page.evaluate(() => {
    document.documentElement.dataset.screenReader = "0";
    window.dispatchEvent(new Event("screenreaderchange"));
  });
  await waitFaded(page);
  expect(pageErrors).toEqual([]);
});

// Real touches: with a mouse, the move to the button already wakes the toolbar (desktop behavior).
test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("a tap on the faded toolbar wakes it and does not press the button under it", async ({ page }) => {
    await load(page);
    await fadeOn(page, 1500); // long enough that it doesn't fade again while the test looks
    await waitFaded(page);
    const { x, y } = await center(page.locator("#boxZoomBtn"));
    await page.touchscreen.tap(x, y);
    expect(await isFaded(page)).toBe(false);
    await page.waitForTimeout(150);
    await expect(page.locator("#boxZoomBtn")).not.toHaveClass(/\bactive\b/);
    await expect(bar(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
    await expect(bar(page)).not.toHaveClass(/\binert\b/, { timeout: 3000 });
    const again = await center(page.locator("#boxZoomBtn"));
    await page.touchscreen.tap(again.x, again.y);
    await expect(page.locator("#boxZoomBtn")).toHaveClass(/\bactive\b/);
    expect(pageErrors).toEqual([]);
  });

  test("a tap on the faded slider wakes the toolbar and does not move the slider", async ({ page }) => {
    await load(page);
    await fadeOn(page);
    await waitFaded(page);
    const before = await page.locator("#iterSlider").inputValue();
    const b = await page.locator("#iterSlider").boundingBox();
    await page.touchscreen.tap(b.x + b.width - 4, b.y + b.height / 2);
    expect(await page.locator("#iterSlider").inputValue()).toBe(before);
    expect(await isFaded(page)).toBe(false);
  });
});

test("a mouse move wakes the toolbar on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "no fine pointer on the phone setups");
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  await page.mouse.move(5, 5);
  await page.mouse.move(20, 20);
  expect(await isFaded(page)).toBe(false);
});

test("a drag on the picture still pans while it wakes the toolbar", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy }));
  const c = await center(page.locator("#mainCanvas"));
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 90, c.y + 60, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy }));
  expect(after.cx !== before.cx || after.cy !== before.cy).toBe(true);
  expect(await isFaded(page)).toBe(false);
});

test("it does not fade while the Color sheet is open, and fades after it closes", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheet")).toHaveClass(/\bopen\b/);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
  // Closed by a pointer (the same button again), not Escape: Escape hands focus back to the button as
  // keyboard focus, which rightly keeps the toolbar shown.
  await page.locator("#colormapBtn").click();
  await expect(page.locator("#colorSheet")).not.toHaveClass(/\bopen\b/);
  await waitFaded(page);
});

test("it does not fade while the Share menu is open", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await page.locator("#shareBtn").click();
  await expect(page.locator("#shareMenu")).toHaveClass(/\bopen\b/);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
});

test("it does not fade while a slider is held", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  const b = await page.locator("#iterSlider").boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
  await page.mouse.up();
  await waitFaded(page);
});

test("it does not fade while the welcome card shows", async ({ page }) => {
  await load(page, { dismissed: false });
  await expect(page.locator("#welcome")).not.toHaveClass(/\bhidden\b/);
  await fadeOn(page);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
  await page.locator("#welcomeClose").click();
  await waitFaded(page);
});

test("keyboard focus in the toolbar keeps it shown, and every button stays reachable while faded", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  // Faded controls are still in the accessibility tree and the tab order.
  await expect(page.locator("#boxZoomBtn")).toHaveAttribute("aria-label", "Box zoom");
  await expect(bar(page)).not.toHaveCSS("visibility", "hidden");
  await expect(bar(page)).not.toHaveCSS("display", "none");
  // A key press first (keyboard modality, and it wakes the toolbar), then focus lands in the toolbar.
  await page.keyboard.press("Shift");
  await waitFaded(page);
  await page.locator("#boxZoomBtn").focus();
  expect(await page.evaluate(() => !!document.activeElement?.closest("#controls"))).toBe(true);
  expect(await isFaded(page)).toBe(false);
  await page.waitForTimeout(DELAY * 4);
  expect(await isFaded(page)).toBe(false);
});

test("a key press wakes the toolbar", async ({ page }) => {
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  await page.keyboard.press("Shift");
  expect(await isFaded(page)).toBe(false);
});

test("reduced motion hides the toolbar with no transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page);
  await fadeOn(page);
  await waitFaded(page);
  await expect(bar(page)).toHaveCSS("transition-duration", "0s");
  expect(await bar(page).evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
});

test("with motion allowed the fade takes about half a second", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await load(page);
  await expect(bar(page)).toHaveCSS("transition-duration", "0.5s");
});

test("the other modes' control rows fade with the same toolbar", async ({ page }) => {
  await load(page);
  await page.evaluate(() => { els.fractalControls.classList.add("hidden"); els.kochControls.classList.remove("hidden"); });
  await fadeOn(page);
  await waitFaded(page);
  await expect(page.locator("#kochControls")).toBeVisible(); // still laid out, only transparent
  await expect(bar(page)).toHaveCSS("opacity", "0", { timeout: 3000 });
});

// ---------------------------------------------------------------- the picture grows into the toolbar's space

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const settle = (page) => page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
const canvasH = (page) => page.evaluate(() => els.mainCanvas.clientHeight);
const waitGrown = (page) => expect.poll(() => page.evaluate(() => !!toolbarGrow), { timeout: 5000 }).toBe(true);

async function loadGrowable(page) {
  await load(page);
  await page.addScriptTag({ path: DRIVER });
  await settle(page);
}

// A deep (perturbation) place and an exact-center one, as view states.
const VIEWS = {
  normal: null,
  deep: { cx: -0.743643887037151, cy: 0.13182590420533, scale: 3e-7 },
  exact: { cx: -0.743643887037151, cy: 0.13182590420533, scale: 1e-11 },
};
async function setView(page, v) {
  if (!v) return;
  await page.evaluate((view) => {
    setCenter(mainState, view.cx, view.cy);
    mainState.scale = view.scale;
    mainState.iterAutoLocked = false;
    applyAutoIter();
    requestRender();
  }, v);
  await settle(page);
}
// The top rows of the main canvas, as RGBA bytes.
const topRows = (page, rows = 160) => page.evaluate((n) => {
  const c = els.mainCanvas;
  const t = document.createElement("canvas");
  t.width = c.width; t.height = Math.min(n, c.height);
  const g = t.getContext("2d");
  g.drawImage(c, 0, 0, c.width, t.height, 0, 0, c.width, t.height);
  return Array.from(g.getImageData(0, 0, t.width, t.height).data);
}, rows);
function diffStats(a, b) {
  expect(a.length).toBe(b.length);
  let sum = 0, over = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
    sum += d;
    if (d > 40) over++;
  }
  return { mean: sum / (a.length / 4), over: over / (a.length / 4) };
}

for (const [name, view] of Object.entries(VIEWS)) {
  test(`the canvas grows when faded and the picture does not jump (${name} depth)`, async ({ page }) => {
    await loadGrowable(page);
    await setView(page, view);
    const before = await topRows(page);
    const h0 = await canvasH(page);
    const scale0 = await page.evaluate(() => mainState.scale);
    await fadeOn(page);
    await waitGrown(page);
    await settle(page);
    const h1 = await canvasH(page);
    expect(h1).toBeGreaterThan(h0 + 20);
    await expect(bar(page)).toHaveClass(/\boverlay\b/);
    // The pixel size is kept: a half-height scales with the canvas height.
    const scale1 = await page.evaluate(() => mainState.scale);
    expect(Math.abs(scale1 / scale0 - h1 / h0)).toBeLessThan(1e-9);
    if (name !== "normal") expect(await page.evaluate(() => lastMainDeepPath)).not.toBe(null);
    const after = await topRows(page);
    const { mean, over } = diffStats(before, after);
    // Control: the same picture moved down by a few rows must read as clearly different, or the probe is blind.
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    const rowBytes = (before.length / 160) | 0;
    const moved = diffStats(before.slice(0, before.length - rowBytes * 6 * dpr), after.slice(rowBytes * 6 * dpr, after.length - 0 - (after.length - before.length)));
    if (name !== "normal") expect(moved.over, "control: a 6 px shift is detectable").toBeGreaterThan(0.05); // the default view is mostly black
    // A redraw differs a little in the grain of the sharpening passes; a jump of even a few rows is far more.
    expect(mean, "mean difference of the top rows").toBeLessThan(4);
    expect(over, "share of pixels clearly different").toBeLessThan(0.002);
    expect(pageErrors).toEqual([]);
  });
}

test("waking keeps the canvas tall and does not render again", async ({ page }) => {
  await loadGrowable(page);
  await fadeOn(page, 1500);
  await waitGrown(page);
  await settle(page);
  await page.evaluate(() => {
    window["__renders"] = 0;
    const r = mainRenderer, a = r.render, b = r.renderPreview;
    r.render = (...x) => { window["__renders"]++; return a.apply(r, x); };
    r.renderPreview = (...x) => { window["__renders"]++; return b.apply(r, x); };
  });
  const h = await canvasH(page);
  await page.keyboard.press("Shift");
  await expect(bar(page)).toHaveCSS("opacity", "1", { timeout: 3000 });
  await page.waitForTimeout(400);
  expect(await canvasH(page)).toBe(h);
  expect(await page.evaluate(() => window["__renders"])).toBe(0);
  expect(await page.evaluate(() => !!toolbarGrow)).toBe(true);
  // The toolbar sits over the bottom of the picture.
  const box = await bar(page).boundingBox();
  const vh = await page.evaluate(() => window.innerHeight);
  expect(Math.round(box.y + box.height)).toBe(vh);
});

test("a share link made while faded is the same as one made while shown, and opens the same view", async ({ page }) => {
  await loadGrowable(page);
  await setView(page, VIEWS.deep);
  const fields = (url) => Object.fromEntries(new URLSearchParams(new URL(url).hash.slice(1)));
  const shown = await page.evaluate(() => buildShareUrl());
  await fadeOn(page);
  await waitGrown(page);
  await settle(page);
  const grownScale = await page.evaluate(() => mainState.scale);
  const faded = await page.evaluate(() => buildShareUrl());
  const a = fields(shown), b = fields(faded);
  expect(Number(a.s) / grownScale).not.toBeCloseTo(1, 3); // the state itself is in the tall geometry
  for (const k of ["x", "y", "s", "r"]) {
    const rel = Math.abs(Number(a[k]) - Number(b[k])) / Math.max(Math.abs(Number(a[k])), Number(a.s));
    expect(rel, `link field ${k}`).toBeLessThan(1e-6);
  }
  // Opening the link while grown goes back to the shown layout at that view.
  await page.evaluate((u) => applyShareState(parseShareHash(new URL(u).hash)), faded);
  expect(await page.evaluate(() => toolbarGrow)).toBe(null);
  const st = await page.evaluate(() => ({ s: mainState.scale, x: mainState.cx }));
  expect(Math.abs(st.s / Number(a.s) - 1)).toBeLessThan(1e-6);
});

test("the info card and the screen-reader label read the same depth and place name while grown", async ({ page }) => {
  await loadGrowable(page);
  // Land on a Mandelbrot place with no turn, as a flight would leave it.
  const ok = await page.evaluate(() => {
    const i = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === currentName && d.rotation === undefined && d.scale > 1e-6);
    if (i < 0) return false;
    const d = TELEPORT_DESTINATIONS[i];
    setCenter(mainState, Number(d.re), Number(d.im));
    mainState.scale = d.scale;
    setTeleportLandingIndex(i);
    requestRender();
    return true;
  });
  expect(ok, "a Mandelbrot place without a rotation exists").toBe(true);
  await settle(page);
  // The depth is compared as a number: the round trip through the tall geometry costs a few ulps, which can
  // flip a rounded phrase that sits exactly on a boundary (1250x reads "1.3 thousand", 1249.99...x "1.2").
  const read = () => page.evaluate(() => ({ place: landedPlaceName(), label: describeCanvas().label, depth: describeCanvas().valuenow }));
  const shown = await read();
  expect(shown.place).not.toBe("");
  await fadeOn(page);
  await waitGrown(page);
  await settle(page);
  const grown = await read();
  expect(grown.place).toBe(shown.place);
  expect(grown.label).toBe(shown.label);
  expect(Math.abs(grown.depth - shown.depth)).toBeLessThan(1e-9);
  // The control: the state itself is in the tall geometry, so reading it raw would differ.
  const raw = await page.evaluate(() => Math.log2(mainState.baseScale / mainState.scale));
  expect(Math.abs(raw - shown.depth)).toBeGreaterThan(0.05);
});

test("Back after growing returns to the view it was written for", async ({ page }) => {
  await loadGrowable(page);
  await fadeOn(page);
  await waitGrown(page);
  await settle(page);
  const before = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }));
  await page.evaluate(() => { pushHistory("main"); mainState.scale *= 0.5; popHistory("main"); });
  const after = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }));
  expect(Math.abs(after.scale / before.scale - 1)).toBeLessThan(1e-9);
  expect(Math.abs(after.cx - before.cx)).toBeLessThan(1e-9 * before.scale);
  expect(Math.abs(after.cy - before.cy)).toBeLessThan(1e-9 * before.scale);
});

test("a window resize while faded puts the toolbar back in the flow, showing, with the same view", async ({ page, viewport }) => {
  await loadGrowable(page);
  const scale0 = await page.evaluate(() => mainState.scale);
  await fadeOn(page, 1500); // long enough to look before it fades again
  await waitGrown(page);
  await page.setViewportSize({ width: viewport.width, height: viewport.height - 40 });
  await expect.poll(() => page.evaluate(() => toolbarGrow), { timeout: 5000 }).toBe(null);
  expect(await isFaded(page)).toBe(false);
  await expect(bar(page)).not.toHaveClass(/\boverlay\b/);
  expect(Math.abs((await page.evaluate(() => mainState.scale)) / scale0 - 1)).toBeLessThan(1e-9);
  // It fades and grows again after another idle delay.
  await waitGrown(page);
  expect(pageErrors).toEqual([]);
});

test("a mode switch while faded goes back to the flow first", async ({ page }) => {
  await loadGrowable(page);
  await fadeOn(page);
  await waitGrown(page);
  await page.evaluate(() => setMode("koch"));
  expect(await page.evaluate(() => toolbarGrow)).toBe(null);
  await expect(bar(page)).not.toHaveClass(/\boverlay\b/);
});

test("only a single fractal view grows: the toolbar fades but dual view keeps its size", async ({ page }) => {
  await loadGrowable(page);
  await page.evaluate(() => { enterDual(); });
  await settle(page);
  const h = await canvasH(page);
  await fadeOn(page);
  await waitFaded(page);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => toolbarGrow)).toBe(null);
  expect(await canvasH(page)).toBe(h);
});
