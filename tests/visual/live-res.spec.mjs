// Live frames at a frame-time-driven resolution (adaptLiveResolution, setLiveDivisor
// in app.js): while a flight or a pinch is on, frames that arrive late make the
// next ones draw smaller (scaled up), and the render when it settles is full
// size, exactly what it was. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global adaptLiveResolution, liveRes, LIVE_STEPS, mainRenderer, juliaRenderer, mainState, els, SAMPLE_OFFSETS,
   flyToPlace, TELEPORT_DESTINATIONS, isInteracting:writable */

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
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 50 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test("late frames step the resolution down, on-time frames step it back up, and a pause starts over", async ({ page }) => {
  const r = await page.evaluate(() => {
    const div = () => LIVE_STEPS[liveRes.step];
    const out = {};
    let t = 100000;
    adaptLiveResolution(t); // far from the last frame: starts at full size
    out.start = div();
    // Frames 40 ms apart (two frames' worth, late), three running: one step down in size.
    for (let i = 0; i < 3; i++) adaptLiveResolution((t += 40));
    out.afterLate = div();
    for (let i = 0; i < 30; i++) adaptLiveResolution((t += 40));
    out.afterManyLate = div();
    // Frames on time, a good while: one step back up in size.
    for (let i = 0; i < 45; i++) adaptLiveResolution((t += 16.7));
    out.afterOnTime = div();
    // A single long gap (the user paused) isn't a slow frame; a very long one starts over.
    for (let i = 0; i < 30; i++) adaptLiveResolution((t += 40));
    const before = div();
    adaptLiveResolution((t += 400));
    out.gapKeeps = div() === before;
    adaptLiveResolution(t + 5000);
    out.afterPause = div();
    out.renderers = [mainRenderer, juliaRenderer].map((x) => typeof x.setLiveDivisor);
    return out;
  });
  expect(r.start).toBe(1);
  expect(r.afterLate, "three late frames: a step smaller").toBe(1.5);
  expect(r.afterManyLate, "keeps going while late, to a floor").toBe(4);
  expect(r.afterOnTime, "on time for a while: a step bigger").toBeLessThan(4);
  expect(r.gapKeeps, "a gap of a few hundred ms doesn't count as a slow frame").toBe(true);
  expect(r.afterPause, "a long pause starts over at full size").toBe(1);
  expect(r.renderers).toEqual(["function", "function"]);
});

test("a live frame drawn small is a real picture of the view, and only while a gesture is on", async ({ page }) => {
  const r = await page.evaluate(() => {
    const canvas = els.mainCanvas;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const grab = () => { const px = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    window["__vt"].fractal("Julia:Rabbit");
    mainRenderer.render(mainState, 0);
    const full = grab();
    mainRenderer.setLiveDivisor(3);
    // Not interacting: the divisor is ignored, the frame is the full one.
    isInteracting = false;
    mainRenderer.render(mainState, 0);
    const ignored = grab();
    isInteracting = true;
    mainRenderer.render(mainState, 0);
    const small = grab();
    isInteracting = false;
    mainRenderer.setLiveDivisor(1);
    let ignoredDiffer = 0, sum = 0, n = 0; const colors = new Set();
    for (let i = 0; i < full.length; i += 4) {
      if (full[i] !== ignored[i] || full[i + 1] !== ignored[i + 1] || full[i + 2] !== ignored[i + 2]) ignoredDiffer++;
      sum += Math.abs(full[i] - small[i]) + Math.abs(full[i + 1] - small[i + 1]) + Math.abs(full[i + 2] - small[i + 2]); n += 3;
      if (i % 64 === 0) colors.add((small[i] >> 4) * 256 + (small[i + 1] >> 4) * 16 + (small[i + 2] >> 4));
    }
    return { ignoredDiffer, meanAbs: sum / n, colors: colors.size };
  });
  expect(r.ignoredDiffer, "outside a gesture the divisor changes nothing").toBe(0);
  expect(r.colors, "the small frame isn't flat").toBeGreaterThan(8);
  expect(r.meanAbs, "and is near the full one (mean difference of 255)").toBeLessThan(40);
});

test("a flight drawn small lands exactly as sharp as before", async ({ page }) => {
  // Force the smallest live size for the whole flight, then compare the settled picture
  // with the full passes alone.
  const r = await page.evaluate(async () => {
    window["adaptLiveResolution"] = () => { mainRenderer.setLiveDivisor(4); juliaRenderer.setLiveDivisor(4); };
    const i = TELEPORT_DESTINATIONS.findIndex((d) => d.label === "Mini Mandelbrot");
    flyToPlace(i);
    await new Promise((res) => { const t = () => (window["__vt"].settled() && !isInteracting ? res() : requestAnimationFrame(t)); setTimeout(t, 500); });
    const canvas = els.mainCanvas;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const grab = () => { const px = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const settled = grab();
    for (let k = 0; k < SAMPLE_OFFSETS.length; k++) mainRenderer.render(mainState, k);
    const plain = grab();
    let differ = 0;
    for (let p = 0; p < settled.length; p += 4) if (settled[p] !== plain[p] || settled[p + 1] !== plain[p + 1] || settled[p + 2] !== plain[p + 2]) differ++;
    return { differ, scale: mainState.scale };
  });
  expect(r.scale, "the flight landed").toBeLessThan(1e-10);
  expect(r.differ, "pixels that differ between the landed picture and the full passes alone").toBe(0);
});
