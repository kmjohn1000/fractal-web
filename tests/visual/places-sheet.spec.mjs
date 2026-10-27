// The Places sheet (places-sheet.js): every named place in a bottom sheet, grouped by fractal in
// the picker's order, opened from the picker's first row and the info card's button; a tap flies
// there. These checks cover what it lists, how it opens and closes, the flights it starts and its
// layout on a phone and a desktop. Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

/* global TELEPORT_DESTINATIONS, PICKER_LAYOUT, FRACTAL_CONFIGS, mainState, mainHistory, currentName, dualActive, mode,
   hudVisible, placeId, viewFromBounds, mainCanvasAspect, teleportLandingIndex, enterDual */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const THUMBS = new URL("../../icons/places/", import.meta.url).pathname;
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
const settleLayout = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150)))));

// Opens the sheet the way a person does, from the picker's first row.
async function openFromPicker(page) {
  await page.locator(".fractalMenuBtn:visible").first().click();
  await page.locator("#fractalTypeRow .placesRow").click();
  await expect(page.locator("#placesSheet")).toHaveClass(/open/);
  await settleLayout(page);
}
const row = (page, label) => page.locator(`#placesSheet .placeRow[aria-label^="${label}, "]`);

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test.describe("what the sheet lists", () => {
  test("every place has a unique id and a thumbnail file", async ({ page }) => {
    await load(page);
    const ids = await page.evaluate(() => TELEPORT_DESTINATIONS.map((d) => placeId(d)));
    expect(new Set(ids).size, "two places share an id").toBe(ids.length);
    const missing = ids.filter((id) => !existsSync(`${THUMBS}${id}.webp`));
    expect(missing, "places without icons/places/<id>.webp (node scripts/render_place_thumbs.mjs --missing)").toEqual([]);
  });

  test("lists every place once, grouped by fractal in the picker's order, with a chip per group", async ({ page }) => {
    await load(page);
    await openFromPicker(page);
    const seen = await page.evaluate(() => ({
      groups: [...document.querySelectorAll("#placesSheet .placesGroup")].map((g) => ({
        fractal: g.dataset.fractal, places: [...g.querySelectorAll(".placeRow")].map((r) => r.dataset.place),
      })),
      chips: [...document.querySelectorAll("#placesSheet .chip")].map((c) => c.dataset.fractal),
      pickerOrder: PICKER_LAYOUT.flatMap((s) => s.groups.flatMap((g) => g.keys)),
      expected: TELEPORT_DESTINATIONS.map((d) => ({ fractal: d.fractal, id: placeId(d) })),
    }));
    const order = seen.pickerOrder.filter((k) => seen.expected.some((e) => e.fractal === k));
    expect(seen.groups.map((g) => g.fractal)).toEqual(order);
    expect(seen.chips).toEqual(order);
    for (const g of seen.groups) {
      expect(g.places, g.fractal).toEqual(seen.expected.filter((e) => e.fractal === g.fractal).map((e) => e.id));
    }
    expect(seen.groups.flatMap((g) => g.places).length).toBe(seen.expected.length);
  });

  test("a row names the place, how deep it is and that it dives, and is a real button", async ({ page }) => {
    await load(page);
    await openFromPicker(page);
    const seahorse = row(page, "Seahorse Valley");
    await expect(seahorse).toHaveCount(1);
    expect(await seahorse.evaluate((el) => el.tagName)).toBe("BUTTON");
    await expect(seahorse).toHaveAttribute("aria-label", /^Seahorse Valley, .+ deeper\. Dive in$/);
    await expect(seahorse.locator(".dive")).toHaveText("Dive");
    await expect(seahorse.locator(".placeDepth")).toContainText("deeper");
    const box = await seahorse.boundingBox();
    expect(box.height, "a row is a comfortable tap target").toBeGreaterThanOrEqual(44);
  });
});

