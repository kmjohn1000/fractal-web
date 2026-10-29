// make-short.mjs: the engine that makes the app's vertical YouTube Shorts
// (1080x1920, 30 fps) from the app itself, driven by a RECIPE: a small module
// in scripts/shorts/<name>.mjs that holds everything specific to one Short.
//
//   node scripts/make-short.mjs <command> [--recipe <name>] [options]
//
// Recipes in scripts/shorts/ (the default is the-infinite):
//   the-infinite.mjs      "The Infinite": a 58 s Mandelbrot dive (renderer "dive")
//   the-chaos-game.mjs    "The Chaos Game": the dot shapes' replay (renderer "capture")
//   the-chaos-game-v2.mjs its second cut: all four rules explained, rings on the Vicsek, longer first jumps
//                         (imports the first cut's scenes, grid, audio; output to the-chaos-game-v2/)
//   the-endless-carpet.mjs, the-endless-gasket.mjs   seamless-loop dives (renderer "dive", built by loop-dive.mjs)
//
// To make a new Short: copy the recipe closest to it, change the fields below, and
// run `build --recipe <name>`. Nothing in this file is specific to one Short.
//
// ------------------------------------------------------------------ recipe format
// A recipe is `export default { ... }` with
//   id        work folder name under store-assets/short/ (git-ignored, regenerable)
//   title     the Short's name (for messages and post.md)
//   stem      file name stem of the deliverables: <stem>-pure.mp4, <stem>-endcard.mp4,
//             <stem>-bed.m4a (thumbnail.png and post.md keep their names)
//   outDir    where the deliverables go (~ is the home folder)
//   fps       frames per second (30), size  [width, height] ([1080, 1920])
//   seconds   length of the picture (a capture recipe's length comes from its layout)
//   fadeOut, cardFade, cardHold   seconds: the pure cut fades to black over the last
//             fadeOut; the end-card cut brings the card in over cardFade and holds it cardHold
//   thumbAt   second of the frame the thumbnail is taken from
//   loopAudio optional, a looping Short: fadeOut 0 (no fade to black) and the bed folded so its end runs into its start,
//             crossfading this many seconds (the audio master must be at least seconds + loopAudio long)
//   renderer  { type: "dive", ... } or { type: "capture", ... }  (below)
//   audio     the sound bed: an object, or a function ({layout, meta, seconds}) => object (below)
//   post      the post.md text: an object, or a function ({layout, meta, facts}) => object
//             { titles: [3 strings], notes (files line), description, hashtags, pinned,
//               posting: [bullets] }; written by the `post` command
//
// renderer "dive": the WebGL escape-time renderer, one deep-zoom path, frame by frame
//   fractal   the app fractal ("Mandelbrot"), palette {name, stops} added to the app's list
//   path(seconds)  -> (t) => { t, scale, cx, cy, offset, rotation (radians, default 0), layers: [{style, density, weight?}, ...], ... }
//             layers[0] is the base picture; each later layer is shot too and blended
//             over it at `weight` (skipped when weight <= 0.002)
//   pageSetup optional JS string run in the page once after the palette (e.g. to override an app global)
//   dsf       optional device scale factor (default 1): the page is laid out W/dsf x H/dsf css px, so the app's UI
//             keeps its phone proportions and the shots are still W x H
//   plan      { header, row(i, s) }: the columns the `plan` command prints
//   facts(ctx) -> object: what the app says about the deepest frame (for the post)
//
// renderer "capture": frame-by-frame capture of an app animation, then a compositor
//   scenes    { id: { driver: "replay", shape, color, count, seed, size: [cssW, cssH],
//             dsf, frame: {zoom, dx, dy}, speed: [[videoSecond, speed], ...] } }.
//             The "replay" driver is the dot shapes' chaos-game replay (fern.js) on its
//             manual clock with a seeded ifsRandom (as tests/visual/dot-replay.spec.mjs):
//             the canvas pixels are read back directly (no toolbar, no card), one PNG per
//             video frame in scenes/<id>/, then the settled normal picture as the last
//             frame. `speed` is a piecewise-linear play speed over the scene's own video
//             time (1 = the app's 8 s replay); the engine integrates it into schedule time.
//             Each scene also writes meta.json (jump landing times and the transform each
//             used, for sound; when the picture completes).
//   layout(meta, {fps, W, H}) -> { seconds, beats: [[start, end, text]], frame(i, t) -> [layer] }
//             layers drawn by the compositor, in order:
//             {backdrop:true} | {fill:"#000", alpha} |
//             {scene, frame, x, y, w, h, alpha, feather} (a scene frame; frame numbers past
//             the scene's last frame show the settled picture) |
//             {text, x, y, size, alpha, align, color} (the app's serif italic, \n = new line) |
//             {circle:true, x, y, r, stroke, lw, fillColor, add, alpha, filter} (a ring and/or a disc;
//             add = drawn with "lighter" as the app's overlay is)
//             Each scene's meta.json also carries view {cx, cy, halfHeight, rotation}, rgb (one per
//             transform) and fixed (each map's fixed point), to place such layers (see the-chaos-game-v2).
//   facts({page, meta, layout}) -> object, for the post
//
// audio: { seconds (master length, trimmed by each cut), targetLufs, limiter, layers: [...] }
//   {type:"drone", notes: [[Hz, amp]], detune: [base, step], tremolo: [base, step],
//      drift: [depth, depthStep, rate, rateStep], noise: "<ffmpeg filters>", post: "<ffmpeg filters>",
//      swell: "<volume expression in t>"}   open chord of detuned sines + a noise breath
//   {type:"bell", gain, level, attack, partials: [[ratio, amp, tau]], strikes: [{at, freq, detune, gain?}]}
//   {type:"plucks", gain, voice: {partials: [[ratio, amp, tau]], attack, length}, echo,
//      events: [{t, hz, gain, pan: -1..1}]}   one short decaying tone per event, placed to the sample
//   {type:"shimmer", gain, seed, bands: [{hp, lp, env: "<expression in t>"}]}   filtered noise
//
// ------------------------------------------------------------------ commands
//   frames    render the picture: dive = shoot every frame in headless WebKit; capture =
//             scenes, then compose
//   scenes    (capture) capture the scenes' frames into scenes/<id>/   [--scene a,b] [--dry]
//   meta      (capture) the same without frames (fast): writes scenes/<id>/meta.json
//   compose   (capture) composite the final frames from the scenes (the recipe's layout)
//   audio     synthesize the sound bed with ffmpeg (no audio files, no downloads);
//             --print shows the ffmpeg command instead of running it
//   cuts      encode the two cuts, the bed, the thumbnail and a QA report
//   build     frames, then audio, then cuts
//   stills <jobs.json> <outDir>   (dive) render single stills (a JSON list of {name, cx, cy,
//             scale, palette, style, density, offset, maxIter}) for choosing a target
//   plan      dive: the camera path as CSV; capture: the beat table and the scenes' schedule
//   facts     what the app says, for the post
//   post      write post.md into the output folder (--force to replace an existing one)
//   audiocheck <file.m4a|mp4>   levels at the start, the middle and the fade-out, and loudness;
//             a recipe with pluck events also gets onset checks at the first events
//   sheet <framesDir> <out.png> [--every N] [--first N] [--cols C] [--cell WxH]
//             a labelled contact sheet of a frames folder (every Nth file, or the first N)
//
// Options:
//   --recipe NAME    which recipe (default the-infinite)
//   --size WxH       render size (default the recipe's, 1080x1920; a smaller size is scaled up when the cuts are made)
//   --out-size WxH   video size (default the recipe's)
//   --stride N       render every Nth frame only: a quick look-over, written to its own
//                    frames-strideN folder (not a video)
//   --only LIST      render only these frame numbers (comma separated) into the frames folder
//   --until SEC      frames: stop after this many seconds (a preview of the start)
//   --scene a,b      (scenes) only these scenes;  --dry  (scenes) meta only, no frames
//   --layers a,b     (audio) only these layer types (drone, bell, plucks, shimmer): a stem for balancing
//   --print          (audio) print the ffmpeg arguments instead of running them
//   --force          (post) replace an existing post.md
//   --resume         skip frames whose file already exists
//   --passes N       (dive) the app's deep-zoom sharpening passes, 2-16 (default 16)
//   --seconds N      (dive) length of the picture (default the recipe's)
//   --name NAME      work folder name under store-assets/short/ (default the recipe's id)
//   --out-dir DIR    where the deliverables go (default the recipe's outDir)
//   --thumb-at SEC   the frame (in seconds) the thumbnail is taken from
//
// Output (git-ignored, regenerable): store-assets/short/<name>/{frames,scenes,...};
// deliverables in --out-dir.
import { webkit } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
/* global window, setMode, fernView, vectorColors, SOLID_COLORS, fernState, els, fitVectorView, ifsRandom:writable,
   fernRenderOpts, syncReplayButtons, IFS_SYSTEMS, replayTimeOf, ifsTransformColors */
