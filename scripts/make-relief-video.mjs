// A 720p landscape (1280x720) video in the Relief look, rendered from the app itself.
//
//   node scripts/make-relief-video.mjs <version> [--quick] [--web]
//
// Same method as scripts/make-preview.mjs: the web build in headless WebKit,
// one frame at a time (set the camera, wait for the picture to finish
// refining, save a JPEG), then ffmpeg encodes the frames at 30 fps with a
// synthesized ambient drone as the audio. The toolbar is hidden, so the picture
// fills the frame (the info card stays); the page uses the app's screens, or
// with --web the website's layout.
//
// Storyboard (1589 frames, 53 s), Relief look with the Classic palette: the
// whole Mandelbrot set, one 44 s dive to the Mini Mandelbrot (the view banks
// left and right about the horizon line 20-45 degrees as it zooms), a 4 s
// hold, then a 1.5 s fade to the Fractal Atlas end card, held 3.5 s.
//
// Output (git-ignored): store-assets/preview/<version>/relief-720p/frames/*.jpg
// (throwaway) and relief-720p.mp4 beside them, copied to
// listing/<version>/previews/. The frames folder must not exist yet: move it
// to the Trash first to re-render. --quick renders a tenth of the frames, to
// check the storyboard (and copies nothing).
import { webkit } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PORT = 8747;
const FPS = 30;
const SIZE = [1280, 720];
const OUT = "relief-720p.mp4";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [version, ...flags] = process.argv.slice(2);
const quick = flags.includes("--quick");
const web = flags.includes("--web");
const thumbnail = flags.includes("--thumbnail");
if (!version) {
  console.error("usage: node scripts/make-relief-video.mjs <version> [--quick] [--web] [--thumbnail]");
  process.exit(1);
}

const outDir = join(root, "store-assets/preview", version, "relief-720p");
const framesDir = join(outDir, quick ? "frames-quick" : "frames");
if (!thumbnail) {
  if (existsSync(framesDir)) {
    console.error(`${framesDir} already exists: move it to the Trash first`);
    process.exit(1);
  }
  mkdirSync(framesDir, { recursive: true });
}

// Page-context helpers (a classic script after tests/driver.js, so it sees the
// app's top-level declarations).
const HELPERS = `
window.__pv = {
  view(v) { Object.assign(mainState, v); applyAutoIter(); requestRender(); },
  state() { return { cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, base: mainState.baseScale, rotation: mainState.rotation || 0 }; },
  look(styleId, palette) {
    setColorStyle({ style: styleId });
    pickColormap(COLORMAPS.findIndex((c) => c.name === palette)); // a pick: a later fractal switch keeps it
    updateColorSwatches(); requestRender();
  },
  // Lands exactly on a Surprise-me place, as the app's flight does (the info
  // card names a place only while the view equals it to the last digit).
  land(fractal, label) {
    const i = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === fractal && d.label === label);
    const d = TELEPORT_DESTINATIONS[i];
    Object.assign(mainState, { cx: Number(d.re), cy: Number(d.im), scale: d.scale, rotation: d.rotation || 0 });
    setLastTeleportIndex(i); setTeleportLandingIndex(i);
    applyAutoIter();
    requestRender();
  },
  // The teaser card (the social preview's end card, laid out for a wide frame):
  // starts transparent, so the caller can fade it in.
  async endCard(title, line) {
    const el = document.createElement("div");
    el.id = "pvEndCard";
    el.style.cssText = "position:fixed;inset:0;z-index:100000;background:#000;opacity:0;display:flex;align-items:center;" +
      "justify-content:center;gap:" + Math.round(innerHeight * 0.07) + "px;color:#fff;font-family:-apple-system,system-ui,sans-serif;";
    el.innerHTML = '<img src="icons/icon-512.png" style="width:' + Math.round(innerHeight * 0.38) + 'px;border-radius:22%">' +
      '<div><div style="font-weight:700;font-size:' + Math.round(innerHeight * 0.13) + 'px">' + title + '</div>' +
      '<div style="font-size:' + Math.round(innerHeight * 0.058) + 'px;opacity:.8;margin-top:' + Math.round(innerHeight * 0.02) + 'px">' + line + '</div></div>';
    document.body.appendChild(el);
    await el.querySelector("img").decode().catch(() => {}); // the icon has to be in the frame
  },
  place(fractal, label) {
    const d = TELEPORT_DESTINATIONS.find((d) => d.fractal === fractal && d.label === label);
    return { x: Number(d.re), y: Number(d.im), scale: d.scale };
  },
};
`;

async function startServer() {
  const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) return server;
    await sleep(100);
  }
  server.kill();
  throw new Error(`the static server didn't start on port ${PORT}`);
}

// The app's own flight easing (steadyEase in teleport.js); returns 0..1.
function steadyEase(t, a = 0.12, b = 0.18) {
  const vmax = 1 / (1 - a / 2 - b / 2);
  if (t < a) return vmax * t * t / (2 * a);
  if (t <= 1 - b) return vmax * (a / 2 + (t - a));
  const u = 1 - t;
  return 1 - vmax * u * u / (2 * b);
}

