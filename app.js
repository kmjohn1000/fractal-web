// Entry point; must load last. Holds toolbar accessibility and init: the first render, the share-link
// and welcome-card handling, and every load-time line that schedules a frame or a callback (they
// run only after all scripts above have loaded). Needs all the other scripts.
//
// The app's entry ES module (loaded as <script type="module">; modules are strict, so no "use
// strict"). It still reads the plain scripts' names as globals, which works because a module runs
// after every plain script, and it imports the files that have become modules. Each of those must be
// listed in exposeForTests below, so tests can read their names (see test-hooks.js). Nothing reads
// this file's own names, so it exports nothing. Every import specifier needs the ?v= query (npm run
// stamp keeps it current): a module is keyed by its full URL, so a differing query loads it twice.
import { exposeForTests } from "./test-hooks.js?v=1.53.6";
import * as placesSheet from "./places-sheet.js?v=1.53.6";

exposeForTests({ "places-sheet.js": placesSheet });

// ---------------------------------------------------------------- toolbar accessibility

// Toggle buttons and popovers change state by toggling "active"/"open" at
// many call sites, so one observer per element mirrors that state into
// ARIA instead: aria-pressed on the toggles, aria-expanded on each popover's
// opener buttons. A popover that opens gets focus on its current (or
// first) item; one that closes with focus inside hands it back to the
// button that opened it. Escape closes whichever popover is open.
const TOGGLE_BUTTONS = [els.dualBtn, els.boxZoomBtn, els.fernBoxZoomBtn, els.kochFillBtn, ...document.querySelectorAll(".hudToggleBtn")];
for (const btn of TOGGLE_BUTTONS) {
  const sync = () => btn.setAttribute("aria-pressed", String(btn.classList.contains("active")));
  sync();
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ["class"] });
}

const POPOVERS = [
  { menu: els.fractalTypeRow, openers: [...document.querySelectorAll(".fractalMenuBtn")] },
  { menu: els.colormapMenu, openers: [els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.hexaflakeColormapBtn, els.dragonColormapBtn, els.fernColorBtn] },
  { menu: els.colorSheet, openers: [els.colormapBtn] },
  { menu: els.placesSheet, openers: [...document.querySelectorAll("[data-opens-places]")] },
  { menu: els.shareMenu, openers: [...document.querySelectorAll(".shareBtn")] },
];
for (const p of POPOVERS) {
  let opener = null;
  for (const btn of p.openers) {
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => { opener = btn; });
  }
  let wasOpen = false;
  new MutationObserver(() => {
    const open = p.menu.classList.contains("open");
    if (open === wasOpen) return;
    wasOpen = open;
    for (const btn of p.openers) btn.setAttribute("aria-expanded", String(open));
    if (open) {
      const item = p.menu.querySelector("button.active:not(.hidden)") || p.menu.querySelector("button:not(.hidden)");
      item?.focus({ preventScroll: true });
    } else if (p.menu.contains(document.activeElement) || document.activeElement === document.body) {
      // Picking a fractal can switch modes, hiding the row the opener was
      // in: fall back to the same button in the row now showing.
      const target = opener?.offsetParent ? opener : p.openers.find((b) => b.offsetParent);
      target?.focus({ preventScroll: true });
    }
  }).observe(p.menu, { attributes: true, attributeFilter: ["class"] });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = POPOVERS.find((p) => p.menu.classList.contains("open"));
  if (!open) return;
  e.preventDefault();
  open.menu.classList.remove("open");
});

function flashLabel(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; closeShareMenu(); }, 1500);
}

els.shareSaveBtn.textContent = Platform.saveImageLabel;
els.shareSaveBtn.addEventListener("click", async () => {
  try {
    const saved = await Platform.saveImage(await pendingCapture, shareFileName());
    if (saved) flashLabel(els.shareSaveBtn, "Saved!");
    else closeShareMenu();
  } catch (err) {
    closeShareMenu();
    reportError(`Save image failed: ${err && err.message ? err.message : err}`);
  }
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard needs a secure context (not the LAN dev server).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

Diag.setCopy(copyText);
if (Platform.canShare) Diag.setShare((text) => Platform.share({ title: "Fractal Atlas diagnostics", text }));

els.shareCopyBtn.addEventListener("click", async () => {
  const ok = await copyText(buildShareUrl());
  flashLabel(els.shareCopyBtn, ok ? "Copied!" : "Copy failed");
});

els.shareNativeBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  closeShareMenu();
  try {
    await Platform.share({ blob: await pendingCapture, fileName: shareFileName(), url, title: "Fractal Atlas" });
  } catch (err) {
    reportError(`Share failed: ${err && err.message ? err.message : err}`);
  }
});

// Pasting a different link into an open tab only changes the hash.
window.addEventListener("hashchange", applyShareHashFromUrl);

// ---------------------------------------------------------------- init

// Everything that can schedule a frame or a callback at load lives here, in
// the last script, so nothing can run before all the scripts above have
// loaded (these were top-level lines in the sections above; same order).
applyHudVisibility();
(window.requestIdleCallback || ((f) => setTimeout(f, 1000)))(prepareColorSheet, { timeout: 3000 });
if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitColorSegment).observe(els.colorSheet);
window.addEventListener("resize", () => { layoutCanvasArea(); refitHud(); requestRender(); });
// The toolbar is in flow under the canvas, so the canvas area also changes
// size without a window resize (e.g. a mode's control row wrapping
// differently, or the text size changing); re-lay out and re-render then too.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => { layoutCanvasArea(); refitHud(); requestRender(); }).observe(els.canvasArea);
  // A change of the text size (iOS Larger Text, --text-scale) moves the toolbar's rows but not
  // always the canvas area's height; the 1rem probe's width follows it.
  new ResizeObserver(() => { refitHud(); requestRender(); }).observe(els.remProbe);
}

updateLUT(); // first: Carpet/Gasket renders read the LUT on the CPU
selectFractal(currentName, { fresh: true });
updateColorSwatches();
requestRender();
// Read before applyShareHashFromUrl strips the hash: a visitor who arrived
// by share link gets that view, not the cold open.
const arrivedByLink = !!parseShareHash(location.hash);
applyShareHashFromUrl();
Platform.onOpenUrl(applyShareLink); // before hideLaunchScreen, which waits on it
if (!arrivedByLink && Platform.welcome.isFirstVisit()) coldOpen();
Platform.welcome.markVisited();
initWelcomeCard();
// requestRender draws on the next animation frame; one frame after that it
// has been painted, so the app's launch screen can fade into it (no-op on
// the web, see platform.js).
requestAnimationFrame(() => requestAnimationFrame(() => Platform.hideLaunchScreen()));

// One-shot layout diagnostic: if the canvas collapsed to near-zero size
// (a CSS/flexbox bug) nothing will be visible even though no JS error
// was thrown, so surface that case explicitly too. Checks the canvas the
// current mode shows: a share link that opens a vector mode hides
// mainCanvas (display: none, so 0x0), which is correct, not a collapse.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = mode === "fractal" ? els.mainCanvas : VECTOR_VIEWS[mode][1];
  if (c.clientWidth < 4 || c.clientHeight < 4) {
    reportError(`Diagnostic: ${c.id} has collapsed to ${c.clientWidth}x${c.clientHeight} CSS px (canvasArea: ${els.canvasArea.clientWidth}x${els.canvasArea.clientHeight}). This is a layout bug, not a rendering bug.`);
  }
}));
