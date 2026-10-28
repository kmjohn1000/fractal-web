// The info card (#hud, toggled by the info button) of the eleven pattern shapes carries a short
// description between its title and the depth line: two lines of text and, for six shapes with a
// confirmed maker and year, a quiet credit line (SHAPE_INFO in fractal-defs.js). These checks hold
// that to its promises: the exact words (this file keeps its own copy of the table, so a changed
// string fails), the credit for exactly six shapes, nothing new on the escape-time fractals' cards,
// the card staying inside the canvas area, clear of the rotation compass and above the middle of
// the canvas on every screen size and at larger text sizes (the description shortens or goes away
// where it would not fit: fitHudAbout in render-layout.js), the depth line, "(+N from zoom)", the
// scale bar and the Browse places button still working, and no DOM churn while nothing changes.
// Baselines of the shapes themselves (the card hidden) are in app.spec.mjs.
import { test, expect } from "@playwright/test";

/* global setMode, selectFractal, fernView, kochView, treeView, hudVisible, requestRender, activeVectorTarget, mode, enterDual,
   dualActive, EXTRA_MODES, SHAPE_INFO, renderPending, isIfsMode */

const HIDE_TRANSIENTS = "#speedBubble, #crosshair { visibility: hidden !important; }";

// The approved wording, held here independently of the app's table.
const INFO = {
  koch: ["Each side is replaced by four sides, each a third as long, again and again.",
    "The border of the flake grows but its area stays finite. Dimension 1.26.", "Koch curve, 1904"],
  tree: ["Each square supports two smaller squares that meet at a right angle.",
    "Together, the two small squares have exactly the area of the big one.", "Bosman, 1942"],
  hexaflake: ["Every hexagon becomes seven new ones, each a third the size: one in the center with six around it.",
    "Dimension 1.77.", null],
  dragon: ["Models folding a strip of paper in half again and again, then opening it with every fold at a right angle.",
    "It never crosses itself, only touches at corners. It fills a patch of the plane: dimension 2.", null],
  hilbert: ["One unbroken line drawn into each cell of a grid, and each level splits every cell into four.",
    "Taken to the limit, it fills the whole square. Dimension 2.", "Hilbert, 1891"],
  gosper: ["Every segment becomes seven shorter ones, turned and flipped to snake through a hexagon.",
    "The line fills a ragged, flower-like region. Dimension 2.", null],
  arrowhead: ["Every line becomes three lines half as long; the zigzag closes in on the Sierpinski triangle.",
    "One unbroken line draws it all. Dimension 1.58.", null],
  fern: ["Four simple rules, chosen by chance, plot dot after dot until a fern appears.",
    "Each leaflet is a smaller, slightly bent copy of the whole fern.", "Barnsley, 1988"],
  sierpinski: ["Jump halfway to a corner chosen at random, over and over. A triangle with holes appears.",
    "This is the “chaos game”. Dimension 1.58.", "Sierpinski, 1915"],
  levy: ["Two rules, each shrinking and turning by 45 degrees, draw a C made of smaller Cs.",
    "The curve fills an area. Dimension 2.", null],
  vicsek: ["A square becomes a cross of five squares, each a third the size, again and again.",
    "Dimension 1.46.", "Vicsek, 1983"],
};
const SHAPES = Object.keys(INFO);
const CREDITED = ["koch", "tree", "hilbert", "fern", "sierpinski", "vicsek"];
const ESCAPE_TIME = ["Mandelbrot", "Nova", "Julia:Spiral", "Newton z³"];

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

const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => {
  const step = (i) => (i <= 0 ? setTimeout(r, 120) : requestAnimationFrame(() => step(i - 1)));
  step(n);
}), n);

// Opens the info card (the toolbar's button for the mode on screen) if it is closed.
async function cardOn(page) {
  if (!(await page.evaluate(() => hudVisible))) await page.locator(".hudToggleBtn:visible").first().click();
  await expect(page.locator("#hud")).toBeVisible();
}

// Shows a pattern shape with the card open. settle waits for its picture to be final (every dot
// plotted); the layout checks don't need that.
async function showShape(page, m, { settle = false } = {}) {
  await page.evaluate((m) => setMode(m), m);
  await cardOn(page);
  const label = await page.evaluate((m) => EXTRA_MODES.find((e) => e.key === m).label, m);
  await expect(page.locator("#hud .hudName")).toHaveText(label);
  if (settle) {
    await page.waitForFunction(() => !renderPending && (isIfsMode(mode) ? !fernView.refining && fernView.accepted > 0 : !(mode === "koch" && kochView.growing)),
      null, { timeout: 90_000 });
  }
  await frames(page);
}

