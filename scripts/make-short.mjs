// "The Infinite": a 58 s vertical YouTube Short (1080x1920, 30 fps) of one
// long steady zoom into the Mandelbrot set, rendered from the app itself.
//
//   node scripts/make-short.mjs <command> [options]
//
// Commands (run them in this order, or `build` for all of it):
//   frames    render the frames in headless WebKit, one at a time (like
//             scripts/make-dive.mjs and scripts/make-preview.mjs: set the
//             camera, wait for the picture to finish refining, save a JPEG)
//   audio     synthesize the sound bed with ffmpeg (no audio files, no downloads)
//   cuts      encode the two cuts, the bed, the thumbnail and a QA report
//   build     frames, then audio, then cuts
//   stills <jobs.json> <outDir>   render single stills (a JSON list of
//             {name, cx, cy, scale, palette, style, density, offset, maxIter})
//             for choosing a target and a palette
//   plan      print the camera path (time, scale, center, color offset) as CSV
//   facts     what the app says about the deepest frame (zoom factor, iterations), for the post
//   audiocheck <file.m4a|mp4>   levels at the start, the swell and the fade-out, and loudness
//   sheet <framesDir> <out.png> [--every N] [--first N] [--cols C] [--cell WxH]
//             a labelled contact sheet of a frames folder (every Nth file, or
//             the first N), downscaled for looking at
//
// Options:
//   --size WxH       render size (default 1080x1920; a smaller size, e.g.
//                    720x1280, is scaled up with lanczos when the cuts are made)
//   --out-size WxH   video size (default 1080x1920)
//   --stride N       render every Nth frame only: a quick look-over, written to
//                    its own frames-strideN folder (not a video)
//   --until SEC      frames: stop after this many seconds (a preview of the start)
//   --resume         skip frames whose file already exists (a render that was
//                    stopped can be continued; nothing else may have changed)
//   --passes N       the app's deep-zoom sharpening passes, 2-16 (default 16:
//                    the app's own deep views stop at 8)
//   --seconds N      length of the picture (default 58)
//   --name NAME      work folder name under store-assets/short/ (default the-infinite)
//   --out-dir DIR    where the deliverables go
//                    (default ~/Movies/fractal-atlas-shorts/the-infinite)
//   --thumb-at SEC   the frame (in seconds) the thumbnail is taken from (default 24)
//
// The picture, beat by beat (what the rival Short does, with our own picture):
//   0.0 s   bright pastel concentric bands around the whole Mandelbrot set,
//           small and centered, already zooming (the Bands look)
//   0.5-3 s the bands dissolve into the Relief look as the set grows to its
//           full silhouette and the cardioid and the period-2 bulb fill the frame
//   3-13 s  the view narrows into the gap between them (near -0.75), rises
//           through it into Seahorse Valley, and settles on Spiral Cluster, the
//           Misiurewicz point M(28,2) at the eye of a spiral (places.js)
//   3.6 s-end  ONE steady dive at a constant zoom rate (equal factor per
//           second in log scale) straight down the spiral's eye, a seamlessly
//           self-similar picture all the way, to the deepest view (about 2e-12,
//           inside the perturbation path's 1e13 limit)
//   color   the Relief look in a pastel cyclic palette (defined below), the
//           Color sheet's `shift` (colorStyle.offset) driven round once per
//           14.5 s, four turns, ending on the color it began with
//   end     the pure cut fades to black over the last 2 s; the end-card cut
//           lets a "Fractal Atlas, free for iPhone and iPad" card in over the
//           last 0.6 s and holds it 1.5 s
//
// Output (git-ignored, regenerable): store-assets/short/<name>/{frames,...};
// deliverables in --out-dir: the-infinite-pure.mp4, the-infinite-endcard.mp4,
// the-infinite-bed.m4a, thumbnail.png (post.md is written by hand).
import { webkit } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PORT = 8751;
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- the design

