// The Koch snowflake colored by generation (1.49.0) and the growth of a new generation when the depth
// slider goes up a level. Each generation of triangles (the level-0 triangle, then the bumps each split
// adds) has its own flat shade climbing from a deep radial-gradient triangle to the picked color, which the
// finest generation is; thin dark gutters run between a triangle and its parent where they are big; the
// outline is a clear line; the tips keep a margin from the canvas edge; a gesture (opts.lite) draws a
// cheaper frame; and the new generation rises from its base edges, ending exactly on the final frame, not
// at all under reduced motion, cancelled by any gesture, and never half grown in a saved picture.
// Baselines of the shape are mode-koch in app.spec.mjs and the koch ones in vector.spec.mjs.
import { test, expect } from "@playwright/test";

/* global setMode, kochView, kochState, vectorColors, SOLID_COLORS, buildShareHash, applyShareLink, els, mode,
   requestRender, renderAll, fittedVectorModes, fitVectorView, vectorFitHalfHeight, vectorViewIsFitted,
   captureShareBlob, depthPlayer, PLAY_SPEEDS, DEPTH_STEP_MS, KOCH_GROW_MS, KOCH_GROW_STEP_SHARE, KOCH_TRI_BUDGET,
   KOCH_LITE_TRI_BUDGET, kochNav, BACKDROP_CENTER_RGB */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];   // Green, Autumn, Violet, Ice, Rose, Gold, White, Blue, Teal, Coral (7-9 added in 1.52.0)
const ICE = 3;

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
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("index.html");
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await page.waitForFunction(() => typeof setMode === "function" && typeof kochView !== "undefined");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Shows the snowflake at a depth and color in its default framing, or in `view`, and waits for the frame.
async function show(page, { depth = 4, color = ICE, fill = true, view = null }) {
  await page.evaluate(([depth, color, fill, view]) => {
    setMode("koch");
    kochView.cancelGrow();
    kochState.depth = depth; kochState.fill = fill; vectorColors.koch = color;
    els.kochDepthSlider.value = String(depth);
    fittedVectorModes.add("koch");
    fitVectorView("koch");
    if (view) Object.assign(kochView.view, { rotation: 0 }, view);
    requestRender();
  }, [depth, color, fill, view]);
  await frames(page);
}

// The bump a split of the piece a -> b adds, and the pieces around it, as the walk makes them (koch.js).
// In page code: kochChain(n, A, B) is the chain of bumps of generations 1..n, each on the first
// non-base side (p1 -> tip) of the one before, and the first piece (A -> B) it starts on.
const CHAIN = `
  const bump = ([ax, ay], [bx, by]) => {
    const ux = (bx - ax) / 3, uy = (by - ay) / 3;
    const p1 = [ax + ux, ay + uy], p2 = [ax + 2 * ux, ay + 2 * uy];
    const tip = [p1[0] + ux * 0.5 + uy * Math.sqrt(3) / 2, p1[1] + uy * 0.5 - ux * Math.sqrt(3) / 2];
    return { p1, p2, tip, centroid: [(p1[0] + p2[0] + tip[0]) / 3, (p1[1] + p2[1] + tip[1]) / 3] };
  };
  const chain = (n) => {
    const out = [];
    let a = [0, 1], b = [-Math.sqrt(3) / 2, -0.5];
    for (let g = 1; g <= n; g++) { const t = bump(a, b); out.push(t); a = t.p1; b = t.tip; }
    return out;
  };
`;

