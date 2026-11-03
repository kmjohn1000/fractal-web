// The Penrose tiling mode (penrose.js, the L-system PENROSE_TILING in lsystem.js): plain behavior checks,
// no screenshot baselines. The plain string's step counts, unit steps and 36-degree headings, the distinct
// edges the view draws against that string, the five-fold symmetry, the picker entry, the share link, the
// two-finger twist, the depth player and the culling.
import { test, expect } from "@playwright/test";

/* global setMode, dragonState, dragonView, fittedVectorModes, fitVectorView, VECTOR_VIEWS, requestRender, els, mode,
   buildShareHash, parseShareHash, applyShareLink, startDepthPlay, stopDepthPlay, depthPlayer, PLAY_SPEEDS, PICKER_LAYOUT,
   EXTRA_MODES, LINE_CURVES, vectorAffine, vectorColors, SOLID_COLORS, expandLSystem, turtleInterpret, PENROSE_TILING,
   penroseSpec, penroseStepCount, penroseEdges, penroseGeometry, penrosePoints, drawPenrose, curveRamp, CURVE_LOOK */

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
  await page.waitForFunction(() => typeof setMode === "function" && typeof penroseEdges === "function");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

// The mode on screen at a depth and view (the view fitted when none is given).
async function show(page, depth, view) {
  await page.evaluate(([depth, view]) => {
    setMode("penrose");
    dragonState.depth = depth;
    els.dragonDepthSlider.value = depth;
    fittedVectorModes.add("penrose");
    fitVectorView("penrose");
    if (view) Object.assign(dragonView.view, view);
    requestRender();
  }, [depth, view ?? null]);
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
}

test.describe("the L-system string", () => {
  test("it draws 1,780 steps at depth 4 and 7,920 at depth 5 (and 20, 90, 400, 35,240, 156,800 at the others)", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = {};
      for (let d = 0; d <= 7; d++) {
        const lines = turtleInterpret(expandLSystem(PENROSE_TILING.axiom, PENROSE_TILING.rules, d), PENROSE_TILING);
        out[d] = { plain: lines.reduce((n, l) => n + l.length - 1, 0), counted: penroseStepCount(d) };
      }
      return out;
    });
    const want = [0, 20, 90, 400, 1780, 7920, 35240, 156800];
    for (let d = 0; d <= 7; d++) expect(r[d], `depth ${d}`).toEqual({ plain: want[d], counted: want[d] });
  });

  test("every step has unit length and every heading is a multiple of 36 degrees", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (let d = 1; d <= 6; d++) {
        let worstLen = 0, worstAngle = 0, n = 0;
        for (const line of turtleInterpret(expandLSystem(PENROSE_TILING.axiom, PENROSE_TILING.rules, d), PENROSE_TILING)) {
          for (let i = 1; i < line.length; i++) {
            const dx = line[i][0] - line[i - 1][0], dy = line[i][1] - line[i - 1][1];
            worstLen = Math.max(worstLen, Math.abs(Math.hypot(dx, dy) - 1));
            const steps = (Math.atan2(dy, dx) * 180) / Math.PI / 36;
            worstAngle = Math.max(worstAngle, Math.abs(steps - Math.round(steps)));
            n++;
          }
        }
        out.push({ d, n, worstLen, worstAngle });
      }
      return out;
    });
    for (const o of r) {
      expect(o.worstLen, `depth ${o.d} step length`).toBeLessThan(1e-9);
      expect(o.worstAngle, `depth ${o.d} heading, in units of 36 degrees`).toBeLessThan(1e-9);
    }
  });
});

