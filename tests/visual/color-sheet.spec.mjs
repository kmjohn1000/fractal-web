// The Color sheet (behind the styles flag, see stylesEnabled in app.js): the
// existing color button opens it on the fractals the styles can color, with
// a Looks tab and a Custom tab. These checks cover the flag, the controls
// and their accessibility, that opening it never resizes the canvas, and
// baselines for both tabs. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global colorStyle, setColorStyle, COLORMAPS, colormapIndex:writable, updateLUT, applyShareLink, buildShareHash,
   parseShareHash, mainState, enterDual, exitDual, dualActive */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";

let pageErrors = [];

async function load(page, { flag }) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript((on) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      if (on) localStorage.setItem("fractalAtlas.styles", "1"); else localStorage.removeItem("fractalAtlas.styles");
    } catch { /* storage blocked */ }
  }, flag);
  await page.goto("index.html");
  await page.addScriptTag({ path: DRIVER });
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await settle(page);
}

async function settle(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 100 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const place = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;
const imagesLoaded = (page) => page.waitForFunction(() => [...document.querySelectorAll("#colorSheet img")].every((i) => i.complete && i.naturalWidth > 0));

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test.describe("with the flag off", () => {
  test("the color button opens the plain palette list", async ({ page }) => {
    await load(page, { flag: false });
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colormapMenu")).toHaveClass(/open/);
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
  });
});

test.describe("turning the flag on and off from the address", () => {
  test("#styles turns it on (and remembers it), #styles=0 turns it off", async ({ page }) => {
    await load(page, { flag: false });
    // (from a blank page: a hash change within the open page doesn't reload it, so the flag isn't read again)
    await page.goto("about:blank");
    await page.goto("index.html#styles");
    await page.addScriptTag({ path: DRIVER });
    await settle(page);
    expect(await page.evaluate(() => localStorage.getItem("fractalAtlas.styles"))).toBe("1");
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    // The flag was cleared by the init script on this load and set again by the hash; now switch it off.
    await page.goto("about:blank");
    await page.goto("index.html#styles=0");
    await page.addScriptTag({ path: DRIVER });
    await settle(page);
    expect(await page.evaluate(() => localStorage.getItem("fractalAtlas.styles"))).toBeNull();
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colormapMenu")).toHaveClass(/open/);
  });
});

test.describe("with the flag on", () => {
  test.beforeEach(async ({ page }) => { await load(page, { flag: true }); });

  test("the color button opens the sheet on Looks, with the current Look checked", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    await expect(page.locator("#colormapMenu")).not.toHaveClass(/open/);
    await expect(page.locator("#colorSheet")).toHaveAttribute("role", "dialog");
    await expect(page.locator('#colorSheet [role="tab"]')).toHaveText(["Looks", "Custom"]);
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Looks");
    await expect(page.locator('#colorSheet [role="radiogroup"][aria-label="Looks"] [role="radio"]')).toHaveCount(8);
    // The default (Smooth on Inferno) is the Inferno Look.
    await expect(page.locator('#colorSheet [role="radio"][aria-checked="true"]')).toHaveText("Inferno");
  });

  test("picking a Look sets its style and its palette, and the color button shows it", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [data-key="look-orbit-trap"]').click();
    const r = await page.evaluate(() => ({ style: colorStyle.style, palette: COLORMAPS[colormapIndex].name }));
    expect(r).toEqual({ style: "point", palette: "Twilight" });
    await expect(page.locator("#colormapBtn")).toHaveAttribute("aria-label", "Choose colormap (Twilight)");
    await expect(page.locator('#colorSheet [role="radio"][aria-checked="true"]')).toHaveText("Orbit trap");
    await page.locator('#colorSheet [data-key="look-edge-glow"]').click();
    expect(await page.evaluate(() => ({ style: colorStyle.style, palette: COLORMAPS[colormapIndex].name }))).toEqual({ style: "glow", palette: "Inferno" });
  });

  test("touching a control makes it Custom, and the sheet opens on Custom after that", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await page.locator('#colorSheet input[aria-label="Color shift"]').fill("0.3");
    expect(await page.evaluate(() => colorStyle.offset)).toBeCloseTo(0.3, 5);
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    await expect(page.locator('#colorSheet [role="radio"][aria-checked="true"]')).toHaveText("Custom");
    // Close and reopen: lands on Custom, because the settings match no Look.
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await page.locator("#colormapBtn").click();
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Custom");
  });

  test("Custom has the style, palette, bands and shift controls with names", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await expect(page.locator('#colorSheet [aria-label="Style"] [role="radio"]')).toHaveText(["Smooth", "Bands", "Glow", "Stripes", "Point", "Cross"]);
    await expect(page.locator('#colorSheet [aria-label="Palette"] [role="radio"]')).toHaveCount(await page.evaluate(() => COLORMAPS.length));
    await page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Stripes" }).click();
    expect(await page.evaluate(() => colorStyle.style)).toBe("stripes");
    await page.locator('#colorSheet [aria-label="Palette"] [role="radio"]', { hasText: "Glacier" }).click();
    expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Glacier");
    // Bands is a log slider: its middle is exactly 1x (today's coloring), and it snaps there.
    const bands = page.locator('#colorSheet input[aria-label="Color bands"]');
    await bands.fill("1");
    expect(await page.evaluate(() => colorStyle.density)).toBeCloseTo(2, 5);
    await expect(bands).toHaveAttribute("aria-valuetext", "2×");
    // (set directly: fill() rejects a value that isn't on the slider's step)
    await bands.evaluate((el) => { el.value = "0"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(await page.evaluate(() => colorStyle.density)).toBe(1);
    const shift = page.locator('#colorSheet input[aria-label="Color shift"]');
    await shift.fill("0.5");
    await expect(shift).toHaveAttribute("aria-valuetext", "50%");
  });

  test("at depth the orbit traps are greyed out, with the reason", async ({ page }) => {
    await page.evaluate(`${place("Seahorse Valley")}`);
    await settle(page);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const point = page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Point" });
    await expect(point).toBeDisabled();
    await expect(point).toHaveAttribute("aria-describedby", "colorSheetNote");
    await expect(page.locator("#colorSheetNote")).toContainText("need a shallower view. Zoom out past about 1,000× to use them.");
    await expect(page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Glow" })).toBeEnabled();
    // The Looks tab ghosts the trap Looks and ignores a tap on one.
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    const trap = page.locator('#colorSheet [data-key="look-orbit-trap"]');
    await expect(trap).toHaveAttribute("aria-disabled", "true");
    await trap.click({ force: true }); // aria-disabled, so Playwright won't click it unforced
    expect(await page.evaluate(() => colorStyle.style)).toBe("smooth");
  });

  test("Phoenix offers only Smooth and Bands", async ({ page }) => {
    await page.evaluate(() => window["__vt"].fractal("Phoenix"));
    await settle(page);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const states = await page.locator('#colorSheet [aria-label="Style"] [role="radio"]').evaluateAll((els) => els.map((e) => !e.disabled));
    expect(states).toEqual([true, true, false, false, false, false]);
    await expect(page.locator("#colorSheetNote")).toContainText("aren't available for Phoenix.");
  });

  test("Newton, Carpet, Gasket and Apollonian keep the plain palette list", async ({ page }) => {
    for (const f of ["Newton z³", "Carpet", "Gasket", "Apollonian"]) {
      await page.evaluate((n) => window["__vt"].fractal(n), f);
      await settle(page);
      await page.locator("#colormapBtn").click();
      await expect(page.locator("#colormapMenu"), f).toHaveClass(/open/);
      await expect(page.locator("#colorSheet"), f).not.toHaveClass(/open/);
      await page.locator("#colormapBtn").click();
    }
  });

  test("opening and closing never resizes the canvas, and Escape and an outside tap close it", async ({ page }) => {
    const rect = () => page.evaluate(() => { const r = document.getElementById("mainCanvas").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const before = await rect();
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    expect(await rect()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    await page.mouse.click(5, 5); // on the canvas, away from the sheet
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    expect(await rect()).toEqual(before);
    // The fractal picker closes it too.
    await page.locator("#colormapBtn").click();
    await page.locator(".fractalMenuBtn:visible").first().click();
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await expect(page.locator("#fractalTypeRow")).toHaveClass(/open/);
  });

  test("the sheet stays inside the screen at the largest text size", async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
    await page.locator("#colormapBtn").click();
    for (const tab of ["Looks", "Custom"]) {
      await page.locator('#colorSheet [role="tab"]', { hasText: tab }).click();
      const r = await page.evaluate(() => {
        const s = document.getElementById("colorSheet"), b = s.getBoundingClientRect();
        return { top: b.top, left: b.left, right: b.right, vw: window.innerWidth, noSideScroll: s.scrollWidth <= s.clientWidth + 1 };
      });
      expect(r.top, `${tab}: top edge on screen`).toBeGreaterThanOrEqual(0);
      expect(r.left, `${tab}: left edge`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${tab}: right edge`).toBeLessThanOrEqual(r.vw);
      expect(r.noSideScroll, `${tab}: no sideways scroll`).toBe(true);
    }
  });

  test("Looks tab", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await imagesLoaded(page);
    await expect(page.locator("#colorSheet")).toHaveScreenshot("color-sheet-looks.png");
  });

  test("Custom tab", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); setColorStyle({ style: "glow", density: 1.5, offset: 0.25 }); });
    await settle(page);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await expect(page.locator("#colorSheet")).toHaveScreenshot("color-sheet-custom.png");
  });
});

// Share links carry the style as st (style), cd (bands) and co (shift), only
// when they aren't today's coloring; a bad field falls back to its default
// and never rejects the link.
const BASE_LINK = "#v=1&m=fractal&f=Mandelbrot&x=-0.75&y=0&s=1.4&r=0&i=300&cm=Inferno";

test.describe("share links (flag on)", () => {
  test.beforeEach(async ({ page }) => { await load(page, { flag: true }); });

  test("a link without style fields opens in today's coloring, and its own hash has none", async ({ page }) => {
    const r = await page.evaluate((link) => {
      setColorStyle({ style: "glow", density: 2, offset: 0.5 }); // whatever was chosen before
      applyShareLink(`https://example.org/${link}`);
      return { style: { ...colorStyle }, hash: buildShareHash() };
    }, BASE_LINK);
    expect(r.style).toEqual({ style: "smooth", density: 1, offset: 0, trap: null });
    expect(r.hash).not.toMatch(/[&#](st|cd|co)=/);
  });

  test("every style, bands and shift round-trip, and rebuilding is stable", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const [style, density, offset] of [["bands", 1, 0], ["glow", 1, 0], ["stripes", 2.5, 0.25], ["point", 0.25, 0.999], ["cross", 8, 0.001], ["smooth", 3, 0.5], ["smooth", 1, 0.125]]) {
        window["__vt"].fractal("Mandelbrot");
        setColorStyle({ style, density, offset });
        const hash = buildShareHash();
        const parsed = parseShareHash(hash).color;
        setColorStyle({ style: "smooth", density: 1, offset: 0 });
        applyShareLink(`https://example.org/${hash}`);
        out.push({ parsed, applied: { style: colorStyle.style, density: colorStyle.density, offset: colorStyle.offset }, stable: buildShareHash() === hash });
      }
      return out;
    });
    const wanted = [["bands", 1, 0], ["glow", 1, 0], ["stripes", 2.5, 0.25], ["point", 0.25, 0.999], ["cross", 8, 0.001], ["smooth", 3, 0.5], ["smooth", 1, 0.125]];
    r.forEach((x, i) => {
      const [style, density, offset] = wanted[i];
      expect(x.parsed, `link ${i}`).toEqual({ style, density, offset });
      expect(x.applied, `applied ${i}`).toEqual({ style, density, offset });
      expect(x.stable, `stable ${i}`).toBe(true);
    });
  });

  test("garbage in the style fields falls back to the defaults and the link still opens", async ({ page }) => {
    const r = await page.evaluate((base) => {
      const out = {};
      for (const extra of ["st=zz", "st=constructor", "st=__proto__", "st=", "cd=NaN", "cd=1e9", "cd=0.1", "cd=-2", "cd=", "co=-3", "co=1", "co=abc", "st=de&cd=999&co=0.5"]) {
        const parsed = parseShareHash(`${base}&${extra}`);
        out[extra] = parsed ? parsed.color : "REJECTED";
      }
      return out;
    }, BASE_LINK);
    const d = { style: "smooth", density: 1, offset: 0 };
    expect(r).toEqual({
      "st=zz": d, "st=constructor": d, "st=__proto__": d, "st=": d, "cd=NaN": d, "cd=1e9": d, "cd=0.1": d, "cd=-2": d, "cd=": d,
      "co=-3": d, "co=1": d, "co=abc": d,
      // A good field survives its bad neighbour.
      "st=de&cd=999&co=0.5": { style: "glow", density: 1, offset: 0.5 },
    });
  });
});

