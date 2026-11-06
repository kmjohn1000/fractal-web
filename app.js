// Entry point. Holds init (toolbar accessibility is in toolbar-a11y.js): the first render, the share-link and
// welcome-card handling, and every load-time line that schedules a frame or a callback (they run
// only after every import below has been evaluated). Needs all the other files.
//
// The app's entry ES module and the only script index.html loads (as <script type="module">; modules
// are strict, so no "use strict"); every other file is an ES module it imports. Each of those must be
// listed in exposeForTests below, so tests can read their names (see test-hooks.js). Nothing reads
// this file's own names, so it exports nothing. Every import specifier needs the ?v= query (npm run
// stamp keeps it current): a module is keyed by its full URL, so a differing query loads it twice.
import { exposeForTests } from "./test-hooks.js?v=1.70.4";
import * as state from "./state.js?v=1.70.4";
import { currentName, els, mode } from "./state.js?v=1.70.4";
import * as renderer from "./renderer.js?v=1.70.4";
import * as platform from "./platform.js?v=1.70.4";
import { Platform } from "./platform.js?v=1.70.4";
import * as places from "./places.js?v=1.70.4";
import * as colormaps from "./colormaps.js?v=1.70.4";
import * as lsystem from "./lsystem.js?v=1.70.4";
import * as vectorgeom from "./vectorgeom.js?v=1.70.4";
import * as viewMath from "./view-math.js?v=1.70.4";
import * as colorStyles from "./color-styles.js?v=1.70.4";
import * as hudFormat from "./hud-format.js?v=1.70.4";
import * as configs from "./configs.js?v=1.70.4";
import * as dragon from "./dragon.js?v=1.70.4";
import * as lcurves from "./lcurves.js?v=1.70.4";
import * as curveView from "./curve-view.js?v=1.70.4";
import * as fern from "./fern.js?v=1.70.4";
import * as ifs from "./ifs.js?v=1.70.4";
import * as cornerRules from "./corner-rules.js?v=1.70.4";
import * as chaosRunModule from "./chaos-run.js?v=1.70.4";
import * as shaders from "./shaders.js?v=1.70.4";
import * as koch from "./koch.js?v=1.70.4";
import * as pythagoras from "./pythagoras.js?v=1.70.4";
import * as hexaflake from "./hexaflake.js?v=1.70.4";
import * as diag from "./diag.js?v=1.70.4";
import * as fractalDefs from "./fractal-defs.js?v=1.70.4";
import * as digitFractals from "./digit-fractals.js?v=1.70.4";
import * as apollonian from "./apollonian.js?v=1.70.4";
import * as deepzoom from "./deepzoom.js?v=1.70.4";
import * as stateColors from "./state-colors.js?v=1.70.4";
import * as renderLayout from "./render-layout.js?v=1.70.4";
import { layoutCanvasArea, requestRender, updateLUT } from "./render-layout.js?v=1.70.4";
import * as hud from "./hud.js?v=1.70.4";
import { refitHud } from "./hud.js?v=1.70.4";
import * as modes from "./modes.js?v=1.70.4";
import { selectFractal } from "./modes.js?v=1.70.4";
import * as interaction from "./interaction.js?v=1.70.4";
import * as vectorInteraction from "./vector-interaction.js?v=1.70.4";
import { VECTOR_VIEWS } from "./vector-interaction.js?v=1.70.4";
import * as compassUi from "./compass-ui.js?v=1.70.4";
import { applyHudVisibility, initWelcomeCard } from "./compass-ui.js?v=1.70.4";
import * as fractalPicker from "./fractal-picker.js?v=1.70.4";
import * as teleport from "./teleport.js?v=1.70.4";
import { coldOpen } from "./teleport.js?v=1.70.4";
import * as patternControls from "./pattern-controls.js?v=1.70.4";
import * as colormapPicker from "./colormap-picker.js?v=1.70.4";
import { updateColorSwatches } from "./colormap-picker.js?v=1.70.4";
import * as colorSheet from "./color-sheet.js?v=1.70.4";
import { fitColorSegment, prepareColorSheet } from "./color-sheet.js?v=1.70.4";
import * as placesSheet from "./places-sheet.js?v=1.70.4";
import * as share from "./share.js?v=1.70.4";
import { applyShareHashFromUrl, applyShareLink, parseShareHash } from "./share.js?v=1.70.4";
import * as shareMenu from "./share-menu.js?v=1.70.4";
import * as reviewPrompt from "./review-prompt.js?v=1.70.4";
import * as penrose from "./penrose.js?v=1.70.4";
import * as toolbarA11y from "./toolbar-a11y.js?v=1.70.4"; // last: it attaches its observers on load, after every module above has run

exposeForTests({
  "platform.js": platform, "places.js": places, "renderer.js": renderer, "state.js": state,
  "shaders.js": shaders, "koch.js": koch, "pythagoras.js": pythagoras, "hexaflake.js": hexaflake,
  "diag.js": diag, "fractal-defs.js": fractalDefs, "digit-fractals.js": digitFractals, "apollonian.js": apollonian, "deepzoom.js": deepzoom,
  "configs.js": configs, "dragon.js": dragon, "lcurves.js": lcurves, "curve-view.js": curveView, "fern.js": fern, "ifs.js": ifs, "corner-rules.js": cornerRules,
  "colormaps.js": colormaps, "lsystem.js": lsystem, "vectorgeom.js": vectorgeom, "view-math.js": viewMath, "color-styles.js": colorStyles, "hud.js": hud, "hud-format.js": hudFormat,
  "state-colors.js": stateColors, "render-layout.js": renderLayout, "modes.js": modes, "interaction.js": interaction, "vector-interaction.js": vectorInteraction,
  "compass-ui.js": compassUi, "teleport.js": teleport, "pattern-controls.js": patternControls, "colormap-picker.js": colormapPicker,
  "color-sheet.js": colorSheet, "places-sheet.js": placesSheet, "share.js": share, "share-menu.js": shareMenu, "chaos-run.js": chaosRunModule,
  "review-prompt.js": reviewPrompt, "penrose.js": penrose, "toolbar-a11y.js": toolbarA11y, "fractal-picker.js": fractalPicker,
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
