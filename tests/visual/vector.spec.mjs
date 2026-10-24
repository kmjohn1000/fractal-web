// Koch, Pythagoras tree, Hexaflake and Heighway dragon are drawn from the
// viewport (kochAdaptive, treeAdaptive, hexaflakeAdaptive, dragonAdaptive):
// only what's on screen, to about a pixel, with more levels than the depth
// slider's as you zoom in. These checks hold that machinery to the plain
// full-detail geometry (kochSnowflake, pythagorasTree, hexaflakeHexagons,
// dragonCurve) and to its own promises:
// culling changes nothing you can see, zoom adds detail, rotation works at
// depth, and a nonsense view from a hand-edited link can't hang the page.
// Deep-zoom screenshots are compared with baselines like app.spec.mjs's.
import { test, expect } from "@playwright/test";

/* global setMode, kochState, treeState, hexaflakeState, dragonState, fittedVectorModes, VECTOR_VIEWS, requestRender, renderAll,
   fitVectorView, vectorAffine, kochAdaptive, kochSnowflake, treeAdaptive, pythagorasTree, hexaflakeAdaptive, hexaflakeHexagons,
   dragonAdaptive, dragonCurve, createKochView, createPythagorasTreeView, createHexaflakeView, createCurveView, startDepthPlay,
   stopDepthPlay, vectorLite, mode, buildShareHash, parseShareHash, applyShareLink, els, HEX_SCALE, HEXAFLAKE_DEFAULT_DEPTH,
   vectorColors, hexaflakeView, activeVectorTarget */

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
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await page.waitForFunction(() => typeof setMode === "function" && typeof kochView !== "undefined");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

