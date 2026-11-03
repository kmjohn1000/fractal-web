// Infinite zoom on the Sierpinski types (Carpet and Gasket): the view's center is an exact BigInt that grows with the
// zoom (view-math.js: exactBitsFor, state.ef), digitCellFrame reads the cell addresses and holes from it, and the
// zoom floor is the scale's own double (deepzoom.js: DIGIT_MIN_SCALE). Plain behavior checks, no screenshot baselines.
// The main check needs no oracle: two views whose exact centers differ by N pixels must show the same picture N
// pixels apart, at depths where a double center (53 bits, so about 1e-16 of the pattern) cannot tell them apart.
// The center is built from digit strings, one coordinate's digits never meeting the other's 1 where the pattern
// cuts a hole, so the view sits on the fractal and has structure at every depth.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global mainState, mainRenderer, setCenter, moveCenter, exactCenter, exactValid, exactBitsFor, exactFracFor, exactFrac,
   toExact, fromExact, screenToComplex, requestRender, pushHistory, popHistory, buildShareHash, parseShareHash,
   applyShareLink, digitCellFrame, digitCellLevel, FTYPE, els, minScaleFor, selectFractal,
   updateHud, showHud, TELEPORT_DESTINATIONS, FRACTAL_CONFIGS, DIGIT_MIN_SCALE, zoomPhrase */

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
async function canvasPixels(page) {
  const url = await page.evaluate(() => mainRenderer.canvas.toDataURL("image/png"));
  return PNG.sync.read(Buffer.from(url.split(",")[1], "base64"));
}

