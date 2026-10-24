// Each fractal opens in its own palette until the user picks one (the table is
// defaultColormap in FRACTAL_CONFIGS; a Surprise-me place can name one too),
// and the Burning Ship opens upright (state.flipY: the screen's up is -Im c,
// the classic picture, with `fl=1` in its share links; links without it open
// as they always did). Run through `npm run test:visual`.
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";

/* global COLORMAPS, FRACTAL_CONFIGS, TELEPORT_DESTINATIONS, colormapIndex, currentName, selectFractal, pickColormap,
   applyShareLink, parseShareHash, buildShareHash, mainState, juliaState, mainRenderer, screenToComplex, centerForAnchor,
   flyToPlace, popHistory, enterDual, lastMainDeepPath, requestRender, els */

const DRIVER = new URL("../driver.js", import.meta.url).pathname;
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const LOOK_CHECKED = '#colorSheet [aria-label="Looks"] [role="radio"][aria-checked="true"]';

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

const paletteName = (page) => page.evaluate(() => COLORMAPS[colormapIndex].name);
const placeIndex = (label) => `TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)})`;

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test.describe("default palettes", () => {
  test.beforeEach(async ({ page }) => { await load(page); });

  test("the table names real colormaps, and the app starts in Inferno", async ({ page }) => {
    const table = await page.evaluate(() => {
      const names = COLORMAPS.map((c) => c.name);
      const bad = Object.entries(FRACTAL_CONFIGS).filter(([, c]) => c.defaultColormap !== undefined && !names.includes(c.defaultColormap)).map(([k]) => k);
      const own = Object.fromEntries(Object.entries(FRACTAL_CONFIGS).filter(([, c]) => c.defaultColormap).map(([k, c]) => [k, c.defaultColormap]));
      return { bad, own, first: names[0] };
    });
    expect(table.bad).toEqual([]);
    expect(table.first).toBe("Inferno");
    expect(table.own).toEqual({
      "Burn. Ship": "Fire", "Tricorn": "Classic", "Multibrot³": "Viridis", "Phoenix": "Hot", "Julia:Phoenix": "Hot", "Carpet": "Glacier", "Gasket": "Plasma",
    });
    expect(await paletteName(page), "Mandelbrot opens in Inferno").toBe("Inferno");
  });

  test("a fractal opens in its own palette until one is picked", async ({ page }) => {
    const seen = await page.evaluate(() => {
      const out = {};
      for (const f of ["Burn. Ship", "Mandelbrot", "Gasket", "Julia:Phoenix", "Newton z³", "Tricorn"]) {
        selectFractal(f, { fresh: true });
        out[f] = COLORMAPS[colormapIndex].name;
      }
      return out;
    });
    expect(seen).toEqual({ "Burn. Ship": "Fire", "Mandelbrot": "Inferno", "Gasket": "Plasma", "Julia:Phoenix": "Hot", "Newton z³": "Inferno", "Tricorn": "Classic" });
    // Remembered views too: going back to a fractal brings its default back, not the last one's.
    const back = await page.evaluate(() => { selectFractal("Burn. Ship"); const a = COLORMAPS[colormapIndex].name; selectFractal("Carpet"); return [a, COLORMAPS[colormapIndex].name]; });
    expect(back).toEqual(["Fire", "Glacier"]);
    // The color button and the Default Look follow it (the Ship is on the Default Look in Fire).
    await page.evaluate(() => selectFractal("Burn. Ship"));
    await settle(page);
    await expect(page.locator("#colormapBtn")).toHaveAttribute("aria-label", "Choose colors (Default, Fire)");
    await page.locator("#colormapBtn").click();
    await expect(page.locator(LOOK_CHECKED)).toHaveText("Default");
  });

  test("a palette the user picked holds for every fractal, until the Default Look or Reset", async ({ page }) => {
    await page.evaluate(() => selectFractal("Burn. Ship"));
    await settle(page);
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await page.locator('#colorSheet [aria-label="Palette"] [role="radio"][aria-label="Viridis"]').click();
    expect(await paletteName(page)).toBe("Viridis");
    const held = await page.evaluate(() => {
      const out = [];
      for (const f of ["Mandelbrot", "Gasket", "Burn. Ship", "Phoenix"]) { selectFractal(f, { fresh: true }); out.push(COLORMAPS[colormapIndex].name); }
      return out;
    });
    expect(held, "the pick wins over each fractal's default, also on Reset (a fresh view)").toEqual(["Viridis", "Viridis", "Viridis", "Viridis"]);
    // Reset in the sheet returns to the defaults and lets the next fractal open in its own.
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Custom" }).click();
    await page.locator('#colorSheet [data-key="reset"]').click();
    expect(await paletteName(page), "Reset: Phoenix's own").toBe("Hot");
    expect(await page.evaluate(() => { selectFractal("Gasket"); return COLORMAPS[colormapIndex].name; })).toBe("Plasma");
    // The Default Look does the same (on a fractal that has the Looks tab).
    await page.evaluate(() => { selectFractal("Burn. Ship"); pickColormap(COLORMAPS.findIndex((c) => c.name === "Twilight")); });
    await page.locator("#colormapBtn").click();
    await page.locator('#colorSheet [role="tab"]', { hasText: "Looks" }).click();
    await page.locator('#colorSheet [data-key="look-default"]').click();
    expect(await paletteName(page), "the Default Look on the Ship").toBe("Fire");
    expect(await page.evaluate(() => { selectFractal("Gasket"); return COLORMAPS[colormapIndex].name; })).toBe("Plasma");
  });

  test("a share link's palette is exactly what it names, and counts as a pick unless it is the fractal's own", async ({ page }) => {
    const r = await page.evaluate(() => {
      const link = (q) => applyShareLink(`https://kmjohn1000.github.io/fractal-web/#v=1&m=fractal&${q}`);
      const next = (f) => { selectFractal(f, { fresh: true }); return COLORMAPS[colormapIndex].name; };
      const out = {};
      // An old Burning Ship link names Inferno: it opens in Inferno, and so does the next fractal (a pick).
      link("f=Burn.+Ship&x=-1.7595&y=-0.036&s=0.068&r=3.141592653589793&i=610&cm=Inferno");
      out.oldShip = COLORMAPS[colormapIndex].name; out.afterOld = next("Gasket");
      // A link with no palette at all is Inferno, as it always was.
      link("f=Burn.+Ship&x=-1.7595&y=-0.036&s=0.068&r=0&i=610");
      out.noCm = COLORMAPS[colormapIndex].name;
      // A link in the fractal's own palette is not a pick: the next fractal opens in its own.
      link("f=Burn.+Ship&x=-1.7595&y=-0.036&s=0.068&r=0&fl=1&i=610&cm=Fire");
      out.fireShip = COLORMAPS[colormapIndex].name; out.afterFire = next("Gasket");
      // Another palette is a pick.
      link("f=Tricorn&x=-0.5&y=0&s=1.7&r=0&i=300&cm=Plasma");
      out.plasmaTricorn = COLORMAPS[colormapIndex].name; out.afterPlasma = next("Burn. Ship");
      return out;
    });
    expect(r).toEqual({ oldShip: "Inferno", afterOld: "Inferno", noCm: "Inferno", fireShip: "Fire", afterFire: "Plasma", plasmaTricorn: "Plasma", afterPlasma: "Plasma" });
  });

  test("a place can name its palette: applied on the flight, never over a pick", async ({ page }) => {
    const r = await page.evaluate(() => {
      TELEPORT_DESTINATIONS.push({ fractal: "Mandelbrot", label: "Test place", re: "-0.75", im: "0.1", scale: 0.05, colormap: "Glacier" });
      const test = TELEPORT_DESTINATIONS.length - 1;
      const name = () => COLORMAPS[colormapIndex].name;
      const out = {};
      window["__vt"].fractal("Mandelbrot");
      out.start = name();
      flyToPlace(test); out.onFlightToTest = name();
      flyToPlace(TELEPORT_DESTINATIONS.findIndex((d) => d.label === "Seahorse Valley")); out.onFlightToPlain = name();
      pickColormap(COLORMAPS.findIndex((c) => c.name === "Plasma"));
      flyToPlace(test); out.pickedThenTest = name();
      TELEPORT_DESTINATIONS.pop();
      return out;
    });
    expect(r).toEqual({ start: "Inferno", onFlightToTest: "Glacier", onFlightToPlain: "Inferno", pickedThenTest: "Plasma" });
    await settle(page);
  });

  test("the shipped places name only real palettes", async ({ page }) => {
    const bad = await page.evaluate(() => {
      const names = COLORMAPS.map((c) => c.name);
      return TELEPORT_DESTINATIONS.filter((d) => d.colormap !== undefined && !names.includes(d.colormap)).map((d) => d.label);
    });
    expect(bad).toEqual([]);
  });
});

