// The Color sheet: the color button opens it on every fractal (the palette grid
// alone where the fractal colors by its own scheme, the Looks and Custom tabs
// where the styles apply). These checks cover the controls and their
// accessibility, that opening it never resizes the canvas, and baselines for
// both tabs. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";

/* global colorStyle, setColorStyle, COLORMAPS, colormapIndex:writable, updateLUT, applyShareLink, buildShareHash,
   parseShareHash, mainState, enterDual, exitDual, dualActive, lookSpriteImage, styleBlocked, COLOR_STYLES, colorStyleFor, prepareColorSheet */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
// The Look that is checked (both tabs are in the page at once, so queries have to say which group).
const LOOK_CHECKED = '#colorSheet [aria-label="Looks"] [role="radio"][aria-checked="true"]';
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";

let pageErrors = [];

async function load(page) {
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
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await settle(page);
}

async function settle(page) {
  await page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 90_000, polling: 100 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// A few frames after a viewport or tab change, so the size-dependent layout (the media queries, the
// style segments' columns) has settled before it's measured; a full suite run is slow enough to need it.
const settleLayout = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150)))));
const place = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;
// The swatches are one sprite (icons/looks/sprite.webp), fetched when the app is idle.
const spriteLoaded = (page) => page.waitForFunction(() => lookSpriteImage && lookSpriteImage.complete && lookSpriteImage.naturalWidth > 0);

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test.describe("a link that carries style settings", () => {
  test("restores them on load, with the palette, in the app's first view", async ({ page }) => {
    await load(page);
    // (from a blank page: a hash change within the open page isn't a load)
    await page.goto("about:blank");
    await page.goto("index.html#v=1&m=fractal&f=Mandelbrot&x=-0.75&y=0&s=2.7&r=0&i=300&cm=Hot&st=sp&cd=2&co=0.3");
    await page.addScriptTag({ path: DRIVER });
    await settle(page);
    expect(await page.evaluate(() => ({ style: colorStyle.style, density: colorStyle.density, offset: colorStyle.offset, palette: COLORMAPS[colormapIndex].name })))
      .toEqual({ style: "stripes", density: 2, offset: 0.3, palette: "Hot" });
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
  });
});

