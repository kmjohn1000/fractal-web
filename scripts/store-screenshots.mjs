// App Store screenshots and promo images for one version; used by /release.
// Renders the web build in headless WebKit (the engine of the iOS app's
// WKWebView) at each App Store Connect slot's exact pixel size.
//
//   node scripts/store-screenshots.mjs <version> [shotName ...]
//
// Writes, under listing/<version>/:
//   renders/<slot>/<shot>.png  this run's bare renders, plus captions.json:
//                              the baseline the next version compares with
//   app/<slot>/<shot>.png      bare app screens to upload (no caption,
//                              background or device frame)
//   promo/<slot>/<shot>.png    the same screen under its caption
//
// Only images that need to change are new. A shot whose render looks the
// same as the previous version's render keeps the previous version's app/
// file, and its promo/ file too if the caption is also unchanged (copied, so
// each version's folders are complete). The previous version is the newest
// earlier folder with renders/; without one, everything is new.
//
// Each shot puts the app in its state the way tests/driver.js does (no
// Surprise-me flight), then waits for the frame to finish refining. Fails on
// a wrong pixel size, a page error, the error banner or a lost WebGL context.
import { webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const root = new URL("..", import.meta.url).pathname;
const LISTING = join(root, "listing");
const PORT = 8745;
const DRIVER = join(root, "tests/driver.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// App Store Connect's slots, as of 2026-10-15: the iPhone slot ("Dynamic
// Island, medium display") takes only 1206x2622 or 1179x2556 and rejected
// 6.5" 1284x2778; the iPad 13" slot takes 2064x2752, and 2048x2732 (12.9")
// is kept as a spare. 6.5" is made as a promo image only. The promo layout
// (caption band, margin under the screen, font size, corner radius) is in
// output pixels, as in the 1.30.0 promo set.
const SLOTS = [
  { slot: "iphone-6.3", width: 402, height: 874, dpr: 3, upload: true, promo: { captionPx: 380, bottomPx: 85, fontPx: 96, radius: 66 } },
  { slot: "iphone-6.5", width: 428, height: 926, dpr: 3, upload: false, promo: { captionPx: 400, bottomPx: 90, fontPx: 100, radius: 70 } },
  { slot: "ipad-13", width: 1032, height: 1376, dpr: 2, upload: true, promo: { captionPx: 330, bottomPx: 80, fontPx: 104, radius: 50 } },
  { slot: "ipad-12.9", width: 1024, height: 1366, dpr: 2, upload: true, promo: { captionPx: 330, bottomPx: 80, fontPx: 104, radius: 50 } },
];

// In-page helpers, added as a classic <script> after tests/driver.js so they
// see the app's top-level declarations. land() is a Surprise-me landing as
// __vt.place leaves it, plus what the flight itself leaves behind: the
// landing index the info card reads its place name from, and a Back step.
const HELPERS = `
window.__store = {
  colormap(name) {
    colormapIndex = COLORMAPS.findIndex((c) => c.name === name);
    if (colormapIndex < 0) throw new Error("no colormap " + name);
    updateLUT(); updateColorSwatches(); requestRender();
  },
  land(fractal, label) {
    const i = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === fractal && d.label === label);
    if (i < 0) throw new Error("no place " + fractal + ": " + label);
    __vt.place(i);
    lastTeleportIndex = teleportLandingIndex = i;
    pushHistory("main");
    requestRender();
  },
  solidColor(modeKey, name) {
    vectorColors[modeKey] = SOLID_COLORS.findIndex((c) => c.name === name);
    updateColorSwatches(); requestRender();
  },
  // What the captions count: the picker's tiles and the Surprise-me places.
  counts() {
    return {
      picker: document.querySelectorAll("#fractalTypeRow button[data-name], #fractalTypeRow button[data-mode]").length,
      places: TELEPORT_DESTINATIONS.length,
    };
  },
};
`;

// The listing's six shots (the 1.30.0 set). Each step is page-context code
// or a toolbar click; the app settles after every step. Captions take the
// app's live counts, so a count that changes updates its promo image.
const SHOTS = [
  { name: "1-deep-zoom", caption: () => "Zoom trillions\nof times deeper",
    steps: ["__store.land('Mandelbrot', 'Mini Mandelbrot'); __store.colormap('Inferno')", "#hudBtn"] },
  { name: "2-picker", caption: (c) => `${c.picker} fractals.\nAll free.`,
    steps: ["__store.land('Mandelbrot', 'Seahorse Valley'); __store.colormap('Plasma')", ".fractalMenuBtn"] },
  { name: "3-julia-dual", caption: () => "Every Julia set,\nbeside its home",
    steps: ["__vt.fractal('Julia:Spiral'); __store.colormap('Turbo')", "#hudBtn", "#dualBtn"] },
  { name: "4-tricorn", caption: () => "Phoenix, Tricorn,\nCeltic and more",
    steps: ["__store.land('Tricorn', 'Lace Tricorn'); __store.colormap('Twilight')", "#hudBtn"] },
  { name: "5-burning-ship", caption: (c) => `Surprise me:\n${c.places} named places`,
    steps: ["__store.land('Burn. Ship', 'Armada'); __store.colormap('Fire')", "#hudBtn"] },
  { name: "6-pattern-play", caption: () => "Watch patterns\ngrow",
    steps: ["__vt.mode('tree'); __store.solidColor('tree', 'Autumn')"] },
  // Added with 1.40.0 (the Color sheet): upload it as a seventh screenshot and
  // drag it up the list in App Store Connect.
  { name: "7-looks", caption: () => "Six Looks.\nEvery palette.",
    steps: ["__store.land('Mandelbrot', 'Seahorse Valley')", "#colormapBtn", '#colorSheet [data-key="look-stripes"]'] },
];

// Timer-driven overlays (rotation compass, crosshair flash, speed bubble),
// hidden as in the visual suite.
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";

// Two renders count as the same screen when almost no 8x8 block's average
// color moved by more than BLOCK_TOLERANCE (of 255) in any channel. Repeat
// renders of one build differ by a few blocks at most; a changed icon or
// picker tile moves dozens.
const BLOCK = 8;
const BLOCK_TOLERANCE = 24;
const MAX_CHANGED_BLOCKS = 12;

function blockMeans(png) {
  const { data, width, height } = PNG.sync.read(png);
  const bw = Math.floor(width / BLOCK), bh = Math.floor(height / BLOCK);
  const sums = new Float64Array(bw * bh * 3);
  for (let y = 0; y < bh * BLOCK; y++) {
    for (let x = 0; x < bw * BLOCK; x++) {
      const i = (y * width + x) * 4, o = (Math.floor(y / BLOCK) * bw + Math.floor(x / BLOCK)) * 3;
      sums[o] += data[i]; sums[o + 1] += data[i + 1]; sums[o + 2] += data[i + 2];
    }
  }
  return { width, height, means: sums.map((s) => s / (BLOCK * BLOCK)) };
}

function changedBlocks(a, b) {
  const x = blockMeans(a), y = blockMeans(b);
  if (x.width !== y.width || x.height !== y.height) return Infinity;
  let n = 0;
  for (let k = 0; k < x.means.length; k += 3) {
    if (Math.max(Math.abs(x.means[k] - y.means[k]), Math.abs(x.means[k + 1] - y.means[k + 1]),
      Math.abs(x.means[k + 2] - y.means[k + 2])) > BLOCK_TOLERANCE) n++;
  }
  return n;
}

// The newest version folder before this one that has renders/ to compare with.
function previousVersion(version) {
  const parse = (v) => v.split(".").map(Number);
  const older = (a, b) => { const [x, y] = [parse(a), parse(b)]; return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
  return readdirSync(LISTING)
    .filter((d) => /^\d+\.\d+\.\d+$/.test(d) && older(d, version) < 0 && existsSync(join(LISTING, d, "renders")))
    .sort(older).pop() || null;
}

// Page-context code is passed as strings: this file is linted as Node code.
async function waitSettled(page) {
  await page.waitForFunction("window.__vt.settled()", null, { timeout: 60_000, polling: 100 });
  // Two frames, so the last draw has reached the screen.
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
}

async function startServer() {
  const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) return server;
    await sleep(100);
  }
  server.kill();
  throw new Error(`the static server didn't start on port ${PORT}`);
}

// Renders one shot; returns the PNG, the caption counts and any problems.
async function render(browser, size, shot) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr, isMobile: true, hasTouch: true, serviceWorkers: "block",
  });
  // A return visitor who closed the welcome card: no cold-open flight and no
  // card over the shots.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.setItem("fractalAtlas.deepPasses", "16"); // store images get every sharpening pass
    } catch { /* storage blocked */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.addScriptTag({ path: DRIVER });
    await page.addScriptTag({ content: HELPERS });
    await page.addStyleTag({ content: HIDE_TRANSIENTS });
    // These are the app's screens, not the website's: platform.js gives the
    // website a centered toolbar column on wide windows (html.web), which the
    // iPad app doesn't have (it keeps the full-width toolbar).
    await page.evaluate("document.documentElement.classList.remove('web'); window.dispatchEvent(new Event('resize'))");
    await waitSettled(page);
    for (const step of shot.steps) {
      if (/^[#.]/.test(step)) await page.locator(`${step}:visible`).first().click();
      else await page.evaluate(step);
      await waitSettled(page);
      await sleep(600); // panel and picker transitions
    }
    await waitSettled(page);
    const png = await page.screenshot({ animations: "disabled", caret: "hide" });
    const { width, height } = PNG.sync.read(png);
    const state = await page.evaluate("window.__vt.inspect()");
    const counts = await page.evaluate("window.__store.counts()");
    const problems = [
      width !== size.width * size.dpr || height !== size.height * size.dpr ? `size ${width}x${height}` : "",
      errors.length ? `page errors: ${errors.join("; ")}` : "",
      state.error ? `error banner: ${state.error}` : "",
      state.contextLost || state.contextLostEvents ? "WebGL context lost" : "",
    ].filter(Boolean);
    return { png, counts, problems };
  } finally {
    await context.close();
  }
}

// The promo image: the caption on top, the app screen below it with rounded
// corners, on a dark gradient, at the slot's pixel size.
async function composite(browser, size, png, caption) {
  const W = size.width * size.dpr, H = size.height * size.dpr, p = size.promo;
  const imgH = H - p.captionPx - p.bottomPx, imgW = Math.round(imgH * W / H);
  const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
    body{background:radial-gradient(120% 60% at 50% 0%,#1b2440 0%,#0a0d18 55%,#05060b 100%);font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;color:#fff}
    h1{position:absolute;left:0;right:0;top:0;height:${p.captionPx}px;margin:0;display:flex;align-items:center;justify-content:center;text-align:center;font-size:${p.fontPx}px;font-weight:700;letter-spacing:-0.02em;line-height:1.08}
    img{position:absolute;top:${p.captionPx}px;left:${(W - imgW) / 2}px;width:${imgW}px;height:${imgH}px;border-radius:${p.radius}px;box-shadow:0 0 0 3px rgba(255,255,255,.14),0 30px 80px rgba(0,0,0,.6)}
  </style></head><body><h1>${caption.split("\n").map(escape).join("<br>")}</h1><img src="data:image/png;base64,${png.toString("base64")}"></body></html>`;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html);
    await page.waitForFunction("document.images[0].complete && document.fonts.status === 'loaded'");
    return await page.screenshot();
  } finally {
    await page.close();
  }
}

const [version, ...only] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error("usage: node scripts/store-screenshots.mjs <version> [shotName ...]");
  process.exit(2);
}
const dir = (...parts) => join(LISTING, ...parts);
const prev = previousVersion(version);
const prevCaptions = prev && existsSync(dir(prev, "renders/captions.json"))
  ? JSON.parse(readFileSync(dir(prev, "renders/captions.json"), "utf8")) : {};
console.log(prev ? `comparing with ${prev}` : "no earlier version with renders/: every image is new");
const shots = SHOTS.filter((s) => !only.length || only.some((o) => s.name.startsWith(o)));
const captionsFile = dir(version, "renders/captions.json");
const captions = existsSync(captionsFile) ? JSON.parse(readFileSync(captionsFile, "utf8")) : {};

const server = await startServer();
const browser = await webkit.launch();
let failed = 0;
const changed = [];
try {
  for (const size of SLOTS) {
    for (const sub of ["renders", "app", "promo"]) {
      if (sub !== "app" || size.upload) mkdirSync(dir(version, sub, size.slot), { recursive: true });
    }
    for (const shot of shots) {
      const file = `${size.slot}/${shot.name}.png`;
      const r = await render(browser, size, shot);
      writeFileSync(dir(version, "renders", file), r.png);
      if (r.problems.length) {
        failed++;
        console.log(`BAD ${file} (${r.problems.join(", ")})`);
        continue;
      }
      const caption = shot.caption(r.counts);
      captions[shot.name] = caption;
      const prevRender = prev && existsSync(dir(prev, "renders", file)) ? readFileSync(dir(prev, "renders", file)) : null;
      const diff = prevRender ? changedBlocks(r.png, prevRender) : null;
      const sameScreen = diff !== null && diff <= MAX_CHANGED_BLOCKS;
      const notes = diff === null ? [] : [`${diff} blocks changed`];
      if (size.upload) {
        if (sameScreen && existsSync(dir(prev, "app", file))) {
          copyFileSync(dir(prev, "app", file), dir(version, "app", file));
          notes.push(`app same as ${prev}`);
        } else {
          writeFileSync(dir(version, "app", file), r.png);
          notes.push("app NEW");
          changed.push(`app/${file}`);
        }
      }
      if (sameScreen && prevCaptions[shot.name] === caption && existsSync(dir(prev, "promo", file))) {
        copyFileSync(dir(prev, "promo", file), dir(version, "promo", file));
        notes.push(`promo same as ${prev}`);
      } else {
        writeFileSync(dir(version, "promo", file), await composite(browser, size, r.png, caption));
        notes.push("promo NEW");
        changed.push(`promo/${file}`);
      }
      console.log(`ok  ${file}: ${notes.join(", ")}`);
    }
  }
} finally {
  await browser.close();
  server.kill();
  writeFileSync(captionsFile, JSON.stringify(captions, null, 2) + "\n");
}
console.log(changed.length ? `\nnew images (${changed.length}):\n  ${changed.join("\n  ")}` : "\nno image changed");
if (failed) {
  console.error(`${failed} screenshot(s) failed their checks`);
  process.exit(1);
}