// A PNG's mean absolute difference from another (the second mirrored top to bottom when asked), over every
// channel of 255, and the same after averaging 8x8 blocks (the oracle gate's measure, for the chaotic filament zones).
function difference(a, b, mirror) {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  expect(A.width).toBe(B.width);
  expect(A.height).toBe(B.height);
  const pa = (x, y, c) => A.data[(y * A.width + x) * 4 + c];
  const pb = (x, y, c) => B.data[((mirror ? B.height - 1 - y : y) * B.width + x) * 4 + c];
  let sum = 0;
  for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) for (let c = 0; c < 3; c++) sum += Math.abs(pa(x, y, c) - pb(x, y, c));
  const BLOCK = 8;
  let blur = 0, n = 0;
  for (let by = 0; by + BLOCK <= A.height; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= A.width; bx += BLOCK) {
      for (let c = 0; c < 3; c++) {
        let sa = 0, sb = 0;
        for (let y = by; y < by + BLOCK; y++) for (let x = bx; x < bx + BLOCK; x++) { sa += pa(x, y, c); sb += pb(x, y, c); }
        blur += Math.abs(sa - sb) / (BLOCK * BLOCK);
        n++;
      }
    }
  }
  return { mean: sum / (A.width * A.height * 3), blur: blur / n };
}

