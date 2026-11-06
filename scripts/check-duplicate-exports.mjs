// Fails when two app modules export the same name; run by `npm run lint`.
//
// test-hooks.js exposes every module's exports as one flat set of window getters and throws
// ("test hook: "x" is exported by both a.js and b.js") on a repeat, but only when the hook is on
// (under automation), so a duplicate would otherwise show up as a page error in the next spec run.
// This catches it statically, over the same files the hook sees: the ones app.js lists in its
// exposeForTests call. `export default` is out of scope (the hook would expose it as "default";
// no app module has one). Like the hook, it counts a re-export (`export { x } from "./y.js"`) as
// an export of the re-exporting file, so re-exporting a name another listed file also exports is
// flagged too. Uses espree, which eslint brings in (it is not a direct dependency of this repo).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as espree from "espree";

const root = new URL("..", import.meta.url).pathname;
const read = (f) => readFileSync(join(root, f), "utf8");

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

const nameOf = (n) => (n.type === "Literal" ? String(n.value) : n.name); // export { x as "string name" }

// The names a module file exports, as the namespace object's keys would list them.
// `seen` guards an `export *` cycle.
function exportedNames(file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const ast = espree.parse(read(file), { ecmaVersion: "latest", sourceType: "module" });
  const names = [];
  for (const node of ast.body) {
    if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) {
        const d = node.declaration;
        if (d.type === "VariableDeclaration") d.declarations.forEach((v) => names.push(...patternNames(v.id)));
        else names.push(d.id.name); // function, class
      } else {
        node.specifiers.forEach((s) => names.push(nameOf(s.exported))); // export { a, b as c } [from "x"]
      }
    } else if (node.type === "ExportAllDeclaration") {
      if (node.exported) names.push(nameOf(node.exported)); // export * as ns from "x"
      else names.push(...exportedNames(join(dirname(file), node.source.value), seen)); // export * from "x"
    }
  }
  return names;
}

// The files app.js hands to exposeForTests ("file.js": namespace entries).
function exposedFiles() {
  return [...read("src/app.js").matchAll(/exposeForTests\(\{([\s\S]*?)\}\)/g)]
    .flatMap((m) => [...m[1].matchAll(/"([^"]+\.js)"\s*:/g)].map((k) => k[1]));
}

// Every duplicated name with the files that export it.
function duplicateExports(files) {
  const owners = new Map();
  for (const file of files) {
    for (const name of new Set(exportedNames(file))) {
      if (!owners.has(name)) owners.set(name, []);
      owners.get(name).push(file);
    }
  }
  return [...owners].filter(([, fs]) => fs.length > 1);
}

const files = exposedFiles();
if (!files.length) {
  console.error("check-duplicate-exports: found no files in app.js's exposeForTests call (did its shape change?)");
  process.exit(1);
}
const dupes = duplicateExports(files);
if (dupes.length) {
  console.error(dupes.map(([name, fs]) => `check-duplicate-exports: "${name}" is exported by both ${fs.join(" and ")}`).join("\n"));
  process.exit(1);
}
console.log(`check-duplicate-exports: ok (${files.length} module files, no name exported twice)`);
