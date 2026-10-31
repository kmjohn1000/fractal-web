// The App Store product-page header (3840x1646): the app's Seahorse Valley
// render, dimmed on the left under the title and a subtitle that counts the
// picker's fractals.
//
//   node scripts/store-header.mjs
//   node scripts/store-header.mjs search <version>
//
// The second form makes the 3:2 search-results asset (3840x2560, App Store
// Connect's creative asset shown in search instead of the screenshots): the
// same render under the title and a plain line, with the app's real picker
// screen (listing/<version>/app/iphone-6.3/2-picker.png) in a phone frame, so
// the interface shows. Writes listing/search-results-3840x2560.png.
//
// Renders the bare canvas from the web build in headless WebKit (the engine
// of the iOS app's WKWebView) at 1920x823 CSS px, dpr 2, then composes the
// text over it. Writes listing/product-page-header-3840x1646.png
// (git-ignored), keeping the previous file as ...png.bak. Fails on a page
// error, the error banner or a lost WebGL context.
import { webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const [mode, shotVersion] = process.argv.slice(2);
const SEARCH = mode === "search";
if (mode && (!SEARCH || !/^\d+\.\d+\.\d+$/.test(shotVersion || ""))) {
  console.error("usage: node scripts/store-header.mjs [search <version>]");
  process.exit(2);
}

const root = new URL("..", import.meta.url).pathname;
const OUT_DIR = join(root, "listing");
const OUT = join(OUT_DIR, SEARCH ? "search-results-3840x2560.png" : "product-page-header-3840x1646.png");
const PORT = 8746;
const DRIVER = join(root, "tests/driver.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const W = 3840, H = SEARCH ? 2560 : 1646, DPR = 2;
const PLACE = { fractal: "Mandelbrot", label: "Seahorse Valley", colormap: "Classic" };
// Text sizes in output pixels; the title and the subtitle left edge sit in
// the dark part of the fade, clear of the bright fractal on the right.
const TEXT = { left: 400, titlePx: 190, subtitlePx: 52, subtitleColor: "#f3dcab" };

// Page-context code is passed as strings: this file is linted as Node code.
async function waitSettled(page) {
  await page.waitForFunction("window.__vt.settled()", null, { timeout: 90_000, polling: 100 });
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

// The bare canvas at W x H, plus the number of fractals the picker lists.
async function renderCanvas(browser) {
  const context = await browser.newContext({
    viewport: { width: W / DPR, height: 1100 }, deviceScaleFactor: DPR, serviceWorkers: "block",
  });
  // A return visitor who closed the welcome card: no cold-open flight.
  await context.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      localStorage.setItem("fractalAtlas.deepPasses", "16"); // the header gets every sharpening pass
    } catch { /* storage blocked */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.addScriptTag({ path: DRIVER });
    await waitSettled(page);
    // The canvas is the viewport minus the toolbar: size the viewport so it is exactly W x H.
    const toolbarH = await page.evaluate("window.__vt.inspect().controls.h");
    await page.setViewportSize({ width: W / DPR, height: Math.round(H / DPR + toolbarH) });
    await waitSettled(page);
    await page.addStyleTag({ content: ".compass, #crosshair, #speedBubble, #infoCard, #hud, .welcome { visibility: hidden !important; }" });
    const { fractal, label, colormap } = PLACE;
    await page.evaluate(`(() => {
      const i = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === ${JSON.stringify(fractal)} && d.label === ${JSON.stringify(label)});
      if (i < 0) throw new Error("no place ${label}");
      __vt.place(i); // resets the colormap to the first one, so pick ours after
      const cm = COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(colormap)});
      if (cm < 0) throw new Error("no colormap ${colormap}");
      setColormapIndex(cm);
      updateLUT(); updateColorSwatches(); requestRender();
    })()`);
    await waitSettled(page);
    const png = await page.locator("#mainCanvas").screenshot({ animations: "disabled" });
    const count = await page.evaluate(
      `document.querySelectorAll("#fractalTypeRow button[data-name], #fractalTypeRow button[data-mode]").length`);
    const state = await page.evaluate("window.__vt.inspect()");
    const { width, height } = PNG.sync.read(png);
    const problems = [
      width !== W || height !== H ? `canvas is ${width}x${height}, not ${W}x${H}` : "",
      errors.length ? `page errors: ${errors.join("; ")}` : "",
      state.error ? `error banner: ${state.error}` : "",
      state.contextLost || state.contextLostEvents ? "WebGL context lost" : "",
    ].filter(Boolean);
    if (problems.length) throw new Error(problems.join("; "));
    return { png, count };
  } finally {
    await context.close();
  }
}

// The search-results asset's page: Apple asks it to state the obvious and show
// the firsthand experience, so the picker screen (bare, from the store
// screenshots) sits in a phone frame beside the title and a plain line. At
// search-result size the asset is about 580 px wide, so the text is large.
function searchHtml(canvasPng, count) {
  const shot = readFileSync(join(OUT_DIR, shotVersion, "app/iphone-6.3/2-picker.png"));
  const icon = readFileSync(join(root, "icons/icon-512.png"));
  const screenH = 2240, screenW = Math.round(screenH * 1206 / 2622), bezel = 26;
  return `<!doctype html><html><head><style>
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#05060f}
    .bg{position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:cover}
    .fade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,5,18,.95) 0%,rgba(4,5,18,.9) 36%,rgba(4,5,18,.5) 52%,rgba(4,5,18,0) 68%)}
    .text{position:absolute;left:300px;top:50%;transform:translateY(-50%);font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;color:#fff;white-space:nowrap}
    .icon{width:200px;border-radius:22%;display:block;margin:0 0 70px 6px;box-shadow:0 12px 50px rgba(0,0,0,.5)}
    h1{margin:0;font-size:230px;font-weight:700;letter-spacing:-0.02em;line-height:1}
    p{margin:44px 0 0 8px;font-size:120px;font-weight:500;color:#f3dcab;line-height:1}
    .phone{position:absolute;right:330px;top:50%;transform:translateY(-50%);padding:${bezel}px;border-radius:170px;background:#0b0b10;
      box-shadow:0 70px 220px rgba(0,0,0,.7),inset 0 0 0 4px #2b2b35}
    .phone img{display:block;width:${screenW}px;height:${screenH}px;border-radius:144px}
  </style></head><body><img class="bg" src="data:image/png;base64,${canvasPng.toString("base64")}"><div class="fade"></div>
  <div class="text"><img class="icon" src="data:image/png;base64,${icon.toString("base64")}"><h1>Fractal Atlas</h1><p>Zoom into ${count} fractals</p></div>
  <div class="phone"><img src="data:image/png;base64,${shot.toString("base64")}"></div></body></html>`;
}

async function compose(browser, canvasPng, count) {
  const html = SEARCH ? searchHtml(canvasPng, count) : `<!doctype html><html><head><style>
    html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#05060f}
    .bg{position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:cover}
    .fade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(4,5,18,.94) 0%,rgba(4,5,18,.92) 34%,rgba(4,5,18,.6) 46%,rgba(4,5,18,0) 62%)}
    .text{position:absolute;left:${TEXT.left}px;top:50%;transform:translateY(-50%);font-family:-apple-system,"SF Pro Display","Helvetica Neue",sans-serif;color:#fff;white-space:nowrap}
    h1{margin:0;font-size:${TEXT.titlePx}px;font-weight:700;letter-spacing:-0.02em;line-height:1}
    p{display:inline-block;margin:30px 0 0 6px;font-size:${TEXT.subtitlePx}px;font-weight:400;color:${TEXT.subtitleColor};letter-spacing:0.005em;line-height:1}
  </style></head><body><img class="bg" src="data:image/png;base64,${canvasPng.toString("base64")}"><div class="fade"></div>
  <div class="text"><h1>Fractal Atlas</h1><p>Explore ${count} fractals, zoom deep</p></div></body></html>`;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  try {
    await page.setContent(html);
    await page.waitForFunction("document.images[0].complete && document.fonts.status === 'loaded'");
    const shot = await page.screenshot();
    // Opaque RGB, like the 2026-10-10 header (Playwright's PNG carries an alpha channel).
    const png = PNG.sync.read(shot);
    const rgb = new PNG({ width: W, height: H, colorType: 2, inputHasAlpha: false });
    for (let i = 0, j = 0; i < png.data.length; i += 4, j += 4) {
      rgb.data[j] = png.data[i]; rgb.data[j + 1] = png.data[i + 1]; rgb.data[j + 2] = png.data[i + 2]; rgb.data[j + 3] = 255;
    }
    return PNG.sync.write(rgb, { colorType: 2, inputColorType: 6 });
  } finally {
    await page.close();
  }
}

const server = await startServer();
const browser = await webkit.launch();
try {
  const { png, count } = await renderCanvas(browser);
  const header = await compose(browser, png, count);
  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(OUT)) copyFileSync(OUT, `${OUT}.bak`);
  writeFileSync(OUT, header);
  console.log(`${OUT}: "${SEARCH ? `Zoom into ${count} fractals` : `Explore ${count} fractals, zoom deep`}"`);
} finally {
  await browser.close();
  server.kill();
}
