// Makes the app's names readable from tests and scripts as bare identifiers (`mainState`, `placeId`,
// ...), the way they were when every file was a plain script: page.evaluate(() => mainState.cx).
// app.js passes in every module's namespace; each export becomes a getter on window, so it reads the
// live binding (a `let` that changes is seen changed). Reading only: a module's variables are
// assigned through its setter functions (setMainState, ...), which are exports like any other.
//
// Active only under automation (navigator.webdriver, which Playwright sets in Chromium and WebKit)
// or when localStorage "fractalAtlas.test" is "1" (to use it from a real browser's console), so
// visitors get no extra globals. Runs synchronously from app.js, so it is ready before `load`.
//
// The namespaces must come from the importing module itself (app.js), not from imports made here:
// a module is keyed by its full URL, and "./x.js?v=1" and "./x.js" are two separate instances.
export function exposeForTests(namespaces) {
  let on = navigator.webdriver === true;
  try { on = on || localStorage.getItem("fractalAtlas.test") === "1"; } catch { /* storage blocked */ }
  if (!on) return;
  const owner = new Map(); // export name -> the file that exports it
  for (const [file, ns] of Object.entries(namespaces)) {
    for (const name of Object.keys(ns)) {
      if (owner.has(name)) throw new Error(`test hook: "${name}" is exported by both ${owner.get(name)} and ${file}`);
      owner.set(name, file);
      if (Object.getOwnPropertyDescriptor(window, name)) continue; // already global (reportError, an old bridge)
      Object.defineProperty(window, name, { get: () => ns[name], configurable: true });
    }
  }
  window.__faHooks = owner.size; // how many names are exposed; also tells a test the hook is on
}