// Largest channel difference per pixel between a's rows [0, h - n) and b's rows [n, h): b is a moved down by n.
function compareShifted(a, b, n) {
  const w = a.width, h = a.height;
  let sum = 0, over16 = 0, count = 0;
  for (let y = 0; y < h - n; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, j = ((y + n) * w + x) * 4;
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

// Differences of BigInt strings (a - b) held at F fraction bits, as doubles.
const diffs = (page, pairs, F) => page.evaluate(([ps, f]) => ps.map(([a, b]) => fromExact(BigInt(a) - BigInt(b), f)), [pairs, F]);

// In the page: a deep view of `name` ("Gasket" or "Carpet") at `scale`, centered on a point of the fractal whose
// digits are pseudo-random (so its double is a different point): the x digits are anything, the y digits never
// are a 1 where x has one (Gasket: y = not x; Carpet: y digits in {0, 2}), so no level cuts the point out.
const SET_DEEP = `(([name, scale]) => {
  window["__vt"].fractal(name);
  const base = name === "Carpet" ? 3 : 2;
  const F = exactBitsFor(scale);
  let s = 20241103;
  const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return Math.floor((s / 0x80000000) * n); };
  const m = Math.ceil(F / Math.log2(base)) + 4;
  let nx = 0n, ny = 0n, b = BigInt(base);
  for (let i = 0; i < m; i++) {
    const dx = rnd(base);
    const dy = base === 2 ? 1 - dx : [0, 2][rnd(2)];
    nx = nx * b + BigInt(dx); ny = ny * b + BigInt(dy);
  }
  const den = b ** BigInt(m);
  const ex = (nx << BigInt(F)) / den, ey = (ny << BigInt(F)) / den;
  mainState.scale = scale;
  mainState.rotation = 0;
  setCenter(mainState, fromExact(ex, F), fromExact(ey, F), ex, ey, F);
  requestRender();
})`;
// Settled afterwards: choosing a fractal can resize the canvas, and the gesture checks measure pixels.
const setDeep = async (page, name, scale) => {
  await page.evaluate(`${SET_DEEP}(${JSON.stringify([name, scale])})`);
  await settle(page);
};

// ---------------------------------------------------------------- the numbers

test("a double converts to the exact integer and back unchanged at every fraction length", async ({ page }) => {
  const r = await page.evaluate(() => {
    const xs = [0, 1, -1, 0.4472135954957291, -0.7436438870371587, 1e-20, -3.5e-9, 123456.789, 3e-100, -1e-200, 2.5e-300];
    const bad = [];
    for (const F of [192, 256, 448, 1088]) {
      // A double is held whole when its last bit (2^-52 of its size) is no finer than the fraction's.
      for (const x of xs) if (x === 0 || Math.abs(x) >= 2 ** (53 - F)) if (fromExact(toExact(x, F), F) !== x) bad.push([F, x]);
    }
    // The same number at two lengths is the same double; the long one is the short one with zeros appended.
    const same = [0.4472135954957291, -0.7436438870371587, 1e-20].every((x) => toExact(x, 448) === toExact(x, 192) << 256n);
    return { bad, same };
  });
  expect(r.bad).toEqual([]);
  expect(r.same).toBe(true);
});

test("the fraction length grows with the zoom and leaves every escape-time view at 192 bits", async ({ page }) => {
  const r = await page.evaluate(() => ({
    a: exactBitsFor(1), b: exactBitsFor(1e-9), c: exactBitsFor(1e-30), d: exactBitsFor(2 ** -128),
    e: exactBitsFor(1e-39), f: exactBitsFor(1e-100), g: exactBitsFor(1e-300), nan: exactBitsFor(undefined),
  }));
  expect(r.a).toBe(192);
  expect(r.b).toBe(192);
  expect(r.c).toBe(192); // the escape-time floor is 1e-30: those views keep the format they always had
  expect(r.d).toBe(192);
  expect(r.e).toBeGreaterThan(192);
  expect(r.f).toBe(448);
  expect(r.g).toBe(1088);
  expect(r.nan).toBe(192);
});

test("deep: a one-pixel pan follows the exact center at 1e-100 and 1e-290 while the double never moves", async ({ page }) => {
  for (const scale of [1e-100, 1e-290]) {
    await setDeep(page, "Gasket", scale);
    const r = await page.evaluate(() => {
      const F = exactFracFor(mainState);
      const px = mainState.scale * 2 / 800;
      const cx0 = mainState.cx, cy0 = mainState.cy;
      const e0 = exactCenter(mainState, F);
      moveCenter(mainState, px, -px);
      const e1 = exactCenter(mainState, F);
      return { F, same: mainState.cx === cx0 && mainState.cy === cy0, valid: exactValid(mainState),
        dx: String(e1.ex - e0.ex), dy: String(e1.ey - e0.ey), want: String(toExact(px, F)), ef: exactFrac(mainState) };
    });
    expect(r.same, `the double at ${scale}`).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.ef).toBe(r.F);
    expect(r.dx).toBe(r.want);
    expect(r.dy).toBe("-" + r.want);
  }
});

test("zooming in grows the stored fraction, and zooming back out keeps the low bits", async ({ page }) => {
  await setDeep(page, "Gasket", 1e-20);
  const r = await page.evaluate(() => {
    moveCenter(mainState, 3e-23, 0); // an exact pair at 192 bits
    mainState.scale = 1e-120;
    moveCenter(mainState, 1e-123, 0);
    const deepBits = exactFrac(mainState);
    const a = exactCenter(mainState, 640);
    mainState.scale = 1e-30;
    moveCenter(mainState, 0, 0);
    const back = exactFrac(mainState);
    const b = exactCenter(mainState, 640);
    mainState.scale = 1e-120;
    moveCenter(mainState, 0, 0);
    const c = exactCenter(mainState, 640);
    return { deepBits, back, same: a.ex === c.ex && a.ey === c.ey, kept: a.ex === b.ex };
  });
  expect(r.deepBits).toBe(512);
  expect(r.back).toBe(512); // it only grows while the pair lives
  expect(r.kept).toBe(true);
  expect(r.same).toBe(true);
});

// ---------------------------------------------------------------- the cell frame

test("the exact frame is the float64 frame wherever float64 works", async ({ page }) => {
  const r = await page.evaluate(() => {
    let s = 7;
    const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x80000000; };
    const out = { checked: 0, holeMismatch: 0, centerWorst: 0, levelMismatch: 0 };
    for (const ftype of [FTYPE.CARPET, FTYPE.GASKET]) {
      for (let i = 0; i < 400; i++) {
        const cx = rnd() * 4 - 2, cy = rnd() * 4 - 2, scale = 10 ** (-(rnd() * 9)); // the float64 center is good to ~1e-5 of a cell here
        const aspect = 0.5 + rnd();
        const a = digitCellFrame(ftype, cx, cy, scale, aspect);
        const b = digitCellFrame(ftype, cx, cy, scale, aspect, { ex: toExact(cx, 192), ey: toExact(cy, 192), bits: 192 });
        out.checked++;
        if (a.level !== b.level) out.levelMismatch++;
        if (a.holes.join() !== b.holes.join()) out.holeMismatch++;
        out.centerWorst = Math.max(out.centerWorst, Math.abs(a.center[0] - b.center[0]), Math.abs(a.center[1] - b.center[1]));
      }
    }
    return out;
  });
  expect(r.checked).toBe(800);
  expect(r.levelMismatch).toBe(0);
  expect(r.holeMismatch).toBe(0);
  expect(r.centerWorst).toBeLessThan(1e-5);
});

