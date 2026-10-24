// Renders the fractal picker's thumbnails into icons/thumbs/<slug>.webp:
// opens the app in headless Chrome, picks each entry from the picker,
// resizes the window so the canvas is square, resets to the default view
// and screenshots the canvas. Re-run after adding a fractal or changing a
// default view or colormap:
//
//   node scripts/render_thumbs.mjs
//
// No dependencies: a built-in static server plus the Chrome DevTools
// protocol. Set CHROME=/path/to/chrome if Chrome isn't in /Applications.
// Prints one "file  N.N KB" line per tile and a final count; exits non-zero
// with a message if no picker tiles appear, a tile has no img, or a
// screenshot is empty.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const outDir = join(root, "icons/thumbs");
const SIZE = 192; // px: 2x a ~96px tile
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9334;
const WIDTH = 480;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".webmanifest": "application/manifest+json" };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html";
  let body;
  try {
    body = readFileSync(join(root, path));
  } catch {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" });
  res.end(body);
}).listen(0);
const appUrl = `http://localhost:${server.address().port}/`;

const profile = mkdtempSync(join(tmpdir(), "thumbs-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
chrome.once("error", (err) => {
  console.error(`render_thumbs failed: couldn't start Chrome (${CHROME}): ${err.message}`);
  rmSync(profile, { recursive: true, force: true });
  process.exit(1);
});

let ws;
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`).then((r) => r.json()).catch(() => null);
  }
  const page = targets?.find((t) => t.type === "page");
  if (!page) throw new Error(`Chrome's DevTools endpoint on port ${DEBUG_PORT} didn't come up (is ${CHROME} installed, and the port free?)`);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;
  const setHeight = (height) => send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height, deviceScaleFactor: 1, mobile: false });

  await setHeight(640);
  // A return visitor who closed the welcome card: no cold-open flight and no
  // card over the thumbnails.
  await send("Page.enable"); // without it the script below never ran (the card showed over the thumbs)
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { localStorage.setItem("fractalAtlas.visited", "1"); localStorage.setItem("fractalAtlas.welcomeDismissed", "1"); } catch {}`,
  });
  await send("Page.navigate", { url: appUrl });
  // The app's ~25 script files and the software-GL start-up keep the page busy
  // for 3-4 s, so wait for the picker to build instead of sleeping a fixed time.
  const TILE_SELECTOR = "#fractalTypeRow .pickTile";
  let count = 0;
  for (let i = 0; i < 150 && !count; i++) {
    await sleep(200);
    count = (await evaluate(`document.querySelectorAll(${JSON.stringify(TILE_SELECTOR)}).length`).catch(() => 0)) || 0;
  }
  if (!count) {
    const state = await evaluate(`document.readyState + ", url " + location.href`).catch(() => "unreachable");
    throw new Error(`no picker tiles (${TILE_SELECTOR}) after 30 s; page state: ${state}`);
  }

  const tiles = await evaluate(`[...document.querySelectorAll(${JSON.stringify(TILE_SELECTOR)})].map((b) => ({
    selector: b.dataset.name ? '[data-name="' + CSS.escape(b.dataset.name) + '"]' : '[data-mode="' + b.dataset.mode + '"]',
    file: b.querySelector("img")?.getAttribute("src")?.split("/").pop() || null,
    ifs: isIfsMode(b.dataset.mode),
  }))`);
  if (!Array.isArray(tiles) || !tiles.length) throw new Error("tile query returned no tiles");
  const noImg = tiles.filter((t) => !t.file);
  if (noImg.length) throw new Error(`${noImg.length} tile(s) have no img src: ${noImg.map((t) => t.selector).join(", ")}`);
  mkdirSync(outDir, { recursive: true });

  let written = 0;
  for (const t of tiles) {
    await evaluate(`document.querySelector('#fractalTypeRow ${t.selector}').click()`);
    await sleep(300);
    // Make the visible canvas square (toolbar height varies by mode), then
    // reset so the default view is fitted to that square.
    const canvasRect = `(() => { const r = [...document.querySelectorAll("#canvasArea canvas")].find((c) => c.offsetWidth > 0).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`;
    let r = await evaluate(canvasRect);
    await setHeight(Math.round(640 + (r.w - r.h)));
    await sleep(300);
    await evaluate(`[...document.querySelectorAll('#controls .control-row:not(.hidden) button[id$="esetBtn"]')].find((b) => b.offsetWidth > 0).click()`);
    if (t.ifs) {
      // IFS modes fill in their points progressively: wait until done.
      for (let i = 0; i < 100 && !(await evaluate("fernView.accepted >= fernState.count")); i++) await sleep(200);
      await sleep(300);
    } else {
      await sleep(2500);
    }
    r = await evaluate(canvasRect);
    const side = Math.min(r.w, r.h);
    const shot = await send("Page.captureScreenshot", {
      format: "webp", quality: 82,
      clip: { x: r.x + (r.w - side) / 2, y: r.y + (r.h - side) / 2, width: side, height: side, scale: SIZE / side },
    });
    const png = Buffer.from(shot.data || "", "base64");
    if (!png.length) throw new Error(`empty screenshot for ${t.file}`);
    writeFileSync(join(outDir, t.file), png);
    written++;
    console.log(`${t.file}  ${(png.length / 1024).toFixed(1)} KB`);
  }
  console.log(`${written} of ${tiles.length} thumbnails written to ${outDir}`);
} catch (err) {
  console.error(`render_thumbs failed: ${err?.message || err}`);
  process.exitCode = 1;
} finally {
  ws?.close();
  server.close();
  // Chrome keeps writing to its profile while it shuts down, so wait for it
  // to exit before deleting the profile.
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await Promise.race([exited, sleep(5000)]);
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
