// Gates G2 and G3 for the coloring styles: render a view in the app with a
// style and diff it against the float64 oracle (scripts/oracle/oracle.py).
//
//   node scripts/oracle-compare.mjs                              every gate view x style the app has
//   node scripts/oracle-compare.mjs --views seahorse,rabbit --styles glow,stripes
//   node scripts/oracle-compare.mjs --cmap Plasma --density 2 --shift 0.25
//   node scripts/oracle-compare.mjs --out dir                    also keep app/oracle/diff PNGs there
//
// Each case renders a 360x360 CSS px canvas at device scale 1 in Chromium on
// the GPU (fully refined, 16 samples) and the oracle at 360x360 with 2x2
// samples, then reports:
//   mean    mean absolute difference over all pixels, of 255 (RGB)
//   >40     share of pixels with any channel off by more than 40
//   black   agreement of the "exactly black" masks (interior pixels)
//   esc     mean absolute difference over the oracle's escaped pixels
//   blur    mean absolute difference after averaging 8x8 blocks
// Gates (set from Smooth's noise floor, see tests/README.md): every case
// needs black >= 98% and blur <= 3; the "calm" views (low iteration
// counts, no chaotic filament zones) also need mean <= 5 and >40 <= 4%.
// Smooth against the oracle sets the noise floor: float32 and float64
// orbits drift apart in filament zones and the app averages 16 samples
// where the oracle takes 2x2, so pixel-level differences there are noise.
// Deep views run the app's perturbation path against straight float64.
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const root = new URL("..", import.meta.url).pathname;
const ORACLE = join(root, "scripts/oracle/oracle.py");
const DRIVER = join(root, "tests/driver.js");
const PORT = 8749;
const TILE = 360;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const oracleViews = JSON.parse(spawnSync("python3", ["-I", ORACLE, "views"], { encoding: "utf8" }).stdout);
const GATE_VIEWS = ["mandelbrot", "valley", "ship", "armada", "elephant", "rabbit", "tricorn", "celtic", "multibrot",
  "seahorse", "minibrot", "twinships"];
const views = opt("views", GATE_VIEWS.join(",")).split(",");
const styles = opt("styles", "smooth").split(",");
const cmap = opt("cmap", "Inferno");
const density = Number(opt("density", "1"));
const shift = Number(opt("shift", "0"));
const outDir = opt("out", "");
const trapOverride = opt("trap-from-oracle", "1") === "1";
// --flip 1: draw the Burning Ship views the way the app opens them since 1.44.0
// (flipY: the screen's up is -Im c) and flip the app's picture back before the
// comparison, since the oracle draws +Im up. Without it the Ship views are drawn
// in the old orientation (what a share link without an fl field opens in).
const flip = opt("flip", "0") === "1";
if (outDir) mkdirSync(outDir, { recursive: true });

async function startServer() {
  const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) return server;
    await sleep(100);
  }
  server.kill();
  throw new Error(`the static server didn't start on port ${PORT}`);
}

async function waitSettled(page) {
  await page.waitForFunction("window.__vt.settled()", null, { timeout: 120_000, polling: 100 });
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
}

// Mirrors a PNG top to bottom, in place.
function flipRows(png) {
  const row = png.width * 4;
  const tmp = Buffer.alloc(row);
  for (let y = 0; y < Math.floor(png.height / 2); y++) {
    const a = y * row, b = (png.height - 1 - y) * row;
    png.data.copy(tmp, 0, a, a + row);
    png.data.copy(png.data, a, b, b + row);
    tmp.copy(png.data, b);
  }
}