test.describe("the distinct edges the view draws", () => {
  test("they are exactly the distinct edges of the plain string, each of unit length at a multiple of 36 degrees", async ({ page }) => {
    const r = await page.evaluate(() => {
      const key = (p, q) => [p, q].map((v) => v.map((z) => Math.round(z * 1000) + 0).join(",")).sort().join("|");
      const out = [];
      for (let d = 1; d <= 7; d++) {
        const raw = new Set();
        for (const line of turtleInterpret(expandLSystem(PENROSE_TILING.axiom, PENROSE_TILING.rules, d), PENROSE_TILING)) {
          for (let i = 1; i < line.length; i++) raw.add(key(line[i - 1], line[i]));
        }
        const e = penroseEdges(d), mine = new Set(), { ux, uy } = penroseSpec;
        let worstLen = 0, badHeading = 0;
        for (let i = 0; i < e.n; i++) {
          const p = [e.x[i], e.y[i]], q = [p[0] + ux[e.h[i]], p[1] + uy[e.h[i]]];
          mine.add(key(p, q));
          worstLen = Math.max(worstLen, Math.abs(Math.hypot(q[0] - p[0], q[1] - p[1]) - 1));
          if (!(e.h[i] >= 0 && e.h[i] <= 4)) badHeading++;
        }
        let missing = 0;
        for (const k of raw) if (!mine.has(k)) missing++;
        out.push({ d, n: e.n, unique: mine.size, rawUnique: raw.size, missing, worstLen, badHeading });
      }
      return out;
    });
    expect(r.map((o) => o.n), "distinct edges at depths 1-7").toEqual([15, 50, 135, 370, 995, 2670, 7105]);
    for (const o of r) {
      expect(o, `depth ${o.d}`).toMatchObject({ unique: o.n, rawUnique: o.n, missing: 0, badHeading: 0 });
      expect(o.worstLen).toBeLessThan(1e-9);
    }
  });

  test("the picture has five-fold symmetry about the star's center", async ({ page }) => {
    const r = await page.evaluate(() => {
      const key = (p, q) => [p, q].map((v) => v.map((z) => Math.round(z * 1000) + 0).join(",")).sort().join("|");
      const rot = (p, k) => { const a = (k * Math.PI) / 5; return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)]; };
      return [3, 5, 7].map((d) => {
        const e = penroseEdges(d), { ux, uy } = penroseSpec, set = new Set(), turned = [];
        for (let i = 0; i < e.n; i++) {
          const p = [e.x[i], e.y[i]], q = [p[0] + ux[e.h[i]], p[1] + uy[e.h[i]]];
          set.add(key(p, q));
          turned.push(key(rot(p, 2), rot(q, 2)));
        }
        return { d, n: e.n, matching: turned.filter((k) => set.has(k)).length };
      });
    });
    for (const o of r) expect(o.matching, `depth ${o.d}`).toBe(o.n);
  });

  test("the depth slider runs 1 to 9, and every depth fills a canvas inside its edges", async ({ page }) => {
    await show(page, 5);
    const r = await page.evaluate(async () => {
      const out = { min: els.dragonDepthSlider.min, max: els.dragonDepthSlider.max, start: dragonState.depth, depths: [] };
      const canvas = VECTOR_VIEWS.penrose[1];
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      for (let d = 1; d <= 9; d++) {
        dragonState.depth = d;
        els.dragonDepthSlider.value = d;
        fitVectorView("penrose");
        requestRender();
        await frame();
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
    expect([r.min, r.max]).toEqual(["1", "9"]);
    expect(r.start).toBe(5);
    for (const o of r.depths) {
      expect(o.lit, `depth ${o.d} is drawn`).toBeGreaterThan(200);
      expect(o.x0, `depth ${o.d} fits on the left`).toBeGreaterThan(0);
      expect(o.x1, `depth ${o.d} fits on the right`).toBeLessThan(o.w - 1);
      expect(o.y0, `depth ${o.d} fits at the top`).toBeGreaterThan(0);
      expect(o.y1, `depth ${o.d} fits at the bottom`).toBeLessThan(o.h - 1);
    }
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
        depth: dragonState.depth, curve: dragonView.curve,
      };
    });
    expect(r).toEqual({ controlsShown: true, canvasShown: true, depth: 5, curve: "penrose" });
  });

  test("the share link carries mode, depth, view and color, and opens to the same picture", async ({ page }) => {
    const r = await page.evaluate(() => {
      setMode("penrose");
      dragonState.depth = 7;
      fittedVectorModes.add("penrose");
      Object.assign(dragonView.view, { cx: 0.12, cy: -0.05, halfHeight: 0.3, rotation: 0.7 });
      vectorColors.penrose = SOLID_COLORS.findIndex((c) => c.name === "Gold");
      const hash = buildShareHash();
      const parsed = parseShareHash(hash);
      // Away, and back through the link.
      setMode("koch");
      dragonState.depth = 2;
      Object.assign(dragonView.view, { cx: 0, cy: 0, halfHeight: 1, rotation: 0 });
      vectorColors.penrose = 0;
      applyShareLink(`https://kmjohn1000.github.io/fractal-web/${hash}`);
      return { hash, parsed, mode, depth: dragonState.depth, color: SOLID_COLORS[vectorColors.penrose].name, view: { ...dragonView.view }, slider: els.dragonDepthSlider.value };
    });
    expect(r.hash).toContain("m=penrose");
    expect(r.hash).toContain("dp=7");
    expect(r.parsed).toMatchObject({ mode: "penrose", depth: 7, cx: 0.12, cy: -0.05, scale: 0.3 });
    expect(r.parsed.rotation).toBeCloseTo(0.7, 9);
    expect(r).toMatchObject({ mode: "penrose", depth: 7, color: "Gold", slider: "7" });
    expect(r.view).toMatchObject({ cx: 0.12, cy: -0.05, halfHeight: 0.3 });
    expect(r.view.rotation).toBeCloseTo(0.7, 9);
  });

  test("a junk value makes the link unreadable (so it is ignored), and older modes' links read as before", async ({ page }) => {
    const r = await page.evaluate(() => {
      const base = "#v=1&x=0&y=0&s=1&r=0&cm=Viridis";
      const out = {};
      for (const [name, q] of Object.entries({
        good: "m=penrose&dp=5&c=0", tooDeep: "m=penrose&dp=10&c=0", tooShallow: "m=penrose&dp=0&c=0", fraction: "m=penrose&dp=2.5&c=0", word: "m=penrose&dp=abc&c=0",
        badColor: "m=penrose&dp=5&c=99", otherName: "m=penrosee&dp=5&c=0", hilbert: "m=hilbert&dp=5&c=0", arrowhead: "m=arrowhead&dp=7",
      })) {
        const st = parseShareHash(`${base}&${q}`);
        out[name] = st ? { mode: st.mode, depth: st.depth } : null;
      }
      // A junk link applied to a view on screen leaves it alone.
      setMode("koch");
      applyShareLink(`https://kmjohn1000.github.io/fractal-web/${base}&m=penrose&dp=abc&c=0`);
      out.modeAfterJunk = mode;
      return out;
    });
    expect(r.good).toEqual({ mode: "penrose", depth: 5 });
    for (const k of ["tooDeep", "tooShallow", "fraction", "word", "badColor", "otherName"]) expect(r[k], k).toBeNull();
    expect(r.hilbert).toEqual({ mode: "hilbert", depth: 5 });
    expect(r.arrowhead).toEqual({ mode: "arrowhead", depth: 7 });
    expect(r.modeAfterJunk).toBe("koch");
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

  test("a two-finger twist turns the view and the picture, and the picture is still there", async ({ page }) => {
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
      await frame();
      const after = grab();
      let changed = 0, lit = 0;
      for (let i = 0; i < after.length; i += 4) {
        if (after[i] !== before[i] || after[i + 1] !== before[i + 1] || after[i + 2] !== before[i + 2]) changed++;
        if (after[i] + after[i + 1] + after[i + 2] > 60) lit++;
      }
      return { turned: Math.abs(view.view.rotation - turnedBefore), changed, lit, total: canvas.width * canvas.height };
    });
    expect(r.turned, "rotation changed by about a quarter turn").toBeGreaterThan(1.2);
    expect(r.changed, "the picture turned").toBeGreaterThan(r.total * 0.01);
    expect(r.lit, "the frame isn't blank").toBeGreaterThan(r.total * 0.01);
  });

  test("a rotated view draws the same edges as the unrotated one, turned about its center", async ({ page }) => {
    await show(page, 5);
    const r = await page.evaluate(() => {
      const canvas = VECTOR_VIEWS.penrose[1], ctx = canvas.getContext("2d");
      const count = (rotation) => {
        const view = { cx: 0, cy: 0, halfHeight: 3, rotation }; // roomy enough that no turn takes an edge off a narrow canvas
        const aff = vectorAffine(view, canvas.width, canvas.height);
        return drawPenrose(ctx, aff, { depth: 5, colors: curveRamp(0), dpr: 1, lite: true, look: CURVE_LOOK }).n;
      };
      return { flat: count(0), turned: count(0.9), g: penroseGeometry(5).n };
    });
    expect(r.flat).toBe(r.g);
    expect(r.turned).toBe(r.g);
  });

  test("Play steps the depth up level by level from where it is, and the picture changes with it", async ({ page }) => {
    await show(page, 2);
    const r = await page.evaluate(async () => {
      const canvas = VECTOR_VIEWS.penrose[1];
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const grab = () => Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data).join(",");
      depthPlayer.speedIndex = PLAY_SPEEDS.length - 1;
      const seen = [], pictures = new Set();
      startDepthPlay();
      seen.push(dragonState.depth);
      for (let i = 0; i < 80 && seen.length < 5; i++) {
        await new Promise((res) => setTimeout(res, 50));
        await frame();
        if (dragonState.depth !== seen[seen.length - 1]) { seen.push(dragonState.depth); pictures.add(grab()); }
      }
      stopDepthPlay();
      return { seen, slider: els.dragonDepthSlider.value, pictures: pictures.size };
    });
    expect(r.seen.slice(0, 4)).toEqual([3, 4, 5, 6]);
    expect(r.pictures, "every level is a new picture").toBeGreaterThanOrEqual(3);
  });

  test("Play turns round at the top, depth 9, and steps back down", async ({ page }) => {
    await show(page, 8);
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
    expect(r).toEqual([9, 8, 7, 6]);
  });
});

