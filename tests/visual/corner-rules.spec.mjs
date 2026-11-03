// Corner Rules (corner-rules.js): a chaos game on a polygon's corners where the next corner is restricted by the
// last pick(s), one picker entry that deals a rule. Plain behavior checks, no screenshots. They hold to:
//   - the dealer: never the rule on screen, every rule comes round, the picker entry and the Another rule button;
//   - what is shown: the rule's name in a chip and on the info card, the button only in this mode;
//   - the share link: the rule (`ru`) beside the seed (`sd`), strict and bounded, a bad value is the default rule;
//   - the sampler against the game itself. The game here is played from each rule's own `allows` function (by
//     rejection), never from the compiled tables. Three checks: the tables (every pair of neighbouring digits of
//     every address the sampler can walk is a pair the rule allows; rule 3: never an opposite pair), the
//     sampler's distribution (total variation distance to the game's, against two games' own distance), and its
//     support, at the opening view and deep zooms, against an oracle that walks the address tree by `allows`;
//   - the Play run: every jump obeys the rule, the seed gives the same jumps, a link with a seed plays that run;
//   - the two-finger twist.
// Run through `npm run test:visual` or by itself with PW_PORT=<port> npx playwright test tests/visual/corner-rules.spec.mjs.
import { test, expect } from "@playwright/test";

/* global CORNER_RULES, DEFAULT_CORNER_RULE, cornerDeal, dealCornerRule, dealCornerRules, setCornerRule, applyCornerRule, compileRule,
   cornerLeaves, cornerSample, ifsData, ifsTransformColors, vectorColors, setMode, fitVectorView, requestRender, fernView,
   fernRenderOpts, seededRandom, mode, els, buildShareHash, parseShareHash, applyShareLink, parseCornerRule, IFS_SYSTEMS,
   startDotRun, depthPlayer, PLAY_SPEEDS, VECTOR_VIEWS, chaosRun, EXTRA_MODES, PICKER_LAYOUT, IFS_STOP_POINTS, vectorViewIsFitted */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const IDS = [1, 2, 3, 4, 5, 6, 7]; // the rules (the first test checks this is all of them, so a new rule is covered everywhere)

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
  await page.waitForFunction(() => typeof setMode === "function" && typeof fernView !== "undefined" && typeof CORNER_RULES !== "undefined");
  await page.evaluate(installHelpers);
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

// Waits for the dot shapes' view to have drawn its points: the render the caller asked for has started (two
// frames), is not refining any more, and the number of points on screen has stopped changing.
async function settle(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForFunction(() => !fernView.refining && fernView.accepted > 0, null, { timeout: 60_000 });
  let last = -1;
  for (let i = 0; i < 100; i++) {
    const now = await page.evaluate(() => fernView.accepted);
    if (now === last) break;
    last = now;
    await page.waitForTimeout(120);
  }
}

// Rule `id` on screen, framed whole, its points drawn.
async function showRule(page, id, view = null) {
  await page.evaluate(([id, view]) => {
    setCornerRule(id); setMode("corners"); fitVectorView("corners");
    if (view) Object.assign(fernView.view, view);
    requestRender();
  }, [id, view]);
  await settle(page);
}