async function renderApp(browser, v, style) {
  const context = await browser.newContext({ viewport: { width: TILE, height: 900 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.addInitScript(() => {
    try { localStorage.setItem("fractalAtlas.visited", "1"); localStorage.setItem("fractalAtlas.welcomeDismissed", "1"); localStorage.setItem("fractalAtlas.deepPasses", "16"); } catch { /* storage blocked */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.addScriptTag({ path: DRIVER });
    await waitSettled(page);
    // The canvas is the viewport minus the toolbar: make it TILE x TILE.
    const toolbarH = await page.evaluate("window.__vt.inspect().controls.h");
    await page.setViewportSize({ width: TILE, height: Math.round(TILE + toolbarH) });
    await page.addStyleTag({ content: "#speedBubble, .compass, #crosshair, #hud { visibility: hidden !important; }" });
    const cmIndex = `COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(cmap)})`;
    const styleCall = style === "smooth" && density === 1 && shift === 0 ? "" : `
      setColorStyle({ style: ${JSON.stringify(style)}, density: ${density}, offset: ${shift}${trapOverride ? `, trap: ${JSON.stringify(v.trap)}` : ""} });`;
    await page.evaluate(`(() => {
      __vt.fractal(${JSON.stringify(v.fractal)}, ${cmIndex});
      Object.assign(mainState, { cx: ${v.c[0]}, cy: ${v.c[1]}, scale: ${v.s}, rotation: 0, flipY: ${flip && v.ftype === "ship"}, maxIter: ${v.it}, iterAutoLocked: true,
        baseScale: ${v.s} /* so the orbit traps' depth limit doesn't switch them off at deep views */ });${styleCall}
      requestRender();
    })()`);
    await waitSettled(page);
    await sleep(300);
    const png = await page.locator("#mainCanvas").screenshot({ animations: "disabled" });
    const state = await page.evaluate("window.__vt.inspect()");
    const path = await page.evaluate("lastMainDeepPath");
    if (errors.length || state.error || state.contextLost) throw new Error(`page problem: ${errors.join("; ")} ${state.error || ""}`);
    const img = PNG.sync.read(png);
    if (flip && v.ftype === "ship") flipRows(img);
    return { png: img, path };
  } finally {
    await context.close();
  }
}

function oracleRender(view, style) {
  const out = join(outDir || "/tmp", `oracle-${view}-${style}.png`);
  const flipped = flip && oracleViews[view].ftype === "ship"; // the oracle's relief light follows the app's flipped view
  const r = spawnSync("python3", ["-I", ORACLE, "render", view, style, cmap, out, "--density", String(density), "--shift", String(shift),
    "--size", String(TILE), ...(flipped ? ["--flip"] : [])], { encoding: "utf8", maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`oracle failed: ${r.stderr}`);
  return {
    img: PNG.sync.read(readFileSync(out)),
    mask: PNG.sync.read(readFileSync(out.replace(".png", ".mask.png"))),
    info: JSON.parse(r.stdout.trim().split("\n").pop()),
  };
}

// Mean absolute difference of the two images after averaging each BLOCK x
// BLOCK square: float32 and float64 orbits drift apart in the chaotic
// filament zones (and the app takes 16 samples to the oracle's 4), so
// pixel-level differences there are noise, while the color of a region is
// what a style has to get right.
const BLOCK = 8;
const BLUR_GATE = 3; // of 255; Smooth measures 0.16-1.60 over the gate views (see tests/README.md)
// Views whose orbits stay low (no chaotic filament zones at this size), so
// a per-pixel comparison means something there; the rest are judged on the
// blocked average and the black masks only.
const CALM_VIEWS = new Set(["mandelbrot", "ship", "rabbit", "tricorn", "celtic", "multibrot"]);
function blockedDiff(a, b) {
  let sum = 0, count = 0;
  for (let by = 0; by + BLOCK <= a.height; by += BLOCK) {
    for (let bx = 0; bx + BLOCK <= a.width; bx += BLOCK) {
      for (let c = 0; c < 3; c++) {
        let sa = 0, sb = 0;
        for (let y = by; y < by + BLOCK; y++) {
          for (let x = bx; x < bx + BLOCK; x++) { const i = (y * a.width + x) * 4 + c; sa += a.data[i]; sb += b.data[i]; }
        }
        sum += Math.abs(sa - sb) / (BLOCK * BLOCK);
        count++;
      }
    }
  }
  return sum / count;
}

function metrics(app, ora, mask) {
  const n = app.width * app.height;
  let sum = 0, over = 0, blackAgree = 0, escSum = 0, escCount = 0;
  const diff = new PNG({ width: app.width, height: app.height });
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    let worst = 0, d = 0;
    for (let c = 0; c < 3; c++) { const e = Math.abs(app.data[i + c] - ora.data[i + c]); d += e; worst = Math.max(worst, e); }
    sum += d / 3;
    if (worst > 40) over++;
    const aBlack = app.data[i] + app.data[i + 1] + app.data[i + 2] === 0;
    const oBlack = ora.data[i] + ora.data[i + 1] + ora.data[i + 2] === 0;
    if (aBlack === oBlack) blackAgree++;
    if (mask.data[i] > 127) { escSum += d / 3; escCount++; }
    const v = Math.min(255, worst * 4);
    diff.data[i] = diff.data[i + 1] = diff.data[i + 2] = v; diff.data[i + 3] = 255;
  }
  return { mean: sum / n, over: over / n, black: blackAgree / n, esc: escCount ? escSum / escCount : 0,
    blur: blockedDiff(app, ora), diff };
}

const server = await startServer();
const browser = await chromium.launch({ channel: "chromium" });
let failed = 0;
try {
  console.log(`cmap ${cmap}, bands ${density}, shift ${shift}; 360 px tile, app vs float64 oracle`);
  console.log("view         style        path           mean   >40%   black%   esc   blur   verdict");
  for (const view of views) {
    const v = oracleViews[view];
    if (!v) throw new Error(`no oracle view ${view}`);
    const deep = v.s < 1e-3;
    for (const style of styles) {
      const ora = oracleRender(view, style);
      const app = await renderApp(browser, v, style);
      if (app.png.width !== TILE || app.png.height !== TILE) throw new Error(`canvas is ${app.png.width}x${app.png.height}`);
      const m = metrics(app.png, ora.img, ora.mask);
      const calm = CALM_VIEWS.has(view);
      const pass = m.black >= 0.98 && m.blur <= BLUR_GATE && (!calm || (m.mean <= 5 && m.over <= 0.04));
      if (!pass) failed++;
      console.log(`${view.padEnd(12)} ${style.padEnd(12)} ${(app.path || "float32").padEnd(13)} ${m.mean.toFixed(2).padStart(6)} ${(m.over * 100).toFixed(1).padStart(6)} ${(m.black * 100).toFixed(1).padStart(7)} ${m.esc.toFixed(2).padStart(6)} ${m.blur.toFixed(2).padStart(6)}   ${pass ? "ok" : "FAIL"} (${deep ? "deep" : calm ? "calm" : "chaotic"})`);
      if (outDir) {
        writeFileSync(join(outDir, `app-${view}-${style}.png`), PNG.sync.write(app.png));
        writeFileSync(join(outDir, `diff-${view}-${style}.png`), PNG.sync.write(m.diff));
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `FAILED: ${failed} case(s)` : "all cases within the gates");
process.exit(failed ? 1 : 0);
