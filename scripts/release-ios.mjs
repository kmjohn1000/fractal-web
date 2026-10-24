// iOS release steps for a Capacitor app with the default layout
// (ios/App/App.xcodeproj, scheme "App"); used by the /release command.
// Run `npm run ios:sync` first so www/ and ios/version.xcconfig are current.
//
//   node scripts/release-ios.mjs screenshots <outDir>
//       Checks the real iOS build: builds for the simulator, then for the
//       iPhone and iPad App Store slots boots a simulator (creating one if
//       needed), installs and launches the app and saves PNGs to
//       <outDir>/<slot>/, checking their pixel size. Each shot after the
//       first opens a share link, which the app receives as a launch URL
//       (Platform.onOpenUrl). The listing's upload set comes from
//       scripts/store-screenshots.mjs, which can open the picker and info
//       card (simctl can't tap).
//
//   node scripts/release-ios.mjs archive <outDir>
//       Archives a Release build and exports an App Store Connect IPA to
//       <outDir>/ (signing: automatic, the project's team, with
//       -allowProvisioningUpdates so Xcode's account can supply profiles
//       and a cloud-managed distribution certificate).
//
// Logs from xcodebuild go to <outDir>/*.log; only the tail is printed on failure.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const PROJECT = join(root, "ios/App/App.xcodeproj");
const SCHEME = "App";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// App Store Connect's slots (named as in scripts/store-screenshots.mjs) and
// the simulator that renders each at its exact pixel size. The iPhone slot
// takes 6.3" (it rejected 6.5" on 2026-10-15); the iPad slot is 13".
const SIZES = [
  { slot: "iphone-6.3", device: "iPhone 17 Pro", width: 1206, height: 2622 },
  { slot: "ipad-13", device: "iPad Pro 13-inch (M5)", width: 2064, height: 2752 },
];

// What each screenshot shows: the opening view, then share links (made by
// the app's Share button / buildShareHash at phone size): Seahorse Valley
// in Turbo, the Burning Ship's Armada, the Barnsley fern.
const LINK = "https://kmjohn1000.github.io/fractal-web/";
const SHOTS = [
  { name: "01-mandelbrot", url: null },
  { name: "02-seahorse-valley", url: `${LINK}#v=1&m=fractal&f=Mandelbrot&x=-0.743643887037151&y=0.13182590420533&s=4e-10&r=0&i=2000&cm=Turbo` },
  { name: "03-armada", url: `${LINK}#v=1&m=fractal&f=Burn.+Ship&x=-1.7595&y=-0.036&s=0.068&r=0&fl=1&i=610&cm=Inferno` },
  { name: "04-fern", url: `${LINK}#v=1&m=fern&x=0.25&y=5.025&s=5.225&r=0&n=1000000&c=0` },
];

// timeoutMs (optional) kills a call that stalls: without it spawnSync waits
// forever, and `simctl openurl` can block for a minute or more while the
// simulator's link service is busy (see openInApp).
function run(cmd, args, log, timeoutMs) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28, timeout: timeoutMs });
  if (r.error?.code === "ETIMEDOUT") throw new Error(`${cmd} ${args.slice(0, 2).join(" ")} timed out after ${timeoutMs / 1000}s`);
  const out = (r.stdout?.toString() || "") + (r.stderr?.toString() || "");
  if (log) writeFileSync(log, out);
  if (r.status !== 0) {
    console.error(out.split("\n").slice(-40).join("\n"));
    throw new Error(`${cmd} ${args[0]} failed (exit ${r.status})${log ? `; full log: ${log}` : ""}`);
  }
  return out;
}
const simctl = (...args) => run("xcrun", ["simctl", ...args]);
const simctlWithin = (timeoutMs, ...args) => run("xcrun", ["simctl", ...args], undefined, timeoutMs);

function devices() {
  return Object.entries(JSON.parse(simctl("list", "devices", "available", "-j")).devices)
    .flatMap(([runtime, list]) => list.map((d) => ({ ...d, runtime })));
}

