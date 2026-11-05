// Smoke check for the build, thumbnail, store and preview scripts, which no spec covers: the
// ES-module conversion once broke render_thumbs.mjs silently. Runs each one headless against a
// scratch folder (SCRIPT_OUT_DIR, which every script below honors) and checks that it exits 0 and
// wrote files that look right (exists, image size, not near-empty).
//
//   npm run smoke:scripts                          all steps, a few minutes
//   npm run smoke:scripts -- --only=build-www,thumbs   just those steps
//   npm run smoke:scripts -- --keep                keep the scratch folder and print its path
//
// Never writes icons/thumbs, icons/places, icons/looks, listing/, store-assets/, www/ or
// ios/version.xcconfig: after the run it compares those paths (file names, sizes, mtimes) with a
// snapshot taken before and fails if anything there changed. Each step runs in its own process
// group with a timeout; on a timeout only that group (what this run started) is killed, never any
// other browser. Not part of `npm run lint`; not part of the visual suite.
//
// Left out: release-ios.mjs (needs Xcode and the simulators), make-short.mjs and
// make-relief-video.mjs (long video renders, not read for this check), style-bench.mjs,
// oracle-compare.mjs and default-identity.mjs (measurement tools, not output scripts).
// The ports the scripts use are fixed (9334 render_thumbs, 8745 store-screenshots, 8746
// store-header and make-preview, 8750 render_look_thumbs), so don't run this beside another
// session's run of the same scripts.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const onlyArg = args.find((a) => a.startsWith("--only="));
const only = onlyArg ? onlyArg.slice(7).split(",").filter(Boolean) : null;
const VERSION = "0.0.0"; // a version no real listing/ folder has

// The paths a real run of these scripts writes to; they must be untouched when this finishes.
const PROTECTED = ["icons/thumbs", "icons/places", "icons/looks", "listing", "store-assets", "www", "ios/version.xcconfig"];

function snapshot() {
  const out = [];
  const walk = (rel) => {
    const abs = join(root, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) { for (const name of readdirSync(abs).sort()) walk(join(rel, name)); }
    else out.push(`${rel} ${st.size} ${st.mtimeMs}`);
  };
  PROTECTED.forEach(walk);
  return out;
}

// PNG width and height from the IHDR chunk.
function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString("latin1", 1, 4) !== "PNG") throw new Error(`${file} is not a PNG`);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
}

// Each check gets the scratch folder and throws if the output is wrong.
const exists = (scratch, rel, minBytes = 1) => {
  const f = join(scratch, rel);
  if (!existsSync(f)) throw new Error(`missing ${rel}`);
  if (statSync(f).size < minBytes) throw new Error(`${rel} is ${statSync(f).size} bytes (expected at least ${minBytes})`);
};
const sized = (scratch, rel, want) => {
  exists(scratch, rel, 1000);
  const got = pngSize(join(scratch, rel));
  if (got !== want) throw new Error(`${rel} is ${got}, expected ${want}`);
};

const L = `listing/${VERSION}`;
const STEPS = [
  { name: "build-www", script: "build-www.mjs", args: [], timeout: 60_000,
    check: (s) => { exists(s, "www/index.html", 1000); exists(s, "www/app.js", 1000); exists(s, "www/capacitor.js", 1000);
      if (!/MARKETING_VERSION = \d+\.\d+\.\d+/.test(readFileSync(join(s, "ios/version.xcconfig"), "utf8"))) throw new Error("ios/version.xcconfig has no version"); } },
  // mandelbrot is a WebGL tile, fern an IFS one (it waits on fernView, a different path in the script).
  { name: "thumbs", script: "render_thumbs.mjs", args: ["--only=mandelbrot,fern"], timeout: 180_000,
    check: (s) => { exists(s, "icons/thumbs/mandelbrot.webp", 1500); exists(s, "icons/thumbs/fern.webp", 1500); } },
  { name: "place-thumbs", script: "render_place_thumbs.mjs", args: ["--limit=2"], timeout: 240_000,
    check: (s) => { const n = readdirSync(join(s, "icons/places")).filter((f) => f.endsWith(".webp")).length; if (n !== 2) throw new Error(`${n} place thumbnails, expected 2`); } },
  { name: "look-thumbs", script: "render_look_thumbs.mjs", args: [], timeout: 240_000,
    check: (s) => exists(s, "icons/looks/sprite.webp", 5000) },
  // 2-picker is also the screen store-header's search form puts in its phone frame.
  { name: "store-screenshots", script: "store-screenshots.mjs", args: [VERSION, "--slot=iphone-6.3", "1-deep-zoom", "2-picker", "7-looks"], timeout: 300_000,
    check: (s) => { for (const shot of ["1-deep-zoom", "2-picker", "7-looks"]) {
      sized(s, `${L}/app/iphone-6.3/${shot}.png`, "1206x2622");
      sized(s, `${L}/promo/iphone-6.3/${shot}.png`, "1206x2622");
    } exists(s, `${L}/renders/captions.json`, 10); } },
  { name: "store-header", script: "store-header.mjs", args: [VERSION], timeout: 240_000,
    check: (s) => sized(s, `${L}/product-page-header-3840x1646.png`, "3840x1646") },
  { name: "store-header-search", script: "store-header.mjs", args: ["search", VERSION], timeout: 240_000, needs: "store-screenshots",
    check: (s) => sized(s, `${L}/search-results-3840x2560.png`, "3840x2560") },
  // --quick renders a tenth of the frames and copies nothing to listing/.
  { name: "make-preview", script: "make-preview.mjs", args: [VERSION, "iphone", "--quick"], timeout: 420_000,
    check: (s) => { exists(s, `store-assets/preview/${VERSION}/iphone/quick-iphone-6.3-preview-886x1920.mp4`, 10_000);
      if (existsSync(join(s, L, "previews"))) throw new Error("--quick copied a video into listing/"); } },
];