// Everything the layout checks need, in viewport coordinates.
function measure(page) {
  return page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const hud = document.getElementById("hud");
    const area = document.getElementById("canvasArea");
    const canvas = [...area.querySelectorAll("canvas")].find((c) => c.offsetWidth > 0);
    const parts = {};
    for (const sel of [".hudName", ".hudAbout", ".hudAboutLine", ".hudCredit", ".hudPlain", ".hudScale", ".hudStats", ".hudPlaces"]) {
      const el = hud.querySelector(sel);
      if (el && el.offsetParent !== null) parts[sel] = r(el);
    }
    // The compass the view's rotation has shown (its position is set when it first shows).
    const compass = [...document.querySelectorAll(".compass")].find((c) => c.style.left);
    // Where the shape's lit pixels are centered (rows and columns with a few lit pixels).
    const g = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let top = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      let lit = 0;
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (Math.max(g.data[i], g.data[i + 1], g.data[i + 2]) > 100) lit++;
      }
      if (lit >= 3) { if (top < 0) top = y; bottom = y; }
    }
    const cr = r(canvas);
    return {
      hud: r(hud), area: r(area), canvas: cr, parts, compass: compass ? r(compass) : null,
      level: hud.dataset.about ?? null, overflowX: hud.scrollWidth - hud.clientWidth, overflowY: hud.scrollHeight - hud.clientHeight,
      litMidY: top < 0 ? null : cr.y + ((top + bottom) / 2) * (cr.h / canvas.height),
      aboutShown: !!(parts[".hudAbout"] && parts[".hudAboutLine"]),
    };
  });
}

