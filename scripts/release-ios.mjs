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
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  { name: "03-armada", url: `${LINK}#v=1&m=fractal&f=Burn.+Ship&x=-1.7595&y=-0.036&s=0.068&r=3.141592653589793&i=610&cm=Inferno` },
  { name: "04-fern", url: `${LINK}#v=1&m=fern&x=0.25&y=5.025&s=5.225&r=0&n=1000000&c=0` },
];

function run(cmd, args, log) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
  const out = (r.stdout?.toString() || "") + (r.stderr?.toString() || "");
  if (log) writeFileSync(log, out);
  if (r.status !== 0) {
    console.error(out.split("\n").slice(-40).join("\n"));
    throw new Error(`${cmd} ${args[0]} failed (exit ${r.status})${log ? `; full log: ${log}` : ""}`);
  }
  return out;
}
const simctl = (...args) => run("xcrun", ["simctl", ...args]);

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
const isRunning = (udid, id) => run("xcrun", ["simctl", "spawn", udid, "launchctl", "list"]).includes(`UIKitApplication:${id}[`);
const terminate = (udid, id) => spawnSync("xcrun", ["simctl", "terminate", udid, id], { stdio: "ignore" });

// Opens a share link in the app. Right after an install, iOS hasn't yet
// associated the app with the link's domain (it fetches the domain's
// apple-app-site-association in the background), so the link opens in
// Safari instead: close Safari, wait and retry until the app gets it.
async function openInApp(udid, id, url) {
  for (let attempt = 1; attempt <= 12; attempt++) {
    terminate(udid, SAFARI);
    terminate(udid, id);
    simctl("openurl", udid, url);
    await sleep(3000);
    if (!isRunning(udid, SAFARI) && isRunning(udid, id)) return;
    console.log(`  link opened in Safari, not the app (attempt ${attempt}); waiting for the domain association`);
    terminate(udid, SAFARI);
    await sleep(10000);
  }
  throw new Error(`share links keep opening in Safari on ${udid}: universal links aren't associated`);
}

function bundleId() {
  return JSON.parse(readFileSync(join(root, "capacitor.config.json"), "utf8")).appId;
}

function pngSize(file) {
  const out = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file]).toString();
  return { width: Number(out.match(/pixelWidth: (\d+)/)[1]), height: Number(out.match(/pixelHeight: (\d+)/)[1]) };
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
      simctl("io", udid, "screenshot", "--type=png", file);
      const px = pngSize(file);
      const ok = px.width === size.width && px.height === size.height;
      results.push({ file, ...px, ok });
      console.log(`${ok ? "ok " : "BAD"} ${size.slot} ${shot.name}: ${px.width}x${px.height}`);
    }
    simctl("status_bar", udid, "clear");
    simctl("shutdown", udid);
  }
  if (results.some((r) => !r.ok)) throw new Error("some screenshots have the wrong pixel size");
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
