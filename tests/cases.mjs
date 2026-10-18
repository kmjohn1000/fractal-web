// The lists the visual suite walks: every fractal/mode, every colormap and
// every Surprise-me place. Read straight from the app's sources (app.js and
// colormaps.js are classic browser scripts, not modules), so a new fractal,
// colormap or place gets a test without editing the suite. app.spec.mjs
// also checks these against the live page, so a parse that silently drops
// entries fails loudly.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url).pathname;
const app = readFileSync(root + "app.js", "utf8");
const colormaps = readFileSync(root + "colormaps.js", "utf8");

// A top-level `const NAME = ...;` declaration: on one line, or ending at
// the first unindented closing bracket.
function literal(src, name, close) {
  const m = src.match(new RegExp(`^const ${name} = .*;$`, "m"))
    || src.match(new RegExp(`^const ${name} = [\\s\\S]*?\\n\\${close};`, "m"));
  if (!m) throw new Error(`tests/cases.mjs: couldn't find ${name}`);
  return m[0];
}

const ctx = vm.createContext({ Math });
vm.runInContext([
  literal(app, "FTYPE", "}"),
  literal(app, "FRACTAL_CONFIGS", "}"),
  literal(app, "EXTRA_MODES", "]"),
  literal(app, "TELEPORT_DESTINATIONS", "]"),
  literal(colormaps, "COLORMAPS", "]"),
  "globalThis.out = { FRACTAL_CONFIGS, EXTRA_MODES, TELEPORT_DESTINATIONS, COLORMAPS };",
].join("\n"), ctx);
const { FRACTAL_CONFIGS, EXTRA_MODES, TELEPORT_DESTINATIONS, COLORMAPS } = ctx.out;

export const slug = (text) => text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const FRACTALS = Object.keys(FRACTAL_CONFIGS);
export const MODES = EXTRA_MODES.map((m) => m.key);
export const COLORMAP_NAMES = COLORMAPS.map((c) => c.name);
export const PLACES = TELEPORT_DESTINATIONS.map((d, index) => ({ index, fractal: d.fractal, label: d.label }));
