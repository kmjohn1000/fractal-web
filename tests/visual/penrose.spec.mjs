// The Penrose tiling mode (penrose.js): the tiling is cut from the viewport by Robinson-triangle deflation, so zoom
// shows finer tiles. Plain behavior checks, no screenshot baselines: the triangles of each level (counts, edge
// length, 36-degree directions, no gaps or overlaps), what the view draws at each depth and zoom (bounded counts,
// tiles of about 8-12 px, finer ones as you zoom), the exact deep zoom against an independent 256-bit reference,
// the level cross-fade, the picker entry, the share link (and 1.59.0's), the gestures and the depth player.
import { test, expect } from "@playwright/test";

/* global setMode, dragonState, dragonView, fittedVectorModes, fitVectorView, VECTOR_VIEWS, requestRender, els, mode,
   buildShareHash, parseShareHash, applyShareLink, startDepthPlay, stopDepthPlay, depthPlayer, PLAY_SPEEDS, PICKER_LAYOUT,
   EXTRA_MODES, LINE_CURVES, vectorAffine, vectorColors, SOLID_COLORS, vectorFitHalfHeight, vectorViewIsFitted, curveRamp, CURVE_LOOK,
   PENROSE_MIN_DEPTH, PENROSE_MAX_DEPTH, PENROSE_DEFAULT_DEPTH, PENROSE_HH_MIN, PENROSE_HH_MAX, PENROSE_ROOTS_B, PHI,
   penroseTrianglesD, penroseSubdivideB, penroseToFixed, penroseFromFixed, penroseLevel, penroseFloorLevel,
   penroseCenterB, penroseTypeMix, penroseClampHalfHeight, makePenroseRenderer, penrosePoints, VECTOR_CULL_MARGIN */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const COUNTS = [10, 20, 50, 130, 340, 890, 2330, 6100, 15970]; // triangles at levels 0-8: x phi^2 per level

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
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await page.waitForFunction(() => typeof setMode === "function" && typeof penroseTrianglesD === "function");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const frames = (page) => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));

// The mode on screen at a depth, the view fitted (or then changed by `view`, which can name an exact origin as
// hex strings ox, oy and a zoom z measured from the fitted view), no cross-fade from the last depth.
async function show(page, depth, view) {
  await page.evaluate(([depth, view]) => {
    setMode("penrose");
    dragonState.depth = depth;
    els.dragonDepthSlider.value = depth;
    fittedVectorModes.add("penrose");
    fitVectorView("penrose");
    dragonView.penrose.level.snap();
    if (view) {
      const { ox, oy, z, ...rest } = view;
      Object.assign(dragonView.view, rest);
      if (ox !== undefined) { dragonView.view.ox = BigInt(ox); dragonView.view.oy = BigInt(oy); dragonView.view.cx = 0; dragonView.view.cy = 0; }
      if (z !== undefined) dragonView.view.halfHeight = vectorFitHalfHeight("penrose") / z;
    }
    requestRender();
  }, [depth, view ?? null]);
  await frames(page);
}

// A generic place deep in the tiling, as an exact center: the centroid of a triangle 40 levels down (seeded
// walk), in the app's 128-bit fixed point, as hex strings. In page code: place(seed) -> [ox, oy].
const PLACE = `(seed) => {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let t = PENROSE_ROOTS_B[Math.floor(rnd() * 10)];
  for (let i = 0; i < 40; i++) { const ch = penroseSubdivideB(t); t = ch[Math.floor(rnd() * ch.length)]; }
  return [((t[1] + t[3] + t[5]) / 3n).toString(), ((t[2] + t[4] + t[6]) / 3n).toString()];
}`;

test.describe("the triangles of each level", () => {
  test("20, 50, 130, 340, 890, 2330 triangles at levels 1-6 from the ten of the start, blue over red approaching phi", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (let l = 0; l <= 8; l++) {
        const tris = penroseTrianglesD(l), blue = tris.filter((t) => t[0] === 1).length;
        out.push({ l, n: tris.length, blue, red: tris.length - blue });
      }
      return out;
    });
    expect(r.map((o) => o.n)).toEqual(COUNTS);
    expect(r[0].blue, "the start is ten red triangles").toBe(0);
    let prev = 0;
    for (const o of r.slice(3)) {
      const ratio = o.blue / o.red;
      expect(Math.abs(ratio - 1.618034), `level ${o.l}: blue/red ${ratio.toFixed(4)}`).toBeLessThan(Math.abs(prev - 1.618034) + 1e-9);
      prev = ratio;
    }
    expect(Math.abs(prev - 1.618034), "blue/red at level 8").toBeLessThan(0.005);
  });

  test("every edge is phi^-n long at a multiple of 36 degrees, and the triangles are the right shapes", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (let l = 0; l <= 7; l++) {
        let lenErr = 0, angErr = 0, shapeErr = 0;
        for (const t of penroseTrianglesD(l)) {
          const [col, ax, ay, bx, by, cx, cy] = t;
          for (const [dx, dy] of [[bx - ax, by - ay], [cx - ax, cy - ay]]) {
            lenErr = Math.max(lenErr, Math.abs(Math.hypot(dx, dy) - Math.pow(PHI, -l)));
            const a = (Math.atan2(dy, dx) * 180) / Math.PI / 36;
            angErr = Math.max(angErr, Math.abs(a - Math.round(a)));
          }
          // the angle at the apex: 36 degrees (thin rhomb's red triangle) or 108 (thick rhomb's blue)
          const u = [bx - ax, by - ay], w = [cx - ax, cy - ay];
          const apex = (Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w))) * 180) / Math.PI;
          shapeErr = Math.max(shapeErr, Math.abs(apex - (col === 0 ? 36 : 108)));
        }
        out.push({ l, lenErr, angErr, shapeErr });
      }
      return out;
    });
    for (const o of r) {
      expect(o.lenErr, `level ${o.l} edge length`).toBeLessThan(1e-12);
      expect(o.angErr, `level ${o.l} direction, in units of 36 degrees`).toBeLessThan(1e-9);
      expect(o.shapeErr, `level ${o.l} apex angle`).toBeLessThan(1e-7);
    }
  });

  test("no gaps and no overlaps: the areas add up to the decagon and every interior vertex has 360 degrees", async ({ page }) => {
    const r = await page.evaluate(() => {
      const decagon = 10 * 0.5 * Math.sin(Math.PI / 5);
      const out = [];
      for (let l = 0; l <= 6; l++) {
        const tris = penroseTrianglesD(l);
        let area = 0;
        const sums = new Map();
        const add = (x, y, a) => { const k = `${Math.round(x * 1e8)},${Math.round(y * 1e8)}`; const e = sums.get(k) || { x, y, s: 0 }; e.s += a; sums.set(k, e); };
        for (const t of tris) {
          const P = [[t[1], t[2]], [t[3], t[4]], [t[5], t[6]]];
          area += Math.abs((t[3] - t[1]) * (t[6] - t[2]) - (t[5] - t[1]) * (t[4] - t[2])) / 2;
          for (let i = 0; i < 3; i++) {
            const [px, py] = P[i], [qx, qy] = P[(i + 1) % 3], [rx, ry] = P[(i + 2) % 3];
            const u = [qx - px, qy - py], w = [rx - px, ry - py];
            add(px, py, (Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w))) * 180) / Math.PI);
          }
        }
        let bad = 0, interior = 0;
        for (const e of sums.values()) if (Math.hypot(e.x, e.y) < 0.93) { interior++; if (Math.abs(e.s - 360) > 1e-6) bad++; }
        out.push({ l, areaErr: Math.abs(area - decagon), bad, interior });
      }
      return out;
    });
    for (const o of r) {
      expect(o.areaErr, `level ${o.l} area`).toBeLessThan(1e-12);
      expect(o.bad, `level ${o.l}: interior vertices (of ${o.interior}) whose angles do not add to 360`).toBe(0);
    }
  });

  test("the exact (BigInt) triangles are the doubles' to 1e-12 up to level 9, and the picture's corners are the decagon's", async ({ page }) => {
    const r = await page.evaluate(() => {
      let b = PENROSE_ROOTS_B, worst = 0;
      for (let l = 0; l <= 9; l++) {
        if (l > 0) b = b.flatMap(penroseSubdivideB);
        const d = penroseTrianglesD(l);
        for (let i = 0; i < d.length; i++) for (let j = 1; j < 7; j++) worst = Math.max(worst, Math.abs(penroseFromFixed(b[i][j]) - d[i][j]));
      }
      return { worst, corners: penrosePoints().map(([x, y]) => Math.hypot(x, y)) };
    });
    expect(r.worst).toBeLessThan(1e-12);
    for (const c of r.corners) expect(c).toBeCloseTo(1, 12);
  });
});