test("the exact frame's holes match a digit-by-digit walk of the center at level 150 to 600", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = [];
    let s = 99;
    const rnd = (n) => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return Math.floor((s / 0x80000000) * n); };
    for (const [ftype, base] of [[FTYPE.GASKET, 2], [FTYPE.CARPET, 3]]) {
      for (const k of [150, 300, 600]) {
        // The fractions' digits, then the same value as a BigInt at plenty of bits.
        const B = BigInt(base);
        const m = k + 6;
        for (const trial of ["random", "ones"]) {
          const dx = [], dy = [];
          for (let i = 0; i < m; i++) {
            if (trial === "ones") { dx.push(i < k - 1 ? rnd(base) : 1); dy.push(i < k - 1 ? [0, base - 1][rnd(2)] : 1); } // a hole at the very last level
            else { dx.push(rnd(base)); dy.push(rnd(base)); }
          }
          let nx = 0n, ny = 0n;
          for (let i = 0; i < m; i++) { nx = nx * B + BigInt(dx[i]); ny = ny * B + BigInt(dy[i]); }
          const bits = 1344;
          const den = B ** BigInt(m);
          const ex = (nx << BigInt(bits)) / den, ey = (ny << BigInt(bits)) / den;
          // Scale chosen so that the frame's level is exactly k: cells at level k just wider than the half-diagonal.
          const aspect = 1;
          const scale = (1 / base ** k) / Math.SQRT2 * 0.999;
          if (digitCellLevel(ftype, scale, aspect) !== k) { out.push({ k, base, trial, wrongLevel: digitCellLevel(ftype, scale, aspect) }); continue; }
          const f = digitCellFrame(ftype, 0, 0, scale, aspect, { ex, ey, bits });
          // The center cell's hole level: the first of the k digits where both are 1.
          let want = -1;
          for (let i = 0; i < k; i++) if (dx[i] === 1 && dy[i] === 1) { want = i; break; }
          out.push({ k, base, trial, got: f.holes[4], want, level: f.level });
        }
      }
    }
    return out;
  });
  for (const o of r) {
    expect(o.wrongLevel, `${o.base} ${o.k}`).toBeUndefined();
    expect(o.level).toBe(o.k);
    expect(o.got, `base ${o.base}, level ${o.k}, ${o.trial}`).toBe(o.want);
  }
  expect(r.some((o) => o.want >= 0), "some trial has a hole").toBe(true);
});