// The helpers the checks use, put on window once (the game, the oracle, the sampler's samples).
function installHelpers() {
  const rule = (id) => CORNER_RULES.find((r) => r.id === id);
  const poly = (n) => Array.from({ length: n }, (_, k) => [Math.sin(2 * Math.PI * k / n), Math.cos(2 * Math.PI * k / n)]);
  const mulberry = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // A histogram of points over a box (x0, x1, y0, y1), GX by GY cells, row 0 at the top.
  const hist = (box, GX, GY) => {
    const h = new Float64Array(GX * GY);
    let n = 0;
    return {
      h, get n() { return n; },
      add(x, y) {
        const i = Math.floor((x - box[0]) / (box[1] - box[0]) * GX), j = Math.floor((box[3] - y) / (box[3] - box[2]) * GY);
        if (i < 0 || i >= GX || j < 0 || j >= GY) return false;
        h[j * GX + i]++; n++;
        return true;
      },
    };
  };
  // The game itself, from the rule's own `allows` (rejection: pick again until the corner is allowed).
  const game = (id, jumps, seed, add) => {
    const r = rule(id), V = poly(r.n), rnd = mulberry(seed);
    let x = 0, y = 0, p = -1, q = -1;
    for (let i = 0; i < jumps; i++) {
      let k;
      do { k = Math.floor(rnd() * r.n); } while (!r.allows(k, p, q, r.n));
      x = (x + V[k][0]) / 2; y = (y + V[k][1]) / 2; q = p; p = k;
      if (i >= 30) add(x, y);
    }
  };
  // The sampler's own samples for the rule on screen: its leaves for the box, then `count` points through them,
  // as runSlice makes them. Calls add(x, y) for each.
  const sample = (box, count, add) => {
    const ifs = ifsData("corners"), mach = ifs.machine, n = mach.n;
    const cols = ifsTransformColors("corners", vectorColors.corners);
    const baseRGB = new Float32Array(ifs.base.length / 2 * 3);
    for (let i = 0; i < ifs.base.length / 2; i++) {
      for (let q = 0; q < n; q++) {
        const w = ifs.baseMix[i * n + q];
        baseRGB[i * 3] += w * cols[q][0]; baseRGB[i * 3 + 1] += w * cols[q][1]; baseRGB[i * 3 + 2] += w * cols[q][2];
      }
    }
    const leaves = cornerLeaves(ifs, box, cols), total = leaves.cumWeights[leaves.cumWeights.length - 1];
    for (let i = 0; i < count; i++) {
      const r = Math.random() * total;
      let lo = 0, hi = leaves.cumWeights.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (leaves.cumWeights[mid] < r) lo = mid + 1; else hi = mid; }
      cornerSample(mach, leaves.states[lo], ifs.base, baseRGB, cols, ifs.transforms, mach.out);
      const o = mach.out, m = leaves.maps[lo];
      add(m[0] * o[0] + m[1] * o[1] + m[4], m[2] * o[0] + m[3] * o[1] + m[5]);
    }
    return leaves.maps.length;
  };
  // The oracle: the cells (GX by GY over the box) that the game's points can reach. It walks the address tree
  // newest pick first, through `allows` alone (a pick k_i is allowed after p = k_{i+1}, q = k_{i+2}), pruning the
  // pieces that miss the box, and marks a cell when a piece is no bigger than one.
  const oracle = (id, box, GX, GY) => {
    const r = rule(id), n = r.n, V = poly(n);
    const hx0 = Math.min(...V.map((v) => v[0])), hx1 = Math.max(...V.map((v) => v[0]));
    const hy0 = Math.min(...V.map((v) => v[1])), hy1 = Math.max(...V.map((v) => v[1]));
    const cell = Math.max((box[1] - box[0]) / GX, (box[3] - box[2]) / GY), hullDiag = Math.hypot(hx1 - hx0, hy1 - hy0);
    const lit = new Uint8Array(GX * GY);
    // a piece: x = tx + s * y, y in the polygon's box; a = the oldest pick so far, b = the one after it (newer)
    const stack = [{ s: 1, tx: 0, ty: 0, a: -1, b: -1, depth: 0 }];
    let pieces = 0;
    while (stack.length) {
      const nd = stack.pop();
      const x0 = nd.tx + nd.s * hx0, x1 = nd.tx + nd.s * hx1, y0 = nd.ty + nd.s * hy0, y1 = nd.ty + nd.s * hy1;
      if (x1 < box[0] || x0 > box[1] || y1 < box[2] || y0 > box[3]) continue;
      if (nd.s * hullDiag <= cell || nd.depth >= 60) {
        const i = Math.floor(((x0 + x1) / 2 - box[0]) / (box[1] - box[0]) * GX), j = Math.floor((box[3] - (y0 + y1) / 2) / (box[3] - box[2]) * GY);
        if (i >= 0 && i < GX && j >= 0 && j < GY) lit[j * GX + i] = 1;
        pieces++;
        continue;
      }
      for (let c = 0; c < n; c++) {
        if (nd.a >= 0 && !r.allows(nd.a, c, -1, n)) continue;            // the pick before c, after c
        if (nd.b >= 0 && !r.allows(nd.b, nd.a, c, n)) continue;          // the one before that, after nd.a and c
        stack.push({ s: nd.s / 2, tx: nd.tx + nd.s * V[c][0] / 2, ty: nd.ty + nd.s * V[c][1] / 2, a: c, b: nd.a, depth: nd.depth + 1 });
      }
    }
    return { lit, pieces };
  };
  // cells of a mask, grown by one cell in every direction
  const dilate = (mask, GX, GY) => {
    const out = new Uint8Array(mask.length);
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      if (!mask[j * GX + i]) continue;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a >= 0 && a < GX && b >= 0 && b < GY) out[b * GX + a] = 1;
      }
    }
    return out;
  };
  const tv = (a, na, b, nb) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] / na - b[i] / nb); return s / 2; };
  window.__cr = { rule, poly, mulberry, hist, game, sample, oracle, dilate, tv };
}

// ------------------------------------------------------------------ the dealer and the picker

