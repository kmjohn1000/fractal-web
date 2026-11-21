// The "Learn more about X on Wikipedia" row at the bottom of the info card (#hud): the `wiki` data for every
// fractal and pattern shape (this file holds its own copy of the verified link table, so a changed link fails),
// the row shown for the 26 entries that have an article and hidden for the 9 that do not (and for a key with no
// entry), its label, hint and the address it opens, the https en.wikipedia.org allowlist in Platform.openLink
// (a bad address is refused and nothing opens), the web path (a new tab, noopener,noreferrer), the row at
// the biggest text size on a phone, and its size and keyboard use. The app's own path (the in-app Safari
// view) cannot run here: Platform.openLink is stubbed where a test needs to see the tap.
import { test, expect } from "@playwright/test";

/* global setMode, selectFractal, hudVisible, requestRender, refitHud, FRACTAL_CONFIGS, EXTRA_MODES, Platform, isWikipediaUrl, fractalLabel */

const W = "https://en.wikipedia.org/wiki/";
// FRACTAL_CONFIGS key -> link; null = no article, no row.
const ZOOM = {
  "Mandelbrot": W + "Mandelbrot_set",
  "Burn. Ship": W + "Burning_Ship_fractal",
  "Tricorn": W + "Tricorn_(mathematics)",
  "Celtic": null,
  "Multibrot³": W + "Multibrot_set",
  "Phoenix": null,
  "Julia:Rabbit": W + "Douady_rabbit",
  "Julia:Dragon": W + "Julia_set#Quadratic_polynomials",
  "Julia:Spiral": W + "Julia_set#Quadratic_polynomials",
  "Julia:Phoenix": null,
  "Newton z³": W + "Newton_fractal",
  "Nova": W + "Newton_fractal#Nova_fractal",
  "Carpet": W + "Sierpi%C5%84ski_carpet",
  "Gasket": W + "Sierpi%C5%84ski_triangle",
  "Apollonian": W + "Apollonian_gasket",
  "Spider": null,
  "Magnet I": null,
  "Magnet II": null,
  "Sine Julia": null,
  "Sine plane": null,
  "Sine L plane": null,
};
// EXTRA_MODES key -> link (every pattern shape has one).
const PATTERN = {
  koch: W + "Koch_snowflake",
  tree: W + "Pythagoras_tree_(fractal)",
  dragon: W + "Dragon_curve#Heighway_dragon",
  hilbert: W + "Hilbert_curve",
  gosper: W + "Gosper_curve",
  arrowhead: W + "Sierpi%C5%84ski_curve#Arrowhead_curve",
  penrose: W + "Penrose_tiling",
  fern: W + "Barnsley_fern",
  sierpinski: W + "Sierpi%C5%84ski_triangle#Chaos_game",
  pentagon: W + "N-flake#Pentaflake",
  levy: W + "L%C3%A9vy_C_curve",
  vicsek: W + "Vicsek_fractal",
  corners: W + "Chaos_game#Restricted_chaos_game",
  hexaflake: W + "N-flake#Hexaflake",
};
const NONE = Object.keys(ZOOM).filter((k) => ZOOM[k] === null);

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
  await page.addStyleTag({ content: "#speedBubble, #crosshair { visibility: hidden !important; }" });
  await page.waitForFunction(() => typeof setMode === "function" && typeof Platform !== "undefined");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => {
  const step = (i) => (i <= 0 ? setTimeout(r, 120) : requestAnimationFrame(() => step(i - 1)));
  step(n);
}), n);

async function cardOn(page) {
  if (!(await page.evaluate(() => hudVisible))) await page.locator(".hudToggleBtn:visible").first().click();
  await expect(page.locator("#hud")).toBeVisible();
}

// Shows a fractal (FRACTAL_CONFIGS key) or a pattern shape (EXTRA_MODES key) with the card open.
async function show(page, key) {
  const label = await page.evaluate((k) => (FRACTAL_CONFIGS[k] ? fractalLabel(k) : EXTRA_MODES.find((e) => e.key === k).label), key);
  await page.evaluate((k) => (FRACTAL_CONFIGS[k] ? selectFractal(k, { fresh: true }) : setMode(k)), key);
  await cardOn(page);
  await expect(page.locator("#hud .hudName")).toHaveText(label);
  await frames(page);
  return label;
}