// The eye of Spiral Cluster (places.js): the Misiurewicz point M(28,2).
const TARGET = { cx: Number("-0.7451580638016195553"), cy: Number("0.1125749162054165212") };
// The view starts on the neck between the main cardioid and the period-2 bulb.
const START = { cx: -0.75, cy: 0 };
// A cyclic pastel palette (purple, pink, beige, green, teal, blue, purple): the
// app's own palettes are darker; the first stop equals the last so the shift
// wraps with no seam. It is added to the page's palette list at run time.
const PASTEL = { name: "Pastel Cycle", stops: [[0, 176, 150, 210], [0.1667, 236, 170, 200], [0.3333, 240, 222, 190], [0.5, 170, 220, 180], [0.6667, 140, 214, 210], [0.8333, 150, 175, 230], [1, 176, 150, 210]] };

const D = {
  scale0: 10,        // half-height at frame 0: the whole set small and centered
  scaleKnot: 3.4, tKnot: 1.5,   // the full silhouette at 1.5 s
  scaleCruise: 0.5, tCruise: 3.6, // the cardioid and bulb fill the frame; from here the zoom rate is constant
  scaleEnd: 2e-12,   // the deepest half-height, at the last frame
  d0: -0.55, dKnot: -1.0, // zoom speeds (d ln scale / dt) at the first two knots
  homeFrom: 2.0, homeTo: 0.02,  // the center slides from the neck to the eye as the scale goes from homeFrom to homeTo
  cyclePeriod: 14.5, // seconds per trip round the palette (4 trips in 58 s)
  reliefDensity: 0.4,  // the Color sheet's Repeat, in the Relief look
  bandsOut: [0.5, 2.4], // seconds: the Bands layer's dissolve into Relief
  bandsDensity0: 8, bandsDensity1: 1, // Repeat of the Bands layer at scale0 and at scaleCruise
};
const FADE_OUT = 2.0, CARD_FADE = 0.6, CARD_HOLD = 1.5;

const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const hermite = (p0, p1, m0, m1, h, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1;
};

function makePath(seconds) {
  const L0 = Math.log(D.scale0), LK = Math.log(D.scaleKnot), LC = Math.log(D.scaleCruise), LE = Math.log(D.scaleEnd);
  const v = (LC - LE) / (seconds - D.tCruise); // the cruise's zoom rate, e-folds per second
  const logScale = (t) => {
    if (t >= D.tCruise) return LC - v * (t - D.tCruise);
    if (t >= D.tKnot) return hermite(LK, LC, D.dKnot, -v, D.tCruise - D.tKnot, (t - D.tKnot) / (D.tCruise - D.tKnot));
    return hermite(L0, LK, D.d0, D.dKnot, D.tKnot, t / D.tKnot);
  };
  return (t) => {
    const L = logScale(t);
    const scale = Math.exp(L);
    // The center slides from the neck to the eye, smoothly, as the zoom closes in.
    const p = smooth((Math.log(D.homeFrom) - L) / (Math.log(D.homeFrom) - Math.log(D.homeTo)));
    const wb = 1 - smooth((t - D.bandsOut[0]) / (D.bandsOut[1] - D.bandsOut[0]));
    const bandsDensity = Math.exp(Math.log(D.bandsDensity1) + (Math.log(D.bandsDensity0) - Math.log(D.bandsDensity1)) * Math.min(1, Math.max(0, (L - LC) / (L0 - LC))));
    return {
      t, scale, rate: v,
      cx: START.cx + (TARGET.cx - START.cx) * p,
      cy: START.cy + (TARGET.cy - START.cy) * p,
      offset: ((t / D.cyclePeriod) % 1 + 1) % 1,
      bandsWeight: wb, bandsDensity,
    };
  };
}

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
const resume = flag("resume");
const stride = Number(take("stride", 1));
const passes = Number(take("passes", 16));
const seconds = Number(take("seconds", 58));
const name = take("name", "the-infinite");
const outDir = take("out-dir", join(homedir(), "Movies/fractal-atlas-shorts/the-infinite"));
const thumbAt = Number(take("thumb-at", 24));
const [W, H] = take("size", "1080x1920").split("x").map(Number);
const [OW, OH] = take("out-size", "1080x1920").split("x").map(Number);
const until = Number(take("until", Infinity)); // frames: stop after this many seconds (a preview of the start)
const every = Number(take("every", 1));
const first = Number(take("first", 0));
const cols = Number(take("cols", 8));
const cell = take("cell", "180x320");
const usage = () => {
  console.error("usage: node scripts/make-short.mjs <frames|audio|cuts|build|stills|plan|sheet> [options]  (see the header of this file)");
  process.exit(1);
};
if (!["frames", "audio", "audiocheck", "facts", "cuts", "build", "stills", "plan", "sheet"].includes(command) || ![every, first, cols].every(Number.isFinite) || ![stride, passes, seconds, thumbAt, W, H, OW, OH].every(Number.isFinite)
  || stride < 1 || passes < 2 || passes > 16 || W % 2 || H % 2 || OW % 2 || OH % 2) usage();