test("the dealer never repeats the rule on screen, deals the default first, and every rule comes round", async ({ page }) => {
  const r = await page.evaluate(() => {
    const rnd = window.__cr.mulberry(99), ids = [];
    for (let i = 0; i < 120; i++) { ids.push(dealCornerRule(rnd).id); }
    return { ids, all: CORNER_RULES.map((x) => x.id), def: DEFAULT_CORNER_RULE };
  });
  expect([...r.all].sort(), "the spec covers every rule").toEqual(IDS);
  expect(r.ids[0], "the first rule dealt is the default one").toBe(r.def);
  for (let i = 1; i < r.ids.length; i++) expect(r.ids[i], `deal ${i} repeats the last`).not.toBe(r.ids[i - 1]);
  expect([...new Set(r.ids)].sort(), "every rule gets dealt").toEqual([...r.all].sort());
  // they come round steadily, none is starved: any run of 3 * rules deals has every rule in it
  const n = r.all.length;
  for (let i = 0; i + 3 * n <= r.ids.length; i++) expect(new Set(r.ids.slice(i, i + 3 * n)).size, `deals ${i}..${i + 3 * n}`).toBe(n);
  // the very first deal does not repeat a rule a link put on screen
  const afterLink = await page.evaluate(() => { cornerDeal.dealt = 0; cornerDeal.bag = []; applyCornerRule(DEFAULT_CORNER_RULE); return dealCornerRule(window.__cr.mulberry(5)).id; });
  expect(afterLink).not.toBe(r.def);
});

test("the picker has the entry once, in the Chaos Games group; each tap deals a rule, also while the mode is open", async ({ page }) => {
  const entry = page.locator('#fractalTypeRow button[data-mode="corners"]');
  await expect(entry).toHaveCount(1);
  const layout = await page.evaluate(() => PICKER_LAYOUT.flatMap((s) => s.groups.filter((g) => g.label === "Chaos Games").flatMap((g) => g.keys)));
  expect(layout.filter((k) => k === "corners")).toHaveLength(1);
  expect(await page.evaluate(() => PICKER_LAYOUT.flatMap((s) => s.groups.flatMap((g) => g.keys)).filter((k) => k === "corners").length)).toBe(1);
  expect(await page.evaluate(() => EXTRA_MODES.filter((m) => m.key === "corners").map((m) => m.label))).toEqual(["Corner Rules"]);
  const seen = [];
  for (let i = 0; i < 9; i++) {
    await page.locator("#fernControls:visible, #fractalControls:visible").first().locator(".fractalMenuBtn").click();
    await entry.click();
    seen.push(await page.evaluate(() => ({ mode, id: cornerDeal.id, system: fernView.system })));
    await expect(page.locator("#fractalTypeRow")).not.toHaveClass(/\bopen\b/); // the picker closes, as on any pick
  }
  expect(seen.every((s) => s.mode === "corners" && s.system === "corners")).toBe(true);
  expect(seen[0].id, "the first deal").toBe(3);
  for (let i = 1; i < seen.length; i++) expect(seen[i].id, `tap ${i} repeats the rule on screen`).not.toBe(seen[i - 1].id);
  expect(new Set(seen.map((s) => s.id)).size, "the rules differ across taps").toBeGreaterThan(2);
});

test("Another rule: only in this mode, beside Play, deals a rule and frames it whole", async ({ page }) => {
  const btn = page.locator("#cornerRuleBtn");
  await expect(btn, "hidden outside Corner Rules").toBeHidden();
  await page.evaluate(() => setMode("fern"));
  await expect(btn).toBeHidden();
  await page.evaluate(() => dealCornerRules());
  await settle(page);
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute("aria-label", "Another rule");
  const order = await page.evaluate(() => [...document.querySelectorAll("#fernControls > *")].map((e) => e.id || e.className.split(" ").find((c) => /replay/.test(c)) || ""));
  expect(order.indexOf("cornerRuleBtn"), "right after the speed button that follows Play").toBe(order.indexOf("replaySpeedBtn") + 1);
  expect(order.indexOf("fernReplayBtn")).toBeLessThan(order.indexOf("cornerRuleBtn"));
  const ids = [await page.evaluate(() => cornerDeal.id)];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { fernView.view.cx += 0.1; fernView.view.halfHeight *= 0.5; }); // moved and zoomed: the new rule starts over, whole
    await btn.click();
    await settle(page);
    ids.push(await page.evaluate(() => cornerDeal.id));
    const fit = await page.evaluate(() => vectorViewIsFitted("corners"));
    expect(fit, "the new rule is framed whole").toBe(true);
  }
  for (let i = 1; i < ids.length; i++) expect(ids[i], `deal ${i} repeats`).not.toBe(ids[i - 1]);
  await page.evaluate(() => setMode("koch"));
  await expect(btn, "hidden again outside the mode").toBeHidden();
});

for (const width of [393, 360]) {
  test(`the toolbar row with Another rule stays on one line at ${width} px, 44 px tall, nothing overlapping`, async ({ page }) => {
    await page.setViewportSize({ width, height: 852 });
    await showRule(page, 3);
    const boxes = await page.evaluate(() => [...document.querySelectorAll("#fernControls button")].filter((b) => b.offsetParent).map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.id || b.className, x: r.x, y: r.y, w: r.width, h: r.height };
    }));
    expect(boxes.map((b) => b.id), "the shape's own button is in the row").toContain("cornerRuleBtn");
    expect(new Set(boxes.map((b) => Math.round(b.y))).size, "all the buttons on one line").toBe(1);
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].x, `${sorted[i].id} clear of ${sorted[i - 1].id}`).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w - 0.01);
    const rule = boxes.find((b) => b.id === "cornerRuleBtn");
    expect(rule.h, "tall enough to tap").toBeGreaterThanOrEqual(44);
    expect(rule.w, "wide enough to tap").toBeGreaterThanOrEqual(32);
    expect(sorted[sorted.length - 1].x + sorted[sorted.length - 1].w, "inside the screen").toBeLessThanOrEqual(width);
  });
}