// The rgb at a world point (1 px). null when it is off the canvas.
function colorAt(page, x, y) {
  return page.evaluate(([x, y]) => {
    const canvas = els.kochCanvas, [sx, sy] = kochView.worldToScreen(x, y);
    if (sx < 1 || sy < 1 || sx > canvas.width - 2 || sy > canvas.height - 2) return null;
    const d = canvas.getContext("2d").getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [x, y]);
}

// The centroids of the bumps of generations 1..n of the chain, as world points.
const chainCentroids = (page, n) => page.evaluate(([CHAIN, n]) => new Function(`${CHAIN}; return chain(${n}).map((t) => t.centroid);`)(), [CHAIN, n]);

const lum = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;
const hueOf = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return NaN;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const pickedRgb = (page, ci) => page.evaluate((ci) => SOLID_COLORS[ci].rgb, ci);

test.describe("generations", () => {
  test("each generation is a brighter shade of the one before, and the finest is the picked color", async ({ page }) => {
    await show(page, { depth: 4 });
    const picked = await pickedRgb(page, ICE);
    const cs = await chainCentroids(page, 4);
    // The level-0 triangle just inside the first bump's base (the triangle is a radial gradient, lightest at its
    // center, so the shade that sits against generation 1 is the one compared), then the bump of each generation 1 to 4.
    const mid = await page.evaluate((CHAIN) => new Function(`${CHAIN}; const t = chain(1)[0]; return [(t.p1[0] + t.p2[0]) / 2, (t.p1[1] + t.p2[1]) / 2];`)(), CHAIN);
    const samples = [await colorAt(page, mid[0] * 0.88, mid[1] * 0.88)];
    for (const c of cs) samples.push(await colorAt(page, c[0], c[1]));
    for (const s of samples) expect(s, "every sample is on the canvas").not.toBeNull();
    const L = samples.map(lum);
    for (let g = 1; g <= 4; g++) expect(L[g], `generation ${g} is brighter than generation ${g - 1}: ${samples.map((s) => s.map(Math.round))}`).toBeGreaterThan(L[g - 1] * 1.04);
    // The finest generation at this depth is the picked color itself.
    expect(near(samples[4], picked, 6), `finest ${samples[4]} vs picked ${picked}`).toBe(true);
    // The level-0 triangle is a deep shade in the same family (within 30 degrees of the picked hue), well under the picked brightness.
    expect(hueGap(hueOf(samples[0]), hueOf(picked)), `level-0 hue ${hueOf(samples[0])}`).toBeLessThan(30);
    expect(L[0]).toBeLessThan(lum(picked) * 0.75);
  });

  test("the finest generation is the picked color at any depth up to the ramp length", async ({ page }) => {
    const picked = await pickedRgb(page, ICE);
    for (const depth of [1, 2, 3]) {
      await show(page, { depth });
      const cs = await chainCentroids(page, depth);
      const finest = await colorAt(page, cs[depth - 1][0], cs[depth - 1][1]);
      expect(near(finest, picked, 6), `depth ${depth}: finest ${finest} vs picked ${picked}`).toBe(true);
      // ... and the level-0 triangle is darker than it, so even a depth 1 star has two shades.
      const base = await colorAt(page, 0, 0);
      expect(lum(base), `depth ${depth}: level-0 ${base}`).toBeLessThan(lum(picked) * 0.85);
    }
  });

  test("past the ramp, deeper generations keep telling themselves from their parents (zoomed in)", async ({ page }) => {
    // Depth 8, centered on a generation-5 bump with a view spanning generations 4 to 6.
    const cs = await chainCentroids(page, 6);
    await show(page, { depth: 8, view: { cx: cs[4][0], cy: cs[4][1], halfHeight: 0.05 } });
    const L = [];
    for (const g of [4, 5, 6]) L.push(lum(await colorAt(page, cs[g - 1][0], cs[g - 1][1])));
    expect(Math.abs(L[1] - L[0]) / L[0], `generation 5 vs 4: ${L}`).toBeGreaterThan(0.08);
    expect(Math.abs(L[2] - L[1]) / L[1], `generation 6 vs 5: ${L}`).toBeGreaterThan(0.08);
    // The shade never leaves the picked color's family however deep it is.
    const picked = await pickedRgb(page, ICE);
    for (const g of [4, 5, 6]) {
      const s = await colorAt(page, cs[g - 1][0], cs[g - 1][1]);
      expect(hueGap(hueOf(s), hueOf(picked)), `generation ${g} hue`).toBeLessThan(12);
    }
  });

  test("depth 5 to 8 stay different from depth 4 where there is room (zoomed), and each is drawn", async ({ page }) => {
    await show(page, { depth: 8, view: { cx: 0.2887, cy: 0.5, halfHeight: 0.02 } });
    const s = await page.evaluate(() => kochView.stats);
    expect(s.finest, "generations drawn in the zoomed view").toBeGreaterThanOrEqual(7);
    expect(s.fills, "a handful of fills, one per generation").toBeLessThanOrEqual(s.finest + 3);
    expect(s.gutters, "gutters on the big generations").toBeGreaterThan(0);
  });

  for (const ci of COLORS) {
    test(`color ${ci}: lit, the finest generation is the picked color, the level-0 triangle is darker`, async ({ page }) => {
      await show(page, { depth: 4, color: ci });
      const picked = await pickedRgb(page, ci);
      const lit = await page.evaluate(() => {
        const c = els.kochCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) n++;
        return n;
      });
      expect(lit, "bright pixels").toBeGreaterThan(50_000);
      const cs = await chainCentroids(page, 4);
      const finest = await colorAt(page, cs[3][0], cs[3][1]);
      expect(near(finest, picked, 8), `finest ${finest} vs picked ${picked}`).toBe(true);
      // The level-0 triangle's lightest point, its center, is 0.74 x 1.10 = 0.81 of the picked color (1.50.1; it was 0.58 x 1.16 = 0.67).
      const base = await colorAt(page, 0, 0);
      expect(lum(base)).toBeLessThan(lum(picked) * 0.9);
      expect(lum(base), "but not black").toBeGreaterThan(lum(picked) * 0.3);
    });
  }

  // 1.50.1: the level-0 triangle is most of the picture, and a deep shade of Violet or Rose sank to about 1.6:1
  // against the backdrop at its corners. Its shade is now at least about 2.3:1 (WCAG luminance ratio against the
  // backdrop's center color, a proxy) a little in from its top corner (world 0, 0.8), where the radial gradient is darkest.
  for (const ci of COLORS) {
    test(`color ${ci}: the level-0 triangle holds against the backdrop (contrast floor)`, async ({ page }) => {
      await show(page, { depth: 4, color: ci });
      const c = await colorAt(page, 0, 0.8);
      const ratio = await page.evaluate((c) => {
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const a = L(c), b = L(BACKDROP_CENTER_RGB);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }, c);
      expect(ratio, `level-0 shade ${c} against the backdrop`).toBeGreaterThan(2.2);
    });
  }

  test("a dark gutter runs between a big triangle and its parent, and small ones get none", async ({ page }) => {
    await show(page, { depth: 4 });
    // Across the base edge of the first bump: the gutter pixel is darker than both the level-0 triangle and the bump.
    const r = await page.evaluate((CHAIN) => {
      const t = new Function(`${CHAIN}; return chain(1)[0];`)();
      const canvas = els.kochCanvas, g = canvas.getContext("2d");
      const mid = [(t.p1[0] + t.p2[0]) / 2, (t.p1[1] + t.p2[1]) / 2];
      // The bump's outward direction, as a screen vector.
      const [mx, my] = kochView.worldToScreen(mid[0], mid[1]), [tx, ty] = kochView.worldToScreen(t.tip[0], t.tip[1]);
      const len = Math.hypot(tx - mx, ty - my), ux = (tx - mx) / len, uy = (ty - my) / len;
      const px = (d) => { const p = g.getImageData(Math.round(mx + ux * d), Math.round(my + uy * d), 1, 1).data; return p[0] + p[1] + p[2]; };
      void canvas;
      return { inside: px(-10), edge: Math.min(px(-1), px(0), px(1)), outside: px(10), stats: kochView.stats };
    }, CHAIN);
    expect(r.edge, `edge ${r.edge} vs ${r.inside} / ${r.outside}`).toBeLessThan(Math.min(r.inside, r.outside) * 0.85);
    expect(r.stats.gutters, "generations with a gutter").toBeGreaterThanOrEqual(2);
    // Lite frames and small ones draw none.
    const lite = await page.evaluate(() => {
      kochView.render({ depth: 4, fill: true, colorIndex: 3, fitHalfHeight: vectorFitHalfHeight("koch"), lite: true });
      return kochView.stats;
    });
    expect(lite.gutters).toBe(0);
  });

  test("a glow under the silhouette in a full frame, none in a lite frame, and lite draws fewer things", async ({ page }) => {
    await show(page, { depth: 8 });
    const r = await page.evaluate(() => {
      const opts = { depth: 8, fill: true, colorIndex: 3, fitHalfHeight: vectorFitHalfHeight("koch") };
      kochView.render(opts);
      const full = { ...kochView.stats };
      const fullGlowPx = (() => { const c = els.kochCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) n++; return n; })();
      kochView.render({ ...opts, lite: true });
      const lite = { ...kochView.stats };
      const litePx = (() => { const c = els.kochCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) n++; return n; })();
      return { full, lite, fullGlowPx, litePx, budget: [KOCH_TRI_BUDGET, KOCH_LITE_TRI_BUDGET] };
    });
    expect(r.full.glow).toBe(true);
    expect(r.lite.glow).toBe(false);
    expect(r.lite.fills + r.lite.strokes, `lite ${JSON.stringify(r.lite)} vs full ${JSON.stringify(r.full)}`).toBeLessThan(r.full.fills + r.full.strokes);
    expect(r.litePx, "the glow lights pixels around the shape that a lite frame doesn't").toBeLessThan(r.fullGlowPx);
    expect(r.full.shaded).toBeLessThanOrEqual(r.budget[0]);
    expect(r.lite.shaded).toBeLessThanOrEqual(r.budget[1]);
  });

  test("a lite frame still has the shades (the finest is the picked color, the level-0 triangle darker)", async ({ page }) => {
    await show(page, { depth: 4 });
    const picked = await pickedRgb(page, ICE);
    await page.evaluate(() => kochView.render({ depth: 4, fill: true, colorIndex: 3, fitHalfHeight: vectorFitHalfHeight("koch"), lite: true }));
    const cs = await chainCentroids(page, 4);
    const finest = await colorAt(page, cs[3][0], cs[3][1]);
    expect(near(finest, picked, 8), `finest ${finest}`).toBe(true);
    expect(lum(await colorAt(page, 0, 0))).toBeLessThan(lum(picked) * 0.9);
    const c1 = await colorAt(page, cs[0][0], cs[0][1]);
    expect(lum(c1), "generation 1 between them").toBeGreaterThan(lum(await colorAt(page, 0, 0)));
  });

  test("the triangle budget: a view with more triangles than a lite frame shades keeps its fills to a handful", async ({ page }) => {
    // The whole snowflake filling a wide canvas, so there are thousands of triangles.
    await page.setViewportSize({ width: 1280, height: 800 });
    await show(page, { depth: 8, view: { cx: 0, cy: 0.1, halfHeight: 0.22 } });
    const r = await page.evaluate(() => {
      const opts = { depth: 8, fill: true, colorIndex: 3, fitHalfHeight: vectorFitHalfHeight("koch") };
      kochView.render(opts);
      const full = { ...kochView.stats };
      kochView.render({ ...opts, lite: true });
      return { full, lite: { ...kochView.stats }, budget: KOCH_LITE_TRI_BUDGET };
    });
    expect(r.full.fills, "fills, one per generation").toBeLessThan(16);
    expect(r.lite.shaded).toBeLessThanOrEqual(r.budget);
    expect(r.lite.fills).toBeLessThan(16);
  });
});

