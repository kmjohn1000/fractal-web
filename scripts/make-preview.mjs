// App preview and promo videos, rendered from the app itself.
//
//   node scripts/make-preview.mjs <version> <iphone|ipad|social> [--quick]
//
// Drives the web build in headless WebKit (the engine of the iOS app's
// WKWebView, as scripts/store-screenshots.mjs does), one frame at a time: each
// frame sets the camera, waits for the picture to finish refining, and saves a
// JPEG; ffmpeg then encodes the frames at 30 fps with a silent audio track
// (like the 1.30.0 previews). Frame-by-frame rendering makes the zoom smooth
// and repeatable, however long a deep frame takes to draw.
//
// Storyboard (885 frames, 29.5 s, the length of the 1.30.0 previews):
//   1  0-10 s    the whole Mandelbrot set, zooming into Seahorse Valley
//   2  10-19.5 s the Color sheet: Edge glow, Stripes, Orbs, Rays
//   3  19.5-24.5 a spiral dive into the Douady rabbit (Edge glow)
//   4  24.5-29.5 dual view: c travels the cardioid, its Julia set follows
// "social" adds a caption per part and a 2 s end card (no length limit).
//
// Output (git-ignored): store-assets/preview/<version>/<target>/frames/*.jpg
// (throwaway) and the mp4 beside them, which is also copied to
// listing/<version>/previews/ with the other upload files. The
// frames folder must not exist yet: move it to the Trash first to re-render.
// --quick renders a tenth of the frames, to check the storyboard (and copies
// nothing).
import { webkit } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PORT = 8746;
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [version, target, ...flags] = process.argv.slice(2);
const quick = flags.includes("--quick");

// Each target's page size and the video size it produces. The iPad is rendered
// at its real CSS size (1032x1376, scaled to the slot's 1200x1600) so its
// layout is the iPad's. The phone is 443x960 at 2x (886x1920, the App Store
// preview size), a little wider than a real phone, with the same layout.
const TARGETS = {
  iphone: { width: 443, height: 960, dpr: 2, out: "iphone-6.3-preview-886x1920.mp4", size: [886, 1920], captions: false },
  ipad: { width: 1032, height: 1376, dpr: 1200 / 1032, out: "ipad-13-preview-1200x1600.mp4", size: [1200, 1600], captions: false },
  social: { width: 540, height: 960, dpr: 2, out: "social-1080x1920.mp4", size: [1080, 1920], captions: true },
};
const T = TARGETS[target];
if (!version || !T) {
  console.error("usage: node scripts/make-preview.mjs <version> <iphone|ipad|social> [--quick]");
  process.exit(1);
}

const outDir = join(root, "store-assets/preview", version, target);
const framesDir = join(outDir, quick ? "frames-quick" : "frames");
if (existsSync(framesDir)) {
  console.error(`${framesDir} already exists: move it to the Trash first`);
  process.exit(1);
}
mkdirSync(framesDir, { recursive: true });

