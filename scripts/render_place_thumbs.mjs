// Renders the Places sheet's thumbnails into icons/places/<id>.webp: each named place
// (TELEPORT_DESTINATIONS) as it lands on an iPhone-shaped screen, cropped to the square that
// spans the screen's width (the places are framed to fit a portrait phone's width) at
// 160 px, with all 16 sharpening passes. Re-run after adding or moving a place:
//
//   node scripts/render_place_thumbs.mjs            all places
//   node scripts/render_place_thumbs.mjs --missing  only places without a file yet
//   node scripts/render_place_thumbs.mjs "Nova"     places whose id contains the text
//
// Headless Chromium from Playwright (no downloads), four pages at a time. Exits non-zero if
// any place fails to settle or comes out blank.

/* global document, window, requestAnimationFrame, TELEPORT_DESTINATIONS, placeId */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { chromium } from "@playwright/test";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "icons/places");
const SIZE = 160; // px: 2x a 64 pt tile, plus a little
const PAGES = 4;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };

const args = process.argv.slice(2);
const missingOnly = args.includes("--missing");
const filter = args.find((a) => !a.startsWith("--"));

const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html";
  if (path.startsWith("..")) { res.writeHead(403).end(); return; }
  try {
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(join(root, path)));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const appUrl = `http://127.0.0.1:${server.address().port}/index.html`;

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", timeout: 60_000 });
let failures = 0;
try {
  const probe = await browser.newPage();
  await probe.goto(appUrl);
  const places = await probe.evaluate(() => TELEPORT_DESTINATIONS.map((d, i) => ({ i, id: placeId(d), label: d.label })));
  await probe.close();
  const todo = places.filter((p) => (!filter || p.id.includes(filter.toLowerCase())) && (!missingOnly || !existsSync(join(outDir, `${p.id}.webp`))));
  const ids = new Set(places.map((p) => p.id));
  if (ids.size !== places.length) throw new Error("two places share an id (placeId): rename one");
  console.log(`${todo.length} of ${places.length} places to render`);

  let next = 0;
  const worker = async () => {
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, serviceWorkers: "block",
    });
    await context.addInitScript(() => {
      try {
        localStorage.setItem("fractalAtlas.visited", "1");
        localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
        localStorage.setItem("fractalAtlas.deepPasses", "16");
      } catch { /* storage blocked */ }
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => console.error(`page error: ${e.message}`));
    await page.goto(appUrl);
    await page.addScriptTag({ path: join(root, "tests/driver.js") });
    await page.addStyleTag({ content: "#speedBubble, .compass, #crosshair { visibility: hidden !important; }" });
    const cdp = await context.newCDPSession(page);
    const settle = () => page.waitForFunction(() => window["__vt"].settled(), null, { timeout: 120_000, polling: 100 });
    await settle();
    while (next < todo.length) {
      const p = todo[next++];
      try {
        await page.evaluate((i) => window["__vt"].place(i), p.i);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await settle();
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const r = await page.evaluate(() => {
          const c = [...document.querySelectorAll("#canvasArea canvas")].find((el) => el.offsetWidth > 0).getBoundingClientRect();
          return { x: c.x, y: c.y, w: c.width, h: c.height };
        });
        const side = Math.min(r.w, r.h);
        const shot = await cdp.send("Page.captureScreenshot", {
          format: "webp", quality: 82,
          clip: { x: r.x + (r.w - side) / 2, y: r.y + (r.h - side) / 2, width: side, height: side, scale: SIZE / side },
        });
        const bytes = Buffer.from(shot.data || "", "base64");
        if (!bytes.length) throw new Error("empty screenshot");
        // A flat frame compresses to a few hundred bytes; real detail is several KB.
        if (bytes.length < 1500) throw new Error(`looks blank (${bytes.length} bytes)`);
        writeFileSync(join(outDir, `${p.id}.webp`), bytes);
        console.log(`${p.id}.webp  ${(bytes.length / 1024).toFixed(1)} KB`);
      } catch (err) {
        failures++;
        console.error(`${p.id}: ${err.message}`);
      }
    }
    await context.close();
  };
  await Promise.all(Array.from({ length: Math.min(PAGES, todo.length) }, worker));
} finally {
  await browser.close();
  server.close();
}
if (failures) {
  console.error(`${failures} place(s) failed`);
  process.exitCode = 1;
}