test.describe("framing", () => {
  test("on a phone every tip keeps a margin from the canvas edge, and Reset gives the same framing", async ({ page }) => {
    await show(page, { depth: 4 });
    const r = await page.evaluate(() => {
      const c = els.kochCanvas, h = Math.sqrt(3) / 2;
      const tips = [[0, 1], [h, 0.5], [h, -0.5], [0, -1], [-h, -0.5], [-h, 0.5]].map(([x, y]) => kochView.worldToScreen(x, y));
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, x1 = 0, y0 = c.height, y1 = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] + d[i + 1] + d[i + 2] > 150) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      return { w: c.width, h: c.height, tips, lit: [x0, x1, y0, y1] };
    });
    for (const [x, y] of r.tips) {
      expect(Math.min(x, r.w - x) / r.w, `tip x ${x} of ${r.w}`).toBeGreaterThan(0.06);
      expect(Math.min(y, r.h - y) / r.h, `tip y ${y} of ${r.h}`).toBeGreaterThan(0.03);
    }
    expect(r.lit[0] / r.w, "lit pixels start well in from the left").toBeGreaterThan(0.06);
    expect((r.w - r.lit[1]) / r.w, "and from the right").toBeGreaterThan(0.06);
    // It still fills the width (not shrunk to a speck).
    expect((r.lit[1] - r.lit[0]) / r.w).toBeGreaterThan(0.75);

    // Pan, zoom and turn it, then Reset: back to the same framing.
    await page.evaluate(() => { Object.assign(kochView.view, { cx: 0.5, cy: 0.2, halfHeight: 0.3, rotation: 0.7 }); requestRender(); });
    await frames(page);
    expect(await page.evaluate(() => vectorViewIsFitted("koch"))).toBe(false);
    await page.evaluate(() => els.kochResetBtn.click());
    await frames(page);
    expect(await page.evaluate(() => vectorViewIsFitted("koch"))).toBe(true);
    const back = await page.evaluate(() => kochView.worldToScreen(0, 1));
    expect(back[0]).toBeCloseTo(r.tips[0][0], 0);
    expect(back[1]).toBeCloseTo(r.tips[0][1], 0);
  });

  test("on a desktop the tips keep a margin top and bottom too", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await show(page, { depth: 4 });
    const m = await page.evaluate(() => {
      const c = els.kochCanvas, [, y1] = kochView.worldToScreen(0, 1), [, y2] = kochView.worldToScreen(0, -1);
      return Math.min(y1, c.height - y2, y2, c.height - y1) / c.height;
    });
    expect(m).toBeGreaterThan(0.03);
  });

  test("share links keep the view, depth, fill and color", async ({ page }) => {
    await show(page, { depth: 5, color: 4, fill: false, view: { cx: 0.2, cy: 0.3, halfHeight: 0.4, rotation: 0.3 } });
    const hash = await page.evaluate(() => buildShareHash());
    await show(page, { depth: 2, color: 0, fill: true });
    await page.evaluate((h) => applyShareLink(`https://example.org/${h}`), hash);
    await frames(page);
    const r = await page.evaluate(() => ({ mode, depth: kochState.depth, fill: kochState.fill, color: vectorColors.koch, view: { ...kochView.view }, growing: kochView.growing }));
    expect(r.mode).toBe("koch");
    expect(r.depth).toBe(5);
    expect(r.fill).toBe(false);
    expect(r.color).toBe(4);
    expect(r.view.cx).toBeCloseTo(0.2, 3);
    expect(r.view.halfHeight).toBeCloseTo(0.4, 3);
    expect(r.growing, "opening a link doesn't animate").toBe(false);
  });
});