// Page-context helpers (a classic script after tests/driver.js, so it sees
// the app's top-level declarations). Transitions are switched off in the page,
// so a click shows its result on the next frame.
const HELPERS = `
window.__pv = {
  view(v) { Object.assign(mainState, v); applyAutoIter(); requestRender(); },
  state() { return { cx: mainState.cx, cy: mainState.cy, scale: mainState.scale, base: mainState.baseScale, rotation: mainState.rotation || 0 }; },
  look(styleId, palette) {
    setColorStyle({ style: styleId });
    pickColormap(COLORMAPS.findIndex((c) => c.name === palette)); // a pick: a later fractal switch keeps it
    updateColorSwatches(); requestRender();
  },
  // Lands exactly on a Surprise-me place, as the app's flight does: the info
  // card names a place only while the view equals it to the last digit, and a
  // camera path ends a rounding error away.
  land(fractal, label) {
    const i = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === fractal && d.label === label);
    const d = TELEPORT_DESTINATIONS[i];
    Object.assign(mainState, { cx: Number(d.re), cy: Number(d.im), scale: d.scale, rotation: d.rotation || 0 });
    setLastTeleportIndex(i); setTeleportLandingIndex(i);
    applyAutoIter();
    requestRender();
  },
  places() { return TELEPORT_DESTINATIONS.length; },
  caption(text) {
    let el = document.getElementById("pvCaption");
    if (!el) {
      el = document.createElement("div");
      el.id = "pvCaption";
      // Below the info card (about the top 12% of the screen), two lines at most.
      el.style.cssText = "position:fixed;left:0;right:0;top:17%;z-index:99999;text-align:center;padding:0 8%;" +
        "font:700 " + Math.round(innerWidth * 0.085) + "px/1.12 -apple-system,system-ui,sans-serif;color:#fff;" +
        "text-shadow:0 2px 14px rgba(0,0,0,.85),0 0 4px rgba(0,0,0,.6);pointer-events:none;";
      document.body.appendChild(el);
    }
    el.textContent = text;
  },
  async endCard(title, line) {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:100000;background:#000;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:" + Math.round(innerWidth * 0.05) + "px;color:#fff;" +
      "font-family:-apple-system,system-ui,sans-serif;text-align:center;padding:0 8%;";
    el.innerHTML = '<img src="icons/icon-512.png" style="width:' + Math.round(innerWidth * 0.36) + 'px;border-radius:22%">' +
      '<div style="font-weight:700;font-size:' + Math.round(innerWidth * 0.12) + 'px">' + title + '</div>' +
      '<div style="font-size:' + Math.round(innerWidth * 0.06) + 'px;opacity:.8">' + line + '</div>';
    document.body.appendChild(el);
    await el.querySelector("img").decode().catch(() => {}); // the icon has to be in the frame
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

// The app's own flight easing (steadyEase in teleport.js): speed ramps up over the
// first 12%, cruises, and slows over the last 18%; returns 0..1.
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
    viewport: { width: T.width, height: T.height }, deviceScaleFactor: T.dpr, isMobile: true, hasTouch: true, serviceWorkers: "block",
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
  // The compass and speed bubble are timer-driven; the crosshair stays (dual view uses it).
  await page.addStyleTag({ content: "#speedBubble, .compass { visibility: hidden !important; } *, *::before, *::after { transition: none !important; animation: none !important; }" });
  // The app's screens, not the website's (platform.js gives wide windows a centered toolbar column).
  await page.evaluate("document.documentElement.classList.remove('web'); window.dispatchEvent(new Event('resize'))");

  // A frame is finished when the app says it has settled. If one never does (an
  // iPad render once stalled mid-dive), nudge the render and wait again; after
  // that, shoot the frame anyway and say so, rather than lose the whole render.
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
  const caption = async (text) => { if (T.captions) await ev(`__pv.caption(${JSON.stringify(text)})`); };
  const t0 = Date.now();
  const log = (msg) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  frame ${frameCount}  ${msg}`);

  // ---- 1. Zoom into Seahorse Valley.
  await ev("__vt.fractal('Mandelbrot'); __pv.look('smooth', 'Inferno')");
  await page.locator("#hudBtn").click();
  await settle();
  await caption("Zoom trillions of times deeper");
  const s = await ev("__pv.state()");
  // The view twists on the way in and is upright on arrival, so the info card
  // can name the place (it only does while the view is the place's own).
  const target1 = { x: -0.743643887037151, y: 0.13182590420533, scale: 4e-10, twist: -0.5 };
  const zoom = n(270);
  await shot(); // the whole set, before the move
  for (let i = 1; i <= zoom; i++) {
    const p = steadyEase(i / zoom);
    const scale = Math.exp(Math.log(s.scale) + (Math.log(target1.scale) - Math.log(s.scale)) * p);
    const k = scale / s.scale; // the target stays put as the view closes in
    await view({ cx: target1.x + (s.cx - target1.x) * k, cy: target1.y + (s.cy - target1.y) * k, scale, rotation: target1.twist * Math.sin(Math.PI * p) });
    await settle();
    await shot();
  }
  await ev("__pv.land('Mandelbrot', 'Seahorse Valley')");
  await settle();
  await shot();
  hold(n(29));
  log("zoom done");

  // ---- 2. The Color sheet.
  await caption("New: color Looks");
  await page.locator("#colormapBtn").click();
  await settle();
  await shot();
  hold(n(29));
  // Rays is left out: at this depth it is a plain blue field with a few thin lines.
  // A tile that can't be clicked means the sheet isn't open (a social render once
  // lost it after Bands): open it again and retry once, saying so.
  const sheetClick = async (selector) => {
    try {
      await page.locator(selector).click({ timeout: 20_000 });
    } catch {
      console.warn(`frame ${frameCount + 1}: ${selector} not clickable, reopening the Color sheet`);
      if (!(await page.evaluate("els.colorSheet.classList.contains('open')"))) await page.locator("#colormapBtn").click();
      await settle();
      await page.locator(selector).click({ timeout: 20_000 });
    }
  };
  for (const [key, name] of [["edge-glow", "Edge glow"], ["stripes", "Stripes"], ["bands", "Bands"], ["orbs", "Orbs"]]) {
    await sheetClick(`#colorSheet [data-key="look-${key}"]`);
    await settle();
    await shot();
    hold(n(59));
    log(name);
  }
  await sheetClick('#colorSheet [data-key="done"]');
  await settle();
  await shot();
  hold(n(14));

  // ---- 3. A spiral dive into the Douady rabbit.
  await caption(`Fly to ${await ev("__pv.places()")} named places`);
  await ev("__vt.fractal('Julia:Rabbit'); __pv.look('glow', 'Inferno')");
  await settle();
  const j = await ev("__pv.state()");
  const rabbit = { x: -0.2763365709357304, y: 0.4797274969941251, scale: 1e-3 };
  const radPerZoom = (Math.PI / 2) / Math.log(3); // per e-fold, as the app's spiral dives turn
  const dive = n(150);
  await shot();
  for (let i = 1; i <= dive; i++) {
    const p = steadyEase(i / dive);
    const scale = Math.exp(Math.log(j.scale) + (Math.log(rabbit.scale) - Math.log(j.scale)) * p);
    const k = scale / j.scale;
    await view({ cx: rabbit.x + (j.cx - rabbit.x) * k, cy: rabbit.y + (j.cy - rabbit.y) * k, scale, rotation: radPerZoom * Math.log(j.scale / scale) });
    await settle();
    await shot();
  }
  log("dive done");

  // ---- 4. Dual view: c travels the cardioid, the Julia set follows.
  await caption("Every Julia set, beside its home");
  await ev("__vt.fractal('Mandelbrot'); __pv.look('smooth', 'Turbo')");
  await page.locator("#dualBtn").click();
  await settle();
  const m = await ev("__pv.state()");
  const pathFrames = n(150);
  for (let i = 0; i <= pathFrames; i++) {
    const th = 0.5 + (i / pathFrames) * 4.6; // around the cardioid's boundary
    const cx = Math.cos(th) / 2 - Math.cos(2 * th) / 4;
    const cy = Math.sin(th) / 2 - Math.sin(2 * th) / 4;
    await view({ cx, cy, scale: m.base * 0.45, rotation: 0 });
    await settle();
    await shot();
  }
  log("dual done");

  if (T.captions) {
    await ev("__pv.endCard('Fractal Atlas', 'Free for iPhone and iPad')");
    await shot();
    hold(n(59));
  }
  if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`${frameCount} frames (${(frameCount / FPS).toFixed(1)} s) in ${framesDir}`);
const mp4 = join(outDir, quick ? `quick-${T.out}` : T.out);
const enc = spawnSync("ffmpeg", [
  "-v", "error", "-y", "-framerate", String(FPS), "-i", join(framesDir, "%05d.jpg"),
  "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-shortest",
  "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.0",
  "-r", String(FPS), "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", mp4,
], { stdio: "inherit" });
if (enc.status !== 0) throw new Error("ffmpeg failed");
const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,duration", "-of", "csv=p=0", mp4]).stdout.toString().trim();
console.log(`${mp4}\n  width,height,fps,duration: ${probe}`);
if (probe.split(",").slice(0, 2).join("x") !== T.size.join("x")) throw new Error(`expected ${T.size.join("x")}`);
writeFileSync(join(outDir, "README.txt"), `Rendered by scripts/make-preview.mjs ${version} ${target}\n`);
// The finished video joins the version's other upload files (the 1.30.0
// previews live there too); the frames stay behind in store-assets, which is
// the throwaway folder.
if (!quick) {
  const previews = join(root, "listing", version, "previews");
  mkdirSync(previews, { recursive: true });
  copyFileSync(mp4, join(previews, T.out));
  console.log(`copied to ${join(previews, T.out)}`);
}
