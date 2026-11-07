// Stages the App Store screenshot upload set in the layout fastlane's `deliver`
// reads:
//   fastlane/screenshots/<locale>/<slot>_<shot>.png
//
//   node scripts/stage-screenshots.mjs [outDir]
//
// /release only writes the shots that changed into listing/<version>/app/<slot>/
// (an unchanged shot keeps the previous version's file), so the current set is
// spread over several version folders. For each slot this takes every shot from
// the newest version folder that has it. The shot names come from the newest
// renders/captions.json, so a retired shot is not picked up from an older folder.
//
// The bare app screens have no captions, so one set serves every locale: it is
// copied into each locale folder. `deliver` tells the device slot from each
// image's pixel size, not from the folder, so the file names carry the slot
// only to keep them unique and in order.
//
// Every image's pixel size is checked against its slot first; nothing is
// written if a shot is missing or the wrong size. The previous staging of a
// locale is deleted before the new one is written (the output is generated and
// git-ignored, and a leftover file would be uploaded).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

// Same locales as scripts/listing-to-fastlane.mjs.
const LOCALES = ["en-US", "fr-FR", "fr-CA", "es-MX", "es-ES", "de-DE"];

// The only sizes the listing uses (CLAUDE.md, ## Release). Slot folder -> [width, height].
const SLOTS = {
  "iphone-6.3": [1206, 2622],
  "ipad-13": [2064, 2752],
  "iphone-duo": [2007, 2853],
};

const listingDir = resolve("listing");
const outDir = resolve(process.argv[2] ?? "fastlane/screenshots");

const versions = readdirSync(listingDir)
  .filter((n) => /^\d+\.\d+\.\d+$/.test(n))
  .sort((a, b) => {
    const [x, y] = [a, b].map((v) => v.split(".").map(Number));
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; // newest first
  });

const captionsVersion = versions.find((v) => existsSync(join(listingDir, v, "renders/captions.json")));
if (!captionsVersion) {
  console.error("error: no listing/<version>/renders/captions.json found, so the shot list is unknown.");
  process.exit(1);
}
const shots = Object.keys(JSON.parse(readFileSync(join(listingDir, captionsVersion, "renders/captions.json"), "utf8")));

function pngSize(path) {
  const b = readFileSync(path);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const problems = [];
const chosen = []; // { slot, shot, path, version }
for (const [slot, [w, h]] of Object.entries(SLOTS)) {
  for (const shot of shots) {
    const version = versions.find((v) => existsSync(join(listingDir, v, "app", slot, `${shot}.png`)));
    if (!version) {
      problems.push(`${slot} / ${shot}: not found in any listing/<version>/app/${slot}/`);
      continue;
    }
    const path = join(listingDir, version, "app", slot, `${shot}.png`);
    const size = pngSize(path);
    if (!size) problems.push(`${path}: not a readable PNG`);
    else if (size[0] !== w || size[1] !== h) problems.push(`${path}: ${size[0]}x${size[1]}, slot ${slot} needs ${w}x${h}`);
    else chosen.push({ slot, shot, path, version });
  }
}

if (problems.length) {
  for (const p of problems) console.error(`error: ${p}`);
  console.error("Nothing written.");
  process.exit(1);
}

for (const locale of LOCALES) {
  const dir = join(outDir, locale);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const c of chosen) copyFileSync(c.path, join(dir, `${c.slot}_${c.shot}.png`));
}

console.log(`Shot list from listing/${captionsVersion}/renders/captions.json (${shots.length} shots).`);
for (const slot of Object.keys(SLOTS)) {
  const from = [...new Set(chosen.filter((c) => c.slot === slot).map((c) => c.version))];
  console.log(`  ${slot}: ${shots.length} shots, from ${from.join(", ")}`);
}
console.log(`Staged ${chosen.length} images x ${LOCALES.length} locales (${chosen.length * LOCALES.length} files) in ${outDir}`);