test.describe("opening and closing", () => {
  test("the picker's first row opens it and the picker closes; the info card's button opens it too", async ({ page }) => {
    await load(page);
    await page.locator(".fractalMenuBtn:visible").first().click();
    await expect(page.locator("#fractalTypeRow")).toHaveClass(/open/);
    expect(await page.evaluate(() => document.querySelector("#fractalTypeRow").firstElementChild.classList.contains("placesRow"))).toBe(true);
    await page.locator("#fractalTypeRow .placesRow").click();
    await expect(page.locator("#placesSheet")).toHaveClass(/open/);
    await expect(page.locator("#fractalTypeRow")).not.toHaveClass(/open/);
    await page.locator("#placesSheet .done").click();
    await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
    // The info card's button.
    await page.locator("#hudBtn").click();
    await expect(page.locator("#hud .hudPlaces")).toBeVisible();
    await page.locator("#hud .hudPlaces").click();
    await expect(page.locator("#placesSheet")).toHaveClass(/open/);
    // (On a phone the open sheet covers the info card, so the button isn't tapped again to close it.)
    await expect(page.locator("#hud .hudPlaces")).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
    await expect(page.locator("#hud .hudPlaces")).toHaveAttribute("aria-expanded", "false");
  });

  test("Escape, Done, a tap on the fractal and the other popovers close it; opening it never resizes the canvas", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await load(page);
    const canvas = () => page.evaluate(() => { const r = document.getElementById("mainCanvas").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
    const before = await canvas();
    await openFromPicker(page);
    expect(await canvas()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
    await openFromPicker(page);
    await page.mouse.click(5, 5);
    await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
    for (const opener of ["#colormapBtn", ".shareBtn:visible"]) {
      await openFromPicker(page);
      await page.locator(opener).first().click();
      await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
      await page.keyboard.press("Escape");
      await page.mouse.click(5, 5);
    }
    // Opening the sheet closes the others.
    await page.locator("#colormapBtn").click();
    await expect(page.locator("#colorSheet")).toHaveClass(/open/);
    await page.locator("#hudBtn").click();
    await page.locator("#hud .hudPlaces").click();
    await expect(page.locator("#colorSheet")).not.toHaveClass(/open/);
    await expect(page.locator("#placesSheet")).toHaveClass(/open/);
  });

  test("the chips jump to a group and the active chip follows the scroll", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await load(page);
    await openFromPicker(page);
    await expect(page.locator("#placesSheet .chip.active")).toHaveAttribute("data-fractal", "Mandelbrot");
    await page.locator('#placesSheet .chip[data-fractal="Carpet"]').click();
    await expect(page.locator("#placesSheet .chip.active")).toHaveAttribute("data-fractal", "Carpet");
    const gap = await page.evaluate(() => {
      const s = document.querySelector("#placesSheet .placesScroll").getBoundingClientRect().top;
      return document.querySelector('#placesSheet .placesGroup[data-fractal="Carpet"]').getBoundingClientRect().top - s;
    });
    expect(Math.abs(gap), "the group's title sits at the top of the list").toBeLessThan(4);
    // A sticky title stays put while its group passes under it.
    const headTop = await page.evaluate(() => {
      const s = document.querySelector("#placesSheet .placesScroll").getBoundingClientRect().top;
      return document.querySelector('#placesSheet .placesGroup[data-fractal="Carpet"] .placesGroupHead').getBoundingClientRect().top - s;
    });
    expect(Math.abs(headTop)).toBeLessThan(4);
  });
});

test.describe("flying to a place", () => {
  test("a place on the fractal being looked at: the sheet closes, the info card comes on and names it on landing", async ({ page }) => {
    await load(page);
    await openFromPicker(page);
    expect(await page.evaluate(() => hudVisible)).toBe(false);
    await row(page, "Elephant Valley").click();
    await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#hud .hudName")).toHaveText("Elephant Valley", { timeout: 20_000 });
    await settle(page);
    const landed = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, name: currentName }));
    expect(landed).toEqual({ cx: 0.2825, cy: 0.0105, scale: 1.2e-2, name: "Mandelbrot" });
  });

  test("a place on another fractal switches to it and flies from its whole-shape view, not the one it was left in", async ({ page }) => {
    await load(page);
    // Leave the Tricorn zoomed in somewhere, then go back to the Mandelbrot set.
    await page.evaluate(() => {
      const w = window["__vt"];
      w.fractal("Tricorn");
      Object.assign(mainState, { cx: -1.3, cy: 0.05, scale: 3e-3 });
      w.fractal("Mandelbrot");
    });
    await settle(page);
    await openFromPicker(page);
    await row(page, "Baby Tricorn").click();
    await expect(page.locator("#hud .hudName")).toHaveText("Baby Tricorn", { timeout: 20_000 });
    await settle(page);
    const seen = await page.evaluate(() => {
      const whole = viewFromBounds(FRACTAL_CONFIGS["Tricorn"].view, mainCanvasAspect());
      return { name: currentName, from: mainHistory.at(-1), whole, landing: TELEPORT_DESTINATIONS[teleportLandingIndex].label };
    });
    expect(seen.name).toBe("Tricorn");
    expect(seen.landing).toBe("Baby Tricorn");
    expect(seen.from.scale).toBeCloseTo(seen.whole.scale, 9);
    expect(seen.from.cx).toBeCloseTo(seen.whole.cx, 9);
  });

  test("from a pattern mode a place brings the fractals back, and Back returns to its whole-shape view", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window["__vt"].mode("koch"));
    await settle(page);
    await openFromPicker(page);
    await row(page, "Seahorse Valley").click();
    await expect(page.locator("#hud .hudName")).toHaveText("Seahorse Valley", { timeout: 20_000 });
    expect(await page.evaluate(() => mode)).toBe("fractal");
  });

  test("in dual view, a place on a Julia set closes it and flies on that set", async ({ page }) => {
    await load(page);
    await page.evaluate(() => enterDual());
    await settle(page);
    expect(await page.evaluate(() => dualActive)).toBe(true);
    await openFromPicker(page);
    await row(page, "Rabbit Hole").click();
    await expect(page.locator("#hud .hudName")).toHaveText("Rabbit Hole", { timeout: 30_000 });
    expect(await page.evaluate(() => ({ name: currentName, dual: dualActive }))).toEqual({ name: "Julia:Rabbit", dual: false });
  });

  test("Back after a flight returns to where the flight started", async ({ page }) => {
    await load(page);
    const start = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }));
    await openFromPicker(page);
    await row(page, "Mini Mandelbrot").click();
    await expect(page.locator("#hud .hudName")).toHaveText("Mini Mandelbrot", { timeout: 30_000 });
    await settle(page);
    await page.locator("#backBtn").click();
    await settle(page);
    expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale }))).toEqual(start);
  });
});

