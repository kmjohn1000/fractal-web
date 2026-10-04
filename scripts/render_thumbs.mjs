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

let ws;
try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`).then((r) => r.json()).catch(() => null);
  }
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
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
  await send("Page.navigate", { url: appUrl });
  await sleep(2500);

  const tiles = await evaluate(`[...document.querySelectorAll("#fractalTypeRow .pickTile")].map((b) => ({
    selector: b.dataset.name ? '[data-name="' + CSS.escape(b.dataset.name) + '"]' : '[data-mode="' + b.dataset.mode + '"]',
    file: b.querySelector("img").getAttribute("src").split("/").pop(),
    ifs: isIfsMode(b.dataset.mode),
  }))`);
  mkdirSync(outDir, { recursive: true });

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
    writeFileSync(join(outDir, t.file), Buffer.from(shot.data, "base64"));
    console.log(`${t.file}  ${(shot.data.length * 0.75 / 1024).toFixed(1)} KB`);
  }
} finally {
  ws?.close();
  server.close();
  // Chrome keeps writing to its profile while it shuts down, so wait for it
  // to exit before deleting the profile.
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await Promise.race([exited, sleep(5000)]);
  rmSync(profile, { recursive: true, force: true });
}
