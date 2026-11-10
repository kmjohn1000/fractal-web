// Entry point. Holds init (toolbar accessibility is in toolbar-a11y.js): the first render, the share-link and
// welcome-card handling, and every load-time line that schedules a frame or a callback (they run
// only after every import below has been evaluated). Needs all the other files.
//
// The app's entry ES module and the only script index.html loads (as <script type="module">; modules
// are strict, so no "use strict"); every other file is an ES module it imports. Each of those must be
// listed in exposeForTests below, so tests can read their names (see test-hooks.js). Nothing reads
// this file's own names, so it exports nothing. Every import specifier needs the ?v= query (npm run
// stamp keeps it current): a module is keyed by its full URL, so a differing query loads it twice.
import { exposeForTests } from "./core/test-hooks.js?v=1.80.4";
import * as state from "./core/state.js?v=1.80.4";
import { currentName, els, mode } from "./core/state.js?v=1.80.4";
import * as renderer from "./render/renderer.js?v=1.80.4";
import * as platform from "./core/platform.js?v=1.80.4";
import { Platform } from "./core/platform.js?v=1.80.4";
import * as places from "./fractals/places.js?v=1.80.4";
import * as colormaps from "./render/colormaps.js?v=1.80.4";
import * as lsystem from "./fractals/lsystem.js?v=1.80.4";
import * as vectorgeom from "./render/vectorgeom.js?v=1.80.4";
import * as viewMath from "./core/view-math.js?v=1.80.4";
import * as colorStyles from "./render/color-styles.js?v=1.80.4";
import * as hudFormat from "./ui/hud-format.js?v=1.80.4";
import * as configs from "./core/configs.js?v=1.80.4";
import * as dragon from "./fractals/dragon.js?v=1.80.4";
import * as lcurves from "./fractals/lcurves.js?v=1.80.4";
import * as curveView from "./fractals/curve-view.js?v=1.80.4";
import * as fern from "./fractals/fern.js?v=1.80.4";
import * as ifs from "./fractals/ifs.js?v=1.80.4";
import * as cornerRules from "./fractals/corner-rules.js?v=1.80.4";
import * as chaosRunModule from "./fractals/chaos-run.js?v=1.80.4";
import * as shaders from "./render/shaders.js?v=1.80.4";
import * as koch from "./fractals/koch.js?v=1.80.4";
import * as pythagoras from "./fractals/pythagoras.js?v=1.80.4";
import * as hexaflake from "./fractals/hexaflake.js?v=1.80.4";
import * as diag from "./core/diag.js?v=1.80.4";
import * as fractalDefs from "./fractals/fractal-defs.js?v=1.80.4";
import * as digitFractals from "./fractals/digit-fractals.js?v=1.80.4";
import * as apollonian from "./fractals/apollonian.js?v=1.80.4";
import * as deepzoom from "./core/deepzoom.js?v=1.80.4";
import * as stateColors from "./core/state-colors.js?v=1.80.4";
import * as renderLayout from "./render/render-layout.js?v=1.80.4";
import { layoutCanvasArea, requestRender, updateLUT } from "./render/render-layout.js?v=1.80.4";
import * as hud from "./ui/hud.js?v=1.80.4";
import { refitHud } from "./ui/hud.js?v=1.80.4";
import * as modes from "./ui/modes.js?v=1.80.4";
import { selectFractal } from "./ui/modes.js?v=1.80.4";
import * as interaction from "./ui/interaction.js?v=1.80.4";
import * as vectorInteraction from "./ui/vector-interaction.js?v=1.80.4";
import { VECTOR_VIEWS } from "./ui/vector-interaction.js?v=1.80.4";
import * as compassUi from "./ui/compass-ui.js?v=1.80.4";
import { applyHudVisibility, initWelcomeCard } from "./ui/compass-ui.js?v=1.80.4";
import * as fractalPicker from "./ui/fractal-picker.js?v=1.80.4";
import * as teleport from "./ui/teleport.js?v=1.80.4";
import { coldOpen } from "./ui/teleport.js?v=1.80.4";
import * as patternControls from "./ui/pattern-controls.js?v=1.80.4";
import * as colormapPicker from "./ui/colormap-picker.js?v=1.80.4";
import { updateColorSwatches } from "./ui/colormap-picker.js?v=1.80.4";
import * as colorSheet from "./ui/color-sheet.js?v=1.80.4";
import { fitColorSegment, prepareColorSheet } from "./ui/color-sheet.js?v=1.80.4";
import * as placesSheet from "./ui/places-sheet.js?v=1.80.4";
import * as share from "./ui/share.js?v=1.80.4";
import { applyShareHashFromUrl, applyShareLink, parseShareHash } from "./ui/share.js?v=1.80.4";
import * as shareMenu from "./ui/share-menu.js?v=1.80.4";
import * as reviewPrompt from "./ui/review-prompt.js?v=1.80.4";
import * as penrose from "./fractals/penrose.js?v=1.80.4";
import * as canvasA11y from "./ui/canvas-a11y.js?v=1.80.4";
import * as toolbarA11y from "./ui/toolbar-a11y.js?v=1.80.4"; // last: it attaches its observers on load, after every module above has run

