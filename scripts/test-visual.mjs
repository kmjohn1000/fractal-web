// `npm run test:visual`: runs the Playwright visual suite
// (playwright.config.mjs) with the leftovers of dead runs cleaned up before
// and after, and stdin closed so nothing can ever sit waiting for input
// (the git pre-push hook runs this). Extra arguments go to
// `playwright test`, e.g.
//
//   npm run test:visual -- --project=webkit-iphone15 -g Seahorse
//   npm run test:visual -- --update-snapshots   (only for intentional changes)
//
// Only ORPHANED processes are killed (parent pid 1: their runner is gone),
// so another session's live run, or a Playwright browser some other tool is
// driving, is never touched; several sessions can run the suite at once
// (give each its own PW_PORT, see playwright.config.mjs). Matches are
// Playwright's own browser builds (ms-playwright/), never the everyday
// Chrome.
import { spawn, spawnSync } from "node:child_process";

const LEFTOVERS = [
  "ms-playwright/",                   // Playwright's Chromium/WebKit builds
  "/playwright test",                 // a runner left behind by an interrupted run
  "tests/serve.mjs",                  // the suite's static server
  "--remote-debugging-port=9334",     // scripts/render_thumbs.mjs's headless Chrome
];

function orphanedLeftovers() {
  const table = spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" }).stdout || "";
  const pids = [];
  for (const line of table.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m && Number(m[2]) === 1 && LEFTOVERS.some((pattern) => m[3].includes(pattern))) pids.push(Number(m[1]));
  }
  return pids;
}

function killLeftovers() {
  // Killing a parent orphans its children, so sweep again until none are left.
  for (let pass = 0; pass < 4; pass++) {
    const pids = orphanedLeftovers();
    if (!pids.length) return;
    for (const pid of pids) {
      try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
    }
    spawnSync("sleep", ["0.5"]);
  }
}

killLeftovers();
const run = spawn("npx", ["--no-install", "playwright", "test", ...process.argv.slice(2)], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, PLAYWRIGHT_HTML_OPEN: "never" },
});
// Ctrl-C and friends reach Playwright, which closes its own browsers and
// server; the sweep below then catches anything it left.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => run.kill(signal));
run.on("error", (error) => { throw error; });
run.on("exit", (code, signal) => {
  killLeftovers();
  process.exit(code ?? (signal ? 128 + ({ SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[signal] ?? 1) : 1));
});
