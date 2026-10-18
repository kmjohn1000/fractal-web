// `npm run test:visual`: runs the Playwright visual suite
// (playwright.config.mjs) with leftover test browsers and servers killed
// before and after, and stdin closed so nothing can ever sit waiting for
// input (the git pre-push hook runs this). Extra arguments go to
// `playwright test`, e.g.
//
//   npm run test:visual -- --project=webkit-iphone15 -g Seahorse
//   npm run test:visual -- --update-snapshots   (only for intentional changes)
//
// Only processes this suite (or render_thumbs.mjs) starts are killed:
// Playwright's own browser builds, which live under ms-playwright/, never
// the everyday Chrome.
import { spawnSync } from "node:child_process";

const LEFTOVERS = [
  "ms-playwright/",                   // Playwright's Chromium/WebKit builds
  "/playwright test",                 // a runner left behind by an interrupted run
  "tests/serve.mjs",                  // the suite's static server
  "--remote-debugging-port=9334",     // scripts/render_thumbs.mjs's headless Chrome
];

function killLeftovers() {
  for (const pattern of LEFTOVERS) {
    // Exit status 1 just means nothing matched.
    spawnSync("pkill", ["-f", "--", pattern], { stdio: "ignore" });
  }
}

killLeftovers();
const run = spawnSync("npx", ["--no-install", "playwright", "test", ...process.argv.slice(2)], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, PLAYWRIGHT_HTML_OPEN: "never" },
});
killLeftovers();
if (run.error) throw run.error;
process.exit(run.status ?? 1);
