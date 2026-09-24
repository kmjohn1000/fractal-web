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
  // shaders.js
  VERT_SRC: "readonly",
  FRAG_SRC: "readonly",
  // koch.js / pythagoras.js / dragon.js / fern.js
  createKochView: "readonly",
  createPythagorasTreeView: "readonly",
  createDragonView: "readonly",
  createFernView: "readonly",
  FERN_COLORS: "readonly",
};

export default [
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    ignores: ["eslint.config.js", "sw.js"],
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
    files: ["sw.js"],
    languageOptions: {
      sourceType: "script",
      globals: globals.serviceworker,
    },
  },
];
