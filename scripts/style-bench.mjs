// Headless frame-time check for the coloring styles: the GPU time of one
// fully refined frame (16 supersample passes, waited out with a pixel
// readback) for a few views, optionally after a page-context setup snippet
// that picks a style.
//
//   node scripts/style-bench.mjs                      defaults (Smooth)
//   node scripts/style-bench.mjs 'setColorStyle("glow")'
//
// Headless Chromium on this Mac's GPU, not a phone: use it to see that
// Smooth at its defaults doesn't regress and what each style adds, never as
// a phone number. Prints the median of 5 runs per view, in ms.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const DRIVER = join(root, "tests/driver.js");
const PORT = 8748;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const place = (label) => `__vt.place(TELEPORT_DESTINATIONS.findIndex((d) => d.label === ${JSON.stringify(label)}))`;
const VIEWS = [
  ["Mandelbrot opening", `__vt.fractal("Mandelbrot")`],
  ["Burning Ship opening", `__vt.fractal("Burn. Ship")`],
  ["Julia: Rabbit opening", `__vt.fractal("Julia:Rabbit")`],
  ["Phoenix opening", `__vt.fractal("Phoenix")`],
  ["Mandelbrot Seahorse 4e-10", place("Seahorse Valley")],
  ["Ship Twin Ships 4.5e-5", place("Twin Ships")],
];

const setup = process.argv[2] || "";
const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
for (let i = 0; i < 50; i++) {
  if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) break;
  await sleep(100);
}
const browser = await chromium.launch({ channel: "chromium" });
try {
  console.log(`setup: ${setup || "(none: defaults)"}`);
  for (const [name, snippet] of VIEWS) {
    const context = await browser.newContext({ viewport: { width: 800, height: 700 }, deviceScaleFactor: 1, serviceWorkers: "block" });
    await context.addInitScript(() => {
      try { localStorage.setItem("fractalAtlas.visited", "1"); localStorage.setItem("fractalAtlas.welcomeDismissed", "1"); } catch { /* storage blocked */ }
    });
    const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${PORT}/index.html`);
      await page.addScriptTag({ path: DRIVER });
      await page.waitForFunction("window.__vt.settled()", null, { timeout: 60_000, polling: 100 });
      await page.evaluate(snippet);
      if (setup) await page.evaluate(setup);
      await page.waitForFunction("window.__vt.settled()", null, { timeout: 90_000, polling: 100 });
      const times = await page.evaluate(`(() => {
        const r = mainRenderer, gl = r.canvas.getContext(r.webgl2 ? "webgl2" : "webgl"), px = new Uint8Array(4);
        const out = [];
        for (let run = 0; run < 5; run++) {
          const t0 = performance.now();
          for (let k = 0; k < 16; k++) r.render(mainState, k);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          out.push(performance.now() - t0);
        }
        return out;
      })()`);
      times.sort((a, b) => a - b);
      console.log(`${name.padEnd(28)} ${times[2].toFixed(1).padStart(8)} ms   (min ${times[0].toFixed(1)}, max ${times[4].toFixed(1)})`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}