const intersects = (a, b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

// A rotation shows the compass, and adds the rotation text to the card's plain line.
async function turn(page) {
  await page.evaluate(() => { activeVectorTarget().v.view.rotation = 1; requestRender(); });
  await expect(page.locator(".compass.shown")).toHaveCount(1);
}

test.describe("the description", () => {
  test("each shape's card holds exactly the approved two lines, and a credit for exactly six", async ({ page }) => {
    test.setTimeout(240_000);
    for (const m of SHAPES) {
      await showShape(page, m);
      const lines = page.locator("#hud .hudAboutLine");
      await expect(lines, m).toHaveCount(2);
      expect(await lines.nth(0).evaluate((e) => e.textContent), `${m} line 1`).toBe(INFO[m][0]);
      expect(await lines.nth(1).evaluate((e) => e.textContent), `${m} line 2`).toBe(INFO[m][1]);
      await expect(lines.nth(0), m).toBeVisible();
      await expect(lines.nth(1), m).toBeVisible();
      const credit = page.locator("#hud .hudCredit");
      if (CREDITED.includes(m)) {
        await expect(credit, `${m} credit`).toBeVisible();
        expect(await credit.evaluate((e) => e.textContent), `${m} credit text`).toBe(INFO[m][2]);
      } else {
        await expect(credit, `${m} has no credit`).toBeHidden();
        expect(await credit.evaluate((e) => e.textContent), `${m} credit text is empty`).toBe("");
      }
      // Description above the depth line, which is above the scale bar.
      const p = (await measure(page)).parts;
      expect(p[".hudName"].b, `${m}: title above the description`).toBeLessThanOrEqual(p[".hudAbout"].y + 1);
      expect(p[".hudAbout"].b, `${m}: description above the depth line`).toBeLessThanOrEqual(p[".hudPlain"].y + 1);
      expect(p[".hudPlain"].b, `${m}: depth line above the scale bar`).toBeLessThanOrEqual(p[".hudScale"].y + 1);
    }
  });

  test("the app's table is the same as the approved one (and nothing else is credited)", async ({ page }) => {
    const table = await page.evaluate(() => SHAPE_INFO);
    expect(Object.keys(table).sort()).toEqual([...SHAPES].sort());
    // Exactly the six confirmed credits, no others.
    expect(SHAPES.filter((m) => INFO[m][2])).toEqual(CREDITED);
    expect(Object.keys(table).filter((m) => table[m].credit).sort()).toEqual([...CREDITED].sort());
    for (const m of SHAPES) {
      expect(table[m].lines, m).toEqual([INFO[m][0], INFO[m][1]]);
      expect(table[m].credit ?? null, m).toBe(INFO[m][2]);
    }
  });

  test("switching shapes, and going to a fractal and back, updates the text", async ({ page }) => {
    await showShape(page, "koch");
    expect(await page.locator("#hud .hudAboutLine").first().evaluate((e) => e.textContent)).toBe(INFO.koch[0]);
    await showShape(page, "tree");
    expect(await page.locator("#hud .hudAboutLine").first().evaluate((e) => e.textContent)).toBe(INFO.tree[0]);
    await expect(page.locator("#hud .hudCredit")).toHaveText("Bosman, 1942");
    // The two dot shapes that share one view and one canvas.
    await showShape(page, "fern");
    await expect(page.locator("#hud .hudCredit")).toHaveText("Barnsley, 1988");
    await showShape(page, "levy");
    expect(await page.locator("#hud .hudAboutLine").nth(1).evaluate((e) => e.textContent)).toBe(INFO.levy[1]);
    await expect(page.locator("#hud .hudCredit")).toBeHidden();
    // Into an escape-time fractal and out again.
    await page.evaluate(() => selectFractal("Mandelbrot", { fresh: true }));
    await expect(page.locator("#hud .hudName")).toHaveText("Mandelbrot");
    await expect(page.locator("#hud .hudAbout")).toBeHidden();
    await showShape(page, "vicsek");
    await expect(page.locator("#hud .hudAbout")).toBeVisible();
    await expect(page.locator("#hud .hudCredit")).toHaveText("Vicsek, 1983");
  });

  test("the escape-time fractals' cards have none of the new elements", async ({ page }) => {
    for (const name of ESCAPE_TIME) {
      await page.evaluate((n) => selectFractal(n, { fresh: true }), name);
      await cardOn(page);
      await expect(page.locator("#hud .hudName"), name).not.toHaveText("");
      await expect(page.locator("#hud .hudStats"), `${name} still shows its technical line`).toBeVisible();
      for (const sel of [".hudAbout", ".hudAboutLine", ".hudCredit"]) {
        await expect(page.locator(`#hud ${sel}`).first(), `${name}: ${sel}`).toBeHidden();
      }
      expect(await page.evaluate(() => document.getElementById("hud").dataset.about ?? null), `${name}: no fit level`).toBeNull();
      expect(await page.locator("#hud").innerText(), `${name}: no description words`).not.toMatch(/Dimension|Koch|Bosman|Barnsley|Hilbert/);
    }
  });

  test("a dual view's card has none of them either", async ({ page }) => {
    await page.evaluate(() => selectFractal("Mandelbrot", { fresh: true }));
    await cardOn(page);
    await page.evaluate(() => enterDual());
    await page.waitForFunction(() => dualActive);
    await frames(page);
    await expect(page.locator("#hud .hudAbout")).toBeHidden();
    await expect(page.locator("#hud .hudCredit")).toBeHidden();
  });

  test("it is plain text a screen reader reads with the rest of the card, and the card still lets taps through", async ({ page }) => {
    await showShape(page, "hilbert");
    const hidden = await page.evaluate(() => {
      for (let el = document.querySelector("#hud .hudAbout"); el; el = el.parentElement) {
        if (el.getAttribute("aria-hidden") === "true" || el.hasAttribute("inert")) return true;
      }
      return false;
    });
    expect(hidden, "no ancestor hides it from assistive tech").toBe(false);
    const snapshot = await page.locator("#hud").ariaSnapshot();
    expect(snapshot).toContain(INFO.hilbert[0]);
    expect(snapshot).toContain(INFO.hilbert[1]);
    expect(snapshot).toContain("Hilbert, 1891");
    const pe = await page.evaluate(() => ({
      card: getComputedStyle(document.getElementById("hud")).pointerEvents,
      text: getComputedStyle(document.querySelector("#hud .hudAboutLine")).pointerEvents,
      credit: getComputedStyle(document.querySelector("#hud .hudCredit")).pointerEvents,
      button: getComputedStyle(document.querySelector("#hud .hudPlaces")).pointerEvents,
    }));
    expect(pe).toEqual({ card: "none", text: "none", credit: "none", button: "auto" });
  });

  test("nothing in the card is touched while nothing changes", async ({ page }) => {
    await showShape(page, "koch", { settle: true });
    const records = await page.evaluate(async () => {
      let n = 0;
      const mo = new MutationObserver((list) => { n += list.length; });
      mo.observe(document.getElementById("hud"), { subtree: true, childList: true, attributes: true, characterData: true });
      for (let i = 0; i < 20; i++) {
        requestRender();
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => setTimeout(r, 100));
      n += mo.takeRecords().length;
      mo.disconnect();
      return n;
    });
    expect(records, "DOM mutations in the card over 20 idle frames").toBe(0);
  });
});

// The sizes the app is used at. cover: the description is shown in full there; the two landscape
// phones have a canvas only about 270-300 px tall, where even the card without a description
// reaches the middle, so it is left out (the card is as it was before descriptions).
const SCREENS = [
  { name: "393x852 portrait phone", w: 393, h: 852, cover: true },
  { name: "360x640 small phone", w: 360, h: 640, cover: true },
  { name: "852x393 landscape phone", w: 852, h: 393, cover: false },
  { name: "667x375 landscape phone", w: 667, h: 375, cover: false },
  { name: "1280x800 desktop", w: 1280, h: 800, cover: true },
  { name: "820x1180 iPad portrait", w: 820, h: 1180, cover: true },
];

test.describe("layout", () => {
  for (const s of SCREENS) {
    test(`${s.name}: inside the canvas area, clear of the compass, above the middle`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.setViewportSize({ width: s.w, height: s.h });
      for (const m of SHAPES) {
        await showShape(page, m);
        await turn(page); // the compass shows, and the card's plain line gains the rotation text
        await frames(page);
        const q = await measure(page);
        const where = `${m} at ${s.name}`;
        const { hud, area } = q;
        expect(hud.x, `${where}: left margin`).toBeGreaterThanOrEqual(area.x + 8);
        expect(hud.y, `${where}: top margin`).toBeGreaterThanOrEqual(area.y + 8);
        expect(hud.r, `${where}: right margin`).toBeLessThanOrEqual(area.r - 8);
        expect(hud.b, `${where}: bottom margin`).toBeLessThanOrEqual(area.b - 8);
        expect(q.compass, `${where}: the compass is showing`).not.toBeNull();
        expect(intersects(hud, q.compass), `${where}: the card must clear the compass`).toBe(false);
        expect(q.overflowX, `${where}: no horizontal overflow in the card`).toBeLessThanOrEqual(1);
        expect(q.overflowY, `${where}: no vertical overflow in the card`).toBeLessThanOrEqual(1);
        // Never lower than the middle of the canvas area, where the shape is.
        expect(hud.b - area.y, `${where}: card bottom against the middle`).toBeLessThanOrEqual(area.h / 2 + 0.5);
        if (s.cover) {
          expect(q.aboutShown, `${where}: the description is shown`).toBe(true);
          expect(q.level, where).toBe("full");
          await expect(page.locator("#hud .hudAboutLine").nth(1), where).toBeVisible();
        } else {
          expect(q.aboutShown, `${where}: no description on a screen this short`).toBe(false);
          expect(hud.h, `${where}: the card is the size it was without one`).toBeLessThan(140);
        }
        // The depth line (or the point count), the rotation text and the scale bar are all still there.
        const plain = await page.locator("#hud .hudPlain").innerText();
        expect(plain, where).toMatch(/Depth \d+|of [\d,]+ points/);
        expect(plain, `${where}: rotation text`).toMatch(/otat|turn|°/i);
        await expect(page.locator("#hud .hudScaleText"), where).toContainText("across");
        await expect(page.locator("#hud .hudScale"), where).toBeVisible();
      }
    });
  }

  test("393x852: the card ends above the middle of each shape's own picture", async ({ page }) => {
    test.setTimeout(240_000);
    const seen = [];
    for (const m of SHAPES) {
      await showShape(page, m, { settle: true });
      const q = await measure(page);
      expect(q.litMidY, `${m}: the picture is lit`).not.toBeNull();
      seen.push(`${m} card ${Math.round(q.hud.b)} / middle ${Math.round(q.litMidY)}`);
      expect(q.hud.b, `${m}: card bottom ${q.hud.b} must be above the picture's middle ${q.litMidY} (${seen.join("; ")})`).toBeLessThanOrEqual(q.litMidY);
    }
  });

  test("the depth line, the points line, '(+N from zoom)' and the scale bar are all still on the card", async ({ page }) => {
    await showShape(page, "tree", { settle: true });
    expect(await page.locator("#hud .hudPlain").innerText()).toMatch(/^Depth \d+$/);
    await page.evaluate(() => { Object.assign(treeView.view, { cx: -2.2, cy: 3.0, halfHeight: 1 / 300, rotation: 0 }); requestRender(); });
    await expect(page.locator("#hud .hudPlain")).toContainText(/Depth \d+ \(\+\d+ from zoom\)/);
    await expect(page.locator("#hud .hudScale")).toBeVisible();
    const q = await measure(page);
    expect(q.aboutShown).toBe(true);
    expect(q.hud.b).toBeLessThanOrEqual(q.area.y + q.area.h / 2 + 0.5);
    await showShape(page, "fern", { settle: true });
    expect(await page.locator("#hud .hudPlain").innerText()).toMatch(/^[\d,]+ of [\d,]+ points$/);
    await expect(page.locator("#hud .hudScaleText")).toContainText("across");
  });

  test("Browse places is still tappable (nothing covers it) and opens the Places sheet", async ({ page }) => {
    await showShape(page, "koch", { settle: true });
    const probe = await page.evaluate(() => {
      const b = document.querySelector("#hud .hudPlaces");
      const rb = b.getBoundingClientRect();
      const top = document.elementFromPoint(rb.x + rb.width / 2, rb.y + rb.height / 2);
      const about = document.querySelector("#hud .hudAbout").getBoundingClientRect();
      const card = document.getElementById("hud").getBoundingClientRect();
      return { onButton: top === b, height: rb.height, aboveButton: about.bottom <= rb.top + 1, insideCard: rb.bottom <= card.bottom + 1 && rb.right <= card.right + 1 && rb.x >= card.x - 1 };
    });
    expect(probe.onButton, "the button is the topmost element at its center").toBe(true);
    expect(probe.height, "a 44 px tap target").toBeGreaterThanOrEqual(44);
    expect(probe.aboveButton, "the description ends above the button").toBe(true);
    expect(probe.insideCard).toBe(true);
    await page.locator("#hud .hudPlaces").click();
    await expect(page.locator("#placesSheet")).toHaveClass(/open/);
  });
});

