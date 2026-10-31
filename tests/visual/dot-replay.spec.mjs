// The chaos-game replay of the four dot shapes (fern, Sierpinski triangle, Levy C, Vicsek; fern.js
// and the Play button in teleport.js): from an empty backdrop a dot flies from point to point, each
// jump by a randomly chosen transform and in that transform's address color, the first ones slow
// and one by one, then faster until the points slider's count of points is down and the picture has
// emerged, with the normal render taking over without a visible change. Most checks run the replay
// on its manual clock (`manual: true`, advanced by `fernView.replayStep(seconds)`) with a seeded
// `ifsRandom`, so the same jumps come every time; a few press the real Play button.
import { test, expect } from "@playwright/test";

/* global setMode, fernView, fernState, vectorColors, els, mode, fernRenderOpts, syncReplayButtons,
   vectorViewIsFitted, fitVectorView, requestRender, renderAll, captureShareBlob, buildShareHash, ifsRandom, setIfsRandom,
   ifsTransformColors, IFS_SYSTEMS, backdropPixels, replayJumpsAt, replayTimeOf, REPLAY_SLOW_S, REPLAY_RAMP_S,
   REPLAY_CAP_S, depthPlayer, PLAY_SPEEDS, setFernColor, stopDepthPlay */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
const IFS_MODES = ["fern", "sierpinski", "levy", "vicsek"];

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
        const boxes = await page.evaluate(() => [...document.querySelectorAll("#fernControls button")].map((b) => {
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

  for (const m of ["sierpinski", "levy", "vicsek"]) {
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