/* eslint no-unused-vars: ["error", { "vars": "local" }] */
// (the globals are the app's: the callbacks given to page.evaluate run inside the page)
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PORT = 8751;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- command line

const args = process.argv.slice(2);
const command = args.shift();
const take = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (f) => {
  const i = args.indexOf(`--${f}`);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const recipeName = take("recipe", "the-infinite");
const recipe = (await import(new URL(`./shorts/${recipeName}.mjs`, import.meta.url))).default;
const R = recipe.renderer;
const FPS = recipe.fps ?? 30;
const FADE_OUT = recipe.fadeOut ?? 2.0, CARD_FADE = recipe.cardFade ?? 0.6, CARD_HOLD = recipe.cardHold ?? 1.5;

const resume = flag("resume");
const dry = flag("dry") || command === "meta";
const printOnly = flag("print");
const force = flag("force");
const stride = Number(take("stride", 1));
const passes = Number(take("passes", 16));
const seconds = Number(take("seconds", recipe.seconds ?? 0));
const name = take("name", recipe.id);
const outDir = take("out-dir", (recipe.outDir || "").replace(/^~/, homedir()));
const thumbAt = Number(take("thumb-at", recipe.thumbAt ?? 24));
const [W, H] = take("size", (recipe.size || [1080, 1920]).join("x")).split("x").map(Number);
const [OW, OH] = take("out-size", (recipe.size || [1080, 1920]).join("x")).split("x").map(Number);
const until = Number(take("until", Infinity));
const only = take("only", "")?.split(",").filter(Boolean).map(Number) ?? [];
const sceneFilter = take("scene", "")?.split(",").filter(Boolean) ?? [];
const layerTypes = take("layers", "")?.split(",").filter(Boolean) ?? [];
const every = Number(take("every", 1));
const first = Number(take("first", 0));
const cols = Number(take("cols", 8));
const cell = take("cell", "180x320");
const COMMANDS = ["frames", "scenes", "meta", "compose", "audio", "audiocheck", "facts", "cuts", "build", "stills", "plan", "sheet", "post"];
const usage = () => {
  console.error(`usage: node scripts/make-short.mjs <${COMMANDS.join("|")}> [--recipe NAME] [options]  (see the header of this file)`);
  process.exit(1);
};
if (!COMMANDS.includes(command) || ![every, first, cols, ...only].every(Number.isFinite) || ![stride, passes, seconds, thumbAt, W, H, OW, OH].every(Number.isFinite)
  || stride < 1 || passes < 2 || passes > 16 || W % 2 || H % 2 || OW % 2 || OH % 2) usage();
const isCapture = R.type === "capture";
if (isCapture && ["stills"].includes(command)) { console.error(`${command} is for dive recipes`); process.exit(1); }
if (!isCapture && ["scenes", "meta", "compose"].includes(command)) { console.error(`${command} is for capture recipes`); process.exit(1); }

const workDir = join(root, "store-assets/short", name);
const framesDir = join(workDir, stride > 1 ? `frames-stride${stride}` : "frames");
const scenesDir = join(workDir, "scenes");
const pad = (i) => String(i).padStart(5, "0");

// The capture recipes' scene meta (written by `scenes`/`meta`) and the layout built from it.
const metaFile = (id) => join(scenesDir, id, "meta.json");
function loadMeta() {
  const meta = {};
  for (const id of Object.keys(R.scenes)) {
    if (!existsSync(metaFile(id))) throw new Error(`no meta for scene ${id}: run \`meta\` (or \`scenes\`) first`);
    meta[id] = JSON.parse(readFileSync(metaFile(id), "utf8"));
  }
  return meta;
}
let meta = null, layout = null;
if (isCapture && !["scenes", "meta", "sheet"].includes(command)) {
  meta = loadMeta();
  layout = R.layout(meta, { fps: FPS, W: OW, H: OH });
}
const picSeconds = isCapture ? (layout?.seconds ?? 0) : seconds;
const N = Math.round(picSeconds * FPS);
const path = !isCapture && R.path ? R.path(seconds) : null;

// ---------------------------------------------------------------- plan

if (command === "plan") {
  if (isCapture) {
    console.log(`${recipe.title}: ${picSeconds} s, ${N} frames at ${FPS} fps, ${OW}x${OH}`);
    for (const [a, b, text] of layout.beats) console.log(`${a.toFixed(2).padStart(6)} - ${b.toFixed(2).padStart(6)} s  ${text}`);
    for (const [id, m] of Object.entries(meta)) console.log(`scene ${id}: ${m.shape}, ${m.count.toLocaleString("en-US")} points, replay done at ${m.doneAt.toFixed(2)} s of its own time, ${m.frames} frames, ${m.events.length} events`);
  } else {
    console.log(R.plan.header);
    for (let i = 0; i < N; i += stride) console.log(R.plan.row(i, path(i / FPS)));
  }
  process.exit(0);
}

if (command === "sheet") {
  const [dir, out] = args;
  if (!dir || !out) usage();
  let files = readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f) && /^\d+\./.test(f)).sort();
  files = first ? files.slice(0, first) : files.filter((_, i) => i % every === 0);
  const labelled = files.flatMap((f) => ["-label", `${Number(f.slice(0, 5))}  ${(Number(f.slice(0, 5)) / FPS).toFixed(1)}s`, join(dir, f)]);
  const r = spawnSync("magick", ["montage", ...labelled, "-tile", `${cols}x`, "-geometry", `${cell}+3+3`, "-background", "#222", "-fill", "#ccc", "-font", "/System/Library/Fonts/Helvetica.ttc", "-pointsize", "14", out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("magick montage failed");
  console.log(`${files.length} frames -> ${out}`);
  process.exit(0);
}

// ---------------------------------------------------------------- the app in a page

// A static server for the repo (tests/serve.mjs) and a headless WebKit page on the app.
// size: css px; dsf: device scale factor. Only the picture: the UI is hidden.
async function openApp({ width, height, dsf = 1, passCount = 16, url = "index.html", ui = false }) {
  const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; ; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) break;
    if (i > 50) { server.kill(); throw new Error(`the static server didn't start on port ${PORT}`); }
    await sleep(100);
  }
  const browser = await webkit.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, serviceWorkers: "block" });
  await context.addInitScript((p) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.setItem("fractalAtlas.deepPasses", String(p)); // video frames get every sharpening pass
    } catch { /* storage blocked */ }
    // A seeded stand-in for Math.random (mulberry32), for ifsRandom (as tests/visual/dot-replay.spec.mjs).
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
  }, passCount);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/${url}`);
  if (url === "index.html") {
    await page.addScriptTag({ path: join(root, "tests/driver.js") });
    if (!ui) await page.addStyleTag({ content: "#controls, #speedBubble, .compass, #crosshair, #welcome, #hud { display: none !important; } *, *::before, *::after { transition: none !important; animation: none !important; }" });
  }
  const close = async () => { await browser.close(); server.kill(); };
  return { page, errors, close };
}

// ---------------------------------------------------------------- dive renderer

async function startPage(width, height, passCount) {
  const dsf = R.dsf ?? 1;
  const app = await openApp({ width: width / dsf, height: height / dsf, dsf, passCount });
  await app.page.evaluate(`__vt.fractal(${JSON.stringify(R.fractal || "Mandelbrot")}); window.dispatchEvent(new Event('resize'))`);
  // The palette joins the page's list (the app is not changed), then is picked as a user pick.
  if (R.palette) await app.page.evaluate(`(() => { COLORMAPS.push(${JSON.stringify(R.palette)}); pickColormap(COLORMAPS.length - 1); })()`);
  if (R.pageSetup) await app.page.evaluate(R.pageSetup);
  return app;
}

// Sets the camera and the color style; a frame is finished when the app says
// it has settled (every sharpening pass blended in). If one never does, nudge
// the render and wait again, then shoot it anyway and say so.
async function setFrame(page, v, label) {
  await page.evaluate(`(() => {
    const v = ${JSON.stringify(v)};
    setColorStyle({ style: v.style, density: v.density, offset: v.offset });
    Object.assign(mainState, { cx: v.cx, cy: v.cy, scale: v.scale, rotation: v.rotation || 0 });
    if (v.maxIter) { mainState.maxIter = v.maxIter; mainState.iterAutoLocked = true; } else { mainState.iterAutoLocked = false; applyAutoIter(); }
    requestRender();
  })()`);
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForFunction("window.__vt.settled()", null, { timeout: attempt ? 120_000 : 60_000, polling: 20 });
      break;
    } catch {
      if (attempt >= 2) { console.warn(`${label}: never settled, shooting it as it is`); break; }
      await page.evaluate("requestRender()");
    }
  }
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
}

if (command === "stills") {
  const [jobsFile, stillsDir] = args;
  if (!jobsFile || !stillsDir) usage();
  mkdirSync(stillsDir, { recursive: true });
  const { page, errors, close } = await startPage(W === 1080 && H === 1920 ? 540 : W, W === 1080 && H === 1920 ? 960 : H, passes);
  try {
    for (const j of JSON.parse(readFileSync(jobsFile, "utf8"))) {
      const t0 = Date.now();
      if (j.palette && j.palette !== R.palette?.name) await page.evaluate(`pickColormap(Math.max(0, COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(j.palette)})))`);
      else if (R.palette) await page.evaluate(`pickColormap(COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(R.palette.name)}))`);
      await setFrame(page, { cx: Number(j.cx), cy: Number(j.cy), scale: j.scale, style: j.style || "relief", density: j.density ?? 1, offset: j.offset ?? 0, maxIter: j.maxIter, rotation: j.rotation }, j.name);
      await page.screenshot({ path: join(stillsDir, `${j.name}.png`), type: "png" });
      console.log(`${j.name}  ${Date.now() - t0} ms  maxIter ${await page.evaluate("mainState.maxIter")}`);
    }
    if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
  } finally {
    await close();
  }
  process.exit(0);
}

async function renderDiveFrames() {
  mkdirSync(framesDir, { recursive: true });
  const tmpDir = join(workDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const { page, errors, close } = await startPage(W, H, passes);
  const csv = [];
  const t0 = Date.now();
  let done = 0;
  const shot = (file) => page.screenshot({ path: file, type: "jpeg", quality: 95, animations: "disabled", caret: "hide" });
  try {
    for (let i = 0; i < Math.min(N, Math.round(until * FPS)); i++) {
      if (only.length ? !only.includes(i) : i % stride && i !== N - 1) continue;
      const file = join(framesDir, `${pad(i)}.jpg`);
      if (resume && existsSync(file)) continue;
      const s = path(i / FPS);
      const base = { cx: s.cx, cy: s.cy, scale: s.scale, offset: s.offset, rotation: s.rotation };
      const blended = s.layers.slice(1).filter((l) => l.weight > 0.002);
      // The base picture; while a further layer (the Bands look) is still dissolving, a
      // shot of it is blended in over the picture (ImageMagick).
      await setFrame(page, { ...base, style: s.layers[0].style, density: s.layers[0].density }, `frame ${i}`);
      await shot(blended.length ? join(tmpDir, "layer0.jpg") : file);
      const it = await page.evaluate("mainState.maxIter");
      if (blended.length) {
        let acc = join(tmpDir, "layer0.jpg");
        for (const [k, l] of blended.entries()) {
          await setFrame(page, { ...base, style: l.style, density: l.density }, `frame ${i} ${l.style}`);
          await shot(join(tmpDir, "layerN.jpg"));
          const r = spawnSync("magick", [acc, join(tmpDir, "layerN.jpg"), "-define", `compose:args=${(l.weight * 100).toFixed(2)}`, "-compose", "blend", "-composite", "-quality", "95", k === blended.length - 1 ? file : join(tmpDir, "acc.jpg")]);
          if (r.status !== 0) throw new Error(`magick failed: ${r.stderr}`);
          acc = join(tmpDir, "acc.jpg");
        }
      }
      csv.push([i, s.t.toFixed(3), (await page.evaluate("mainState.scale")).toExponential(6), it].join(","));
      done++;
      if (done % 30 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${el.toFixed(0)}s  frame ${i + 1}/${N}  ${(el / done * 1000).toFixed(0)} ms/frame  scale ${s.scale.toExponential(2)}  maxIter ${it}`);
      }
    }
    if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
  } finally {
    await close();
    writeFileSync(join(workDir, stride > 1 ? `actual-stride${stride}.csv` : "actual.csv"), `${resume ? "" : "frame,t,scale,maxIter\n"}${csv.join("\n")}\n`, { flag: resume ? "a" : "w" });
  }
  console.log(`${done} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s (${(done ? (Date.now() - t0) / done : 0).toFixed(0)} ms/frame) -> ${framesDir}`);
}

