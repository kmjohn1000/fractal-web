// Copies the static site into www/, the folder Capacitor bundles into the
// iOS app (capacitor.config.json's webDir). The repo root can't be webDir
// itself: Capacitor would copy node_modules/ and ios/ into the app too.
// www/ is generated, so it's git-ignored; GitHub Pages keeps serving the
// repo root untouched.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "www");

// Not part of the app: build/lint config and the service worker (the app's
// files are already on the device, so sw.js isn't registered natively).
const SKIP = new Set(["eslint.config.js", "capacitor.config.json", "sw.js"]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of readdirSync(root)) {
  if (SKIP.has(name)) continue;
  if (/\.(html|js|webmanifest)$/.test(name)) cpSync(join(root, name), join(out, name));
}
cpSync(join(root, "icons"), join(out, "icons"), { recursive: true });
// Capacitor's registerPlugin(), loaded by platform.js only inside the app.
cpSync(join(root, "node_modules/@capacitor/core/dist/capacitor.js"), join(out, "capacitor.js"));
console.log(`www/ built: ${readdirSync(out).join(", ")}`);

// Stamp the app version from CHANGELOG.md (the single source of it, see
// CLAUDE.md) into the Xcode project, and use the commit count as the build
// number, which App Store Connect requires to rise with every upload.
const version = readFileSync(join(root, "CHANGELOG.md"), "utf8").match(/^## (\d+\.\d+\.\d+)/m)[1];
const build = execSync("git rev-list --count HEAD", { cwd: root }).toString().trim();
const pbxproj = join(root, "ios/App/App.xcodeproj/project.pbxproj");
writeFileSync(pbxproj, readFileSync(pbxproj, "utf8")
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`));
console.log(`Xcode project: version ${version} (build ${build})`);
