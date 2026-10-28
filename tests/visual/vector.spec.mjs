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
   vectorColors, hexaflakeView, activeVectorTarget, dragonView, LINE_CURVES, vectorFitHalfHeight,
   hilbertAdaptive, gosperAdaptive, arrowheadAdaptive, curveAdaptive, lcurveSpec */

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
    if (v.cx === null) { // a vertex a third of the way along the curve at this depth
      const pts = LINE_CURVES[m].points(d);
      const p = pts[Math.floor(pts.length / 3)];
      Object.assign(VECTOR_VIEWS[m][0].view, { cx: p[0], cy: p[1] });
    }
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

  // Hilbert, Gosper and the arrowhead are walked from their L-systems
  // (curveAdaptive): every depth of every slider, the points are LINE_CURVES'
  // normalized polyline's, in order, and each point's place t along the curve
  // (what the colors follow) is its index over the last index.
  for (const curve of ["hilbert", "gosper", "arrowhead"]) {
    test(`${curve}, every depth of the slider`, async ({ page }) => {
      const r = await page.evaluate((curve) => {
        const walk = { hilbert: hilbertAdaptive, gosper: gosperAdaptive, arrowhead: arrowheadAdaptive }[curve];
        const L = LINE_CURVES[curve];
        const out = { worst: 0, worstT: 0, depths: 0 };
        for (let depth = L.minDepth || 0; depth <= L.maxDepth; depth++) {
          const aff = vectorAffine({ cx: 0, cy: 0, halfHeight: 2, rotation: 0 }, 4000, 4000);
          const buf = new Float64Array(2 * 200000), tb = new Float64Array(200000);
          const got = walk(aff, buf, depth, 0, Infinity, tb);
          const ref = L.points(depth);
          if (got.n !== ref.length) return { error: `depth ${depth}: ${got.n} points, expected ${ref.length}` };
          if (got.level !== depth || got.overflow) return { error: `depth ${depth}: level ${got.level}, overflow ${got.overflow}` };
          for (let i = 0; i < ref.length; i++) {
            const x = (buf[2 * i] - 2000) / aff.k, y = (2000 - buf[2 * i + 1]) / aff.k;
            out.worst = Math.max(out.worst, Math.hypot(x - ref[i][0], y - ref[i][1]));
            out.worstT = Math.max(out.worstT, Math.abs(tb[i] - i / (ref.length - 1)));
          }
          out.depths++;
        }
        out.expectedDepths = L.maxDepth - (L.minDepth || 0) + 1;
        return out;
      }, curve);
      expect(r.error).toBeUndefined();
      expect(r.depths).toBe(r.expectedDepths);
      expect(r.worst).toBeLessThan(1e-9);
      expect(r.worstT).toBeLessThan(1e-12);
    });
  }

  // The dragon's t is the same: its points are evenly spaced along the curve.
  test("dragon: each point's place along the curve is its index over the last", async ({ page }) => {
    const worst = await page.evaluate(() => {
      let worst = 0;
      for (let depth = 0; depth <= 14; depth++) {
        const aff = vectorAffine({ cx: 0, cy: 0, halfHeight: 2, rotation: 0 }, 4000, 4000);
        const buf = new Float64Array(2 * 20000), tb = new Float64Array(20000);
        const got = dragonAdaptive(aff, buf, depth, 0, Infinity, tb);
        for (let i = 0; i < got.n; i++) worst = Math.max(worst, Math.abs(tb[i] - i / (got.n - 1)));
      }
      return worst;
    });
    expect(worst).toBeLessThan(1e-12);
  });

  // Levels past the slider's depth draw the same curve finer, inside the same
  // frame. Gosper's and the arrowhead's vertices at depth d are all vertices
  // at d + 2 (the picture doesn't move when a level comes in); Hilbert's
  // centers-of-cells polyline can't nest, so each of its vertices at depth d
  // has one of the finer level within 0.36 of a step (a quarter of a cell's
  // diagonal is 0.354).
  test("a finer level is the same curve: Gosper and the arrowhead nest, Hilbert stays within 0.36 of a step", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = {};
      for (const [curve, depth, extra] of [["gosper", 3, 2], ["arrowhead", 4, 2], ["arrowhead", 3, 3], ["hilbert", 4, 2], ["hilbert", 4, 1]]) {
        const spec = lcurveSpec(curve);
        const aff = vectorAffine({ cx: 0, cy: 0, halfHeight: 2, rotation: 0 }, 4000, 4000);
        const buf = new Float64Array(2 * 200000);
        // A pixel limit of 0 and a refPx that asks for exactly depth + extra levels.
        const refPx = spec.stepLength(depth, depth + extra) * aff.k * 1.0001;
        const got = curveAdaptive(curve, aff, buf, depth, 0, refPx);
        const ref = LINE_CURVES[curve].points(depth);
        const step = Math.hypot(ref[1][0] - ref[0][0], ref[1][1] - ref[0][1]);
        let worst = 0;
        for (const [x0, y0] of ref) {
          let best = Infinity;
          for (let i = 0; i < got.n; i++) best = Math.min(best, Math.hypot((buf[2 * i] - 2000) / aff.k - x0, (2000 - buf[2 * i + 1]) / aff.k - y0));
          worst = Math.max(worst, best);
        }
        out[`${curve} ${depth}+${extra}`] = { level: got.level, worst: worst / step };
      }
      return out;
    });
    expect(r["gosper 3+2"]).toMatchObject({ level: 5 });
    expect(r["arrowhead 4+2"]).toMatchObject({ level: 6 });
    expect(r["arrowhead 3+3"]).toMatchObject({ level: 6 });
    expect(r["hilbert 4+2"]).toMatchObject({ level: 6 });
    expect(r["hilbert 4+1"]).toMatchObject({ level: 5 });
    for (const k of ["gosper 3+2", "arrowhead 4+2", "arrowhead 3+3"]) expect(r[k].worst, `${k}: depth-d vertices missing from the finer level`).toBeLessThan(1e-9);
    for (const k of ["hilbert 4+2", "hilbert 4+1"]) expect(r[k].worst, k).toBeLessThan(0.36);
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
    // 0.04, not the 0.02 this once was: that deep, the twice-as-big canvas hits the frame budget and draws a level
    // fewer than the small one, which was invisible while the finest levels were all one shade, but the
    // gutters on hexagons over 7 px now show the difference.
    { kind: "hexaflake", depth: 5, view: { cx: 0.7778, cy: 0.1925, halfHeight: 0.04, rotation: 0.7 } },
    // cx, cy null: a point a third of the way along the curve.
    { kind: "dragon", depth: 12, view: { cx: null, cy: null, halfHeight: 0.12, rotation: 0 } },
    { kind: "dragon", depth: 12, view: { cx: null, cy: null, halfHeight: 0.05, rotation: 0.6 } },
    // The other line curves, deep enough to have added levels (and, for Hilbert, to need two pixel limits' worth of nodes).
    { kind: "hilbert", depth: 7, view: { cx: null, cy: null, halfHeight: 0.12, rotation: 0 } },
    { kind: "hilbert", depth: 7, view: { cx: null, cy: null, halfHeight: 0.05, rotation: 0.6 } },
    // Gosper at depth 3, not 5: at 5 its steps are so short (2 px on this small canvas) that the twice-as-big one
    // hits the frame budget and draws coarser, which is the budget working, not culling.
    { kind: "gosper", depth: 3, view: { cx: null, cy: null, halfHeight: 0.12, rotation: 0 } },
    { kind: "gosper", depth: 3, view: { cx: null, cy: null, halfHeight: 0.05, rotation: 0.6 } },
    { kind: "arrowhead", depth: 10, view: { cx: null, cy: null, halfHeight: 0.12, rotation: 0 } },
    { kind: "arrowhead", depth: 10, view: { cx: null, cy: null, halfHeight: 0.05, rotation: 0.6 } },
  ];
  for (const c of CASES) {
    test(`${c.kind} depth ${c.depth}, zoomed to ${c.view.halfHeight}, rotation ${c.view.rotation}${c.fill === false ? ", outline" : ""}`, async ({ page }) => {
      const r = await page.evaluate((c) => {
        const make = { koch: createKochView, tree: createPythagorasTreeView, hexaflake: createHexaflakeView }[c.kind] ?? createCurveView;
        const mount = (w, h) => {
          const el = document.createElement("canvas");
          el.style.cssText = `position:fixed;left:-20000px;top:0;width:${w}px;height:${h}px`;
          document.body.appendChild(el);
          return el;
        };
        const fit = { koch: 1.08, tree: 2.125, hexaflake: 1.0, dragon: 0.6 }[c.kind] ?? 1.1;
        const along = LINE_CURVES[c.kind] ? LINE_CURVES[c.kind].points(c.depth) : null;
        const centre = c.view.cx === null ? along[Math.floor(along.length / 3)] : [c.view.cx, c.view.cy];
        const draw = (w, h, scale) => {
          const el = mount(w, h);
          const v = make(el);
          if (LINE_CURVES[c.kind]) v.setCurve(c.kind);
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
    // The other line curves: the view is centered on a vertex a third of the way along the curve at the slider's depth.
    { mode: "hilbert", depth: 5, point: null, fit: 1.1, zoom: 60 },
    { mode: "gosper", depth: 4, point: null, fit: 1.1, zoom: 100 },
    { mode: "arrowhead", depth: 7, point: null, fit: 1.1, zoom: 300 },
  ];
  for (const c of CASES) {
    test(`${c.mode}: no extra levels at the Reset framing, some deep in`, async ({ page }) => {
      await page.evaluate((m) => { setMode(m); fitVectorView(m); requestRender(); }, c.mode);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const fitted = await page.evaluate(([m, d]) => {
        const state = { koch: kochState, tree: treeState, hexaflake: hexaflakeState }[m] ?? dragonState;
        state.depth = d;
        fitVectorView(m);
        renderAll();
        const v = VECTOR_VIEWS[m][0];
        return v.extraLevels;
      }, [c.mode, c.depth]);
      expect(fitted).toBe(0);

      await page.evaluate(() => document.querySelector(".hudToggleBtn").click()); // info card on
      await show(page, c.mode, c.depth, { ...(c.point ?? { cx: null, cy: null }), halfHeight: 1 / c.zoom, rotation: 0 });
      const deep = await page.evaluate((m) => VECTOR_VIEWS[m][0].extraLevels, c.mode);
      expect(deep, "levels added beyond the slider's").toBeGreaterThan(2);
      // The info card says so, in its own words.
      await expect(page.locator("#hud")).toContainText(`Depth ${c.depth} (+${deep} from zoom)`, { useInnerText: false });
    });
  }
});

// Each of the three L-system curves has a point whose neighborhood repeats at
// a smaller scale, so a view closer by the right factor shows the same
// picture, as long as the walk keeps adding levels:
//   - the arrowhead's start: its first two nodes are again an A at the same
//     heading, a quarter the size (zoom 4 per two levels, no turn);
//   - Hilbert's start corner of the square of cells, likewise (zoom 4 per
//     two levels);
//   - Gosper's start: the first node is an A at the same heading, 1/sqrt 7 the
//     size, and each level turns the curve's chord by a fixed angle (read here
//     from points(), not from the walk), so the view turns with it.
test.describe("zoom keeps showing the same detail", () => {
  const CASES = [
    { curve: "arrowhead", depth: 7, hh: 0.06, zoom: 4, levels: 2, steps: 6 },
    { curve: "hilbert", depth: 5, hh: 0.1, zoom: 4, levels: 2, steps: 6 },
    { curve: "gosper", depth: 4, hh: 0.06, zoom: Math.sqrt(7), levels: 1, steps: 10 },
  ];
  for (const c of CASES) {
    test(`${c.curve}: its start ${c.zoom ** c.steps >= 1e3 ? Math.round(c.zoom ** c.steps) : c.zoom ** c.steps} times closer looks like its start`, async ({ page }) => {
      const r = await page.evaluate(async (c) => {
        setMode(c.curve);
        fittedVectorModes.add(c.curve);
        dragonState.depth = c.depth;
        const pts = LINE_CURVES[c.curve].points(c.depth);
        const angle = (p) => Math.atan2(p[p.length - 1][1] - p[0][1], p[p.length - 1][0] - p[0][0]);
        const turnPerLevel = angle(LINE_CURVES[c.curve].points(c.depth + 1)) - angle(pts);
        let [cx, cy] = pts[0];
        if (c.curve === "hilbert") { // the corner of the square the centers of cells sit in
          const side = 2 ** c.depth / (2 ** c.depth - 1);
          cx = Math.sign(pts[0][0]) * side; cy = Math.sign(pts[0][1]) * side;
        }
        const canvas = VECTOR_VIEWS[c.curve][1];
        const mask = (step) => {
          Object.assign(dragonView.view, { cx, cy, halfHeight: c.hh / c.zoom ** step, rotation: c.curve === "gosper" ? -turnPerLevel * step : 0 });
          renderAll();
          const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          const lit = new Uint8Array(px.length / 4);
          for (let i = 0; i < lit.length; i++) lit[i] = px[4 * i] + px[4 * i + 1] + px[4 * i + 2] > 60 ? 1 : 0;
          return { lit, extra: dragonView.extraLevels };
        };
        const near = mask(0);
        const far = mask(c.steps);
        let differ = 0, on = 0;
        for (let i = 0; i < near.lit.length; i++) { if (near.lit[i] !== far.lit[i]) differ++; on += near.lit[i]; }
        return { differ, on, total: near.lit.length, added: far.extra - near.extra };
      }, c);
      expect(r.on, "the start's view isn't blank").toBeGreaterThan(r.total * 0.01);
      expect(r.added, "levels from zoom").toBeGreaterThanOrEqual(c.levels * c.steps - 1);
      expect(r.differ / r.total, `${r.differ} of ${r.total} pixels differ`).toBeLessThan(0.01);
    });
  }
});

// The color follows the position along the curve, not the order of the points
// drawn, so a zoomed view shows the colors of its own place in the picture
// the whole curve shows.
test.describe("the color at a point is the same zoomed in as zoomed out", () => {
  for (const [curve, depth, zoom] of [["dragon", 12, 40], ["hilbert", 6, 30], ["gosper", 4, 60], ["arrowhead", 8, 100]]) {
    test(`${curve}`, async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 852 });
      const r = await page.evaluate(([curve, depth, zoom]) => {
        setMode(curve);
        dragonView.resize();
        dragonState.depth = depth;
        fitVectorView(curve);
        const canvas = VECTOR_VIEWS[curve][1], ctx = canvas.getContext("2d");
        const pts = LINE_CURVES[curve].points(depth);
        // The brightest pixel near (sx, sy): the line's own color, hue only (the glow and the density change the brightness).
        const lineColor = (sx, sy, rad) => {
          const x0 = Math.max(0, Math.round(sx - rad)), y0 = Math.max(0, Math.round(sy - rad));
          const w = Math.min(canvas.width, Math.round(sx + rad)) - x0, h = Math.min(canvas.height, Math.round(sy + rad)) - y0;
          const d = ctx.getImageData(x0, y0, w, h).data;
          let best = -1, rgb = null;
          for (let i = 0; i < d.length; i += 4) { const s = d[i] + d[i + 1] + d[i + 2]; if (s > best) { best = s; rgb = [d[i], d[i + 1], d[i + 2]]; } }
          const m = Math.max(...rgb) || 1;
          return rgb.map((v) => v / m);
        };
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        const fit = { ...dragonView.view };
        const out = [];
        for (const f of [0.15, 0.5, 0.85]) {
          const p = pts[Math.floor((pts.length - 1) * f)];
          Object.assign(dragonView.view, fit);
          renderAll();
          const [sx, sy] = dragonView.worldToScreen(p[0], p[1]);
          // The vertex is on the line, so a few pixels around it are enough (a space-filling curve's neighbors are other places along it).
          const wide = lineColor(sx, sy, 2);
          Object.assign(dragonView.view, { cx: p[0], cy: p[1], halfHeight: fit.halfHeight / zoom });
          renderAll();
          const deep = lineColor(canvas.width / 2, canvas.height / 2, 12);
          out.push({ f, wide, deep, extra: dragonView.extraLevels });
        }
        return { out, d: out.map((o) => dist(o.wide, o.deep)), apart: dist(out[0].deep, out[2].deep) };
      }, [curve, depth, zoom]);
      for (const [i, d] of r.d.entries()) expect(d, `${curve} at ${r.out[i].f}: ${JSON.stringify(r.out[i])}`).toBeLessThan(0.12);
      expect(r.apart, "the two ends of the curve are not the same color").toBeGreaterThan(0.12);
      expect(Math.max(...r.out.map((o) => o.extra)), "the deep view added levels").toBeGreaterThan(0);
    });
  }
});