const unknown = (only || []).filter((n) => !STEPS.some((s) => s.name === n));
if (unknown.length) { console.error(`smoke-store-scripts: unknown step(s) ${unknown.join(", ")}; steps: ${STEPS.map((s) => s.name).join(", ")}`); process.exit(2); }

// Runs one script in its own process group; resolves with its exit code and the tail of its output.
function run(step, scratch) {
  return new Promise((resolve) => {
    const child = spawn("node", [join(root, "scripts", step.script), ...step.args], {
      cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, SCRIPT_OUT_DIR: scratch },
    });
    let out = "";
    const take = (d) => { out = (out + d).slice(-4000); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } }, step.timeout);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: timedOut ? "timeout" : code, out }); });
    child.on("error", (err) => { clearTimeout(timer); resolve({ code: "spawn error", out: String(err) }); });
  });
}

const scratch = mkdtempSync(join(tmpdir(), "smoke-store-scripts-"));
const before = snapshot();
const results = [];
const failedNames = new Set();
console.log(`smoke-store-scripts: scratch folder ${scratch}`);
for (const step of STEPS) {
  if (only && !only.includes(step.name)) continue;
  // The search asset reads the picker screenshot the store-screenshots step makes.
  if (step.needs && !existsSync(join(scratch, L, "app/iphone-6.3/2-picker.png"))) {
    results.push({ name: step.name, status: "SKIP", note: `needs ${step.needs}${failedNames.has(step.needs) ? " (which failed)" : " (not selected)"}`, secs: 0 });
    console.log(`SKIP  ${step.name}: ${results.at(-1).note}`);
    continue;
  }
  const t0 = Date.now();
  const { code, out } = await run(step, scratch);
  let note = "";
  if (code !== 0) note = `exit ${code}\n${out.trim().split("\n").slice(-12).map((l) => "      " + l).join("\n")}`;
  else {
    try { step.check(scratch); } catch (err) { note = `ran but the output is wrong: ${err.message}`; }
  }
  const secs = Math.round((Date.now() - t0) / 1000);
  results.push({ name: step.name, status: note ? "FAIL" : "ok", note, secs });
  if (note) failedNames.add(step.name);
  console.log(`${note ? "FAIL" : "ok  "}  ${step.name} (${secs} s)${note ? `: ${note}` : ""}`);
}

// The guard: nothing under the real output paths may have changed.
const after = snapshot();
const changed = [...new Set([...before, ...after])].filter((l) => !(before.includes(l) && after.includes(l)));
if (changed.length) {
  console.error(`FAIL  a script wrote outside the scratch folder:\n${changed.map((l) => "      " + l).join("\n")}`);
  results.push({ name: "protected paths untouched", status: "FAIL" });
}
if (keep) console.log(`scratch folder kept: ${scratch}`);
else rmSync(scratch, { recursive: true, force: true });

const bad = results.filter((r) => r.status === "FAIL");
console.log(`\nsmoke-store-scripts: ${results.filter((r) => r.status === "ok").length} ok, ${bad.length} failed, ${results.filter((r) => r.status === "SKIP").length} skipped`);
process.exit(bad.length ? 1 : 0);