test("the rule's name is on screen in a chip and on the info card, and follows the rule", async ({ page }) => {
  await showRule(page, 3);
  const chip = page.locator("#ruleChip");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("Never the opposite corner");
  await showRule(page, 4);
  await expect(chip).toHaveText("After a repeat, no neighbour");
  await page.locator(".hudToggleBtn:visible").first().click(); // the info card
  await expect(page.locator("#hud .hudName")).toHaveText("Corner Rules");
  await expect(page.locator("#hud .hudAboutLine").nth(0)).toHaveText("After a repeat, no neighbour");
  const blurb = await page.locator("#hud .hudAboutLine").nth(1).textContent();
  expect(blurb).toMatch(/snowflake cross/);
  await expect(chip, "the chip gives way to the open card, which names the rule").toBeHidden();
  await showRule(page, 2);
  await expect(page.locator("#hud .hudAboutLine").nth(0)).toHaveText("Never the next corner clockwise");
  expect(await page.locator("#hud .hudAboutLine").nth(1).textContent()).toMatch(/pinwheel/);
  await page.locator(".hudToggleBtn:visible").first().click();
  await page.evaluate(() => setMode("sierpinski"));
  await expect(chip, "no chip in the other shapes").toBeHidden();
});

// ------------------------------------------------------------------ the share link

test("the link carries the rule beside the seed, and reopens the same shape; bad values are the default rule", async ({ page }) => {
  await showRule(page, 2);
  const plain = await page.evaluate(() => buildShareHash());
  expect(plain).toMatch(/^#v=1&m=corners&x=.*&c=\d+&ru=2$/);
  expect(plain).not.toMatch(/sd=/);
  await page.evaluate(() => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4); startDotRun(4242); });
  const withSeed = await page.evaluate(() => buildShareHash());
  expect(withSeed).toMatch(/&ru=2&sd=4242$/);
  await page.evaluate(() => fernView.cancelReplay());
  // parse: the rule and the seed
  const p = await page.evaluate((h) => parseShareHash(h), withSeed);
  expect(p).toMatchObject({ mode: "corners", rule: 2, seed: 4242 });
  // lenient: anything else is the default rule, the link still opens (also a bad seed is left out, as before)
  for (const bad of ["99", "0", "-2", "abc", "", "2.5", "3x", "003", "1e1", " 3", "constructor", "%00"]) {
    const q = await page.evaluate(([h, v]) => parseShareHash(h.replace(/&ru=2/, "&ru=" + v)), [withSeed, bad]);
    expect(q, `ru=${JSON.stringify(bad)} opens`).not.toBeNull();
    expect(q.rule, `ru=${JSON.stringify(bad)} is the default rule`).toBe(3);
    expect(q.seed, "the seed is unaffected").toBe(4242);
  }
  const noRule = await page.evaluate((h) => parseShareHash(h.replace(/&ru=2/, "")), withSeed);
  expect(noRule.rule, "a link without a rule opens the default rule").toBe(3);
  expect(await page.evaluate(() => parseCornerRule("4"))).toBe(4);
  // other shapes: no rule in their links, and their parse has no rule field (existing links read as before)
  await page.evaluate(() => setMode("sierpinski"));
  const other = await page.evaluate(() => buildShareHash());
  expect(other).not.toMatch(/ru=/);
  expect(await page.evaluate((h) => Object.keys(parseShareHash(h)).sort(), other)).toEqual(["colorIndex", "count", "mode", "rotation", "scale", "cx", "cy"].sort());
  // round trip: another rule on screen, then the link: its rule, view and seeded run come back
  await showRule(page, 4);
  await page.evaluate(() => { fernView.view.cx = 0.3; fernView.view.cy = 0.2; fernView.view.halfHeight = 0.9; });
  await page.evaluate((h) => applyShareLink("https://x.test/" + h), withSeed);
  const after = await page.evaluate(() => ({ mode, rule: cornerDeal.id, system: fernView.system, ifsRule: ifsData("corners").ruleId, hh: fernView.view.halfHeight, title: els.ruleChip.textContent }));
  expect(after).toMatchObject({ mode: "corners", rule: 2, system: "corners", ifsRule: 2 });
  await page.waitForFunction(() => fernView.replayState && fernView.replayState.seed === 4242, null, { timeout: 15_000 });
  expect(await page.evaluate(() => chaosRun.seed)).toBe(4242);
  // from another shape, too
  await page.evaluate(() => { fernView.cancelReplay(); setMode("fern"); });
  await page.evaluate((h) => applyShareLink("https://x.test/" + h.replace(/&ru=2/, "&ru=1")), withSeed);
  await page.waitForFunction(() => fernView.replayState && fernView.replayState.seed === 4242, null, { timeout: 15_000 });
  expect(await page.evaluate(() => ({ mode, rule: cornerDeal.id, ifsRule: ifsData("corners").ruleId }))).toEqual({ mode: "corners", rule: 1, ifsRule: 1 });
  await page.evaluate(() => fernView.cancelReplay());
  // a run played under one rule is not the picture of another rule
  await page.evaluate(() => { startDotRun(777); });
  await page.evaluate(() => { setCornerRule(3); });
  expect(await page.evaluate(() => buildShareHash())).not.toMatch(/sd=/);
});