// Replaces Platform.openLink with a recorder, so a tap shows what it would open.
const stubOpenLink = (page) => page.evaluate(() => {
  window.__opened = [];
  Platform.openLink = (url) => { window.__opened.push(url); return Promise.resolve(true); };
});

test.describe("the data", () => {
  test("every fractal and pattern shape is in the table, with its link, and the nine without an article have none", async ({ page }) => {
    const data = await page.evaluate(() => ({
      zoom: Object.fromEntries(Object.entries(FRACTAL_CONFIGS).map(([k, c]) => [k, c.wiki ?? null])),
      pattern: Object.fromEntries(EXTRA_MODES.map((m) => [m.key, m.wiki ?? null])),
    }));
    expect(data.zoom).toEqual(ZOOM);
    expect(data.pattern).toEqual(PATTERN);
    expect(NONE.length).toBe(9);
    const links = [...Object.values(ZOOM), ...Object.values(PATTERN)].filter(Boolean);
    expect(links.length).toBe(26);
    for (const u of links) expect(await page.evaluate((u) => isWikipediaUrl(u), u), u).toBe(true);
  });
});

test.describe("the row", () => {
  test("every shape and fractal with an article shows the row, labelled, with its hint, opening its address", async ({ page }) => {
    test.setTimeout(240_000);
    await stubOpenLink(page);
    const hint = await page.evaluate(() => Platform.openLinkHint);
    expect(hint).toBe("Opens in a new tab"); // the web build
    const all = { ...ZOOM, ...PATTERN };
    for (const [key, url] of Object.entries(all)) {
      if (!url) continue;
      const label = await show(page, key);
      const row = page.locator("#hud .hudLearn");
      await expect(row, key).toBeVisible();
      await expect(row, key).toHaveText(`Learn more about ${label} on Wikipedia`);
      await expect(row, key).toHaveAttribute("aria-description", hint);
      expect(await row.evaluate((el) => el.tagName), key).toBe("BUTTON");
      await row.click();
      const opened = await page.evaluate(() => window.__opened.splice(0));
      expect(opened, `${key} opens its address once`).toEqual([url]);
    }
  });

  test("the nine entries with no article, and a key with no entry, have no row", async ({ page }) => {
    test.setTimeout(240_000);
    for (const key of NONE) {
      await show(page, key);
      await expect(page.locator("#hud .hudLearn"), key).toBeHidden();
    }
    // A fractal or shape whose `wiki` is missing hides the row, whatever it showed before.
    await show(page, "Mandelbrot");
    await expect(page.locator("#hud .hudLearn")).toBeVisible();
    await page.evaluate(() => { delete FRACTAL_CONFIGS["Mandelbrot"].wiki; refitHud(); requestRender(); });
    await expect(page.locator("#hud .hudLearn")).toBeHidden();
    await show(page, "koch");
    await expect(page.locator("#hud .hudLearn")).toBeVisible();
    await page.evaluate(() => { delete EXTRA_MODES.find((m) => m.key === "koch").wiki; refitHud(); requestRender(); });
    await expect(page.locator("#hud .hudLearn")).toBeHidden();
  });

  test("the row is the last thing in the card, at least 44 px tall, under Browse places on a fractal", async ({ page }) => {
    await show(page, "Mandelbrot");
    const q = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { y: b.y, b: b.bottom, h: b.height, x: b.x, r: b.right }; };
      const hud = document.getElementById("hud");
      return { hud: r(hud), row: r(hud.querySelector(".hudLearn")), places: r(hud.querySelector(".hudPlaces")),
        events: getComputedStyle(hud.querySelector(".hudLearn")).pointerEvents };
    });
    expect(q.row.h).toBeGreaterThanOrEqual(44);
    expect(q.events).toBe("auto");
    expect(q.row.y).toBeGreaterThanOrEqual(q.places.b - 1);
    expect(q.row.b).toBeLessThanOrEqual(q.hud.b + 1);
    expect(q.row.x).toBeGreaterThanOrEqual(q.hud.x - 9);
    expect(q.row.r).toBeLessThanOrEqual(q.hud.r + 9);
    // A pattern shape has no Browse places button, so the row is the card's last row there.
    await show(page, "hilbert");
    const p = await page.evaluate(() => {
      const hud = document.getElementById("hud");
      return { h: hud.querySelector(".hudLearn").getBoundingClientRect().height, bottom: hud.getBoundingClientRect().bottom - hud.querySelector(".hudLearn").getBoundingClientRect().bottom };
    });
    expect(p.h).toBeGreaterThanOrEqual(44);
    expect(Math.abs(p.bottom)).toBeLessThanOrEqual(3);
  });

  test("the keyboard reaches the row and Enter opens it", async ({ page }) => {
    await stubOpenLink(page);
    await show(page, "tree");
    await page.locator("#hud .hudLearn").focus();
    await expect(page.locator("#hud .hudLearn")).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__opened)).toEqual([PATTERN.tree]);
  });
});

