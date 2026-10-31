import js from "@eslint/js";
import globals from "globals";

// Every app file is an ES module (index.html loads only app.js, which imports the rest), so a name
// from another file is imported where it is used, never a global. A shared `let` is assigned only in
// the file that declares it, through its setter; an import is read-only, which is what enforces that.
export default [
  { ignores: ["node_modules/", "www/", "ios/", "store-assets/"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    ignores: ["eslint.config.js", "sw.js", "scripts/**"],
    languageOptions: {
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "no-unused-vars": ["error", { vars: "local" }],
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
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
