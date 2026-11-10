// The chaos-game replay of the five dot shapes (fern, Sierpinski triangle, Sierpinski pentagon, Levy C, Vicsek; fern.js
// and the Play button in teleport.js): from an empty backdrop a dot flies from point to point, each
// jump by a randomly chosen transform and in that transform's address color, the first ones slow
// and one by one, then faster until the points slider's count of points is down and the picture has
// emerged, with the normal render taking over without a visible change. Most checks run the replay
// on its manual clock (`manual: true`, advanced by `fernView.replayStep(seconds)`) with a seeded
// `ifsRandom`, so the same jumps come every time; a few press the real Play button.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/* global setMode, fernView, fernState, vectorColors, els, mode, fernRenderOpts, syncReplayButtons,
   vectorViewIsFitted, fitVectorView, requestRender, renderAll, captureShareBlob, buildShareHash, ifsRandom, setIfsRandom,
   ifsTransformColors, ifsPoints, IFS_SYSTEMS, backdropPixels, replayJumpsAt, replayTimeOf, REPLAY_SLOW_S, REPLAY_RAMP_S,
   REPLAY_CAP_S, depthPlayer, PLAY_SPEEDS, setFernColor, stopDepthPlay, hudVisible, seededRandom, REPLAY_LONG, replayStopPoints,
   IFS_STOP_POINTS, newRunSeed, parseRunSeed, replayGapLast, replaySchedule, REPLAY_DEFAULT_SCHEDULE, REPLAY_CAP_RATIO,
   formatPointCount, ifsData, updateFernHud, announceRunDone, chaosRun, parseShareHash, runChipText, RING_HOLD_MS */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const IFS_MODES = ["fern", "sierpinski", "pentagon", "levy", "vicsek"];

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
    // A seeded stand-in for Math.random (mulberry32), for ifsRandom.
    window.__seeded = (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
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

// Shows a mode and waits until its normal render has plotted all its points.
async function show(page, m) {
  await page.evaluate((m) => setMode(m), m);
  await page.waitForFunction((m) => fernView.system === m && !fernView.refining && fernView.accepted > 0, m, { timeout: 90_000 });
  await frames(page);
}

// Starts a replay of `count` points on the manual clock with a seeded random, framed as the Play
// button frames it. The page keeps nothing running: replayStep moves it.
async function startManual(page, m, { count = 200000, seed = 7, speed = 1 } = {}) {
  await show(page, m);
  await page.evaluate(([count, seed, speed]) => {
    setIfsRandom(window.__seeded(seed));
    fernState.count = count;
    els.fernPointsSlider.value = count;
    if (!vectorViewIsFitted(mode)) fitVectorView(mode);
    fernView.startReplay({ ...fernRenderOpts(), manual: true, speed: () => speed, onChange: syncReplayButtons });
  }, [count, seed, speed]);
}

// Moves a manual replay to the time at which n jumps are done (a fraction puts the dot mid-jump).
function stepTo(page, n) {
  return page.evaluate((n) => {
    const s = fernView.replayState;
    if (s) fernView.replayStep(Math.max(0, replayTimeOf(n, s.total) - s.t));
  }, n);
}

// Plays a manual replay out in quarter seconds (so it ends by its last point, not by the cap).
function finish(page) {
  return page.evaluate(() => { for (let k = 0; fernView.replaying && k < 200; k++) fernView.replayStep(0.25); });
}

// The number of pixels that differ from the backdrop by more than a few levels: what is drawn.
function lit(page) {
  return page.evaluate(() => {
    const c = els.fernCanvas, px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const bg = window.__bg?.length === c.width * c.height * 3 ? window.__bg : (window.__bg = backdropPixels(c.width, c.height));
    let n = 0;
    for (let i = 0; i < c.width * c.height; i++) {
      const d = Math.max(Math.abs(px[4 * i] - bg[3 * i]), Math.abs(px[4 * i + 1] - bg[3 * i + 1]), Math.abs(px[4 * i + 2] - bg[3 * i + 2]));
      if (d > 8) n++;
    }
    return n;
  });
}

// Keeps a copy of the canvas in the page under a name (the bytes are too many to send out)...
const snap = (page, name) => page.evaluate((name) => {
  const c = els.fernCanvas;
  (window.__snaps ||= {})[name] = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
}, name);

// ... and compares two of them: how many pixels differ by more than `thresh` levels in all, the mean
// difference over 8 x 8 blocks (so the same picture drawn from other random points still agrees),
// and each one's light above the backdrop and mean hue of its bright pixels.
const compare = (page, a, b, thresh = 6) => page.evaluate(([a, b, thresh]) => {
  const A = window.__snaps[a], B = window.__snaps[b], w = els.fernCanvas.width, h = els.fernCanvas.height;
  let changed = 0, sum = 0, blocks = 0;
  for (let i = 0; i < w * h; i++) {
    if (Math.abs(A[4 * i] - B[4 * i]) + Math.abs(A[4 * i + 1] - B[4 * i + 1]) + Math.abs(A[4 * i + 2] - B[4 * i + 2]) > thresh) changed++;
  }
  for (let by = 0; by + 8 <= h; by += 8) {
    for (let bx = 0; bx + 8 <= w; bx += 8) {
      let da = 0, db = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const o = ((by + y) * w + bx + x) * 4;
        da += A[o] + A[o + 1] + A[o + 2]; db += B[o] + B[o + 1] + B[o + 2];
      }
      sum += Math.abs(da - db) / 192; blocks++;
    }
  }
  const bg = backdropPixels(w, h);
  const stats = (P) => {
    let light = 0, lit = 0, r = 0, g = 0, bl = 0;
    for (let i = 0; i < w * h; i++) {
      const d = (P[4 * i] - bg[3 * i]) + (P[4 * i + 1] - bg[3 * i + 1]) + (P[4 * i + 2] - bg[3 * i + 2]);
      light += Math.max(0, d);
      if (Math.abs(d) > 8) lit++;
      if (Math.max(P[4 * i], P[4 * i + 1], P[4 * i + 2]) > 80) { r += P[4 * i]; g += P[4 * i + 1]; bl += P[4 * i + 2]; }
    }
    return { light, lit, rgb: [r, g, bl] };
  };
  return { changed, meanBlock: sum / blocks, a: stats(A), b: stats(B) };
}, [a, b, thresh]);

// Waits for the normal render to have plotted everything again after a replay ended.
async function settled(page, count) {
  await page.waitForFunction((count) => !fernView.replaying && !fernView.refining && fernView.accepted >= count, count, { timeout: 90_000 });
  await frames(page);
}

const hueOf = ([r, g, b]) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  let h;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

test.describe("the schedule", () => {
  test("takes about 8 seconds at 1x, never goes back, and carries on at the pace the slow jumps end with", async ({ page }) => {
    const r = await page.evaluate(() => {
      const total = 1000012, out = { jumps: [], back: 0, slowS: REPLAY_SLOW_S, rampS: REPLAY_RAMP_S, cap: REPLAY_CAP_S };
      let prev = -1;
      for (let t = 0; t <= REPLAY_SLOW_S + REPLAY_RAMP_S + 0.5; t += 0.01) {
        const j = replayJumpsAt(t, total);
        if (j < prev) out.back++;
        prev = j;
      }
      out.end = replayJumpsAt(REPLAY_SLOW_S + REPLAY_RAMP_S, total);
      // jumps per second just before and just after the slow phase ends
      out.rateBefore = (replayJumpsAt(REPLAY_SLOW_S - 0.01, total) - replayJumpsAt(REPLAY_SLOW_S - 0.06, total)) / 0.05;
      out.rateAfter = (replayJumpsAt(REPLAY_SLOW_S + 0.06, total) - replayJumpsAt(REPLAY_SLOW_S + 0.01, total)) / 0.05;
      // the inverse
      out.inverse = [1, 5.5, 23.9, 24, 100, 5000, 400000, 1000012].map((n) => replayTimeOf(n, total)).map((t, i) => replayJumpsAt(t, total) / [1, 5.5, 23.9, 24, 100, 5000, 400000, 1000012][i]);
      out.firstJumpS = replayTimeOf(1, total);
      return out;
    });
    expect(r.slowS + r.rampS, "a replay at 1x lasts 6 to 10 seconds").toBeGreaterThan(6);
    expect(r.slowS + r.rampS).toBeLessThan(10);
    expect(r.cap, "the cap is the top of that range").toBeLessThanOrEqual(10);
    expect(r.back).toBe(0);
    expect(r.end).toBe(1000012);
    expect(r.rateAfter / r.rateBefore, "no lurch where the slow jumps end").toBeGreaterThan(0.5);
    expect(r.rateAfter / r.rateBefore).toBeLessThan(2);
    for (const q of r.inverse) expect(q).toBeCloseTo(1, 6);
    expect(r.firstJumpS, "the first jump is slow and visible").toBeGreaterThan(0.25);
  });

  test("ifsRandom starts as Math.random", async ({ page }) => {
    expect(await page.evaluate(() => ifsRandom === Math.random)).toBe(true);
  });
});