test.describe("opening", () => {
  test("the web build opens the article in a new tab with noopener,noreferrer", async ({ page }) => {
    await page.evaluate(() => { window.__win = []; window.open = (...a) => { window.__win.push(a); return null; }; });
    await show(page, "Newton z³");
    await page.locator("#hud .hudLearn").click();
    expect(await page.evaluate(() => window.__win)).toEqual([[ZOOM["Newton z³"], "_blank", "noopener,noreferrer"]]);
  });

  test("only https://en.wikipedia.org addresses are opened: anything else is refused and nothing opens", async ({ page }) => {
    await page.evaluate(() => { window.__win = []; window.open = (...a) => { window.__win.push(a); return null; }; });
    const bad = [
      "http://en.wikipedia.org/wiki/Mandelbrot_set", "https://fr.wikipedia.org/wiki/Mandelbrot_set", "https://en.m.wikipedia.org/wiki/Mandelbrot_set",
      "https://evil.example/wiki/Mandelbrot_set", "https://en.wikipedia.org.evil.example/", "https://en.wikipedia.org@evil.example/",
      "https://user@en.wikipedia.org/wiki/Mandelbrot_set", "https://user:pw@en.wikipedia.org/", "https://en.wikipedia.org:8443/wiki/Mandelbrot_set",
      "javascript:alert(1)", "data:text/html,hi", "//en.wikipedia.org/wiki/Mandelbrot_set", "en.wikipedia.org/wiki/Mandelbrot_set", "", "not a url", null, undefined, 42,
    ];
    for (const u of bad) {
      expect(await page.evaluate((u) => Platform.openLink(u), u), `${String(u)} refused`).toBe(false);
      expect(await page.evaluate((u) => isWikipediaUrl(u), u), `${String(u)} fails the check`).toBe(false);
    }
    expect(await page.evaluate(() => window.__win), "nothing was opened").toEqual([]);
    expect(await page.evaluate(() => Platform.openLink("https://en.wikipedia.org/wiki/Mandelbrot_set"))).toBe(true);
    expect(await page.evaluate(() => window.__win)).toEqual([["https://en.wikipedia.org/wiki/Mandelbrot_set", "_blank", "noopener,noreferrer"]]);
  });
});

test.describe("larger text", () => {
  // iOS's largest accessibility size is about 3.1 times the default (platform.js / FractalBridgeViewController).
  for (const key of ["sierpinski", "Newton z³", "Burn. Ship", "dragon", "arrowhead"]) {
    test(`the row at 3.1x text on a phone: ${key} stays inside the card, whole and at least 44 px tall`, async ({ page }) => {
      await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "3.1"));
      await show(page, key);
      await frames(page, 3);
      const q = await page.evaluate(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, h: b.height }; };
        const hud = document.getElementById("hud");
        const row = hud.querySelector(".hudLearn");
        const text = hud.querySelector(".hudLearnText");
        return { hud: r(hud), row: r(row), text: r(text), area: r(document.getElementById("canvasArea")),
          rowOverflow: row.scrollHeight - row.clientHeight, hudOverflowX: hud.scrollWidth - hud.clientWidth, hudOverflowY: hud.scrollHeight - hud.clientHeight };
      });
      expect(q.row.h).toBeGreaterThanOrEqual(44);
      expect(q.rowOverflow, "the row's text is not clipped").toBeLessThanOrEqual(1);
      // (The card's own title can be wider than the card at this size -- a long word such as "arrowhead" -- which
      // is not the row's doing, so the card's overflow is not asserted here; the row's own box is.)
      expect(q.row.r, "the row is inside the card's width").toBeLessThanOrEqual(q.hud.r + 9);
      expect(q.text.r).toBeLessThanOrEqual(q.row.r + 1);
      expect(q.row.b).toBeLessThanOrEqual(q.hud.b + 1);
      expect(q.hud.r).toBeLessThanOrEqual(393);
      expect(q.row.b, "the row is on screen").toBeLessThanOrEqual(q.area.b);
    });
  }
});