// ---------------------------------------------------------------- capture renderer: scenes

// A scene's play speed over its own video time: a piecewise-linear profile through the
// recipe's knots [[videoSecond, speed], ...] (constant after the last one). S(t) is the
// schedule time (seconds of the app's 1x replay) reached at video time t; Sinv inverts it.
function speedProfile(knots) {
  const ks = knots.length ? knots : [[0, 1]];
  const S = (t) => {
    if (t <= 0) return 0;
    let acc = 0;
    for (let i = 0; i < ks.length; i++) {
      const [t0, v0] = ks[i];
      const [t1, v1] = i + 1 < ks.length ? ks[i + 1] : [Infinity, ks[i][1]];
      if (t <= t0) break;
      const e = Math.min(t, t1), v = i + 1 < ks.length ? v0 + (v1 - v0) * (e - t0) / (t1 - t0) : v0;
      acc += (v0 + v) / 2 * (e - t0);
      if (t <= t1) break;
    }
    return acc;
  };
  const Sinv = (s) => {
    let lo = 0, hi = 1;
    while (S(hi) < s && hi < 1e4) hi *= 2;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (S(mid) < s) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  return { S, Sinv };
}

// Puts the app in the scene's state and starts its manual replay (seeded, framed as the scene says).
async function startScene(page, sc) {
  await page.evaluate((m) => setMode(m), sc.shape);
  await page.waitForFunction((m) => fernView.system === m && !fernView.refining && fernView.accepted > 0, sc.shape, { timeout: 90_000 });
  const info = await page.evaluate(({ shape, color, count, seed, frame }) => {
    vectorColors[shape] = SOLID_COLORS.findIndex((c) => c.name === color);
    fernState.count = count;
    els.fernPointsSlider.value = count;
    fitVectorView(shape); // the app's own fit, then the recipe's framing on top of it
    const v = fernView.view, z = frame?.zoom ?? 1;
    v.halfHeight /= z;
    v.rotation = frame?.rotation ?? 0; // turned about the view's center (the two-finger twist's rotation)
    v.cx += (frame?.dx ?? 0) * v.halfHeight;
    v.cy += (frame?.dy ?? 0) * v.halfHeight;
    // (the app's own hook for a repeatable chaos game)
    ifsRandom = window.__seeded(seed);
    fernView.startReplay({ ...fernRenderOpts(), manual: true, speed: () => 1, onChange: syncReplayButtons });
    // (view, rgb and fixed let a layout draw over the picture where the app does: the canvas pixel of a
    // world point is  x = cw/2 + ((wx - cx) cos r + (wy - cy) sin r) k,  y = ch/2 - (-(wx - cx) sin r + (wy - cy) cos r) k
    // with r = -rotation and k = (ch/2)/halfHeight;  fixed = each map's fixed point)
    const tr = IFS_SYSTEMS[shape].transforms;
    return {
      cw: els.fernCanvas.width, ch: els.fernCanvas.height, total: fernView.replayState.total, probs: tr.map((t) => t.p),
      view: { cx: v.cx, cy: v.cy, halfHeight: v.halfHeight, rotation: v.rotation },
      rgb: ifsTransformColors(shape, vectorColors[shape]).map((c) => c.map((q) => Math.round(q))),
      fixed: tr.map((t) => { // the point p = A p + (e, f) solves (I - A) p = (e, f)
        const det = (1 - t.a) * (1 - t.d) - t.b * t.c;
        return Math.abs(det) > 1e-9 ? [((1 - t.d) * t.e + t.b * t.f) / det, (t.c * t.e + (1 - t.a) * t.f) / det] : null;
      }),
    };
  }, { shape: sc.shape, color: sc.color, count: sc.count, seed: sc.seed, frame: sc.frame });
  return info;
}

// The events of a scene: when each of the first jumps lands (video seconds in the scene) and the transform it used.
async function sceneEvents(page, sc, info, prof) {
  const ts = await page.evaluate((total) => Array.from({ length: 100 }, (_, i) => replayTimeOf(i + 1, total)), info.total);
  await page.evaluate(() => { const s = fernView.replayState; fernView.replayStep(Math.max(0, replayTimeOf(100.5, s.total) - s.t)); });
  const seq = await page.evaluate(() => fernView.replayState.seq);
  const marks = {};
  for (const n of [1000, 10000, 100000, 500000]) if (n < info.total) marks[n] = prof.Sinv(await page.evaluate(([n, total]) => replayTimeOf(n, total), [n, info.total]));
  return {
    start: { x: seq[0].x, y: seq[0].y },
    events: ts.map((s, i) => ({ n: i + 1, t: prof.Sinv(s), ci: seq[i + 1].ci, x: seq[i + 1].x, y: seq[i + 1].y })), // (world coordinates where jump n landed)
    marks,
    doneAt: prof.Sinv(await page.evaluate((total) => replayTimeOf(total, total), info.total)),
  };
}

const grab = async (page, file) => {
  const d = await page.evaluate(() => els.fernCanvas.toDataURL("image/png"));
  writeFileSync(file, Buffer.from(d.split(",")[1], "base64"));
};

async function captureScenes() {
  const t00 = Date.now();
  for (const [id, sc] of Object.entries(R.scenes)) {
    if (sceneFilter.length && !sceneFilter.includes(id)) continue;
    const dir = join(scenesDir, id);
    mkdirSync(dir, { recursive: true });
    const { page, errors, close } = await openApp({ width: sc.size[0], height: sc.size[1], dsf: sc.dsf ?? 1 });
    try {
      await page.waitForFunction(() => typeof setMode === "function" && typeof fernView !== "undefined");
      const prof = speedProfile(sc.speed);
      let info = await startScene(page, sc);
      const ev = await sceneEvents(page, sc, info, prof);
      info = await startScene(page, sc); // again from the start, for the frames
      const nFrames = Math.ceil(ev.doneAt * FPS) + 1; // frames 0 .. nFrames - 1 are the replay; the next one is the settled picture
      const t0 = Date.now();
      let written = 0;
      const nAt = [];
      let replayFrames = nFrames;
      for (let i = 0; i < nFrames && !dry; i++) {
        const file = join(dir, `${pad(i)}.png`);
        const dt = prof.S(i / FPS) - prof.S((i - 1) / FPS);
        if (i > 0) await page.evaluate((dt) => fernView.replayStep(dt), dt);
        const nNow = await page.evaluate(() => (fernView.replaying ? fernView.replayState.n : -1));
        if (nNow < 0) { replayFrames = i; break; } // the replay handed over to the normal render: frames 0 .. i - 1 are the replay
        nAt[i] = nNow; // jumps landed at this frame: checks the events' times against the frames
        if (resume && existsSync(file)) continue;
        await grab(page, file);
        written++;
        if (written % 60 === 0) console.log(`${id}: frame ${i + 1}/${nFrames}  ${((Date.now() - t0) / written).toFixed(0)} ms/frame`);
      }
      let last = nFrames; // the settled picture (the normal render took over): the scene's last frame
      if (!dry) {
        await page.evaluate(() => { for (let k = 0; fernView.replaying && k < 400; k++) fernView.replayStep(0.25); });
        await page.waitForFunction((count) => !fernView.replaying && !fernView.refining && fernView.accepted >= count, sc.count, { timeout: 120_000 });
        await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
        last = replayFrames;
        await grab(page, join(dir, `${pad(last)}.png`));
        // frames left over from an earlier, longer run must not stay behind the settled picture
        for (const f of readdirSync(dir)) if (/^\d+\.png$/.test(f) && Number(f.slice(0, 5)) > last) unlinkSync(join(dir, f));
      }
      const m = { id, shape: sc.shape, color: sc.color, count: sc.count, total: info.total, seed: sc.seed, canvas: [info.cw, info.ch], probs: info.probs, view: info.view, rgb: info.rgb, fixed: info.fixed, fps: FPS, frames: last + 1, ...ev, nAt };
      writeFileSync(metaFile(id), JSON.stringify(m, null, 1));
      console.log(`${id}: ${dry ? "meta" : `${written} frames written, ${last + 1} in all`}, canvas ${info.cw}x${info.ch}, replay done at ${ev.doneAt.toFixed(2)} s, ${((Date.now() - t00) / 1000).toFixed(0)} s so far`);
      if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
    } finally {
      await close();
    }
  }
}

// ---------------------------------------------------------------- capture renderer: compose

// The compositor lives in a page served by the repo's static server (so the scene PNGs are not
// cross-origin): it draws the layers of one output frame on a canvas and hands back a JPEG.
const COMPOSE_FN = `(() => {
  const cache = new Map();
  const load = (url) => {
    if (!cache.has(url)) {
      if (cache.size > 24) cache.delete(cache.keys().next().value);
      cache.set(url, new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("no image " + url)); im.src = url; }));
    }
    return cache.get(url);
  };
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  const feathered = (im, w, h, f) => {
    const o = document.createElement("canvas"); o.width = w; o.height = h;
    const c = o.getContext("2d");
    c.drawImage(im, 0, 0, w, h);
    c.globalCompositeOperation = "destination-in";
    for (const horizontal of [true, false]) {
      const len = horizontal ? w : h, g = horizontal ? c.createLinearGradient(0, 0, w, 0) : c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(Math.min(0.5, f / len), "rgba(0,0,0,1)");
      g.addColorStop(Math.max(0.5, 1 - f / len), "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    return o;
  };
  window.__compose = async (spec) => {
    const { W, H, layers, quality, png } = spec;
    cv.width = W; cv.height = H;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    for (const L of layers) {
      const a = L.alpha ?? 1;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.filter = L.filter || "none";
      if (L.backdrop) {
        const g = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, Math.hypot(W, H) * 0.55);
        g.addColorStop(0, "rgb(16,23,34)"); g.addColorStop(1, "rgb(2,3,6)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      } else if (L.fill) {
        ctx.fillStyle = L.fill; ctx.fillRect(0, 0, W, H);
      } else if (L.url) {
        const im = await load(L.url);
        const w = L.w, h = L.h;
        ctx.filter = L.filter || "none"; // e.g. "brightness(1.2) saturate(1.1)"
        if (L.add) {
          // add only the light the scene draws over its own empty backdrop (so tiles on a shared
          // backdrop show no box): scene minus its backdrop, added with "lighter"
          const o = document.createElement("canvas"); o.width = Math.round(w); o.height = Math.round(h);
          const c = o.getContext("2d");
          c.imageSmoothingQuality = "high";
          c.drawImage(im, 0, 0, o.width, o.height);
          c.globalCompositeOperation = "difference";
          const g = c.createRadialGradient(o.width / 2, o.height * 0.46, 0, o.width / 2, o.height * 0.46, Math.hypot(o.width, o.height) * 0.55);
          g.addColorStop(0, "rgb(16,23,34)"); g.addColorStop(1, "rgb(2,3,6)");
          c.fillStyle = g; c.fillRect(0, 0, o.width, o.height);
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(o, L.x, L.y);
          ctx.globalCompositeOperation = "source-over";
        } else if (L.feather) ctx.drawImage(feathered(im, Math.round(w), Math.round(h), L.feather), L.x, L.y, w, h);
        else ctx.drawImage(im, L.x, L.y, w, h);
        ctx.filter = "none";
      } else if (L.circle) {
        // a ring and/or a disc, e.g. the app's corner rings redrawn where a scene does not have them
        ctx.globalCompositeOperation = L.add ? "lighter" : "source-over";
        ctx.beginPath(); ctx.arc(L.x, L.y, L.r, 0, 2 * Math.PI);
        if (L.fillColor) { ctx.fillStyle = L.fillColor; ctx.fill(); }
        if (L.stroke) { ctx.strokeStyle = L.stroke; ctx.lineWidth = L.lw ?? 2; ctx.stroke(); }
        ctx.globalCompositeOperation = "source-over";
      } else if (L.text) {
        ctx.font = (L.font || 'italic 400 SIZEpx ui-serif, "New York", Georgia, serif').replace("SIZE", L.size);
        ctx.textAlign = L.align || "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = L.color || "#fff";
        ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = L.size * 0.3; ctx.shadowOffsetY = L.size * 0.04;
        const lines = L.text.split("\\n");
        lines.forEach((line, k) => ctx.fillText(line, L.x, L.y + (k - (lines.length - 1) / 2) * L.size * 1.18));
        ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
    return png ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", quality ?? 0.95);
  };
})()`;

async function composeFrames() {
  mkdirSync(framesDir, { recursive: true });
  const { page, errors, close } = await openApp({ width: 400, height: 300, url: "icons/icon-512.png" });
  const t0 = Date.now();
  let done = 0;
  try {
    await page.evaluate(COMPOSE_FN);
    for (let i = 0; i < Math.min(N, Math.round(until * FPS)); i++) {
      if (only.length ? !only.includes(i) : i % stride && i !== N - 1) continue;
      const file = join(framesDir, `${pad(i)}.jpg`);
      if (resume && existsSync(file)) continue;
      const layers = layout.frame(i, i / FPS).map((L) => {
        if (!L.scene) return L;
        const m = meta[L.scene];
        return { ...L, url: `/store-assets/short/${name}/scenes/${L.scene}/${pad(Math.max(0, Math.min(m.frames - 1, L.frame)))}.png` };
      });
      const d = await page.evaluate((spec) => window.__compose(spec), { W: OW, H: OH, layers, quality: 0.95 });
      writeFileSync(file, Buffer.from(d.split(",")[1], "base64"));
      done++;
      if (done % 120 === 0) console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  composed ${done} frames (at ${i + 1}/${N})`);
    }
    if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
  } finally {
    await close();
  }
  console.log(`${done} frames composed in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${framesDir}`);
}

// ---------------------------------------------------------------- facts

async function printFacts() {
  if (isCapture) {
    const { page, close } = await openApp({ width: 540, height: 960, dsf: 2 });
    try {
      await page.waitForFunction(() => typeof setMode === "function" && typeof fernView !== "undefined");
      console.log(JSON.stringify(await R.facts({ page, meta, layout }), null, 1));
    } finally {
      await close();
    }
    return;
  }
  const { page, close } = await startPage(W, H, passes);
  try {
    console.log(JSON.stringify(await R.facts({ page, path, N, W, H, FPS }), null, 1));
  } finally {
    await close();
  }
}

// ---------------------------------------------------------------- audio

// Everything is built from ffmpeg's own generators (no audio files, no downloads); the recipe's
// `audio` says what: see the header. This turns it into one ffmpeg command: a stereo master
// of audio.seconds that the cuts trim and fade.
function audioConfig() {
  const cfg = typeof recipe.audio === "function" ? recipe.audio({ layout, meta, seconds: picSeconds }) : recipe.audio;
  // --layers drone,plucks: only these layer types (a stem, for balancing the mix)
  return layerTypes.length ? { ...cfg, layers: cfg.layers.filter((l) => layerTypes.includes(l.type)) } : cfg;
}

function synthArgs(cfg, wavFile) {
  const SR = 44100, M = cfg.seconds;
  const inputs = [], parts = [], mixIn = [];
  const addInput = (src) => { inputs.push("-f", "lavfi", "-i", src); return inputs.length / 4 - 1; };
  const addVoice = (expr, d, extra = "") => addInput(`aevalsrc=exprs='${expr}':s=${SR}:d=${d}${extra}`);
  for (const [li, L] of cfg.layers.entries()) {
    if (L.type === "drone") {
      // each note a pair of slightly detuned sines, left and right a hair apart, with its own
      // slow tremolo and a slow phase drift
      const chan = (side) => L.notes.map(([hz, a], i) => {
        const det = (side ? 1 : -1) * (L.detune[0] + L.detune[1] * i); // Hz, slowly beating against the other channel
        const trem = (L.tremolo[0] + L.tremolo[1] * i).toFixed(4);
        const drift = (L.drift[0] + L.drift[1] * i).toFixed(2);
        return `${a}*(0.75+0.25*sin(2*PI*${trem}*t+${i}))*sin(2*PI*${(hz + det).toFixed(3)}*t+${drift}*sin(2*PI*${(L.drift[2] + L.drift[3] * i).toFixed(4)}*t))`;
      }).join("+");
      const i0 = addVoice(`${chan(0)}|${chan(1)}`, M);
      const i1 = addInput(`anoisesrc=color=pink:amplitude=0.5:sample_rate=${SR}:duration=${M}`);
      parts.push(`[${i1}:a]${L.noise},aformat=channel_layouts=stereo[n${li}]`);
      parts.push(`[${i0}:a][n${li}]amix=inputs=2:normalize=0,${L.post},volume='${L.swell}':eval=frame[d${li}]`);
      mixIn.push(`[d${li}]`);
    } else if (L.type === "bell") {
      // an exponentially decaying sine with inharmonic partials, struck at each strike's time
      const bell = (f) => L.partials.map(([r, a, tau]) => `${((L.level ?? 0.9) * a).toFixed(3)}*sin(2*PI*${(f * r).toFixed(2)}*t)*exp(-t/${tau})`).join("+");
      const att = L.attack ?? 0.003;
      const labels = L.strikes.map((s, k) => {
        const d = Math.min(M - s.at, L.length ?? Infinity);
        const idx = addVoice(`(1-exp(-t/${att}))*(${bell(s.freq)})|(1-exp(-t/${att}))*(${bell(s.freq * (s.detune ?? 1.002))})`, d);
        const delay = s.at > 0 ? `adelay=${Math.round(s.at * SR)}S|${Math.round(s.at * SR)}S,` : "";
        parts.push(`[${idx}:a]${delay}aformat=channel_layouts=stereo,volume=${(s.gain ?? 1) * L.gain}[b${li}_${k}]`);
        return `[b${li}_${k}]`;
      });
      if (labels.length === 1) mixIn.push(labels[0]);
      else { parts.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0[b${li}]`); mixIn.push(`[b${li}]`); }
    } else if (L.type === "plucks") {
      // one decaying tone per distinct pitch, copied to every event of that pitch: placed to the
      // sample (adelay), panned, scaled; mixed in batches of 32
      const hzs = [...new Set(L.events.map((e) => e.hz))];
      const v = L.voice, att = v.attack ?? 0.003;
      const tone = (f) => `(1-exp(-t/${att}))*(${v.partials.map(([r, a, tau]) => `${a}*sin(2*PI*${(f * r).toFixed(2)}*t)*exp(-t/${tau})`).join("+")})`;
      const evOut = [];
      for (const [hi, hz] of hzs.entries()) {
        const evs = L.events.filter((e) => e.hz === hz);
        const idx = addVoice(tone(hz), v.length);
        parts.push(`[${idx}:a]asplit=${evs.length}${evs.map((_, k) => `[p${li}_${hi}_${k}]`).join("")}`);
        evs.forEach((e, k) => {
          const s = Math.round(e.t * SR), pan = e.pan ?? 0;
          const gl = Math.cos((pan + 1) * Math.PI / 4).toFixed(4), gr = Math.sin((pan + 1) * Math.PI / 4).toFixed(4);
          parts.push(`[p${li}_${hi}_${k}]adelay=${s}S,volume=${(e.gain ?? 1).toFixed(4)},pan=stereo|c0=${gl}*c0|c1=${gr}*c0[e${li}_${hi}_${k}]`);
          evOut.push(`[e${li}_${hi}_${k}]`);
        });
      }
      const batches = [];
      for (let b = 0; b * 32 < evOut.length; b++) {
        const group = evOut.slice(b * 32, b * 32 + 32);
        parts.push(`${group.join("")}amix=inputs=${group.length}:normalize=0:duration=longest[pb${li}_${b}]`);
        batches.push(`[pb${li}_${b}]`);
      }
      parts.push(`${batches.join("")}amix=inputs=${batches.length}:normalize=0,${L.echo ? `${L.echo},` : ""}volume=${L.gain}[pl${li}]`);
      mixIn.push(`[pl${li}]`);
    } else if (L.type === "shimmer") {
      const bl = L.bands.map((b, k) => {
        const idx = addInput(`anoisesrc=color=white:amplitude=0.5:sample_rate=${SR}:duration=${M}:seed=${(L.seed ?? 1) + k}`);
        parts.push(`[${idx}:a]highpass=f=${b.hp},lowpass=f=${b.lp},volume='${b.env}':eval=frame,aformat=channel_layouts=stereo[s${li}_${k}]`);
        return `[s${li}_${k}]`;
      });
      parts.push(`${bl.join("")}amix=inputs=${bl.length}:normalize=0,volume=${L.gain}[sh${li}]`);
      mixIn.push(`[sh${li}]`);
    } else throw new Error(`unknown audio layer type ${L.type}`);
  }
  parts.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:normalize=0,aformat=channel_layouts=stereo[m]`);
  return ["-v", "error", "-y", ...inputs, "-filter_complex", parts.join(";"), "-map", "[m]", "-c:a", "pcm_f32le", wavFile];
}

// Integrated loudness (LUFS) and true peak (dBTP) of an audio or video file.
function loudness(file, filter = "") {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${filter}${filter ? "," : ""}ebur128=peak=true`, "-f", "null", "-"], { encoding: "utf8" });
  const text = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const I = Number(/I:\s+(-?[\d.]+)\s+LUFS/.exec(text)?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+)\s+dBFS/.exec(text)?.[1]);
  return { I, TP };
}