test.describe("the Burning Ship opens upright", () => {
  test.beforeEach(async ({ page }) => { await load(page); });

  test("a plain pick, Reset and a remembered view are flipped; nothing else is", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = {};
      const flip = () => !!mainState.flipY;
      selectFractal("Burn. Ship"); out.pick = flip();
      mainState.cx += 0.1; selectFractal("Mandelbrot"); selectFractal("Burn. Ship"); out.remembered = flip();
      selectFractal("Burn. Ship", { fresh: true }); out.reset = flip();
      enterDual(); out.julia = !!juliaState.flipY; out.mainInDual = flip();
      out.flippedFractals = Object.entries(FRACTAL_CONFIGS).filter(([, c]) => c.flipY).map(([k]) => k);
      selectFractal("Mandelbrot", { fresh: true }); out.mandelbrot = flip();
      return out;
    });
    expect(r).toEqual({ pick: true, remembered: true, reset: true, julia: false, mainInDual: true, flippedFractals: ["Burn. Ship"], mandelbrot: false });
  });

  test("the top of the screen is -Im, the bottom +Im: the real axis is in the lower part of the opening view", async ({ page }) => {
    const r = await page.evaluate(() => {
      const c = els.mainCanvas.getBoundingClientRect();
      const at = (sy) => screenToComplex(mainRenderer, mainState, c.width / 2, sy).y;
      const out = {};
      selectFractal("Burn. Ship", { fresh: true }); out.ship = { top: at(0), bottom: at(c.height) };
      selectFractal("Mandelbrot", { fresh: true }); out.mandelbrot = { top: at(0), bottom: at(c.height) };
      return out;
    });
    expect(r.ship.top, "Ship: up is -Im").toBeLessThan(r.ship.bottom);
    expect(r.ship.bottom, "the screen's bottom edge is above the whole set's lowest point, at +Im").toBeGreaterThan(0.3);
    expect(r.mandelbrot.top, "Mandelbrot: up is +Im, as ever").toBeGreaterThan(r.mandelbrot.bottom);
  });

  test("pan, zoom and the Julia tap use the same mapping: screen point to complex and back, flipped and turned", async ({ page }) => {
    const err = await page.evaluate(() => {
      selectFractal("Burn. Ship", { fresh: true });
      mainState.rotation = 0.7;
      const c = els.mainCanvas.getBoundingClientRect();
      let worst = 0;
      for (const [sx, sy] of [[10, 20], [c.width / 2, c.height / 2], [c.width - 5, c.height - 9], [40, c.height - 30]]) {
        const p = screenToComplex(mainRenderer, mainState, sx, sy);
        // Anchoring that point at the same screen spot must leave the center where it is.
        const a = centerForAnchor(mainRenderer, mainState, sx, sy, p.x, p.y);
        worst = Math.max(worst, Math.abs(a.cx - mainState.cx), Math.abs(a.cy - mainState.cy));
      }
      return worst;
    });
    expect(err).toBeLessThan(1e-12);
  });

  test("the picture is the old one mirrored top to bottom, also turned", async ({ page }) => {
    const canvas = page.locator("#mainCanvas");
    const shoot = async (snippet) => { await page.evaluate(snippet); await settle(page); return canvas.screenshot({ animations: "disabled" }); };
    for (const rotation of [0, 0.7]) {
      const flipped = await shoot(`window.__vt.fractal("Burn. Ship", 0); mainState.rotation = ${rotation}; requestRender()`);
      // The same view without the flip, turned the other way (a mirror turns the opposite way round): what the app showed before 1.44.0.
      const old = await shoot(`mainState.flipY = false; mainState.rotation = ${-rotation}; requestRender()`);
      const same = difference(flipped, old, true);
      const unmirrored = difference(flipped, old, false);
      expect(same.mean, `rotation ${rotation}: mirrored it is the same picture (mean ${same.mean.toFixed(2)})`).toBeLessThan(1.5);
      expect(unmirrored.mean, `rotation ${rotation}: unmirrored it is not (mean ${unmirrored.mean.toFixed(2)})`).toBeGreaterThan(8);
    }
  });

  // Lightning (6e-4) is the first place past the perturbation threshold with calm filaments. In the chaotic
  // interiors of the deeper places (Twin Ships) float32 glitches differ with the reference orbit, which a mirror
  // can pick differently, so there the comparison is against the float64 oracle instead (`oracle-compare.mjs --flip 1`).
  test("deep zoom: the perturbation path draws the same picture mirrored", async ({ page }) => {
    const canvas = page.locator("#mainCanvas");
    const shoot = async (snippet) => { await page.evaluate(snippet); await settle(page); return canvas.screenshot({ animations: "disabled" }); };
    const flipped = await shoot(`window["__vt"].place(${placeIndex("Lightning")}, 0)`);
    expect(await page.evaluate(() => [mainState.flipY, lastMainDeepPath]), "Lightning is flipped and deep").toEqual([true, "perturbation"]);
    const old = await shoot("mainState.flipY = false; requestRender()");
    expect(await page.evaluate(() => lastMainDeepPath)).toBe("perturbation");
    const same = difference(flipped, old, true);
    const unmirrored = difference(flipped, old, false);
    // Two float32 renderings, each with its own noise (the oracle's gate against float64 is 3 of 255, tests/README.md;
    // WebKit on a phone measures up to about 4 between the two), and unmirrored it is a plainly different picture.
    expect(same.blur, `mirrored: blurred difference ${same.blur.toFixed(2)}`).toBeLessThan(5);
    expect(unmirrored.blur, `unmirrored: blurred difference ${unmirrored.blur.toFixed(2)} (mirrored ${same.blur.toFixed(2)})`).toBeGreaterThan(Math.max(6, 2 * same.blur));
  });

  test("the Julia pane of dual view doesn't depend on the flip", async ({ page }) => {
    const julia = page.locator("#juliaCanvas");
    await page.evaluate(() => { window["__vt"].fractal("Burn. Ship", 0); Object.assign(mainState, { cx: -1.7595, cy: -0.036, scale: 0.5 }); enterDual(); });
    await settle(page);
    const a = await julia.screenshot({ animations: "disabled" });
    await page.evaluate(() => { mainState.flipY = false; requestRender(); });
    await settle(page);
    const b = await julia.screenshot({ animations: "disabled" });
    expect(Buffer.compare(a, b), "the same Julia set for the same c").toBe(0);
  });

  test("a tap in the main pane of dual view sets c where the finger is, up being -Im", async ({ page }) => {
    await page.evaluate(() => { window["__vt"].fractal("Burn. Ship", 0); enterDual(); });
    await settle(page);
    const box = await page.locator("#mainCanvas").boundingBox();
    const tap = { x: box.x + box.width / 2, y: box.y + box.height / 4 }; // above the center
    const want = await page.evaluate(([x, y]) => screenToComplex(mainRenderer, mainState, x, y), [tap.x - box.x, tap.y - box.y]);
    const before = await page.evaluate(() => mainState.cy);
    const px = await page.evaluate(() => 2 * mainState.scale / els.mainCanvas.clientHeight); // complex units per CSS px
    await page.mouse.click(tap.x, tap.y);
    // The glide to the tapped point (GLIDE_MS) ends on it (WebKit reports the pointer a pixel or so off the
    // click's coordinates, and under load needs more than a moment): wait for it to arrive.
    await page.waitForFunction(([x, y, tol]) => Math.abs(mainState.cx - x) < tol && Math.abs(mainState.cy - y) < tol, [want.x, want.y, 3 * px], { timeout: 15_000, polling: 100 });
    await settle(page);
    const after = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, c: juliaState.juliaC }));
    expect(after.cy, "a tap above the center moves toward -Im").toBeLessThan(before);
    expect(Math.abs(after.cx - want.x), "within a few pixels of where the finger was").toBeLessThan(3 * px);
    expect(Math.abs(after.cy - want.y), "within a few pixels of where the finger was").toBeLessThan(3 * px);
    expect(after.c).toEqual([after.cx, after.cy]);
  });

  test("every Burning Ship place lands upright (no half turns left)", async ({ page }) => {
    const rotations = await page.evaluate(() => TELEPORT_DESTINATIONS.filter((d) => d.fractal === "Burn. Ship").map((d) => [d.label, d.rotation]));
    expect(rotations.length).toBeGreaterThanOrEqual(9);
    for (const [label, rotation] of rotations) {
      if (label === "Stingray") expect(rotation, label).toBeCloseTo(Math.PI - 2.5, 12);
      else expect(rotation, label).toBe(0);
    }
  });
});

