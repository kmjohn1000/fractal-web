// Carries the app version from CHANGELOG.md (its single source, see
// CLAUDE.md) into every tracked place that repeats it, then stamps sw.js:
//
//   - package.json / package-lock.json "version"
//   - ?v=<version> on the files index.html loads, so a browser that isn't
//     going through the service worker (a first visit, a plain tab) can't
//     pair a fresh index.html with an app.js from its HTTP cache (GitHub
//     Pages sends max-age=600)
//   - sw.js's CACHE_NAME, a hash of every APP_SHELL file: the browser only
//     reinstalls a service worker when sw.js's own bytes change, so tying
//     the name to the content gives an installed PWA a fresh worker and
//     cache with every deploy that changes the app.
//
// The iOS build's version and build number come from the same CHANGELOG
// line, via scripts/build-www.mjs (git-ignored ios/version.xcconfig).
//
//   npm run stamp      after any app change or version bump; commit the result
//
// tests/visual/sw.spec.mjs fails when any of these is stale.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const read = (file) => readFileSync(join(root, file), "utf8");
const CACHE_NAME_RE = /^const CACHE_NAME = "([^"]*)";$/m;
// A local script src or link href in index.html (not http:, data:, //...).
const ASSET_RE = /(<(?:script|link)\b[^>]*\b(?:src|href)=")(?![a-z]+:|\/\/)([^"?#]+)(?:\?v=[^"]*)?(")/gi;

export const changelogVersion = () => read("CHANGELOG.md").match(/^## (\d+\.\d+\.\d+)/m)[1];

// APP_SHELL's entries as repo paths ("./" is index.html, listed separately).
export function appShellFiles() {
  const list = read("sw.js").match(/^const APP_SHELL = \[([\s\S]*?)\];/m);
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
  const m = read("sw.js").match(CACHE_NAME_RE);
  if (!m) throw new Error("sw.js: no CACHE_NAME line");
  return m[1];
}

// index.html's local asset references with their ?v= (null if missing).
export function assetVersions() {
  return [...read("index.html").matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(?![a-z]+:|\/\/)([^"?#]+)(?:\?v=([^"]*))?"/gi)]
    .map((m) => ({ file: m[1], v: m[2] ?? null }));
}

export const packageVersions = () => ({
  package: JSON.parse(read("package.json")).version,
  lock: JSON.parse(read("package-lock.json")).version,
});

function writeIfChanged(file, text, what) {
  if (read(file) === text) return;
  writeFileSync(join(root, file), text);
  console.log(`${file}: ${what}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = changelogVersion();
  for (const file of ["package.json", "package-lock.json"]) {
    const json = JSON.parse(read(file));
    json.version = version;
    if (json.packages && json.packages[""]) json.packages[""].version = version;
    writeIfChanged(file, JSON.stringify(json, null, 2) + "\n", `version ${version}`);
  }
  // Order matters: index.html is in APP_SHELL, so it's stamped before the hash.
  writeIfChanged("index.html", read("index.html").replace(ASSET_RE, `$1$2?v=${version}$3`), `assets ?v=${version}`);
  const name = expectedCacheName();
  writeIfChanged("sw.js", read("sw.js").replace(CACHE_NAME_RE, `const CACHE_NAME = "${name}";`), `CACHE_NAME ${name}`);
  console.log(`stamped ${version} (${name})`);
}