// ------------------------------------------------------------------ the tables

test("the address tree the sampler walks only has pairs of neighbouring digits the rule allows; rule 3 has no opposite pair", async ({ page }) => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const rule of CORNER_RULES) {
      const mach = compileRule(rule), n = rule.n;
      // walk back from every state to depth 7: digits newest first, with the states the walk is in
      const bad = [];
      let words = 0, opposite = 0;
      const walk = (state, word) => {
        if (word.length >= 7) { words++; return; }
        for (let i = mach.backStart[state]; i < mach.backStart[state + 1]; i++) {
          const k = mach.backK[i], from = mach.backFrom[i], w = [...word, k];
          // w[j] is picked after w[j+1] (and w[j+2] before that): the rule must allow it
          for (let j = 0; j + 1 < w.length; j++) {
            const p = w[j + 1], q = j + 2 < w.length ? w[j + 2] : -1;
            if (rule.order === 1 || q >= 0) { if (!rule.allows(w[j], p, q, n)) bad.push(w.slice()); }
            if (n === 4 && rule.id === 3 && (w[j + 1] + 2) % 4 === w[j]) opposite++;
          }
          walk(from, w);
        }
      };
      let roots = 0;
      for (let s = 0; s < mach.nStates; s++) if (mach.rec[s] && mach.pi[s] > 1e-12) { walk(s, []); roots++; }
      // and the converse: every pair the rule allows is a pair that some walk has (no allowed move is lost)
      const seen = new Set();
      const walk2 = (state, prev, depth) => {
        if (depth >= 3) return;
        for (let i = mach.backStart[state]; i < mach.backStart[state + 1]; i++) {
          if (prev >= 0) seen.add(`${prev}<${mach.backK[i]}`); // prev was picked after backK
          walk2(mach.backFrom[i], mach.backK[i], depth + 1);
        }
      };
      for (let s = 0; s < mach.nStates; s++) if (mach.rec[s] && mach.pi[s] > 1e-12) walk2(s, -1, 0);
      let allowedPairs = 0;
      for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        // b picked after a, in some context the rule allows (any older pick)
        let ok = false;
        for (let q = -1; q < n && !ok; q++) if (rule.allows(b, a, q, n) && (rule.order === 1 || q >= 0 || rule.id !== 4)) ok = true;
        if (ok) { allowedPairs++; if (!seen.has(`${b}<${a}`)) bad.push(["missing", b, a]); }
      }
      out[rule.id] = { bad: bad.slice(0, 3), words, opposite, roots, allowedPairs, pi: Array.from(mach.pi).filter((v) => v > 0).length, piSum: Array.from(mach.pi).reduce((s, v) => s + v, 0) };
    }
    return out;
  });
  for (const id of IDS) {
    expect(r[id].bad, `rule ${id}: pairs against the rule, or allowed pairs lost`).toEqual([]);
    expect(r[id].words, `rule ${id}: the walk reached depth 7`).toBeGreaterThan(100);
    expect(r[id].piSum, `rule ${id}: the stationary distribution sums to 1`).toBeCloseTo(1, 9);
  }
  expect(r[3].opposite, "rule 3: no address has an opposite pair").toBe(0);
  expect(r[3].pi, "rule 3: four states, one per last corner").toBe(4);
  expect(r[4].pi, "rule 4: the last two picks, all sixteen are reachable").toBe(16);
});

// ------------------------------------------------------------------ the sampler against the game