test.describe("the Play button", () => {
  for (const m of IFS_MODES) {
    test(`${m}: Play, Pause, Play again, then it ends and reads Play`, async ({ page }) => {
      await show(page, m);
      const btn = page.locator("#fernReplayBtn");
      await expect(btn).toBeVisible();
      await expect(btn).toHaveAttribute("aria-label", "Play replay");
      await page.evaluate(() => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4); syncReplayButtons(); }); // 4x: about 2 seconds
      await btn.click();
      await expect(btn).toHaveAttribute("aria-label", "Pause replay");
      expect(await page.evaluate(() => fernView.replayRunning)).toBe(true);
      await btn.click(); // pause: the picture stays as far as it got
      await expect(btn).toHaveAttribute("aria-label", "Play replay");
      const paused = await page.evaluate(() => ({ r: fernView.replaying, running: fernView.replayRunning, n: fernView.replayState.n }));
      expect(paused.r, "paused, not ended").toBe(true);
      expect(paused.running).toBe(false);
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => fernView.replayState.n), "nothing moves while paused").toBe(paused.n);
      await btn.click(); // carries on
      await expect(btn).toHaveAttribute("aria-label", "Pause replay");
      await page.waitForFunction(() => !fernView.replaying, null, { timeout: 30_000 });
      await expect(btn).toHaveAttribute("aria-label", "Play replay");
      await settled(page, await page.evaluate(() => fernState.count)); // (a slow device ends at the cap and the normal render finishes)
    });

    test(`${m}: a speed of 4x takes a quarter of the time`, async ({ page }) => {
      await show(page, m);
      await page.evaluate(() => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4); syncReplayButtons(); });
      const t0 = Date.now();
      await page.locator("#fernReplayBtn").click();
      await page.waitForFunction(() => !fernView.replaying, null, { timeout: 30_000 });
      const s = (Date.now() - t0) / 1000;
      expect(s, `${s.toFixed(1)} s at 4x`).toBeGreaterThan(1.5);
      expect(s).toBeLessThan(4.5);
    });
  }

  test("the speed button beside it sets the replay's speed, as in the depth rows", async ({ page }) => {
    await show(page, "sierpinski");
    const speed = page.locator(".replaySpeedBtn");
    await expect(speed).toHaveText("1×");
    await expect(speed).toHaveAttribute("aria-label", "Play speed 1×");
    await speed.click();
    await expect(speed).toHaveText("1.5×");
    await page.locator("#fernReplayBtn").click();
    expect(await page.evaluate(() => fernView.replayRunning)).toBe(true);
    await speed.click(); // changes the speed of the running replay, without ending it
    await expect(speed).toHaveText("2×");
    expect(await page.evaluate(() => fernView.replayRunning)).toBe(true);
    // the depth rows show the same speed
    expect(await page.evaluate(() => depthPlayer.speedIndex === PLAY_SPEEDS.indexOf(2))).toBe(true);
    await page.evaluate(() => fernView.cancelReplay());
  });

  for (const width of [393, 360]) {
    test(`the row stays on one line at ${width} px, with 44 px tall buttons that do not overlap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 852 });
      for (const m of IFS_MODES) {
        await show(page, m);
        // (the shown buttons: Corner Rules' own button is hidden in the other shapes)
        const boxes = await page.evaluate(() => [...document.querySelectorAll("#fernControls button")].filter((b) => b.offsetParent).map((b) => {
          const r = b.getBoundingClientRect();
          return { id: b.id || b.className, x: r.x, y: r.y, w: r.width, h: r.height, label: b.getAttribute("aria-label") };
        }));
        const play = boxes.find((b) => b.id === "fernReplayBtn");
        expect(play, `${m}: the Play button`).toBeTruthy();
        expect(play.h, `${m}: tall enough to tap`).toBeGreaterThanOrEqual(44);
        expect(play.w, `${m}: width`).toBeGreaterThanOrEqual(32);
        expect(new Set(boxes.map((b) => Math.round(b.y))).size, `${m}: all the buttons on one line`).toBe(1);
        const sorted = [...boxes].sort((a, b) => a.x - b.x);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].x, `${m}: ${sorted[i].id} clear of ${sorted[i - 1].id}`).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w - 0.01);
        }
        const last = sorted[sorted.length - 1];
        expect(last.x + last.w, `${m}: inside the screen`).toBeLessThanOrEqual(width);
        expect(sorted[0].x).toBeGreaterThanOrEqual(0);
        // order: the mode's own tools between info and Back
        const ids = sorted.map((b) => b.id);
        expect(ids.indexOf("fernReplayBtn")).toBe(ids.indexOf("fernHudBtn") + 1);
        expect(ids.indexOf("fernBackBtn")).toBeGreaterThan(ids.indexOf("fernBoxZoomBtn"));
      }
    });
  }

  test("Enter and Space press it from the keyboard, and Tab reaches it", async ({ page, browserName }) => {
    await show(page, "fern");
    const btn = page.locator("#fernReplayBtn");
    await btn.focus();
    expect(await page.evaluate(() => document.activeElement.id)).toBe("fernReplayBtn");
    await page.keyboard.press("Enter");
    await expect(btn).toHaveAttribute("aria-label", "Pause replay");
    await page.keyboard.press("Space");
    await expect(btn).toHaveAttribute("aria-label", "Play replay");
    expect(await page.evaluate(() => fernView.replaying)).toBe(true); // paused
    await page.keyboard.press("Enter");
    await expect(btn).toHaveAttribute("aria-label", "Pause replay");
    await page.evaluate(() => fernView.cancelReplay());
    // the button can be reached by Tab from the info button (Safari only tabs to form fields unless its setting says otherwise)
    if (browserName === "webkit") return;
    await page.locator("#fernHudBtn").focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement.id)).toBe("fernReplayBtn");
  });

  test("with reduced motion there is nothing to play: the buttons are not shown", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await show(page, "fern");
    await expect(page.locator("#fernReplayBtn")).toBeHidden();
    await expect(page.locator(".replaySpeedBtn")).toBeHidden();
    // the other buttons fill the row
    const widths = await page.evaluate(() => [...document.querySelectorAll("#fernControls button")].filter((b) => b.offsetWidth > 0).map((b) => b.offsetWidth));
    expect(widths.length).toBe(7);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(40);
  });

  test("the depth rows' Play buttons are untouched, and the dot shapes' button is not one of them", async ({ page }) => {
    expect(await page.evaluate(() => document.querySelectorAll(".depthPlayBtn").length)).toBe(4);
    expect(await page.evaluate(() => document.querySelector("#fernReplayBtn").classList.contains("depthPlayBtn"))).toBe(false);
    await page.evaluate(() => setMode("koch"));
    await page.evaluate(() => { document.querySelector("#kochControls .depthPlayBtn").click(); });
    expect(await page.evaluate(() => depthPlayer.slider !== null)).toBe(true);
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await page.evaluate(() => stopDepthPlay());
  });
});

test.describe("what the replay shows", () => {
  for (const m of IFS_MODES) {
    test(`${m}: starts from an empty backdrop, grows without ever thinning, and ends as the normal picture`, async ({ page }) => {
      const count = 200000;
      await startManual(page, m, { count });
      const start = await page.evaluate(() => ({ accepted: fernView.accepted, s: fernView.replayState }));
      expect(start.accepted, "no points counted yet").toBe(0);
      expect(start.s.n).toBe(0);
      const checkpoints = [0.05, 3.05, 8.05, 20.05, 60.05, 300.05, 2000.05, 20000.05, 100000.05];
      const counts = [await lit(page)];
      // The start is the backdrop with only the dot's glow, the start point and (Sierpinski) three rings:
      // under 1% of the canvas at any pixel ratio, and a small part of the finished picture.
      const area = await page.evaluate(() => els.fernCanvas.width * els.fernCanvas.height);
      expect(counts[0], "an empty backdrop with the dot and the start point").toBeLessThan(area * 0.01);
      for (const n of checkpoints) {
        await stepTo(page, n);
        counts.push(await lit(page));
      }
      expect(counts[0], `lit pixels (${counts.join(", ")}): the start is a small part of the picture`).toBeLessThan(counts[counts.length - 1] * 0.3);
      // (the marks shrink to single pixels and the dot and trail fade out, so the count may dip a little)
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i], `lit pixels at step ${i} (${counts.join(", ")}): the picture never thins out`).toBeGreaterThanOrEqual(counts[i - 1] * 0.7 - 0.0005 * area);
      }
      // with half the points down it has outgrown every earlier stage, marks and dot included
      expect(counts[counts.length - 1], `lit pixels (${counts.join(", ")}): a good part of the picture is there at half the points`)
        .toBeGreaterThan(1.15 * Math.max(...counts.slice(0, -1)));
      // the end: the replay hands over to the normal render, which has the same picture
      await finish(page);
      await settled(page, count);
      await snap(page, "replay");
      expect(await page.evaluate(() => fernView.accepted)).toBeGreaterThanOrEqual(count);
      // a fresh normal render with the same count (the view nudged and put back, so it starts over)
      await page.evaluate(() => { fernView.view.rotation = 1e-9; renderAll(); fernView.view.rotation = 0; renderAll(); });
      await settled(page, count);
      await snap(page, "normal");
      const d = await compare(page, "replay", "normal");
      // The same picture drawn from other points: the same light, the same hue. The normal render
      // draws from 50,000 base points, so on the fern, whose leaves are thin, the chaos game fills
      // in rather more of its top.
      const slack = m === "fern" ? 0.6 : 0.1;
      expect(Math.abs(d.a.light - d.b.light) / d.b.light, `light ${d.a.light} after the replay, ${d.b.light} after a normal render`).toBeLessThan(slack);
      expect(Math.abs(d.a.lit - d.b.lit) / d.b.lit, `lit ${d.a.lit} / ${d.b.lit}`).toBeLessThan(m === "fern" ? 0.5 : 0.1);
      expect(hueGap(hueOf(d.a.rgb), hueOf(d.b.rgb)), "address colors").toBeLessThan(6);
      expect(d.meanBlock, `mean 8 x 8 block difference`).toBeLessThan(m === "fern" ? 8 : 2.5);
    });

    test(`${m}: the hand-off to the normal render changes no pixel you can see`, async ({ page }) => {
      const count = 100000;
      await startManual(page, m, { count });
      await stepTo(page, count + 12 - 1); // one jump short of the end
      await snap(page, "last");
      expect(await page.evaluate(() => fernView.replaying)).toBe(true);
      await finish(page);
      expect(await page.evaluate(() => fernView.replaying), "it ended").toBe(false);
      expect(await page.evaluate(() => fernView.accepted), "with all its points down, none left for the normal render to add").toBe(count);
      await settled(page, count);
      await snap(page, "after");
      const d = await compare(page, "last", "after");
      expect(d.changed, "pixels that differ by more than 6 levels between the replay's last frames and the normal frame (one point between them)").toBeLessThan(12);
      expect(Math.abs(d.a.light - d.b.light) / d.a.light, "no jump in brightness").toBeLessThan(0.001);
    });
  }

  test("the first jumps follow the seeded random numbers and land where the transforms say", async ({ page }) => {
    for (const m of IFS_MODES) {
      await startManual(page, m, { seed: 99 });
      await stepTo(page, 60.5);
      const r = await page.evaluate(() => {
        const s = fernView.replayState, sys = IFS_SYSTEMS[fernView.system].transforms;
        const rnd = window.__seeded(99); // the same numbers, drawn separately: one per jump, in order
        let x = 0, y = 0, worst = 0, wrongTransform = 0;
        for (let k = 1; k <= 60; k++) {
          const u = rnd();
          let cum = 0, t = sys[sys.length - 1];
          for (const c of sys) { cum += c.p; if (u < cum) { t = c; break; } }
          [x, y] = [t.a * x + t.b * y + t.e, t.c * x + t.d * y + t.f];
          const got = s.seq[k];
          if (got.ci !== t.ci) wrongTransform++;
          worst = Math.max(worst, Math.hypot(got.x - x, got.y - y));
        }
        return { n: s.n, worst, wrongTransform, start: s.seq[0] };
      });
      expect(r.n, `${m}: 60 jumps landed`).toBe(60);
      expect(r.wrongTransform, `${m}: every jump uses the transform the seeded number picks`).toBe(0);
      expect(r.worst, `${m}: and lands on its image, to 1e-9`).toBeLessThan(1e-9);
      expect(r.start, `${m}: from the origin`).toMatchObject({ x: 0, y: 0 });
    }
  });

  test("every replay differs: the default random is Math.random", async ({ page }) => {
    await show(page, "sierpinski");
    const seqs = [];
    for (let i = 0; i < 2; i++) {
      seqs.push(await page.evaluate(() => {
        fernView.startReplay({ ...fernRenderOpts(), manual: true, speed: () => 1, onChange: syncReplayButtons });
        fernView.replayStep(replayTimeOf(30.05, fernView.replayState.total));
        const seq = fernView.replayState.seq.map((p) => p.ci).join("");
        fernView.cancelReplay();
        return seq;
      }));
    }
    expect(seqs[0]).not.toBe(seqs[1]);
  });

  test("the rare rules of the fern are rare: its transforms are used 1 : 85 : 7 : 7", async ({ page }) => {
    await startManual(page, "fern", { count: 100000, seed: 5 });
    await stepTo(page, 20000);
    const used = await page.evaluate(() => fernView.replayState.perTransform);
    const total = used.reduce((a, b) => a + b, 0);
    expect(total).toBe(20000);
    const want = [0.01, 0.85, 0.07, 0.07];
    used.forEach((u, i) => {
      const sd = Math.sqrt(total * want[i] * (1 - want[i]));
      expect(Math.abs(u - total * want[i]), `rule ${i}: ${u} of ${total}`).toBeLessThan(5 * sd);
    });
    expect(used[0], "the stem rule really is rare").toBeLessThan(total * 0.02);
  });

  // The Sierpinski pentagon (the pentaflake): five maps p -> s*p + (1 - s)*v, s = 1/phi^2, v the corners of a
  // regular pentagon (circumradius 1, point up). The chaos game from the app's own sampler (ifsPoints, with
  // a seeded ifsRandom) shows what the maps make.
  test("pentagon: five maps jump 61.8% of the way to the corners of a point-up regular pentagon, and the five copies just touch", async ({ page }) => {
    const r = await page.evaluate(() => {
      const trs = IFS_SYSTEMS.pentagon.transforms, s = (3 - Math.sqrt(5)) / 2; // 1/phi^2 = 0.381966
      const out = { n: trs.length, ratio: 0, shear: 0, weight: 0, corner: 0, angle: 0, edge: [], far: 0, cloud: null };
      const corners = trs.map((t) => [t.e / (1 - t.a), t.f / (1 - t.d)]); // the fixed points
      trs.forEach((t, k) => {
        out.ratio = Math.max(out.ratio, Math.abs(t.a - s), Math.abs(t.d - s));
        out.shear = Math.max(out.shear, Math.abs(t.b), Math.abs(t.c));
        out.weight = Math.max(out.weight, Math.abs(t.p - 0.2));
        out.corner = Math.max(out.corner, Math.abs(Math.hypot(...corners[k]) - 1)); // on the unit circle
        // clockwise from the top, 72 degrees apart
        const want = [Math.sin(2 * Math.PI * k / 5), Math.cos(2 * Math.PI * k / 5)];
        out.angle = Math.max(out.angle, Math.hypot(corners[k][0] - want[0], corners[k][1] - want[1]));
      });
      // Copy k is the pentagon's image under map k. Neighbouring copies share exactly one corner point.
      const image = (t, [x, y]) => [t.a * x + t.b * y + t.e, t.c * x + t.d * y + t.f];
      for (let k = 0; k < 5; k++) {
        const a = corners.map((c) => image(trs[k], c)), b = corners.map((c) => image(trs[(k + 1) % 5], c));
        const d = [];
        for (const p of a) for (const q of b) d.push(Math.hypot(p[0] - q[0], p[1] - q[1]));
        out.edge.push({ closest: Math.min(...d), touching: d.filter((v) => v < 1e-9).length });
      }
      // ... and copies two apart stay clear of each other
      const a0 = corners.map((c) => image(trs[0], c)), a2 = corners.map((c) => image(trs[2], c));
      out.far = Math.min(...a0.flatMap((p) => a2.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
      // The chaos game, 200,000 points
      setIfsRandom(window.__seeded(3));
      const pts = ifsPoints(trs, 200000);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, rmin = Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]);
        rmin = Math.min(rmin, Math.hypot(pts[i], pts[i + 1]));
      }
      out.cloud = { x0, x1, y0, y1, rmin };
      return out;
    });
    expect(r.n).toBe(5);
    expect(r.ratio, "every map shrinks by 1/phi^2").toBeLessThan(1e-12);
    expect(r.shear, "no rotation or shear").toBe(0);
    expect(r.weight, "all five equally likely").toBeLessThan(1e-12);
    expect(r.corner, "the corners are on the unit circle").toBeLessThan(1e-12);
    expect(r.angle, "clockwise from the top, 72 degrees apart").toBeLessThan(1e-12);
    for (const [k, e] of r.edge.entries()) {
      expect(e.closest, `copies ${k} and ${(k + 1) % 5} touch`).toBeLessThan(1e-9);
      expect(e.touching, `copies ${k} and ${(k + 1) % 5} share one corner point`).toBe(1);
    }
    expect(r.far, "copies two apart do not touch").toBeGreaterThan(0.4);
    // The shape fills the pentagon's own box (x within +-sin 72 degrees, y from -cos 36 degrees to 1) but never goes outside it...
    const sin72 = Math.sin(0.4 * Math.PI), cos36 = Math.cos(0.2 * Math.PI);
    expect(r.cloud.x1).toBeLessThanOrEqual(sin72 + 1e-9);
    expect(r.cloud.x0).toBeGreaterThanOrEqual(-sin72 - 1e-9);
    expect(r.cloud.y1).toBeLessThanOrEqual(1 + 1e-9);
    expect(r.cloud.y0).toBeGreaterThanOrEqual(-cos36 - 1e-9);
    expect(r.cloud.x1, `x reaches the corners (${r.cloud.x1})`).toBeGreaterThan(sin72 - 0.03);
    expect(r.cloud.x0).toBeLessThan(-sin72 + 0.03);
    expect(r.cloud.y1).toBeGreaterThan(1 - 0.03);
    expect(r.cloud.y0).toBeLessThan(-cos36 + 0.03);
    // ... and leaves the big hole in the middle (no point within 0.3 of the center: the hole is 0.3136 across from it)
    expect(r.cloud.rmin, `nearest point to the center ${r.cloud.rmin}`).toBeGreaterThan(0.3);
  });

  test("pentagon: Play marks the five corners with rings, as the triangle's three, and the fern and the others have none", async ({ page }) => {
    for (const m of ["pentagon", "sierpinski", "levy", "fern", "vicsek"]) {
      await startManual(page, m, { seed: 4 });
      await stepTo(page, 0.05); // nothing has landed: the dot at the start, the rings
      const r = await page.evaluate(() => {
        const sys = IFS_SYSTEMS[fernView.system], u = fernView.dpr;
        const bg = backdropPixels(els.fernCanvas.width, els.fernCanvas.height), W = els.fernCanvas.width;
        const ctx = els.fernCanvas.getContext("2d");
        // the pixel on a ring's right side (the ring is 7 css px in radius, drawn 1.4 px thick), against the backdrop there
        return { corners: !!sys.corners, rings: sys.transforms.map((t) => {
          const [sx, sy] = fernView.worldToScreen(t.e / (1 - t.a), t.f / (1 - t.d));
          const x = Math.round(sx + 7 * u), y = Math.round(sy), d = ctx.getImageData(x, y, 1, 1).data, o = (y * W + x) * 3;
          return Math.max(d[0] - bg[o], d[1] - bg[o + 1], d[2] - bg[o + 2]);
        }) };
      });
      if (m === "pentagon" || m === "sierpinski") {
        expect(r.corners).toBe(true);
        expect(r.rings.length, `${m}: a ring per corner`).toBe(m === "pentagon" ? 5 : 3);
        for (const [i, v] of r.rings.entries()) expect(v, `${m}: ring ${i} is lit above the backdrop (${r.rings})`).toBeGreaterThan(10); // (the thin ring's antialiasing makes it 20 to 65 levels)
      } else {
        expect(r.corners, m).toBe(false);
      }
      await page.evaluate(() => fernView.cancelReplay());
    }
  });

  for (const m of ["sierpinski", "pentagon", "levy", "vicsek"]) {
    test(`${m}: its rules are used as often as their weights say`, async ({ page }) => {
      await startManual(page, m, { count: 100000, seed: 11 });
      await stepTo(page, 20000);
      const [used, want] = await Promise.all([
        page.evaluate(() => fernView.replayState.perTransform),
        page.evaluate((m) => IFS_SYSTEMS[m].transforms.map((t) => t.p), m),
      ]);
      const total = used.reduce((a, b) => a + b, 0);
      used.forEach((u, i) => {
        const sd = Math.sqrt(total * want[i] * (1 - want[i]));
        expect(Math.abs(u - total * want[i]), `${m} rule ${i}: ${u} of ${total}`).toBeLessThan(5 * sd);
      });
    });
  }

  for (const m of IFS_MODES) {
    test(`${m}: the dot and each fresh point take the address color of the transform just applied`, async ({ page }) => {
      await startManual(page, m, { seed: 21 });
      // 14 jumps down and the 15th nearly landed: the dot is tinted by the transform it flies by
      await stepTo(page, 14.92);
      const r = await page.evaluate(() => {
        const s = fernView.replayState, cols = ifsTransformColors(fernView.system, vectorColors[fernView.system]);
        const px = (x, y) => {
          const d = els.fernCanvas.getContext("2d").getImageData(Math.round(x), Math.round(y), 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        // the marks of the first jumps (clear of the trail, which is the last seven)
        const marks = [];
        for (let j = 1; j <= 7; j++) {
          const p = s.seq[j], [sx, sy] = fernView.worldToScreen(p.x, p.y);
          marks.push({ ci: p.ci, got: px(sx, sy), want: cols[p.ci].map(Math.round) });
        }
        return { dot: s.dot, nci: s.nci, want: cols[s.nci], marks };
      });
      // the dot: white-hot while it sits, then the chosen color lightened a quarter toward white
      expect(r.dot, "a dot is on screen").toBeTruthy();
      const tinted = r.want.map((v) => Math.round(0.75 * v + 0.25 * 255));
      for (const [q, v] of r.dot.rgb.split(",").map(Number).entries()) expect(Math.abs(v - tinted[q])).toBeLessThanOrEqual(12);
      // and the picture around it has that hue (the ring where its glow is tinted)
      const ring = await page.evaluate(({ x, y }) => {
        const u = Math.min(window.devicePixelRatio || 1, 2), c = els.fernCanvas.getContext("2d");
        const sum = [0, 0, 0];
        const bgd = backdropPixels(els.fernCanvas.width, els.fernCanvas.height);
        const W = els.fernCanvas.width;
        for (let i = 0; i < 48; i++) {
          const a = i / 48 * 2 * Math.PI, px = Math.round(x + Math.cos(a) * 5 * u), py = Math.round(y + Math.sin(a) * 5 * u);
          const d = c.getImageData(px, py, 1, 1).data;
          for (let q = 0; q < 3; q++) sum[q] += d[q] - bgd[(py * W + px) * 3 + q];
        }
        return sum;
      }, r.dot);
      expect(hueGap(hueOf(ring), hueOf(r.want)), `${m}: ring hue ${Math.round(hueOf(ring))}, color hue ${Math.round(hueOf(r.want))}`).toBeLessThan(35);
      // the fresh points left behind are in their transforms' colors (most of the seven: a later jump may cross one)
      const good = r.marks.filter((k) => k.got.every((v, q) => Math.abs(v - k.want[q]) <= 24)).length;
      expect(good, `marks of the first jumps: ${JSON.stringify(r.marks)}`).toBeGreaterThanOrEqual(5);
    });
  }

  test("the dot's color follows the picked color", async ({ page }) => {
    await show(page, "sierpinski");
    await page.evaluate(() => { setFernColor(3); requestRender(); }); // Ice
    await settled(page, await page.evaluate(() => fernState.count));
    await page.evaluate(() => {
      setIfsRandom(window.__seeded(3));
      fernView.startReplay({ ...fernRenderOpts(), manual: true, speed: () => 1, onChange: syncReplayButtons });
    });
    await stepTo(page, 9.9);
    const [dot, nci] = await page.evaluate(() => [fernView.replayState.dot.rgb, fernView.replayState.nci]);
    const want = await page.evaluate((nci) => ifsTransformColors("sierpinski", 3)[nci].map((v) => Math.round(0.75 * v + 0.25 * 255)), nci);
    dot.split(",").map(Number).forEach((v, q) => expect(Math.abs(v - want[q])).toBeLessThanOrEqual(12));
  });

  test("Sierpinski: the three corners are marked faintly in the slow phase, the others have none", async ({ page }) => {
    await startManual(page, "sierpinski", { seed: 4 });
    await stepTo(page, 0.2);
    // a ring around each corner: lit pixels at its radius, and none in the middle of the corner itself
    const corners = await page.evaluate(() => IFS_SYSTEMS.sierpinski.transforms.map((t) => fernView.worldToScreen(t.e / (1 - t.a), t.f / (1 - t.d))));
    const u = await page.evaluate(() => Math.min(window.devicePixelRatio || 1, 2));
    for (const [x, y] of corners) {
      const d = await page.evaluate(([x, y, r]) => {
        const c = els.fernCanvas.getContext("2d"), bg = backdropPixels(els.fernCanvas.width, els.fernCanvas.height), W = els.fernCanvas.width;
        const diff = (px, py) => { const p = c.getImageData(px, py, 1, 1).data; return Math.max(...[0, 1, 2].map((q) => Math.abs(p[q] - bg[(py * W + px) * 3 + q]))); };
        // the ring is a thin line, so look along a few pixels either side of its radius
        const ring = Math.max(...[-2, -1, 0, 1, 2].map((o) => diff(Math.round(x + r + o), Math.round(y))));
        return { ring, centre: diff(Math.round(x), Math.round(y)) };
      }, [x, y, 7 * u]);
      expect(d.ring, "the ring").toBeGreaterThan(12);
      expect(d.centre, "the corner itself is left clear").toBeLessThan(12);
    }
    await page.evaluate(() => fernView.cancelReplay());
  });

  test("a zoomed and turned view is framed first, as Reset does, and Back returns to it", async ({ page }) => {
    await show(page, "fern");
    await page.evaluate(() => {
      Object.assign(fernView.view, { cx: 0.6, cy: 8.5, halfHeight: 0.9, rotation: 0.7 });
      requestRender();
    });
    await page.waitForFunction(() => !fernView.refining && fernView.accepted > 0);
    expect(await page.evaluate(() => vectorViewIsFitted("fern"))).toBe(false);
    await page.evaluate(() => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4); syncReplayButtons(); });
    await page.locator("#fernReplayBtn").click();
    expect(await page.evaluate(() => vectorViewIsFitted("fern")), "Play frames the whole fern").toBe(true);
    await page.waitForFunction(() => !fernView.replaying, null, { timeout: 30_000 });
    await settled(page, await page.evaluate(() => fernState.count));
    await page.locator("#fernBackBtn").click();
    const v = await page.evaluate(() => ({ ...fernView.view }));
    expect(v).toMatchObject({ cx: 0.6, cy: 8.5, halfHeight: 0.9 });
    expect(v.rotation).toBeCloseTo(0.7, 6);
  });
});

test.describe("what ends a replay", () => {
  // Starts a manual replay part way and returns once it is on screen.
  async function running(page, m = "fern") {
    await startManual(page, m, { count: 200000 });
    await stepTo(page, 400.05);
    expect(await page.evaluate(() => fernView.replaying)).toBe(true);
    expect(await lit(page)).toBeLessThan(40000);
  }
  const finishedAs = async (page) => {
    await settled(page, 200000);
    await expect(page.locator("#fernReplayBtn")).toHaveAttribute("aria-label", "Play replay");
    const area = await page.evaluate(() => els.fernCanvas.width * els.fernCanvas.height);
    expect(await lit(page), "the normal picture is back, all of it").toBeGreaterThan(area * 0.015); // a view zoomed by the wheel fills less
  };

  test("a touch on the picture", async ({ page }) => {
    await running(page);
    const r = await page.locator("#fernCanvas").boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await finishedAs(page);
  });

  test("a pan", async ({ page }) => {
    await running(page);
    const r = await page.locator("#fernCanvas").boundingBox();
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width / 2 + 40, r.y + r.height / 2 + 30, { steps: 4 });
    await page.mouse.up();
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await finishedAs(page);
  });

  test("the mouse wheel", async ({ page }) => {
    await running(page);
    await page.evaluate(() => { // a synthetic event: mobile WebKit has no mouse wheel to send
      const r = els.fernCanvas.getBoundingClientRect();
      els.fernCanvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
    });
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await finishedAs(page);
  });

  test("a pinch and a twist", async ({ page }) => {
    await running(page);
    await page.evaluate(() => {
      HTMLElement.prototype.setPointerCapture = () => {}; // synthetic pointers have nothing to capture
      const canvas = els.fernCanvas, r = canvas.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      const fire = (type, id, x, y) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch" }));
      fire("pointerdown", 1, cx - 40, cy); fire("pointerdown", 2, cx + 40, cy);
      fire("pointermove", 1, cx - 50, cy - 20); fire("pointermove", 2, cx + 50, cy + 20);
      fire("pointerup", 1, cx - 50, cy - 20); fire("pointerup", 2, cx + 50, cy + 20);
    });
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await finishedAs(page);
  });

  test("keys that move the view", async ({ page }) => {
    await running(page);
    await page.keyboard.press("ArrowLeft");
    await finishedAs(page);
  });

  test("another dot shape, another mode", async ({ page }) => {
    await running(page, "fern");
    await page.evaluate(() => setMode("sierpinski"));
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await page.waitForFunction(() => fernView.system === "sierpinski" && !fernView.refining && fernView.accepted > 0);
    await expect(page.locator("#fernReplayBtn")).toHaveAttribute("aria-label", "Play replay");
    await running(page, "levy");
    await page.evaluate(() => setMode("koch"));
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await expect(page.locator("#fernReplayBtn")).toHaveAttribute("aria-label", "Play replay");
  });

  test("a new color", async ({ page }) => {
    await running(page);
    await page.evaluate(() => { setFernColor(4); requestRender(); }); // the render comes on the next frame
    await page.waitForFunction(() => !fernView.replaying);
    await finishedAs(page);
    // and the picture is in the new color: hue near Rose, not Green
    const hue = await page.evaluate(() => {
      const c = els.fernCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { if (Math.max(d[i], d[i + 1], d[i + 2]) > 80) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } } // the lit pixels
      return [r, g, b];
    });
    expect(hueGap(hueOf(hue), hueOf([214, 92, 140])), "Rose").toBeLessThan(60);
  });

  test("the points slider", async ({ page }) => {
    await running(page);
    await page.evaluate(() => {
      els.fernPointsSlider.value = 300000;
      els.fernPointsSlider.dispatchEvent(new Event("input"));
    });
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await settled(page, 300000);
    expect(await page.evaluate(() => fernState.count)).toBe(300000);
  });

  test("Reset", async ({ page }) => {
    await running(page);
    await page.locator("#fernResetBtn").click();
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await finishedAs(page);
  });

  test("a paused replay is ended by the same things, and a later Play starts over", async ({ page }) => {
    await show(page, "vicsek");
    await page.locator("#fernReplayBtn").click();
    await page.waitForTimeout(500);
    await page.locator("#fernReplayBtn").click(); // pause
    expect(await page.evaluate(() => fernView.replaying)).toBe(true);
    const n = await page.evaluate(() => fernView.replayState.n);
    expect(n).toBeGreaterThan(0);
    await page.evaluate(() => { els.fernPointsSlider.value = 400000; els.fernPointsSlider.dispatchEvent(new Event("input")); });
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await settled(page, 400000);
    await page.locator("#fernReplayBtn").click();
    expect(await page.evaluate(() => fernView.replayState.n), "from the start again").toBeLessThan(3);
    await page.evaluate(() => fernView.cancelReplay());
  });

  test("Save image and Share capture the finished normal frame, not a partial replay", async ({ page }) => {
    await running(page, "sierpinski");
    const partial = await lit(page);
    const result = await page.evaluate(async () => {
      const blob = await captureShareBlob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const bg = backdropPixels(els.fernCanvas.width, els.fernCanvas.height);
      let n = 0;
      for (let i = 0; i < els.fernCanvas.width * els.fernCanvas.height; i++) {
        if (Math.max(Math.abs(d[4 * i] - bg[3 * i]), Math.abs(d[4 * i + 1] - bg[3 * i + 1]), Math.abs(d[4 * i + 2] - bg[3 * i + 2])) > 8) n++;
      }
      return { replaying: fernView.replaying, accepted: fernView.accepted, lit: n, w: bmp.width };
    });
    expect(result.replaying, "the replay ended").toBe(false);
    expect(result.accepted, "every point plotted").toBeGreaterThanOrEqual(200000);
    expect(result.lit, `the saved image (${result.lit} lit pixels) holds the whole picture, not the ${partial} of the replay`).toBeGreaterThan(partial * 2);
  });

  test("Back history and the share link do not know about the replay", async ({ page }) => {
    await startManual(page, "sierpinski", { count: 200000, seed: 1 });
    const link = await page.evaluate(() => buildShareHash());
    await stepTo(page, 300.05);
    expect(await page.evaluate(() => buildShareHash()), "same link while it plays").toBe(link);
    expect(link).not.toMatch(/replay/i);
    await page.evaluate(() => fernView.cancelReplay());
  });

  test("it ends cleanly when the hard cap is reached on a slow device, and the normal render finishes the picture", async ({ page }) => {
    const count = 1000000;
    await startManual(page, "fern", { count });
    // a device that lands only a few thousand jumps a frame: it falls behind the schedule, and
    // at REPLAY_CAP_S the rest is left to the normal render
    const steps = await page.evaluate(async () => {
      let k = 0;
      while (fernView.replaying && k < 400) { fernView.replayStep(0.1, 0); k++; }
      return { k, replaying: fernView.replaying, n: fernView.accepted };
    });
    expect(steps.replaying).toBe(false);
    expect(steps.k, "at 10 s of schedule time (100 frames of 0.1 s)").toBeLessThanOrEqual(101);
    expect(steps.k).toBeGreaterThanOrEqual(99);
    await settled(page, count);
  });
});

// ---------------------------------------------------------------------------------------------------
// The Long run (the app's Play): per-run schedule, a stop point per shape, a seed, the counter.

// Starts a Long run on the manual clock as the app's Play starts it (startDotRun), with the points
// slider at `count`: the Long options, the shape's stop point, the seed's random numbers.
async function startLongManual(page, m, { count = 1000000, seed = 7, extra = {} } = {}) {
  await show(page, m);
  await page.evaluate(([count, seed, extra]) => {
    fernState.count = count;
    els.fernPointsSlider.value = count;
    if (!vectorViewIsFitted(mode)) fitVectorView(mode);
    fernView.startReplay({
      ...fernRenderOpts(), ...REPLAY_LONG, stop: replayStopPoints(fernView.system, count), rng: seededRandom(seed), seed,
      manual: true, speed: () => 1, onChange: syncReplayButtons, onDone: announceRunDone, ...extra,
    });
  }, [count, seed, extra]);
}

// Moves a manual run to the time at which n jumps are done, by the run's own schedule, and does what the
// animation loop does after each frame (the info card and the counter chip update).
function stepRunTo(page, n) {
  return page.evaluate((n) => {
    const s = fernView.replayState;
    if (s) fernView.replayStep(Math.max(0, s.sched.timeOf(n + 1e-6, s.total) - s.t));
    updateFernHud();
  }, n);
}

test.describe("the Quick run is exactly what it was", () => {
  const GOLDEN = JSON.parse(readFileSync(new URL("./dot-replay-goldens.json", import.meta.url), "utf8"));
  for (const m of IFS_MODES) {
    for (const seed of [1, 7]) {
      test(`${m}, seed ${seed}: the first 150 jumps, their points and their transforms, as recorded before the Long run existed`, async ({ page }) => {
        await show(page, m);
        const got = await page.evaluate(([seed]) => {
          setIfsRandom(window.__seeded(seed));
          fernState.count = 200000;
          els.fernPointsSlider.value = 200000;
          if (!vectorViewIsFitted(mode)) fitVectorView(mode);
          fernView.startReplay({ ...fernRenderOpts(), manual: true, speed: () => 1, onChange: syncReplayButtons });
          const s0 = fernView.replayState;
          fernView.replayStep(Math.max(0, replayTimeOf(150, s0.total) - s0.t));
          const s = fernView.replayState;
          const r = { total: s.total, n: s.n, perTransform: s.perTransform, seq: s.seq.map((p) => [p.x, p.y, p.ci]), seqLen: s.seqLen, capS: s.capS, trail: s.trail, liveFade: s.liveFade, slowJumps: s.sched.slowJumps };
          fernView.cancelReplay();
          return r;
        }, [seed]);
        const want = GOLDEN[`${m}-${seed}`];
        expect(got.total).toBe(want.total);
        expect(got.n).toBe(want.n);
        expect(got.perTransform).toEqual(want.perTransform);
        expect(got.seq.length).toBe(want.seq.length);
        expect(got.seq, "every point of the first 100 jumps, to the last bit").toEqual(want.seq);
        // and the look: the constants of the default run
        expect(got).toMatchObject({ seqLen: 100, capS: 10, trail: 6, liveFade: 60, slowJumps: 24 });
      });
    }
  }
});

test.describe("the seed", () => {
  test("seededRandom is the generator the tests and the Shorts use, and the same seed gives the same numbers", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = { same: true, differ: false, range: true, equalToHelper: true };
      for (const seed of [1, 7, 482913, 999999]) {
        const a = seededRandom(seed), b = seededRandom(seed), c = window.__seeded(seed);
        for (let i = 0; i < 200; i++) {
          const x = a();
          if (x !== b()) out.same = false;
          if (x !== c()) out.equalToHelper = false;
          if (!(x >= 0 && x < 1)) out.range = false;
        }
      }
      const p = seededRandom(1), q = seededRandom(2);
      for (let i = 0; i < 10; i++) if (p() !== q()) out.differ = true;
      return out;
    });
    expect(r).toEqual({ same: true, differ: true, range: true, equalToHelper: true });
  });

  test("a run with a seed jumps the same way every time, another seed another way, and ifsRandom is left alone", async ({ page }) => {
    await show(page, "sierpinski");
    const r = await page.evaluate(() => {
      let touched = 0;
      setIfsRandom(() => { touched++; return 0.5; }); // would be used by a run without rng
      const run = (seed) => {
        fernView.startReplay({ ...fernRenderOpts(), manual: true, speed: () => 1, onChange: syncReplayButtons, rng: seededRandom(seed), seed });
        const s0 = fernView.replayState;
        fernView.replayStep(replayTimeOf(60, s0.total));
        const s = fernView.replayState, out = { seed: s.seed, seq: s.seq.map((p) => `${p.ci}:${p.x}:${p.y}`).join(" "), pt: s.perTransform };
        fernView.cancelReplay();
        return out;
      };
      const a = run(482913), b = run(482913), c = run(482914);
      const out = { a, b, c, touched };
      setIfsRandom(Math.random);
      return out;
    });
    expect(r.touched, "a run that has its own random numbers never asks ifsRandom").toBe(0);
    expect(r.a.seq).toBe(r.b.seq);
    expect(r.a.seq).not.toBe(r.c.seq);
    expect(r.a.seed).toBe(482913);
    expect(r.c.seed).toBe(482914);
  });

  test("a run without rng still uses ifsRandom as it is when it is called, and ifsRandom starts as Math.random", async ({ page }) => {
    expect(await page.evaluate(() => ifsRandom === Math.random)).toBe(true);
    await show(page, "sierpinski");
    const r = await page.evaluate(() => {
      let calls = 0;
      setIfsRandom(() => { calls++; return 0.01; });
      fernView.startReplay({ ...fernRenderOpts(), manual: true, speed: () => 1, onChange: syncReplayButtons });
      fernView.replayStep(replayTimeOf(10.05, fernView.replayState.total));
      const out = { calls, seed: fernView.replayState.seed, ci: fernView.replayState.seq.map((p) => p.ci).join("") };
      fernView.cancelReplay();
      setIfsRandom(Math.random);
      return out;
    });
    expect(r.calls).toBe(11); // the first pick and one per landed jump
    expect(r.seed).toBeNull();
    expect(r.ci).toBe("-1" + "0".repeat(10)); // (the start, jump 0, has no transform: -1; 0.01 always picks the first)
  });

  test("a seed is six digits at most, a new one each time, and parseRunSeed takes only such numbers", async ({ page }) => {
    const r = await page.evaluate(() => ({
      seeds: Array.from({ length: 300 }, () => newRunSeed()),
      parse: ["1", "999999", "482913", "0", "1000000", "-5", "12.5", "abc", "", null, undefined, "0123", "1e3"].map((v) => parseRunSeed(v)),
    }));
    expect(r.seeds.every((s) => Number.isInteger(s) && s >= 1 && s <= 999999)).toBe(true);
    expect(new Set(r.seeds).size, "not the same seed over and over").toBeGreaterThan(250);
    expect(r.parse).toEqual([1, 999999, 482913, 0, 0, 0, 0, 0, 0, 0, 0, 123, 0]);
  });
});

test.describe("the Long run's schedule", () => {
  test("for 100 and 300 slow jumps: monotonic, the inverse holds, no lurch where the ramp begins, the length is what the last gap says", async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const [N, total] of [[100, 200012], [100, 500012], [300, 1000012], [24, 1000012]]) {
        const gapLast = N === 24 ? 0.06 : replayGapLast(N, total, 4.5);
        const s = replaySchedule({ slowJumps: N, gapFirst: 0.3, gapLast, rampS: 4.5 });
        let prev = -1, back = 0;
        for (let t = 0; t <= s.durationS + 0.5; t += 0.01) { const j = s.jumpsAt(t, total); if (j < prev) back++; prev = j; }
        const probes = [1, 5.5, N - 0.1, N, N + 1, 5000, Math.floor(total / 2), total - 1, total];
        const inv = probes.map((n) => s.jumpsAt(s.timeOf(n, total), total) / n);
        const rateBefore = (s.jumpsAt(s.slowS - 0.01, total) - s.jumpsAt(s.slowS - 0.06, total)) / 0.05;
        const rateAfter = (s.jumpsAt(s.slowS + 0.06, total) - s.jumpsAt(s.slowS + 0.01, total)) / 0.05;
        out.push({ N, total, back, inv, step: rateAfter / rateBefore, dur: s.durationS, end: s.jumpsAt(s.durationS + 1, total), gapLast, firstS: s.timeOf(1, total) });
      }
      return out;
    });
    for (const s of r) {
      expect(s.back, `N=${s.N}`).toBe(0);
      for (const q of s.inv) expect(q, `N=${s.N}: timeOf inverts jumpsAt`).toBeCloseTo(1, 6);
      expect(s.step, `N=${s.N}: the pace step where the ramp begins`).toBeGreaterThan(0.5);
      expect(s.step).toBeLessThan(2);
      expect(s.end).toBe(s.total);
      expect(s.firstS, "the first jump is slow and visible").toBeGreaterThan(0.25);
    }
    // the durations of the spec's table: Long (100) about 14.8 s for a million points, 300 about 28 s, Quick 8.1 s
    expect(r[1].dur).toBeGreaterThan(14.5); expect(r[1].dur).toBeLessThan(15.5);
    expect(r[2].dur).toBeGreaterThan(27.5); expect(r[2].dur).toBeLessThan(29);
    expect(r[3].dur).toBeCloseTo(await page.evaluate(() => REPLAY_SLOW_S + REPLAY_RAMP_S), 12);
  });

  test("with 24 slow jumps and the default gaps the factory is the default schedule to the last bit", async ({ page }) => {
    const r = await page.evaluate(() => {
      const s = replaySchedule({ slowJumps: 24, gapFirst: 0.3, gapLast: 0.06, rampS: 4.5 });
      let diff = 0;
      for (const total of [200012, 1000012]) {
        for (let t = 0; t < 9; t += 0.0137) diff += Math.abs(s.jumpsAt(t, total) - replayJumpsAt(t, total));
        for (const n of [0.5, 3.3, 23.9, 24, 99, 1e4, 150000, total]) diff += Math.abs(s.timeOf(n, total) - replayTimeOf(n, total));
      }
      return { diff, same: s.slowS === REPLAY_DEFAULT_SCHEDULE.slowS, cap: REPLAY_CAP_RATIO };
    });
    expect(r.diff).toBe(0);
    expect(r.same).toBe(true);
    expect(r.cap).toBe(1.25);
  });

  for (const m of IFS_MODES) {
    test(`${m}: Play's Long run takes about 15 s at 1x, stops at the shape's point and the normal render carries on to the slider's count`, async ({ page }) => {
      const count = 1000000;
      await startLongManual(page, m, { count });
      const s0 = await page.evaluate(() => { const s = fernView.replayState; return { stop: s.stop, total: s.total, dur: s.sched.durationS, slow: s.sched.slowJumps, capS: s.capS, trail: s.trail, seqLen: s.seqLen, gapLast: s.sched.gapLast }; });
      const want = await page.evaluate((m) => IFS_STOP_POINTS[m], m);
      expect(s0.stop, `${m}: stop point`).toBe(want);
      expect(s0.total, "the stop point plus the burn-in").toBe(want + 12);
      expect(s0.slow).toBe(100);
      expect(s0.dur, `${m}: ${s0.dur.toFixed(2)} s`).toBeGreaterThan(14);
      expect(s0.dur).toBeLessThan(16);
      expect(s0.capS, "the cap is 1.25 x the nominal length").toBeCloseTo(1.25 * s0.dur, 9);
      expect(s0.trail, "a longer trail than the default 6").toBeGreaterThan(6);
      expect(s0.seqLen, "the sequence keeps every jump the trail can still show").toBe(100 + 60 + 4);
      // play it out in 1/20 s steps of schedule time, as a device on time would
      const run = await page.evaluate(() => {
        let k = 0, t = 0;
        while (fernView.replaying && k < 2000) { fernView.replayStep(0.05); k++; if (fernView.replaying) t = fernView.replayState.t; }
        return { k, t, replaying: fernView.replaying, accepted: fernView.accepted };
      });
      expect(run.replaying).toBe(false);
      expect(run.t, `the last frame before the hand-off was at ${run.t.toFixed(2)} s`).toBeGreaterThan(s0.dur - 0.2);
      expect(run.k * 0.05, "ended by its own last point, not by the cap").toBeLessThan(s0.dur + 0.1);
      // the replay put down `stop` points (all on screen: the shape is framed); the normal render adds the rest
      expect(run.accepted, "at the hand-off the picture holds the stop point's points, then a slice of the top-up").toBeGreaterThanOrEqual(want * 0.97);
      expect(run.accepted, "it did not stop at the slider's count").toBeLessThan(count * 0.9);
      await settled(page, count);
      expect(await page.evaluate(() => fernView.accepted), "the normal render went on to the slider's count").toBeGreaterThanOrEqual(count);
    });
  }

  test("the stop point is the shape's, but never more than the slider's count", async ({ page }) => {
    const r = await page.evaluate(() => ({
      table: IFS_STOP_POINTS,
      small: ["fern", "sierpinski", "pentagon", "levy", "vicsek"].map((k) => replayStopPoints(k, 150000)),
      big: ["fern", "sierpinski", "pentagon", "levy", "vicsek"].map((k) => replayStopPoints(k, 4000000)),
    }));
    expect(r.table).toEqual({ fern: 500000, sierpinski: 200000, pentagon: 300000, levy: 300000, vicsek: 200000, corners: 200000 });
    expect(r.small).toEqual([150000, 150000, 150000, 150000, 150000]);
    expect(r.big).toEqual([500000, 200000, 300000, 300000, 200000]);
    // a short slider ends the run at the slider: no top-up is left
    await startLongManual(page, "sierpinski", { count: 100000 });
    expect(await page.evaluate(() => fernView.replayState.stop)).toBe(100000);
    await page.evaluate(() => fernView.cancelReplay());
  });

  test("a slow device: the cap of a Long run is 1.25 x its length, and the normal render finishes the picture", async ({ page }) => {
    const count = 1000000;
    await startLongManual(page, "fern", { count }); // (its 500,000 points are more than a device landing a few thousand jumps a frame can reach before the cap)
    const cap = await page.evaluate(() => fernView.replayState.capS);
    const steps = await page.evaluate(() => {
      let k = 0;
      while (fernView.replaying && k < 1000) { fernView.replayStep(0.1, 0); k++; }
      return { k, accepted: fernView.accepted };
    });
    expect(steps.k * 0.1, "ended at the cap").toBeGreaterThan(cap - 0.15);
    expect(steps.k * 0.1).toBeLessThan(cap + 0.15);
    await settled(page, count);
  });
});