test("the frame costs about a millisecond a frame at level 600, and the measured cost is logged", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const [name, ftype] of [["Gasket", FTYPE.GASKET], ["Carpet", FTYPE.CARPET]]) {
      const scale = 1e-290, bits = exactBitsFor(scale);
      const ex = (1n << BigInt(bits)) / 3n + 12345n, ey = (2n << BigInt(bits)) / 3n + 999n;
      const t0 = performance.now();
      const n = 200;
      for (let i = 0; i < n; i++) digitCellFrame(ftype, 0, 0, scale, 1.6, { ex: ex + BigInt(i), ey, bits });
      out[name] = { ms: (performance.now() - t0) / n, level: digitCellLevel(ftype, scale, 1.6) };
    }
    return out;
  });
  console.log("digitCellFrame cost per call at 1e-290:", JSON.stringify(r));
  expect(r.Gasket.ms).toBeLessThan(5);
  expect(r.Carpet.ms).toBeLessThan(5);
});

// ---------------------------------------------------------------- the picture

for (const name of ["Gasket", "Carpet"]) {
  for (const [label, scale] of [["1e-20", 1e-20], ["1e-40", 1e-40], ["1e-100", 1e-100], ["1e-200", 1e-200], ["1e-290", 1e-290]]) {
    test(`${name} at ${label}: a view moved N pixels shows the same picture N pixels over`, async ({ page }) => {
      await setDeep(page, name, scale);
      await settle(page);
      const a = await canvasPixels(page);
      expect(variety(a), "the view has structure to compare").toBeGreaterThan(8);
      const N = 60;
      const info = await page.evaluate((n) => {
        const cy = mainState.cy;
        const px = 2 * mainState.scale / mainRenderer.canvas.height; // world units per device pixel
        moveCenter(mainState, 0, n * px);
        requestRender();
        return { sameDouble: mainState.cy === cy, valid: exactValid(mainState) };
      }, N);
      // The point of the test: the double never moved (at 1e-20 it is a million times coarser than a pixel).
      expect(info.sameDouble).toBe(true);
      expect(info.valid).toBe(true);
      await settle(page);
      const b = await canvasPixels(page);
      const d = compareShifted(a, b, N);
      const unshifted = compareShifted(a, b, 0);
      console.log(`shifted compare, ${name} at ${label}:`, JSON.stringify(d), "unshifted:", JSON.stringify(unshifted));
      expect(d.mean, "mean channel difference").toBeLessThan(0.5);
      expect(d.over16, "share of pixels differing by more than 16").toBeLessThan(0.005);
      // And it is not the stalled picture: unshifted, the two images differ.
      expect(unshifted.mean).toBeGreaterThan(d.mean * 2);
    });
  }
}

// A view turned by 0.6 rad, moved N screen pixels down (screenToComplex maps the offset through the view's own
// rotation), against the same on a shallow view with the plain float64 center and frame, which is the picture
// quality that was shipped: the deep one must agree with itself at least as well. (A shifted picture is never
// bit-identical on every GPU: float32 digits and sampling noise differ by a percent of the pixels on WebKit.)
test("a turned view moved N pixels shows the same picture N pixels over, as well as a shallow float64 one does", async ({ page }) => {
  const N = 40;
  const run = async (scale, plain) => {
    await setDeep(page, "Gasket", scale);
    await page.evaluate(([p]) => {
      if (p) setCenter(mainState, mainState.cx, mainState.cy); // drop the pair: the float64 path
      mainState.rotation = 0.6;
      requestRender();
    }, [plain]);
    await settle(page);
    const a = await canvasPixels(page);
    expect(variety(a)).toBeGreaterThan(8);
    await page.evaluate((n) => {
      const rect = els.mainCanvas.getBoundingClientRect();
      const c = screenToComplex(mainRenderer, mainState, rect.width / 2, rect.height / 2 - n / mainRenderer.dpr);
      moveCenter(mainState, c.ox, c.oy);
      requestRender();
    }, N);
    await settle(page);
    return compareShifted(a, await canvasPixels(page), N);
  };
  const shallow = await run(1e-6, true);
  const deep = await run(1e-150, false);
  console.log("turned view, shifted compare: shallow float64", JSON.stringify(shallow), "deep exact", JSON.stringify(deep));
  expect(deep.mean).toBeLessThan(shallow.mean + 0.3);
  expect(deep.over16).toBeLessThan(shallow.over16 + 0.005);
});