test("the sampler's distribution is the game's: total variation distance within the game's own noise, opening view and zoomed", async ({ page }) => {
  test.setTimeout(240_000);
  const r = await page.evaluate(() => {
    const { hist, game, sample, tv } = window.__cr, out = [];
    for (const id of CORNER_RULES.map((x) => x.id)) {
      setCornerRule(id);
      const ifs = ifsData("corners"), b = ifs.bounds;
      // The opening view, and a zoom of 24 (the sampler expands about four levels of the address tree) on a
      // point of the shape: the box round the base point of index 20000, which is on the attractor. The game
      // needs many jumps to put enough points into the zoomed box.
      const zoomed = (() => { const x = ifs.base[2 * 20000], y = ifs.base[2 * 20000 + 1], h = (b[1] - b[0]) / 24; return [x - h, x + h, y - h, y + h]; })();
      for (const [name, box, G, N, jumps] of [["opening", [b[0], b[1], b[2], b[3]], 16, 150000, 3e6], ["zoomed", zoomed, 10, 40000, 3e7]]) {
        const games = [11, 12, 13].map((seed) => {
          const g = hist(box, G, G);
          game(id, jumps, seed, (x, y) => { if (g.n < N) g.add(x, y); });
          return g;
        });
        const s = hist(box, G, G);
        const leaves = sample(box, N * 14, (x, y) => { if (s.n < N) s.add(x, y); });
        const pair = (a, c) => tv(a.h, a.n, c.h, c.n);
        out.push({
          id, name, n: [...games.map((g) => g.n), s.n], leaves,
          noise: (pair(games[0], games[1]) + pair(games[0], games[2]) + pair(games[1], games[2])) / 3, // what two games differ by
          dist: Math.max(...games.map((g) => pair(g, s))),
        });
      }
    }
    return out;
  });
  for (const o of r) {
    expect(Math.min(...o.n), `rule ${o.id} ${o.name}: enough points in view to compare (${o.n})`).toBeGreaterThanOrEqual(40000);
    const limit = 1.4 * o.noise + 0.004;
    expect(o.dist, `rule ${o.id} ${o.name}: TV to the game ${o.dist.toFixed(4)} against two games' own ${o.noise.toFixed(4)} (limit ${limit.toFixed(4)})`).toBeLessThan(limit);
  }
});

test("the sampler's points are reachable under the rule, and cover what is: against an oracle, at the opening view and at deep zooms", async ({ page }) => {
  test.setTimeout(240_000);
  const r = await page.evaluate(() => {
    const { hist, sample, oracle, dilate } = window.__cr, out = [];
    for (const id of CORNER_RULES.map((x) => x.id)) {
      setCornerRule(id);
      const ifs = ifsData("corners"), b = ifs.bounds;
      // a point of the shape to zoom to: base points of the data, well apart (the sampler's own data is only used as a place)
      const views = [["opening", b]];
      for (const [name, idx, zoom] of [["x8", 3000, 8], ["x64", 21000, 64], ["x1024", 40000, 1024], ["x16384", 12345, 16384]]) {
        const x = ifs.base[2 * idx], y = ifs.base[2 * idx + 1], h = (b[1] - b[0]) / 2 / zoom;
        views.push([name, [x - h, x + h, y - h, y + h]]);
      }
      for (const [name, box] of views) {
        const GX = 80, GY = 80;
        const s = hist(box, GX, GY);
        const leaves = sample(box, 150000, (x, y) => s.add(x, y));
        const o = oracle(id, box, GX, GY);
        const sLit = new Uint8Array(GX * GY).map((_, i) => (s.h[i] > 0 ? 1 : 0));
        const oD = dilate(o.lit, GX, GY), sD = dilate(sLit, GX, GY);
        let inOracle = 0, sTot = 0, covered = 0, oTot = 0;
        for (let i = 0; i < GX * GY; i++) {
          if (s.h[i] > 0) { sTot += s.h[i]; if (oD[i]) inOracle += s.h[i]; }
          if (o.lit[i]) { oTot++; if (sD[i]) covered++; }
        }
        // the control: the same samples against the oracle of another rule must fail the first check (the check can fail)
        const other = oracle(id === 3 ? 2 : 3, box, GX, GY), otherD = dilate(other.lit, GX, GY);
        let inOther = 0;
        for (let i = 0; i < GX * GY; i++) if (s.h[i] > 0 && otherD[i]) inOther += s.h[i];
        out.push({ id, name, leaves, inView: s.n, sTot, shareInOracle: sTot ? inOracle / sTot : 1, oracleCells: oTot, shareCovered: oTot ? covered / oTot : 1, shareInOther: sTot ? inOther / sTot : 1 });
      }
    }
    return out;
  });
  let controlsThatFail = 0;
  for (const o of r) {
    const tag = `rule ${o.id} ${o.name}`;
    expect(o.inView, `${tag}: the sampler puts points in view (${o.inView})`).toBeGreaterThan(8000);
    expect(o.oracleCells, `${tag}: the oracle finds the shape in view`).toBeGreaterThan(20);
    expect(o.shareInOracle, `${tag}: points the oracle cannot reach`).toBeGreaterThan(0.999);
    expect(o.shareCovered, `${tag}: oracle cells with no sampler point near`).toBeGreaterThan(0.9);
    if (o.name === "opening" && o.shareInOther < 0.9) controlsThatFail++;
  }
  expect(controlsThatFail, "the oracle of another rule rejects the samples at the opening view (the test can fail)").toBeGreaterThanOrEqual(3);
});