test.describe("the counter", () => {
  for (const m of IFS_MODES) {
    test(`${m}: points and coverage equal an independent recomputation from the seeded chaos game, and never go down`, async ({ page }) => {
      const seed = 31;
      await startLongManual(page, m, { count: 1000000, seed });
      const r = await page.evaluate(async (seed) => {
        const sys = IFS_SYSTEMS[fernView.system].transforms, base = ifsData(fernView.system).base;
        // the cell (canvas px / cell size) a world point falls in under the view, as the counter sees it
        const W = els.fernCanvas.width, H = els.fernCanvas.height, st0 = fernView.replayState, cell = st0.cell, gw = st0.coverW;
        const cellOf = (x, y) => {
          const [sx, sy] = fernView.worldToScreen(x, y);
          const px = Math.floor(sx), py = Math.floor(sy);
          return px < 0 || px >= W || py < 0 || py >= H ? -1 : Math.floor(py / cell) * gw + Math.floor(px / cell);
        };
        // the reference cells: where the shape's 50,000 precomputed points fall
        const ref = new Set();
        for (let i = 0; i < base.length; i += 2) { const c = cellOf(base[i], base[i + 1]); if (c >= 0) ref.add(c); }
        const rnd = seededRandom(seed);
        const pick = (u) => { let cum = 0; for (const t of sys) { cum += t.p; if (u < cum) return t; } return sys[sys.length - 1]; };
        let t = pick(rnd()), x = 0, y = 0, n = 0;
        const lit = new Set();
        let litRef = 0;
        const checks = [], marks = [3, 12, 13, 14, 40, 100, 101, 1000, 5000, 20000, 100000];
        let prevCov = 0, down = 0, prevPoints = 0;
        for (const target of marks) {
          // the independent game, up to target
          while (n < target) {
            [x, y] = [t.a * x + t.b * y + t.e, t.c * x + t.d * y + t.f];
            n++;
            if (n > 12) { const c = cellOf(x, y); if (c >= 0 && !lit.has(c)) { lit.add(c); if (ref.has(c)) litRef++; } }
            t = pick(rnd());
          }
          const s = fernView.replayState;
          fernView.replayStep(Math.max(0, s.sched.timeOf(target + 1e-6, s.total) - s.t));
          updateFernHud();
          const st = fernView.runStats;
          if (st.coverage < prevCov || st.points < prevPoints) down++;
          prevCov = st.coverage; prevPoints = st.points;
          checks.push({ target, n: st.n, points: st.points, lit: st.lit, wantLit: litRef, refCells: st.refCells, wantRef: ref.size, coverage: st.coverage, wantCov: Math.min(1, litRef / ref.size), chip: runChipText(st), chipPoints: formatPointCount(st.points) });
        }
        return { checks, down };
      }, seed);
      for (const c of r.checks) {
        expect(c.n, `n at ${c.target}`).toBe(c.target);
        expect(c.points, `points at ${c.target}: every jump made, as many as the dots on screen`).toBe(c.target);
        expect(c.refCells, "the reference cells").toBe(c.wantRef);
        expect(c.lit, `${m}: lit cells at ${c.target} jumps`).toBe(c.wantLit);
        expect(c.coverage).toBeCloseTo(c.wantCov, 12);
        expect(c.coverage).toBeLessThanOrEqual(1);
        expect(c.chip, `the chip at ${c.target}`).toBe(`${c.chipPoints} ${c.points === 1 ? "point" : "points"} · ${Math.floor(c.wantCov * 100 + 1e-9)}% filled`);
      }
      expect(r.down, "points and coverage only go up").toBe(0);
      await page.evaluate(() => fernView.cancelReplay());
    });
  }

  test("formatPointCount: exact below 10,000, then thousand and million", async ({ page }) => {
    const table = [
      [0, "0"], [1, "1"], [999, "999"], [1204, "1,204"], [9999, "9,999"], [10000, "10 thousand"], [12345, "12.3 thousand"], [12949, "12.9 thousand"],
      [50000, "50 thousand"], [99940, "99.9 thousand"], [99960, "100 thousand"], [123456, "123 thousand"], [500000, "500 thousand"], [999499, "999 thousand"], [999500, "1 million"],
      [999999, "1 million"], [1000000, "1 million"], [1049999, "1 million"], [1234567, "1.2 million"], [1960000, "2 million"], [4000000, "4 million"], [12000000, "12 million"], [999999999, "1 billion"], [2500000000, "2.5 billion"],
      [-5, "0"], [9999.9, "9,999"],
    ];
    const got = await page.evaluate((table) => table.map(([n]) => formatPointCount(n)), table);
    table.forEach(([n, want], i) => expect(got[i], `formatPointCount(${n})`).toBe(want));
  });

  test("the counter counts every dot drawn from the first jump, on every shape: it never lags the dots on screen", async ({ page }) => {
    // (the first 12 jumps are still off the shape and stay out of the picture's density and the coverage, but they are
    // drawn as dots, so they count here: the counter once read 0 points for the first 12 dots and stayed 12 behind)
    for (const m of IFS_MODES) {
      await startLongManual(page, m, { seed: 5 });
      for (const n of [1, 5, 12, 13, 40]) {
        await stepRunTo(page, n);
        expect(await page.evaluate(() => fernView.replayState.n), `${m}: jumps landed`).toBe(n);
        expect(await page.evaluate(() => runChipText(fernView.runStats)), `${m}: the counter at ${n} dots`).toMatch(new RegExp(`^${n} ${n === 1 ? "point" : "points"} · \\d+% filled$`));
      }
      await page.evaluate(() => fernView.cancelReplay());
    }
  });

  test("the ring on Play shows while a run is on, follows how far it has played, stays when paused, is gone when it is cancelled, and takes no taps", async ({ page }) => {
    await startLongManual(page, "sierpinski", { seed: 5 });
    const btn = page.locator("#fernReplayBtn");
    await expect(btn).toHaveClass(/\bringOn\b/);
    await expect(btn).toHaveAttribute("data-pct", "0");
    await stepRunTo(page, 1216);
    const p1 = Number(await btn.getAttribute("data-pct"));
    await stepRunTo(page, 30012);
    const p2 = Number(await btn.getAttribute("data-pct"));
    expect(p1, "some of the run has played").toBeGreaterThan(0);
    expect(p2, "and it only goes forward").toBeGreaterThan(p1);
    const ring = await page.evaluate(() => {
      const r = document.querySelector("#fernReplayBtn .ring"), fill = r.querySelector(".fill");
      const [on, total] = fill.getAttribute("stroke-dasharray").split(" ").map(Number);
      return { pe: getComputedStyle(r).pointerEvents, hidden: r.getAttribute("aria-hidden"), desc: document.getElementById("fernReplayBtn").getAttribute("aria-description"), share: on / total };
    });
    expect(ring.pe).toBe("none");
    expect(ring.hidden, "decoration: the percent is the button's description").toBe("true");
    expect(ring.desc).toBe(`${p2}% played`);
    expect(ring.share, "the drawn arc is the percent").toBeCloseTo(p2 / 100, 1);
    expect(await page.locator("#runChip").count(), "no counter floats over the canvas any more").toBe(0);
    await page.evaluate(() => fernView.pauseReplay());
    await expect(btn, "still there when paused").toHaveClass(/\bringOn\b/);
    await page.evaluate(() => { fernView.cancelReplay(); requestRender(); });
    await expect(btn).not.toHaveClass(/\bringOn\b/);
    await settled(page, await page.evaluate(() => fernState.count));
    await expect(btn).not.toHaveClass(/\bringOn\b/);
    await expect(btn).not.toHaveAttribute("aria-description", /.+/);
  });

  test("the ring closes when the run ends by itself, holds for a moment, then goes", async ({ page }) => {
    await startLongManual(page, "sierpinski", { seed: 5 });
    await page.evaluate(() => { const s = fernView.replayState; fernView.replayStep(s.sched.timeOf(s.total, s.total) - s.t + 0.01); updateFernHud(); });
    const btn = page.locator("#fernReplayBtn");
    expect(await page.evaluate(() => fernView.replaying), "the run is over").toBe(false);
    await expect(btn, "closed").toHaveClass(/\bringDone\b/);
    await expect(btn).toHaveAttribute("data-pct", "100");
    await expect(btn).toHaveClass(/\bringOn\b/);
    await page.waitForTimeout((await page.evaluate(() => RING_HOLD_MS)) + 400);
    await expect(btn, "gone after the hold").not.toHaveClass(/\bringOn\b/);
  });

  test("the ring takes the shape's picked colour and follows a change of colour", async ({ page }) => {
    await startLongManual(page, "sierpinski", { seed: 5 });
    const color = () => page.evaluate(() => ({
      set: document.getElementById("fernReplayBtn").style.getPropertyValue("--run-ring"),
      drawn: getComputedStyle(document.querySelector("#fernReplayBtn .ring .fill")).stroke.replace(/\s/g, ""),
    }));
    await page.evaluate(() => setFernColor(3));
    const a = await color();
    await page.evaluate(() => setFernColor(4));
    const b = await color();
    expect(a.set).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    expect(b.set, "another colour, another ring").not.toBe(a.set);
    expect(a.drawn, "the ring is drawn in it").toBe(a.set);
    expect(b.drawn).toBe(b.set);
    await page.evaluate(() => fernView.cancelReplay());
  });

  for (const width of [360, 393]) {
    test(`at ${width} px the ring sits on the Play button and inside the toolbar row, in every shape`, async ({ page }) => {
      await page.setViewportSize({ width, height: 852 });
      for (const m of IFS_MODES) {
        await startLongManual(page, m, { seed: 9 });
        await page.evaluate(() => { const s = fernView.replayState; fernView.replayStep(s.sched.timeOf(s.total / 2, s.total) - s.t); updateFernHud(); }); // part way: the ring is on
        await expect(page.locator("#fernReplayBtn .ring"), `${m}: the ring is visible (it fades in)`).toHaveCSS("opacity", "1");
        const b = await page.evaluate(() => {
          const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; };
          const btn = document.getElementById("fernReplayBtn");
          return { ring: rect(btn.querySelector(".ring")), btn: rect(btn), row: rect(document.getElementById("fernControls")) };
        });
        expect(b.ring.x, `${m}: on the button's edge on the left (the button's 1 px border is where the ring's box starts)`).toBeCloseTo(b.btn.x, 0);
        expect(b.ring.right, `${m}: and on the right`).toBeCloseTo(b.btn.right, 0);
        expect(b.ring.x, `${m}: inside the toolbar row`).toBeGreaterThanOrEqual(b.row.x);
        expect(b.ring.right).toBeLessThanOrEqual(b.row.right);
        expect(b.ring.y).toBeGreaterThanOrEqual(b.row.y);
        expect(b.ring.bottom).toBeLessThanOrEqual(b.row.bottom);
        await page.evaluate(() => fernView.cancelReplay());
      }
    });
  }

  test("the run's numbers are on the info card, nothing floats over the canvas, and the ring stays on Play either way", async ({ page }) => {
    await startLongManual(page, "fern", { seed: 9 });
    await stepRunTo(page, 3000);
    expect(await page.locator("#runChip").count(), "no counter over the canvas").toBe(0);
    await expect(page.locator("#fernReplayBtn")).toHaveClass(/\bringOn\b/);
    if (!(await page.evaluate(() => hudVisible))) await page.locator(".hudToggleBtn:visible").first().click();
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#hud .hudPlain span").nth(0)).toHaveText(/^3,000 points · \d+% filled$/);
    await expect(page.locator("#fernReplayBtn"), "with the card open").toHaveClass(/\bringOn\b/);
    await page.locator(".hudToggleBtn:visible").first().click(); // the card closed again
    await expect(page.locator("#fernReplayBtn"), "and with it closed").toHaveClass(/\bringOn\b/);
    await page.evaluate(() => fernView.cancelReplay());
  });

  test("the info card shows the same numbers and the run's seed while a run is on, and its usual line after", async ({ page }) => {
    await startLongManual(page, "pentagon", { seed: 482913 });
    if (!(await page.evaluate(() => hudVisible))) await page.locator(".hudToggleBtn:visible").first().click();
    await stepRunTo(page, 1216);
    const plain = page.locator("#hud .hudPlain span");
    await expect(plain.nth(0)).toHaveText(/^1,216 points · \d+% filled$/);
    await expect(plain.nth(1)).toHaveText("Run 482913");
    expect(await plain.nth(0).textContent(), "the card says what the counter says").toBe(await page.evaluate(() => runChipText(fernView.runStats)));
    await page.evaluate(() => fernView.cancelReplay());
    await page.evaluate(() => renderAll());
    await expect(plain.nth(0)).toHaveText(/ of 1,000,000 points$/);
    expect(await plain.count(), "no seed line: the run was not played by Play, so no run is remembered").toBe(1);
  });

  test("a screen reader hears only the powers of ten and the end, through one polite live region", async ({ page }) => {
    const live = await page.evaluate(() => { const e = document.getElementById("runAnnounce"); return { role: e.getAttribute("role"), live: e.getAttribute("aria-live"), n: document.querySelectorAll("[aria-live]").length - document.querySelectorAll("#speedBubble").length }; });
    expect(live).toMatchObject({ role: "status", live: "polite" });
    await startLongManual(page, "vicsek", { seed: 2 });
    const heard = await page.evaluate(() => {
      const region = document.getElementById("runAnnounce"), said = [];
      new MutationObserver(() => said.push(region.textContent)).observe(region, { childList: true, characterData: true, subtree: true });
      return (async () => {
        const s0 = fernView.replayState;
        const step = async (n) => { fernView.replayStep(Math.max(0, s0.sched.timeOf(n, s0.total) - fernView.replayState.t)); updateFernHud(); await new Promise((r) => setTimeout(r, 0)); }; // (the observer is told after each)
        for (let n = 1; n <= 200012; n = Math.ceil(n * 1.3) + 1) await step(Math.min(n, 200011));
        await step(200012); // the end: hand-off
        return said;
      })();
    });
    expect(heard.slice(0, 5)).toEqual(["10 points", "100 points", "1,000 points", "10 thousand points", "100 thousand points"]);
    expect(heard[heard.length - 1], "and it says when it is done").toMatch(/^Done\. 200 thousand points, \d+% filled\.$/);
    expect(heard.length, "nothing else").toBe(6);
  });
});