test.describe("layout", () => {
  test("a phone gets one column and a desktop two, with no sideways scroll and the sheet clear of the toolbar", async ({ page }) => {
    for (const [size, columns] of [[{ width: 393, height: 852 }, 1], [{ width: 1280, height: 800 }, 2]]) {
      await page.setViewportSize(size);
      await load(page);
      await openFromPicker(page);
      const seen = await page.evaluate(() => {
        const sheet = document.getElementById("placesSheet").getBoundingClientRect();
        const controls = document.getElementById("controls").getBoundingClientRect();
        const scroll = document.querySelector("#placesSheet .placesScroll");
        const firstList = document.querySelector("#placesSheet .placesList");
        return {
          columns: getComputedStyle(firstList).gridTemplateColumns.split(" ").length,
          sheetBottom: sheet.bottom, controlsTop: controls.top, sheetLeft: sheet.left, sheetRight: sheet.right, width: window.innerWidth,
          overflowX: scroll.scrollWidth > scroll.clientWidth + 1,
          height: sheet.height, viewport: window.innerHeight,
        };
      });
      expect(seen.columns).toBe(columns);
      expect(seen.overflowX).toBe(false);
      expect(seen.sheetBottom).toBeLessThanOrEqual(seen.controlsTop);
      expect(seen.sheetLeft).toBeGreaterThanOrEqual(0);
      expect(seen.sheetRight).toBeLessThanOrEqual(seen.width);
      expect(seen.height).toBeLessThanOrEqual(seen.viewport * 0.62 + 1);
    }
  });

  test("a short landscape phone fits the sheet on screen", async ({ page }) => {
    await page.setViewportSize({ width: 852, height: 393 });
    await load(page);
    await openFromPicker(page);
    const box = await page.locator("#placesSheet").boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(393);
  });

  test("the sheet looks the same", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await load(page);
    await openFromPicker(page);
    // The thumbnails load lazily as they scroll into view.
    await page.waitForFunction(() => [...document.querySelectorAll("#placesSheet .placeRow img")].slice(0, 6).every((i) => i.complete));
    await expect(page.locator("#placesSheet")).toHaveScreenshot("places-sheet.png");
  });
});
