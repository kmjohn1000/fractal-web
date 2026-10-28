// The ten solid colors of the eleven pattern shapes (1.52.0). SOLID_COLORS is append-only because share links
// carry the index (`c=`): Green, Autumn, Violet, Ice, Rose, Gold, White stay 0-6, and Blue, Teal and Coral are
// 7-9. The color menu lists them in hue order (SOLID_COLOR_ORDER), by display only; picking one still sets the
// stored index. The color button's pill is a miniature of the shape's real ramp for the picked color (a CSS
// gradient: pillGradient in colormap-picker.js). These checks hold the table and the order, the menu (its
// order, its picks, the keyboard, and its fit on short screens and at larger text), the pill's stops against the
// functions the render uses, share links for every index, that every color lights every shape, and contrast
// floors for the dimmest parts of every ramp. The contrast of what is drawn is checked per shape in
// shape-finish, tree-hexaflake-palette and koch-generations (they iterate over all ten colors).
import { test, expect } from "@playwright/test";

/* global setMode, fernView, vectorColors, SOLID_COLORS, SOLID_COLOR_ORDER, buildShareHash, parseShareHash, applyShareLink, els, mode,
   requestRender, VECTOR_VIEWS, curveRamp, ifsTransformColors, IFS_SYSTEMS, kochShade, hexaflakeShade, updateColorSwatches,
   BACKDROP_CENTER_RGB, TREE_DEPTH_MIN, TREE_LEAN_MIN, TREE_WOOD_RGB */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const SHAPES = ["koch", "tree", "hexaflake", "dragon", "hilbert", "gosper", "arrowhead", "fern", "sierpinski", "levy", "vicsek"];
const CURVES = ["dragon", "hilbert", "gosper", "arrowhead"];
const IFS = ["fern", "sierpinski", "levy", "vicsek"];
const ORIGINAL = [
  ["Green", [70, 190, 90]], ["Autumn", [214, 122, 47]], ["Violet", [148, 100, 214]], ["Ice", [92, 176, 214]],
  ["Rose", [214, 92, 140]], ["Gold", [226, 186, 64]], ["White", [236, 236, 240]],
];
const ADDED = [["Blue", [50, 135, 240]], ["Teal", [30, 160, 136]], ["Coral", [242, 140, 125]]];
// The menu's order: around the hue wheel from red, White last (approved for 1.52.0).
const RAINBOW = ["Rose", "Coral", "Autumn", "Gold", "Green", "Teal", "Ice", "Blue", "Violet", "White"];
const DEFAULTS = { koch: "Ice", tree: "Green", hexaflake: "Gold", dragon: "Autumn", hilbert: "Violet", gosper: "Rose", arrowhead: "Gold",
  fern: "Green", sierpinski: "Violet", levy: "Rose", vicsek: "Gold" };
// The color button of each shape's row.
const BUTTON = (m) => (CURVES.includes(m) ? "#dragonColormapBtn" : IFS.includes(m) ? "#fernColorBtn" : `#${m}ColormapBtn`);
const PILL = (m) => (CURVES.includes(m) ? "#dragonColorSwatch" : IFS.includes(m) ? "#fernColorSwatch" : `#${m}ColorSwatch`);
const MENU_ITEMS = '#colormapMenu [role="menuitemradio"]';

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

// Opens a shape in its default view and waits until it is fully drawn.
async function show(page, m) {
  await page.evaluate((m) => setMode(m), m);
  if (IFS.includes(m)) {
    await page.waitForFunction((m) => fernView.system === m && !fernView.refining && fernView.accepted > 0, m, { timeout: 90_000 });
  }
  await frames(page);
}

const menuNames = (page) => page.locator(MENU_ITEMS).locator(".cmName").allTextContents();

