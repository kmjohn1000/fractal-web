// The palettes of the Pythagoras tree and the Hexaflake (1.48.1, 1.50.1), for each of the ten picker colors (the
// last three, Blue, Teal and Coral, since 1.52.0):
// the tree has a wooden trunk and first two branches when the picked color is Green (the other nine shade the
// trunk in their own color), with the picked color (and a hue turned 12 degrees in OKLCH on every other level)
// carrying the canopy and the faces turned from the light still standing out from the backdrop; the hexaflake's
// shade climbs level by level from a dark shadow turned 7 degrees (OKLCH) from the picked hue (its outermost level a
// lighter 0.40 of the picked brightness since 1.50.1) to the picked color itself and stays there however deep a
// zoom goes, every other level past it dimmer, and the larger hexagons carry a thin dark gutter. Baselines of
// both shapes are in app.spec.mjs and vector.spec.mjs.
import { test, expect } from "@playwright/test";

/* global setMode, fernView, treeState, hexaflakeState, vectorColors, SOLID_COLORS, fittedVectorModes, fitVectorView,
   requestRender, VECTOR_VIEWS, vectorFitHalfHeight, pythagorasTree, BACKDROP_CENTER_RGB */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];   // Green, Autumn, Violet, Ice, Rose, Gold, White, Blue, Teal, Coral (7-9 added in 1.52.0)
const CHROMATIC = [0, 1, 2, 3, 4, 5, 7, 8, 9];   // White (6) has no hue

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
  await page.waitForFunction(() => typeof setMode === "function" && typeof fernView !== "undefined");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Shows a shape at a depth and color, in its default framing or in `view`, and waits for the frame.
async function show(page, m, depth, colorIndex, view = null) {
  await page.evaluate(([m, depth, colorIndex, view]) => {
    setMode(m);
    (m === "tree" ? treeState : hexaflakeState).depth = depth;
    vectorColors[m] = colorIndex;
    fittedVectorModes.add(m);
    fitVectorView(m);
    if (view) Object.assign(VECTOR_VIEWS[m][0].view, { rotation: 0 }, view);
    requestRender();
  }, [m, depth, colorIndex, view]);
  await frames(page);
}

// The rgb at a world point of a shape's canvas (a 3 x 3 block mean).
function colorAt(page, m, x, y) {
  return page.evaluate(([m, x, y]) => {
    const canvas = VECTOR_VIEWS[m][1], [sx, sy] = VECTOR_VIEWS[m][0].worldToScreen(x, y);
    if (sx < 2 || sy < 2 || sx > canvas.width - 3 || sy > canvas.height - 3) return null;
    const px = canvas.getContext("2d").getImageData(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < px.length; i += 4) for (let q = 0; q < 3; q++) sum[q] += px[i + q];
    return sum.map((v) => v / 9);
  }, [m, x, y]);
}

const lum = ([r, g, b]) => r + g + b;
const hueOf = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return NaN;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const pickedRgb = (page, ci) => page.evaluate((ci) => SOLID_COLORS[ci].rgb, ci);

// The hue gap from the picked color of the 2nd and 98th percentile of a shape's saturated, fairly bright
// pixels (the gap to the picked hue, per pixel, sorted), how many there were, and the lit pixels' bounding box.
function hueSpread(page, m, picked, region = null) {
  return page.evaluate(([m, picked, region]) => {
    const canvas = VECTOR_VIEWS[m][1], px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const gaps = [];
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    // region.worldYAbove: only the part of the canvas above that world height (the tree's canopy).
    const yMax = region ? Math.floor(VECTOR_VIEWS[m][0].worldToScreen(0, region.worldYAbove)[1]) : canvas.height;
    for (let y = 0; y < yMax; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max < 70) continue;
        if (max > 60) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if ((max - min) / max < 0.25) continue;
        let h;
        if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
        h = (h * 60 + 360) % 360;
        const d = Math.abs(h - picked) % 360;
        gaps.push(Math.min(d, 360 - d));
      }
    }
    gaps.sort((a, b) => a - b);
    return { n: gaps.length, p02: gaps[Math.floor(gaps.length * 0.02)], p98: gaps[Math.floor(gaps.length * 0.98)], bbox: [x0 / canvas.width, x1 / canvas.width, y0 / canvas.height, y1 / canvas.height] };
  }, [m, picked, region]);
}

const GREEN = 0;