// An available simulator of this type on the newest runtime that has one,
// or a new one on the newest iOS runtime that supports the type.
function simulatorFor(deviceName) {
  const iosRuntime = (r) => /SimRuntime\.iOS-/.test(r);
  const version = (r) => r.match(/iOS-(\d+)-(\d+)/).slice(1).map(Number);
  const newestFirst = (a, b) => { const [x, y] = [version(a), version(b)]; return y[0] - x[0] || y[1] - x[1]; };
  const existing = devices().filter((d) => d.name === deviceName && iosRuntime(d.runtime))
    .sort((a, b) => newestFirst(a.runtime, b.runtime));
  if (existing.length) return existing[0].udid;
  const types = JSON.parse(simctl("list", "devicetypes", "-j")).devicetypes;
  const type = types.find((t) => t.name === deviceName);
  if (!type) throw new Error(`no simulator device type "${deviceName}"`);
  const runtimes = JSON.parse(simctl("list", "runtimes", "available", "-j")).runtimes
    .filter((r) => iosRuntime(r.identifier) && r.supportedDeviceTypes.some((t) => t.identifier === type.identifier))
    .map((r) => r.identifier).sort(newestFirst);
  if (!runtimes.length) throw new Error(`no installed iOS runtime supports ${deviceName}`);
  console.log(`creating simulator ${deviceName} (${runtimes[0]})`);
  return simctl("create", deviceName, type.identifier, runtimes[0]).trim();
}

const SAFARI = "com.apple.mobilesafari";
const isRunning = (udid, id) => run("xcrun", ["simctl", "spawn", udid, "launchctl", "list"], undefined, 20_000).includes(`UIKitApplication:${id}[`);
const terminate = (udid, id) => spawnSync("xcrun", ["simctl", "terminate", udid, id], { stdio: "ignore", timeout: 20_000 });

// Opens a share link in the app. Right after an install, iOS hasn't yet
// associated the app with the link's domain (it fetches the domain's
// apple-app-site-association in the background), so the link opens in
// Safari instead: close Safari, wait and retry until the app gets it.
// That fetch can take several minutes (4+ on 2026-10-20, via Apple's CDN),
// and `simctl openurl` itself can stall or fail while it runs, so the wait
// is a time budget, not a count, every call has a timeout, and a failed
// openurl counts as one more attempt. Each attempt says how long it's been.
const LINK_WAIT_MS = 8 * 60 * 1000;
async function openInApp(udid, id, url) {
  const start = Date.now();
  for (let attempt = 1; Date.now() - start < LINK_WAIT_MS; attempt++) {
    terminate(udid, SAFARI);
    terminate(udid, id);
    let problem = "";
    try {
      simctlWithin(40_000, "openurl", udid, url);
    } catch (err) {
      problem = `; openurl: ${String(err.message).split("\n")[0]}`;
    }
    await sleep(3000);
    if (!isRunning(udid, SAFARI) && isRunning(udid, id)) return;
    const secs = Math.round((Date.now() - start) / 1000);
    console.log(`  link opened in Safari, not the app (attempt ${attempt}, ${secs}s in); waiting for the domain association${problem}`);
    terminate(udid, SAFARI);
    await sleep(10000);
  }
  throw new Error(`share links still open in Safari on ${udid} after ${LINK_WAIT_MS / 60000} minutes: universal links aren't associated`);
}

function bundleId() {
  return JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8")).appId;
}

function pngSize(file) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]).toString();
  return { width: Number(out.match(/pixelWidth: (\d+)/)[1]), height: Number(out.match(/pixelHeight: (\d+)/)[1]) };
}

// A shot of a frame the app hasn't drawn yet (black canvas, empty toolbar)
// compresses to about 0.02 bytes per pixel; the sparsest real shot (the fern
// on black) is about 0.12. Anything under this counts as blank. Cheap and
// dependency-free, but it can't see a half-drawn frame.
const MIN_BYTES_PER_PIXEL = 0.06;
const DRAW_WAIT_MS = 90_000;
// Takes the screenshot, retrying every 5 s while the frame looks blank: a
// cold launch on the iPad's iOS 27.0 simulator takes longer than the fixed
// wait before it. Returns the last attempt's pixel size and whether it is
// still blank after DRAW_WAIT_MS.
async function screenshotWhenDrawn(udid, file) {
  const start = Date.now();
  for (;;) {
    simctlWithin(30_000, "io", udid, "screenshot", "--type=png", file);
    const px = pngSize(file);
    const blank = statSync(file).size / (px.width * px.height) < MIN_BYTES_PER_PIXEL;
    if (!blank || Date.now() - start >= DRAW_WAIT_MS) return { ...px, blank };
    console.log(`  frame still blank (${Math.round((Date.now() - start) / 1000)}s in); waiting for the app to draw`);
    await sleep(5000);
  }
}

