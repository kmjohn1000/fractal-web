// Checks what the test hook (test-hooks.js) relies on; run by `npm run lint`.
//   1. Every top-level declaration in an ES module file is exported (the entry, app.js, and
//      test-hooks.js excepted), because the hook exposes a module's exports and nothing else.
//   2. Every module file other than those two is listed in app.js's exposeForTests call.
//   3. Every name a test or script lists in a /* global */ comment resolves: it is a top-level
//      name in an app file, a browser, Node or built-in global, or defined by that file itself.
//      (Names used only inside page.evaluate template strings can't be checked; a spec run does.)
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import * as espree from "espree";
import globals from "globals";
import { appShellFiles, moduleFiles } from "./stamp.mjs";

const root = new URL("..", import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), "utf8");
const errors = [];

const modules = new Set(moduleFiles());
const EXEMPT = new Set(["app.js", "test-hooks.js"]);

function patternNames(p) {
  if (!p) return [];
  switch (p.type) {
    case "Identifier": return [p.name];
    case "ObjectPattern": return p.properties.flatMap((q) => patternNames(q.type === "RestElement" ? q.argument : q.value));
    case "ArrayPattern": return p.elements.flatMap(patternNames);
    case "AssignmentPattern": return patternNames(p.left);
    case "RestElement": return patternNames(p.argument);
    default: return [];
  }
}

// The top-level names a file declares, and which of them it exports.
function topLevel(src, isModule) {
  const ast = espree.parse(src, { ecmaVersion: "latest", sourceType: isModule ? "module" : "script" });
  const names = [], exported = new Set();
  for (const node of ast.body) {
    let decl = node;
    if (node.type === "ExportNamedDeclaration") {
      if (!node.declaration) { node.specifiers.forEach((s) => exported.add(s.local.name)); continue; }
      decl = node.declaration;
      const ids = decl.type === "VariableDeclaration" ? decl.declarations.flatMap((d) => patternNames(d.id)) : [decl.id.name];
      ids.forEach((n) => exported.add(n));
    }
    if (decl.type === "VariableDeclaration") decl.declarations.forEach((d) => names.push(...patternNames(d.id)));
    else if (decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") names.push(decl.id.name);
  }
  return { names, exported };
}

// ---- 1 and the app's name table
const appNames = new Set();
for (const file of appShellFiles().filter((f) => f.endsWith(".js") && f !== "sw.js")) {
  const isModule = modules.has(file);
  const { names, exported } = topLevel(read(file), isModule);
  names.forEach((n) => appNames.add(n));
  if (isModule && !EXEMPT.has(file)) {
    for (const n of names) if (!exported.has(n)) errors.push(`${file}: top-level "${n}" is not exported (every top-level declaration in a module must be)`);
  }
}
for (const m of read("index.html").matchAll(/<script>([\s\S]*?)<\/script>/g)) topLevel(m[1], false).names.forEach((n) => appNames.add(n));

// ---- 2
const listed = new Set([...read("app.js").matchAll(/exposeForTests\(\{([\s\S]*?)\}\)/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+\.js)"\s*:/g)].map((k) => k[1])));
for (const f of modules) if (!EXEMPT.has(f) && !listed.has(f)) errors.push(`${f} is a module but is not listed in app.js's exposeForTests call`);
for (const f of listed) if (!modules.has(f)) errors.push(`app.js's exposeForTests lists "${f}", which is not an imported module`);

// ---- 3
const known = new Set([...Object.keys(globals.browser), ...Object.keys(globals.node), ...Object.keys(globals.builtin), ...appNames]);
const files = [];
(function walk(dir) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!["node_modules", "baselines", "output", "report"].includes(e.name)) walk(p); }
    else if (/\.(mjs|js)$/.test(e.name)) files.push(p);
  }
})("tests");
(function walk(dir) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (/\.mjs$/.test(e.name)) files.push(p);
  }
})("scripts");
for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(/\/\*\s*globals?\s+([\s\S]*?)\*\//g)) {
    for (const tok of m[1].split(/[,\s]+/).filter(Boolean)) {
      const name = tok.replace(/:.*$/, "");
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      // a name the file defines for itself (window.name = ..., a function it declares) is fine
      if (known.has(name) || new RegExp(`(?:window\\.|function\\s+|(?:const|let|var)\\s+)${name.replace(/\$/g, "\\$")}\\b`).test(src)) continue;
      errors.push(`${relative(root, join(root, file))}: /* global */ lists "${name}", which no app file declares`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => "check-test-globals: " + e).join("\n"));
  process.exit(1);
}
console.log(`check-test-globals: ok (${modules.size} module files, ${appNames.size} app names, ${files.length} test/script files)`);