test.describe("culling", () => {
  test("a zoomed view draws only the edges that show, and the full view draws them all", async ({ page }) => {
    await show(page, 9);
    const r = await page.evaluate(() => {
      const canvas = VECTOR_VIEWS.penrose[1], ctx = canvas.getContext("2d");
      const n = penroseGeometry(9).n;
      const draw = (view) => drawPenrose(ctx, vectorAffine(view, canvas.width, canvas.height), { depth: 9, colors: curveRamp(0), dpr: 1, lite: true, look: CURVE_LOOK }).n;
      const fit = { ...dragonView.view };
      return { n, full: draw(fit), zoom8: draw({ ...fit, halfHeight: fit.halfHeight / 8 }), zoom40: draw({ ...fit, halfHeight: fit.halfHeight / 40 }), away: draw({ ...fit, cx: 50, cy: 50 }) };
    });
    expect(r.full).toBeGreaterThan(r.n * 0.95);
    expect(r.zoom8).toBeLessThan(r.n * 0.1);
    expect(r.zoom40).toBeLessThan(r.n * 0.01);
    expect(r.away).toBe(0);
  });

  test("zoomed in far, the tiles are the same tiles: no levels are added, and the picture is not blank", async ({ page }) => {
    await show(page, 5, { halfHeight: 0.05 });
    const r = await page.evaluate(() => {
      const canvas = VECTOR_VIEWS.penrose[1], px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 60) lit++;
      return { lit, total: canvas.width * canvas.height, extra: dragonView.extraLevels, maxDepth: LINE_CURVES.penrose.maxDepth };
    });
    expect(r.extra).toBe(0);
    expect(r.lit).toBeGreaterThan(r.total * 0.005);
  });

  test("the points that frame the picture lie inside the unit box", async ({ page }) => {
    const r = await page.evaluate(() => [1, 5, 9].map((d) => {
      const pts = penrosePoints(d);
      return { d, worst: Math.max(...pts.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)))) };
    }));
    for (const o of r) expect(o.worst, `depth ${o.d}`).toBeLessThanOrEqual(1 + 1e-9);
  });
});