test.describe("the hand-off to the normal render", () => {
  for (const m of IFS_MODES) {
    test(`${m}: the top-up after the stop point shows no step in density or color, against the chaos game itself carried to the same number of points`, async ({ page }) => {
      const count = 1000000;
      await startLongManual(page, m, { count, seed: 11 });
      // the last frame of the replay, and the frame the hand-off itself draws (the normal render's first slice)
      await page.evaluate(() => { const s = fernView.replayState; fernView.replayStep(s.sched.timeOf(s.total - 1, s.total) - s.t); });
      await snap(page, "before");
      // (the copy is taken in the same task: animation frames after it go on adding points to the top-up)
      const after = await page.evaluate(() => {
        fernView.replayStep(1);
        const c = els.fernCanvas;
        (window.__snaps ||= {}).after = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        return { replaying: fernView.replaying, accepted: fernView.accepted };
      });
      expect(after.replaying).toBe(false);
      expect(after.accepted, "the top-up has begun, and is not finished").toBeGreaterThan(await page.evaluate((m) => IFS_STOP_POINTS[m], m) - 1);
      expect(after.accepted).toBeLessThan(count);
      // The same jumps, the replay itself carried on to as many points as that frame holds (no hand-off, no sampler)
      await page.evaluate((stop) => {
        fernView.startReplay({ ...fernRenderOpts(), ...REPLAY_LONG, stop, rng: seededRandom(11), seed: 11, manual: true, speed: () => 1, onChange: syncReplayButtons });
        const s = fernView.replayState; fernView.replayStep(s.sched.timeOf(s.total - 1, s.total) - s.t);
      }, after.accepted);
      await snap(page, "same");
      await page.evaluate(() => { fernView.cancelReplay(); requestRender(); });
      const d = await compare(page, "after", "same");
      expect(Math.abs(d.a.light - d.b.light) / d.b.light, `light ${d.a.light} after the hand-off, ${d.b.light} for the chaos game alone`).toBeLessThan(0.025);
      expect(Math.abs(d.a.lit - d.b.lit) / d.b.lit, `lit ${d.a.lit} / ${d.b.lit}`).toBeLessThan(0.03);
      expect(hueGap(hueOf(d.a.rgb), hueOf(d.b.rgb)), "address colors").toBeLessThan(3);
      expect(d.meanBlock, "mean 8 x 8 block difference: the same picture drawn from other random points").toBeLessThan(1.2);
      await settled(page, count);
    });
  }
});