async function screenshots(outDir) {
  mkdirSync(outDir, { recursive: true });
  const derived = join(outDir, "DerivedData");
  console.log("building for the simulator...");
  run("xcodebuild", ["-project", PROJECT, "-scheme", SCHEME, "-configuration", "Release",
    "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", derived, "build"], join(outDir, "build-simulator.log"));
  const products = join(derived, "Build/Products/Release-iphonesimulator");
  const app = readdirSync(products).find((f) => f.endsWith(".app"));
  if (!app) throw new Error(`no .app in ${products}`);
  const id = bundleId();
  const results = [];

  for (const size of SIZES) {
    const udid = simulatorFor(size.device);
    const state = devices().find((d) => d.udid === udid).state;
    if (state !== "Booted") simctl("boot", udid);
    simctl("bootstatus", udid, "-b");
    // App Store convention: 9:41, full battery and signal.
    simctl("status_bar", udid, "override", "--time", "9:41", "--dataNetwork", "wifi", "--wifiMode", "active",
      "--wifiBars", "3", "--cellularMode", "active", "--cellularBars", "4", "--batteryState", "charged", "--batteryLevel", "100");
    simctl("install", udid, join(products, app));
    // Settle the universal-link association before any shot that needs it.
    const firstLink = SHOTS.find((s) => s.url);
    if (firstLink) await openInApp(udid, id, firstLink.url);
    const dir = join(outDir, size.slot);
    mkdirSync(dir, { recursive: true });
    for (const shot of SHOTS) {
      terminate(udid, SAFARI);
      terminate(udid, id);
      if (shot.url) await openInApp(udid, id, shot.url);
      else simctl("launch", udid, id);
      await sleep(9000); // launch, first frame, supersampling / IFS fill
      const file = join(dir, `${shot.name}.png`);
      const px = await screenshotWhenDrawn(udid, file);
      const ok = px.width === size.width && px.height === size.height && !px.blank;
      results.push({ file, ...px, ok });
      console.log(`${ok ? "ok " : "BAD"} ${size.slot} ${shot.name}: ${px.width}x${px.height}${px.blank ? " (still blank)" : ""}`);
    }
    simctl("status_bar", udid, "clear");
    simctl("shutdown", udid);
  }
  if (results.some((r) => !r.ok)) throw new Error("some screenshots have the wrong pixel size or are still blank");
}

function teamId() {
  const m = readFileSync(join(PROJECT, "project.pbxproj"), "utf8").match(/DEVELOPMENT_TEAM = (\w+);/);
  if (!m) throw new Error("no DEVELOPMENT_TEAM in the Xcode project");
  return m[1];
}

function archive(outDir) {
  mkdirSync(outDir, { recursive: true });
  const archivePath = join(outDir, "App.xcarchive");
  console.log("archiving...");
  run("xcodebuild", ["-project", PROJECT, "-scheme", SCHEME, "-configuration", "Release",
    "-destination", "generic/platform=iOS", "-archivePath", archivePath, "-allowProvisioningUpdates", "archive"],
  join(outDir, "archive.log"));
  const plist = join(outDir, "ExportOptions.plist");
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>teamID</key><string>${teamId()}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
`);
  console.log("exporting the IPA...");
  run("xcodebuild", ["-exportArchive", "-archivePath", archivePath, "-exportPath", outDir,
    "-exportOptionsPlist", plist, "-allowProvisioningUpdates"], join(outDir, "export.log"));
  const ipa = readdirSync(outDir).find((f) => f.endsWith(".ipa"));
  if (!ipa) throw new Error(`export finished without an .ipa in ${outDir}`);
  const info = join(archivePath, "Info.plist");
  const v = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :ApplicationProperties:CFBundleShortVersionString", info]).toString().trim();
  const b = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :ApplicationProperties:CFBundleVersion", info]).toString().trim();
  console.log(`IPA: ${join(outDir, ipa)} (version ${v}, build ${b})`);
}

const [cmd, out] = process.argv.slice(2);
if (!out || !["screenshots", "archive"].includes(cmd)) {
  console.error("usage: node scripts/release-ios.mjs screenshots|archive <outDir>");
  process.exit(2);
}
const outDir = resolve(out);
if (cmd === "screenshots") await screenshots(outDir);
else archive(outDir);