const workDir = join(root, "store-assets/short", name);
const framesDir = join(workDir, stride > 1 ? `frames-stride${stride}` : "frames");
const N = Math.round(seconds * FPS);
const path = makePath(seconds);
const pad = (i) => String(i).padStart(5, "0");

// ---------------------------------------------------------------- plan

if (command === "plan") {
  console.log("frame,t,scale,log_scale,cx,cy,offset,bands_weight,bands_density");
  for (let i = 0; i < N; i += stride) {
    const s = path(i / FPS);
    console.log([i, s.t.toFixed(3), s.scale.toExponential(4), Math.log(s.scale).toFixed(5), s.cx.toFixed(12), s.cy.toFixed(12), s.offset.toFixed(4), s.bandsWeight.toFixed(3), s.bandsDensity.toFixed(2)].join(","));
  }
  process.exit(0);
}

if (command === "sheet") {
  const [dir, out] = args;
  if (!dir || !out) usage();
  let files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
  files = first ? files.slice(0, first) : files.filter((_, i) => i % every === 0);
  const labelled = files.flatMap((f) => ["-label", `${Number(f.slice(0, 5))}  ${(Number(f.slice(0, 5)) / FPS).toFixed(1)}s`, join(dir, f)]);
  const r = spawnSync("magick", ["montage", ...labelled, "-tile", `${cols}x`, "-geometry", `${cell}+3+3`, "-background", "#222", "-fill", "#ccc", "-font", "/System/Library/Fonts/Helvetica.ttc", "-pointsize", "14", out], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("magick montage failed");
  console.log(`${files.length} frames -> ${out}`);
  process.exit(0);
}

// ---------------------------------------------------------------- the app in a page

async function startPage(width, height, passCount) {
  const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; ; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) break;
    if (i > 50) { server.kill(); throw new Error(`the static server didn't start on port ${PORT}`); }
    await sleep(100);
  }
  const browser = await webkit.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.addInitScript((p) => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.setItem("fractalAtlas.deepPasses", String(p)); // video frames get every sharpening pass
    } catch { /* storage blocked */ }
  }, passCount);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.addScriptTag({ path: join(root, "tests/driver.js") });
  // Just the picture: no toolbar, compass, speed bubble, crosshair, info overlay or welcome card.
  await page.addStyleTag({ content: "#controls, #speedBubble, .compass, #crosshair, #welcome, #hud { display: none !important; } *, *::before, *::after { transition: none !important; animation: none !important; }" });
  await page.evaluate("__vt.fractal('Mandelbrot'); window.dispatchEvent(new Event('resize'))");
  // The pastel palette joins the page's list (the app is not changed), then is picked as a user pick.
  await page.evaluate(`(() => { COLORMAPS.push(${JSON.stringify(PASTEL)}); pickColormap(COLORMAPS.length - 1); })()`);
  const close = async () => { await browser.close(); server.kill(); };
  return { page, errors, close };
}

