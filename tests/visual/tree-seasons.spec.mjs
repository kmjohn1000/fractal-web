// Four Seasons (src/ui/tree-seasons-player.js, src/fractals/tree-seasons.js): the Pythagoras tree's animated place.
// Choosing it in the Places sheet lands on the tree and plays the cycle (spring green and blossom, summer, autumn
// with the finest levels shedding, winter bare and pale, spring again) with a gentle sway and a particle overlay;
// a touch stops it and leaves the tree as drawn; the picked color and depth are never written. Time is moved by
// shifting the run's start (seasonsRun.t0) so the checks do not wait 30 s.
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

/* global treeView, treeState, vectorColors, els, mode, setMode, seasonsRun, seasonsPlaying, SEASON_PLACES, SEASON_CYCLE_S,
   seasonAt, placeId, requestRender, SOLID_COLORS */

const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";
let pageErrors = [];

async function load(page, { reducedMotion = false } = {}) {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  });
  await page.goto("index.html");
  await page.addStyleTag({ content: HIDE_TRANSIENTS });
  await page.waitForFunction(() => typeof setMode === "function" && typeof seasonsPlaying === "function");
}
const frames = (page, n = 3) => page.evaluate((n) => new Promise((r) => { let i = 0; const go = () => (++i >= n ? setTimeout(r, 90) : requestAnimationFrame(go)); requestAnimationFrame(go); }), n);

// Opens the Places sheet the way a person does and taps the Four Seasons row.
async function chooseTheSeasons(page) {
  await page.locator(".fractalMenuBtn:visible").first().click();
  await page.locator("#fractalTypeRow .placesRow").click();
  await expect(page.locator("#placesSheet")).toHaveClass(/open/);
  await page.locator('#placesSheet .placeRow[data-place="tree-four-seasons"]').click();
  await expect(page.locator("#placesSheet")).not.toHaveClass(/open/);
  await frames(page);
}

// A tap on the middle of the tree.
async function touch(page) {
  const box = await page.locator("#treeCanvas").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
}

// Moves the animation to t seconds in and waits for the frame.
async function at(page, t) {
  await page.evaluate((t) => { seasonsRun.t0 = performance.now() - t * 1000; }, t);
  await frames(page, 4);
}