test.describe("the table", () => {
  test("indices 0-6 are unchanged (share links carry them), 7-9 are Blue, Teal and Coral", async ({ page }) => {
    const table = await page.evaluate(() => SOLID_COLORS.map((c) => [c.name, c.rgb]));
    expect(table.slice(0, 7), "Green, Autumn, Violet, Ice, Rose, Gold, White as in 1.51.0").toEqual(ORIGINAL);
    expect(table.slice(7), "the three added colors, appended").toEqual(ADDED);
    expect(table).toHaveLength(10);
  });

  test("the display order is a permutation of the indices and lists the colors in hue order", async ({ page }) => {
    const r = await page.evaluate(() => ({ order: [...SOLID_COLOR_ORDER], names: SOLID_COLOR_ORDER.map((i) => SOLID_COLORS[i].name) }));
    expect([...r.order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.names).toEqual(RAINBOW);
    // It is display only: the stored index of a name does not follow its position (Rose is 4, shown first).
    expect(r.order[0]).toBe(4);
  });

  test("every shape still starts in its own color (the picker thumbnails and links without c= depend on it)", async ({ page }) => {
    const names = await page.evaluate(() => Object.fromEntries(Object.entries(vectorColors).map(([m, i]) => [m, SOLID_COLORS[i].name])));
    expect(names).toEqual(DEFAULTS);
  });
});

test.describe("the color menu", () => {
  for (const m of ["koch", "tree", "hexaflake", "dragon", "gosper", "fern", "vicsek"]) {
    test(`${m}: lists the ten colors in hue order, with only the current one checked`, async ({ page }) => {
      await show(page, m);
      await page.locator(BUTTON(m)).click();
      await expect(page.locator("#colormapMenu")).toHaveClass(/open/);
      expect(await menuNames(page)).toEqual(RAINBOW);
      const checked = await page.locator(MENU_ITEMS).evaluateAll((els) => els.map((e) => [e.getAttribute("aria-checked"), e.classList.contains("active")]));
      const current = RAINBOW.indexOf(DEFAULTS[m]);
      checked.forEach(([aria, active], i) => {
        expect(aria, `row ${i}`).toBe(String(i === current));
        expect(active, `row ${i} active`).toBe(i === current);
      });
      // Each row's swatch is the flat color of its own name.
      const swatches = await page.locator(`${MENU_ITEMS} .cmSwatch`).evaluateAll((els) => els.map((e) => e.style.background));
      const expected = await page.evaluate((names) => names.map((n) => `rgb(${SOLID_COLORS.find((c) => c.name === n).rgb.join(", ")})`), RAINBOW);
      expect(swatches).toEqual(expected);
    });
  }

  // A curve and a dot shape: every swatch sets the INDEX of its color, not its position in the menu.
  for (const m of ["dragon", "levy"]) {
    test(`${m}: clicking each swatch sets that color's index, closes the menu and moves the pill and the label`, async ({ page }) => {
      await show(page, m);
      for (const name of RAINBOW) {
        await page.locator(BUTTON(m)).click();
        await page.locator(MENU_ITEMS, { hasText: name }).click();
        await expect(page.locator("#colormapMenu")).not.toHaveClass(/open/);
        const r = await page.evaluate(([m, name]) => ({ set: vectorColors[m], want: SOLID_COLORS.findIndex((c) => c.name === name), label: (m === "levy" ? els.fernColorBtn : els.dragonColormapBtn).getAttribute("aria-label"),
          others: Object.entries(vectorColors).filter(([k]) => k !== m).map(([k, v]) => `${k}:${v}`).join() }), [m, name]);
        expect(r.set, `${name} sets index ${r.want}`).toBe(r.want);
        expect(r.label).toBe(`Choose color (${name})`);
        // Only this mode's color changed.
        const expectedOthers = await page.evaluate(([m, d]) => Object.keys(vectorColors).filter((k) => k !== m).map((k) => `${k}:${SOLID_COLORS.findIndex((c) => c.name === d[k])}`).join(), [m, DEFAULTS]);
        expect(r.others).toBe(expectedOthers);
        await frames(page);
      }
      // Reopened, the menu checks the last pick (White, the last row) and nothing else.
      await page.locator(BUTTON(m)).click();
      const checked = await page.locator(MENU_ITEMS).evaluateAll((els) => els.map((e) => e.getAttribute("aria-checked")));
      expect(checked).toEqual([...RAINBOW.slice(0, 9).map(() => "false"), "true"]);
    });
  }

  test("the new colors can be picked on every shape and each draws something", async ({ page }) => {
    for (const m of SHAPES) {
      await show(page, m);
      for (const name of ["Blue", "Teal", "Coral"]) {
        await page.locator(BUTTON(m)).click();
        await page.locator(MENU_ITEMS, { hasText: name }).click();
        expect(await page.evaluate((m) => SOLID_COLORS[vectorColors[m]].name, m), `${m}`).toBe(name);
      }
    }
  });

  // (Not Tab: where WebKit's Tab starts after a click on the opener is its own business. The arrow keys, which
  // moved the shape behind the open menu before 1.52.0, now step the focus.)
  test("keyboard: opening focuses the checked row, the arrow keys walk the rows in display order, Enter picks, Escape closes", async ({ page }) => {
    await show(page, "dragon");
    const viewBefore = await page.evaluate(() => ({ ...VECTOR_VIEWS.dragon[0].view }));
    await page.locator("#dragonColormapBtn").click();
    const focused = () => page.evaluate(() => document.activeElement?.querySelector?.(".cmName")?.textContent ?? null);
    expect(await focused(), "the checked row (Autumn) has the focus").toBe("Autumn");
    await page.keyboard.press("ArrowDown");
    expect(await focused(), "next row after Autumn").toBe("Gold");
    await page.keyboard.press("ArrowDown");
    expect(await focused()).toBe("Green");
    await page.keyboard.press("ArrowUp");
    expect(await focused(), "back one row").toBe("Gold");
    await page.keyboard.press("End");
    expect(await focused(), "End: the last row").toBe("White");
    await page.keyboard.press("ArrowDown");
    expect(await focused(), "the rows wrap around").toBe("Rose");
    await page.keyboard.press("ArrowUp");
    expect(await focused(), "wrapping back").toBe("White");
    await page.keyboard.press("Home");
    expect(await focused(), "Home: the first row").toBe("Rose");
    expect(await page.evaluate(() => ({ ...VECTOR_VIEWS.dragon[0].view })), "the arrow keys did not pan the shape behind the menu").toEqual(viewBefore);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#colormapMenu")).not.toHaveClass(/open/);
    expect(await page.evaluate(() => SOLID_COLORS[vectorColors.dragon].name), "Enter picked the focused row (Coral, the one after Rose)").toBe("Coral");
    // The focus goes back to the button that opened the menu.
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("dragonColormapBtn");
    // Escape closes it without picking.
    await page.locator("#dragonColormapBtn").click();
    expect(await focused(), "reopened on the checked row").toBe("Coral");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(page.locator("#colormapMenu")).not.toHaveClass(/open/);
    expect(await page.evaluate(() => SOLID_COLORS[vectorColors.dragon].name), "Escape picks nothing").toBe("Coral");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("dragonColormapBtn");
  });
});

// Ten rows are about 540 px: they fit a 393x852 phone and scroll on the shorter screens (the menu's max-height is the
// space between the safe area's top and its anchor). Whatever the size, the menu stays on screen, never scrolls
// sideways, opens with the checked row in view, and every row can be reached.
test.describe("the color menu on short screens and at larger text", () => {
  const SIZES = [
    { w: 393, h: 852, scale: 1, label: "393x852", fits: true },
    { w: 360, h: 640, scale: 1, label: "360x640" },
    { w: 852, h: 393, scale: 1, label: "landscape 852x393", scrolls: true },
    { w: 667, h: 375, scale: 1, label: "landscape 667x375", scrolls: true },
    // The rows grow little with the text size (their height is a 44 px minimum), so the ten still fit on a tall phone.
    { w: 393, h: 852, scale: 1.5, label: "393x852 at 1.5x text" },
    { w: 393, h: 852, scale: 2, label: "393x852 at 2x text" },
  ];
  for (const s of SIZES) {
    for (const m of ["dragon", "fern"]) {
      test(`${s.label}, ${m}: on screen, row reachable, the checked row in view`, async ({ page }) => {
        await page.setViewportSize({ width: s.w, height: s.h });
        if (s.scale !== 1) await page.evaluate((v) => document.documentElement.style.setProperty("--text-scale", String(v)), s.scale);
        await show(page, m);
        await page.waitForTimeout(250);
        // White is the last row: the hardest one to have in view when the menu opens.
        await page.evaluate((m) => { vectorColors[m] = SOLID_COLORS.findIndex((c) => c.name === "White"); }, m);
        await page.locator(BUTTON(m)).click();
        await expect(page.locator("#colormapMenu")).toHaveClass(/open/);
        await page.waitForTimeout(150);
        const geo = () => page.evaluate(() => {
          const menu = document.getElementById("colormapMenu"), b = menu.getBoundingClientRect();
          const rows = [...menu.querySelectorAll('[role="menuitemradio"]')].map((e) => {
            const q = e.getBoundingClientRect();
            return { name: e.querySelector(".cmName").textContent, top: q.top, bottom: q.bottom, inView: q.top >= b.top - 1 && q.bottom <= b.bottom + 1 };
          });
          return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, vw: innerWidth, vh: innerHeight, rows, scrolls: menu.scrollHeight > menu.clientHeight + 1,
            noSide: menu.scrollWidth <= menu.clientWidth + 1, overflowY: getComputedStyle(menu).overflowY, scrollTop: menu.scrollTop };
        });
        const g = await geo();
        expect(g.top, "top edge on screen").toBeGreaterThanOrEqual(0);
        expect(g.bottom, "bottom edge on screen").toBeLessThanOrEqual(g.vh);
        expect(g.left).toBeGreaterThanOrEqual(0);
        expect(g.right).toBeLessThanOrEqual(g.vw);
        expect(g.noSide, "no sideways scroll").toBe(true);
        expect(g.rows.find((r) => r.name === "White").inView, "the checked row (White, last) is scrolled into view on open").toBe(true);
        if (s.fits) expect(g.scrolls, "ten rows fit without scrolling").toBe(false);
        if (s.scrolls) expect(g.scrolls, "scrolls here").toBe(true);
        if (g.scrolls) {
          expect(g.overflowY).toMatch(/auto|scroll/);
          // Scrolled to the top the first row is in view, and the last row at the bottom.
          await page.evaluate(() => { document.getElementById("colormapMenu").scrollTop = 0; });
          expect((await geo()).rows[0].inView, "Rose reachable at the top").toBe(true);
          await page.evaluate(() => { const m = document.getElementById("colormapMenu"); m.scrollTop = m.scrollHeight; });
          expect((await geo()).rows[9].inView, "White reachable at the bottom").toBe(true);
        } else {
          expect(g.rows.every((r) => r.inView), "every row in view").toBe(true);
        }
        // A row from the middle can still be picked.
        await page.evaluate(() => document.querySelectorAll('#colormapMenu [role="menuitemradio"]')[5].scrollIntoView({ block: "nearest" }));
        await page.locator(MENU_ITEMS, { hasText: "Teal" }).click();
        expect(await page.evaluate((m) => SOLID_COLORS[vectorColors[m]].name, m)).toBe("Teal");
      });
    }
  }
});

