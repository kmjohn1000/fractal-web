// The lists the visual suite walks: every fractal/mode, every colormap and
// every Surprise-me place. Read straight from the app's sources (configs.js,
// fractal-defs.js, places.js and colormaps.js: classic scripts or ES modules, so
// a declaration may start with `export`), so a new fractal,
// colormap or place gets a test without editing the suite. app.spec.mjs
// also checks these against the live page, so a parse that silently drops
// entries fails loudly.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url).pathname;
const configs = readFileSync(root + "configs.js", "utf8");       // FTYPE, FRACTAL_CONFIGS
const defs = readFileSync(root + "fractal-defs.js", "utf8");     // EXTRA_MODES
const places = readFileSync(root + "places.js", "utf8");         // TELEPORT_DESTINATIONS
const colormaps = readFileSync(root + "colormaps.js", "utf8");

// A top-level `const NAME = ...;` declaration (with or without `export`): on one line, or ending at
// the first unindented closing bracket. Returned without the `export`, which vm can't run.
function literal(src, name, close) {
  const m = src.match(new RegExp(`^(?:export )?const ${name} = .*;$`, "m"))
    || src.match(new RegExp(`^(?:export )?const ${name} = [\\s\\S]*?\\n\\${close};`, "m"));
  if (!m) throw new Error(`tests/cases.mjs: couldn't find ${name}`);
  return m[0].replace(/^export /, "");
}

const ctx = vm.createContext({ Math });
vm.runInContext([
  literal(configs, "FTYPE", "}"),
  literal(configs, "FRACTAL_CONFIGS", "}"),
  literal(defs, "EXTRA_MODES", "]"),
  literal(places, "TELEPORT_DESTINATIONS", "]"),
  literal(colormaps, "COLORMAPS", "]"),
  "globalThis.out = { FRACTAL_CONFIGS, EXTRA_MODES, TELEPORT_DESTINATIONS, COLORMAPS };",
].join("\n"), ctx);
const { FRACTAL_CONFIGS, EXTRA_MODES, TELEPORT_DESTINATIONS, COLORMAPS } = ctx.out;

export const slug = (text) => text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const FRACTALS = Object.keys(FRACTAL_CONFIGS);
export const MODES = EXTRA_MODES.map((m) => m.key);
export const COLORMAP_NAMES = COLORMAPS.map((c) => c.name);
export const PLACES = TELEPORT_DESTINATIONS.map((d, index) => ({ index, fractal: d.fractal, label: d.label }));