// Opens a pattern mode at a depth and view and waits for the frame to be drawn.
async function show(page, modeKey, depth, view) {
  await page.evaluate(([m, d, v]) => {
    setMode(m);
    if (m === "koch") kochState.depth = d;
    else if (m === "tree") treeState.depth = d;
    else if (m === "hexaflake") hexaflakeState.depth = d;
    else dragonState.depth = d;
    fittedVectorModes.add(m); // keep setMode's first-visit fit from replacing the view
    Object.assign(VECTOR_VIEWS[m][0].view, v);
    requestRender();
  }, [modeKey, depth, view]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

test.describe("matches the full-detail geometry", () => {
  // A canvas big enough that nothing is culled or merged: 1000 px per world
  // unit, the shape well inside. The adaptive walk, with no pixel limit and
  // no extra levels, must give the reference's points in the reference's order.
  test("Koch, depths 0-6", async ({ page }) => {
    const r = await page.evaluate(() => {
      let worst = 0;
      for (let depth = 0; depth <= 6; depth++) {
        const aff = vectorAffine({ cx: 0, cy: 0, halfHeight: 2, rotation: 0 }, 4000, 4000);
        const buf = new Float64Array(2 * 20000);
        const got = kochAdaptive(aff, buf, depth, 0, Infinity);
        const ref = kochSnowflake(depth);
        if (got.n !== ref.length) return { error: `depth ${depth}: ${got.n} points, expected ${ref.length}` };
        for (let i = 0; i < ref.length; i++) {
          const x = (buf[2 * i] - 2000) / aff.k, y = (2000 - buf[2 * i + 1]) / aff.k;
          worst = Math.max(worst, Math.hypot(x - ref[i][0], y - ref[i][1]));
        }
      }
      return { worst };
    });
    expect(r.error).toBeUndefined();
    expect(r.worst).toBeLessThan(1e-9);
  });

  test("tree, depths 0-10", async ({ page }) => {
    const r = await page.evaluate(() => {
      let worst = 0;
      for (let depth = 0; depth <= 10; depth++) {
        const aff = vectorAffine({ cx: 0, cy: 2, halfHeight: 4, rotation: 0 }, 4000, 4000);
        const buf = new Float64Array(4 * 4000);
        const got = treeAdaptive(aff, buf, depth, 0, Infinity);
        const ref = pythagorasTree(depth);
        if (got.n !== ref.length) return { error: `depth ${depth}: ${got.n} squares, expected ${ref.length}` };
        for (let i = 0; i < ref.length; i++) {
          const [A, B] = ref[i];
          worst = Math.max(worst, Math.hypot(buf[4 * i] - A[0], buf[4 * i + 1] - A[1]), Math.hypot(buf[4 * i + 2] - B[0], buf[4 * i + 3] - B[1]));
        }
      }
      return { worst };
    });
    expect(r.error).toBeUndefined();
    expect(r.worst).toBeLessThan(1e-9);
  });

  test("hexaflake, depths 0-5", async ({ page }) => {
    const r = await page.evaluate(() => {
      let worst = 0;
      for (let depth = 0; depth <= 5; depth++) {
        const aff = vectorAffine({ cx: 0, cy: 0, halfHeight: 2, rotation: 0 }, 4000, 4000);
        const buf = new Float64Array(2 * 20000), lvl = new Uint8Array(20002);
        const got = hexaflakeAdaptive(aff, buf, lvl, depth, 0, Infinity);
        const ref = hexaflakeHexagons(depth);
        if (got.n !== ref.length) return { error: `depth ${depth}: ${got.n} hexagons, expected ${ref.length}` };
        for (let i = 0; i < ref.length; i++) {
          if (lvl[i] !== ref[i][2]) return { error: `depth ${depth}: hexagon ${i} is level ${lvl[i]}, expected ${ref[i][2]}` };
          worst = Math.max(worst, Math.hypot(buf[2 * i] - ref[i][0], buf[2 * i + 1] - ref[i][1]));
        }
      }
      return { worst };
    });
    expect(r.error).toBeUndefined();
    expect(r.worst).toBeLessThan(1e-9);
  });

  test("dragon, depths 0-14", async ({ page }) => {
    const r = await page.evaluate(() => {
      let worst = 0;
      for (let depth = 0; depth <= 14; depth++) {
        const aff = vectorAffine({ cx: 0, cy: 0, halfHeight: 2, rotation: 0 }, 4000, 4000);
        const buf = new Float64Array(2 * 20000);
        const got = dragonAdaptive(aff, buf, depth, 0, Infinity);
        const ref = dragonCurve(depth);
        if (got.n !== ref.length) return { error: `depth ${depth}: ${got.n} points, expected ${ref.length}` };
        for (let i = 0; i < ref.length; i++) {
          const x = (buf[2 * i] - 2000) / aff.k, y = (2000 - buf[2 * i + 1]) / aff.k;
          worst = Math.max(worst, Math.hypot(x - ref[i][0], y - ref[i][1]));
        }
      }
      return { worst };
    });
    expect(r.error).toBeUndefined();
    expect(r.worst).toBeLessThan(1e-9);
  });
});

// Culling must be invisible: the same view drawn on a canvas twice the size
// (so nothing near the middle is culled) must match, pixel for pixel in the
// middle, the view drawn on the small one.
test.describe("culling changes nothing on screen", () => {
  const CASES = [
    { kind: "koch", depth: 5, fill: true, view: { cx: 0.2887, cy: 0.5, halfHeight: 0.06, rotation: 0 } },
    { kind: "koch", depth: 5, fill: false, view: { cx: 0.2887, cy: 0.5, halfHeight: 0.02, rotation: 0.7 } },
    { kind: "tree", depth: 9, view: { cx: -1.2, cy: 2.8, halfHeight: 0.4, rotation: 0 } },
    { kind: "tree", depth: 9, view: { cx: -1.2, cy: 2.8, halfHeight: 0.15, rotation: 1.1 } },
    { kind: "hexaflake", depth: 5, view: { cx: 0.7778, cy: 0.1925, halfHeight: 0.05, rotation: 0 } },
    { kind: "hexaflake", depth: 5, view: { cx: 0.7778, cy: 0.1925, halfHeight: 0.02, rotation: 0.7 } },
    // cx, cy null: a point a third of the way along the curve.
    { kind: "dragon", depth: 12, view: { cx: null, cy: null, halfHeight: 0.12, rotation: 0 } },
    { kind: "dragon", depth: 12, view: { cx: null, cy: null, halfHeight: 0.05, rotation: 0.6 } },
  ];
  for (const c of CASES) {
    test(`${c.kind} depth ${c.depth}, zoomed to ${c.view.halfHeight}, rotation ${c.view.rotation}${c.fill === false ? ", outline" : ""}`, async ({ page }) => {
      const r = await page.evaluate((c) => {
        const make = { koch: createKochView, tree: createPythagorasTreeView, hexaflake: createHexaflakeView, dragon: createCurveView }[c.kind];
        const mount = (w, h) => {
          const el = document.createElement("canvas");
          el.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px`;
          document.body.appendChild(el);
          return el;
        };
        const fit = { koch: 1.08, tree: 2.125, hexaflake: 1.0 }[c.kind] ?? 0.6;
        const centre = c.view.cx === null ? dragonCurve(c.depth)[Math.floor(2 ** c.depth / 3)] : [c.view.cx, c.view.cy];
        const draw = (w, h, scale) => {
          const el = mount(w, h);
          const v = make(el);
          Object.assign(v.view, c.view, { cx: centre[0], cy: centre[1], halfHeight: c.view.halfHeight * scale });
          v.render({ depth: c.depth, fill: c.fill !== false, colorIndex: 1, fitHalfHeight: fit * scale });
          const px = el.getContext("2d").getImageData(0, 0, el.width, el.height);
          return px;
        };
        const small = draw(500, 320, 1);
        const big = draw(1000, 640, 2);
        // The small frame is the big one's middle quarter.
        const ox = (big.width - small.width) / 2, oy = (big.height - small.height) / 2;
        let diff = 0, lit = 0;
        for (let y = 0; y < small.height; y++) {
          for (let x = 0; x < small.width; x++) {
            const i = 4 * (y * small.width + x), j = 4 * ((y + oy) * big.width + (x + ox));
            const d = Math.max(Math.abs(small.data[i] - big.data[j]), Math.abs(small.data[i + 1] - big.data[j + 1]), Math.abs(small.data[i + 2] - big.data[j + 2]));
            if (d > 64) diff++;
            if (small.data[i] + small.data[i + 1] + small.data[i + 2] > 60) lit++;
          }
        }
        return { diff, lit, total: small.width * small.height };
      }, c);
      expect(r.lit, "the view shows something").toBeGreaterThan(r.total * 0.01);
      expect(r.diff / r.total, `${r.diff} of ${r.total} pixels differ`).toBeLessThan(0.0005);
    });
  }
});

test.describe("zooming in adds detail", () => {
  const CASES = [
    { mode: "koch", depth: 4, point: { cx: 0.2887, cy: 0.5 }, fit: 1.08, zoom: 2000 },
    { mode: "tree", depth: 9, point: { cx: -2.2, cy: 3.0 }, fit: 2.125, zoom: 300 },
    { mode: "hexaflake", depth: 4, point: { cx: 1, cy: 0 }, fit: 1.0, zoom: 300 },
    { mode: "dragon", depth: 13, point: { cx: -0.35, cy: -0.24 }, fit: 0.9, zoom: 400 },
  ];
  for (const c of CASES) {
    test(`${c.mode}: no extra levels at the Reset framing, some deep in`, async ({ page }) => {
      await page.evaluate((m) => { setMode(m); fitVectorView(m); requestRender(); }, c.mode);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const fitted = await page.evaluate(([m, d]) => {
        const state = { koch: kochState, tree: treeState, hexaflake: hexaflakeState, dragon: dragonState }[m];
        state.depth = d;
        fitVectorView(m);
        renderAll();
        const v = VECTOR_VIEWS[m][0];
        return v.extraLevels;
      }, [c.mode, c.depth]);
      expect(fitted).toBe(0);

      await page.evaluate(() => document.querySelector(".hudToggleBtn").click()); // info card on
      await show(page, c.mode, c.depth, { ...c.point, halfHeight: 1 / c.zoom, rotation: 0 });
      const deep = await page.evaluate((m) => VECTOR_VIEWS[m][0].extraLevels, c.mode);
      expect(deep, "levels added beyond the slider's").toBeGreaterThan(2);
      // The info card says so, in its own words.
      await expect(page.locator("#hud")).toContainText(`Depth ${c.depth} (+${deep} from zoom)`, { useInnerText: false });
    });
  }
});

// Two fingers twisting at depth: the same synthetic pointer events the
// gesture handler gets from a real touch. (setPointerCapture refuses
// pointers the browser doesn't know, so it's stubbed.)
for (const m of ["koch", "tree", "hexaflake", "dragon"]) {
  test(`${m}: a two-finger twist at depth turns the view and keeps its detail`, async ({ page }) => {
    const depthView = {
      koch: { depth: 4, view: { cx: 0.2887, cy: 0.5, halfHeight: 1 / 500, rotation: 0 } },
      tree: { depth: 9, view: { cx: -2.2, cy: 3.0, halfHeight: 1 / 100, rotation: 0 } },
      hexaflake: { depth: 4, view: { cx: 1, cy: 0, halfHeight: 1 / 100, rotation: 0 } },
      dragon: { depth: 13, view: { cx: -0.35, cy: -0.24, halfHeight: 1 / 200, rotation: 0 } },
    }[m];
    await show(page, m, depthView.depth, depthView.view);
    const r = await page.evaluate(async ([m]) => {
      HTMLElement.prototype.setPointerCapture = () => {};
      const view = VECTOR_VIEWS[m][0], canvas = VECTOR_VIEWS[m][1];
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const R = 80;
      fire("pointerdown", 1, cx - R, cy);
      fire("pointerdown", 2, cx + R, cy);
      let before = view.view.rotation;
      // A quarter turn in steps, as the fingers swing round the middle.
      for (let s = 1; s <= 10; s++) {
        const a = (Math.PI / 2) * (s / 10);
        fire("pointermove", 1, cx - R * Math.cos(a), cy - R * Math.sin(a));
        fire("pointermove", 2, cx + R * Math.cos(a), cy + R * Math.sin(a));
        await frame();
      }
      fire("pointerup", 1, 0, 0);
      fire("pointerup", 2, 0, 0);
      await frame();
      const ctx = canvas.getContext("2d");
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 60) lit++;
      return { turned: Math.abs(view.view.rotation - before), extra: view.extraLevels, lit, total: canvas.width * canvas.height };
    }, [m]);
    expect(r.turned, "rotation changed by about a quarter turn").toBeGreaterThan(1.2);
    expect(r.extra, "still showing zoom detail").toBeGreaterThan(2);
    expect(r.lit, "frame isn't blank").toBeGreaterThan(r.total * 0.002);
  });
}

// A pinch while the depth player runs (the dragon at depth 16 took 200-400 ms
// a move on a phone-speed CPU and looked frozen): the view still zooms, the
// frame is drawn coarser while the fingers are down, and the frame at rest
// is exactly the full-detail one.
for (const m of ["koch", "tree", "hexaflake", "dragon"]) {
  test(`${m}: pinching during Play zooms, draws coarser while held, and is full detail on release`, async ({ page }) => {
    const depthView = {
      koch: { depth: 7, view: { cx: 0, cy: 0, halfHeight: 1, rotation: 0 } },
      tree: { depth: 11, view: { cx: 0, cy: 2, halfHeight: 2.5, rotation: 0 } },
      hexaflake: { depth: 6, view: { cx: 0, cy: 0, halfHeight: 1.2, rotation: 0 } },
      dragon: { depth: 16, view: { cx: -0.35, cy: -0.24, halfHeight: 1.2, rotation: 0 } },
    }[m];
    await show(page, m, depthView.depth, depthView.view);
    const r = await page.evaluate(async ([m]) => {
      HTMLElement.prototype.setPointerCapture = () => {};
      startDepthPlay();
      const view = VECTOR_VIEWS[m][0], canvas = VECTOR_VIEWS[m][1];
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const hh0 = view.view.halfHeight;
      fire("pointerdown", 1, cx - 60, cy);
      fire("pointerdown", 2, cx + 60, cy);
      let liteWhileHeld = false;
      for (let s = 1; s <= 8; s++) {
        fire("pointermove", 1, cx - 60 - s * 10, cy);
        fire("pointermove", 2, cx + 60 + s * 10, cy);
        await frame();
        liteWhileHeld = vectorLite;
      }
      fire("pointerup", 1, 0, 0);
      fire("pointerup", 2, 0, 0);
      const liteAfterRelease = vectorLite;
      stopDepthPlay();
      await frame();
      const grab = () => Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data);
      const atRest = grab();
      requestRender();
      await frame();
      const again = grab();
      let differ = 0;
      for (let i = 0; i < atRest.length; i++) if (atRest[i] !== again[i]) differ++;
      return { zoomed: hh0 / view.view.halfHeight, liteWhileHeld, liteAfterRelease, differ };
    }, [m]);
    expect(r.zoomed, "pinch out of Play zoomed in").toBeGreaterThan(1.5);
    expect(r.liteWhileHeld, "coarser frames while the fingers are down").toBe(true);
    expect(r.liteAfterRelease, "full detail as soon as the fingers lift").toBe(false);
    expect(r.differ, "the frame at rest is the full-detail frame").toBe(0);
  });
}

// A hand-edited share link can carry any number for the view.
test("extreme or broken views render quickly without errors", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = [];
    const halfHeights = [1e-300, 1e-40, 1e-12, 1e12, 1e300, 5e-324, Infinity, 0, -1, NaN];
    const rotations = [0, 1e10, NaN];
    for (const m of ["koch", "tree", "hexaflake", "dragon"]) {
      setMode(m);
      const state = { koch: kochState, tree: treeState, hexaflake: hexaflakeState, dragon: dragonState }[m];
      state.depth = { koch: 8, tree: 12, hexaflake: 6, dragon: 16 }[m];
      const v = VECTOR_VIEWS[m][0];
      for (const hh of halfHeights) {
        for (const rot of rotations) {
          Object.assign(v.view, { cx: 0.2887, cy: 0.5, halfHeight: hh, rotation: rot });
          const t0 = performance.now();
          try { renderAll(); } catch (e) { out.push(`${m} hh=${hh} rot=${rot}: threw ${e.message}`); }
          const ms = performance.now() - t0;
          if (ms > 2500) out.push(`${m} hh=${hh} rot=${rot}: ${ms.toFixed(0)} ms`);
        }
      }
    }
    return out;
  });
  expect(r).toEqual([]);
});

test.describe("deep zoom screenshots", () => {
  const SHOTS = [
    { name: "koch", mode: "koch", depth: 4, view: { cx: 0.2887, cy: 0.5, halfHeight: 1.08 / 1500, rotation: 0.4 } },
    { name: "tree", mode: "tree", depth: 9, view: { cx: -2.4, cy: 3.1, halfHeight: 0.02, rotation: 0 } },
    { name: "dragon", mode: "dragon", depth: 13, view: { cx: -0.35, cy: -0.24, halfHeight: 0.004, rotation: 0.3 } },
  ];
  for (const s of SHOTS) {
    test(s.name, async ({ page }) => {
      await show(page, s.mode, s.depth, s.view);
      await expect(page).toHaveScreenshot(`vector-deep-${s.name}.png`);
    });
  }
});

// The Hexaflake (hexaflake.js): a hexagon becomes seven at 1/3 scale, one in
// the middle and one 2/3 of the way out toward each corner. The geometry, the
// level-by-level painting, the share link, the depth controls and the zoom
// are held to numbers here (no baselines); twist, culling and pinching are in
// the loops above with the other views.
test.describe("Hexaflake", () => {
  test("a hexagon is seven at 1/3 scale: one in the middle, six centered 2/3 out at 60-degree steps", async ({ page }) => {
    const r = await page.evaluate(() => {
      const kids = hexaflakeHexagons(1).slice(1);
      const counts = [0, 1, 2, 3, 4, 5].map((d) => hexaflakeHexagons(d).length);
      // Every hexagon's six corners, as [x, y]: center + s * (cos, sin)(60 j degrees).
      const corners = ([x, y, level]) => Array.from({ length: 6 }, (_, j) => [x + HEX_SCALE[level] * Math.cos(j * Math.PI / 3), y + HEX_SCALE[level] * Math.sin(j * Math.PI / 3)]);
      const outside = [];
      // Inside the root hexagon (circumradius 1, corners at 0, 60, ... degrees): |y| <= sqrt(3)/2, sqrt(3)|x| + |y| <= sqrt(3).
      for (const h of hexaflakeHexagons(4)) {
        for (const [x, y] of corners(h)) {
          if (Math.abs(y) > Math.sqrt(3) / 2 + 1e-12 || Math.sqrt(3) * Math.abs(x) + Math.abs(y) > Math.sqrt(3) + 1e-12) outside.push([x, y]);
        }
      }
      // The six outer children each reach one corner of the parent and touch the
      // middle child at one of its corners.
      const rootCorners = corners([0, 0, 0]);
      const middleCorners = corners(kids[0]);
      const reach = kids.slice(1).map((k, j) => Math.hypot(corners(k)[j][0] - rootCorners[j][0], corners(k)[j][1] - rootCorners[j][1]));
      const touch = kids.slice(1).map((k, j) => Math.hypot(corners(k)[(j + 3) % 6][0] - middleCorners[j][0], corners(k)[(j + 3) % 6][1] - middleCorners[j][1]));
      return {
        kids: kids.map(([x, y, level]) => ({ x, y, level, r: Math.hypot(x, y), a: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 })),
        scale1: HEX_SCALE[1], scale5: HEX_SCALE[5], counts, outside: outside.length, reach, touch,
      };
    });
    expect(r.kids).toHaveLength(7);
    expect(r.kids[0]).toMatchObject({ x: 0, y: 0, level: 1 });
    r.kids.slice(1).forEach((k, j) => {
      expect(k.level).toBe(1);
      expect(k.r).toBeCloseTo(2 / 3, 12);
      expect(k.a).toBeCloseTo(j * 60, 9);
    });
    expect(r.scale1).toBeCloseTo(1 / 3, 15);
    expect(r.scale5).toBeCloseTo(1 / 243, 15);
    expect(r.counts, "7^0 + ... + 7^d hexagons").toEqual([1, 8, 57, 400, 2801, 19608]);
    expect(r.outside, "corners outside the root hexagon").toBe(0);
    for (const d of r.reach) expect(d, "an outer child shares a corner with the parent").toBeLessThan(1e-12);
    for (const d of r.touch) expect(d, "an outer child touches the middle one at a corner").toBeLessThan(1e-12);
  });

  // Painter's order: each level drawn over its parent's, so a gap (the
  // triangle between three children) shows the parent's shade.
  test("every level has its own shade, and the gaps show the parent's", async ({ page }) => {
    const r = await page.evaluate(() => {
      setMode("hexaflake");
      hexaflakeState.depth = 2;
      fittedVectorModes.add("hexaflake");
      fitVectorView("hexaflake");
      renderAll();
      const canvas = VECTOR_VIEWS.hexaflake[1], ctx = canvas.getContext("2d");
      const at = (x, y) => { const [sx, sy] = hexaflakeView.worldToScreen(x, y); return Array.from(ctx.getImageData(Math.round(sx), Math.round(sy), 1, 1).data.slice(0, 3)); };
      const out = {
        // The root's gap between the middle child and the children at 0 and 60 degrees.
        level0: at(1 / 3, 0.19245),
        // The middle child's own gap, one level down; and the middle of the middle one's middle.
        level1: at(1 / 9, 0.06415),
        level2: at(0, 0),
      };
      // The same pixels at depth 1: the middle child is a plain hexagon, level 1's shade at its center.
      hexaflakeState.depth = 1;
      renderAll();
      out.level1AtDepth1 = at(0, 0);
      return out;
    });
    const key = (c) => c.join(",");
    expect(new Set([key(r.level0), key(r.level1), key(r.level2)]).size, "three levels, three shades").toBe(3);
    for (const c of [r.level0, r.level1, r.level2]) expect(c[0] + c[1] + c[2], "not black").toBeGreaterThan(60);
    expect(key(r.level1AtDepth1), "a hexagon's shade doesn't depend on the depth below it").toBe(key(r.level1));
    // The shades step the hue, so levels two apart aren't the same either, and the outer ones are dimmer.
    expect(Math.max(...r.level0)).toBeLessThan(Math.max(...r.level2));
  });

  test("a share link round-trips: key, view, depth and color; the default depth is left out", async ({ page }) => {
    const r = await page.evaluate(() => {
      setMode("hexaflake");
      fittedVectorModes.add("hexaflake");
      Object.assign(hexaflakeView.view, { cx: 0.6667, cy: 0.0123, halfHeight: 0.0042, rotation: 0.5 });
      hexaflakeState.depth = 6;
      vectorColors.hexaflake = 3;
      const hash = buildShareHash();
      const parsed = parseShareHash(hash);
      setMode("koch"); // somewhere else, then arrive by the link
      hexaflakeState.depth = 2;
      vectorColors.hexaflake = 0;
      applyShareLink(`https://example.org/${hash}`);
      const arrived = { mode, depth: hexaflakeState.depth, slider: els.hexaflakeDepthSlider.value, color: vectorColors.hexaflake, view: { ...hexaflakeView.view }, again: buildShareHash() };
      hexaflakeState.depth = HEXAFLAKE_DEFAULT_DEPTH;
      return { hash, parsed, arrived, defaultHash: buildShareHash() };
    });
    expect(r.hash).toContain("m=hexaflake");
    expect(r.hash).toContain("dp=6");
    expect(r.parsed).toMatchObject({ mode: "hexaflake", depth: 6, colorIndex: 3 });
    expect(r.arrived.mode).toBe("hexaflake");
    expect(r.arrived.depth).toBe(6);
    expect(r.arrived.slider).toBe("6");
    expect(r.arrived.color).toBe(3);
    expect(r.arrived.view.cx).toBeCloseTo(0.6667, 6);
    expect(r.arrived.view.halfHeight).toBeCloseTo(0.0042, 6);
    expect(r.arrived.view.rotation).toBeCloseTo(0.5, 6);
    expect(r.arrived.again).toBe(r.hash);
    expect(r.defaultHash, "no dp at the default depth").not.toContain("dp=");
  });

  // 1.42.0 made the Hexaflake a chaos-game mode whose links carry a points
  // value n and the fern's color; those links must still open, on the same
  // part of the shape, and a hand-edited depth or color can't reject one.
  test("a 1.42.0 link (points value, no depth) opens, and bad depth or color fall back", async ({ page }) => {
    const r = await page.evaluate(() => {
      const open = (query) => {
        setMode("koch");
        hexaflakeState.depth = HEXAFLAKE_DEFAULT_DEPTH;
        vectorColors.hexaflake = 0;
        applyShareLink(`https://kmjohn1000.github.io/fractal-web/#v=1&m=hexaflake&${query}`);
        return { mode, depth: hexaflakeState.depth, color: vectorColors.hexaflake, view: { ...hexaflakeView.view }, parsed: parseShareHash(`#v=1&m=hexaflake&${query}`) };
      };
      return {
        old: open("x=0.6667&y=0.0123&s=0.0042&r=0.5&n=500000&c=3"),
        oldDefaults: open("x=0&y=0&s=1.1&r=0&n=1000000&c=0"),
        badDepth: open("x=0&y=0&s=1.1&r=0&dp=99&c=2"),
        badColor: open("x=0&y=0&s=1.1&r=0&dp=2&c=99"),
        junk: open("x=0&y=0&s=1.1&r=0&dp=abc&c=-1"),
        noView: parseShareHash("#v=1&m=hexaflake&n=500000"),
      };
    });
    expect(r.old).toMatchObject({ mode: "hexaflake", depth: 4, color: 3 });
    expect(r.old.view.cx).toBeCloseTo(0.6667, 6);
    expect(r.old.view.halfHeight).toBeCloseTo(0.0042, 6);
    expect(r.old.view.rotation).toBeCloseTo(0.5, 6);
    expect(r.oldDefaults).toMatchObject({ mode: "hexaflake", depth: 4, color: 0 });
    expect(r.badDepth).toMatchObject({ mode: "hexaflake", depth: 4, color: 2 });
    expect(r.badColor).toMatchObject({ mode: "hexaflake", depth: 2, color: 0 });
    expect(r.junk).toMatchObject({ mode: "hexaflake", depth: 4, color: 0 });
    expect(r.noView, "a link without a view is still rejected, as for every mode").toBeNull();
  });

  test("the depth slider and the play button set the depth, and the picker color changes the shade", async ({ page }) => {
    const r = await page.evaluate(async () => {
      setMode("hexaflake");
      fittedVectorModes.add("hexaflake");
      fitVectorView("hexaflake");
      const slider = els.hexaflakeDepthSlider;
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const canvas = VECTOR_VIEWS.hexaflake[1];
      const grab = () => Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data);
      const differs = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
      const out = { min: slider.min, max: slider.max, start: slider.value };
      slider.value = "2";
      slider.dispatchEvent(new Event("input"));
      await frame();
      out.afterInput = hexaflakeState.depth;
      const two = grab();
      slider.value = "5";
      slider.dispatchEvent(new Event("input"));
      await frame();
      out.fiveDiffers = differs(two, grab());
      // Play: the first step comes at once, upward from where the slider is.
      slider.value = "1";
      slider.dispatchEvent(new Event("input"));
      startDepthPlay();
      out.playing = slider.value;
      out.playedDepth = hexaflakeState.depth;
      stopDepthPlay();
      // Another color shades differently.
      const before = grab();
      vectorColors.hexaflake = 4;
      requestRender();
      await frame();
      out.colorDiffers = differs(before, grab());
      out.hudDepth = activeVectorTarget().v === hexaflakeView;
      return out;
    });
    expect(r.min).toBe("0");
    expect(r.max).toBe("6");
    expect(r.afterInput).toBe(2);
    expect(r.fiveDiffers, "depth 5 draws more than depth 2").toBeGreaterThan(1000);
    expect(r.playing).toBe("2");
    expect(r.playedDepth).toBe(2);
    expect(r.colorDiffers, "another color changes the picture").toBeGreaterThan(1000);
    expect(r.hudDepth, "keyboard and compass target the hexaflake's view").toBe(true);
  });

  // Hexagons that cover the whole canvas hide the levels above them, which
  // aren't drawn; and one that is huge (1e9 px across) is clipped to the
  // canvas before it is drawn, because Canvas2D works in float32. Drawing every
  // level anyway must give the same picture.
  test("deep views skip the hidden levels and clip the huge hexagons without changing the picture", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      const views = [
        { cx: 1 / 3, cy: 0, halfHeight: 1e-6, rotation: 0.3 },           // a point where two children touch
        { cx: 1, cy: 0, halfHeight: 1e-9, rotation: 0 },                 // a corner
        { cx: 0.7778, cy: 0.1925, halfHeight: 1e-4, rotation: 1.2 },     // inside the flake, off any vertex
      ];
      for (const v of views) {
        const el = document.createElement("canvas");
        el.style.cssText = "position:fixed;left:-20000px;top:0;width:360px;height:520px";
        document.body.appendChild(el);
        const hv = createHexaflakeView(el);
        Object.assign(hv.view, v);
        const draw = (cover) => {
          hv.render({ depth: 4, colorIndex: 0, fitHalfHeight: 1.5, cover });
          return el.getContext("2d").getImageData(0, 0, el.width, el.height).data;
        };
        const fast = draw(true), full = draw(false);
        let diff = 0, lit = 0;
        for (let i = 0; i < fast.length; i += 4) {
          if (Math.max(Math.abs(fast[i] - full[i]), Math.abs(fast[i + 1] - full[i + 1]), Math.abs(fast[i + 2] - full[i + 2])) > 8) diff++;
          if (fast[i] + fast[i + 1] + fast[i + 2] > 60) lit++;
        }
        out.push({ view: v, diff, lit, total: el.width * el.height, extra: hv.extraLevels });
        el.remove();
      }
      return out;
    });
    for (const c of r) {
      expect(c.extra, `${JSON.stringify(c.view)}: zoom added levels`).toBeGreaterThan(5);
      expect(c.lit, "the view shows something").toBeGreaterThan(c.total * 0.2);
      expect(c.diff / c.total, `${c.diff} of ${c.total} pixels differ`).toBeLessThan(0.0005);
    }
  });

  // The corner (1, 0) is the fixed point of the map for that corner
  // (z -> z/3 + 2/3), so a view 3^k times closer shows the whole corner
  // again: detail must be as dense at 1e-9 as at the start.
  test("zoom keeps showing the same detail: a corner 3^20 times closer looks like the corner", async ({ page }) => {
    await page.evaluate(() => { setMode("hexaflake"); fittedVectorModes.add("hexaflake"); });
    const mask = (hh) => page.evaluate((hh) => {
      Object.assign(hexaflakeView.view, { cx: 1, cy: 0, halfHeight: hh, rotation: 0 });
      renderAll();
      const canvas = VECTOR_VIEWS.hexaflake[1];
      const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      const lit = new Uint8Array(px.length / 4);
      for (let i = 0; i < lit.length; i++) lit[i] = px[4 * i] + px[4 * i + 1] + px[4 * i + 2] > 60 ? 1 : 0;
      return { lit: Array.from(lit), extra: hexaflakeView.extraLevels, total: lit.length };
    }, hh);
    const near = await mask(0.03);
    const far = await mask(0.03 / 3 ** 20);
    let differ = 0, on = 0;
    for (let i = 0; i < near.total; i++) { if (near.lit[i] !== far.lit[i]) differ++; on += near.lit[i]; }
    expect(on, "the corner view isn't blank").toBeGreaterThan(near.total * 0.1);
    expect(far.extra - near.extra, "20 more levels from zoom").toBeGreaterThanOrEqual(15);
    expect(differ / near.total, `${differ} of ${near.total} pixels differ`).toBeLessThan(0.01);
  });
});