test.describe("outline", () => {
  test("the line is never under 1.1 css px, in a dense frame and a sparse one, and it is drawn at that width", async ({ page }) => {
    for (const depth of [1, 8]) {
      await show(page, { depth, fill: false });
      const r = await page.evaluate(() => ({ core: kochView.stats.core, dpr: kochView.dpr, glow: kochView.stats.glow }));
      expect(r.core / r.dpr, `depth ${depth}: line width in css px`).toBeGreaterThanOrEqual(1.1);
      expect(r.glow, "a soft glow around it in a full frame").toBe(true);
    }
    // Measured on the pixels, with no glow (a lite frame): a straight stretch (the star's bottom edge at depth 1) crossed
    // by a column of pixels has as much light in it as the line is wide.
    await show(page, { depth: 1, fill: false });
    const m = await page.evaluate(() => {
      kochView.render({ depth: 1, fill: false, colorIndex: 3, fitHalfHeight: vectorFitHalfHeight("koch"), lite: true });
      const c = els.kochCanvas, g = c.getContext("2d"), core = kochView.stats.core;
      // The star's lowest horizontal edges are at y = -0.5 (the bottom of the upper triangle, between the lower points).
      const [sx, sy] = kochView.worldToScreen(0.5, -0.5);
      const back = g.getImageData(Math.round(sx), Math.round(sy) - 25, 1, 1).data;
      const col = g.getImageData(Math.round(sx), Math.round(sy) - 20, 1, 40).data;
      const line = SOLID_COLORS[3].rgb;
      let cover = 0;
      for (let i = 0; i < 40; i++) for (const q of [1]) cover += Math.max(0, col[i * 4 + q] - back[q]) / (line[q] - back[q]);
      return { core, cover, dpr: kochView.dpr };
    });
    expect(m.cover / m.dpr, `light in the column ${m.cover} vs line ${m.core}`).toBeGreaterThanOrEqual(1.0);
    expect(m.cover, "and about the line's width").toBeLessThan(m.core * 1.3);
  });

  test("the outline stays a line in the picked color family at depth 4 and zoomed", async ({ page }) => {
    await show(page, { depth: 4, fill: false, view: { cx: 0.2887, cy: 0.5, halfHeight: 0.05 } });
    const lit = await page.evaluate(() => {
      const c = els.kochCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) n++;
      return n;
    });
    expect(lit, "the line lights pixels").toBeGreaterThan(500);
  });
});

