// Service-worker freshness: CACHE_NAME must change whenever an app file
// does (see scripts/stamp-sw.mjs), and APP_SHELL must list every file the
// page loads, or that file would neither be cached for offline use nor
// counted in the stamp. Plain file checks: runs in one project only.
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appShellFiles, currentCacheName, expectedCacheName } from "../../scripts/stamp-sw.mjs";

const root = new URL("../..", import.meta.url).pathname;

test("CACHE_NAME matches the current app files", () => {
  expect(currentCacheName(), "app files changed since sw.js was stamped: run `npm run stamp:sw` and commit sw.js")
    .toBe(expectedCacheName());
});

test("every APP_SHELL file exists", () => {
  const missing = appShellFiles().filter((f) => !existsSync(join(root, f)));
  expect(missing).toEqual([]);
});

test("APP_SHELL lists every local file index.html loads", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const refs = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1].split(/[?#]/)[0].replace(/^\.\//, ""))
    .filter((u) => !/^(?:[a-z]+:|\/\/)/i.test(u));
  const shell = new Set(appShellFiles());
  expect(refs.filter((r) => !shell.has(r))).toEqual([]);
});