test.describe("the Color sheet", () => {
  test.beforeEach(async ({ page }) => { await load(page); });

  test("the color button opens the sheet on Looks, with the current Look checked", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    await expect(page.locator("#colormapMenu")).not.toHaveClass(/open/);
    await expect(page.locator("#colorSheet")).toHaveAttribute("role", "dialog");
    await expect(page.locator('#colorSheet [role="tab"]')).toHaveText(["Looks", "Custom"]);
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Looks");
    await expect(page.locator('#colorSheet [role="radiogroup"][aria-label="Looks"] [role="radio"]')).toHaveText(
      ["Default", "Edge glow", "Stripes", "Bands", "Orbs", "Rays", "Relief"]);
    // The default (Smooth on Inferno) is the Default Look. (Classic and Inferno are palettes, not Looks.)
    await expect(page.locator(LOOK_CHECKED)).toHaveText("Default");
    await expect(page.locator("#colormapBtn")).toHaveAttribute("aria-label", "Choose colors (Default, Inferno)");
  });

  test("picking a Look sets its style and its palette, and the color button shows it", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [data-key="look-orbs"]').click();
    const r = await page.evaluate(() => ({ style: colorStyle.style, palette: COLORMAPS[colormapIndex].name }));
    expect(r).toEqual({ style: "point", palette: "Twilight" });
    await expect(page.locator("#colormapBtn")).toHaveAttribute("aria-label", "Choose colors (Orbs, Twilight)");
    await expect(page.locator(LOOK_CHECKED)).toHaveText("Orbs");
    await page.locator('#colorSheet [data-key="look-edge-glow"]').click();
    expect(await page.evaluate(() => ({ style: colorStyle.style, palette: COLORMAPS[colormapIndex].name }))).toEqual({ style: "glow", palette: "Inferno" });
  });

  test("touching a control makes it Custom, and the sheet opens on Custom after that", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    // At the Default, Reset is there (the sheet never changes height) but hidden.
    const reset = page.locator("#colorSheet .reset");
    await expect(reset).toBeHidden();
    await page.locator('#colorSheet input[aria-label="Color shift"]').fill("0.3");
    expect(await page.evaluate(() => colorStyle.offset)).toBeCloseTo(0.3, 5);
    // The value is on screen next to the slider, and Reset appears without rebuilding the sheet.
    await expect(page.locator('#colorSheet label.field', { hasText: "Shift" }).locator("output")).toHaveText("30%");
    await expect(reset).toBeVisible();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    // No Look matches now, so none is checked, and there is no second Custom entry in the grid.
    await expect(page.locator(LOOK_CHECKED)).toHaveCount(0);
    await expect(page.locator('#colorSheet [data-key="look-custom"]')).toHaveCount(0);
    await expect(page.locator("#colormapBtn")).toHaveAttribute("aria-label", "Choose colors (Custom, Inferno)");
    // Close and reopen: lands on Custom, because the settings match no Look.
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await page.locator("#colormapBtn").click();
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Custom");
    // Reset puts everything back (style, palette, repeat and shift) and the Default Look is checked again.
    await page.evaluate(() => { setColorStyle({ style: "stripes", density: 2, offset: 0.5 }); colormapIndex = COLORMAPS.findIndex((c) => c.name === "Plasma"); updateLUT(); });
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await page.locator("#colorSheet .reset").click();
    expect(await page.evaluate(() => ({ ...colorStyle, palette: COLORMAPS[colormapIndex].name }))).toMatchObject({ style: "smooth", density: 1, offset: 0, palette: "Inferno" });
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    await expect(page.locator(LOOK_CHECKED)).toHaveText("Default");
  });

  // The idle preparation (prepareColorSheet) runs a few seconds after load. It
  // used to reset an open sheet to its opening tab, which sent someone who had
  // just tapped Custom back to Looks (and made this suite flaky under load).
  test("the idle preparation never takes an open sheet's tab away", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Custom");
    await page.evaluate(() => prepareColorSheet());
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Custom");
    await expect(page.locator('#colorSheet input[aria-label="Color repeat"]')).toBeVisible();
  });

  test("Custom has the style, palette, repeat and shift controls with names", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    // The same words as the Look tiles (Edge glow, Stripes, Bands, Orbs, Rays, Relief).
    await expect(page.locator('#colorSheet [aria-label="Style"] [role="radio"]')).toHaveText(["Smooth", "Bands", "Edge glow", "Stripes", "Orbs", "Rays", "Relief"]);
    await expect(page.locator('#colorSheet [aria-label="Palette"] [role="radio"]')).toHaveCount(await page.evaluate(() => COLORMAPS.length));
    await page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Stripes" }).click();
    expect(await page.evaluate(() => colorStyle.style)).toBe("stripes");
    // Any palette can be picked with any style (here Stripes); the swatches are named by aria-label.
    await page.locator('#colorSheet [aria-label="Palette"] [role="radio"][aria-label="Glacier"]').click();
    expect(await page.evaluate(() => COLORMAPS[colormapIndex].name)).toBe("Glacier");
    expect(await page.evaluate(() => colorStyle.style)).toBe("stripes");
    // Repeat is a log slider: its middle is exactly 1x (today's coloring), and it snaps there. (It was
    // "Bands", which is also a style's name; its value is on screen next to it.)
    const repeat = page.locator('#colorSheet input[aria-label="Color repeat"]');
    await expect(page.locator('#colorSheet input[aria-label="Color bands"]')).toHaveCount(0);
    await repeat.fill("1");
    expect(await page.evaluate(() => colorStyle.density)).toBeCloseTo(2, 5);
    await expect(repeat).toHaveAttribute("aria-valuetext", "2×");
    await expect(page.locator('#colorSheet label.field', { hasText: "Repeat" }).locator("output")).toHaveText("2×");
    // (set directly: fill() rejects a value that isn't on the slider's step)
    await repeat.evaluate((el) => { el.value = "0"; el.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(await page.evaluate(() => colorStyle.density)).toBe(1);
    const shift = page.locator('#colorSheet input[aria-label="Color shift"]');
    await shift.fill("0.5");
    await expect(shift).toHaveAttribute("aria-valuetext", "50%");
  });

  // The traps used to be greyed out past ~1,000x deep; the per-view range
  // (trapRange in createFractalRenderer) lets them draw at any depth, so the
  // sheet offers them everywhere and shows no depth note.
  test("the orbit traps stay offered at depth, with no depth note", async ({ page }) => {
    const offered = () => page.evaluate(() => ["point", "cross"].map((id) => styleBlocked(COLOR_STYLES.find((s) => s.id === id), mainState)));
    expect(await offered()).toEqual([null, null]);
    await page.evaluate(`${place("Seahorse Valley")}`);
    await settle(page);
    expect(await offered()).toEqual([null, null]);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const point = page.locator('#colorSheet [aria-label="Style"] [role="radio"]', { hasText: "Orbs" });
    await expect(point).toBeEnabled();
    await expect(page.locator("#colorSheetNote-custom")).toHaveCount(0);
    // Picking one at depth takes effect.
    await point.click();
    expect(await page.evaluate(() => colorStyle.style)).toBe("point");
    expect(await page.evaluate(() => colorStyleFor(mainState).glsl)).toBe(4);
    // The Looks tab offers the trap Looks too.
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    await expect(page.locator('#colorSheet [data-key="look-orbs"]')).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.locator('#colorSheet [data-key="look-rays"]')).not.toHaveAttribute("aria-disabled", "true");
  });

  test("Phoenix offers only Smooth and Bands, names what it can't do in the tiles' words, and shows what it draws", async ({ page }) => {
    // Cross chosen on Mandelbrot, then Phoenix, which can't draw it: the choice is kept, Smooth is what shows as selected.
    await page.evaluate(() => setColorStyle({ style: "cross" }));
    await page.evaluate(() => window["__vt"].fractal("Phoenix"));
    await page.evaluate(() => { colormapIndex = COLORMAPS.findIndex((c) => c.name === "Inferno"); updateLUT(); });
    await settle(page);
    expect(await page.evaluate(() => colorStyle.style), "the choice is kept for Mandelbrot").toBe("cross");
    await page.locator("#colormapBtn").click();
    // It is exactly the Default Look, so the Looks tab says so (and opens there).
    await expect(page.locator('#colorSheet [role="tab"][aria-selected="true"]')).toHaveText("Looks");
    await expect(page.locator(LOOK_CHECKED)).toHaveText("Default");
    await expect(page.locator("#colorSheetNote-looks")).toContainText("Edge glow, Stripes, Orbs, Rays and Relief aren't available for Phoenix.");
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const states = await page.locator('#colorSheet [aria-label="Style"] [role="radio"]').evaluateAll((els) => els.map((e) => !e.disabled));
    expect(states).toEqual([true, true, false, false, false, false, false]);
    const checked = await page.locator('#colorSheet [aria-label="Style"] [role="radio"][aria-checked="true"]').allInnerTexts();
    expect(checked, "only what is drawn is selected, not the greyed Rays").toEqual(["Smooth"]);
    await expect(page.locator("#colorSheetNote-custom")).toContainText("Edge glow, Stripes, Orbs, Rays and Relief aren't available for Phoenix.");
  });

  test("Newton, Carpet, Gasket and Apollonian open the same sheet with just the palette grid", async ({ page }) => {
    for (const f of ["Newton z³", "Carpet", "Gasket", "Apollonian"]) {
      await page.evaluate((n) => window["__vt"].fractal(n), f);
      await settle(page);
      await page.locator("#colormapBtn").click();
      await expect(page.locator("#colorSheet"), f).toHaveClass(/open/);
      await expect(page.locator("#colormapMenu"), f).not.toHaveClass(/open/);
      await expect(page.locator('#colorSheet [role="tab"]'), `${f}: no tabs`).toHaveCount(0);
      await expect(page.locator('#colorSheet [aria-label="Style"], #colorSheet [aria-label="Looks"], #colorSheet input'), `${f}: no styles, Looks or sliders`).toHaveCount(0);
      await expect(page.locator('#colorSheet [aria-label="Palette"] [role="radio"]'), f).toHaveCount(await page.evaluate(() => COLORMAPS.length));
      await expect(page.locator("#colormapBtn"), f).toHaveAttribute("aria-label", /^Choose colormap \(/);
      // Picking a palette works there too, and Done closes it.
      await page.locator('#colorSheet [aria-label="Palette"] [aria-label="Glacier"]').click();
      expect(await page.evaluate(() => COLORMAPS[colormapIndex].name), f).toBe("Glacier");
      await page.locator("#colorSheet .done").click();
      await expect(page.locator("#colorSheet"), f).not.toHaveClass(/open/);
    }
    // Back on a fractal the styles apply to, the full sheet returns.
    await page.evaluate(() => window["__vt"].fractal("Mandelbrot"));
    await settle(page);
    await page.locator("#colormapBtn").click();
    await expect(page.locator('#colorSheet [role="tab"]')).toHaveText(["Looks", "Custom"]);
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

  // The sheet is short enough that the fractal stays in view, and both tabs
  // are the same height with the tab bar in the same place, so nothing moves
  // when you switch: measured on a 393x852 phone screen, with and without a
  // depth.
  test("the sheet is at most 45% of a 393x852 screen, both tabs the same height with the tab bar in place", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await settle(page);
    for (const deep of [false, true]) {
      if (deep) { await page.evaluate(`${place("Seahorse Valley")}`); await settle(page); }
      await page.locator("#colormapBtn").click();
      const seen = {};
      for (const tab of ["Looks", "Custom"]) {
        await page.locator('#colorSheet [role="tab"]', { hasText: tab }).click();
        const r = await page.evaluate(() => {
          const s = document.getElementById("colorSheet").getBoundingClientRect();
          const c = document.getElementById("mainCanvas").getBoundingClientRect();
          const t = document.querySelector('#colorSheet [role="tab"][aria-selected="true"]').getBoundingClientRect();
          return { sheetH: s.height, sheetPct: (100 * s.height) / window.innerHeight, tabY: t.top, visiblePct: (100 * (Math.min(s.top, c.bottom) - c.top)) / c.height };
        });
        seen[tab] = r;
        expect(r.sheetPct, `${tab}${deep ? " (deep)" : ""}: sheet height as % of the screen`).toBeLessThanOrEqual(45);
        // (WebKit's phone emulation keeps its own 659 pt-tall screen whatever setViewportSize says, where the
        // sheet's cap of 45% of the screen applies; on a real 852 pt screen the sheet is about 38%.)
        expect(r.visiblePct, `${tab}${deep ? " (deep)" : ""}: % of the fractal still visible`).toBeGreaterThanOrEqual(40);
      }
      expect(seen.Looks.sheetH, "Looks and Custom are the same height").toBeCloseTo(seen.Custom.sheetH, 0);
      expect(seen.Looks.tabY, "the tab bar doesn't move between the tabs").toBeCloseTo(seen.Custom.tabY, 0);
      await page.keyboard.press("Escape");
    }
  });

  test("Done, the color button, Escape and a plain tap on the fractal close it; a drag or a pinch leaves it open", async ({ page }) => {
    const open = () => page.locator("#colormapBtn").click();
    const closed = () => expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    const stillOpen = () => expect(page.locator("#colorSheet")).toHaveClass(/open/);
    await open();
    const done = page.locator("#colorSheet .done");
    expect((await done.boundingBox()).height, "Done is a 44 pt target").toBeGreaterThanOrEqual(44);
    await expect(done, "Done's accessible name contains its visible text").toHaveAccessibleName("Done");
    await done.click();
    await closed();
    await open();
    await page.locator("#colormapBtn").click();
    await closed();
    await open();
    await page.keyboard.press("Escape");
    await closed();
    // A drag on the canvas pans and leaves the sheet open, so you can move to another spot and watch a style change.
    await open();
    const before = await page.evaluate(() => mainState.cx);
    const box = await page.locator("#mainCanvas").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + 40, { steps: 5 });
    await page.mouse.up();
    await stillOpen();
    expect(await page.evaluate(() => mainState.cx), "the drag panned").not.toBe(before);
    // So does a pinch (two synthetic touches, as the vector spec does: setPointerCapture refuses ones the browser doesn't know).
    const scaleBefore = await page.evaluate(() => mainState.scale);
    await page.evaluate(async () => {
      Element.prototype.setPointerCapture = () => {};
      const c = document.getElementById("mainCanvas"), r = c.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + 40;
      const fire = (type, id, x) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: cy, bubbles: true, pointerType: "touch" }));
      fire("pointerdown", 21, cx - 30); fire("pointerdown", 22, cx + 30);
      for (let i = 1; i <= 6; i++) { fire("pointermove", 21, cx - 30 - i * 8); fire("pointermove", 22, cx + 30 + i * 8); await new Promise((res) => requestAnimationFrame(res)); }
      fire("pointerup", 21, cx - 80); fire("pointerup", 22, cx + 80);
    });
    await stillOpen();
    expect(await page.evaluate(() => mainState.scale), "the pinch zoomed").not.toBe(scaleBefore);
    // A plain tap closes it.
    await page.mouse.click(box.x + box.width / 2, box.y + 60);
    await closed();
  });

  // The tap that closes the sheet is consumed: in dual view a tap on the main pane normally glides the
  // view to the tapped point, and closing the sheet doesn't also move the view.
  test("in dual view, the tap that closes the sheet doesn't also glide the view; the next tap does", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); enterDual(); });
    await settle(page);
    await page.locator("#colormapBtn").click();
    const box = await page.locator("#mainCanvas").boundingBox();
    const cx0 = await page.evaluate(() => mainState.cx);
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => mainState.cx), "the closing tap didn't glide").toBe(cx0);
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await expect.poll(() => page.evaluate(() => mainState.cx), { message: "the next tap glides" }).not.toBe(cx0);
  });

  test("reopening it with nothing changed keeps the DOM it has; a change rebuilds it", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.evaluate(() => { window["__sheetNode"] = document.querySelector("#colorSheet .head"); });
    const same = () => page.evaluate(() => document.querySelector("#colorSheet .head") === window["__sheetNode"]);
    await page.keyboard.press("Escape");
    await page.locator("#colormapBtn").click();
    expect(await same(), "same tab, nothing changed").toBe(true);
    await page.evaluate(() => setColorStyle({ style: "stripes" }));
    await page.keyboard.press("Escape");
    await page.locator("#colormapBtn").click();
    expect(await same(), "style changed").toBe(false);
  });

  test("every palette is on screen at once, named, and pickable, with the current one marked", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const names = await page.evaluate(() => COLORMAPS.map((c) => c.name));
    const swatches = page.locator('#colorSheet [aria-label="Palette"] [role="radio"]');
    await expect(swatches).toHaveCount(names.length);
    const r = await page.evaluate(() => {
      const sheet = document.getElementById("colorSheet").getBoundingClientRect();
      const grid = document.querySelector("#colorSheet .pals");
      return {
        noSideScroll: grid.scrollWidth <= grid.clientWidth + 1,
        swatches: [...grid.querySelectorAll("button")].map((b) => {
          const q = b.getBoundingClientRect();
          return { label: b.getAttribute("aria-label"), w: q.width, h: q.height, inside: q.left >= sheet.left && q.right <= sheet.right };
        }),
        marked: [...grid.querySelectorAll('[aria-checked="true"]')].map((b) => b.getAttribute("aria-label")),
        shown: document.querySelector("#colorSheet .palHead b").textContent,
        current: COLORMAPS[colormapIndex].name,
      };
    });
    expect(r.noSideScroll, "nothing to scroll sideways").toBe(true);
    expect(r.swatches.map((s) => s.label), "every palette, in order, named").toEqual(names);
    for (const s of r.swatches) {
      expect(s.inside, `${s.label} inside the sheet`).toBe(true);
      expect(s.h, `${s.label} height`).toBeGreaterThanOrEqual(44);
      expect(s.w, `${s.label} width`).toBeGreaterThanOrEqual(40);
    }
    expect(r.marked, "exactly the current palette is marked").toEqual([r.current]);
    expect(r.shown, "its name is shown").toBe(r.current);
    // Each one can be picked (clicked in the page: twelve real clicks, each waiting for the canvas to
    // redraw, were slow enough under a full suite run to time out).
    const picked = await page.evaluate((all) => all.map((name) => {
      document.querySelector(`#colorSheet [aria-label="Palette"] [aria-label="${name}"]`).click();
      return COLORMAPS[colormapIndex].name;
    }), names);
    expect(picked).toEqual(names);
  });

  test("every Look is on screen at once, in a grid: four across on a phone, none cut off, no scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.locator("#colormapBtn").click();
    const r = await page.evaluate(() => {
      const grid = document.querySelector("#colorSheet .looks"), sheet = document.getElementById("colorSheet").getBoundingClientRect();
      const tiles = [...grid.querySelectorAll(".pickTile")].map((t) => { const q = t.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, h: q.height, name: t.textContent }; });
      const rows = [...new Set(tiles.map((q) => Math.round(q.t)))].length;
      return { tiles, rows, inside: tiles.every((q) => q.l >= sheet.left && q.r <= sheet.right && q.b <= sheet.bottom), scrolls: grid.scrollWidth > grid.clientWidth + 1, fade: grid.dataset.fade || null, firstRow: tiles.filter((q) => Math.round(q.t) === Math.round(tiles[0].t)).length };
    });
    expect(r.tiles.map((q) => q.name)).toEqual(["Default", "Edge glow", "Stripes", "Bands", "Orbs", "Rays", "Relief"]);
    expect(r.firstRow, "four across").toBe(4);
    expect(r.rows).toBe(2);
    expect(r.inside, "every tile inside the sheet").toBe(true);
    expect(r.scrolls, "nothing to scroll sideways").toBe(false);
    expect(r.fade, "no edge fade left over from the old strip").toBeNull();
    for (const q of r.tiles) expect(q.h, `${q.name} tile height`).toBeGreaterThanOrEqual(44);
    // On an iPad-width screen they sit in one row.
    await page.setViewportSize({ width: 1032, height: 1376 });
    await page.waitForTimeout(300);
    const row = await page.evaluate(() => new Set([...document.querySelectorAll("#colorSheet .looks .pickTile")].map((t) => Math.round(t.getBoundingClientRect().top))).size);
    expect(row, "one row on an iPad").toBe(1);
  });

  // The Looks and the segments don't collide at the larger Dynamic Type sizes
  // (the tiles had a fixed width, so "Classic Inferno" ran together at 2x).
  for (const scale of [1.5, 2]) {
    test(`at ${scale}x text, tile labels don't run into each other, no segment is left alone, and the sheet stays on screen`, async ({ page }) => {
      await page.evaluate((s) => document.documentElement.style.setProperty("--text-scale", String(s)), scale);
      await page.locator("#colormapBtn").click();
      for (const tab of ["Looks", "Custom"]) {
        await page.locator('#colorSheet [role="tab"]', { hasText: tab }).click();
        const r = await page.evaluate(() => {
          const s = document.getElementById("colorSheet"), b = s.getBoundingClientRect();
          const boxes = (sel) => [...s.querySelectorAll(sel)].map((e) => { const q = e.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, over: e.scrollWidth > e.clientWidth + 1, name: e.textContent }; });
          const overlap = (list) => list.some((p, i) => list.slice(i + 1).some((q) => p.l < q.r - 1 && q.l < p.r - 1 && p.t < q.b - 1 && q.t < p.b - 1));
          const tiles = boxes(".looks .pickTile"), segs = boxes(".seg button");
          const segRows = [...new Set(segs.map((q) => Math.round(q.t)))].map((t) => segs.filter((q) => Math.round(q.t) === t).length);
          return { top: b.top, left: b.left, right: b.right, vw: window.innerWidth, noSideScroll: s.scrollWidth <= s.clientWidth + 1,
            tilesOverlap: overlap(tiles), tilesOver: tiles.filter((q) => q.over).map((q) => q.name), segsOverlap: overlap(segs), segsOver: segs.filter((q) => q.over).map((q) => q.name), segRows };
        });
        expect(r.top, `${tab}: top edge on screen`).toBeGreaterThanOrEqual(0);
        expect(r.left, `${tab}: left edge`).toBeGreaterThanOrEqual(0);
        expect(r.right, `${tab}: right edge`).toBeLessThanOrEqual(r.vw);
        expect(r.noSideScroll, `${tab}: no sideways scroll`).toBe(true);
        expect(r.tilesOverlap, `${tab}: tiles don't overlap`).toBe(false);
        expect(r.tilesOver, `${tab}: no tile label overflows its tile`).toEqual([]);
        expect(r.segsOverlap, `${tab}: segments don't overlap`).toBe(false);
        expect(r.segsOver, `${tab}: no segment label overflows`).toEqual([]);
        expect(Math.min(...r.segRows), `${tab}: no segment alone on its row`).toBeGreaterThan(1);
      }
    });
  }

  test("a small phone (360x640): all seven styles in one row, both sliders and Reset reachable, nothing cut off", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await settle(page);
    await page.evaluate(() => setColorStyle({ density: 2 })); // so Reset shows too
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await settleLayout(page);
    const r = await page.evaluate(() => {
      const sheet = document.getElementById("colorSheet"), s = sheet.getBoundingClientRect();
      const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
      const segs = [...sheet.querySelectorAll(".seg button")].map((e) => Math.round(e.getBoundingClientRect().top));
      const inside = (q) => q.top >= s.top - 1 && q.bottom <= s.bottom + 1 && q.left >= s.left - 1 && q.right <= s.right + 1;
      return { segRow: new Set(segs).size, repeat: inside(rect('input[aria-label="Color repeat"]')), shift: inside(rect('input[aria-label="Color shift"]')),
        reset: inside(rect(".reset")), fits: sheet.scrollHeight <= sheet.clientHeight + 1, top: s.top, noSide: sheet.scrollWidth <= sheet.clientWidth + 1 };
    });
    expect(r.segRow, "the seven styles share one row").toBe(1);
    expect(r.repeat && r.shift && r.reset, "sliders and Reset inside the sheet").toBe(true);
    expect(r.fits, "no scrolling needed at this size").toBe(true);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.noSide).toBe(true);
  });

  for (const [w, h] of [[852, 393], [667, 375]]) {
    test(`iPhone landscape (${w}x${h}): the sheet fits, the sliders sit beside the palettes, nothing is cut off`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await settle(page);
      await page.locator("#colormapBtn").click();
      for (const tab of ["Looks", "Custom"]) {
        await page.locator('#colorSheet [role="tab"]', { hasText: tab }).click();
        await settleLayout(page);
        const r = await page.evaluate(() => {
          const sheet = document.getElementById("colorSheet"), s = sheet.getBoundingClientRect();
          const rect = (sel) => document.querySelector(sel)?.getBoundingClientRect();
          const rep = rect('input[aria-label="Color repeat"]'), pal = rect(".pals");
          const tiles = [...sheet.querySelectorAll(".looks .pickTile")].map((e) => Math.round(e.getBoundingClientRect().top));
          return { top: s.top, left: s.left, right: s.right, vw: innerWidth, fits: sheet.scrollHeight <= sheet.clientHeight + 1, noSide: sheet.scrollWidth <= sheet.clientWidth + 1,
            beside: rep && pal ? rep.left >= pal.right - 1 : null, lookRows: new Set(tiles).size };
        });
        expect(r.top, `${tab}: top on screen`).toBeGreaterThanOrEqual(0);
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(r.vw);
        expect(r.noSide).toBe(true);
        if (tab === "Looks") expect(r.lookRows, "the Looks lie in one row").toBe(1);
        else {
          expect(r.beside, "the sliders are beside the palettes").toBe(true);
          // Reachable: if it doesn't all fit, the sheet scrolls, and the last slider can be scrolled to.
          await page.locator('#colorSheet input[aria-label="Color shift"]').scrollIntoViewIfNeeded();
        }
      }
    });
  }

  test("on an iPad-width screen the sheet is centered above the toolbar, not left-aligned", async ({ page }) => {
    await page.setViewportSize({ width: 1032, height: 1376 });
    await settle(page);
    await page.locator("#colormapBtn").click();
    await settleLayout(page);
    const { l, r, vw } = await page.evaluate(() => { const s = document.getElementById("colorSheet").getBoundingClientRect(); return { l: s.left, r: s.right, vw: innerWidth }; });
    expect(Math.abs((l + r) / 2 - vw / 2), "centered, within 20 px").toBeLessThanOrEqual(20);
  });

  test("the palettes and styles have one tab stop each, and the arrow keys move inside them", async ({ page }) => {
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    for (const group of ["Style", "Palette", "Looks"]) {
      const stops = await page.locator(`#colorSheet [aria-label="${group}"] [role="radio"]`).evaluateAll((els) => els.filter((e) => e.tabIndex === 0).length);
      expect(stops, `${group}: one tab stop`).toBe(1);
    }
    const pal = page.locator('#colorSheet [aria-label="Palette"] [role="radio"]');
    await pal.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    expect(await page.evaluate(() => document.activeElement.getAttribute("aria-label")), "ArrowRight moves to the next palette").toBe(await pal.nth(1).getAttribute("aria-label"));
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => colormapIndex)).toBe(1);
  });

  test("picking a palette keeps the sheet's scroll position (at a size where it scrolls)", async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    const sheet = page.locator("#colorSheet");
    await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const top = await sheet.evaluate((el) => el.scrollTop);
    expect(top, "it scrolls at 2x").toBeGreaterThan(0);
    await page.locator('#colorSheet [aria-label="Palette"] [aria-label="Glacier"]').evaluate((el) => el.click());
    expect(await sheet.evaluate((el) => el.scrollTop), "same scroll position after the rebuild").toBeCloseTo(top, 0);
  });

  test("Looks tab", async ({ page }) => {
    await spriteLoaded(page);
    await page.locator("#colormapBtn").click();
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

test.describe("share links", () => {
  test.beforeEach(async ({ page }) => { await load(page); });

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
      for (const [style, density, offset] of [["bands", 1, 0], ["glow", 1, 0], ["stripes", 2.5, 0.25], ["point", 0.25, 0.999], ["cross", 8, 0.001], ["relief", 1.5, 0.75], ["smooth", 3, 0.5], ["smooth", 1, 0.125]]) {
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
    const wanted = [["bands", 1, 0], ["glow", 1, 0], ["stripes", 2.5, 0.25], ["point", 0.25, 0.999], ["cross", 8, 0.001], ["relief", 1.5, 0.75], ["smooth", 3, 0.5], ["smooth", 1, 0.125]];
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

test.describe("the style is global", () => {
  test.beforeEach(async ({ page }) => { await load(page); });

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

test.describe("the info card", () => {
  const card = async (page) => {
    await page.locator("#hudBtn").click();
    await settle(page);
    return { plain: await page.locator("#hud .hudPlain").innerText(), tech: await page.locator("#hud .hudStats").innerText() };
  };

  test("names a Look and lists the style, repeat and shift, in the sheet's words", async ({ page }) => {
    await load(page);
    await page.evaluate(() => { window["__vt"].fractal("Mandelbrot"); });
    const plain0 = await card(page);
    expect(plain0.plain).not.toMatch(/Custom|Edge glow/);
    expect(plain0.tech).not.toMatch(/style:|repeat:|shift:/);
    await page.evaluate(() => { colormapIndex = COLORMAPS.findIndex((c) => c.name === "Inferno"); updateLUT(); setColorStyle({ style: "glow" }); });
    await settle(page);
    expect((await page.locator("#hud .hudPlain").innerText())).toContain("Edge glow");
    expect((await page.locator("#hud .hudStats").innerText())).toContain("style: Edge glow");
    await page.evaluate(() => { colormapIndex = COLORMAPS.findIndex((c) => c.name === "Plasma"); updateLUT(); setColorStyle({ style: "stripes", density: 2, offset: 0.25 }); });
    await settle(page);
    expect((await page.locator("#hud .hudPlain").innerText())).toContain("Custom: Stripes, Plasma");
    const tech = await page.locator("#hud .hudStats").innerText();
    expect(tech).toContain("style: Stripes");
    expect(tech).toContain("repeat: 2×");
    expect(tech).toContain("shift: 25%");
    // The trap styles read Orbs and Rays there too.
    await page.evaluate(() => setColorStyle({ style: "point", density: 1, offset: 0 }));
    await settle(page);
    expect((await page.locator("#hud .hudPlain").innerText())).toContain("Custom: Orbs, Plasma");
  });
});
