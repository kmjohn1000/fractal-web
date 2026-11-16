// Photosensitivity check of Surprise-me flights: do any of them flash more
// than three times a second (WCAG 2.3.1, the general and red flash thresholds)?
//
//   node scripts/flash-check.mjs [--out DIR] [--only NAME] [--distance-cm N] [--keep-frames] [--reduced-motion] [--dive full|blur]
//   node scripts/flash-check.mjs --analyze DIR     (re-run the analysis on frames already captured)
//
// Capture: the web build in headless WebKit at iPhone 15 size (393x852 pt at 2x, the renderer's
// pixel-ratio cap) runs the app's own flight (flyToPlace, as Surprise me does) on Playwright's fake
// clock, one 16 ms step at a time, and saves each frame (the flight blend's overlay included); it keeps
// going 2 s past the landing so the full-quality redraw and the blend's fade are in the recording too.
// Each run sets a color style, Repeat and palette first, the way the Color sheet does. A run whose
// folder already has a result.json is skipped, so use a new --out for each build checked.
// --reduced-motion: the page prefers reduced motion (the crossfade instead of the flight).
//
// Analysis, per run, on relative luminance (sRGB linearized, 2x2 pixels averaged to one point):
//   area   A square the size of the smallest area WCAG counts (a quarter of a 10-degree visual
//          field at the viewing distance) slides over the screen; its mean luminance is followed
//          frame by frame. A transition is a swing of 0.1 or more (the darker side under 0.8);
//          a flash is two. More than 6 transitions in any 1 s fails. This is how the broadcast
//          checkers (Harding, PEAT) treat a fine moving pattern: as the average it looks like.
//   pixel  The same rule on every point on its own, then: in any 10-degree field, do the points
//          that are flashing more than 3 times a second at that moment cover more than a quarter
//          of it? Stricter than the area method (a fine moving pattern counts as flashing).
//   red    The area method on WCAG's saturated red, 320 x max(0, R - G - B) where R/(R+G+B) >= 0.8
//          (linear), with a swing of 20 as the transition.
// iPhone 15: 460 ppi at 3 px per point, about 60.4 points per cm. Viewing distance 30 cm by
// default (a 10-degree field is then about 317 points across); 25 cm is stricter.
/* global window, TELEPORT_DESTINATIONS, COLORMAPS, setColorStyle, mainState, zoomPath, prefersReducedMotion,
   SPIRAL_DIVE_MS, teleportDurationMs, colorStyleFor, flyToPlace, blendState, setDiveStyle, slowDiveMs */
import { webkit } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PORT = Number(process.env.PW_PORT || 8749);
const STEP_MS = 16; // fake-timers fires requestAnimationFrame every 16 ms
const W_PT = 393, H_PT = 852, DPR = 2;
const PT_PER_CM = 460 / 3 / 2.54;
const CLOCK_START = Date.UTC(2026, 0, 1);

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const has = (name) => args.includes(`--${name}`);
const distanceCm = Number(opt("distance-cm", 30));
const tau = opt("tau", null); // the flight blend's time constant in ms, for trying others (flight-blend.js)
const dive = opt("dive", "full"); // the dive style (dive-style.js): full (the app's default) or blur
// --shard I/N: only every Nth run, from the Ith (0-based), so N copies (each with its own PW_PORT) share one --out.
const [shardI, shardN] = opt("shard", "0/1").split("/").map(Number);
let runIndex = 0;

