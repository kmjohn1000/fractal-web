// Stamps sw.js's CACHE_NAME with a hash of the app shell (every file in
// its APP_SHELL list), so any change to an app file also changes sw.js.
// The browser only re-installs a service worker when sw.js's own bytes
// change; with the name tied to the content, a phone's installed PWA gets
// a fresh worker and a freshly filled cache with every deploy that changes
// the app, on top of sw.js's network-first fetches.
//
//   npm run stamp:sw            rewrite CACHE_NAME if it's out of date
//
// tests/visual/sw.spec.mjs fails when the stamp is stale.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const SW = join(root, "sw.js");
const CACHE_NAME_RE = /^const CACHE_NAME = "([^"]*)";$/m;

// APP_SHELL's entries as repo paths ("./" is index.html, listed separately).
export function appShellFiles() {
  const list = readFileSync(SW, "utf8").match(/^const APP_SHELL = \[([\s\S]*?)\];/m);
  if (!list) throw new Error("sw.js: no APP_SHELL list");
  return [...list[1].matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]).filter((p) => p !== "");
}

export function appShellHash() {
  const hash = createHash("sha256");
  for (const file of [...appShellFiles()].sort()) {
    hash.update(file + "\0");
    hash.update(readFileSync(join(root, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

export const expectedCacheName = () => `fractal-atlas-${appShellHash()}`;

export function currentCacheName() {
  const m = readFileSync(SW, "utf8").match(CACHE_NAME_RE);
  if (!m) throw new Error("sw.js: no CACHE_NAME line");
  return m[1];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const want = expectedCacheName();
  if (currentCacheName() === want) {
    console.log(`sw.js: CACHE_NAME already ${want}`);
  } else {
    writeFileSync(SW, readFileSync(SW, "utf8").replace(CACHE_NAME_RE, `const CACHE_NAME = "${want}";`));
    console.log(`sw.js: CACHE_NAME -> ${want}`);
  }
}