test("shallow views and the existing places are drawn the same by the exact path as by float64", async ({ page }) => {
  const idx = await page.evaluate(() => TELEPORT_DESTINATIONS.map((d, i) => [d.fractal, i]).filter(([f]) => f === "Carpet" || f === "Gasket").map(([, i]) => i));
  expect(idx.length).toBeGreaterThan(2);
  for (const i of idx) {
    await page.evaluate((j) => window["__vt"].place(j), i);
    await settle(page);
    const a = await canvasPixels(page); // no exact pair: the float64 frame, as shipped
    expect(variety(a), "the place has structure").toBeGreaterThan(4);
    const has = await page.evaluate(() => {
      // The pair equal to the doubles (what a pan by nothing makes below the exact-from scale).
      setCenter(mainState, mainState.cx, mainState.cy, toExact(mainState.cx), toExact(mainState.cy));
      requestRender();
      return exactValid(mainState);
    });
    expect(has).toBe(true); // a pair now: the exact frame
    await settle(page);
    const b = await canvasPixels(page);
    const d = compareShifted(a, b, 0);
    console.log(`place ${i} exact vs float64:`, JSON.stringify(d));
    expect(d.mean).toBeLessThan(0.1);
    expect(d.over16).toBeLessThan(0.001);
  }
});

// ---------------------------------------------------------------- gestures

test("a wheel zoom about the cursor keeps the point under it fixed at 1e-100 and 1e-200", async ({ page }) => {
  for (const [name, scale] of [["Gasket", 1e-100], ["Carpet", 1e-200]]) {
    await setDeep(page, name, scale);
    const r = await page.evaluate(() => {
      const rect = els.mainCanvas.getBoundingClientRect();
      const lx = Math.round(rect.left + rect.width * 0.7) - rect.left, ly = Math.round(rect.top + rect.height * 0.3) - rect.top;
      const o = screenToComplex(mainRenderer, mainState, lx, ly);
      const c = exactCenter(mainState, 1200);
      return { x: String(c.ex + toExact(o.ox, 1200)), y: String(c.ey + toExact(o.oy, 1200)), lx, ly, left: rect.left, top: rect.top, height: rect.height };
    });
    await page.evaluate(({ left, top, lx, ly }) => {
      els.mainCanvas.dispatchEvent(new WheelEvent("wheel", { clientX: left + lx, clientY: top + ly, deltaY: -300, bubbles: true, cancelable: true }));
    }, r);
    await page.waitForTimeout(150);
    const after = await page.evaluate(({ lx, ly }) => {
      const o = screenToComplex(mainRenderer, mainState, lx, ly);
      const c = exactCenter(mainState, 1200);
      return { x: String(c.ex + toExact(o.ox, 1200)), y: String(c.ey + toExact(o.oy, 1200)), scale: mainState.scale, valid: exactValid(mainState) };
    }, r);
    expect(after.scale).toBeLessThan(scale);
    expect(after.valid).toBe(true);
    const [dx, dy] = await diffs(page, [[after.x, r.x], [after.y, r.y]], 1200);
    expect(Math.hypot(dx, dy), name).toBeLessThan(after.scale * 2 / r.height * 1e-3);
  }
});

test("a one-finger drag at 1e-100 moves the exact center by the drag", async ({ page }) => {
  await setDeep(page, "Carpet", 1e-100);
  const rect = await page.evaluate(() => {
    const r = els.mainCanvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, per: 2 * mainState.scale * mainRenderer.dpr / els.mainCanvas.height };
  });
  const before = await page.evaluate(() => { const c = exactCenter(mainState, 448); return { x: String(c.ex), y: String(c.ey) }; });
  const x0 = rect.left + rect.width / 2, y0 = rect.top + rect.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 60, y0 + 30, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => { const c = exactCenter(mainState, 448); return { x: String(c.ex), y: String(c.ey), valid: exactValid(mainState) }; });
  expect(after.valid).toBe(true);
  const [dx, dy] = await diffs(page, [[after.x, before.x], [after.y, before.y]], 448);
  expect(Math.abs(dx / (-60 * rect.per) - 1)).toBeLessThan(1e-6);
  expect(Math.abs(dy / (30 * rect.per) - 1)).toBeLessThan(1e-6);
});