// Flights: from the fractal's opening view to a place (from: null), or from one place to another.
// Bands draws on every escape-time type; Stripes on Mandelbrot, Ship, Tricorn, Celtic, Spider, sine.
const FLIGHTS = [
  { fractal: "Mandelbrot", to: "Mini Mandelbrot" },
  { fractal: "Mandelbrot", to: "Sunburst Fan" },
  { fractal: "Mandelbrot", to: "Seahorse Valley" },
  { fractal: "Mandelbrot", from: "Mini Mandelbrot", to: "Sunburst Fan" },
  { fractal: "Burn. Ship", to: "Sunken Crown" },
  { fractal: "Tricorn", to: "Flame Minibrot" },
  { fractal: "Celtic", to: "Halo Bell" },
  { fractal: "Multibrot³", to: "Haloed Minibrot" },
  { fractal: "Julia:Rabbit", to: "Rabbit Hole" },
  { fractal: "Julia:Dragon", to: "Into the Eye" },
  { fractal: "Julia:Spiral", to: "Into the Galaxy" },
  { fractal: "Spider", to: "Spiral Eye" },
  { fractal: "Sine L plane", to: "Golden Shells" },
  { fractal: "Julia:Phoenix", to: "Ember Spiral", styles: ["bands"] },
  { fractal: "Magnet I", to: "Deep Foam", styles: ["bands"] },
  // The pattern fractals' 7 s spiral dives: Smooth only (Bands and Stripes don't draw on them).
  { fractal: "Carpet", to: "Spiral Dive", styles: [] },
  { fractal: "Gasket", to: "Stair Dive", styles: [] },
  { fractal: "Apollonian", to: "Golden Dive", styles: [] },
];
// The two Looks (Bands: Turbo, Stripes: Glacier), at the default Repeat and the slider's top.
// Smooth is the control: the default style, in the fractal's (and the place's) own palette (null) and in Turbo.
const LOOKS = [
  { style: "smooth", palette: null, density: 1 },
  { style: "smooth", palette: "Turbo", density: 1 },
  { style: "bands", palette: "Turbo", density: 1 },
  { style: "bands", palette: "Turbo", density: 8 },
  { style: "stripes", palette: "Glacier", density: 1 },
  { style: "stripes", palette: "Glacier", density: 8 },
];
const extraPalettes = opt("palettes", "").split(",").filter(Boolean); // e.g. --palettes Grayscale

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const runName = (f, l) => `${slug(f.fractal)}_${f.from ? `${slug(f.from)}-to-` : ""}${slug(f.to)}_${l.style}_${slug(l.palette || "default")}_x${l.density}${dive === "blur" ? "_blur" : ""}${tau ? `_tau${tau}` : ""}`;

// ------------------------------------------------------------------ analysis

const SRGB = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

// Hysteresis zigzag: calls onTransition(frame) each time the value swings `thresh` the other way
// from its last extreme (the first swing either way counts too). `dark` is the WCAG rule that the
// darker of the two states is under 0.8 (null to skip it, for red).
function makeTracker(thresh, dark) {
  return { dir: 0, ext: 0, mn: Infinity, mx: -Infinity, thresh, dark };
}
function track(t, v) {
  if (t.dir === 0) {
    if (v < t.mn) t.mn = v;
    if (v > t.mx) t.mx = v;
    if (v - t.mn >= t.thresh && (t.dark === null || t.mn < t.dark)) { t.dir = 1; t.ext = v; return true; }
    if (t.mx - v >= t.thresh && (t.dark === null || v < t.dark)) { t.dir = -1; t.ext = v; return true; }
    return false;
  }
  if (t.dir === 1) {
    if (v > t.ext) { t.ext = v; return false; }
    if (t.ext - v >= t.thresh && (t.dark === null || v < t.dark)) { t.dir = -1; t.ext = v; return true; }
    return false;
  }
  if (v < t.ext) { t.ext = v; return false; }
  if (v - t.ext >= t.thresh && (t.dark === null || t.ext < t.dark)) { t.dir = 1; t.ext = v; return true; }
  return false;
}

// Most transitions in any 1 s window, from a sorted list of frame indices.
function maxPerSecond(frames, fps) {
  let best = 0, j = 0;
  for (let i = 0; i < frames.length; i++) {
    while (frames[i] - frames[j] >= fps) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

// The PNG frames decoded by ffmpeg, one Buffer of RGB bytes per frame.
async function* rawFrames(dir, fps, frameBytes) {
  const ff = spawn("ffmpeg", ["-v", "error", "-framerate", String(fps), "-i", join(dir, "%05d.png"),
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "inherit"] });
  let buf = Buffer.alloc(0);
  for await (const chunk of ff.stdout) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= frameBytes) {
      yield buf.subarray(0, frameBytes);
      buf = buf.subarray(frameBytes);
    }
  }
}