test.describe("what the view draws", () => {
  test("at the opening zoom the slider's depth is the level: 20, 50, ... triangles, two edges each, all of one length", async ({ page }) => {
    const r = await page.evaluate(async () => {
      const out = [];
      for (let d = PENROSE_MIN_DEPTH; d <= PENROSE_MAX_DEPTH; d++) {
        setMode("penrose");
        dragonState.depth = d;
        fittedVectorModes.add("penrose");
        fitVectorView("penrose");
        dragonView.penrose.level.snap();
        requestRender();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const canvas = VECTOR_VIEWS.penrose[1], aff = vectorAffine(dragonView.view, canvas.width, canvas.height);
        const { stats, layers } = dragonView.penrose;
        const L = layers[0];
        let lenErr = 0;
        for (let i = 0; i < L.n; i++) lenErr = Math.max(lenErr, Math.abs(Math.hypot(L.xy[4 * i + 2] - L.xy[4 * i], L.xy[4 * i + 3] - L.xy[4 * i + 1]) - aff.k * Math.pow(PHI, -d)));
        out.push({ d, tris: stats.tris, edges: L.n, level: stats.level, lam: stats.lam, second: stats.trisF, lenErr });
      }
      return out;
    });
    r.forEach((o, i) => expect(o, `depth ${i + 1}`).toMatchObject({ d: i + 1, tris: COUNTS[i + 1], edges: 2 * COUNTS[i + 1], level: i + 1, lam: i + 1, second: 0 }));
    for (const o of r) expect(o.lenErr, `depth ${o.d}: edge length in px`).toBeLessThan(0.01);
  });

  test("the depth slider runs 1 to 8, opens at 5, and every depth draws inside the canvas with its edges five-fold symmetric", async ({ page }) => {
    await show(page, 5);
    const r = await page.evaluate(async () => {
      const out = { min: els.dragonDepthSlider.min, max: els.dragonDepthSlider.max, start: LINE_CURVES.penrose.defaultDepth, def: PENROSE_DEFAULT_DEPTH, depths: [] };
      const canvas = VECTOR_VIEWS.penrose[1];
      for (let d = 1; d <= 8; d++) {
        dragonState.depth = d;
        els.dragonDepthSlider.value = d;
        dragonView.penrose.level.snap();
        fitVectorView("penrose");
        requestRender();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0, x0 = canvas.width, x1 = -1, y0 = canvas.height, y1 = -1;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (px[i] + px[i + 1] + px[i + 2] > 120) { lit++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
          }
        }
        out.depths.push({ d, lit, x0, x1, y0, y1, w: canvas.width, h: canvas.height });
      }
      return out;
    });
    expect([r.min, r.max]).toEqual(["1", "8"]);
    expect([r.start, r.def]).toEqual([5, 5]);
    for (const o of r.depths) {
      expect(o.lit, `depth ${o.d} is drawn`).toBeGreaterThan(200);
      expect(o.x0, `depth ${o.d} fits on the left`).toBeGreaterThan(0);
      expect(o.x1, `depth ${o.d} fits on the right`).toBeLessThan(o.w - 1);
      expect(o.y0, `depth ${o.d} fits at the top`).toBeGreaterThan(0);
      expect(o.y1, `depth ${o.d} fits at the bottom`).toBeLessThan(o.h - 1);
    }
  });

  test("zoom adds levels: 1e3, 1e6 and 1e10 draw a bounded count of tiles of about 8-12 px, and the smallest tile shrinks with zoom", async ({ page }) => {
    const out = [];
    for (const z of [1, 10, 1e3, 1e6, 1e10, 1e13, 1e15]) {
      const [ox, oy] = await page.evaluate(`(${PLACE})(11)`);
      await show(page, 5, { ox, oy, z, rotation: 0.3 });
      out.push(await page.evaluate((z) => {
        const canvas = VECTOR_VIEWS.penrose[1], aff = vectorAffine(dragonView.view, canvas.width, canvas.height);
        const { stats, layers } = dragonView.penrose;
        let minWorld = Infinity, maxWorld = 0, n = 0;
        for (const L of layers) {
          if (!L.drawn) continue;
          for (let i = 0; i < L.n; i++) {
            const w = Math.hypot(L.xy[4 * i + 2] - L.xy[4 * i], L.xy[4 * i + 3] - L.xy[4 * i + 1]) / aff.k;
            minWorld = Math.min(minWorld, w); maxWorld = Math.max(maxWorld, w); n++;
          }
        }
        return { z, tris: stats.tris, capped: stats.capped, nominal: stats.nominalPx, minWorld, maxWorld, top: stats.top, exact: stats.exact, extra: dragonView.extraLevels, n };
      }, z));
    }
    for (const o of out) {
      expect(o.capped, `zoom ${o.z}: not truncated`).toBe(false);
      expect(o.tris, `zoom ${o.z}: triangles drawn`).toBeLessThan(80000);
      expect(o.tris).toBeGreaterThan(100);
      if (o.z >= 10) {
        expect(o.nominal, `zoom ${o.z}: tile size in css px`).toBeGreaterThan(7.3);
        expect(o.nominal).toBeLessThan(12.01);
      }
    }
    expect(out.map((o) => o.exact), "doubles up to 1e6, the exact run from 1e10").toEqual([false, false, false, false, true, true, true]);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].minWorld, `the smallest drawn edge at ${out[i].z}x is smaller than at ${out[i - 1].z}x`).toBeLessThan(out[i - 1].minWorld * 0.999);
      expect(out[i].top, "more levels").toBeGreaterThan(out[i - 1].top);
    }
    // finer tiles really appear: at 1e10 an edge is about 1e-10 / (a few) of the star's radius, and the card counts the levels zoom added
    expect(out.find((o) => o.z === 1e10).minWorld).toBeLessThan(2e-9);
    expect(out.find((o) => o.z === 1e10).extra).toBeGreaterThan(40);
    expect(out.find((o) => o.z === 1).extra).toBe(0);
  });

  test("the level rule: the slider at the opening zoom, a level per phi of zoom, the floor level from 10x", async ({ page }) => {
    const r = await page.evaluate(() => {
      const kFit = 180, floor = penroseFloorLevel(kFit, 12), lg = (z) => Math.log(z) / Math.log(PHI);
      return {
        floor, edgeAtFloor: kFit * Math.pow(PHI, -floor), edgeBelow: kFit * Math.pow(PHI, -(floor - 1)),
        at1: [3, 5, 8].map((s) => penroseLevel(s, 1, floor)),
        at10: [3, 5, 8].map((s) => penroseLevel(s, 10, floor) - lg(10)),
        at1e9: [3, 5, 8].map((s) => penroseLevel(s, 1e9, floor) - lg(1e9)),
        out: penroseLevel(1, 1e-6, floor),
      };
    });
    expect(r.edgeAtFloor).toBeLessThanOrEqual(12);
    expect(r.edgeBelow).toBeGreaterThan(12);
    expect(r.at1).toEqual([3, 5, 8]);
    expect(r.at10).toEqual([6, 6, 8].map((v) => expect.closeTo(v, 9)));
    expect(r.at1e9).toEqual([6, 6, 8].map((v) => expect.closeTo(v, 9)));
    expect(r.out, "never below level 1").toBe(1);
  });

  test("the level slider cross-fades: a step shows both levels at the middle and one at the ends, and it settles on the new level", async ({ page }) => {
    const r = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 400; canvas.height = 400;
      const ctx = canvas.getContext("2d");
      const rd = makePenroseRenderer(), view = { cx: 0, cy: 0, halfHeight: 1.3, rotation: 0, ox: 0n, oy: 0n };
      const aff = vectorAffine(view, 400, 400);
      const at = (depth, now) => {
        const s = rd.render(ctx, view, aff, { depth, fitHalfHeight: 1.3, colorIndex: 3, ramp: curveRamp(3), dpr: 1, lite: false, animate: true, look: CURVE_LOOK, now });
        return { c: s.trisC, f: s.trisF, level: s.level, busy: s.busy, lam: s.lam };
      };
      return { start: at(5, 0), t0: at(6, 0), quarter: at(6, 112), half: at(6, 225), late: at(6, 400), end: at(6, 460), still: at(6, 5000), noAnim: (() => {
        const s = rd.render(ctx, view, aff, { depth: 3, fitHalfHeight: 1.3, colorIndex: 3, ramp: curveRamp(3), dpr: 1, lite: false, animate: false, look: CURVE_LOOK, now: 6000 });
        return { c: s.trisC, f: s.trisF, level: s.level, busy: s.busy };
      })() };
    });
    expect(r.start).toMatchObject({ c: 890, f: 0, level: 5, busy: false });
    expect(r.t0).toMatchObject({ c: 890, f: 0, busy: true });
    expect(r.quarter, "a quarter of the way is still the old level (the fade is in the middle half)").toMatchObject({ c: 890, f: 0, busy: true });
    expect(r.half, "half way: both levels").toMatchObject({ c: 890, f: 2330, level: 5, busy: true });
    expect(r.half.lam).toBeCloseTo(5.5, 1);
    expect(r.late, "nearly there: only the new level (the coarse one, level 5, is gone)").toMatchObject({ c: 0, f: 2330, level: 5, busy: true });
    expect(r.end).toMatchObject({ c: 2330, f: 0, level: 6, busy: false });
    expect(r.still).toMatchObject({ c: 2330, f: 0, level: 6, busy: false });
    expect(r.noAnim, "without animation (reduced motion) the level is the slider's at once").toMatchObject({ c: 130, f: 0, level: 3, busy: false });
  });

  test("a gesture frame (lite) is one level coarser and one layer, so it draws fewer triangles", async ({ page }) => {
    await show(page, 6);
    const r = await page.evaluate(() => {
      const canvas = VECTOR_VIEWS.penrose[1], ctx = canvas.getContext("2d"), view = dragonView.view, aff = vectorAffine(view, canvas.width, canvas.height);
      const rd = makePenroseRenderer();
      const go = (lite, halfHeight) => {
        const v = { ...view, halfHeight: halfHeight ?? view.halfHeight }, a = vectorAffine(v, canvas.width, canvas.height);
        const s = rd.render(ctx, v, a, { depth: 6, fitHalfHeight: view.halfHeight, colorIndex: 3, ramp: curveRamp(3), dpr: 1, lite, animate: false, look: CURVE_LOOK, now: 0 });
        return { tris: s.tris, f: s.trisF, level: s.level };
      };
      void aff;
      return { full: go(false), lite: go(true), fullZoomed: go(false, view.halfHeight / 1e4), liteZoomed: go(true, view.halfHeight / 1e4) };
    });
    expect(r.lite.tris).toBeLessThan(r.full.tris);
    expect(r.lite.level).toBe(r.full.level - 1);
    expect(r.lite.f).toBe(0);
    expect(r.liteZoomed.tris, "zoomed in too").toBeLessThan(r.fullZoomed.tris);
  });

  test("zoomed in exactly, the picture is the 256-bit reference's at generic places from 1e5 (doubles) to 1e15 (exact)", async ({ page }) => {
    const results = [];
    for (const [seed, z, rotation] of [[3, 1e5, 0.3], [4, 1e8, -1.1], [5, 1e11, 2.2], [6, 1e12, 0.9], [7, 1e13, 0.1], [8, 1e14, -0.5], [9, 1e15, 1.7], [10, 1e15, 3.0]]) {
      const [ox, oy] = await page.evaluate(`(${PLACE})(${seed})`);
      await show(page, 5, { ox, oy, z, rotation });
      results.push(await page.evaluate(([seed, z]) => {
        // An independent reference: 256-bit fixed point, no hand-over to doubles, its own constants.
        const F = 256n, ONE = 1n << F;
        const isqrt = (n) => { if (n < 2n) return n; let x = 1n << BigInt((n.toString(2).length + 1) >> 1); for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; } };
        const S5 = isqrt(5n << (2n * F)), IP = (S5 - ONE) / 2n;
        const c18 = isqrt((10n * ONE + 2n * S5) << F) / 4n, s36 = isqrt((10n * ONE - 2n * S5) << F) / 4n, c36 = (ONE + S5) / 4n, s18 = (S5 - ONE) / 4n;
        const c5 = [ONE, c18, c36, s36, s18, 0n], s5 = [0n, s18, s36, c36, c18, ONE], cs = [], sn = [];
        for (let j = 0; j < 20; j++) {
          if (j <= 5) { cs[j] = c5[j]; sn[j] = s5[j]; } else if (j <= 10) { cs[j] = -c5[10 - j]; sn[j] = s5[10 - j]; } else { cs[j] = -cs[j - 10]; sn[j] = -sn[j - 10]; }
        }
        const roots = [];
        for (let i = 0; i < 10; i++) {
          let bx = cs[2 * i % 20], by = sn[2 * i % 20], cx = cs[(2 * i + 2) % 20], cy = sn[(2 * i + 2) % 20];
          if (i % 2 === 0) { [bx, cx] = [cx, bx]; [by, cy] = [cy, by]; }
          roots.push([0, 0n, 0n, bx, by, cx, cy]);
        }
        const mul = (v) => (v * IP) >> F;
        const kids = ([col, ax, ay, bx, by, cx, cy]) => {
          if (col === 0) { const px = ax + mul(bx - ax), py = ay + mul(by - ay); return [[0, cx, cy, px, py, bx, by], [1, px, py, cx, cy, ax, ay]]; }
          const qx = bx + mul(ax - bx), qy = by + mul(ay - by), rx = bx + mul(cx - bx), ry = by + mul(cy - by);
          return [[1, rx, ry, cx, cy, ax, ay], [1, qx, qy, rx, ry, bx, by], [0, rx, ry, qx, qy, ax, ay]];
        };
        const canvas = VECTOR_VIEWS.penrose[1], view = dragonView.view, aff = vectorAffine(view, canvas.width, canvas.height);
        const [cB0, cB1] = penroseCenterB(view), shift = F - 128n, cx0 = cB0 << shift, cy0 = cB1 << shift;
        const k256 = 2 ** -256, margin = VECTOR_CULL_MARGIN + 8 * dragonView.dpr;
        const { stats, layers } = dragonView.penrose;
        const report = { seed, z, exact: stats.exact, layers: [] };
        for (const li of [0, 1]) {
          const L = layers[li];
          if (!L.drawn) continue;
          const ref = [];
          const walk = (lev, t) => {
            const f = (v) => Number(v) * k256;
            const p = [f(t[1] - cx0), f(t[2] - cy0), f(t[3] - cx0), f(t[4] - cy0), f(t[5] - cx0), f(t[6] - cy0)];
            const sx = [0, 2, 4].map((i) => aff.hw + aff.a * p[i] + aff.b * p[i + 1]), sy = [0, 2, 4].map((i) => aff.hh + aff.c * p[i] + aff.d * p[i + 1]);
            if (sx.every((v) => v < -margin) || sx.every((v) => v > aff.w + margin) || sy.every((v) => v < -margin) || sy.every((v) => v > aff.h + margin)) return;
            if (lev === L.lev) { ref.push([sx[0], sy[0], sx[1], sy[1]], [sx[0], sy[0], sx[2], sy[2]]); return; }
            for (const c of kids(t)) walk(lev + 1, c);
          };
          for (const t of roots) walk(0, t);
          const cell = new Map(), key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
          ref.forEach((e, i) => { const kk = key(e[0], e[1]); (cell.get(kk) || cell.set(kk, []).get(kk)).push(i); });
          let unmatched = 0, worst = 0;
          for (let i = 0; i < L.n; i++) {
            const x0 = L.xy[4 * i], y0 = L.xy[4 * i + 1], x1 = L.xy[4 * i + 2], y1 = L.xy[4 * i + 3];
            let best = Infinity, bj = -1;
            for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
              for (const j of cell.get(key(x0 + gx, y0 + gy)) || []) {
                const e = ref[j], d = Math.max(Math.hypot(e[0] - x0, e[1] - y0), Math.hypot(e[2] - x1, e[3] - y1));
                if (d < best) { best = d; bj = j; }
              }
            }
            if (bj < 0 || best > 0.05) unmatched++; else worst = Math.max(worst, best);
          }
          // Every tile edge is drawn by both rhombs that share it, so the reference holds duplicates: the sets
          // are equal when every drawn edge is in the reference (above) and the counts agree.
          report.layers.push({ level: L.lev, drawn: L.n, ref: ref.length, unmatched, countGap: Math.abs(ref.length - L.n) / L.n, worstPx: worst });
        }
        return report;
      }, [seed, z]));
    }
    for (const rep of results) {
      expect(rep.layers.length, `zoom ${rep.z}: a layer drawn`).toBeGreaterThan(0);
      expect(rep.exact, `zoom ${rep.z}: runs exact`).toBe(rep.z >= 1e7);
      for (const L of rep.layers) {
        expect(L.drawn, `zoom ${rep.z} level ${L.level}: edges drawn`).toBeGreaterThan(100);
        expect(L.unmatched, `zoom ${rep.z} level ${L.level}: drawn edges with no reference edge within 0.05 px`).toBe(0);
        expect(L.countGap, `zoom ${rep.z} level ${L.level}: reference edges not drawn, as a share of the edges`).toBeLessThan(0.002);
        expect(L.worstPx, `zoom ${rep.z} level ${L.level}: worst error, px`).toBeLessThan(0.02);
      }
    }
  });

  test("the drawn edges keep their directions (multiples of 36 degrees from the view's turn) and one length at every depth", async ({ page }) => {
    const out = [];
    for (const [z, rotation] of [[1, 0.7], [1e4, -2.0], [1e12, 1.3]]) {
      const [ox, oy] = await page.evaluate(`(${PLACE})(21)`);
      await show(page, 5, { ox, oy, z, rotation });
      out.push(await page.evaluate((z) => {
        const canvas = VECTOR_VIEWS.penrose[1], aff = vectorAffine(dragonView.view, canvas.width, canvas.height);
        const det = aff.a * aff.d - aff.b * aff.c;
        let angErr = 0, lenErr = 0, n = 0;
        for (const L of dragonView.penrose.layers) {
          if (!L.drawn) continue;
          for (let i = 0; i < L.n; i++) {
            const dx = L.xy[4 * i + 2] - L.xy[4 * i], dy = L.xy[4 * i + 3] - L.xy[4 * i + 1];
            const wx = (aff.d * dx - aff.b * dy) / det, wy = (-aff.c * dx + aff.a * dy) / det;
            const a = (Math.atan2(wy, wx) * 180) / Math.PI / 36;
            angErr = Math.max(angErr, Math.abs(a - Math.round(a)));
            lenErr = Math.max(lenErr, Math.abs(Math.hypot(dx, dy) - aff.k * Math.pow(PHI, -L.lev)) / (aff.k * Math.pow(PHI, -L.lev)));
            n++;
          }
        }
        return { z, angErr, lenErr, n };
      }, z));
    }
    for (const o of out) {
      expect(o.n).toBeGreaterThan(100);
      expect(o.angErr, `zoom ${o.z}: direction error, in units of 36 degrees`).toBeLessThan(2e-3);
      expect(o.lenErr, `zoom ${o.z}: relative edge length error`).toBeLessThan(1e-4);
    }
  });

  test("the colors blend from the distance ramp to the tile types: the whole star is a gradient, a deep view has two tile colors", async ({ page }) => {
    const r = await page.evaluate(() => [1, 3, 10, 30, 100, 300, 1e4].map((z) => [z, penroseTypeMix(z)]));
    expect(r[0][1]).toBe(0);
    expect(r[2][1]).toBe(0);
    expect(r[5][1], "300x: nearly all the way").toBeGreaterThan(0.95);
    expect(r[6][1]).toBe(1);
    for (let i = 1; i < r.length; i++) expect(r[i][1]).toBeGreaterThanOrEqual(r[i - 1][1]);
    // Pixels: at 1x the lit colors vary with the distance from the center; at 1e10 a few colors (the two tile types) hold the picture.
    const colorsAt = async (z, place) => {
      await show(page, 5, place ? { ox: place[0], oy: place[1], z } : { z });
      return page.evaluate(() => {
        const canvas = VECTOR_VIEWS.penrose[1], px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const hist = new Map();
        for (let i = 0; i < px.length; i += 4) {
          if (px[i] + px[i + 1] + px[i + 2] < 400) continue; // the bright core of a line
          const key = `${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4}`;
          hist.set(key, (hist.get(key) || 0) + 1);
        }
        const top = [...hist.entries()].sort((a, b) => b[1] - a[1]);
        const total = top.reduce((s, e) => s + e[1], 0);
        return { distinct: top.length, topTwo: (top.slice(0, 2).reduce((s, e) => s + e[1], 0)) / total, total };
      });
    };
    const whole = await colorsAt(1);
    const [ox, oy] = await page.evaluate(`(${PLACE})(31)`);
    const deep = await colorsAt(1e10, [ox, oy]);
    expect(whole.total).toBeGreaterThan(200);
    expect(deep.total).toBeGreaterThan(2000);
    expect(deep.topTwo, "two tile colors carry the deep picture").toBeGreaterThan(0.5);
    expect(whole.topTwo, "the whole star is a gradient").toBeLessThan(deep.topTwo);
  });
});

