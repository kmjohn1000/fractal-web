// Koch, Pythagoras tree and Heighway dragon are drawn from the viewport
// (kochAdaptive, treeAdaptive, dragonAdaptive): only what's on screen, to
// about a pixel, with more levels than the depth slider's as you zoom in.
// These checks hold that machinery to the plain full-detail geometry
// (kochSnowflake, pythagorasTree, dragonCurve) and to its own promises:
// culling changes nothing you can see, zoom adds detail, rotation works at
// depth, and a nonsense view from a hand-edited link can't hang the page.
// Deep-zoom screenshots are compared with baselines like app.spec.mjs's.
import { test, expect } from "@playwright/test";

/* global setMode, kochState, treeState, dragonState, fittedVectorModes, VECTOR_VIEWS, requestRender, renderAll,
   fitVectorView, vectorAffine, kochAdaptive, kochSnowflake, treeAdaptive, pythagorasTree, dragonAdaptive,
   dragonCurve, createKochView, createPythagorasTreeView, createCurveView */

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
    // cx, cy null: a point a third of the way along the curve.
    { kind: "dragon", depth: 12, view: { cx: null, cy: null, halfHeight: 0.12, rotation: 0 } },
    { kind: "dragon", depth: 12, view: { cx: null, cy: null, halfHeight: 0.05, rotation: 0.6 } },
  ];
  for (const c of CASES) {
    test(`${c.kind} depth ${c.depth}, zoomed to ${c.view.halfHeight}, rotation ${c.view.rotation}${c.fill === false ? ", outline" : ""}`, async ({ page }) => {
      const r = await page.evaluate((c) => {
        const make = { koch: createKochView, tree: createPythagorasTreeView, dragon: createCurveView }[c.kind];
        const mount = (w, h) => {
          const el = document.createElement("canvas");
          el.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px`;
          document.body.appendChild(el);
          return el;
        };
        const fit = c.kind === "koch" ? 1.08 : c.kind === "tree" ? 2.125 : 0.6;
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
    { mode: "dragon", depth: 13, point: { cx: -0.35, cy: -0.24 }, fit: 0.9, zoom: 400 },
  ];
  for (const c of CASES) {
    test(`${c.mode}: no extra levels at the Reset framing, some deep in`, async ({ page }) => {
      await page.evaluate((m) => { setMode(m); fitVectorView(m); requestRender(); }, c.mode);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const fitted = await page.evaluate(([m, d]) => {
        const state = { koch: kochState, tree: treeState, dragon: dragonState }[m];
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
for (const m of ["koch", "tree", "dragon"]) {
  test(`${m}: a two-finger twist at depth turns the view and keeps its detail`, async ({ page }) => {
    const depthView = {
      koch: { depth: 4, view: { cx: 0.2887, cy: 0.5, halfHeight: 1 / 500, rotation: 0 } },
      tree: { depth: 9, view: { cx: -2.2, cy: 3.0, halfHeight: 1 / 100, rotation: 0 } },
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

// A hand-edited share link can carry any number for the view.
test("extreme or broken views render quickly without errors", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = [];
    const halfHeights = [1e-300, 1e-40, 1e-12, 1e12, 1e300, 5e-324, Infinity, 0, -1, NaN];
    const rotations = [0, 1e10, NaN];
    for (const m of ["koch", "tree", "dragon"]) {
      setMode(m);
      const state = { koch: kochState, tree: treeState, dragon: dragonState }[m];
      state.depth = m === "koch" ? 8 : m === "tree" ? 12 : 16;
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
