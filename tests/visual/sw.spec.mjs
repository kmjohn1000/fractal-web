// Freshness stamps (see scripts/stamp.mjs): CACHE_NAME must change whenever
// an app file does, the version in CHANGELOG.md must be carried into
// package.json and index.html's ?v= queries, and APP_SHELL must list every
// file the page loads, or that file would neither be cached for offline
// use nor counted in the stamp. Plain file checks: runs in one project only.
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { appShellFiles, assetVersions, changelogVersion, currentCacheName, expectedCacheName, importVersions, moduleFiles, packageVersions } from "../../scripts/stamp.mjs";

const root = new URL("../..", import.meta.url).pathname;
const STALE = "run `npm run stamp` and commit what it changes";

test("CACHE_NAME matches the current app files", () => {
  expect(currentCacheName(), `app files changed since sw.js was stamped: ${STALE}`).toBe(expectedCacheName());
});

test("package.json and index.html carry the CHANGELOG version", () => {
  const v = changelogVersion();
  expect(packageVersions(), STALE).toEqual({ package: v, lock: v });
  expect(assetVersions().filter((a) => a.v !== v), `assets without ?v=${v}: ${STALE}`).toEqual([]);
});

test("every relative import in the module files carries the CHANGELOG version, and the files are in APP_SHELL", () => {
  const v = changelogVersion();
  const imports = importVersions();
  expect(imports.length, "no imports found: is the module graph being followed?").toBeGreaterThan(0);
  expect(imports.filter((i) => i.v !== v).map((i) => `${i.file}: ${i.spec}`), `imports without ?v=${v}: ${STALE}`).toEqual([]);
  const shell = new Set(appShellFiles());
  expect(moduleFiles().filter((f) => !shell.has(f))).toEqual([]);
});

test("every APP_SHELL file exists", () => {
  const missing = appShellFiles().filter((f) => !existsSync(join(root, f)));
  expect(missing).toEqual([]);
});

test("APP_SHELL lists every local file index.html loads", () => {
  const shell = new Set(appShellFiles());
  expect(assetVersions().map((a) => a.file.replace(/^\.\//, "")).filter((f) => !shell.has(f))).toEqual([]);
});

test.describe("offline", () => {
  test.use({ serviceWorkers: "allow" });

  test("the installed web app starts with no network", async ({ page, context }) => {
    await page.goto("index.html");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the worker, which caches what loads
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => typeof window.selectFractal === "function");
    expect(await page.locator("#errorBanner").isHidden()).toBe(true);
    await context.setOffline(false);
  });
});
