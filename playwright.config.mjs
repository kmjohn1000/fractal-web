// Visual regression suite: `npm run test:visual` (scripts/test-visual.mjs
// wraps this). Every fractal/mode, colormap and Surprise-me place, in
// Chromium and WebKit, at desktop and iPhone 15 sizes; screenshots are
// compared against golden baselines in tests/baselines/<project>/.
import { defineConfig, devices } from "@playwright/test";

// PW_PORT lets several checkouts (git worktrees) run the suite at the same time.
const PORT = Number(process.env.PW_PORT || 8744);
// The "chromium" channel is Chrome's new headless mode, which renders WebGL
// on the GPU (ANGLE on Metal); the default headless shell falls back to
// SwiftShader, which takes over a minute per deep-zoom place.
const chromium = { browserName: "chromium", channel: "chromium" };
// The iPhone 15 descriptor defaults to WebKit; the Chromium project
// reuses its size, scale and touch settings (browserName wins over it).
const iphone15 = devices["iPhone 15"];

export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "tests/baselines/{projectName}/{arg}{ext}",
  outputDir: "test-results/output",
  timeout: 90_000,
  fullyParallel: true,
  workers: 4,
  retries: 0,
  forbidOnly: true,
  // "never": the HTML report must not start a server and wait for Ctrl-C.
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/report" }]],
  expect: {
    toHaveScreenshot: {
      // Per-pixel color tolerance (0-1), then how much of the frame may differ.
      threshold: 0.2,
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    serviceWorkers: "block",
    trace: "off",
    // The baselines were recorded with all 16 sharpening passes. Deep-zoom views
    // now stop at 8 by default (DEEP_PASSES in render-layout.js), so the suite pins 16;
    // deep-passes.spec.mjs clears this to test the default itself.
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${PORT}`, localStorage: [{ name: "fractalAtlas.deepPasses", value: "16" }] }] },
  },
  webServer: {
    command: `node tests/serve.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    stdout: "ignore",
  },
  projects: [
    { name: "chromium-desktop", use: { ...chromium, viewport: { width: 1280, height: 800 } } },
    { name: "chromium-iphone15", testIgnore: /sw\.spec/, use: { ...iphone15, ...chromium } },
    { name: "webkit-desktop", testIgnore: /sw\.spec/, use: { ...devices["Desktop Safari"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit-iphone15", testIgnore: /sw\.spec/, use: { ...devices["iPhone 15"] } },
  ],
});