const n = (frames) => (quick ? Math.max(2, Math.round(frames / 10)) : frames);

let frameCount = 0;
const server = await startServer();
const browser = await webkit.launch();
try {
  const context = await browser.newContext({
    viewport: { width: SIZE[0], height: SIZE[1] }, deviceScaleFactor: 1, serviceWorkers: "block",
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.setItem("fractalAtlas.deepPasses", "16"); // video frames get every sharpening pass
    } catch { /* storage blocked */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.addScriptTag({ path: join(root, "tests/driver.js") });
  await page.addScriptTag({ content: HELPERS });
  await page.addStyleTag({ content: "#speedBubble, .compass { visibility: hidden !important; } *, *::before, *::after { transition: none !important; animation: none !important; }" });
  if (!web) await page.evaluate("document.documentElement.classList.remove('web'); window.dispatchEvent(new Event('resize'))");

  // A frame is finished when the app says it has settled; if one never does,
  // nudge the render and wait again, then shoot it anyway and say so.
  const settle = async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        await page.waitForFunction("window.__vt.settled()", null, { timeout: attempt ? 60_000 : 30_000, polling: 20 });
        break;
      } catch {
        if (attempt >= 2) { console.warn(`frame ${frameCount + 1}: never settled, shooting it as it is`); break; }
        await page.evaluate("requestRender()");
      }
    }
    await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  };
  const last = () => join(framesDir, `${String(frameCount).padStart(5, "0")}.jpg`);
  const shot = async () => {
    frameCount++;
    await page.screenshot({ path: last(), type: "jpeg", quality: 92, animations: "disabled", caret: "hide" });
  };
  const hold = (frames) => {
    const src = last();
    for (let i = 0; i < frames; i++) { frameCount++; copyFileSync(src, last()); }
  };
  const view = (v) => page.evaluate(`__pv.view(${JSON.stringify(v)})`);
  const ev = (code) => page.evaluate(code);
  const t0 = Date.now();
  const log = (msg) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  frame ${frameCount}  ${msg}`);

  // A dive from the fractal's opening view to a place. The target keeps its
  // place on the screen as the view closes in (the point under the target
  // stays put), and its offset from the center eases to nothing, so the dive
  // ends exactly on the place: the last frame is the landing, with no snap
  // (k alone would end a view-width off). `bank(p)` is the view's rotation at
  // progress p (0 at both ends, so the view arrives upright).
  const dive = async (fractal, label, frames, bank) => {
    const s = await ev("__pv.state()");
    const target = await ev(`__pv.place(${JSON.stringify(fractal)}, ${JSON.stringify(label)})`);
    await shot(); // the opening view, before the move
    for (let i = 1; i < frames; i++) {
      const t = i / frames;
      const p = steadyEase(t);
      const scale = Math.exp(Math.log(s.scale) + (Math.log(target.scale) - Math.log(s.scale)) * p);
      const k = scale / s.scale * (1 - t * t * (3 - 2 * t));
      await view({ cx: target.x + (s.cx - target.x) * k, cy: target.y + (s.cy - target.y) * k, scale, rotation: bank(t) });
      await settle();
      await shot();
    }
    await ev(`__pv.land(${JSON.stringify(fractal)}, ${JSON.stringify(label)})`); // the exact place, named on the info card
    await settle();
    await shot();
  };

  // Banking, as a plane does in a turn: the view rolls left and right about
  // the horizon line, three swings each way, each a little wider or narrower
  // (20 to 45 degrees), easing in over the first 8% and out over the last 15%
  // so the view starts and ends upright.
  const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const bank = (t) => {
    const degrees = 32.5 + 12.5 * Math.sin(2 * Math.PI * 1.3 * t + 1);
    const envelope = smooth(0, 0.08, t) * (1 - smooth(0.85, 1, t));
    return (degrees * Math.PI / 180) * Math.sin(2 * Math.PI * 3 * t) * envelope;
  };

  // --thumbnail: one 1280x720 JPEG of the landing (no info card, no toolbar)
  // under a title, with the app icon in the corner, and nothing else.
  if (thumbnail) {
    await ev("__vt.fractal('Mandelbrot'); __pv.look('relief', 'Classic')");
    await page.addStyleTag({ content: "#controls { display: none !important; }" });
    await page.evaluate("window.dispatchEvent(new Event('resize'))");
    await ev("__pv.land('Mandelbrot', 'Mini Mandelbrot')");
    await settle();
    await page.evaluate(`(async () => {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;inset:0;z-index:100000;pointer-events:none;font-family:-apple-system,system-ui,sans-serif;color:#fff;" +
        "background:linear-gradient(to bottom,rgba(0,0,0,.62) 0,rgba(0,0,0,.25) 38%,rgba(0,0,0,0) 62%);";
      el.innerHTML = '<div style="position:absolute;left:52px;top:34px;text-shadow:0 4px 24px rgba(0,0,0,.8),0 1px 3px rgba(0,0,0,.7)">' +
        '<div style="font-weight:900;font-size:150px;line-height:1;letter-spacing:-2px">830 BILLION&times;</div>' +
        '<div style="font-weight:700;font-size:50px;margin-top:10px">deeper into the Mandelbrot set</div></div>' +
        '<img src="icons/icon-512.png" style="position:absolute;right:40px;bottom:40px;width:120px;border-radius:22%;box-shadow:0 4px 24px rgba(0,0,0,.6)">';
      document.body.appendChild(el);
      await el.querySelector("img").decode().catch(() => {});
    })()`);
    await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    const previews = join(root, "listing", version, "previews");
    mkdirSync(previews, { recursive: true });
    const file = join(previews, "relief-720p-thumbnail.jpg");
    await page.screenshot({ path: file, type: "jpeg", quality: 93, animations: "disabled", caret: "hide" });
    if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
    console.log(file);
    await browser.close();
    server.kill();
    process.exit(0); // skips the video encoding below
  }

  // The whole set, diving to the Mini Mandelbrot.
  await ev("__vt.fractal('Mandelbrot'); __pv.look('relief', 'Classic')");
  await page.locator("#hudBtn").click();
  // No toolbar: the picture fills the frame (the resize hands the canvas the freed strip).
  await page.addStyleTag({ content: "#controls { display: none !important; }" });
  await page.evaluate("window.dispatchEvent(new Event('resize'))");
  await settle();
  await dive("Mandelbrot", "Mini Mandelbrot", n(1320), bank);
  hold(n(119));
  log("Mini Mandelbrot");

  // ---- The teaser: the end card fades in over the held view (the overlay's
  // opacity is set per frame, since the page's transitions are off), then holds.
  await page.evaluate("__pv.endCard('Fractal Atlas', 'Free for iPhone and iPad')");
  const fade = n(45);
  for (let i = 1; i <= fade; i++) {
    await ev(`document.getElementById('pvEndCard').style.opacity = ${i / fade}`);
    await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    await shot();
  }
  hold(n(104));
  log("end card");

  if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`${frameCount} frames (${(frameCount / FPS).toFixed(1)} s) in ${framesDir}`);
const mp4 = join(outDir, quick ? `quick-${OUT}` : OUT);
// The ambient track is synthesized here (no audio files): an open A chord drone
// (A1, E2, A2, C#3, E3, B3), each note a pair of slightly detuned sines that
// beat slowly, each with its own slow tremolo so the chord breathes; then a
// low-pass, an echo for room, and a fade in and out.
const seconds = frameCount / FPS;
const NOTES = [[55, 0.11, 0.9], [82.41, 0.09, 0.7], [110, 0.13, 0.6], [138.59, 0.1, 0.5], [164.81, 0.12, 0.4], [246.94, 0.08, 0.3]];
const audioIn = [];
const audioFilter = [];
NOTES.forEach(([hz, detune, rate], i) => {
  for (const [j, f] of [hz - detune, hz + detune].entries()) {
    audioIn.push("-f", "lavfi", "-i", `sine=frequency=${f.toFixed(2)}:sample_rate=44100:duration=${seconds}`);
    audioFilter.push(`[${i * 2 + j + 1}:a]tremolo=f=${(0.1 + rate / 6 + j * 0.013).toFixed(3)}:d=0.45,volume=${(1 / (i + 1.5)).toFixed(3)}[v${i * 2 + j}]`);
  }
});
const nv = NOTES.length * 2;
const mix = `${audioFilter.join(";")};${Array.from({ length: nv }, (_, i) => `[v${i}]`).join("")}amix=inputs=${nv}:normalize=0,` +
  `lowpass=f=1100,aecho=0.8:0.85:90|180|310:0.45|0.35|0.25,volume=1.3,aformat=channel_layouts=stereo,` +
  `afade=t=in:d=3,afade=t=out:st=${Math.max(0, seconds - 4).toFixed(2)}:d=${Math.min(4, seconds).toFixed(2)}[a]`; // (a --quick video is shorter than the fades)
const enc = spawnSync("ffmpeg", [
  "-v", "error", "-y", "-framerate", String(FPS), "-i", join(framesDir, "%05d.jpg"), ...audioIn,
  "-filter_complex", mix, "-map", "0:v", "-map", "[a]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
  "-r", String(FPS), "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", mp4,
], { stdio: "inherit" });
if (enc.status !== 0) throw new Error("ffmpeg failed");
const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,duration", "-of", "csv=p=0", mp4]).stdout.toString().trim();
console.log(`${mp4}\n  width,height,fps,duration: ${probe}`);
if (probe.split(",").slice(0, 2).join("x") !== SIZE.join("x")) throw new Error(`expected ${SIZE.join("x")}`);
writeFileSync(join(outDir, "README.txt"), `Rendered by scripts/make-relief-video.mjs ${version}\n`);
if (!quick) {
  const previews = join(root, "listing", version, "previews");
  mkdirSync(previews, { recursive: true });
  copyFileSync(mp4, join(previews, OUT));
  console.log(`copied to ${join(previews, OUT)}`);
}