test.describe("Play: a Long run with a seed of its own, and the seed in the link", () => {
  // The first n jumps of a run from its seed alone: [ci, x, y].
  const seqFromSeed = (page, system, seed, n) => page.evaluate(([system, seed, n]) => {
    const sys = IFS_SYSTEMS[system].transforms, rnd = window.__seeded(seed), out = [];
    const pick = (u) => { let cum = 0; for (const t of sys) { cum += t.p; if (u < cum) return t; } return sys[sys.length - 1]; };
    let t = pick(rnd()), x = 0, y = 0;
    for (let k = 1; k <= n; k++) { [x, y] = [t.a * x + t.b * y + t.e, t.c * x + t.d * y + t.f]; out.push([t.ci, x, y]); t = pick(rnd()); }
    return out;
  }, [system, seed, n]);
  const playAt4x = async (page, m, jumps = 40) => {
    await show(page, m);
    await page.evaluate(() => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4); syncReplayButtons(); });
    await page.locator("#fernReplayBtn").click();
    await page.waitForFunction((j) => fernView.replayState && fernView.replayState.n >= j, jumps);
  };

  for (const m of IFS_MODES) {
    test(`${m}: Play is a Long run: 100 slow jumps, this shape's stop point, a fresh seed, the jumps of that seed`, async ({ page }) => {
      await playAt4x(page, m);
      const s = await page.evaluate(() => {
        const st = fernView.replayState;
        return { seed: st.seed, slow: st.sched.slowJumps, stop: st.stop, dur: st.sched.durationS, trail: st.trail, seq: st.seq.slice(1, 41).map((p) => [p.ci, p.x, p.y]), remembered: chaosRun.seed, count: fernState.count, table: IFS_STOP_POINTS[fernView.system] };
      });
      expect(Number.isInteger(s.seed) && s.seed >= 1 && s.seed <= 999999, `seed ${s.seed}`).toBe(true);
      expect(s.remembered).toBe(s.seed);
      expect(s.slow).toBe(100);
      expect(s.dur).toBeGreaterThan(14); expect(s.dur).toBeLessThan(16);
      expect(s.stop).toBe(Math.min(s.table, s.count));
      expect(s.trail).toBeGreaterThan(6);
      expect(s.seq, "the first 40 jumps are exactly those of the seed").toEqual(await seqFromSeed(page, m, s.seed, 40));
      await page.evaluate(() => fernView.cancelReplay());
    });
  }

  test("a new seed for each Play, shown as Run N on the info card", async ({ page }) => {
    await playAt4x(page, "levy", 3);
    if (!(await page.evaluate(() => hudVisible))) await page.locator(".hudToggleBtn:visible").first().click();
    const first = await page.evaluate(() => fernView.replayState.seed);
    await expect(page.locator("#hud .hudPlain span").nth(1)).toHaveText(`Run ${first}`);
    await page.evaluate(() => fernView.cancelReplay());
    await page.locator("#fernReplayBtn").click();
    await page.waitForFunction(() => fernView.replayState && fernView.replayState.n >= 3);
    const second = await page.evaluate(() => fernView.replayState.seed);
    expect(second).not.toBe(first);
    await expect(page.locator("#hud .hudPlain span").nth(1)).toHaveText(`Run ${second}`);
    await page.evaluate(() => { fernView.cancelReplay(); renderAll(); });
    await expect(page.locator("#hud .hudPlain span").nth(1), "still named after the run, while the view is as it was").toHaveText(`Run ${second}`);
    await page.evaluate(() => { fernView.view.cx += 0.2; renderAll(); });
    expect(await page.locator("#hud .hudPlain span").count(), "a moved view is not that run's picture").toBe(1);
  });

  test("the link carries the seed after a run and while the view is unchanged, and parses leniently", async ({ page }) => {
    await show(page, "sierpinski");
    expect(await page.evaluate(() => buildShareHash()), "no run yet, no seed").not.toMatch(/sd=/);
    await playAt4x(page, "sierpinski", 3);
    const seed = await page.evaluate(() => fernView.replayState.seed);
    const link = await page.evaluate(() => buildShareHash());
    expect(link).toMatch(new RegExp(`&sd=${seed}$`));
    expect(link).toMatch(/^#v=1&m=sierpinski&x=/);
    // the round trip
    expect(await page.evaluate((h) => parseShareHash(h).seed, link)).toBe(seed);
    // still there after the run was cancelled or ended, the view as it was...
    await page.evaluate(() => { fernView.cancelReplay(); renderAll(); });
    expect(await page.evaluate(() => buildShareHash())).toBe(link);
    // ... and gone once the view moved, or another shape shows
    // (put back by assigning the saved value: multiplying by 0.9 and dividing by 0.9 is not always
    // exact in floating point, and the start value differs from page to page, so that flaked)
    const h0 = await page.evaluate(() => fernView.view.halfHeight);
    await page.evaluate(() => { fernView.view.halfHeight *= 0.9; renderAll(); });
    expect(await page.evaluate(() => buildShareHash())).not.toMatch(/sd=/);
    await page.evaluate((h) => { fernView.view.halfHeight = h; renderAll(); }, h0);
    expect(await page.evaluate(() => buildShareHash()), "back exactly as it was: the seed is back").toBe(link);
    await page.evaluate(() => setMode("koch"));
    expect(await page.evaluate(() => buildShareHash())).not.toMatch(/sd=/);
    // lenient: an old link, and a link with a bad seed, both parse as before, without a seed
    const base = "#v=1&m=levy&x=0.5&y=0.5&s=1&r=0&n=300000&c=2";
    const parsed = await page.evaluate((base) => [base, `${base}&sd=0`, `${base}&sd=1000000`, `${base}&sd=abc`, `${base}&sd=12.5`, `${base}&sd=`, `${base}&sd=482913`].map((h) => parseShareHash(h)), base);
    expect(parsed.map((p) => p && p.mode)).toEqual(Array(7).fill("levy"));
    expect(parsed.slice(0, 6).map((p) => p.seed)).toEqual(Array(6).fill(undefined));
    expect(parsed[6].seed).toBe(482913);
    expect(parsed[0]).toEqual({ mode: "levy", cx: 0.5, cy: 0.5, scale: 1, rotation: 0, count: 300000, colorIndex: 2 });
  });

  test("opening a link with a seed plays that run after the first paint, the same jumps as the sender's", async ({ page }) => {
    await playAt4x(page, "pentagon", 3);
    const sent = await page.evaluate(() => ({ hash: buildShareHash(), seed: fernView.replayState.seed }));
    await page.evaluate(() => fernView.cancelReplay());
    await page.goto(`index.html${sent.hash}`);
    await page.waitForFunction((seed) => typeof fernView !== "undefined" && fernView.replaying && fernView.replayState.seed === seed, sent.seed, { timeout: 20_000 });
    await page.addStyleTag({ content: HIDE_TRANSIENTS });
    expect(await page.evaluate(() => mode)).toBe("pentagon");
    expect(await page.evaluate(() => location.hash), "the link is stripped from the address, as before").toBe("");
    await page.waitForFunction(() => fernView.replayState && fernView.replayState.n >= 30);
    const got = await page.evaluate(() => fernView.replayState.seq.slice(1, 31).map((p) => [p.ci, p.x, p.y]));
    expect(got, "the sender's seed, the sender's jumps").toEqual(await seqFromSeed(page, "pentagon", sent.seed, 30));
    const st = await page.evaluate(() => ({ stop: fernView.replayState.stop, slow: fernView.replayState.sched.slowJumps, ring: document.getElementById("fernReplayBtn").classList.contains("ringOn"), remembered: chaosRun.seed }));
    expect(st).toEqual({ stop: 300000, slow: 100, ring: true, remembered: sent.seed });
    expect(await page.evaluate(() => buildShareHash()), "and the opened view carries the same seed on").toBe(sent.hash);
    await page.evaluate(() => fernView.cancelReplay());
  });

  test("an old link, and a link with a bad seed, open as they always did: no run", async ({ page }) => {
    for (const hash of ["#v=1&m=levy&x=0.5&y=0.5&s=1&r=0&n=300000&c=2", "#v=1&m=levy&x=0.5&y=0.5&s=1&r=0&n=300000&c=2&sd=0", "#v=1&m=levy&x=0.5&y=0.5&s=1&r=0&n=300000&c=2&sd=banana"]) {
      await page.goto(`index.html${hash}`);
      await page.waitForFunction(() => typeof fernView !== "undefined" && mode === "levy" && fernView.accepted > 0);
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => fernView.replaying), hash).toBe(false);
      expect(await page.evaluate(() => chaosRun.seed)).toBe(0);
    }
  });

  test("with reduced motion a link with a seed opens the picture and plays nothing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("index.html#v=1&m=sierpinski&x=0&y=0.25&s=1.3&r=0&n=300000&c=1&sd=482913");
    await page.waitForFunction(() => typeof fernView !== "undefined" && mode === "sierpinski" && fernView.accepted > 0);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await expect(page.locator("#fernReplayBtn")).not.toHaveClass(/\bringOn\b/);
  });

  test("a link with a seed, opened on another shape's page while a run plays, plays its own run", async ({ page }) => {
    await playAt4x(page, "vicsek", 3);
    await page.evaluate(() => { location.hash = "#v=1&m=sierpinski&x=0&y=0.25&s=1.3&r=0&n=300000&c=1&sd=777"; });
    await page.waitForFunction(() => mode === "sierpinski" && fernView.replaying && fernView.replayState.seed === 777, null, { timeout: 20_000 });
    await page.evaluate(() => fernView.cancelReplay());
  });
});