async function analyze(dir, fps = 1000 / STEP_MS) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  if (files.length < 2) return null;
  // The canvas's size in pixels, from the first PNG's header (it is shorter than the screen: the toolbar).
  const head = readFileSync(join(dir, files[0]));
  const pw = head.readUInt32BE(16), ph = head.readUInt32BE(20);
  const W_PT = Math.floor(pw / DPR), H_PT = Math.floor(ph / DPR);
  const field = Math.round(distanceCm * 2 * Math.tan((5 * Math.PI) / 180) * PT_PER_CM); // 10-degree field, across
  const fieldSide = Math.round(field * Math.sqrt(Math.PI) / 2); // a square of the same area
  const areaSide = Math.round(Math.sqrt((Math.PI * field * field) / 4 / 4)); // a quarter of the field
  const STRIDE = 8;
  const frameBytes = pw * ph * 3;
  let n = 0;
  const N = W_PT * H_PT;
  const lum = new Float32Array(N), red = new Float32Array(N);
  const winsX = Math.floor((W_PT - areaSide) / STRIDE) + 1, winsY = Math.floor((H_PT - areaSide) / STRIDE) + 1;
  const winL = Array.from({ length: winsX * winsY }, () => makeTracker(0.1, 0.8));
  const winR = Array.from({ length: winsX * winsY }, () => makeTracker(20, null));
  const winLT = Array.from({ length: winsX * winsY }, () => []);
  const winRT = Array.from({ length: winsX * winsY }, () => []);
  const pix = Array.from({ length: N }, () => makeTracker(0.1, 0.8));
  const RING = 7; // the 7th transition back inside 1 s = more than 3 flashes
  const ring = new Int32Array(N * RING).fill(-1e9), ringPos = new Uint8Array(N);
  const flashing = new Uint8Array(N);
  const S = new Float64Array((W_PT + 1) * (H_PT + 1)), SR = new Float64Array((W_PT + 1) * (H_PT + 1));
  const SF = new Int32Array((W_PT + 1) * (H_PT + 1));
  const box = (I, x, y, s) => I[(y + s) * (W_PT + 1) + x + s] - I[y * (W_PT + 1) + x + s] - I[(y + s) * (W_PT + 1) + x] + I[y * (W_PT + 1) + x];
  let worstPixelArea = 0, worstPixelFrame = -1;
  const meanLum = [];
  for await (const raw of rawFrames(dir, fps, frameBytes)) {
    const f = n++, base = 0;
    let sum = 0;
    for (let y = 0; y < H_PT; y++) {
      for (let x = 0; x < W_PT; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const o = base + ((2 * y + dy) * pw + 2 * x + dx) * 3;
          r += SRGB[raw[o]]; g += SRGB[raw[o + 1]]; b += SRGB[raw[o + 2]];
        }
        r /= 4; g /= 4; b /= 4;
        const i = y * W_PT + x;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lum[i] = L; sum += L;
        red[i] = r + g + b > 0 && r / (r + g + b) >= 0.8 ? 320 * Math.max(0, r - g - b) : 0;
        if (track(pix[i], L)) { ring[i * RING + ringPos[i]] = f; ringPos[i] = (ringPos[i] + 1) % RING; }
        // ringPos now points at the oldest of the last 7 transitions
        flashing[i] = f - ring[i * RING + ringPos[i]] < fps ? 1 : 0;
      }
    }
    meanLum.push(sum / N);
    for (let y = 0; y < H_PT; y++) {
      let a = 0, ar = 0, af = 0;
      for (let x = 0; x < W_PT; x++) {
        const i = y * W_PT + x;
        a += lum[i]; ar += red[i]; af += flashing[i];
        const k = (y + 1) * (W_PT + 1) + x + 1, up = y * (W_PT + 1) + x + 1;
        S[k] = S[up] + a; SR[k] = SR[up] + ar; SF[k] = SF[up] + af;
      }
    }
    const a2 = areaSide * areaSide;
    for (let wy = 0; wy < winsY; wy++) for (let wx = 0; wx < winsX; wx++) {
      const w = wy * winsX + wx, x = wx * STRIDE, y = wy * STRIDE;
      if (track(winL[w], box(S, x, y, areaSide) / a2)) winLT[w].push(f);
      if (track(winR[w], box(SR, x, y, areaSide) / a2)) winRT[w].push(f);
    }
    for (let y = 0; y + fieldSide <= H_PT; y += STRIDE) for (let x = 0; x + fieldSide <= W_PT; x += STRIDE) {
      const frac = box(SF, x, y, fieldSide) / (fieldSide * fieldSide);
      if (frac > worstPixelArea) { worstPixelArea = frac; worstPixelFrame = f; }
    }
  }
  let areaMax = 0, areaWin = -1, redMax = 0;
  winLT.forEach((t, w) => { const m = maxPerSecond(t, fps); if (m > areaMax) { areaMax = m; areaWin = w; } });
  winRT.forEach((t) => { redMax = Math.max(redMax, maxPerSecond(t, fps)); });
  const fullT = []; const full = makeTracker(0.1, 0.8);
  meanLum.forEach((v, f) => { if (track(full, v)) fullT.push(f); });
  return {
    frames: n, seconds: +(n / fps).toFixed(2),
    areaSide, fieldSide,
    areaMaxTransitionsPerSec: areaMax,
    areaWorstAt: areaWin >= 0 ? { x: (areaWin % winsX) * STRIDE, y: Math.floor(areaWin / winsX) * STRIDE } : null,
    redMaxTransitionsPerSec: redMax,
    pixelWorstFlashingShareOfField: +worstPixelArea.toFixed(3),
    pixelWorstFrame: worstPixelFrame,
    fullScreenTransitions: fullT.length,
    pass: { area: areaMax <= 6, red: redMax <= 6, pixel: worstPixelArea <= 0.25 },
  };
}