exposeForTests({
  "src/core/platform.js": platform, "src/fractals/places.js": places, "src/render/renderer.js": renderer, "src/core/state.js": state,
  "src/render/shaders.js": shaders, "src/fractals/koch.js": koch, "src/fractals/pythagoras.js": pythagoras, "src/fractals/hexaflake.js": hexaflake,
  "src/core/diag.js": diag, "src/fractals/fractal-defs.js": fractalDefs, "src/fractals/digit-fractals.js": digitFractals,
  "src/fractals/apollonian.js": apollonian, "src/core/deepzoom.js": deepzoom,
  "src/core/configs.js": configs, "src/fractals/dragon.js": dragon, "src/fractals/lcurves.js": lcurves, "src/fractals/curve-view.js": curveView,
  "src/fractals/fern.js": fern, "src/fractals/ifs.js": ifs, "src/fractals/corner-rules.js": cornerRules,
  "src/render/colormaps.js": colormaps, "src/fractals/lsystem.js": lsystem, "src/render/vectorgeom.js": vectorgeom, "src/core/view-math.js": viewMath,
  "src/render/color-styles.js": colorStyles, "src/ui/hud.js": hud, "src/ui/hud-format.js": hudFormat,
  "src/core/state-colors.js": stateColors, "src/render/render-layout.js": renderLayout, "src/ui/modes.js": modes, "src/ui/interaction.js": interaction,
  "src/ui/vector-interaction.js": vectorInteraction,
  "src/ui/compass-ui.js": compassUi, "src/ui/teleport.js": teleport, "src/ui/pattern-controls.js": patternControls, "src/ui/colormap-picker.js": colormapPicker,
  "src/ui/color-sheet.js": colorSheet, "src/ui/places-sheet.js": placesSheet, "src/ui/share.js": share, "src/ui/share-menu.js": shareMenu,
  "src/fractals/chaos-run.js": chaosRunModule,
  "src/ui/review-prompt.js": reviewPrompt, "src/fractals/penrose.js": penrose, "src/ui/toolbar-a11y.js": toolbarA11y, "src/ui/canvas-a11y.js": canvasA11y, "src/ui/fractal-picker.js": fractalPicker,
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

// Service workers only register on secure origins or localhost, so this is
// a silent no-op during phone-over-LAN dev testing (plain http://<lan-ip>)
// and only takes effect once this is actually deployed behind HTTPS.
// The iOS app bundles its files, so it has no use for one. (This was an inline
// script after app.js; it moved here because it reads Platform, which is a module now.)
if ("serviceWorker" in navigator && !Platform.isNative) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      reportError(`Service worker registration failed: ${err.message}`);
    });
  });
}
