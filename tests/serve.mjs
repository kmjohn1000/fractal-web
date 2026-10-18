// Static server for the visual tests (playwright.config.mjs starts it).
// No caching, like nocache_server.py, so a rerun always sees edited files.
//
//   node tests/serve.mjs [port]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const port = Number(process.argv[2] || 8744);
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp",
  ".webmanifest": "application/manifest+json", ".json": "application/json", ".svg": "image/svg+xml",
};

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "") || "index.html";
  if (path.startsWith("..")) { res.writeHead(403).end(); return; }
  let body;
  try {
    body = readFileSync(join(root, path));
  } catch {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