// Sets the camera and the color style; a frame is finished when the app says
// it has settled (every sharpening pass blended in). If one never does, nudge
// the render and wait again, then shoot it anyway and say so.
async function setFrame(page, v, label) {
  await page.evaluate(`(() => {
    const v = ${JSON.stringify(v)};
    setColorStyle({ style: v.style, density: v.density, offset: v.offset });
    Object.assign(mainState, { cx: v.cx, cy: v.cy, scale: v.scale, rotation: 0 });
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

// ---------------------------------------------------------------- stills

if (command === "stills") {
  const [jobsFile, stillsDir] = args;
  if (!jobsFile || !stillsDir) usage();
  mkdirSync(stillsDir, { recursive: true });
  const { page, errors, close } = await startPage(W === 1080 && H === 1920 ? 540 : W, W === 1080 && H === 1920 ? 960 : H, passes);
  try {
    for (const j of JSON.parse(readFileSync(jobsFile, "utf8"))) {
      const t0 = Date.now();
      if (j.palette && j.palette !== PASTEL.name) await page.evaluate(`pickColormap(Math.max(0, COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(j.palette)})))`);
      else await page.evaluate(`pickColormap(COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(PASTEL.name)}))`);
      await setFrame(page, { cx: Number(j.cx), cy: Number(j.cy), scale: j.scale, style: j.style || "relief", density: j.density ?? 1, offset: j.offset ?? 0, maxIter: j.maxIter }, j.name);
      await page.screenshot({ path: join(stillsDir, `${j.name}.png`), type: "png" });
      console.log(`${j.name}  ${Date.now() - t0} ms  maxIter ${await page.evaluate("mainState.maxIter")}`);
    }
    if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
  } finally {
    await close();
  }
  process.exit(0);
}

// ---------------------------------------------------------------- facts

// facts: what the app itself says about the deepest frame (for the post's text).
async function printFacts() {
  const { page, close } = await startPage(W, H, passes);
  try {
    const first = path(0), last = path((N - 1) / FPS);
    const f = await page.evaluate(`(() => {
      const base = mainState.baseScale;
      return {
        baseScale: base, deepThreshold: DEEP_ZOOM_THRESHOLD,
        zoomPhrase: zoomPhrase(base, ${last.scale}),
        autoIter: suggestedMaxIter(base, ${last.scale}),
        firstScale: ${first.scale}, lastScale: ${last.scale},
      };
    })()`);
    console.log(JSON.stringify({
      ...f, size: `${W}x${H}`, aspect: W / H,
      deepestHalfHeight: last.scale, deepestFrameWidthInPlane: 2 * last.scale * W / H,
      zoomVsOpeningFrame: first.scale / last.scale, zoomVsAppOpeningView: f.baseScale / last.scale,
      cruiseEfoldsPerSecond: last.rate, cruiseDoublingSeconds: Math.LN2 / last.rate, cruiseFactorPerSecond: Math.exp(last.rate),
      cruiseDecadesPerSecond: last.rate / Math.LN10,
    }, null, 1));
  } finally {
    await close();
  }
}

// ---------------------------------------------------------------- frames

async function renderFrames() {
  mkdirSync(framesDir, { recursive: true });
  const tmpDir = join(workDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const { page, errors, close } = await startPage(W, H, passes);
  const csv = [];
  const t0 = Date.now();
  let done = 0;
  try {
    for (let i = 0; i < Math.min(N, Math.round(until * FPS)); i++) {
      if (i % stride && i !== N - 1) continue;
      const file = join(framesDir, `${pad(i)}.jpg`);
      if (resume && existsSync(file)) continue;
      const s = path(i / FPS);
      const base = { cx: s.cx, cy: s.cy, scale: s.scale, offset: s.offset };
      const blend = s.bandsWeight > 0.002;
      // The Relief picture; while the Bands layer is still dissolving, a second
      // shot with the Bands look is blended in over it (ImageMagick).
      await setFrame(page, { ...base, style: "relief", density: D.reliefDensity }, `frame ${i}`);
      await page.screenshot({ path: blend ? join(tmpDir, "relief.jpg") : file, type: "jpeg", quality: 95, animations: "disabled", caret: "hide" });
      const it = await page.evaluate("mainState.maxIter");
      if (blend) {
        await setFrame(page, { ...base, style: "bands", density: s.bandsDensity }, `frame ${i} bands`);
        await page.screenshot({ path: join(tmpDir, "bands.jpg"), type: "jpeg", quality: 95, animations: "disabled", caret: "hide" });
        const r = spawnSync("magick", [join(tmpDir, "relief.jpg"), join(tmpDir, "bands.jpg"), "-define", `compose:args=${(s.bandsWeight * 100).toFixed(2)}`, "-compose", "blend", "-composite", "-quality", "95", file]);
        if (r.status !== 0) throw new Error(`magick failed: ${r.stderr}`);
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

// ---------------------------------------------------------------- audio

// Everything is built from ffmpeg's own generators. 60 s master (the cuts trim
// and fade it): a drone of an open A chord (each note a pair of slightly
// detuned sines, left and right a hair apart, with its own slow tremolo and a
// slow phase drift) with a low-passed pink-noise breath; a swell that opens
// with the picture (up over the first 4.5 s, breathing once per palette trip
// after that); a low-pass, a soft echo; and one bell strike at t = 0 (an
// exponentially decaying sine with inharmonic partials).
const BED_SECONDS = 60;
function synthBed(wavFile) {
  const notes = [[55, 0.30], [110, 0.22], [164.81, 0.15], [220, 0.12], [277.18, 0.08], [329.63, 0.05]]; // [Hz, amplitude]
  const chan = (side) => notes.map(([hz, a], i) => {
    const det = (side ? 1 : -1) * (0.05 + 0.02 * i); // Hz, slowly beating against the other channel
    const trem = (0.04 + 0.013 * i).toFixed(4);
    const drift = (0.6 + 0.2 * i).toFixed(2);
    return `${a}*(0.75+0.25*sin(2*PI*${trem}*t+${i}))*sin(2*PI*${(hz + det).toFixed(3)}*t+${drift}*sin(2*PI*${(0.021 + 0.007 * i).toFixed(4)}*t))`;
  }).join("+");
  const bell = (f) => [[1, 1, 5.0], [0.5, 0.5, 7.0], [2.0, 0.55, 3.2], [2.76, 0.4, 2.2], [5.4, 0.18, 1.2], [8.93, 0.08, 0.7]]
    .map(([r, a, tau]) => `${(0.9 * a).toFixed(3)}*sin(2*PI*${(f * r).toFixed(2)}*t)*exp(-t/${tau})`).join("+");
  const ffArgs = [
    "-v", "error", "-y",
    "-f", "lavfi", "-i", `aevalsrc=exprs='${chan(0)}|${chan(1)}':s=44100:d=${BED_SECONDS}`,
    "-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.5:sample_rate=44100:duration=${BED_SECONDS}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='(1-exp(-t/0.003))*(${bell(659.25)})|(1-exp(-t/0.003))*(${bell(659.25 * 1.002)})':s=44100:d=${BED_SECONDS}`,
    "-filter_complex",
    // drone + a quiet low-passed noise breath, swelled with the picture, then the bell on top
    "[1:a]lowpass=f=500,highpass=f=80,tremolo=f=0.1:d=0.6,volume=0.18,aformat=channel_layouts=stereo[n];" +
    "[0:a][n]amix=inputs=2:normalize=0,lowpass=f=1300,aecho=0.8:0.85:140|290:0.4|0.25," +
    `volume='(0.55+0.45*(3*pow(min(t/4.5,1),2)-2*pow(min(t/4.5,1),3)))*(1+0.07*sin(2*PI*t/${D.cyclePeriod}))':eval=frame[d];` +
    "[2:a]aformat=channel_layouts=stereo,volume=0.55[b];" +
    "[d][b]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[m]",
    "-map", "[m]", "-c:a", "pcm_f32le", wavFile,
  ];
  const r = spawnSync("ffmpeg", ffArgs, { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg (bed synthesis) failed");
}

// Integrated loudness (LUFS) and true peak (dBTP) of an audio or video file.
function loudness(file, filter = "") {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${filter}${filter ? "," : ""}ebur128=peak=true`, "-f", "null", "-"], { encoding: "utf8" });
  const text = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const I = Number(/I:\s+(-?[\d.]+)\s+LUFS/.exec(text)?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+)\s+dBFS/.exec(text)?.[1]);
  return { I, TP };
}

// The bed for one cut: trimmed to `length`, faded out over the last 2 s, and
// gained to about -15 LUFS integrated (measured on the faded bed itself).
const TARGET_LUFS = -15;
function bedFor(master, length, outM4a, outWav) {
  const fade = `afade=t=out:st=${(length - FADE_OUT).toFixed(2)}:d=${FADE_OUT},atrim=0:${length.toFixed(2)}`;
  const first = loudness(master, `atrim=0:${length},${fade}`);
  const gain = TARGET_LUFS - first.I;
  const chain = `atrim=0:${length.toFixed(2)},volume=${gain.toFixed(2)}dB,alimiter=limit=0.7:level=disabled,${fade}`;
  spawnSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-af", chain, "-c:a", "pcm_f32le", outWav]);
  const second = loudness(outWav);
  const fine = second.I - TARGET_LUFS; // alimiter may have taken a little off
  if (Math.abs(fine) > 0.2) {
    const chain2 = `atrim=0:${length.toFixed(2)},volume=${(gain - fine).toFixed(2)}dB,alimiter=limit=0.7:level=disabled,${fade}`;
    spawnSync("ffmpeg", ["-v", "error", "-y", "-i", master, "-af", chain2, "-c:a", "pcm_f32le", outWav]);
  }
  const enc = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", outWav, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outM4a], { stdio: "inherit" });
  if (enc.status !== 0) throw new Error("ffmpeg (bed encode) failed");
  return loudness(outM4a);
}

function buildAudio() {
  mkdirSync(workDir, { recursive: true });
  const master = join(workDir, "bed-master.wav");
  synthBed(master);
  mkdirSync(outDir, { recursive: true });
  const pureLen = seconds, cardLen = seconds + CARD_HOLD;
  const a = bedFor(master, pureLen, join(outDir, "the-infinite-bed.m4a"), join(workDir, "bed-pure.wav"));
  console.log(`the-infinite-bed.m4a  ${pureLen} s  integrated ${a.I} LUFS  true peak ${a.TP} dBTP`);
  const b = bedFor(master, cardLen, join(workDir, "bed-endcard.m4a"), join(workDir, "bed-endcard.wav"));
  console.log(`bed for the end-card cut  ${cardLen} s  integrated ${b.I} LUFS  true peak ${b.TP} dBTP`);
}

// audiocheck <file>: levels in a few windows (the bell at 0, the swell, the fade-out) and the loudness summary.
function audioCheck(file) {
  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout);
  const windows = [[0, 0.05], [0.05, 0.15], [0.5, 0.6], [2, 2.1], [4, 4.1], [10, 10.1], [30, 30.1], [dur - 3, dur - 2.9], [dur - 2, dur - 1.9], [dur - 1, dur - 0.9], [dur - 0.1, dur]];
  console.log(`${file}  ${dur.toFixed(2)} s`);
  for (const [a, b] of windows) {
    const err = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(a), "-to", String(b), "-i", file, "-af", "astats=measure_overall=RMS_level+Peak_level", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const ov = err.slice(err.indexOf("Overall"));
    const rms = /RMS level dB:\s+(-?[\d.inf]+)/.exec(ov)?.[1], peak = /Peak level dB:\s+(-?[\d.inf]+)/.exec(ov)?.[1];
    console.log(`  ${a.toFixed(2)}-${b.toFixed(2)} s: RMS ${rms} dB, peak ${peak} dB`);
  }
  console.log(`  loudness ${JSON.stringify(loudness(file))}`);
}

// ---------------------------------------------------------------- cuts

// The end card: the app icon, "Fractal Atlas", "Free for iPhone and iPad" on
// black (the wording of make-dive.mjs's card), sized for a portrait frame.
async function renderCard(file) {
  const { page, errors, close } = await startPage(OW, OH, 8);
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
  const pure = join(outDir, "the-infinite-pure.mp4");
  ff([...input, "-i", pureBed, "-vf", `${TO_VIDEO},fade=t=out:st=${seconds - FADE_OUT}:d=${FADE_OUT}`, ...X264, ...tail, "-shortest", pure]);

  const card = join(workDir, "card.png");
  await renderCard(card);
  const endcard = join(outDir, "the-infinite-endcard.mp4");
  const total = seconds + CARD_HOLD;
  ff([...input, "-loop", "1", "-framerate", String(FPS), "-t", String(total), "-i", card, "-i", cardBed,
    "-filter_complex",
    `[0:v]${TO_VIDEO},tpad=stop_mode=clone:stop_duration=${CARD_HOLD}[p];` +
    `[1:v]scale=${OW}:${OH},format=yuva420p,fade=t=in:st=${seconds - CARD_FADE}:d=${CARD_FADE}:alpha=1[c];` +
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

// ---------------------------------------------------------------- main

if (command === "frames" || command === "build") await renderFrames();
if (command === "audio" || command === "build") buildAudio();
if (command === "audiocheck") audioCheck(args[0]);
if (command === "facts") await printFacts();
if (command === "cuts" || command === "build") await buildCuts();
