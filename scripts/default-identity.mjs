// Gate G1 for the coloring styles work: with the default style (Smooth,
// bands 1, shift 0) every state must render exactly as before the work.
//
//   node scripts/default-identity.mjs record   render the states, save them as the reference
//   node scripts/default-identity.mjs check    render them again and count differing pixels
//
// The reference PNGs go to tests/baselines/identity/ (git-ignored, local to
// this Mac like the suite's baselines; GPU output differs between machines).
// "check" exits non-zero on any differing pixel: a hard zero, stricter than
// the visual suite's 1%. States cover each fractal type's shallow path, the
// perturbation, Newton fixed-point and Phoenix fixed-point deep paths, and
// dual view; each is rendered fully refined (16 samples) in Chromium on the
// GPU, as the suite does. An extra `--only <substring>` limits the states.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

const root = new URL("..", import.meta.url).pathname;
const DIR = join(root, "tests/baselines/identity");
const DRIVER = join(root, "tests/driver.js");
const PORT = 8747;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Page-context snippets, run through the in-page tests/driver.js helpers.
const place = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;
const STATES = [
  ["mandelbrot-open", `__vt.fractal("Mandelbrot")`],
  ["ship-open", `__vt.fractal("Burn. Ship")`],
  ["tricorn-open", `__vt.fractal("Tricorn")`],
  ["celtic-open", `__vt.fractal("Celtic")`],
  ["multibrot-open", `__vt.fractal("Multibrot³")`],
  ["phoenix-open", `__vt.fractal("Phoenix")`],
  ["julia-rabbit-open", `__vt.fractal("Julia:Rabbit")`],
  ["julia-phoenix-open", `__vt.fractal("Julia:Phoenix")`],
  ["newton-open", `__vt.fractal("Newton z³")`],
  ["carpet-open", `__vt.fractal("Carpet")`],
  ["gasket-open", `__vt.fractal("Gasket")`],
  ["apollonian-open", `__vt.fractal("Apollonian")`],
  ["mandelbrot-seahorse-deep", place("Seahorse Valley")],
  ["mandelbrot-minibrot-deep", place("Mini Mandelbrot")],
  ["ship-twin-ships", place("Twin Ships")],
  ["celtic-halo-bell-deep", place("Halo Bell")],
  ["tricorn-lace-deep", place("Lace Tricorn")],
  ["multibrot-spiral-galaxy", place("Spiral Galaxy")],
  ["phoenix-whirlpool", place("Whirlpool")],
  ["julia-phoenix-ember-spiral", place("Ember Spiral")],
  // Phoenix's own deep path (float32 perturbation + fixed point) starts below 1e-4.
  ["phoenix-deep", `${place("Whirlpool")}; Object.assign(mainState, { scale: 1e-7 }); requestRender()`],
  ["julia-phoenix-deep", `${place("Ember Spiral")}; Object.assign(mainState, { scale: 5e-7 }); requestRender()`],
  ["newton-deep-necklace", place("Deep Necklace")],
  ["julia-rabbit-hole", place("Rabbit Hole")],
  ["dual-mandelbrot-open", `__vt.fractal("Mandelbrot"); enterDual()`],
  ["dual-mandelbrot-spiral", `${place("Spiral Cluster")}; enterDual()`],
];

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
  await page.waitForFunction("window.__vt.settled()", null, { timeout: 90_000, polling: 100 });
  await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
}

async function render(browser, snippet) {
  const context = await browser.newContext({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
      // The reference has all 16 sharpening passes; deep views stop at 8 by default (DEEP_PASSES in render-layout.js).
      localStorage.setItem("fractalAtlas.deepPasses", "16");
    } catch { /* storage blocked */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/index.html`);
    await page.addScriptTag({ path: DRIVER });
    await page.addStyleTag({ content: "#speedBubble, .compass, #crosshair { visibility: hidden !important; }" });
    await waitSettled(page);
    await page.evaluate(snippet);
    await waitSettled(page);
    await sleep(300);
    const png = await page.locator("#canvasArea").screenshot({ animations: "disabled" });
    const path = await page.evaluate("lastMainDeepPath");
    const state = await page.evaluate("window.__vt.inspect()");
    if (errors.length || state.error || state.contextLost) throw new Error(`page problem: ${errors.join("; ")} ${state.error || ""}`);
    return { png, path };
  } finally {
    await context.close();
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd !== "record" && cmd !== "check") {
  console.error("usage: node scripts/default-identity.mjs record|check [--only substring]");
  process.exit(2);
}
const only = rest[0] === "--only" ? rest[1] : "";
mkdirSync(DIR, { recursive: true });
const server = await startServer();
const browser = await chromium.launch({ channel: "chromium" });
let bad = 0;
try {
  for (const [name, snippet] of STATES) {
    if (only && !name.includes(only)) continue;
    const { png, path } = await render(browser, snippet);
    const file = join(DIR, `${name}.png`);
    if (cmd === "record" || !existsSync(file)) {
      writeFileSync(file, png);
      console.log(`${cmd === "record" ? "recorded" : "NEW (no reference)"} ${name} [${path || "float32"}]`);
      if (cmd === "check") bad++;
      continue;
    }
    const a = PNG.sync.read(readFileSync(file)), b = PNG.sync.read(png);
    let diff = -1;
    if (a.width === b.width && a.height === b.height) {
      diff = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) diff++;
      }
    }
    if (diff !== 0) { bad++; writeFileSync(join(DIR, `${name}.actual.png`), png); }
    console.log(`${diff === 0 ? "ok  " : "DIFF"} ${name} [${path || "float32"}] ${diff < 0 ? "size changed" : `${diff} differing pixels`}`);
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(cmd === "check" ? (bad ? `FAILED: ${bad} state(s) differ` : "all states identical") : "recorded");
process.exit(bad ? 1 : 0);