test("the arrow keys and +/- at 1e-100 keep the exact center", async ({ page }) => {
  await setDeep(page, "Gasket", 1e-100);
  const r = await page.evaluate(() => {
    const e0 = exactCenter(mainState, 448);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    const e1 = exactCenter(mainState, 448);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    const e2 = exactCenter(mainState, 448);
    return { movedX: e1.ex !== e0.ex, movedY: e2.ey !== e1.ey, valid: exactValid(mainState), scale: mainState.scale };
  });
  expect(r.movedX).toBe(true);
  expect(r.movedY).toBe(true);
  expect(r.valid).toBe(true);
  expect(r.scale).toBeLessThan(1e-100);
});

test("Back restores the exact center and its length, not just the double", async ({ page }) => {
  await setDeep(page, "Carpet", 1e-100);
  const r = await page.evaluate(() => {
    moveCenter(mainState, 7e-103, -3e-103);
    const a = exactCenter(mainState, 448);
    const aScale = mainState.scale;
    pushHistory("main");
    mainState.scale = 1e-250;
    moveCenter(mainState, 5e-253, 5e-253); // grows the pair to 896 bits
    const grown = exactFrac(mainState);
    popHistory("main");
    const b = exactCenter(mainState, 448);
    return { same: a.ex === b.ex && a.ey === b.ey, valid: exactValid(mainState), scale: mainState.scale === aScale, grown, ef: exactFrac(mainState) };
  });
  expect(r.grown).toBeGreaterThan(448);
  expect(r.same).toBe(true);
  expect(r.valid).toBe(true);
  expect(r.scale).toBe(true);
  expect(r.ef).toBe(448);
});

// ---------------------------------------------------------------- share links

test("a deep link carries the exact center at the scale's own length and opens at it", async ({ page }) => {
  for (const [name, scale] of [["Gasket", 1e-100], ["Carpet", 1e-290], ["Gasket", 1e-20]]) {
    await setDeep(page, name, scale);
    const r = await page.evaluate(() => {
      moveCenter(mainState, 7.3 * mainState.scale / 1000, -4.1 * mainState.scale / 1000);
      const F = exactFracFor(mainState);
      const a = exactCenter(mainState, F);
      const hash = buildShareHash();
      const p = new URLSearchParams(hash.slice(1));
      const n = hash.length;
      // Somewhere else first, so the link has to bring the view back.
      setCenter(mainState, -0.5, 0);
      mainState.scale = 1;
      applyShareLink("https://example.test/" + hash);
      const b = exactCenter(mainState, F);
      return { hasFields: p.has("ex") && p.has("ey"), len: p.get("ex").length, same: a.ex === b.ex && a.ey === b.ey,
        valid: exactValid(mainState), scale: mainState.scale, linkChars: n, f: p.get("f") };
    });
    console.log(`${name} at ${scale}: link is ${r.linkChars} characters`);
    expect(r.hasFields).toBe(true);
    expect(r.same, `${name} ${scale}`).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.scale).toBe(scale);
    // 1e-20 keeps the 192-bit format a 1.62.x build reads; deeper links have a longer one that older builds leave out.
    if (scale === 1e-20) expect(r.len).toBeLessThanOrEqual(52);
    else expect(r.len).toBeGreaterThan(52);
  }
});

