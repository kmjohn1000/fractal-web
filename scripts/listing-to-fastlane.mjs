// Splits a release's listing-<version>.md (the whole App Store listing, every
// language) into the layout fastlane's `deliver` reads:
//   fastlane/metadata/<locale>/{name,subtitle,promotional_text,keywords,description,release_notes}.txt
//
//   node scripts/listing-to-fastlane.mjs listing/<version>/listing-<version>.md [outDir]
//
// Every field is checked against Apple's limit first; nothing is written if
// one is over or missing. Existing files are overwritten, never deleted. The
// output is generated and git-ignored (listing copy is never committed).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const LANGUAGES = {
  English: ["en-US"],
  "Français": ["fr-FR", "fr-CA"],
  "Español": ["es-MX", "es-ES"],
  Deutsch: ["de-DE"],
};

const FIELDS = {
  Name: { file: "name", limit: 30 },
  Subtitle: { file: "subtitle", limit: 30 },
  "Promotional Text": { file: "promotional_text", limit: 170 },
  Keywords: { file: "keywords", limit: 100 },
  Description: { file: "description", limit: 4000 },
  "What's New": { file: "release_notes", limit: 4000 },
};

const [listingArg, outArg] = process.argv.slice(2);
if (!listingArg) {
  console.error("usage: node scripts/listing-to-fastlane.mjs <listing-file.md> [outDir]");
  process.exit(2);
}
const outDir = resolve(outArg ?? "fastlane/metadata");
const lines = readFileSync(resolve(listingArg), "utf8").split("\n");

// language -> field -> { text, declared }
const parsed = {};
let language = null;
let field = null;
let body = [];

function finishField() {
  if (language && field) {
    const text = body.join("\n").replace(/\n+---\s*$/, "").trim();
    parsed[language][field.name] = { text, declared: field.declared };
  }
  field = null;
  body = [];
}

for (const line of lines) {
  const h1 = line.match(/^# (.+)$/);
  const h2 = line.match(/^## (.+?) \(([\d,]+)\/[\d,]+\)\s*$/);
  if (h1) {
    finishField();
    language = h1[1] in LANGUAGES ? h1[1] : null;
    if (language) parsed[language] = {};
  } else if (h2 && language) {
    finishField();
    const name = h2[1].replace(/’/g, "'");
    if (name in FIELDS) field = { name, declared: Number(h2[2].replace(/,/g, "")) };
  } else if (line.startsWith("## ")) {
    finishField();
  } else if (field) {
    body.push(line);
  }
}
finishField();

const problems = [];
const warnings = [];
for (const lang of Object.keys(LANGUAGES)) {
  if (!parsed[lang]) {
    problems.push(`${lang}: section not found`);
    continue;
  }
  for (const [name, { limit }] of Object.entries(FIELDS)) {
    const entry = parsed[lang][name];
    if (!entry || !entry.text) {
      problems.push(`${lang} / ${name}: missing or empty`);
      continue;
    }
    const length = [...entry.text].length;
    if (length > limit) problems.push(`${lang} / ${name}: ${length} characters, limit ${limit}`);
    if (length !== entry.declared) {
      warnings.push(`${lang} / ${name}: heading says ${entry.declared}, measured ${length}`);
    }
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (problems.length) {
  for (const p of problems) console.error(`error: ${p}`);
  console.error("Nothing written.");
  process.exit(1);
}

let files = 0;
for (const [lang, locales] of Object.entries(LANGUAGES)) {
  for (const locale of locales) {
    const dir = join(outDir, locale);
    mkdirSync(dir, { recursive: true });
    for (const [name, { file }] of Object.entries(FIELDS)) {
      writeFileSync(join(dir, `${file}.txt`), String(parsed[lang][name].text));
      files++;
    }
  }
}
const locales = Object.values(LANGUAGES).flat();
console.log(`Wrote ${files} files for ${locales.length} locales (${locales.join(", ")}) to ${outDir}`);