test.describe("Burning Ship share links", () => {
  test.beforeEach(async ({ page }) => { await load(page); });

  const OLD = "#v=1&m=fractal&f=Burn.+Ship&x=-1.7595&y=-0.036&s=0.068&r=3.141592653589793&i=610&cm=Inferno";

  test("a link without fl opens as it always did, one with fl=1 opens upright", async ({ page }) => {
    const r = await page.evaluate((old) => {
      const pick = (st) => st && { x: st.cx, y: st.cy, s: st.scale, r: st.rotation, flipY: st.flipY };
      return {
        old: pick(parseShareHash(old)),
        flagged: pick(parseShareHash(old.replace("r=3.141592653589793", "r=0") + "&fl=1")),
        zero: pick(parseShareHash(old + "&fl=0")),
        junk: pick(parseShareHash(old + "&fl=yes")),
        mandelbrot: pick(parseShareHash("#v=1&m=fractal&f=Mandelbrot&x=-0.75&y=0&s=1.4&r=0&i=300&cm=Inferno&fl=1")),
      };
    }, OLD);
    const place = { x: -1.7595, y: -0.036, s: 0.068 };
    // (a half turn is stored as -PI: normalizeAngle's range is [-PI, PI))
    expect(Math.abs(r.old.r), "the old link's half turn").toBeCloseTo(Math.PI, 12);
    expect(r.old).toEqual({ ...place, r: r.old.r, flipY: false });
    expect(r.flagged).toEqual({ ...place, r: 0, flipY: true });
    expect(r.zero.flipY).toBe(false);
    expect(r.junk.flipY).toBe(false);
    expect(r.mandelbrot.flipY, "fl means nothing for a fractal without the flipped picture").toBe(false);
  });

  test("an old link keeps its place, turn and look; a new one is written with fl", async ({ page }) => {
    await page.evaluate((old) => applyShareLink("https://kmjohn1000.github.io/fractal-web/" + old), OLD);
    await settle(page);
    const opened = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, rotation: mainState.rotation, flipY: mainState.flipY, link: buildShareHash(), cm: COLORMAPS[colormapIndex].name }));
    expect(opened).toMatchObject({ cx: -1.7595, cy: -0.036, scale: 0.068, flipY: false, cm: "Inferno" });
    expect(Math.abs(opened.rotation), "the half turn is kept").toBeCloseTo(Math.PI, 12);
    expect(opened.link, "an old view is written back without the flag").not.toContain("fl=");
    // The plain pick, and a link written from it, are upright and say so.
    await page.evaluate(() => window["__vt"].fractal("Burn. Ship"));
    await settle(page);
    const fresh = await page.evaluate(() => buildShareHash());
    expect(fresh).toContain("&fl=1");
    expect(fresh).toContain("cm=Fire");
    // Opening that link again reproduces the view, flag and all.
    await page.evaluate(() => { const h = buildShareHash(); window["__vt"].fractal("Mandelbrot"); applyShareLink("https://kmjohn1000.github.io/fractal-web/" + h); });
    await settle(page);
    expect(await page.evaluate(() => [currentName, mainState.flipY, mainState.rotation])).toEqual(["Burn. Ship", true, 0]);
  });

  test("Surprise me from an old-link view lands upright, and Back returns to the old view", async ({ page }) => {
    await page.evaluate((old) => applyShareLink("https://kmjohn1000.github.io/fractal-web/" + old), OLD);
    await settle(page);
    expect(await page.evaluate(() => mainState.flipY)).toBe(false);
    const oldRotation = await page.evaluate(() => mainState.rotation);
    await page.evaluate(`flyToPlace(${placeIndex("Ghost Ship")})`);
    // The flight takes a second or two: wait for its exact landing.
    await page.waitForFunction(() => mainState.cx === -1.941 && mainState.scale === 6e-3, null, { timeout: 30_000, polling: 100 });
    await settle(page);
    const landed = await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, rotation: mainState.rotation, flipY: mainState.flipY }));
    expect(landed).toEqual({ cx: -1.941, cy: -0.0038, rotation: 0, flipY: true });
    await page.evaluate(() => popHistory("main"));
    await settle(page);
    expect(await page.evaluate(() => ({ cx: mainState.cx, cy: mainState.cy, rotation: mainState.rotation, flipY: mainState.flipY })))
      .toEqual({ cx: -1.7595, cy: -0.036, rotation: oldRotation, flipY: false });
  });
});