test.describe("the style is global (flag on)", () => {
  test.beforeEach(async ({ page }) => { await load(page, { flag: true }); });

  test("survives a trip to another fractal and the dual view, and leaves auto detail alone", async ({ page }) => {
    const r = await page.evaluate(() => {
      window["__vt"].fractal("Mandelbrot");
      const locked = mainState.iterAutoLocked, iter = mainState.maxIter;
      setColorStyle({ style: "stripes", density: 2, offset: 0.25 });
      const same = mainState.iterAutoLocked === locked && mainState.maxIter === iter;
      const keep = () => ({ ...colorStyle });
      window["__vt"].fractal("Newton z³"); const onNewton = keep();
      window["__vt"].fractal("Burn. Ship"); const onShip = keep();
      enterDual(); const inDual = keep(); exitDual(); const outDual = keep();
      return { same, onNewton, onShip, inDual, outDual };
    });
    const want = { style: "stripes", density: 2, offset: 0.25, trap: null };
    expect(r.same).toBe(true);
    for (const k of ["onNewton", "onShip", "inDual", "outDual"]) expect(r[k], k).toEqual(want);
  });

  test("a dual view's link keeps the style and opens in dual", async ({ page }) => {
    const r = await page.evaluate(() => {
      window["__vt"].fractal("Mandelbrot");
      enterDual();
      setColorStyle({ style: "glow", density: 1.5 });
      const hash = buildShareHash();
      setColorStyle({ style: "smooth", density: 1, offset: 0 });
      applyShareLink(`https://example.org/${hash}`);
      return { hash, style: colorStyle.style, density: colorStyle.density, dual: dualActive };
    });
    expect(r.hash).toMatch(/[&#]st=de&cd=1\.5(&|$)/);
    expect(r).toMatchObject({ style: "glow", density: 1.5, dual: true });
  });
});

test.describe("share links (flag off)", () => {
  test.beforeEach(async ({ page }) => { await load(page, { flag: false }); });

  test("ignore the style fields and never write them", async ({ page }) => {
    const r = await page.evaluate((link) => {
      applyShareLink(`https://example.org/${link}&st=de&cd=2&co=0.5`);
      const applied = { ...colorStyle };
      setColorStyle({ style: "glow", density: 2, offset: 0.5 });
      return { applied, hash: buildShareHash() };
    }, BASE_LINK);
    expect(r.applied).toEqual({ style: "smooth", density: 1, offset: 0, trap: null });
    expect(r.hash).not.toMatch(/[&#](st|cd|co)=/);
  });
});

test.describe("the info card", () => {
  const card = async (page) => {
    await page.locator("#hudBtn").click();
    await settle(page);
    return { plain: await page.locator("#hud .hudPlain").innerText(), tech: await page.locator("#hud .hudStats").innerText() };
  };

  test("names a Look and lists the style, bands and shift (flag on)", async ({ page }) => {
    await load(page, { flag: true });
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); });
    const plain0 = await card(page);
    expect(plain0.plain).not.toMatch(/Custom|Edge glow/);
    expect(plain0.tech).not.toMatch(/style:|bands:|shift:/);
    await page.evaluate(() => { colormapIndex = COLORMAPS.findIndex((c) => c.name === "Inferno"); updateLUT(); setColorStyle({ style: "glow" }); });
    await settle(page);
    expect((await page.locator("#hud .hudPlain").innerText())).toContain("Edge glow");
    expect((await page.locator("#hud .hudStats").innerText())).toContain("style: glow");
    await page.evaluate(() => { colormapIndex = COLORMAPS.findIndex((c) => c.name === "Plasma"); updateLUT(); setColorStyle({ style: "stripes", density: 2, offset: 0.25 }); });
    await settle(page);
    expect((await page.locator("#hud .hudPlain").innerText())).toContain("Custom: stripes, Plasma");
    const tech = await page.locator("#hud .hudStats").innerText();
    expect(tech).toContain("style: stripes");
    expect(tech).toContain("bands: 2×");
    expect(tech).toContain("shift: 25%");
  });

  test("is unchanged while the flag is off", async ({ page }) => {
    await load(page, { flag: false });
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); setColorStyle({ style: "glow", density: 2, offset: 0.25 }); });
    const c = await card(page);
    expect(c.plain).not.toMatch(/Custom|glow/i);
    expect(c.tech).not.toMatch(/style:|bands:|shift:/);
  });
});