// ------------------------------------------------------------------ capture

async function capture(outDir, only) {
  const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; ; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) break;
    if (i > 50) { server.kill(); throw new Error(`the static server didn't start on port ${PORT}`); }
    await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await webkit.launch();
  const results = {};
  try {
    for (const flight of FLIGHTS) {
      for (const look of [...LOOKS, ...extraPalettes.flatMap((p) => LOOKS.filter((l) => l.density === 8).map((l) => ({ ...l, palette: p })))]) {
        if (flight.styles && look.style !== "smooth" && !flight.styles.includes(look.style)) continue;
        const name = runName(flight, look);
        if (only && !name.includes(only)) continue;
        if (shardN > 1 && runIndex++ % shardN !== shardI) continue;
        const dir = join(outDir, name);
        if (existsSync(join(dir, "result.json"))) { results[name] = JSON.parse(readFileSync(join(dir, "result.json"), "utf8")); continue; }
        mkdirSync(dir, { recursive: true });
        const t0 = Date.now();
        const context = await browser.newContext({ viewport: { width: W_PT, height: H_PT }, deviceScaleFactor: DPR, serviceWorkers: "block",
          reducedMotion: has("reduced-motion") ? "reduce" : "no-preference" });
        await context.addInitScript(() => {
          try {
            localStorage.setItem("fractalAtlas.visited", "1");
            localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
            localStorage.setItem("fractalAtlas.tourDone", "1");
          } catch { /* storage blocked */ }
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        // Paused once the page is up, so only runFor moves time (a screenshot takes far longer than a frame).
        await page.clock.install({ time: CLOCK_START });
        await page.goto(`http://127.0.0.1:${PORT}/index.html#v=1&m=fractal&f=Mandelbrot&x=-0.5&y=0&s=1.2&r=0`);
        // (the page's own clock may already be past any fixed time when a load is slow)
        await page.clock.pauseAt((await page.evaluate("Date.now()")) + 2000);
        await page.addScriptTag({ path: join(root, "tests/driver.js") });
        await page.addStyleTag({ content: "body > *:not(#canvasArea) { visibility: hidden !important; } #canvasArea > :not(canvas) { visibility: hidden !important; } *, *::before, *::after { transition: none !important; animation: none !important; }" });
        const setup = await page.evaluate(({ flight, look }) => {
          const idx = (label) => TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === flight.fractal && d.label === label);
          const to = idx(flight.to), from = flight.from ? idx(flight.from) : -1;
          if (to < 0 || (flight.from && from < 0)) return { error: "place not found" };
          // null: none picked, so the fractal's and then the place's own palette, as for a new user
          const cm = look.palette === null ? undefined : COLORMAPS.findIndex((c) => c.name === look.palette);
          if (cm < 0) return { error: `no palette ${look.palette}` };
          if (from >= 0) window.__vt.place(from, cm); else window.__vt.fractal(flight.fractal, cm);
          setColorStyle({ style: look.style, density: look.density, offset: 0 });
          setDiveStyle(look.dive);
          if (look.tau) blendState.tau = Number(look.tau);
          const st = mainState, d = TELEPORT_DESTINATIONS[to];
          const path = zoomPath([st.cx, st.cy, 2 * st.scale], [Number(d.re), Number(d.im), 2 * d.scale]);
          const ms = d.spiral && !prefersReducedMotion() ? SPIRAL_DIVE_MS
            : look.dive === "slow" ? slowDiveMs(path.distance) : teleportDurationMs(path.distance);
          return { to, ms, efolds: path.distance * Math.SQRT2, drawn: colorStyleFor(st).glsl };
        }, { flight, look: { ...look, tau, dive } });
        if (setup.error) throw new Error(`${name}: ${setup.error}`);
        // Let the starting view finish (supersamples, deep passes) on the fake clock.
        for (let i = 0; i < 400; i++) {
          await page.clock.runFor(100);
          if (await page.evaluate("window.__vt.settled()")) break;
        }
        await page.clock.runFor(50); // two more frames (rAF only fires when runFor moves the paused clock)
        const canvas = page.locator("#mainCanvas");
        let n = 0;
        const track = [];
        const shot = async () => {
          n++;
          await canvas.screenshot({ path: join(dir, `${String(n).padStart(5, "0")}.png`), animations: "disabled", caret: "hide" });
          track.push(await page.evaluate("({ now: performance.now(), scale: mainState.scale, live: isInteracting, iter: mainState.maxIter, div: liveRes.step })"));
        };
        await shot(); // the frame before takeoff
        await page.evaluate((i) => flyToPlace(i), setup.to);
        // Past the landing: the settle (200 ms), the flight blend's tail and fade (flight-blend.js), and a margin.
        const steps = Math.ceil(((has("reduced-motion") ? 0 : setup.ms) + 2000) / STEP_MS);
        for (let i = 0; i < steps; i++) {
          await page.clock.runFor(STEP_MS);
          await shot();
        }
        writeFileSync(join(dir, "frames.json"), JSON.stringify(track));
        await context.close();
        const res = { name, ...flight, ...look, flightMs: setup.ms, efolds: +setup.efolds.toFixed(1), styleDrawn: setup.drawn, errors, ...(await analyze(dir)) };
        writeFileSync(join(dir, "result.json"), JSON.stringify(res, null, 2));
        results[name] = res;
        if (!has("keep-frames")) {
          // Keep a small mp4 for looking at, then drop the PNGs.
          spawnSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(1000 / STEP_MS), "-i", join(dir, "%05d.png"),
            // half size; x264's 4:2:0 needs even sides
            "-vf", "scale=392:-2:flags=area", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "18", join(dir, "flight.mp4")]);
          for (const f of readdirSync(dir)) if (f.endsWith(".png")) spawnSync("trash", [join(dir, f)]);
        }
        const p = res.pass;
        console.log(`${name}: ${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s; area ${res.areaMaxTransitionsPerSec}/s, red ${res.redMaxTransitionsPerSec}/s, pixel ${(res.pixelWorstFlashingShareOfField * 100).toFixed(1)}% -> ${p.area && p.red && p.pixel ? "pass" : "FAIL"}${errors.length ? ` (page errors: ${errors.length})` : ""}`);
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  writeFileSync(join(outDir, shardN > 1 ? `summary-${shardI}.json` : "summary.json"), JSON.stringify(results, null, 2));
  return results;
}

if (has("analyze")) {
  const dir = opt("analyze");
  console.log(JSON.stringify(await analyze(dir), null, 2));
} else {
  const outDir = opt("out", join(root, "store-assets/flash-check"));
  mkdirSync(outDir, { recursive: true });
  await capture(outDir, opt("only", ""));
}
