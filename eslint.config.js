import js from "@eslint/js";
import globals from "globals";

// The app is plain <script> tags (see index.html), so top-level declarations
// in one file are globals consumed by the others. Declare them here rather
// than disabling no-undef.
const sharedGlobals = {
  // colormaps.js
  COLORMAPS: "readonly",
  buildLUTBytes: "readonly",
  sampleColor: "readonly",
  SOLID_COLORS: "readonly",
  solidCss: "readonly",
  SOLID_COLOR_ORDER: "readonly",
  strokeWidthFor: "readonly",
  hueTurned: "readonly",
  isGreyColor: "readonly",
  // vectorgeom.js
  VECTOR_CULL_MARGIN: "readonly",
  vectorAffine: "readonly",
  vectorDiscOffscreen: "readonly",
  paintBackdrop: "readonly",
  backdropPixels: "readonly",
  BACKDROP_CENTER_RGB: "readonly",
  BACKDROP_EDGE_RGB: "readonly",
  // dragon.js / fern.js
  createCurveView: "readonly",
  LINE_CURVES: "readonly",
  // lsystem.js
  KOCH_SNOWFLAKE: "readonly",
  DRAGON_CURVE: "readonly",
  HILBERT_CURVE: "readonly",
  GOSPER_CURVE: "readonly",
  SIERPINSKI_ARROWHEAD: "readonly",
  lsystemPolylines: "readonly",
  normalizePolylines: "readonly",
  createIfsView: "readonly",
  IFS_SYSTEMS: "readonly",
  ifsTransformColors: "readonly",
  curveRamp: "readonly",
  ifsData: "readonly",
  // The pieces app.js was split into, in the order index.html loads them
  // (app.js itself is last and defines nothing the others use). Only names
  // another piece uses are listed; "writable" marks the `let`s that get
  // reassigned.
  // configs.js
  FTYPE: "readonly",
  PHOENIX_P: "readonly",
  FRACTAL_CONFIGS: "readonly",
  FRACTAL_NAMES: "readonly",
  fractalLabel: "readonly",
  slugify: "readonly",
  // (platform.js, places.js, renderer.js, state.js, render-layout.js, modes.js, interaction.js,
  // compass-ui.js, teleport.js, colormap-picker.js, color-sheet.js, share.js, state-colors.js,
  // places-sheet.js, shaders.js, koch.js, pythagoras.js, hexaflake.js, diag.js, fractal-defs.js and
  // deepzoom.js are ES modules now: their names are imported where they are used, so they are
  // not globals and are not listed here. A shared `let` is assigned only in the file that declares
  // it, through its setter; an import is read-only, which is what enforces that.)
};

export default [
  { ignores: ["node_modules/", "www/", "ios/", "store-assets/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    ignores: ["eslint.config.js", "sw.js", "scripts/**"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser, ...sharedGlobals },
    },
    rules: {
      // Top-level declarations are intentionally shared across files.
      "no-unused-vars": ["error", { vars: "local" }],
      // Declaring a shared global above and defining it in its own file is
      // expected, not a redeclaration.
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },
  {
    // The ES modules (see their headers); the rest are still plain scripts. In a module a `let`
    // is its own, so no owner override is needed for the variables declared in these files.
    files: [
      "app.js", "places-sheet.js", "test-hooks.js", "state-colors.js", "render-layout.js", "modes.js",
      "interaction.js", "compass-ui.js", "teleport.js", "colormap-picker.js", "color-sheet.js", "share.js",
      "platform.js", "places.js", "renderer.js", "state.js",
      "shaders.js", "koch.js", "pythagoras.js", "hexaflake.js", "diag.js", "fractal-defs.js", "deepzoom.js",
    ],
    languageOptions: { sourceType: "module" },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "playwright.config.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright specs pass functions to page.evaluate, which run in the page.
    files: ["tests/**/*.spec.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ["sw.js"],
    languageOptions: {
      sourceType: "script",
      globals: globals.serviceworker,
    },
  },
];
