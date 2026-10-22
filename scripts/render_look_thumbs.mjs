// Renders the Color sheet's Look swatches into one sprite, icons/looks/sprite.webp
// (COLOR_LOOKS in order, each SIZE px square, side by side): the
// app itself (headless Chromium on the GPU), one fixed view, each Look's
// style, palette and bands and shift, the canvas squared and encoded by the
// canvas itself. Re-run after changing COLOR_LOOKS in app.js, a style's look,
// or a palette:
//
//   node scripts/render_look_thumbs.mjs
//
// The Looks are read from app.js, so a new Look gets a swatch without
// editing this file.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "icons/looks");
const PORT = 8750;
const SIZE = 192; // px per swatch: 3x the 64 px swatch the sheet shows, so it's sharp on a 3x phone
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Seahorse Valley at 6e-3 (233x deep) shows every style well, the orbit traps
// included now that their colormap range is set per view.
const VIEW = { cx: -0.743643887037151, cy: 0.131825904205330, scale: 6e-3, maxIter: 770 };

const src = readFileSync(join(root, "app.js"), "utf8");
const m = src.match(/^const COLOR_LOOKS = \[[\s\S]*?\n\];/m);
if (!m) throw new Error("render_look_thumbs: couldn't find COLOR_LOOKS in app.js");
const ctx = vm.createContext({});
vm.runInContext(`${m[0]}; globalThis.out = COLOR_LOOKS;`, ctx);
const looks = ctx.out.map((l) => ({ density: 1, offset: 0, ...l }));

const server = spawn("node", [join(root, "tests/serve.mjs"), String(PORT)], { stdio: "ignore" });
for (let i = 0; i < 50; i++) {
  if (await fetch(`http://127.0.0.1:${PORT}/index.html`).then((r) => r.ok, () => false)) break;
  await sleep(100);
}
const browser = await chromium.launch({ channel: "chromium" });
mkdirSync(outDir, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: SIZE, height: 900 }, deviceScaleFactor: 1, serviceWorkers: "block" });
  await context.addInitScript(() => {
    try { localStorage.setItem("fractalAtlas.visited", "1"); localStorage.setItem("fractalAtlas.welcomeDismissed", "1"); } catch { /* storage blocked */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/index.html`);
  await page.addScriptTag({ path: join(root, "tests/driver.js") });
  const settle = async () => {
    await page.waitForFunction("window.__vt.settled()", null, { timeout: 90_000, polling: 100 });
    await page.evaluate("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
  };
  await settle();
  const shots = [];
  // The canvas is the viewport minus the toolbar: make it SIZE x SIZE.
  const toolbarH = await page.evaluate("window.__vt.inspect().controls.h");
  await page.setViewportSize({ width: SIZE, height: Math.round(SIZE + toolbarH) });
  await page.addStyleTag({ content: "#speedBubble, .compass, #crosshair, #hud { visibility: hidden !important; }" });
  for (const look of looks) {
    await page.evaluate(`(() => {
      __vt.fractal("Mandelbrot", COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(look.palette)}));
      Object.assign(mainState, { cx: ${VIEW.cx}, cy: ${VIEW.cy}, scale: ${VIEW.scale}, rotation: 0, maxIter: ${VIEW.maxIter}, iterAutoLocked: true });
      setColorStyle({ style: ${JSON.stringify(look.style)}, density: ${look.density}, offset: ${look.offset} });
      requestRender();
    })()`);
    await settle();
    await sleep(200);
    const box = await page.evaluate(`(() => { const r = document.getElementById("mainCanvas").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
    if (Math.round(box.w) !== SIZE || Math.round(box.h) !== SIZE) throw new Error(`canvas is ${box.w}x${box.h}, not ${SIZE}x${SIZE}`);
    const drawn = await page.evaluate("colorStyleFor(mainState).glsl");
    const wanted = await page.evaluate(`COLOR_STYLES.find((s) => s.id === ${JSON.stringify(look.style)}).glsl`);
    if (drawn !== wanted) throw new Error(`${look.id}: the view draws style ${drawn}, not ${wanted}`);
    // The canvas keeps its frame (preserveDrawingBuffer), so it encodes itself.
    const url = await page.evaluate(`document.getElementById("mainCanvas").toDataURL("image/png")`);
    if (!url.startsWith("data:image/png")) throw new Error("this browser can't encode PNG");
    shots.push(url);
    console.log(look.id);
  }
  // One sprite, in the order of COLOR_LOOKS (the app shows tile i from
  // i * SIZE px across), so the sheet asks for one file, not one per Look.
  const sprite = await page.evaluate(`(async (urls, size) => {
    const out = document.createElement("canvas");
    out.width = urls.length * size; out.height = size;
    const ctx = out.getContext("2d");
    for (let i = 0; i < urls.length; i++) {
      const img = new Image();
      img.src = urls[i];
      await img.decode();
      ctx.drawImage(img, i * size, 0, size, size);
    }
    return out.toDataURL("image/webp", 0.9);
  })(${JSON.stringify(shots)}, ${SIZE})`);
  if (!sprite.startsWith("data:image/webp")) throw new Error("this browser can't encode WebP");
  writeFileSync(join(outDir, "sprite.webp"), Buffer.from(sprite.split(",")[1], "base64"));
  console.log(`sprite.webp: ${looks.length} swatches of ${SIZE}px`);
  if (errors.length) throw new Error(`page errors: ${errors.join("; ")}`);
} finally {
  await browser.close();
  server.kill();
}
