// App Store screenshots for the listing; used by the /release command.
// Renders the web build in headless WebKit (the engine of the iOS app's
// WKWebView) at each App Store Connect slot's exact pixel size, and saves
// the six listing shots as bare app screens (no caption, background or
// device frame: captioned versions are separate promo assets) to
//
//   node scripts/store-screenshots.mjs <outDir> [shotName ...]
//       -> <outDir>/<slot>/<shot>.png, e.g. appstore-screenshots/1.37.0/app
//
// Each shot puts the app in its state the way tests/driver.js does (no
// Surprise-me flight), then waits for the frame to finish refining. Fails on
// a wrong pixel size, a page error, the error banner or a lost WebGL context.
import { webkit } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";

const root = new URL("..", import.meta.url).pathname;
const PORT = 8745;
const DRIVER = join(root, "tests/driver.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// App Store Connect's slots, as of 2026-10-15: the iPhone slot ("Dynamic
// Island, medium display") takes only 1206x2622 or 1179x2556 and rejected
// 6.5" 1284x2778; the iPad 13" slot takes 2064x2752, and 2048x2732 (12.9")
// is kept as a spare.
const SLOTS = [
  { slot: "iphone-6.3", width: 402, height: 874, dpr: 3 },
  { slot: "ipad-13", width: 1032, height: 1376, dpr: 2 },
  { slot: "ipad-12.9", width: 1024, height: 1366, dpr: 2 },
];

// In-page helpers, added as a classic <script> after tests/driver.js so they
// see app.js's top-level declarations. land() is a Surprise-me landing as
// __vt.place leaves it, plus the landing index the info card reads its
// place name from.
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
    requestRender();
  },
  solidColor(modeKey, name) {
    vectorColors[modeKey] = SOLID_COLORS.findIndex((c) => c.name === name);
    updateColorSwatches(); requestRender();
  },
};
`;

// The listing's six shots (the 1.30.0 set). Each step is page-context code
// or a toolbar click; the app settles after every step.
const SHOTS = [
  { name: "1-deep-zoom", steps: ["__store.land('Mandelbrot', 'Mini Mandelbrot'); __store.colormap('Inferno')", "#hudBtn"] },
  { name: "2-picker", steps: ["__store.land('Mandelbrot', 'Seahorse Valley'); __store.colormap('Plasma')", ".fractalMenuBtn"] },
  { name: "3-julia-dual", steps: ["__vt.fractal('Julia:Spiral'); __store.colormap('Turbo')", "#hudBtn", "#dualBtn"] },
  { name: "4-tricorn", steps: ["__store.land('Tricorn', 'Lace Tricorn'); __store.colormap('Twilight')", "#hudBtn"] },
  { name: "5-burning-ship", steps: ["__store.land('Burn. Ship', 'Armada'); __store.colormap('Fire')", "#hudBtn"] },
  { name: "6-pattern-play", steps: ["__vt.mode('tree'); __store.solidColor('tree', 'Autumn')"] },
];

// Timer-driven overlays (rotation compass, crosshair flash, speed bubble),
// hidden as in the visual suite.
const HIDE_TRANSIENTS = "#speedBubble, .compass, #crosshair { visibility: hidden !important; }";

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

async function shoot(browser, size, shot, file) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.dpr, isMobile: true, hasTouch: true, serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.addScriptTag({ path: DRIVER });
    await page.addScriptTag({ content: HELPERS });
    await page.addStyleTag({ content: HIDE_TRANSIENTS });
    await waitSettled(page);
    for (const step of shot.steps) {
      if (/^[#.]/.test(step)) await page.locator(`${step}:visible`).first().click();
      else await page.evaluate(step);
      await waitSettled(page);
      await sleep(600); // panel and picker transitions
    }
    await waitSettled(page);
    const png = await page.screenshot({ path: file, animations: "disabled", caret: "hide" });
    const { width, height } = PNG.sync.read(png);
    const state = await page.evaluate("window.__vt.inspect()");
    const problems = [
      width !== size.width * size.dpr || height !== size.height * size.dpr ? `size ${width}x${height}` : "",
      errors.length ? `page errors: ${errors.join("; ")}` : "",
      state.error ? `error banner: ${state.error}` : "",
      state.contextLost || state.contextLostEvents ? "WebGL context lost" : "",
    ].filter(Boolean);
    return { width, height, problems };
  } finally {
    await context.close();
  }
}

const [out, ...only] = process.argv.slice(2);
if (!out) {
  console.error("usage: node scripts/store-screenshots.mjs <outDir> [shotName ...]");
  process.exit(2);
}
const outDir = resolve(out);
const shots = SHOTS.filter((s) => !only.length || only.some((o) => s.name.startsWith(o)));
const server = await startServer();
const browser = await webkit.launch();
let failed = 0;
try {
  for (const size of SLOTS) {
    mkdirSync(join(outDir, size.slot), { recursive: true });
    for (const shot of shots) {
      const r = await shoot(browser, size, shot, join(outDir, size.slot, `${shot.name}.png`));
      if (r.problems.length) failed++;
      console.log(`${r.problems.length ? "BAD" : "ok "} ${size.slot} ${shot.name}: ${r.width}x${r.height}${r.problems.length ? ` (${r.problems.join(", ")})` : ""}`);
    }
  }
} finally {
  await browser.close();
  server.kill();
}
if (failed) {
  console.error(`${failed} screenshot(s) failed their checks`);
  process.exit(1);
}