test("the drawn picture lies where the game can be, at the opening view and zoomed (every rule)", async ({ page }) => {
  test.setTimeout(240_000);
  for (const id of IDS) {
    for (const [name, view] of [["opening", null], ["zoomed", { zoomOn: 30000, zoom: 24 }]]) {
      await showRule(page, id);
      if (view) {
        await page.evaluate(({ zoomOn, zoom }) => {
          const ifs = ifsData("corners"), hh = fernView.view.halfHeight / zoom;
          Object.assign(fernView.view, { cx: ifs.base[2 * zoomOn], cy: ifs.base[2 * zoomOn + 1], halfHeight: hh });
          requestRender();
        }, view);
        await settle(page);
      }
      const r = await page.evaluate(([id]) => {
        const c = els.fernCanvas, W = c.width, H = c.height, v = fernView.view;
        const px = c.getContext("2d").getImageData(0, 0, W, H).data;
        // cells of 4 canvas px; lit when a pixel in it is clearly above the backdrop
        const C = 4, GX = Math.ceil(W / C), GY = Math.ceil(H / C), lit = new Uint8Array(GX * GY);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          if (Math.max(px[o], px[o + 1], px[o + 2]) > 70) lit[Math.floor(y / C) * GX + Math.floor(x / C)] = 1;
        }
        // the box those cells cover, in world coordinates (no rotation)
        const [x0, y1] = fernView.screenToWorld(0, 0), [x1, y0] = fernView.screenToWorld(GX * C, GY * C);
        const box = [x0, x1, y0, y1];
        const o = window.__cr.oracle(id, box, GX, GY), oD = window.__cr.dilate(o.lit, GX, GY), lD = window.__cr.dilate(lit, GX, GY);
        let l = 0, inO = 0, oc = 0, cov = 0;
        for (let i = 0; i < lit.length; i++) { if (lit[i]) { l++; if (oD[i]) inO++; } if (o.lit[i]) { oc++; if (lD[i]) cov++; } }
        return { lit: l, inOracle: l ? inO / l : 1, oracle: oc, covered: oc ? cov / oc : 1, hh: v.halfHeight };
      }, [id]);
      const tag = `rule ${id} ${name}`;
      expect(r.lit, `${tag}: something is drawn`).toBeGreaterThan(40);
      expect(r.inOracle, `${tag}: lit cells outside what the game reaches`).toBeGreaterThan(0.995);
      expect(r.covered, `${tag}: cells the game reaches that stayed dark`).toBeGreaterThan(0.75);
    }
  }
});

// ------------------------------------------------------------------ the Play run

test("Play: every jump of the run obeys the rule (from the first), and the seed gives the same jumps", async ({ page }) => {
  for (const id of IDS) {
    await showRule(page, id);
    const run = (seed) => page.evaluate(([seed, jumps]) => {
      fernView.cancelReplay();
      // a manual run with a slow phase as long as the jumps asked, so the first `jumps` points are all kept in seq
      fernView.startReplay({ ...fernRenderOpts(), manual: true, rng: seededRandom(seed), seed, slowJumps: jumps, gapFirst: 0.3, rampS: 4.5, stop: 20000, count: 100000 });
      for (let i = 0; i < 200 && fernView.replayState && fernView.replayState.n < jumps; i++) fernView.replayStep(10, Infinity);
      const st = fernView.replayState, seq = st.seq.slice(1, jumps + 1).map((p) => p.ci);
      fernView.cancelReplay();
      return seq;
    }, [seed, 3000]);
    const a = await run(31337), b = await run(31337), c = await run(31338);
    expect(a.length, `rule ${id}: kept jumps`).toBeGreaterThan(2000);
    expect(b, `rule ${id}: the same seed, the same jumps`).toEqual(a);
    expect(c, `rule ${id}: another seed, other jumps`).not.toEqual(a);
    const bad = await page.evaluate(([id, seq]) => {
      const r = CORNER_RULES.find((x) => x.id === id), out = [];
      for (let j = 0; j < seq.length; j++) {
        const p = j > 0 ? seq[j - 1] : -1, q = j > 1 ? seq[j - 2] : -1;
        if (!r.allows(seq[j], p, q, r.n)) out.push([j, q, p, seq[j]]);
      }
      // and the jumps of the seed, worked out here from the rule alone: the u-th number picks among the allowed corners
      const rnd = seededRandom(31337), want = [];
      let p = -1, q = -1;
      for (let j = 0; j < seq.length; j++) {
        const ok = [];
        for (let k = 0; k < r.n; k++) if (r.allows(k, p, q, r.n)) ok.push(k);
        const k = ok[Math.floor(rnd() * ok.length)];
        want.push(k); q = p; p = k;
      }
      return { violations: out.slice(0, 5), count: out.length, same: want.every((k, j) => k === seq[j]) };
    }, [id, a]);
    expect(bad.count, `rule ${id}: jumps against the rule ${JSON.stringify(bad.violations)}`).toBe(0);
    expect(bad.same, `rule ${id}: the jumps are those the seed's numbers pick among the allowed corners`).toBe(true);
  }
});

