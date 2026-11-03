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
// Chrome. "Parent pid 1" is not proof of an orphan on macOS, so three things
// that look orphaned are handled with care:
//  - Chrome's crash handlers (chrome_crashpad_handler) detach to pid 1 while
//    their browser is alive: never killed.
//  - WebKit's helper processes (GPU, Networking, WebContent) are launched
//    through launchd, so they have parent pid 1 even in a live run: browsers
//    are swept only when NO other Playwright run is alive on the machine
//    (then every ms-playwright process is certainly stale).
//  - A static server on any port but this run's own may belong to a live run
//    in another checkout: only this run's port is swept.
import { spawn, spawnSync } from "node:child_process";

// The same port the config uses for the suite's server.
const PORT = Number(process.env.PW_PORT || 8744);
// Always swept when orphaned: processes only a dead run leaves behind.
const ORPHAN_LEFTOVERS = [
  "/playwright test",                 // a runner left behind by an interrupted run
  "workerProcessEntry",               // a Playwright worker whose runner died
  "--remote-debugging-port=9334",     // scripts/render_thumbs.mjs's headless Chrome
];
// Swept when orphaned AND no other run is live (see above).
const BROWSER_LEFTOVERS = ["ms-playwright/"]; // Playwright's Chromium/WebKit builds
const KEEP = ["chrome_crashpad_handler"];
// A process like these with a live parent means another run is in progress.
const LIVE_RUN = ["playwright test", "workerProcessEntry"];

function processTable() {
  const table = spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" }).stdout || "";
  const rows = [];
  for (const line of table.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
  }
  return rows;
}

function orphanedLeftovers() {
  const rows = processTable();
  const otherRunIsLive = rows.some((r) => r.ppid !== 1 && r.pid !== process.pid && LIVE_RUN.some((p) => r.command.includes(p)));
  const patterns = [...ORPHAN_LEFTOVERS, ...(otherRunIsLive ? [] : BROWSER_LEFTOVERS)];
  const pids = [];
  for (const { pid, ppid, command } of rows) {
    if (ppid !== 1 || KEEP.some((pattern) => command.includes(pattern))) continue;
    // The port must end the command, so 8744 never matches 87440.
    if (patterns.some((pattern) => command.includes(pattern)) || command.endsWith(`tests/serve.mjs ${PORT}`)) pids.push(pid);
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