// ---------------------------------------------------------------------------------------------------
// The app's run follows the view: a pan, zoom, twist, Back or resize does not end it (fern.js replaySync).

// Plays a following Long run on the manual clock to n jumps, applies a change of the view (the way the
// interaction code does: halfHeight, cx, cy, rotation, then the render), and reports what the run is
// and what it drew; then starts a fresh run of the same seed in that view (no change to make) and plays
// it to the same n, so the two can be compared pixel for pixel. `change` is in shares of the view's
// halfHeight: { zoom (factor), dx, dy, rot }; `twice` makes a second change at once (a gesture: the
// picture is the subsample until it settles); `settle` ends it; `pause` pauses the run before the change.
async function followProbe(page, { m, n, count = 200000, seed = 5, change, twice = false, settle = false, pause = false }) {
  await show(page, m);
  return page.evaluate(([m, n, count, seed, change, twice, settle, pause]) => {
    fernState.count = count; els.fernPointsSlider.value = count;
    if (!vectorViewIsFitted(mode)) fitVectorView(mode);
    const sys = IFS_SYSTEMS[m].transforms;
    const stepTo = (k) => { const s = fernView.replayState; fernView.replayStep(Math.max(0, s.sched.timeOf(k + 1e-6, s.total) - s.t)); };
    const start = () => fernView.startReplay({ ...fernRenderOpts(), ...REPLAY_LONG, stop: replayStopPoints(m, count), rng: seededRandom(seed), seed, follow: true, manual: true, speed: () => 1, onChange: syncReplayButtons });
    const grab = () => { const c = els.fernCanvas; return c.getContext("2d").getImageData(0, 0, c.width, c.height).data; };
    const apply = (c) => {
      const v = fernView.view, h = v.halfHeight;
      v.halfHeight *= c.zoom ?? 1; v.cx += (c.dx ?? 0) * h; v.cy += (c.dy ?? 0) * h; v.rotation = (v.rotation || 0) + (c.rot ?? 0);
    };
    const report = () => {
      const st = fernView.replayState, rs = fernView.runStats;
      return { replaying: fernView.replaying, running: fernView.replayRunning, n: st.n, t: st.t, points: rs.points, lit: rs.lit, refCells: rs.refCells, coverage: rs.coverage, accepted: fernView.accepted, per: st.perTransform, coarse: st.coarse, follow: st.follow, bytes: st.pointBytes };
    };
    start(); stepTo(n);
    const before = report();
    if (pause) fernView.pauseReplay();
    apply(change);
    fernView.render(fernRenderOpts());
    if (twice) { apply({ zoom: 0.97, dx: 0.01, dy: 0, rot: 0.01 }); fernView.render(fernRenderOpts()); } // (a second move at once: a gesture)
    updateFernHud();
    const duringGesture = report();
    if (settle) fernView.replaySettle();
    const a = report(), A = grab(), chip = runChipText(fernView.runStats);
    fernView.cancelReplay();
    // the same run begun in that view
    start(); stepTo(n);
    const b = report(), B = grab();
    fernView.cancelReplay();
    let diff = 0;
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) diff++;
    // an independent recomputation of the points through the view: the transforms in order from the seed
    const rnd = seededRandom(seed);
    const pick = (u) => { let cum = 0; for (const t of sys) { cum += t.p; if (u < cum) return t; } return sys[sys.length - 1]; };
    const W = els.fernCanvas.width, H = els.fernCanvas.height, cell = Math.max(2, Math.round(12 * fernView.dpr)), gw = Math.ceil(W / cell);
    const cellOf = (x, y) => { const [sx, sy] = fernView.worldToScreen(x, y), px = Math.floor(sx), py = Math.floor(sy); return px < 0 || px >= W || py < 0 || py >= H ? -1 : Math.floor(py / cell) * gw + Math.floor(px / cell); };
    const ref = new Set(), base = ifsData(m).base;
    for (let i = 0; i < base.length; i += 2) { const c = cellOf(base[i], base[i + 1]); if (c >= 0) ref.add(c); }
    let t = pick(rnd()), x = 0, y = 0, inView = 0, litRef = 0;
    const lit = new Set();
    for (let k = 1; k <= a.n; k++) {
      [x, y] = [t.a * x + t.b * y + t.e, t.c * x + t.d * y + t.f];
      if (k > 12) { const c = cellOf(x, y); if (c >= 0) { inView++; if (!lit.has(c)) { lit.add(c); if (ref.has(c)) litRef++; } } }
      t = pick(rnd());
    }
    return { before, duringGesture, a, b, diff, chip, indep: { inView, litRef, refCells: ref.size }, view: { ...fernView.view } };
  }, [m, n, count, seed, change, twice, settle, pause]);
}