test.describe("Pythagoras tree", () => {
  test("Green has a wooden trunk, unlike its canopy; the nine other colors shade the trunk in their own color", async ({ page }) => {
    for (const ci of COLORS) {
      await show(page, "tree", 9, ci);
      // The middle of the trunk square (a unit square on [-0.5, 0.5] x [0, 1]).
      const trunk = await colorAt(page, "tree", 0, 0.5);
      const picked = await pickedRgb(page, ci);
      if (ci === GREEN) {
        // The canopy: every lit pixel above the first branches (world y 2.2 and up).
        const canopy = await page.evaluate(() => {
          const canvas = VECTOR_VIEWS.tree[1], view = VECTOR_VIEWS.tree[0];
          const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          const yEnd = Math.floor(view.worldToScreen(0, 2.2)[1]);
          const sum = [0, 0, 0];
          let n = 0;
          for (let y = 0; y < yEnd; y++) for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (px[i] + px[i + 1] + px[i + 2] < 150) continue;   // the backdrop and the darkest faces
            sum[0] += px[i]; sum[1] += px[i + 1]; sum[2] += px[i + 2]; n++;
          }
          return { n, mean: sum.map((v) => v / n) };
        });
        expect(canopy.n, "the canopy is lit").toBeGreaterThan(2000);
        const dist = Math.hypot(trunk[0] - canopy.mean[0], trunk[1] - canopy.mean[1], trunk[2] - canopy.mean[2]);
        expect(dist, `trunk ${trunk.map(Math.round)} vs canopy mean ${canopy.mean.map(Math.round)}`).toBeGreaterThan(30);
        // The trunk is brown: red over green over blue, and not a darker shade of the picked green.
        expect(trunk[0] > trunk[1] && trunk[1] > trunk[2], `the trunk is brown ${trunk.map(Math.round)}`).toBe(true);
        const ratios = trunk.map((v, q) => v / picked[q]);
        expect(Math.max(...ratios) / Math.min(...ratios), `wood is not the picked color's shade: ${ratios.map((v) => v.toFixed(2))}`).toBeGreaterThan(1.5);
      } else {
        // The trunk is the picked color, only darker: its channels keep the picked color's proportions.
        const ratios = trunk.map((v, q) => v / picked[q]);
        expect(Math.max(...ratios) / Math.min(...ratios), `color ${ci}: trunk ${trunk.map(Math.round)} vs picked ${picked}: ratios ${ratios.map((v) => v.toFixed(2))}`).toBeLessThan(1.2);
        expect(Math.max(...ratios), `color ${ci}: the trunk is darker than the picked color`).toBeLessThan(0.9);
      }
    }
  });

  test("every color: the darkest faces still stand out from the backdrop (lean shading's floor, 1.50.1)", async ({ page }) => {
    // 1.50.0 sank the faces turned from the light to about 1.3:1 (WCAG luminance ratio) against the backdrop in Violet and
    // Rose; the lean floor went from 0.5 to 0.62. The faces are flat fills, so pixels whose four neighbors have the same
    // color are a face's interior; those clearly above the backdrop (not just its dither) are counted.
    for (const ci of COLORS) {
      await show(page, "tree", 9, ci);
      const worst = await page.evaluate(() => {
        const canvas = VECTOR_VIEWS.tree[1], w = canvas.width, h = canvas.height;
        const px = canvas.getContext("2d").getImageData(0, 0, w, h).data;
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lumAt = (i) => 0.2126 * lin(px[i]) + 0.7152 * lin(px[i + 1]) + 0.0722 * lin(px[i + 2]);
        const bg = 0.2126 * lin(BACKDROP_CENTER_RGB[0]) + 0.7152 * lin(BACKDROP_CENTER_RGB[1]) + 0.0722 * lin(BACKDROP_CENTER_RGB[2]);
        const same = (i, j) => px[i] === px[j] && px[i + 1] === px[j + 1] && px[i + 2] === px[j + 2];
        let worst = Infinity, n = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          if (!(same(i, i - 4) && same(i, i + 4) && same(i, i - 4 * w) && same(i, i + 4 * w))) continue;
          const ratio = (lumAt(i) + 0.05) / (bg + 0.05);
          if (ratio < 1.15) continue;   // the backdrop
          n++;
          if (ratio < worst) worst = ratio;
        }
        return { worst, n };
      });
      expect(worst.n, `color ${ci}: face pixels found`).toBeGreaterThan(1000);
      expect(worst.worst, `color ${ci}: the darkest face is ${worst.worst.toFixed(2)}:1 against the backdrop's center`).toBeGreaterThan(1.4);
    }
  });

  for (const ci of CHROMATIC) {
    test(`color ${ci}: the canopy stays the picked hue (the alternate levels are turned 12 degrees in OKLCH, no more)`, async ({ page }) => {
      for (const depth of [5, 9, 12]) {
        await show(page, "tree", depth, ci);
        const picked = hueOf(await pickedRgb(page, ci));
        // Above the first branches (world height 2.2 and up), which is canopy at every depth.
        const s = await hueSpread(page, "tree", picked, { worldYAbove: 2.2 });
        expect(s.n, `depth ${depth}: canopy pixels`).toBeGreaterThan(300);
        expect(s.p98, `depth ${depth}: the 98th percentile hue is ${s.p98.toFixed(0)} degrees from the picked ${picked.toFixed(0)}`).toBeLessThan(40);
      }
    });
  }

  test("a level is told from its parent: a square and its child differ in shade, whichever color", async ({ page }) => {
    for (const ci of COLORS) {
      await show(page, "tree", 5, ci);
      // pythagorasTree's squares come depth first, so [2] is a level-2 square and [3] its left child (level 3);
      // both are canopy, both on screen, and a square's center is on its own face.
      const [a, b] = await page.evaluate(() => {
        const sq = pythagorasTree(5), center = (s) => [(s[0][0] + s[2][0]) / 2, (s[0][1] + s[2][1]) / 2];
        return [center(sq[2]), center(sq[3])];
      });
      const ca = await colorAt(page, "tree", a[0], a[1]), cb = await colorAt(page, "tree", b[0], b[1]);
      expect(ca && cb, `color ${ci}: both squares on screen`).toBeTruthy();
      const dist = Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]);
      expect(dist, `color ${ci}: ${ca.map(Math.round)} vs ${cb.map(Math.round)}`).toBeGreaterThan(20);
    }
  });

  test("the lean shading's light stays at the upper left as the view rotates", async ({ page }) => {
    // The two level-1 squares (centers (-0.5, 1.5) and (0.5, 1.5)) are both wood and both on the same level,
    // so they differ only in lean: faces turned toward the screen's upper-left light (-0.55, 0.835) are brighter.
    const LIGHT = [-0.55, 0.835];
    for (const rot of [0, Math.PI, 0.9, -0.9, 2.2]) {
      await show(page, "tree", 4, 0, { rotation: rot });
      const left = await colorAt(page, "tree", -0.5, 1.5), right = await colorAt(page, "tree", 0.5, 1.5);
      expect(left && right, `rotation ${rot}: both squares on screen`).toBeTruthy();
      // A world direction at angle a, seen on a screen whose view is turned by rot, points at a - rot.
      const lit = (a) => Math.cos(a - rot) * LIGHT[0] + Math.sin(a - rot) * LIGHT[1];
      const expected = lit(3 * Math.PI / 4) - lit(Math.PI / 4);   // left child's face looks up-left, the right's up-right
      if (Math.abs(expected) < 0.3) continue;
      const seen = lum(left) - lum(right);
      expect(Math.sign(seen), `rotation ${rot}: left ${left.map(Math.round)}, right ${right.map(Math.round)} (expected ${expected.toFixed(2)})`).toBe(Math.sign(expected));
    }
  });

  test("on a phone the default view uses nearly the whole width, and nothing is cut off", async ({ page }) => {
    await show(page, "tree", 9, 0);
    const s = await hueSpread(page, "tree", 130);
    const [x0, x1, y0, y1] = s.bbox;
    expect(x1 - x0, `the tree spans ${(x0 * 100).toFixed(1)}%-${(x1 * 100).toFixed(1)}% of the width`).toBeGreaterThan(0.9);
    expect(x0).toBeGreaterThan(0.005);
    expect(x1).toBeLessThan(0.995);
    expect(y0).toBeGreaterThan(0.1);
    expect(y1).toBeLessThan(0.9);
  });
});