// The bed for one cut: trimmed to `length`, faded out over the last FADE_OUT s, and
// gained to the target loudness integrated (measured on the faded bed itself).
function bedFor(cfg, master, length, outM4a, outWav, fadeLen = FADE_OUT) {
  const target = cfg.targetLufs ?? -15, lim = cfg.limiter ?? 0.7;
  const fade = `${fadeLen > 0 ? `afade=t=out:st=${(length - fadeLen).toFixed(2)}:d=${fadeLen},` : ""}atrim=0:${length.toFixed(2)}`;
  const first = loudness(master, `atrim=0:${length},${fade}`);
  const gain = target - first.I;
  const chain = `atrim=0:${length.toFixed(2)},volume=${gain.toFixed(2)}dB,alimiter=limit=${lim}:level=disabled,${fade}`;
  spawnSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-af", chain, "-c:a", "pcm_f32le", outWav]);
  const second = loudness(outWav);
  const fine = second.I - target; // alimiter may have taken a little off
  if (Math.abs(fine) > 0.2) {
    const chain2 = `atrim=0:${length.toFixed(2)},volume=${(gain - fine).toFixed(2)}dB,alimiter=limit=${lim}:level=disabled,${fade}`;
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-af", chain2, "-c:a", "pcm_f32le", outWav]);
  }
  const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", outWav, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outM4a], { stdio: "inherit" });
  if (enc.status !== 0) throw new Error("ffmpeg (bed encode) failed");
  return loudness(outM4a);
}