test.describe("a run follows the view", () => {
  const CHANGES = {
    zoom: { zoom: 0.4, dx: 0.12, dy: 0.15, rot: 0 },
    pan: { zoom: 1, dx: 0.35, dy: -0.3, rot: 0 },
    twist: { zoom: 1, dx: 0, dy: 0, rot: 0.6 },
  };
  for (const m of IFS_MODES) {
    for (const [name, change] of Object.entries(CHANGES)) {
      test(`${m}, ${name}: the run is not ended, keeps its points, and shows what a run begun in that view shows`, async ({ page }) => {
        const r = await followProbe(page, { m, n: 3000, change });
        expect(r.a.replaying, "not ended").toBe(true);
        expect(r.a.follow).toBe(true);
        expect(r.a.running, "still running").toBe(true);
        expect(r.a.n, "no jump landed or lost").toBe(r.before.n);
        expect(r.a.t, "the schedule's clock did not move").toBe(r.before.t);
        expect(r.a.points, "the counted points are the same").toBe(r.before.points);
        expect(r.a.per, "so are the first points' transforms").toEqual(r.before.per);
        expect(r.diff, `pixels that differ from a run begun in that view (${JSON.stringify(r.view)})`).toBe(0);
        expect(r.a.accepted, "the points on screen: an independent recomputation").toBe(r.indep.inView);
        expect(r.a.lit).toBe(r.indep.litRef);
        expect(r.a.refCells, "the reference cells of the new view").toBe(r.indep.refCells);
        expect(r.a.coverage).toBe(r.b.coverage);
        expect(r.chip, "the chip says the new view's coverage").toBe(`3,000 points · ${Math.floor(r.a.coverage * 100 + 1e-9)}% filled`);
        expect(r.a.bytes, "17 bytes a point").toBe(17 * (200012 + 1));
      });
    }
  }

  test("pause, then zoom: still paused, the picture drawn at once in the new view", async ({ page }) => {
    const r = await followProbe(page, { m: "pentagon", n: 20000, change: CHANGES.zoom, pause: true });
    expect(r.a.replaying).toBe(true);
    expect(r.a.running, "paused stays paused").toBe(false);
    expect(r.a.n).toBe(r.before.n);
    expect(r.diff, "drawn in the new view without waiting for a frame").toBe(0);
  });

  test("a gesture draws a subsample of a long run and the exact picture when it settles", async ({ page }) => {
    const r = await followProbe(page, { m: "fern", n: 300000, count: 1000000, change: CHANGES.zoom, twice: true, settle: true });
    expect(r.duringGesture.coarse, "the second move of a gesture draws every third point").toBe(true);
    expect(Math.abs(r.duringGesture.accepted - r.a.accepted) / r.a.accepted, "the subsample counts as many points on screen as the exact picture (within 2%)").toBeLessThan(0.02);
    expect(r.a.coarse).toBe(false);
    expect(r.diff, "settled: pixel for pixel the picture of a run begun in that view").toBe(0);
    expect(r.a.accepted).toBe(r.indep.inView);
    expect(r.a.lit).toBe(r.indep.litRef);
  });

  test("it goes on landing points in the new view to the same total, and the hand-off keeps what was drawn", async ({ page }) => {
    for (const m of ["sierpinski", "fern"]) {
      const count = 200000;
      await startLongManual(page, m, { count, seed: 5, extra: { follow: true } });
      await stepRunTo(page, 4000);
      const r = await page.evaluate(() => {
        const v = fernView.view; v.halfHeight *= 0.5; v.cx += 0.1 * v.halfHeight; v.rotation = 0.3;
        fernView.render(fernRenderOpts());
        const s = fernView.replayState; fernView.replayStep(s.sched.timeOf(s.total - 1 + 1e-6, s.total) - s.t);
        const last = { n: fernView.replayState.n, total: fernView.replayState.total, accepted: fernView.accepted, replaying: fernView.replaying };
        fernView.replayStep(1);
        return { last, end: { replaying: fernView.replaying, accepted: fernView.accepted }, view: { ...v } };
      });
      expect(r.last.n, `${m}: all the points but one down, in the new view`).toBe(r.last.total - 1);
      expect(r.last.replaying).toBe(true);
      expect(r.end.replaying, "ended by its own last point").toBe(false);
      expect(r.end.accepted, "the hand-off keeps the redrawn counts, and the normal render adds to them").toBeGreaterThanOrEqual(r.last.accepted);
      expect(r.end.accepted, "(the sampler works in batches of 2000, so it may pass the count by a batch)").toBeLessThanOrEqual(count + 2000);
      expect(await page.evaluate(() => ({ ...fernView.view })), "the view is where the person left it").toEqual(r.view);
      await settled(page, count);
      expect(await lit(page), `${m}: the picture is there after the top-up`).toBeGreaterThan(2000);
    }
  });

  test("a new color still ends it, and so does the points slider", async ({ page }) => {
    await startLongManual(page, "levy", { seed: 5, extra: { follow: true } });
    await stepRunTo(page, 3000);
    await page.evaluate(() => { setFernColor(3); requestRender(); }); // Ice (Lévy starts in Rose)
    await page.waitForFunction(() => !fernView.replaying);
    await settled(page, 1000000);
    await startLongManual(page, "levy", { seed: 5, extra: { follow: true } });
    await stepRunTo(page, 3000);
    await page.evaluate(() => { els.fernPointsSlider.value = 400000; els.fernPointsSlider.dispatchEvent(new Event("input")); });
    expect(await page.evaluate(() => fernView.replaying)).toBe(false);
    await settled(page, 400000);
  });

  test("a default replay (no follow) is still ended by a view change, a touch and a resize", async ({ page }) => {
    for (const how of ["view", "touch", "resize"]) {
      await startManual(page, "sierpinski", { count: 200000 });
      await stepTo(page, 300.05);
      expect(await page.evaluate(() => fernView.replayFollows)).toBe(false);
      if (how === "view") await page.evaluate(() => { fernView.view.halfHeight *= 0.8; renderAll(); });
      if (how === "touch") {
        const r = await page.locator("#fernCanvas").boundingBox();
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
      }
      if (how === "resize") await page.setViewportSize({ width: 360, height: 800 });
      await page.waitForFunction(() => !fernView.replaying);
      await settled(page, 200000);
      await page.setViewportSize({ width: 393, height: 852 });
    }
  });

  test("a resize of the canvas does not end the app's run: it is drawn again at the new size", async ({ page }) => {
    await startLongManual(page, "pentagon", { seed: 5, extra: { follow: true } });
    await stepRunTo(page, 20000);
    const before = await page.evaluate(() => ({ n: fernView.replayState.n, accepted: fernView.accepted, w: els.fernCanvas.width }));
    await page.setViewportSize({ width: 340, height: 700 });
    await frames(page);
    const after = await page.evaluate(() => { fernView.replayStep(0); return { replaying: fernView.replaying, n: fernView.replayState.n, w: els.fernCanvas.width, accepted: fernView.accepted, lit: null }; });
    expect(after.replaying).toBe(true);
    expect(after.n).toBe(before.n);
    expect(after.w).toBeLessThan(before.w);
    expect(after.accepted, "the points are drawn again at the new size").toBeGreaterThan(before.accepted * 0.3);
    await page.evaluate(() => fernView.cancelReplay());
  });
});