test.describe("picker, info card and link", () => {
  test("the mode is in the picker exactly once, after the arrowhead, with its thumbnail and name", async ({ page }) => {
    const r = await page.evaluate(() => ({
      layout: PICKER_LAYOUT.flatMap((s) => s.groups.flatMap((g) => g.keys)).filter((k) => k === "penrose").length,
      group: PICKER_LAYOUT.flatMap((s) => s.groups).find((g) => g.keys.includes("penrose")).keys,
      modes: EXTRA_MODES.filter((m) => m.key === "penrose"),
      tiles: [...document.querySelectorAll("#fractalTypeRow .pickTile")].filter((t) => t.dataset.mode === "penrose").map((t) => ({
        text: t.textContent.trim(), src: t.querySelector("img")?.getAttribute("src"),
      })),
    }));
    expect(r.layout).toBe(1);
    expect(r.group.slice(-2)).toEqual(["arrowhead", "penrose"]);
    expect(r.modes).toEqual([{ key: "penrose", label: "Penrose tiling", category: "pattern" }]);
    expect(r.tiles).toEqual([{ text: "Penrose tiling", src: "icons/thumbs/penrose.webp" }]);
    const loaded = await page.evaluate(async () => {
      const res = await fetch("icons/thumbs/penrose.webp");
      const bmp = await createImageBitmap(await res.blob());
      return { ok: res.ok, w: bmp.width, h: bmp.height };
    });
    expect(loaded, "the thumbnail file loads and is a square image").toEqual({ ok: true, w: 192, h: 192 });
  });

  test("choosing the tile opens the mode: the line-curve row and canvas, at the default depth", async ({ page }) => {
    await page.evaluate(() => { document.querySelector('#fractalTypeRow .pickTile[data-mode="penrose"]').click(); });
    await page.waitForFunction(() => mode === "penrose");
    const r = await page.evaluate(async () => {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return {
        controlsShown: !els.dragonControls.classList.contains("hidden"), canvasShown: !els.dragonCanvas.classList.contains("hidden"),
        depth: dragonState.depth, curve: dragonView.curve, fitted: vectorViewIsFitted("penrose"), level: dragonView.penrose.stats.level,
      };
    });
    expect(r).toEqual({ controlsShown: true, canvasShown: true, depth: 5, curve: "penrose", fitted: true, level: 5 });
  });

  test("the share link carries mode, depth, view (a deep one exactly) and color, and opens to the same picture", async ({ page }) => {
    const [ox, oy] = await page.evaluate(`(${PLACE})(41)`);
    const r = await page.evaluate(async ([ox, oy]) => {
      setMode("penrose");
      dragonState.depth = 7;
      fittedVectorModes.add("penrose");
      vectorColors.penrose = SOLID_COLORS.findIndex((c) => c.name === "Gold");
      const out = {};
      for (const [name, view] of Object.entries({
        shallow: { cx: 0.12, cy: -0.05, halfHeight: 0.3, rotation: 0.7, ox: 0n, oy: 0n },
        deep: { cx: 0, cy: 0, halfHeight: 3e-13, rotation: -1.2, ox: BigInt(ox), oy: BigInt(oy) },
      })) {
        Object.assign(dragonView.view, view);
        const before = penroseCenterB(dragonView.view).map(String);
        const hash = buildShareHash(), parsed = parseShareHash(hash);
        // Away, and back through the link.
        setMode("koch");
        dragonState.depth = 2;
        Object.assign(dragonView.view, { cx: 0, cy: 0, halfHeight: 1, rotation: 0, ox: 0n, oy: 0n });
        vectorColors.penrose = 0;
        applyShareLink(`https://kmjohn1000.github.io/fractal-web/${hash}`);
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        out[name] = { hash, parsed: { ...parsed, exact: parsed.exact && parsed.exact.map(String) }, mode, depth: dragonState.depth, color: SOLID_COLORS[vectorColors.penrose].name,
          view: { cx: dragonView.view.cx, cy: dragonView.view.cy, halfHeight: dragonView.view.halfHeight, rotation: dragonView.view.rotation }, after: penroseCenterB(dragonView.view).map(String), before,
          slider: els.dragonDepthSlider.value, drawn: dragonView.penrose.stats.tris };
        vectorColors.penrose = SOLID_COLORS.findIndex((c) => c.name === "Gold");
      }
      return out;
    }, [ox, oy]);
    const s = r.shallow, d = r.deep;
    expect(s.hash).toContain("m=penrose");
    expect(s.hash).toContain("dp=7");
    expect(s.hash).toContain("pv=2");
    expect(s.hash, "no exact fields on a shallow view").not.toContain("ex=");
    expect(s.parsed).toMatchObject({ mode: "penrose", depth: 7, cx: 0.12, cy: -0.05, scale: 0.3, legacyView: false, exact: null });
    expect(s).toMatchObject({ mode: "penrose", depth: 7, color: "Gold", slider: "7" });
    expect(s.view).toMatchObject({ cx: 0.12, cy: -0.05, halfHeight: 0.3 });
    expect(s.view.rotation).toBeCloseTo(0.7, 9);
    expect(d.hash).toContain("ex=");
    expect(d.parsed.exact, "the exact center is in the link").toEqual(d.before);
    expect(d).toMatchObject({ mode: "penrose", depth: 7, color: "Gold", slider: "7" });
    expect(d.after, "the exact center comes back to the bit").toEqual(d.before);
    expect(d.view.halfHeight).toBe(3e-13);
    expect(d.view.rotation).toBeCloseTo(-1.2, 9);
    expect(d.drawn).toBeGreaterThan(100);
  });

  test("a junk value makes the link unreadable (so it is ignored), and older modes' links read as before", async ({ page }) => {
    const r = await page.evaluate(() => {
      const base = "#v=1&x=0&y=0&s=1&r=0&cm=Viridis";
      const out = {};
      for (const [name, q] of Object.entries({
        good: "m=penrose&pv=2&dp=5&c=0", tooDeep: "m=penrose&pv=2&dp=9&c=0", tooShallow: "m=penrose&pv=2&dp=0&c=0", fraction: "m=penrose&pv=2&dp=2.5&c=0", word: "m=penrose&pv=2&dp=abc&c=0",
        badColor: "m=penrose&pv=2&dp=5&c=99", otherName: "m=penrosee&pv=2&dp=5&c=0", hilbert: "m=hilbert&dp=5&c=0", arrowhead: "m=arrowhead&dp=7",
        exactOk: "m=penrose&pv=2&dp=5&ex=1f&ey=-a0", exactMissing: "m=penrose&pv=2&dp=5&ex=1f", exactJunk: "m=penrose&pv=2&dp=5&ex=xyz&ey=1", exactUpper: "m=penrose&pv=2&dp=5&ex=1F&ey=1",
        exactLong: `m=penrose&pv=2&dp=5&ex=${"f".repeat(41)}&ey=1`, exactBig: `m=penrose&pv=2&dp=5&ex=${"f".repeat(40)}&ey=1`, exactEmpty: "m=penrose&pv=2&dp=5&ex=&ey=",
        pvOther: "m=penrose&pv=3&dp=5&c=0",
      })) {
        const st = parseShareHash(`${base}&${q}`);
        out[name] = st ? { mode: st.mode, depth: st.depth, legacy: st.legacyView, exact: st.exact && st.exact.map(String) } : null;
      }
      // Too deep or too shallow a zoom is out of the limits for the new links.
      out.zoomTooDeep = !!parseShareHash("#v=1&x=0&y=0&s=1e-17&r=0&cm=Viridis&m=penrose&pv=2&dp=5&c=0");
      out.zoomLimit = !!parseShareHash("#v=1&x=0&y=0&s=1e-15&r=0&cm=Viridis&m=penrose&pv=2&dp=5&c=0");
      out.zoomOut = !!parseShareHash("#v=1&x=0&y=0&s=31&r=0&cm=Viridis&m=penrose&pv=2&dp=5&c=0");
      // A junk link applied to a view on screen leaves it alone.
      setMode("koch");
      applyShareLink(`https://kmjohn1000.github.io/fractal-web/${base}&m=penrose&pv=2&dp=abc&c=0`);
      out.modeAfterJunk = mode;
      return out;
    });
    expect(r.good).toEqual({ mode: "penrose", depth: 5, legacy: false, exact: null });
    for (const k of ["tooDeep", "tooShallow", "fraction", "word", "badColor", "otherName", "exactMissing", "exactJunk", "exactUpper", "exactLong", "exactBig", "exactEmpty"]) expect(r[k], k).toBeNull();
    expect(r.exactOk).toEqual({ mode: "penrose", depth: 5, legacy: false, exact: [String(0x1f), String(-0xa0)] });
    expect(r.pvOther, "a view version this app does not know is read as the old one").toMatchObject({ mode: "penrose", legacy: true });
    expect(r.hilbert).toEqual({ mode: "hilbert", depth: 5 });
    expect(r.arrowhead).toEqual({ mode: "arrowhead", depth: 7 });
    expect([r.zoomTooDeep, r.zoomLimit, r.zoomOut]).toEqual([false, true, false]);
    expect(r.modeAfterJunk).toBe("koch");
  });

  test("a 1.59.0 link (the L-system patch's view, depths 1-9) still opens: its depth and color kept (9 becomes 8), the star framed whole", async ({ page }) => {
    const r = await page.evaluate(async () => {
      const out = {};
      for (const dp of [3, 5, 9]) {
        // What 1.59.0 wrote: no pv, the old patch's center and zoom, rotation.
        const hash = `#v=1&m=penrose&x=0.35&y=-0.2&s=0.09&r=0.5&cm=Viridis&c=${SOLID_COLORS.findIndex((c) => c.name === "Gold")}&dp=${dp}`;
        setMode("koch");
        dragonView.penrose.level.snap(); // (a link opened from another mode does not cross-fade from the depth the tiling was left at)
        applyShareLink(`https://kmjohn1000.github.io/fractal-web/${hash}`);
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        out[dp] = {
          mode, depth: dragonState.depth, slider: els.dragonDepthSlider.value, color: SOLID_COLORS[vectorColors.penrose].name,
          fitted: vectorViewIsFitted("penrose"), rotation: dragonView.view.rotation, level: dragonView.penrose.stats.level, drawn: dragonView.penrose.stats.tris,
        };
      }
      return out;
    });
    const want = { 3: 3, 5: 5, 9: 8 };
    for (const dp of [3, 5, 9]) {
      expect(r[dp], `depth ${dp}`).toMatchObject({ mode: "penrose", depth: want[dp], slider: String(want[dp]), color: "Gold", fitted: true, rotation: 0, level: want[dp] });
      expect(r[dp].drawn).toBe(COUNTS[want[dp]]);
    }
  });
});

