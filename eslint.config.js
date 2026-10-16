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
  strokeWidthFor: "readonly",
  // shaders.js
  VERT_SRC: "readonly",
  FRAG_SRC: "readonly",
  PREVIEW_FRAG_SRC: "readonly",
  // koch.js / pythagoras.js / dragon.js / fern.js
  createKochView: "readonly",
  createPythagorasTreeView: "readonly",
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
  ifsData: "readonly",
  // platform.js
  Platform: "readonly",
};

export default [
  { ignores: ["node_modules/", "www/", "ios/"] },
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
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["sw.js"],
    languageOptions: {
      sourceType: "script",
      globals: globals.serviceworker,
    },
  },
];