test("Play in this mode: the app's own run follows the view, plays the rule, ends in the normal picture, and a link's seed plays the same jumps", async ({ page }) => {
  await showRule(page, 3);
  const first = await page.evaluate(() => {
    depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4);
    startDotRun(2468);
    for (let i = 0; i < 40 && fernView.replayState && fernView.replayState.n < 45; i++) fernView.replayStep(0.25);
    const st = fernView.replayState;
    return { n: st.n, seed: st.seed, stop: st.stop, table: IFS_STOP_POINTS.corners, seq: st.seq.slice(1, 41).map((p) => p.ci), follow: st.follow };
  });
  expect(first.seed).toBe(2468);
  expect(first.follow, "the app's run follows the view").toBe(true);
  expect(first.stop).toBe(Math.min(first.table, 1000000));
  expect(first.n).toBeGreaterThan(40);
  const link = await page.evaluate(() => buildShareHash());
  expect(link).toMatch(/&ru=3&sd=2468$/);
  await page.evaluate(() => { fernView.cancelReplay(); setCornerRule(1); setMode("sierpinski"); });
  await page.evaluate((h) => applyShareLink("https://x.test/" + h), link);
  await page.waitForFunction(() => fernView.replayState && fernView.replayState.seed === 2468, null, { timeout: 15_000 });
  const second = await page.evaluate(() => { for (let i = 0; i < 40 && fernView.replayState.n < 45; i++) fernView.replayStep(0.25); return { rule: cornerDeal.id, seq: fernView.replayState.seq.slice(1, 41).map((p) => p.ci) }; });
  expect(second.rule).toBe(3);
  expect(second.seq, "the same jumps from the link's seed").toEqual(first.seq);
  // the run ends in the normal picture: step to the end and the replay hands over
  await page.evaluate(() => { for (let i = 0; i < 30 && fernView.replaying; i++) fernView.replayStep(2); });
  await settle(page);
  expect(await page.evaluate(() => fernView.replaying)).toBe(false);
});

// ------------------------------------------------------------------ twist

test("a two-finger twist at depth turns the view and keeps the picture (Corner Rules)", async ({ page }) => {
  for (const id of [3, 4]) {
    await showRule(page, id);
    await page.evaluate(() => {
      const ifs = ifsData("corners");
      Object.assign(fernView.view, { cx: ifs.base[2 * 9000], cy: ifs.base[2 * 9000 + 1], halfHeight: 0.02 });
      requestRender();
    });
    await settle(page);
    const r = await page.evaluate(async () => {
      HTMLElement.prototype.setPointerCapture = () => {};
      const view = VECTOR_VIEWS.corners[0], canvas = VECTOR_VIEWS.corners[1];
      const rect = canvas.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
      const frame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const R = 80;
      fire("pointerdown", 1, cx - R, cy);
      fire("pointerdown", 2, cx + R, cy);
      const before = view.view.rotation;
      for (let s = 1; s <= 10; s++) {
        const a = (Math.PI / 2) * (s / 10);
        fire("pointermove", 1, cx - R * Math.cos(a), cy - R * Math.sin(a));
        fire("pointermove", 2, cx + R * Math.cos(a), cy + R * Math.sin(a));
        await frame();
      }
      fire("pointerup", 1, 0, 0);
      fire("pointerup", 2, 0, 0);
      await frame();
      await new Promise((res) => { const t = () => (fernView.refining ? requestAnimationFrame(t) : res()); t(); });
      const px = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (Math.max(px[i], px[i + 1], px[i + 2]) > 70) lit++;
      return { turned: Math.abs(view.view.rotation - before), lit, total: canvas.width * canvas.height, accepted: fernView.accepted };
    });
    expect(r.turned, `rule ${id}: rotation changed by about a quarter turn`).toBeGreaterThan(1.2);
    expect(r.lit, `rule ${id}: the frame is not blank after the twist`).toBeGreaterThan(r.total * 0.001);
    expect(r.accepted, `rule ${id}: the sampler still lands points in the turned view`).toBeGreaterThan(100000);
  }
});

test("one hue per corner, and the toolbar pill shows them", async ({ page }) => {
  await showRule(page, 3);
  const r = await page.evaluate(() => ({
    offsets: IFS_SYSTEMS.corners.hueOffsets, n: IFS_SYSTEMS.corners.transforms.length, ci: IFS_SYSTEMS.corners.transforms.map((t) => t.ci),
    colors: ifsTransformColors("corners", vectorColors.corners).map((c) => c.map(Math.round).join(",")),
    pill: els.fernColorSwatch.style.background,
  }));
  expect(r.n).toBe(4);
  expect(r.ci).toEqual([0, 1, 2, 3]);
  expect(new Set(r.offsets).size, "one hue per corner").toBe(4);
  expect(new Set(r.colors).size, "four different colors").toBe(4);
  expect(r.pill, "the pill is a gradient").toContain("linear-gradient");
});