test.describe("gestures and play", () => {
  test("worldToScreen and screenToWorld agree at any rotation, and the view has a rotation", async ({ page }) => {
    await show(page, 5);
    const r = await page.evaluate(() => {
      const out = { has: typeof dragonView.view.rotation === "number", worst: 0 };
      for (const rotation of [0, 0.7, -2.1, 3]) {
        Object.assign(dragonView.view, { rotation, cx: 0.1, cy: -0.2, halfHeight: 0.4 });
        for (const [x, y] of [[0, 0], [0.5, 0.3], [-0.4, 0.8]]) {
          const [sx, sy] = dragonView.worldToScreen(x, y), [bx, by] = dragonView.screenToWorld(sx, sy);
          out.worst = Math.max(out.worst, Math.hypot(bx - x, by - y));
        }
      }
      return out;
    });
    expect(r.has).toBe(true);
    expect(r.worst).toBeLessThan(1e-9);
  });

  test("a two-finger twist turns the view and the picture, the edges stay at multiples of 36 degrees from it, and the picture is still there", async ({ page }) => {
    await show(page, 6);
    const r = await page.evaluate(async () => {
      HTMLElement.prototype.setPointerCapture = () => {};
      const view = VECTOR_VIEWS.penrose[0], canvas = VECTOR_VIEWS.penrose[1];
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const grab = () => Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data);
      await frame();
      const before = grab(), turnedBefore = view.view.rotation;
      const R = 80;
      fire("pointerdown", 1, cx - R, cy);
      fire("pointerdown", 2, cx + R, cy);
      for (let s = 1; s <= 10; s++) {
        const a = (Math.PI / 2) * (s / 10);
        fire("pointermove", 1, cx - R * Math.cos(a), cy - R * Math.sin(a));
        fire("pointermove", 2, cx + R * Math.cos(a), cy + R * Math.sin(a));
        await frame();
      }
      fire("pointerup", 1, 0, 0);
      fire("pointerup", 2, 0, 0);
      await new Promise((res) => setTimeout(res, 300));
      await frame();
      const after = grab();
      let changed = 0, lit = 0;
      for (let i = 0; i < after.length; i += 4) {
        if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2]) changed++;
        if (after[i] + after[i + 1] + after[i + 2] > 60) lit++;
      }
      const aff = vectorAffine(view.view, canvas.width, canvas.height), det = aff.a * aff.d - aff.b * aff.c, L = dragonView.penrose.layers[0];
      let angErr = 0;
      for (let i = 0; i < L.n; i++) {
        const dx = L.xy[4 * i + 2] - L.xy[4 * i], dy = L.xy[4 * i + 3] - L.xy[4 * i + 1];
        const a = (Math.atan2((-aff.c * dx + aff.a * dy) / det, (aff.d * dx - aff.b * dy) / det) * 180) / Math.PI / 36;
        angErr = Math.max(angErr, Math.abs(a - Math.round(a)));
      }
      return { turned: Math.abs(view.view.rotation - turnedBefore), changed, lit, total: canvas.width * canvas.height, angErr, tris: dragonView.penrose.stats.tris };
    });
    expect(r.turned, "rotation changed by about a quarter turn").toBeGreaterThan(1.2);
    expect(r.changed, "the picture turned").toBeGreaterThan(r.total * 0.01);
    expect(r.lit, "the frame isn't blank").toBeGreaterThan(r.total * 0.01);
    expect(r.angErr).toBeLessThan(2e-3);
    expect(r.tris, "the same tiling").toBe(COUNTS[6]);
  });

  test("the wheel zooms about the cursor to 1e15 and no further, in and out, and the point under the cursor stays under it (exactly, at depth)", async ({ page }) => {
    const [ox, oy] = await page.evaluate(`(${PLACE})(51)`);
    await show(page, 5, { ox, oy, z: 1e12, rotation: 0.4 });
    const r = await page.evaluate(async () => {
      const canvas = VECTOR_VIEWS.penrose[1], rect = canvas.getBoundingClientRect(), dpr = dragonView.dpr;
      const px = Math.round(rect.left + rect.width / 2) + 70, py = Math.round(rect.top + rect.height / 2) - 45; // whole numbers: a wheel event's coordinates are
      const sx = (px - rect.left) * dpr, sy = (py - rect.top) * dpr;
      const view = dragonView.view;
      const wheel = (dy) => canvas.dispatchEvent(new WheelEvent("wheel", { clientX: px, clientY: py, deltaY: dy, bubbles: true, cancelable: true }));
      // The exact world point under the cursor.
      dragonView.rebase();
      const [wx, wy] = dragonView.screenToWorld(sx, sy), [cB0, cB1] = penroseCenterB(view);
      const P = [cB0 + penroseToFixed(wx - view.cx), cB1 + penroseToFixed(wy - view.cy)];
      const where = () => {
        const aff = vectorAffine(view, canvas.width, canvas.height), [c0, c1] = penroseCenterB(view);
        const dx = penroseFromFixed(P[0] - c0), dy = penroseFromFixed(P[1] - c1);
        return [aff.hw + aff.a * dx + aff.b * dy, aff.hh + aff.c * dx + aff.d * dy];
      };
      const drift = [];
      for (const dy of [-300, -300, -300, 500, 500, -200, -700]) { wheel(dy); const [x, y] = where(); drift.push(Math.hypot(x - sx, y - sy)); }
      const mid = view.halfHeight;
      for (let i = 0; i < 60; i++) wheel(-2000);
      const deepest = view.halfHeight;
      for (let i = 0; i < 80; i++) wheel(2000);
      return { drift, mid, deepest, widest: view.halfHeight, limits: [PENROSE_HH_MIN, PENROSE_HH_MAX], clamp: [penroseClampHalfHeight(0), penroseClampHalfHeight(1e9)] };
    });
    for (const d of r.drift) expect(d, "px the point under the cursor moved").toBeLessThan(0.02);
    expect(r.deepest).toBe(r.limits[0]);
    expect(r.widest).toBe(r.limits[1]);
    expect(r.clamp).toEqual(r.limits);
  });

  test("a one-finger drag at 1e12 keeps the point under the finger under it", async ({ page }) => {
    const [ox, oy] = await page.evaluate(`(${PLACE})(61)`);
    await show(page, 5, { ox, oy, z: 1e12, rotation: -0.8 });
    const r = await page.evaluate(async () => {
      HTMLElement.prototype.setPointerCapture = () => {};
      const canvas = VECTOR_VIEWS.penrose[1], rect = canvas.getBoundingClientRect(), dpr = dragonView.dpr, view = dragonView.view;
      const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
      const x0 = Math.round(rect.left + rect.width / 2) - 30, y0 = Math.round(rect.top + rect.height / 2) + 20;
      fire("pointerdown", x0, y0);   // folds the offset into the origin, then holds the world point
      const [wx, wy] = dragonView.screenToWorld((x0 - rect.left) * dpr, (y0 - rect.top) * dpr), [cB0, cB1] = penroseCenterB(view);
      const P = [cB0 + penroseToFixed(wx - view.cx), cB1 + penroseToFixed(wy - view.cy)];
      const drift = [];
      for (let s = 1; s <= 8; s++) {
        const x = x0 + 9 * s, y = y0 - 5 * s;
        fire("pointermove", x, y);
        const aff = vectorAffine(view, canvas.width, canvas.height), [c0, c1] = penroseCenterB(view);
        const dx = penroseFromFixed(P[0] - c0), dy = penroseFromFixed(P[1] - c1);
        drift.push(Math.hypot(aff.hw + aff.a * dx + aff.b * dy - (x - rect.left) * dpr, aff.hh + aff.c * dx + aff.d * dy - (y - rect.top) * dpr));
      }
      fire("pointerup", 0, 0);
      return { drift, ox: view.ox !== 0n };
    });
    for (const d of r.drift) expect(d, "px the point under the finger moved").toBeLessThan(0.02);
    expect(r.ox, "the deep view's center is the exact origin").toBe(true);
  });

  test("Reset gives the whole star back, with the exact origin cleared", async ({ page }) => {
    const [ox, oy] = await page.evaluate(`(${PLACE})(71)`);
    await show(page, 5, { ox, oy, z: 1e9 });
    expect(await page.evaluate(() => vectorViewIsFitted("penrose"))).toBe(false);
    await page.evaluate(() => els.dragonResetBtn.click());
    await frames(page);
    const r = await page.evaluate(() => ({ fitted: vectorViewIsFitted("penrose"), ox: String(dragonView.view.ox), tris: dragonView.penrose.stats.tris }));
    expect(r).toEqual({ fitted: true, ox: "0", tris: COUNTS[5] });
  });

  test("Back undoes a zoom, exact origin included", async ({ page }) => {
    const [ox, oy] = await page.evaluate(`(${PLACE})(81)`);
    await show(page, 5, { ox, oy, z: 1e9 });
    const r = await page.evaluate(async () => {
      const canvas = VECTOR_VIEWS.penrose[1], rect = canvas.getBoundingClientRect();
      await new Promise((res) => setTimeout(res, 450)); // the first wheel tick of a page's first 400 ms is not a checkpoint
      const before = { ox: String(dragonView.view.ox), hh: dragonView.view.halfHeight, cx: dragonView.view.cx };
      canvas.dispatchEvent(new WheelEvent("wheel", { clientX: rect.left + 100, clientY: rect.top + 100, deltaY: -900, bubbles: true, cancelable: true }));
      const moved = dragonView.view.halfHeight !== before.hh;
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); // the Back button enables on the next render
      els.dragonBackBtn.click();
      return { moved, back: { ox: String(dragonView.view.ox), hh: dragonView.view.halfHeight, cx: dragonView.view.cx }, before };
    });
    expect(r.moved).toBe(true);
    expect(r.back).toEqual(r.before);
  });

  test("Play steps the depth up level by level from where it is, and the picture changes with it", async ({ page }) => {
    await show(page, 2);
    const r = await page.evaluate(async () => {
      const canvas = VECTOR_VIEWS.penrose[1];
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const grab = () => Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data).join(",");
      depthPlayer.speedIndex = 0; // 1/4 x: a step is 2.8 s, the cross-fade (about 0.5 s) settles in it
      const seen = [], pictures = new Set(), mids = [];
      startDepthPlay();
      seen.push(dragonState.depth);
      for (let i = 0; i < 200 && seen.length < 5; i++) {
        await new Promise((res) => setTimeout(res, 50));
        await frame();
        const s = dragonView.penrose.stats;
        if (s.trisC > 0 && s.trisF > 0) mids.push(s.level);
        if (dragonState.depth !== seen[seen.length - 1]) seen.push(dragonState.depth);
        if (!s.busy && s.level === dragonState.depth) pictures.add(grab());
      }
      stopDepthPlay();
      return { seen, slider: els.dragonDepthSlider.value, pictures: pictures.size, mids };
    });
    expect(r.seen.slice(0, 4)).toEqual([3, 4, 5, 6]);
    expect(r.pictures, "every level is a new picture").toBeGreaterThanOrEqual(3);
    expect(r.mids.length, "a cross-fade was on screen (both levels at once)").toBeGreaterThan(0);
  });

  test("Play turns round at the top, depth 8, and steps back down", async ({ page }) => {
    await show(page, 7);
    const r = await page.evaluate(async () => {
      depthPlayer.speedIndex = PLAY_SPEEDS.length - 1;
      const seen = [];
      startDepthPlay();
      seen.push(dragonState.depth);
      for (let i = 0; i < 120 && seen.length < 4; i++) {
        await new Promise((res) => setTimeout(res, 50));
        if (dragonState.depth !== seen[seen.length - 1]) seen.push(dragonState.depth);
      }
      stopDepthPlay();
      return seen;
    });
    expect(r).toEqual([8, 7, 6, 5]);
  });

  test("culling: a zoomed view draws only the triangles that show, and the view off the star draws none", async ({ page }) => {
    await show(page, 8);
    const r = await page.evaluate(() => {
      const canvas = VECTOR_VIEWS.penrose[1], ctx = canvas.getContext("2d");
      const rd = makePenroseRenderer(), fit = { ...dragonView.view };
      const draw = (view) => rd.render(ctx, view, vectorAffine(view, canvas.width, canvas.height), {
        depth: 8, fitHalfHeight: fit.halfHeight, colorIndex: 3, ramp: curveRamp(3), dpr: 1, lite: true, animate: false, look: CURVE_LOOK, now: 0 }).tris;
      return { full: draw(fit), away: draw({ ...fit, cx: 50, cy: 50 }), awayDeep: draw({ ...fit, cx: 5, cy: 5, halfHeight: 1e-4 }) };
    });
    expect(r.full).toBeGreaterThan(5000);
    expect(r.away).toBe(0);
    expect(r.awayDeep).toBe(0);
  });
});