function buildAudio() {
  const cfg = audioConfig();
  mkdirSync(workDir, { recursive: true });
  const master = join(workDir, "bed-master.wav");
  const ffArgs = synthArgs(cfg, master);
  if (printOnly) { console.log(ffArgs.join("\n")); return; }
  const r = spawnSync("ffmpeg", ffArgs, { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg (bed synthesis) failed");
  mkdirSync(outDir, { recursive: true });
  const pureLen = picSeconds, cardLen = picSeconds + CARD_HOLD;
  // A looping Short (recipe.loopAudio = crossfade seconds): the bed's last `x` seconds are the master's
  // continuation past the end faded in over its first `x`, so the end runs straight into the start.
  let pureMaster = master;
  if (recipe.loopAudio) {
    const x = recipe.loopAudio;
    pureMaster = join(workDir, "bed-master-loop.wav");
    const g = `[0:a]asplit=3[a][b][c];[a]atrim=0:${x},asetpts=PTS-STARTPTS,afade=t=in:d=${x}[h];` +
      `[b]atrim=${pureLen}:${pureLen + x},asetpts=PTS-STARTPTS,afade=t=out:d=${x}[t];[h][t]amix=inputs=2:normalize=0:duration=longest[x1];` +
      `[c]atrim=${x}:${pureLen},asetpts=PTS-STARTPTS[r];[x1][r]concat=n=2:v=0:a=1[o]`;
    const lr = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-filter_complex", g, "-map", "[o]", "-c:a", "pcm_f32le", pureMaster], { stdio: "inherit" });
    if (lr.status !== 0) throw new Error("ffmpeg (loop fold) failed");
  }
  const a = bedFor(cfg, pureMaster, pureLen, join(outDir, `${recipe.stem}-bed.m4a`), join(workDir, "bed-pure.wav"), recipe.loopAudio ? 0 : FADE_OUT);
  console.log(`${recipe.stem}-bed.m4a  ${pureLen} s  integrated ${a.I} LUFS  true peak ${a.TP} dBTP`);
  const b = bedFor(cfg, master, cardLen, join(workDir, "bed-endcard.m4a"), join(workDir, "bed-endcard.wav"), recipe.loopAudio ? CARD_HOLD : FADE_OUT);
  console.log(`bed for the end-card cut  ${cardLen} s  integrated ${b.I} LUFS  true peak ${b.TP} dBTP`);
}

// audiocheck <file>: levels in a few windows (the start, the middle, the fade-out), the loudness
// summary, and for pluck events the level just after each of the first events against just before.
function audioCheck(file) {
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout);
  const level = (a, b) => {
    const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(a), "-to", String(b), "-i", file, "-af", "astats=measure_overall=RMS_level+Peak_level", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const ov = err.slice(err.indexOf("Overall"));
    return { rms: /RMS level dB:\s+(-?[\d.inf]+)/.exec(ov)?.[1], peak: /Peak level dB:\s+(-?[\d.inf]+)/.exec(ov)?.[1] };
  };
  const windows = [[0, 0.05], [0.05, 0.15], [0.5, 0.6], [2, 2.1], [4, 4.1], [10, 10.1], [30, 30.1], [dur - 3, dur - 2.9], [dur - 2, dur - 1.9], [dur - 1, dur - 0.9], [dur - 0.1, dur]];
  console.log(`${file}  ${dur.toFixed(2)} s`);
  for (const [a, b] of windows) {
    const l = level(a, b);
    console.log(`  ${a.toFixed(2)}-${b.toFixed(2)} s: RMS ${l.rms} dB, peak ${l.peak} dB`);
  }
  const plucks = isCapture ? audioConfig().layers.find((l) => l.type === "plucks") : null;
  if (plucks) {
    console.log("  pluck onsets (peak in the 40 ms after the event vs the 60 ms before it, dB):");
    for (const e of plucks.events.slice(0, 14)) {
      const after = level(e.t, e.t + 0.04), before = level(Math.max(0, e.t - 0.1), Math.max(0.001, e.t - 0.04));
      console.log(`    t ${e.t.toFixed(3)}  ${e.hz.toFixed(1)} Hz  after ${after.peak}  before ${before.peak}`);
    }
  }
  if (isCapture) {
    // the events' times against the captured frames: the first frame at which n jumps have landed
    // must be the first frame at or after the event's time
    for (const [id, m] of Object.entries(meta)) {
      if (!m.nAt?.length) continue;
      let bad = 0, checked = 0, worst = 0;
      for (const e of m.events) {
        const i = m.nAt.findIndex((n) => n >= e.n);
        if (i < 0) continue;
        checked++;
        const want = Math.ceil(e.t * m.fps - 1e-9);
        if (i !== want) bad++;
        worst = Math.max(worst, Math.abs(i / m.fps - e.t));
      }
      console.log(`  events vs frames, ${id}: ${checked} checked, ${bad} off, the landing is at most ${(worst * 1000).toFixed(1)} ms before its frame`);
    }
  }
  console.log(`  loudness ${JSON.stringify(loudness(file))}`);
}

// ---------------------------------------------------------------- cuts

// The end card: the app icon, "Fractal Atlas", "Free for iPhone and iPad" on
// black (the wording of make-dive.mjs's card), sized for a portrait frame.
async function renderCard(file) {
  const { page, errors, close } = await openApp({ width: OW, height: OH, passCount: 8 });
  try {
    await page.evaluate(`(async () => {
      const h = Math.min(innerWidth, innerHeight);
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;gap:" + Math.round(h * 0.04) + "px;color:#fff;font-family:-apple-system,system-ui,sans-serif;text-align:center;";
      el.innerHTML = '<img src="icons/icon-512.png" style="width:' + Math.round(h * 0.34) + 'px;border-radius:22%">' +
        '<div style="font-weight:700;font-size:' + Math.round(h * 0.105) + 'px">Fractal Atlas</div>' +
        '<div style="font-size:' + Math.round(h * 0.048) + 'px;opacity:.8">Free for iPhone and iPad</div>';
      document.body.appendChild(el);
      await el.querySelector("img").decode().catch(() => {});
    })()`);
    await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    await page.screenshot({ path: file, type: "png" });
    if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
  } finally {
    await close();
  }
}

// JPEG frames are full-range BT.601; the video is limited-range BT.709, scaled to the output size.
const TO_VIDEO = `scale=${OW}:${OH}:flags=lanczos:in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv`;
const X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2", "-g", "60",
  "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", String(FPS)];