test.describe("Play: gestures on the picture do not end the run (the owner's wheel-zoom repro)", () => {
  const playAt = async (page, m, speed, jumps) => {
    await show(page, m);
    await page.evaluate((speed) => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(speed); syncReplayButtons(); }, speed);
    await page.locator("#fernReplayBtn").click();
    await page.waitForFunction((j) => fernView.replayState && fernView.replayState.n >= j, jumps);
  };
  const wheel = (page, deltaY) => page.evaluate((deltaY) => {
    const r = els.fernCanvas.getBoundingClientRect();
    els.fernCanvas.dispatchEvent(new WheelEvent("wheel", { deltaY, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
  }, deltaY);

  for (const m of ["fern", "sierpinski"]) {
    test(`${m}: wheel zoom mid-run: still replaying, Pause showing, the chip there, points still landing`, async ({ page }) => {
      // The real Play button on the real clock: 4x gets to the fast part of the run quickly, and the
      // moment it is there the speed drops to 1/4x (the app reads it live), so "mid-run" lasts long
      // enough for a slow or busy machine; a run at 2x could finish before the checks (it did, under load).
      await show(page, m);
      await page.evaluate(() => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4); syncReplayButtons(); });
      await page.locator("#fernReplayBtn").click();
      await page.waitForFunction(() => {
        const s = fernView.replayState;
        if (!s || s.n < 3000) return false;
        depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(0.25);
        syncReplayButtons();
        return true;
      });
      const h0 = await page.evaluate(() => fernView.view.halfHeight);
      const n0 = await page.evaluate(() => fernView.replayState.n);
      for (let i = 0; i < 6; i++) await wheel(page, -120);
      expect(await page.evaluate(() => fernView.view.halfHeight), "the view zoomed").toBeLessThan(h0 * 0.8);
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => fernView.replaying), "not ended by the wheel").toBe(true);
      await expect(page.locator("#fernReplayBtn")).toHaveAttribute("aria-label", "Pause replay");
      await expect(page.locator("#fernReplayBtn")).toHaveClass(/\bringOn\b/);
      expect(await page.evaluate(() => fernView.replayState.n), "points keep landing").toBeGreaterThan(n0);
      expect(await page.evaluate(() => fernView.accepted), "the run's points are not thrown at the screen all at once").toBeLessThan(900000);
      await page.evaluate(() => { depthPlayer.speedIndex = PLAY_SPEEDS.indexOf(4); syncReplayButtons(); }); // let it finish
      await page.waitForFunction(() => !fernView.replaying, null, { timeout: 30_000 });
      await expect(page.locator("#fernReplayBtn")).toHaveAttribute("aria-label", "Play replay");
      await settled(page, await page.evaluate(() => fernState.count));
      expect(await page.evaluate(() => fernView.view.halfHeight), "and the view is still the zoomed one").toBeLessThan(h0 * 0.8);
    });
  }

  test("a tap, a drag and a pinch-and-twist on the picture, then Back, all leave the run going", async ({ page }) => {
    await playAt(page, "pentagon", 1, 1500);
    const r = await page.locator("#fernCanvas").boundingBox();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const v0 = await page.evaluate(() => ({ ...fernView.view }));
    await page.mouse.click(cx, cy);
    expect(await page.evaluate(() => fernView.replaying), "a plain tap").toBe(true);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy + 40, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => fernView.replaying), "a drag").toBe(true);
    expect(await page.evaluate(() => fernView.view.cx), "the view panned").not.toBe(v0.cx);
    await page.evaluate(() => {
      HTMLElement.prototype.setPointerCapture = () => {}; // synthetic pointers have nothing to capture
      const canvas = els.fernCanvas, b = canvas.getBoundingClientRect(), x = b.x + b.width / 2, y = b.y + b.height / 2;
      const fire = (type, id, px, py) => canvas.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: px, clientY: py, bubbles: true, pointerType: "touch" }));
      fire("pointerdown", 1, x - 40, y); fire("pointerdown", 2, x + 40, y);
      fire("pointermove", 1, x - 50, y - 20); fire("pointermove", 2, x + 50, y + 20);
      fire("pointerup", 1, x - 50, y - 20); fire("pointerup", 2, x + 50, y + 20);
    });
    expect(await page.evaluate(() => fernView.replaying), "a pinch and twist").toBe(true);
    expect(await page.evaluate(() => fernView.view.rotation), "the view turned").not.toBe(0);
    await page.keyboard.press("ArrowLeft");
    expect(await page.evaluate(() => fernView.replaying), "an arrow key").toBe(true);
    await page.locator("#fernBackBtn").click();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => fernView.replaying), "Back").toBe(true);
    await expect(page.locator("#fernReplayBtn")).toHaveAttribute("aria-label", "Pause replay");
    await page.waitForFunction(() => !fernView.replaying, null, { timeout: 40_000 });
    await settled(page, await page.evaluate(() => fernState.count));
  });

  test("Reset still ends the run, and Pause then a zoom stays paused", async ({ page }) => {
    await playAt(page, "vicsek", 2, 2000);
    await wheel(page, -120);
    await page.locator("#fernReplayBtn").click(); // pause
    await expect(page.locator("#fernReplayBtn")).toHaveAttribute("aria-label", "Play replay");
    await wheel(page, -120);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => ({ r: fernView.replaying, running: fernView.replayRunning })), "zoomed while paused: still paused").toEqual({ r: true, running: false });
    await page.locator("#fernResetBtn").click();
    expect(await page.evaluate(() => fernView.replaying), "Reset ends it as before").toBe(false);
    await settled(page, await page.evaluate(() => fernState.count));
  });
});

test.describe("zoomed far into a run", () => {
  for (const [m, zoom] of [["fern", 100], ["fern", 10000], ["pentagon", 100], ["pentagon", 10000]]) {
    test(`${m}, ${zoom}x: the run goes on, hands off, and the normal render fills the view`, async ({ page }) => {
      await startLongManual(page, m, { count: 400000, seed: 5, extra: { follow: true } });
      await stepRunTo(page, 20000);
      const r = await page.evaluate((zoom) => {
        // zoom onto a point of the shape: one of the precomputed points, the view centered on it
        const p = ifsData(fernView.system).base; const i = 2 * 1234;
        const v = fernView.view; v.cx = p[i]; v.cy = p[i + 1]; v.halfHeight /= zoom;
        fernView.render(fernRenderOpts());
        const mid = { replaying: fernView.replaying, accepted: fernView.accepted };
        const s = fernView.replayState; fernView.replayStep(s.sched.timeOf(s.total - 1, s.total) - s.t);
        const last = { replaying: fernView.replaying, accepted: fernView.accepted, coverage: fernView.runStats.coverage, refCells: fernView.runStats.refCells };
        fernView.replayStep(1);
        return { mid, last, ended: !fernView.replaying };
      }, zoom);
      expect(r.mid.replaying).toBe(true);
      expect(r.last.replaying).toBe(true);
      expect(r.ended).toBe(true);
      await settled(page, 400000);
      const area = await page.evaluate(() => els.fernCanvas.width * els.fernCanvas.height);
      // (at 10,000x on the fern the view holds only a thin line of its stem, so little is lit; at 100x it holds fronds)
      expect(await lit(page), `${m} ${zoom}x: the normal render filled the view (run had ${r.last.accepted} points on screen, ${r.last.refCells} reference cells)`).toBeGreaterThan(zoom > 1000 ? 300 : area * 0.002);
    });
  }
});