test("an old-style link (no ex, ey) opens with its doubles as the exact center, for a deep view too", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const [name, x, y, s] of [["Gasket", 0.3333333333333333, 0.6666666666666666, 1e-20], ["Carpet", 0.5, 0.25, 1e-10], ["Gasket", 0.3333333333333333, 0.6666666666666666, 1e-5]]) {
      const old = "#v=1&m=fractal&f=" + name + "&x=" + x + "&y=" + y + "&s=" + s + "&r=0&i=300&cm=Classic";
      const st = parseShareHash(old);
      setCenter(mainState, 0.1, 0.1);
      mainState.scale = 1e-30;
      moveCenter(mainState, 1e-33, 0); // an exact pair the link must not inherit
      applyShareLink("https://example.test/" + old);
      const F = exactFracFor(mainState);
      const e = exactCenter(mainState, F);
      out[name + s] = { parsed: !!st, exact: st && st.exact, cx: mainState.cx === x, cy: mainState.cy === y, ex: e.ex === toExact(x, F), ey: e.ey === toExact(y, F), scale: mainState.scale === s };
    }
    return out;
  });
  for (const [k, v] of Object.entries(r)) {
    expect(v, k).toEqual({ parsed: true, exact: null, cx: true, cy: true, ex: true, ey: true, scale: true });
  }
});

test("a tampered or too long pair is ignored and the link opens at its doubles", async ({ page }) => {
  await setDeep(page, "Gasket", 1e-100);
  const r = await page.evaluate(() => {
    moveCenter(mainState, 9e-103, 2e-103);
    const good = buildShareHash();
    const p = new URLSearchParams(good.slice(1));
    const base = "#v=1&m=fractal&f=Gasket&x=" + p.get("x") + "&y=" + p.get("y") + "&s=1e-100&r=0&i=300&cm=Classic";
    const bad = {
      ok: good,
      notHex: base + "&ex=zz&ey=1",
      onlyOne: good.replace(/&ey=[^&]*/, ""),
      tooLong: base + "&ex=" + "f".repeat(200) + "&ey=1",
      wrongDouble: base + "&ex=1&ey=1",
      // The link's own scale sets the length: the same hex under a scale that wants 192 bits does not fit it.
      wrongScale: good.replace("s=1e-100", "s=1e-20"),
    };
    const out = {};
    for (const [k, h] of Object.entries(bad)) { const st = parseShareHash(h); out[k] = st ? !!st.exact : "rejected"; }
    return out;
  });
  expect(r).toEqual({ ok: true, notHex: false, onlyOne: false, tooLong: false, wrongDouble: false, wrongScale: false });
});

// ---------------------------------------------------------------- the floor and the card

test("the floor is 1e-300: every way of zooming stops there, the card says so, and the text holds", async ({ page }) => {
  const r = await page.evaluate(() => {
    selectFractal("Gasket", { fresh: true });
    const floor = minScaleFor(mainState);
    setCenter(mainState, 0.3333333333333333, 0.6666666666666666);
    mainState.scale = floor * 1.5;
    const rect = els.mainCanvas.getBoundingClientRect();
    for (let i = 0; i < 4; i++) {
      els.mainCanvas.dispatchEvent(new WheelEvent("wheel", { clientX: Math.round(rect.left + rect.width / 2), clientY: Math.round(rect.top + rect.height / 2), deltaY: -600, bubbles: true, cancelable: true }));
    }
    showHud();
    updateHud(null);
    return { floor, scale: mainState.scale, valid: exactValid(mainState), hud: els.hudPlain.textContent,
      carpetFloor: minScaleFor({ ftype: FRACTAL_CONFIGS["Carpet"].ftype, cx: 0, cy: 0, scale: 1e-20 }), exported: DIGIT_MIN_SCALE };
  });
  expect(r.floor).toBe(1e-300);
  expect(r.exported).toBe(1e-300);
  expect(r.carpetFloor).toBe(1e-300);
  expect(r.scale).toBe(1e-300);
  expect(r.valid).toBe(true);
  expect(r.hud).toContain("As deep as this fractal goes");
  expect(r.hud).not.toMatch(/NaN|Infinity|undefined/);
});

test("the zoom phrase at 1e-300 is a plain number, not a broken string", async ({ page }) => {
  const r = await page.evaluate(() => [zoomPhrase(1, 1e-300), zoomPhrase(1.3, 1e-100), zoomPhrase(1.3, 1e-20)]);
  for (const t of r) expect(t).not.toMatch(/NaN|Infinity|undefined/);
});