function ff(argv) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...argv], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}

async function buildCuts() {
  if (stride > 1) throw new Error("the cuts need every frame: run `frames` without --stride");
  mkdirSync(outDir, { recursive: true });
  const input = ["-framerate", String(FPS), "-i", join(framesDir, "%05d.jpg")];
  const pureBed = join(workDir, "bed-pure.wav"), cardBed = join(workDir, "bed-endcard.wav");
  if (!existsSync(pureBed) || !existsSync(cardBed)) throw new Error("run `audio` first");
  const tail = ["-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];
  const pure = join(outDir, `${recipe.stem}-pure.mp4`);
  ff([...input, "-i", pureBed, "-vf", `${TO_VIDEO}${FADE_OUT > 0 ? `,fade=t=out:st=${picSeconds - FADE_OUT}:d=${FADE_OUT}` : ""}`, ...X264, ...tail, "-shortest", pure]);

  const card = join(workDir, "card.png");
  await renderCard(card);
  const endcard = join(outDir, `${recipe.stem}-endcard.mp4`);
  const total = picSeconds + CARD_HOLD;
  ff([...input, "-loop", "1", "-framerate", String(FPS), "-t", String(total), "-i", card, "-i", cardBed,
    "-filter_complex",
    `[0:v]${TO_VIDEO},tpad=stop_mode=clone:stop_duration=${CARD_HOLD}[p];` +
    `[1:v]scale=${OW}:${OH},format=yuva420p,fade=t=in:st=${picSeconds - CARD_FADE}:d=${CARD_FADE}:alpha=1[c];` +
    `[p][c]overlay=shortest=0:format=auto,format=yuv420p[v]`,
    "-map", "[v]", "-map", "2:a", ...X264, ...tail, "-t", String(total), endcard]);

  // The thumbnail: a frame of the picture (Shorts take the video's own frame).
  const idx = Math.min(N - 1, Math.round(thumbAt * FPS));
  ff(["-i", join(framesDir, `${pad(idx)}.jpg`), "-vf", `scale=${OW}:${OH}:flags=lanczos`, "-frames:v", "1", join(outDir, "thumbnail.png")]);

  // QA: container facts, loudness, and per-frame luminance and frame-difference (flashes, strobing).
  for (const f of [pure, endcard]) {
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate,pix_fmt,duration,bit_rate:format=duration", "-of", "compact", f], { encoding: "utf8" }).stdout.trim();
    console.log(`\n${f}\n${probe}`);
    console.log(`loudness: ${JSON.stringify(loudness(f))}`);
    const sig = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout;
    const y = [...sig.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    const jumps = y.slice(1).map((v, i) => Math.abs(v - y[i]));
    const worst = jumps.indexOf(Math.max(...jumps));
    console.log(`mean luma per frame: ${y.length} frames, min ${Math.min(...y).toFixed(1)}, max ${Math.max(...y).toFixed(1)}; largest frame-to-frame jump ${Math.max(...jumps).toFixed(2)} (frames ${worst}-${worst + 1}, ${(worst / FPS).toFixed(2)} s)`);
    const dif = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", f, "-vf", "tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-", "-an", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout;
    const d = [...dif.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1])).slice(1);
    const sorted = [...d].sort((a, b) => a - b);
    console.log(`mean absolute change between frames: median ${sorted[Math.floor(d.length / 2)].toFixed(2)}, 99th pct ${sorted[Math.floor(d.length * 0.99)].toFixed(2)}, max ${Math.max(...d).toFixed(2)} (at ${(d.indexOf(Math.max(...d)) / FPS).toFixed(2)} s)`);
  }
}