// The center of the gap in the middle chain's level-L hexagon: it shows level L's own fill (a hexagon of
// circumradius s = 3^-L has gaps of s/3 at s/3 along the x axis, 0.19245 s up). A view a few hundredths of
// s across, centered there, has only that fill under its center.
const gapOf = (level) => { const s = Math.pow(3, -level); return { cx: s / 3, cy: s * 0.19245, halfHeight: s * 0.004 }; };

test.describe("Hexaflake", () => {
  for (const ci of COLORS) {
    test(`color ${ci}: shades climb level by level to the picked color, then every other level dims`, async ({ page }) => {
      const fills = [];
      for (let level = 0; level <= 8; level++) {
        await show(page, "hexaflake", Math.min(level + 1, 6), ci, gapOf(level));
        const c = await colorAt(page, "hexaflake", gapOf(level).cx, gapOf(level).cy);
        expect(c, `level ${level} is on screen`).not.toBeNull();
        fills.push(c);
      }
      const L = fills.map(lum);
      const msg = fills.map((c) => c.map(Math.round).join("/")).join("  ");
      // The big outer triangles are most of the picture's area; they held 1.17:1 (WCAG luminance ratio) against the
      // backdrop in Violet before 1.50.1, now at least 1.35:1 in every color.
      const outer = await page.evaluate((c) => {
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const Y = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const a = Y(c), b = Y(BACKDROP_CENTER_RGB);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }, fills[0]);
      expect(outer, `level 0 ${fills[0]} against the backdrop`).toBeGreaterThan(1.35);
      for (let l = 1; l <= 4; l++) expect(L[l], `level ${l} is brighter than level ${l - 1}: ${msg}`).toBeGreaterThan(L[l - 1] * 1.1);
      for (let l = 5; l <= 8; l++) {
        if (l % 2 === 1) expect(L[l], `level ${l} is dimmer than level ${l - 1}: ${msg}`).toBeLessThan(L[l - 1] * 0.92);
        else expect(L[l], `level ${l} is brighter than level ${l - 1}: ${msg}`).toBeGreaterThan(L[l - 1] * 1.08);
      }
      // The picked color is the finest levels' own shade; the shadows of the outer levels are turned a little from it.
      const picked = await pickedRgb(page, ci);
      for (let q = 0; q < 3; q++) expect(Math.abs(fills[4][q] - picked[q]), `level 4 is the picked color: ${fills[4]} vs ${picked}`).toBeLessThanOrEqual(4);
      if (CHROMATIC.includes(ci)) {
        const ph = hueOf(picked);
        for (let l = 0; l <= 8; l++) expect(hueGap(hueOf(fills[l]), ph), `level ${l} hue ${hueOf(fills[l]).toFixed(0)} vs picked ${ph.toFixed(0)}`).toBeLessThanOrEqual(l >= 4 ? 4 : 30);   // the dark shadows' 8-bit colors blur the 7 OKLCH degrees a little (about 20 degrees of HSV hue on Green, where OKLCH hue is compressed)
      }
    });
  }

  for (const ci of CHROMATIC) {
    test(`color ${ci}: the hue never leaves the picked color's family, at depths 2, 4, 6 and zoomed in`, async ({ page }) => {
      const views = [[2, null], [4, null], [6, null], [4, { cx: 0.7778, cy: 0.1925, halfHeight: 0.05 }], [4, { cx: 0.7778, cy: 0.1925, halfHeight: 0.003 }]];
      for (const [depth, view] of views) {
        await show(page, "hexaflake", depth, ci, view);
        const picked = hueOf(await pickedRgb(page, ci));
        const s = await hueSpread(page, "hexaflake", picked);
        expect(s.n, `depth ${depth} ${JSON.stringify(view)}: pixels`).toBeGreaterThan(5000);
        // The shadows are turned 7 degrees at most; nothing wanders to olive, amber or salmon.
        expect(s.p98, `depth ${depth} ${JSON.stringify(view)}: 98th percentile hue gap ${s.p98.toFixed(1)}`).toBeLessThan(24);
      }
    });
  }

  test("the hexaflake starts in Gold, not the tree's Green (1.50.1: they were twins in the picker)", async ({ page }) => {
    const names = await page.evaluate(() => ({ hexaflake: SOLID_COLORS[vectorColors.hexaflake].name, tree: SOLID_COLORS[vectorColors.tree].name }));
    expect(names).toEqual({ hexaflake: "Gold", tree: "Green" });
  });

  test("every color renders lit pixels at depths 2, 4 and 6, and a deeper depth changes the picture", async ({ page }) => {
    for (const ci of COLORS) {
      const grabs = [];
      for (const depth of [2, 4, 6]) {
        await show(page, "hexaflake", depth, ci);
        grabs.push(await page.evaluate(() => {
          const c = VECTOR_VIEWS.hexaflake[1], px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          let lit = 0, sum = 0;
          for (let i = 0; i < px.length; i += 4) { const s = px[i] + px[i + 1] + px[i + 2]; if (s > 150) { lit++; sum += s; } }
          return { lit, mean: sum / Math.max(1, lit), data: Array.from(px.filter((_, i) => i % 4 === 1 && i % 29 < 4)) };
        }));
      }
      for (const g of grabs) expect(g.lit, `color ${ci}: lit pixels`).toBeGreaterThan(50000);
      // Each depth is a different picture. Past depth 4 the new levels are under 2 px on a phone (under 1 px
      // on a 1x screen), so 4 to 6 only adds texture, much less than 2 to 4 does.
      const dpr = await page.evaluate(() => window.devicePixelRatio);
      for (const [a, b, least] of [[0, 1, 0.02], [1, 2, dpr >= 2 ? 0.003 : 0]]) {
        let differ = 0;
        const n = Math.min(grabs[a].data.length, grabs[b].data.length);
        for (let i = 0; i < n; i++) if (Math.abs(grabs[a].data[i] - grabs[b].data[i]) > 12) differ++;
        expect(differ / n, `color ${ci}: depth ${[2, 4, 6][a]} vs ${[2, 4, 6][b]} differ in ${(differ / n * 100).toFixed(2)}% of sampled pixels`).toBeGreaterThanOrEqual(least);
        if (least > 0) expect(differ / n).toBeGreaterThan(least);
      }
    }
  });

  test("large hexagons carry a dark gutter along their edges; small ones don't, and a lite frame has fewer", async ({ page }) => {
    await show(page, "hexaflake", 2, 0);
    // The top edge of the first child (centered at (2/3, 0), circumradius 1/3) runs at y = 0.2887 between
    // x = 0.5 and 0.8333; with the gap of the root above it and the child's own fill below.
    // The darkest pixel within 3 px of the edge (the stroke may sit between two pixel rows).
    const edge = await page.evaluate(() => {
      const canvas = VECTOR_VIEWS.hexaflake[1], [sx, sy] = VECTOR_VIEWS.hexaflake[0].worldToScreen(2 / 3, 0.28868);
      const px = canvas.getContext("2d").getImageData(Math.round(sx) - 3, Math.round(sy) - 3, 7, 7).data;
      let best = null;
      for (let i = 0; i < px.length; i += 4) if (!best || px[i] + px[i + 1] + px[i + 2] < best[0] + best[1] + best[2]) best = [px[i], px[i + 1], px[i + 2]];
      return best;
    });
    const above = await colorAt(page, "hexaflake", 2 / 3, 0.28868 + 0.025);
    const below = await colorAt(page, "hexaflake", 2 / 3, 0.28868 - 0.025);
    expect(lum(edge), `edge ${edge} is darker than above ${above.map(Math.round)} and below ${below.map(Math.round)}`).toBeLessThan(Math.min(lum(above), lum(below)) * 0.75);
    // The gutter is near-black navy (a translucent stroke), never pure black.
    expect(Math.max(...edge)).toBeGreaterThan(8);
    // Stroke calls: a full default frame draws gutters, a frame where every hexagon is tiny doesn't.
    const counts = await page.evaluate(() => {
      const view = VECTOR_VIEWS.hexaflake[0], proto = CanvasRenderingContext2D.prototype, real = proto.stroke;
      const strokes = (opts, patch) => {
        const saved = { ...view.view };
        Object.assign(view.view, patch);
        let n = 0;
        proto.stroke = function (...a) { n++; return real.apply(this, a); };
        view.render({ depth: 6, colorIndex: 0, fitHalfHeight: vectorFitHalfHeight("hexaflake"), ...opts });
        proto.stroke = real;
        Object.assign(view.view, saved);
        return n;
      };
      return {
        full: strokes({}, { cx: 0, cy: 0, halfHeight: 1.1 }),
        lite: strokes({ lite: true }, { cx: 0, cy: 0, halfHeight: 1.1 }),
        tiny: strokes({}, { cx: 0, cy: 0, halfHeight: 300 }),   // the whole flake a few pixels across
      };
    });
    expect(counts.full, "a full frame strokes the big hexagons").toBeGreaterThan(0);
    expect(counts.lite, "a lite frame strokes no more than a full one").toBeLessThanOrEqual(counts.full);
    expect(counts.tiny, "hexagons under 7 px get no gutter").toBe(0);
  });
});