test.describe("larger text", () => {
  for (const scale of [1.5, 2]) {
    test(`${scale}x text size: nothing overflows the card, it stays inside, clear of the compass and above the middle`, async ({ page }) => {
      test.setTimeout(240_000);
      await page.evaluate((s) => document.documentElement.style.setProperty("--text-scale", String(s)), scale);
      const levels = {};
      for (const m of SHAPES) {
        await showShape(page, m);
        await turn(page);
        await frames(page, 3);
        const q = await measure(page);
        const where = `${m} at ${scale}x`;
        levels[m] = q.level;
        expect(q.overflowX, `${where}: no horizontal overflow`).toBeLessThanOrEqual(1);
        expect(q.overflowY, `${where}: no vertical overflow`).toBeLessThanOrEqual(1);
        // Every piece of the card is inside the card.
        for (const [sel, p] of Object.entries(q.parts)) {
          expect(p.x, `${where}: ${sel} left`).toBeGreaterThanOrEqual(q.hud.x - 1);
          expect(p.r, `${where}: ${sel} right`).toBeLessThanOrEqual(q.hud.r + 1);
          expect(p.y, `${where}: ${sel} top`).toBeGreaterThanOrEqual(q.hud.y - 1);
          expect(p.b, `${where}: ${sel} bottom`).toBeLessThanOrEqual(q.hud.b + 1);
        }
        expect(q.hud.x, `${where}: left margin`).toBeGreaterThanOrEqual(q.area.x + 8);
        expect(q.hud.r, `${where}: right margin`).toBeLessThanOrEqual(q.area.r - 8);
        expect(intersects(q.hud, q.compass), `${where}: clear of the compass`).toBe(false);
        // Above the middle, unless the card without a description is already lower than that (then it has none).
        if (q.level !== "none") expect(q.hud.b - q.area.y, `${where}: above the middle of the canvas area`).toBeLessThanOrEqual(q.area.h / 2 + 0.5);
        // Whatever level of description fits, a credit only ever shows with the full one.
        if (q.level !== "full") await expect(page.locator("#hud .hudCredit"), where).toBeHidden();
        if (q.level === "none") await expect(page.locator("#hud .hudAbout"), where).toBeHidden();
        else await expect(page.locator("#hud .hudAboutLine").first(), where).toBeVisible();
      }
      // The description gives way before it covers the shape: at 2x the full text is not shown everywhere.
      if (scale === 2) expect(Object.values(levels).some((l) => l !== "full"), JSON.stringify(levels)).toBe(true);
    });
  }

  test("shrinking the text again brings the full description back", async ({ page }) => {
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "2"));
    await showShape(page, "dragon");
    await frames(page, 3);
    expect((await measure(page)).level).not.toBe("full");
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "1"));
    await frames(page, 4);
    const q = await measure(page);
    expect(q.level).toBe("full");
    expect(q.aboutShown).toBe(true);
  });
});