// Two fingers twisting at depth: the same synthetic pointer events the
// gesture handler gets from a real touch. (setPointerCapture refuses
// pointers the browser doesn't know, so it's stubbed.)
for (const m of ["koch", "tree", "hexaflake", "dragon", "hilbert", "gosper", "arrowhead"]) {
  test(`${m}: a two-finger twist at depth turns the view and keeps its detail`, async ({ page }) => {
    const depthView = {
      hilbert: { depth: 5, view: { cx: null, cy: null, halfHeight: 1 / 60, rotation: 0 } },
      gosper: { depth: 4, view: { cx: null, cy: null, halfHeight: 1 / 100, rotation: 0 } },
      arrowhead: { depth: 7, view: { cx: null, cy: null, halfHeight: 1 / 300, rotation: 0 } },
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
for (const m of ["koch", "tree", "hexaflake", "dragon", "hilbert", "gosper", "arrowhead"]) {
  test(`${m}: pinching during Play zooms, draws coarser while held, and is full detail on release`, async ({ page }) => {
    const depthView = {
      hilbert: { depth: 8, view: { cx: 0, cy: 0, halfHeight: 1.2, rotation: 0 } },
      gosper: { depth: 6, view: { cx: 0, cy: 0, halfHeight: 1.2, rotation: 0 } },
      arrowhead: { depth: 11, view: { cx: 0, cy: 0, halfHeight: 1.2, rotation: 0 } },
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
    const depths = { koch: 8, tree: 12, hexaflake: 6, dragon: 16, hilbert: 8, gosper: 6, arrowhead: 11 };
    for (const m of Object.keys(depths)) {
      setMode(m);
      const state = { koch: kochState, tree: treeState, hexaflake: hexaflakeState }[m] ?? dragonState;
      state.depth = depths[m];
      const v = VECTOR_VIEWS[m][0];
      // Also, for the line curves, a vertex of the curve itself: the views that tiny can then be on the curve.
      const centers = [[0.2887, 0.5]];
      if (LINE_CURVES[m]) { const pts = LINE_CURVES[m].points(depths[m]); centers.push(pts[Math.floor(pts.length / 3)]); }
      for (const [cx, cy] of centers) {
        for (const hh of halfHeights) {
          for (const rot of rotations) {
            Object.assign(v.view, { cx, cy, halfHeight: hh, rotation: rot });
            const t0 = performance.now();
            try { renderAll(); } catch (e) { out.push(`${m} hh=${hh} rot=${rot}: threw ${e.message}`); }
            const ms = performance.now() - t0;
            if (ms > 2500) out.push(`${m} hh=${hh} rot=${rot}: ${ms.toFixed(0)} ms`);
          }
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
    { name: "hilbert", mode: "hilbert", depth: 5, view: { cx: null, cy: null, halfHeight: 1 / 60, rotation: 0.3 } },
    { name: "gosper", mode: "gosper", depth: 4, view: { cx: null, cy: null, halfHeight: 1 / 100, rotation: 0.3 } },
    { name: "arrowhead", mode: "arrowhead", depth: 7, view: { cx: null, cy: null, halfHeight: 1 / 300, rotation: 0.3 } },
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

// A curve's extent changes with its depth (the dragon turns 45 degrees per
// level), so stepping the depth slider, or playing it, must keep the curve in
// frame: a view still at its framing follows the depth, one the user has
// moved stays where it is.
test.describe("the line curves stay framed as the depth changes", () => {
  for (const curve of ["dragon", "hilbert", "gosper", "arrowhead"]) {
    test(`${curve}: every depth is centered and on screen`, async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 852 });
      const r = await page.evaluate((curve) => {
        setMode(curve);
        dragonView.resize();
        const slider = els.dragonDepthSlider;
        const bad = [];
        for (let d = parseInt(slider.min, 10); d <= parseInt(slider.max, 10); d++) {
          slider.value = String(d);
          slider.dispatchEvent(new Event("input"));
          dragonView.resize();
          const canvas = VECTOR_VIEWS[curve][1];
          let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
          for (const [x, y] of LINE_CURVES[curve].points(d)) {
            const [sx, sy] = dragonView.worldToScreen(x, y);
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
          const w = canvas.width, h = canvas.height;
          const inside = x0 >= 0 && x1 <= w && y0 >= 0 && y1 <= h;
          const centered = Math.abs((x0 + x1) / 2 - w / 2) < 0.01 * w && Math.abs((y0 + y1) / 2 - h / 2) < 0.01 * h;
          if (!inside || !centered) bad.push(`depth ${d}: x ${x0.toFixed(0)}..${x1.toFixed(0)}, y ${y0.toFixed(0)}..${y1.toFixed(0)} on ${w}x${h}`);
        }
        return bad;
      }, curve);
      expect(r).toEqual([]);
    });
  }

  test("a view you have zoomed or panned is left alone when the depth changes", async ({ page }) => {
    const r = await page.evaluate(() => {
      setMode("dragon");
      dragonView.resize();
      const slider = els.dragonDepthSlider;
      const before = { cx: dragonView.view.cx, cy: dragonView.view.cy, halfHeight: dragonView.view.halfHeight * 0.5, rotation: 0 };
      Object.assign(dragonView.view, before);
      slider.value = String(parseInt(slider.value, 10) - 2);
      slider.dispatchEvent(new Event("input"));
      const after = { ...dragonView.view };
      // Reset gives the framing back.
      els.dragonResetBtn.click();
      return { before, after, reset: { ...dragonView.view } };
    });
    expect(r.after).toEqual(r.before);
    expect(r.reset.halfHeight).toBeGreaterThan(r.before.halfHeight);
  });
});

// The finish (backdrop, color along the curves; see shape-finish.spec.mjs) must hold in the
// states the views are used in: turned, zoomed past the slider's depth, and in the middle of
// a gesture.
test.describe("the finish holds when the view moves", () => {
  // Distinct hues among the bright pixels of the dragon's canvas, in 30 degree bins.
  const hueBins = (page) => page.evaluate(() => {
    const canvas = VECTOR_VIEWS.dragon[1];
    const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const bins = new Array(12).fill(0);
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 110 || max === min) continue;
      let h;
      if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
      bins[Math.floor(((h * 60 + 360) % 360) / 30) % 12]++;
      lit++;
    }
    return { lit, wide: bins.filter((n) => n >= 0.04 * lit).length };
  });

  test("a turned dragon is still colored along its length", async ({ page }) => {
    await show(page, "dragon", 10, { cx: -0.35, cy: -0.24, halfHeight: 1.2, rotation: 0.9 });
    const r = await hueBins(page);
    expect(r.lit, "the curve is drawn").toBeGreaterThan(500);
    // 1.50.1 narrowed the sweep from 90 to 56 OKLCH degrees (about 40 of HSV hue on the dragon's Autumn), so the
    // picture spans two or three 30 degree bins now, not three or four: still more than one hue.
    expect(r.wide, "hue bins holding 4% of the lit pixels").toBeGreaterThanOrEqual(2);
  });

  // The colors follow the place along the whole curve (1.50.0), so a view this close
  // shows one narrow slice of the ramp: one or two hue bins, and the same slice the
  // whole curve shows there (vector.spec.mjs "the color at a point ...").
  test("a dragon zoomed past the slider's depth is still colored, with the colors of its place", async ({ page }) => {
    await show(page, "dragon", 13, { cx: -0.35, cy: -0.24, halfHeight: 0.02, rotation: 0.3 });
    expect(await page.evaluate(() => VECTOR_VIEWS.dragon[0].extraLevels), "levels added by zoom").toBeGreaterThan(2);
    const r = await hueBins(page);
    expect(r.lit, "the curve is drawn").toBeGreaterThan(500);
    expect(r.wide, "hue bins holding 4% of the lit pixels").toBeGreaterThanOrEqual(1);
    expect(r.wide, "a slice of the ramp, not the whole of it").toBeLessThanOrEqual(3);
  });

  test("a deep zoom keeps the backdrop behind every pattern view", async ({ page }) => {
    let found = 0;
    for (const [m, depth, view] of [
      ["koch", 4, { cx: 0.2887, cy: 0.5, halfHeight: 1.08 / 1500, rotation: 0.4 }],
      ["tree", 9, { cx: -2.4, cy: 3.1, halfHeight: 0.02, rotation: 0 }],
      ["hexaflake", 4, { cx: 0.4, cy: 0.2, halfHeight: 0.15, rotation: 0 }],
      ["dragon", 13, { cx: -0.35, cy: -0.24, halfHeight: 0.004, rotation: 0.3 }],
    ]) {
      await show(page, m, depth, view);
      const corner = await page.evaluate((m) => {
        const canvas = VECTOR_VIEWS[m][1];
        // The corner can be covered by a big filled shape; the backdrop is checked where it shows:
        // some pixel of the canvas's border that is not a shape color is the backdrop's navy.
        const g = canvas.getContext("2d");
        const px = g.getImageData(0, 0, canvas.width, 1).data;
        for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 0 && px[i] + px[i + 1] + px[i + 2] < 40) return [px[i], px[i + 1], px[i + 2]];
        return null;
      }, m);
      if (corner) { found++; expect(corner[2], `${m}: backdrop navy (blue above red)`).toBeGreaterThan(corner[0]); }
    }
    expect(found, "views whose top row shows the backdrop").toBeGreaterThanOrEqual(2);
  });

  test("a gesture frame (lite) is still colored and on the backdrop", async ({ page }) => {
    await show(page, "dragon", 12, { cx: -0.35, cy: -0.24, halfHeight: 1.0, rotation: 0 });
    await page.evaluate(() => { VECTOR_VIEWS.dragon[0].render({ depth: 12, colorIndex: vectorColors.dragon, lite: true, fitHalfHeight: vectorFitHalfHeight("dragon") }); });
    const r = await hueBins(page);
    expect(r.wide, "hue bins holding 4% of the lit pixels").toBeGreaterThanOrEqual(2);
    const corner = await page.evaluate(() => Array.from(VECTOR_VIEWS.dragon[1].getContext("2d").getImageData(0, 0, 1, 1).data));
    expect(corner[0] + corner[1] + corner[2], "the corner is the backdrop, not black").toBeGreaterThan(0);
  });
});
