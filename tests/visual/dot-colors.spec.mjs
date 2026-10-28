// The chaos-game modes (fern, Sierpinski triangle, Lévy C, Vicsek; fern.js) are colored by
// address: each transform turns the hue of the picked color, so every self-similar piece takes
// its own tint, and a pixel is the mean of its hits' colors at log-density brightness. Each mode
// has its own color (vectorColors), starting Green, Violet, Rose and Gold. These checks hold
// that to its promises: the picture really is multi-hued and still the picked color's family,
// the colors are per mode and follow the mode in the toolbar pill, deep zoom stays colored, and
// share links carry the mode's own color. Baselines of the four modes are in app.spec.mjs.
import { test, expect } from "@playwright/test";

/* global setMode, fernView, fernState, vectorColors, SOLID_COLORS, buildShareHash, applyShareLink, els, mode,
   requestRender, VECTOR_VIEWS, ifsTransformColors */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const IFS_MODES = ["fern", "sierpinski", "levy", "vicsek"];
const DEFAULT_COLORS = { fern: "Green", sierpinski: "Violet", levy: "Rose", vicsek: "Gold" };

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

// Shows a mode and waits until its points are all plotted.
async function show(page, m) {
  await page.evaluate((m) => setMode(m), m);
  await page.waitForFunction((m) => fernView.system === m && !fernView.refining && fernView.accepted > 0, m, { timeout: 90_000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// How the lit pixels of the frame are colored: the share of them in each 20 degree hue bin, the
// mean hue of the whole picture (circular mean) and how many pixels are lit.
function hueStats(page) {
  return page.evaluate(() => {
    const canvas = VECTOR_VIEWS[fernView.system][1];
    const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const bins = new Array(18).fill(0);
    let lit = 0, sx = 0, sy = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 70 || max === min) continue; // dim haze has no reliable hue
      let h;
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h = (h * 60 + 360) % 360;
      bins[Math.floor(h / 20) % 18]++;
      sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180);
      lit++;
    }
    return { bins: bins.map((n) => n / Math.max(1, lit)), lit, meanHue: (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360 };
  });
}

const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

test.describe("colored by address", () => {
  for (const m of IFS_MODES) {
    test(`${m}: the picture spans several hues, around its picked color`, async ({ page }) => {
      await show(page, m);
      const stats = await hueStats(page);
      expect(stats.lit, "the picture has bright pixels").toBeGreaterThan(500);
      const wide = stats.bins.filter((share) => share >= 0.03).length;
      expect(wide, `hue bins holding 3% of the lit pixels: ${stats.bins.map((s) => s.toFixed(2))}`).toBeGreaterThanOrEqual(3);
      // The picked color's own hue sits inside what is drawn.
      const picked = await page.evaluate(([m]) => {
        const [r, g, b] = SOLID_COLORS[vectorColors[m]].rgb;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h;
        if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
        return (h * 60 + 360) % 360;
      }, [m]);
      expect(stats.bins[Math.floor(picked / 20) % 18] + stats.bins[(Math.floor(picked / 20) + 1) % 18] + stats.bins[(Math.floor(picked / 20) + 17) % 18],
        "pixels near the picked color").toBeGreaterThan(0.05);
    });
  }

  // 1.50.1: White has no hue to turn, so its transforms differ in brightness instead (fern.js IFS_GREY_DIM_MIN);
  // the six chromatic colors still turn their hue and keep their brightness.
  test("White: each transform has its own brightness so the address cue survives; the other colors are unchanged", async ({ page }) => {
    const r = await page.evaluate((modes) => {
      const Y = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const white = SOLID_COLORS.findIndex((c) => c.name === "White");
      const out = { white: {}, chromatic: [] };
      for (const m of modes) {
        const cols = ifsTransformColors(m, white), ys = cols.map(Y);
        out.white[m] = { ratio: Math.min(...ys) / Math.max(...ys), chroma: Math.max(...cols.map((c) => Math.max(...c) - Math.min(...c))) };
      }
      for (let ci = 0; ci < SOLID_COLORS.length; ci++) {
        if (ci === white) continue;
        for (const m of modes) {
          const ys = ifsTransformColors(m, ci).map(Y), base = Y(SOLID_COLORS[ci].rgb);
          // Hue turns keep lightness: every transform's color is within 6% of the picked color's luminance.
          out.chromatic.push({ ci, m, spread: Math.max(...ys.map((y) => Math.abs(y - base) / base)) });
        }
      }
      return out;
    }, IFS_MODES);
    for (const m of IFS_MODES) {
      expect(r.white[m].ratio, `${m}: dimmest transform vs brightest ${r.white[m].ratio.toFixed(2)}`).toBeLessThan(0.76);
      expect(r.white[m].ratio, `${m}: not too dim`).toBeGreaterThan(0.6);
      expect(r.white[m].chroma, `${m}: still white, no tint`).toBeLessThan(12);
    }
    for (const c of r.chromatic) expect(c.spread, `color ${c.ci} ${c.m}`).toBeLessThan(0.3);
  });

  test("White dots show brightness differences across the picture", async ({ page }) => {
    for (const m of IFS_MODES) {
      await page.evaluate((m) => { vectorColors[m] = SOLID_COLORS.findIndex((c) => c.name === "White"); }, m);
      await show(page, m);
      const spread = await page.evaluate(() => {
        const canvas = VECTOR_VIEWS[fernView.system][1];
        const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        const ys = [];
        for (let i = 0; i < px.length; i += 4) { const s = px[i] + px[i + 1] + px[i + 2]; if (s > 330) ys.push(s); }
        ys.sort((a, b) => a - b);
        return { n: ys.length, p10: ys[Math.floor(ys.length * 0.1)], p90: ys[Math.floor(ys.length * 0.9)] };
      });
      expect(spread.n, `${m}: bright pixels`).toBeGreaterThan(300);
      expect(spread.p90 / spread.p10, `${m}: p10 ${spread.p10}, p90 ${spread.p90}`).toBeGreaterThan(1.12);
    }
  });

  test("picking another color moves the whole picture to it", async ({ page }) => {
    await show(page, "sierpinski");
    const violet = await hueStats(page);
    await page.evaluate(() => { vectorColors.sierpinski = SOLID_COLORS.findIndex((c) => c.name === "Gold"); requestRender(); });
    await page.waitForFunction(() => !fernView.refining && fernView.accepted > 0);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const gold = await hueStats(page);
    expect(hueGap(violet.meanHue, gold.meanHue), `mean hue ${violet.meanHue.toFixed(0)} -> ${gold.meanHue.toFixed(0)}`).toBeGreaterThan(60);
    expect(gold.lit).toBeGreaterThan(500);
  });

  test("a deep zoom stays colored, not gray or black", async ({ page }) => {
    await show(page, "sierpinski");
    // The top vertex (0, 1) is the fixed point of the first map: 2^20 times closer is the same picture.
    await page.evaluate(() => { Object.assign(VECTOR_VIEWS.sierpinski[0].view, { cx: 0, cy: 1, halfHeight: 0.4 / 2 ** 20, rotation: 0 }); requestRender(); });
    await page.waitForFunction(() => !fernView.refining && fernView.accepted > 0, null, { timeout: 90_000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const stats = await hueStats(page);
    expect(stats.lit, "the corner is drawn").toBeGreaterThan(500);
    expect(stats.bins.filter((share) => share >= 0.03).length, "still more than one hue").toBeGreaterThanOrEqual(2);
  });
});

test.describe("a color per mode", () => {
  test("each mode starts in its own color, and a pick changes only that mode", async ({ page }) => {
    const starts = await page.evaluate((modes) => modes.map((m) => SOLID_COLORS[vectorColors[m]].name), IFS_MODES);
    expect(starts).toEqual(IFS_MODES.map((m) => DEFAULT_COLORS[m]));
    await show(page, "levy");
    await page.locator("#fernColorBtn").click();
    await page.locator('#colormapMenu [role="menuitemradio"]', { hasText: "Ice" }).click();
    const after = await page.evaluate((modes) => modes.map((m) => SOLID_COLORS[vectorColors[m]].name), IFS_MODES);
    expect(after).toEqual(["Green", "Violet", "Ice", "Gold"]);
  });

  test("the color button's pill and name follow the mode", async ({ page }) => {
    const pill = () => page.evaluate(() => ({
      bg: els.fernColorSwatch.style.background, label: els.fernColorBtn.getAttribute("aria-label"),
    }));
    for (const m of IFS_MODES) {
      await show(page, m);
      const p = await pill();
      expect(p.label, m).toBe(`Choose color (${DEFAULT_COLORS[m]})`);
      const expected = await page.evaluate((m) => `rgb(${SOLID_COLORS[vectorColors[m]].rgb.join(", ")})`, m);
      expect(p.bg, m).toBe(expected);
    }
  });
});

test.describe("share links", () => {
  test("a link carries the mode's own color and opens in it", async ({ page }) => {
    await show(page, "vicsek");
    const hash = await page.evaluate(() => { vectorColors.vicsek = SOLID_COLORS.findIndex((c) => c.name === "Ice"); return buildShareHash(); });
    expect(hash).toMatch(/[?&#]c=3(&|$)/);
    // From another mode, open it.
    await show(page, "fern");
    await page.evaluate((h) => { vectorColors.vicsek = 0; applyShareLink(`https://example.org/${h}`); }, hash);
    const seen = await page.evaluate(() => ({ mode, vicsek: SOLID_COLORS[vectorColors.vicsek].name, fern: SOLID_COLORS[vectorColors.fern].name, count: fernState.count }));
    expect(seen).toMatchObject({ mode: "vicsek", vicsek: "Ice", fern: "Green" });
  });

  test("a link made before 1.47.0 (one color index, any dot mode) still opens", async ({ page }) => {
    await page.evaluate(() => applyShareLink("https://example.org/#v=1&m=sierpinski&x=0&y=0&s=1&r=0&n=1000000&c=0"));
    await page.waitForFunction(() => fernView.system === "sierpinski" && !fernView.refining && fernView.accepted > 0);
    expect(await page.evaluate(() => SOLID_COLORS[vectorColors.sierpinski].name)).toBe("Green");
  });
});