// ------------------------------------------------------------------ the pill

// The stops of a pill's gradient: [[r, g, b], position %] in order.
const pillStops = (page, m) => page.evaluate((sel) => {
  const bg = document.querySelector(sel).style.background;
  const stops = [...bg.matchAll(/rgb\((\d+), (\d+), (\d+)\)\s+([\d.]+)%/g)].map((x) => [[+x[1], +x[2], +x[3]], +x[4]]);
  return { bg, stops };
}, PILL(m));

const rgbOf = (css) => css.match(/\d+/g).map(Number);
const lumSum = ([r, g, b]) => r + g + b;

test.describe("the color button's pill is a miniature of the shape's ramp", () => {
  for (const m of SHAPES) {
    test(`${m}: its stops are the render's ramp ends for every one of the ten colors`, async ({ page }) => {
      await show(page, m);
      for (let ci = 0; ci < 10; ci++) {
        await page.evaluate(([m, ci]) => { vectorColors[m] = ci; updateColorSwatches(); }, [m, ci]);
        const { bg, stops } = await pillStops(page, m);
        const name = await page.evaluate((ci) => SOLID_COLORS[ci].name, ci);
        const base = await page.evaluate((ci) => SOLID_COLORS[ci].rgb, ci);
        const msg = `${name}: ${bg}`;
        expect(bg, msg).toMatch(/^linear-gradient\(/);
        expect(stops.length, msg).toBeGreaterThanOrEqual(2);
        expect(stops[0][1], msg).toBe(0);
        expect(stops[stops.length - 1][1], msg).toBe(100);
        const colors = stops.map((s) => s[0]);
        if (CURVES.includes(m)) {
          const ramp = (await page.evaluate((ci) => curveRamp(ci), ci)).map(rgbOf);
          expect(stops.length, msg).toBe(3);
          expect(colors[0], `${msg}: start of the ramp`).toEqual(ramp[0]);
          expect(colors[1], `${msg}: middle of the ramp`).toEqual(ramp[Math.floor(ramp.length / 2)]);
          expect(colors[2], `${msg}: end of the ramp`).toEqual(ramp[ramp.length - 1]);
          if (name === "White") expect(lumSum(colors[2]), `${msg}: White runs dim to bright`).toBeGreaterThan(lumSum(colors[0]) + 40);
          else {
            // A chromatic curve turns hue between its ends: the end colors are far apart.
            expect(Math.hypot(...colors[0].map((v, q) => v - colors[2][q])), `${msg}: the two ends differ`).toBeGreaterThan(25);
          }
        } else if (IFS.includes(m)) {
          const want = await page.evaluate(([m, ci]) => {
            const offsets = IFS_SYSTEMS[m].hueOffsets;
            return ifsTransformColors(m, ci).map((c, i) => [offsets[i], c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c.map(Math.round));
          }, [m, ci]);
          expect(colors, `${msg}: one stop per transform, by hue offset`).toEqual(want);
        } else if (m === "koch") {
          const want0 = await page.evaluate((ci) => kochShade(SOLID_COLORS[ci].rgb, 0, 4), ci);
          expect(colors[0], `${msg}: the level-0 triangle's shade`).toEqual(want0);
          expect(colors[colors.length - 1], `${msg}: the finest generation is the picked color`).toEqual(base);
          expect(lumSum(colors[0]), `${msg}: darkest first`).toBeLessThan(lumSum(colors[colors.length - 1]));
        } else if (m === "hexaflake") {
          const want0 = await page.evaluate((ci) => hexaflakeShade(SOLID_COLORS[ci].rgb, 0), ci);
          expect(colors[0], `${msg}: the outermost level's shade`).toEqual(want0);
          expect(colors[colors.length - 1], `${msg}: the picked color`).toEqual(base);
          expect(lumSum(colors[0]), `${msg}: darkest first`).toBeLessThan(lumSum(colors[colors.length - 1]));
        } else {
          // tree: the wood first only when the picked color is Green; the picked color last.
          expect(colors[colors.length - 1], msg).toEqual(base);
          const wood = await page.evaluate(() => TREE_WOOD_RGB);
          if (name === "Green") expect(colors[0], `${msg}: wood first`).toEqual(wood);
          else {
            expect(colors[0], `${msg}: a shade of the picked color, no wood`).toEqual(base.map((v) => Math.round(v * 0.72)));
            expect(colors.length, `${msg}: plain two-stop shading`).toBe(2);
          }
        }
        // The label still names the color.
        const label = await page.evaluate((sel) => document.querySelector(sel).closest("button").getAttribute("aria-label"), PILL(m));
        expect(label).toBe(`Choose color (${name})`);
      }
    });
  }

  test("the stops are a gradient, not an image, and the pill keeps its size (22x10 css px) for every shape and color", async ({ page }) => {
    for (const m of SHAPES) {
      await show(page, m);
      for (const ci of [0, 6, 7, 8, 9]) {
        await page.evaluate(([m, ci]) => { vectorColors[m] = ci; updateColorSwatches(); }, [m, ci]);
        const r = await page.evaluate((sel) => {
          const el = document.querySelector(sel), q = el.getBoundingClientRect(), cs = getComputedStyle(el);
          return { w: q.width, h: q.height, image: cs.backgroundImage };
        }, PILL(m));
        expect(r.w, `${m}: width`).toBe(22);
        expect(r.h, `${m}: height`).toBe(10);
        expect(r.image, `${m}: a CSS gradient (vector, crisp at 1x, 2x and 3x), not a bitmap`).toMatch(/^linear-gradient\(/);
        expect(r.image).not.toMatch(/url\(/);
      }
    }
  });

  test("it follows a pick from the menu, and the curve that is shown", async ({ page }) => {
    await show(page, "dragon");
    const before = (await pillStops(page, "dragon")).bg;
    await page.locator("#dragonColormapBtn").click();
    await page.locator(MENU_ITEMS, { hasText: "Blue" }).click();
    const blue = await pillStops(page, "dragon");
    expect(blue.bg).not.toBe(before);
    const ramp = (await page.evaluate(() => curveRamp(SOLID_COLORS.findIndex((c) => c.name === "Blue")))).map(rgbOf);
    expect(blue.stops[0][0]).toEqual(ramp[0]);
    // Another curve has its own color, and the shared pill follows it.
    await show(page, "gosper");
    const gosper = await pillStops(page, "gosper");
    const gosperRamp = (await page.evaluate(() => curveRamp(vectorColors.gosper))).map(rgbOf);
    expect(gosper.stops[0][0], "Gosper's own start color").toEqual(gosperRamp[0]);
    expect(gosper.bg).not.toBe(blue.bg);
    await show(page, "dragon");
    expect((await pillStops(page, "dragon")).bg, "back on the dragon: its Blue again").toBe(blue.bg);
    // And the dot row's pill follows the shape shown: a different number of stops.
    await show(page, "levy");
    expect((await pillStops(page, "levy")).stops).toHaveLength(2);
    await show(page, "vicsek");
    expect((await pillStops(page, "vicsek")).stops).toHaveLength(5);
  });
});

// ------------------------------------------------------------------ share links

test.describe("share links", () => {
  for (const m of ["koch", "tree", "hexaflake", "dragon", "arrowhead", "fern", "vicsek"]) {
    test(`${m}: c=0 to c=9 round-trip, c=10 and above are rejected`, async ({ page }) => {
      await show(page, m);
      const r = await page.evaluate((m) => {
        const out = { ok: [], built: [] };
        for (let ci = 0; ci < 10; ci++) {
          vectorColors[m] = ci;
          const hash = buildShareHash();
          out.built.push(new RegExp(`[?&#]c=${ci}(&|$)`).test(hash));
          const st = parseShareHash(hash);
          out.ok.push(st && st.mode === m ? st.colorIndex : st);
        }
        // Out of range: a hand-edited c.
        vectorColors[m] = 0;
        const base = buildShareHash().replace(/([?&#])c=\d+/, "$1c=__");
        out.bad = {};
        for (const v of ["10", "11", "99", "-1", "1.5", "x"]) out.bad[v] = (() => { const st = parseShareHash(base.replace("c=__", `c=${v}`)); return st === null ? null : st.colorIndex; })();
        out.default = vectorColors[m];
        return out;
      }, m);
      expect(r.built, "the link carries the index").toEqual(Array(10).fill(true));
      expect(r.ok, "every index 0-9 parses back to itself").toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (const [v, got] of Object.entries(r.bad)) {
        // The hexaflake is lenient (1.42.0 links carried a different c): a bad color falls back to its own color. Every other shape rejects the link.
        if (m === "hexaflake") expect(got, `c=${v}`).toBe(r.default);
        else expect(got, `c=${v} is rejected`).toBeNull();
      }
    });
  }

  test("opening a link with c=7, 8, 9 sets that color on a curve and a dot shape", async ({ page }) => {
    for (const [m, ci, name] of [["gosper", 7, "Blue"], ["gosper", 8, "Teal"], ["levy", 9, "Coral"], ["fern", 8, "Teal"]]) {
      // buildShareHash describes the shape on screen: show it, set the color, build the link ...
      await show(page, m);
      const link = await page.evaluate((ci) => { vectorColors[mode] = ci; return buildShareHash(); }, ci);
      expect(link).toMatch(new RegExp(`[?&#]c=${ci}(&|$)`));
      // ... then open it from another shape, with this shape back on a different color.
      await show(page, m === "gosper" ? "dragon" : "vicsek");
      await page.evaluate((m) => { vectorColors[m] = 0; }, m);
      await page.evaluate((h) => applyShareLink(`https://example.org/${h}`), link);
      const seen = await page.evaluate(() => ({ mode, name: SOLID_COLORS[vectorColors[mode]].name }));
      expect(seen, link).toEqual({ mode: m, name });
      const pill = await pillStops(page, m);
      expect(pill.stops.length, "the pill shows the opened color's ramp").toBeGreaterThanOrEqual(2);
    }
  });

  test("links made before 1.52.0 (c=0 to c=6) open as they did", async ({ page }) => {
    const names = ["Green", "Autumn", "Violet", "Ice", "Rose", "Gold", "White"];
    for (let ci = 0; ci < 7; ci++) {
      await page.evaluate((ci) => applyShareLink(`https://example.org/#v=1&m=hilbert&x=0&y=0&s=1&r=0&dp=4&c=${ci}`), ci);
      expect(await page.evaluate(() => ({ mode, name: SOLID_COLORS[vectorColors.hilbert].name })), `c=${ci}`).toEqual({ mode: "hilbert", name: names[ci] });
    }
  });
});

// ------------------------------------------------------------------ every color on every shape

test.describe("every color lights every shape", () => {
  for (const m of SHAPES) {
    test(`${m}: all ten colors draw at least 500 lit pixels`, async ({ page }) => {
      await show(page, m);
      for (let ci = 0; ci < 10; ci++) {
        await page.evaluate(([m, ci]) => { vectorColors[m] = ci; updateColorSwatches(); requestRender(); }, [m, ci]);
        if (IFS.includes(m)) await page.waitForFunction((m) => fernView.system === m && !fernView.refining && fernView.accepted > 0, m, { timeout: 90_000 });
        await frames(page);
        await frames(page);
        const lit = await page.evaluate((m) => {
          const canvas = VECTOR_VIEWS[m][1];
          const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let n = 0;
          for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 150) n++;
          return n;
        }, m);
        const name = await page.evaluate((ci) => SOLID_COLORS[ci].name, ci);
        expect(lit, `${name}: lit pixels`).toBeGreaterThan(500);
      }
    });
  }
});

// ------------------------------------------------------------------ contrast floors

// The dimmest part of every ramp against the backdrop's center color (a WCAG luminance ratio, a proxy for
// visibility), worked out from the functions the render uses. Measured at 1.52.0: the curves' ramps never fall under
// 4.7:1 (Violet is the lowest of the old seven) and the new colors are 5.5 (Blue), 5.8 (Teal) and 7.8 (Coral);
// the dot shapes' dimmest transform is over 4.2 (Violet), with Blue 4.7, Teal 5.4 and Coral 7.5; the Koch level-0
// shade is over 2.7 (Blue 3.05), the hexaflake's outermost level over 1.39 (Violet; Blue 1.48) and the tree's darkest
// face over 1.5 (Blue 1.63). The drawn pixels are held to their own floors in shape-finish, koch-generations and
// tree-hexaflake-palette.
test.describe("contrast floors, every color", () => {
  test("the dimmest part of each ramp holds against the backdrop", async ({ page }) => {
    const rows = await page.evaluate(() => {
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const Y = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const bg = Y(BACKDROP_CENTER_RGB);
      const ratio = (c) => (Y(c) + 0.05) / (bg + 0.05);
      const parse = (s) => s.match(/\d+/g).map(Number);
      return SOLID_COLORS.map((c, ci) => {
        const base = c.rgb;
        return {
          name: c.name,
          curve: Math.min(...curveRamp(ci).map(parse).map(ratio)),
          dots: Math.min(...["fern", "sierpinski", "levy", "vicsek"].flatMap((k) => ifsTransformColors(k, ci).map(ratio))),
          koch: ratio(kochShade(base, 0, 4)),
          hexaflake: Math.min(ratio(hexaflakeShade(base, 0)), ratio(hexaflakeShade(base, 5))),
          tree: ratio(base.map((v) => v * TREE_DEPTH_MIN * TREE_LEAN_MIN)),
        };
      });
    });
    expect(rows).toHaveLength(10);
    for (const r of rows) {
      expect(r.curve, `${r.name} curves`).toBeGreaterThan(4.5);
      expect(r.dots, `${r.name} dots`).toBeGreaterThan(4.0);
      expect(r.koch, `${r.name} Koch level 0`).toBeGreaterThan(2.5);
      expect(r.hexaflake, `${r.name} hexaflake`).toBeGreaterThan(1.35);   // tree-hexaflake-palette's floor for the drawn outer level
      expect(r.tree, `${r.name} tree`).toBeGreaterThan(1.45);
    }
  });
});