test.describe("a new generation grows in", () => {
  // Raises the depth slider one level the way a drag does.
  const step = (page, to) => page.evaluate((to) => {
    els.kochDepthSlider.value = String(to);
    els.kochDepthSlider.dispatchEvent(new Event("input"));
  }, to);
  const pixels = (page) => page.evaluate(() => {
    const c = els.kochCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + 7 * d[i + 1] + 13 * d[i + 2]) | 0;
    return h;
  });

  test("one level deeper starts a reveal that ends on exactly the final frame", async ({ page }) => {
    await show(page, { depth: 2 });
    await step(page, 3);
    expect(await page.evaluate(() => kochView.growing), "growing right after the step").toBe(true);
    expect(await page.evaluate(() => kochView.growMs)).toBeLessThanOrEqual(await page.evaluate(() => KOCH_GROW_MS));
    await page.waitForFunction(() => !kochView.growing, null, { timeout: 5000 });
    await frames(page);
    const finished = await pixels(page);
    // A plain render of depth 3 is the same picture, pixel for pixel.
    await page.evaluate(() => renderAll());
    expect(await pixels(page)).toBe(finished);
    expect(await page.evaluate(() => vectorViewIsFitted("koch"))).toBe(true);
  });

  test("a frame partway through differs from the final one (the tips are not all the way out), and the first is the old picture plus slivers", async ({ page }) => {
    await show(page, { depth: 2 });
    const r = await page.evaluate(() => {
      const opts = { depth: 3, fill: true, colorIndex: 3, fitHalfHeight: vectorFitHalfHeight("koch") };
      kochState.depth = 3;
      kochView.startGrow(3, 1000);
      const t0 = kochView.growStart;
      const grab = (now) => {
        kochView.render({ ...opts, now });
        const c = els.kochCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let lit = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 150) lit++;
        return lit;
      };
      // Eased out: a third of the way in is already well on its way.
      const early = grab(t0 + 50), mid = grab(t0 + 300), late = grab(t0 + 700);
      const growingMid = kochView.growing;
      const done = grab(t0 + 1000);
      return { early, mid, late, done, growingMid, growingAfter: kochView.growing };
    });
    expect(r.growingMid).toBe(true);
    expect(r.growingAfter, "the final frame ends it").toBe(false);
    expect(r.early).toBeLessThan(r.mid);
    expect(r.mid).toBeLessThan(r.late);
    expect(r.late).toBeLessThan(r.done);
  });

  test("going down, or two levels at once, just redraws", async ({ page }) => {
    await show(page, { depth: 4 });
    await step(page, 3);
    expect(await page.evaluate(() => kochView.growing)).toBe(false);
    await step(page, 5);
    expect(await page.evaluate(() => kochView.growing), "jumping two levels").toBe(false);
  });

  test("reduced motion: no reveal at all", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await show(page, { depth: 2 });
    await step(page, 3);
    expect(await page.evaluate(() => kochView.growing)).toBe(false);
    await frames(page);
    expect(await page.evaluate(() => kochState.depth)).toBe(3);
  });

  test("a gesture cancels it, and the view it moved is drawn finished", async ({ page }) => {
    await show(page, { depth: 2 });
    await step(page, 3);
    expect(await page.evaluate(() => kochView.growing)).toBe(true);
    await page.evaluate(() => {
      const c = els.kochCanvas, r = c.getBoundingClientRect();
      c.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
    });
    await frames(page);
    expect(await page.evaluate(() => kochView.growing)).toBe(false);
    expect(await page.evaluate(() => kochView.view.halfHeight)).toBeLessThan(await page.evaluate(() => vectorFitHalfHeight("koch")));
  });

  test("another depth step, a mode switch and Reset end it", async ({ page }) => {
    await show(page, { depth: 2 });
    await step(page, 3);
    await step(page, 4);   // two levels from the first start, one from the last: only the newest grows
    expect(await page.evaluate(() => [kochView.growing, kochView.growMs > 0])).toEqual([true, true]);
    await page.evaluate(() => setMode("tree"));
    expect(await page.evaluate(() => kochView.growing), "leaving the mode").toBe(false);
    await show(page, { depth: 2 });
    await step(page, 3);
    await page.evaluate(() => els.kochResetBtn.click());
    await frames(page);
    // Reset didn't move the (fitted) view, so the reveal may finish by itself; either way it ends.
    await page.waitForFunction(() => !kochView.growing, null, { timeout: 5000 });
  });

  test("Save image during the reveal is the finished frame", async ({ page }) => {
    await show(page, { depth: 2 });
    await step(page, 3);
    expect(await page.evaluate(() => kochView.growing)).toBe(true);
    const r = await page.evaluate(async () => {
      const blob = await captureShareBlob();
      const growing = kochView.growing;
      const img = await createImageBitmap(blob);
      const grab = (src) => { const c = document.createElement("canvas"); c.width = src.width; c.height = src.height; const g = c.getContext("2d"); g.drawImage(src, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const saved = grab(img), screen = grab(els.kochCanvas);
      // The finished frame, drawn again from scratch.
      kochView.render({ depth: 3, fill: true, colorIndex: 3, fitHalfHeight: vectorFitHalfHeight("koch") });
      const fresh = grab(els.kochCanvas);
      let diffSaved = 0, n = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (x > img.width * 0.5 && y > img.height * 0.9) continue;   // the watermark
          const i = (y * img.width + x) * 4;
          diffSaved += Math.abs(saved[i] - fresh[i]) + Math.abs(saved[i + 1] - fresh[i + 1]) + Math.abs(saved[i + 2] - fresh[i + 2]);
          n += 3;
        }
      }
      let diffScreen = 0;
      for (let i = 0; i < screen.length; i++) diffScreen += Math.abs(screen[i] - fresh[i]);
      return { growing, mean: diffSaved / n, diffScreen };
    });
    expect(r.growing, "capture ended the reveal").toBe(false);
    expect(r.mean, "the saved picture is the finished frame (mean channel difference)").toBeLessThan(0.5);
    expect(r.diffScreen, "so is the canvas on screen").toBe(0);
  });

  test("during depth play the reveal takes at most 60% of a step, and speeds up with the play speed", async ({ page }) => {
    await show(page, { depth: 2 });
    const r = await page.evaluate(() => {
      const out = [];
      depthPlayer.slider = els.kochDepthSlider;
      for (const speed of [0.25, 1, 4]) {
        depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(speed);
        kochState.depth = 2; els.kochDepthSlider.value = "3";
        els.kochDepthSlider.dispatchEvent(new Event("input"));
        out.push({ speed, ms: kochView.growMs, step: DEPTH_STEP_MS / speed, share: KOCH_GROW_STEP_SHARE });
        kochView.cancelGrow();
      }
      depthPlayer.slider = null;
      return out;
    });
    for (const o of r) expect(o.ms, `${o.speed}x: ${o.ms} ms of a ${o.step} ms step`).toBeLessThanOrEqual(o.step * o.share + 1e-6);
    expect(r[2].ms, "faster at 4x").toBeLessThan(r[1].ms);
    expect(r[1].ms, "1x is the 700 ms step's 60% = 420, capped at the usual length").toBeLessThanOrEqual(await page.evaluate(() => KOCH_GROW_MS));
    expect(r[0].ms, "a slow speed gets the usual length").toBe(await page.evaluate(() => KOCH_GROW_MS));
  });

  test("a generation too small to see has nothing to grow", async ({ page }) => {
    // Depth 7 to 8 on a phone adds nothing visible, so no reveal is left running.
    await show(page, { depth: 7 });
    await step(page, 8);
    await frames(page);
    expect(await page.evaluate(() => kochView.growing)).toBe(false);
  });

  test("the panel navigation still works after a reveal (Back returns the previous view)", async ({ page }) => {
    await show(page, { depth: 2 });
    await step(page, 3);
    await page.waitForFunction(() => !kochView.growing, null, { timeout: 5000 });
    await page.evaluate(() => { kochNav.checkpoint(); Object.assign(kochView.view, { cx: 0.1 }); requestRender(); });
    await frames(page);
    await page.evaluate(() => els.kochBackBtn.click());
    await frames(page);
    expect(await page.evaluate(() => vectorViewIsFitted("koch"))).toBe(true);
  });
});