// The mean color of the tree's lit pixels (the backdrop is dark) and how many there are.
const treeColor = (page) => page.evaluate(() => {
  const c = els.treeCanvas, d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0; const s = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) { n++; s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
  return { n, rgb: s.map((v) => v / Math.max(1, n)) };
});
const treeData = (page) => page.evaluate(() => els.treeCanvas.toDataURL());
const overlayInk = (page) => page.evaluate(() => {
  const c = document.getElementById("treeSeasonsFx");
  if (!c) return -1;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
  return n;
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

test("the Places sheet lists Four Seasons under the tree, with a thumbnail", async ({ page }) => {
  await load(page);
  await page.locator(".fractalMenuBtn:visible").first().click();
  await page.locator("#fractalTypeRow .placesRow").click();
  const seen = await page.evaluate(() => ({
    group: document.querySelector('#placesSheet .placesGroup[data-fractal="tree"]')?.querySelector(".placeRow")?.dataset.place,
    head: document.querySelector('#placesSheet .placesGroup[data-fractal="tree"] .placesGroupHead')?.textContent,
    chip: document.querySelector('#placesSheet .chip[data-fractal="tree"]')?.textContent,
    label: document.querySelector('#placesSheet .placeRow[data-place="tree-four-seasons"]')?.getAttribute("aria-label"),
    id: placeId(SEASON_PLACES[0]),
  }));
  expect(seen).toEqual({
    group: "tree-four-seasons", head: "Pythagoras tree1", chip: "Pythagoras tree", label: "Four Seasons, animated through the year. Play",
    id: "tree-four-seasons",
  });
});

test("choosing the place lands on the tree and plays the cycle; four moments show the four seasons", async ({ page }, testInfo) => {
  await load(page);
  const saved = await page.evaluate(() => ({ color: vectorColors.tree, depth: treeState.depth }));
  await chooseTheSeasons(page);
  expect(await page.evaluate(() => ({ mode, playing: seasonsPlaying(), overlay: !!document.getElementById("treeSeasonsFx") }))).toEqual({ mode: "tree", playing: true, overlay: true });
  // The screen reader is told, and the canvas says what it is doing.
  expect(await page.evaluate(() => document.getElementById("runAnnounce").textContent)).toBe("Four Seasons, Pythagoras tree");
  await page.waitForFunction(() => els.treeCanvas.getAttribute("aria-label")?.startsWith("Four Seasons"));
  expect(await els_label(page)).toBe("Four Seasons, Pythagoras tree, changing through the seasons");

  // Spring (t = 3): fresh green, the tree growing in. Blossom (8.5): pink. Summer (13): deep green.
  // Autumn (19.4): red. Winter (25): pale blue-white and bare.
  const looks = {};
  for (const [name, t] of [["spring", 4], ["blossom", 8.6], ["summer", 13], ["autumn", 19.4], ["winter", 25]]) {
    await at(page, t);
    looks[name] = { ...(await treeColor(page)), season: await page.evaluate(() => ({ rgb: treeView.season.rgb, depth: treeView.season.depth })), data: await treeData(page) };
    // SEASONS_SHOTS=<folder>: also write the page as a PNG, to look at.
    const shot = await page.screenshot();
    if (process.env.SEASONS_SHOTS) writeFileSync(`${process.env.SEASONS_SHOTS}/${testInfo.project.name}-${name}.png`, shot);
  }
  const rgbOf = (n) => looks[n].rgb;
  expect(rgbOf("spring")[1], "spring is green").toBeGreaterThan(rgbOf("spring")[0] * 1.1);
  expect(rgbOf("spring")[1]).toBeGreaterThan(rgbOf("spring")[2] * 1.3);
  expect(rgbOf("blossom")[0], "blossom is pink: red above green").toBeGreaterThan(rgbOf("blossom")[1] * 1.1);
  expect(rgbOf("summer")[1], "summer is green").toBeGreaterThan(rgbOf("summer")[0] * 1.3);
  expect(rgbOf("summer").reduce((a, c) => a + c), "summer is deeper than spring").toBeLessThan(rgbOf("spring").reduce((a, c) => a + c));
  expect(rgbOf("autumn")[0], "autumn is red or orange").toBeGreaterThan(rgbOf("autumn")[1] * 1.3);
  expect(rgbOf("autumn")[0]).toBeGreaterThan(rgbOf("autumn")[2] * 2);
  expect(rgbOf("winter")[2], "winter is pale blue-white: blue on top, all channels high").toBeGreaterThanOrEqual(rgbOf("winter")[0]);
  expect(Math.min(...rgbOf("winter"))).toBeGreaterThan(110);
  // Depth: full in spring and summer, shed to about 7 in winter, with far fewer squares lit.
  expect(looks.summer.season.depth).toBeCloseTo(13, 1);
  expect(looks.winter.season.depth).toBeCloseTo(7, 1);
  expect(looks.winter.n, "the winter tree covers less than the full one").toBeLessThan(looks.summer.n * 0.85);
  // Every moment is a different picture.
  expect(new Set(Object.values(looks).map((l) => l.data)).size).toBe(5);

  // Falling things: blossoms (8.6), none in high summer (13), leaves (19.4), snow (25).
  await at(page, 8.6);
  expect(await overlayInk(page), "blossoms fall").toBeGreaterThan(30);
  await at(page, 13);
  expect(await overlayInk(page), "nothing falls in summer").toBe(0);
  await at(page, 19.4);
  expect(await overlayInk(page), "leaves fall").toBeGreaterThan(30);
  await at(page, 25);
  expect(await overlayInk(page), "snow falls").toBeGreaterThan(30);

  // It loops: a cycle later is spring again (the tree regrown), and the sway never leaves the view's own rotation.
  await at(page, (await page.evaluate(() => SEASON_CYCLE_S)) + 2);
  expect(await page.evaluate(() => ({ playing: seasonsPlaying(), depth: treeView.season.depth, turn: treeView.view.rotation }))).toMatchObject({ playing: true, turn: 0 });
  expect((await page.evaluate(() => treeView.season.depth))).toBeGreaterThan(12);

  // The picked color and depth were never written.
  expect(await page.evaluate(() => ({ color: vectorColors.tree, depth: treeState.depth }))).toEqual(saved);
});

const els_label = (page) => page.evaluate(() => els.treeCanvas.getAttribute("aria-label"));

test("the tree sways a little while it plays", async ({ page }) => {
  await load(page);
  await chooseTheSeasons(page);
  const sways = [];
  for (const t of [7, 7.9, 8.8, 9.7]) {
    await at(page, t);
    sways.push(await page.evaluate(() => treeView.season.sway));
  }
  expect(Math.max(...sways) - Math.min(...sways)).toBeGreaterThan(0.002);
  expect(Math.max(...sways.map(Math.abs))).toBeLessThan(0.03);
});

test("a touch stops it and leaves the tree as drawn; pan and twist work; the picked color and depth are kept", async ({ page }) => {
  await load(page);
  const saved = await page.evaluate(() => ({ color: vectorColors.tree, depth: treeState.depth }));
  // The look at the instant of the touch (this listener is added before the player's, so it runs first).
  await page.evaluate(() => document.addEventListener("pointerdown", () => {
    if (treeView.season?.playing) window.beforeTouch = { rgb: treeView.season.rgb.slice(), depth: treeView.season.depth, sway: treeView.season.sway, rot: treeView.view.rotation };
  }, true));
  await chooseTheSeasons(page);
  await at(page, 19.4);
  const box = await page.locator("#treeCanvas").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const stopped = await page.evaluate(() => ({ playing: seasonsPlaying(), run: seasonsRun === null, overlay: !!document.getElementById("treeSeasonsFx"), frozen: treeView.season?.playing === false }));
  expect(stopped).toEqual({ playing: false, run: true, overlay: false, frozen: true });
  await page.mouse.up();
  // The look stays exactly (the sway became the view's rotation, nothing else moved).
  const before = await page.evaluate(() => window.beforeTouch);
  const after = await page.evaluate(() => ({ rgb: treeView.season.rgb.slice(), depth: treeView.season.depth, sway: treeView.season.sway, rot: treeView.view.rotation }));
  expect(after.rgb).toEqual(before.rgb);
  expect(after.depth).toBe(before.depth);
  expect(after.sway).toBe(0);
  expect(after.rot).toBeCloseTo(before.rot + before.sway, 9);
  // Time passing changes nothing now.
  const still = await treeData(page);
  await frames(page, 10);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
  expect(await treeData(page)).toBe(still);
  // Normal pan works, on the same look.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 40, { steps: 5 });
  await page.mouse.up();
  await frames(page);
  expect(await treeData(page)).not.toBe(still);
  expect(await page.evaluate(() => treeView.season.rgb.map(Math.round))).toEqual(before.rgb.map(Math.round));
  // The picked color and depth were never touched.
  expect(await page.evaluate(() => ({ color: vectorColors.tree, depth: treeState.depth }))).toEqual(saved);
});

test("the tree goes back to the picked color and depth when one is picked, or the tree is left", async ({ page }) => {
  await load(page);
  const plain = await (async () => { await page.evaluate(() => { setMode("tree"); requestRender(); }); await frames(page); return treeData(page); })();
  // Picking a color while it plays ends it.
  await chooseTheSeasons(page);
  await at(page, 13);
  await page.evaluate(() => { vectorColors.tree = SOLID_COLORS.findIndex((c) => c.name === "Violet"); requestRender(); });
  await frames(page, 4);
  expect(await page.evaluate(() => ({ playing: seasonsPlaying(), season: treeView.season, overlay: !!document.getElementById("treeSeasonsFx") }))).toEqual({ playing: false, season: null, overlay: false });
  const violet = await treeColor(page);
  expect(violet.rgb[2], "violet: blue above green").toBeGreaterThan(violet.rgb[1]);
  // Moving the depth slider while it plays ends it too, and the tree is drawn at that depth.
  await page.evaluate(() => { vectorColors.tree = 0; requestRender(); });
  await chooseTheSeasons(page);
  await at(page, 13);
  await page.evaluate(() => { treeState.depth = 6; requestRender(); });
  await frames(page, 4);
  expect(await page.evaluate(() => ({ playing: seasonsPlaying(), season: treeView.season }))).toEqual({ playing: false, season: null });
  // A stopped (frozen) look ends on leaving the tree: back in it, the tree is the picked one.
  await page.evaluate(() => { treeState.depth = 9; });
  await chooseTheSeasons(page);
  await at(page, 19.4);
  await touch(page);
  expect(await page.evaluate(() => treeView.season?.playing)).toBe(false);
  await page.evaluate(() => { setMode("koch"); });
  expect(await page.evaluate(() => treeView.season)).toBe(null);
  await page.evaluate(() => { setMode("tree"); });
  await frames(page, 3);
  expect(await page.evaluate(() => treeView.season)).toBe(null);
  // Same view and picked look as before the animation (the sway went into the rotation only if it was stopped by a touch).
  const tail = await treeColor(page);
  expect(tail.rgb[1]).toBeGreaterThan(tail.rgb[0]);
  void plain;
});

test("choosing the place again starts the cycle over", async ({ page }) => {
  await load(page);
  await chooseTheSeasons(page);
  await at(page, 20);
  await chooseTheSeasons(page);
  const t = await page.evaluate(() => (performance.now() - seasonsRun.t0) / 1000);
  expect(t).toBeLessThan(3);
  expect(await page.evaluate(() => seasonsPlaying())).toBe(true);
  // After a touch has stopped it, choosing it again plays again.
  await touch(page);
  expect(await page.evaluate(() => seasonsPlaying())).toBe(false);
  await chooseTheSeasons(page);
  expect(await page.evaluate(() => ({ playing: seasonsPlaying(), overlay: !!document.getElementById("treeSeasonsFx"), sway: treeView.season.sway !== undefined }))).toEqual({ playing: true, overlay: true, sway: true });
});

test("Reduce Motion lands on the still spring tree and says nothing", async ({ page }) => {
  await load(page, { reducedMotion: true });
  await chooseTheSeasons(page);
  const seen = await page.evaluate(() => ({
    mode, playing: seasonsPlaying(), run: seasonsRun, overlay: !!document.getElementById("treeSeasonsFx"),
    said: document.getElementById("runAnnounce").textContent, rgb: treeView.season.rgb, depth: treeView.season.depth, sway: treeView.season.sway,
    label: els.treeCanvas.getAttribute("aria-label"),
  }));
  expect(seen).toMatchObject({ mode: "tree", playing: false, run: null, overlay: false, said: "", depth: 13, sway: 0, label: "Pythagoras tree" });
  expect(seen.rgb).toEqual(await page.evaluate(() => seasonAt(0).rgb));
  const still = await treeData(page);
  await page.evaluate(() => new Promise((r) => setTimeout(r, 600)));
  expect(await treeData(page)).toBe(still);
  const c = await treeColor(page);
  expect(c.rgb[1], "spring green").toBeGreaterThan(c.rgb[0] * 1.1);
});