// ---------------------------------------------------------------- post

async function writePost() {
  const dest = join(outDir, "post.md");
  if (existsSync(dest) && !force) throw new Error(`${dest} exists (--force replaces it)`);
  const p = typeof recipe.post === "function" ? recipe.post({ layout, meta, seconds: picSeconds }) : recipe.post;
  const text = `# ${recipe.title}: post draft

${p.notes}

## Title options (pick one)

${p.titles.map((t, i) => `${i + 1}. ${t}`).join("\n")}
${p.titleNote ? `\n${p.titleNote}\n` : ""}
## Description

${p.description}

${p.hashtags}

(Links are not clickable in Shorts descriptions, so there is none here: put the App Store link in the channel profile.)

## Pinned comment

${p.pinned}

## Posting note

${p.posting.map((b) => `- ${b}`).join("\n")}
`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(dest, text);
  console.log(`wrote ${dest}`);
}

// ---------------------------------------------------------------- main

if (command === "frames" || command === "build") {
  if (isCapture) { await captureScenes(); await composeFrames(); } else await renderDiveFrames();
}
if (command === "scenes" || command === "meta") await captureScenes();
if (command === "compose") await composeFrames();
if (command === "audio" || command === "build") buildAudio();
if (command === "audiocheck") audioCheck(args[0]);
if (command === "facts") await printFacts();
if (command === "post") await writePost();
if (command === "cuts" || command === "build") await buildCuts();
