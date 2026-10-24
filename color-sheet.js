// Color sheet: the Looks and Custom tabs (style, bands, shift, palette) and the shader-variant
// warm-up. Needs the state, COLOR_STYLES (state-colors.js), compass-ui.js (syncSliderFill) and
// colormap-picker.js (cmGradient). app.js's init schedules prepareColorSheet and fitColorSegment.
"use strict";

// ---------------------------------------------------------------- color sheet

// The Looks: a style with a palette, at the neutral bands and shift. Their
// swatches are icons/looks/sprite.webp (scripts/render_look_thumbs.mjs).
// Picking one changes the palette, and the color button shows it.
// "Default" is today's coloring (Smooth on Inferno): the tile that gets you
// back to how the app starts. A palette alone isn't a Look; the palettes are
// in the Custom tab. The grid has room for more Looks.
const COLOR_LOOKS = [
  { id: "default", label: "Default", style: "smooth", palette: "Inferno" },
  { id: "edge-glow", label: "Edge glow", style: "glow", palette: "Inferno" },
  { id: "stripes", label: "Stripes", style: "stripes", palette: "Glacier" },
  { id: "bands", label: "Bands", style: "bands", palette: "Turbo" },
  { id: "orbs", label: "Orbs", style: "point", palette: "Twilight" },
  { id: "rays", label: "Rays", style: "cross", palette: "Plasma" },
  { id: "relief", label: "Relief", style: "relief", palette: "Classic" },
];
let colorSheetTab = "looks";

// The sheet is the palette list on every fractal; the escape-time fractals get
// the styles, Looks and sliders with it, the rest (Newton, Carpet, Gasket,
// Apollonian, which color by their own schemes) only the palette grid.
function colorSheetApplies() {
  return mode === "fractal";
}
function colorSheetStyles() {
  return colorSheetApplies() && ESCAPE_TIME_TYPES.includes(mainState.ftype);
}

// The Look the current choices amount to, or null (Custom). What the view
// draws counts, not what was chosen: on Phoenix a Cross choice draws Smooth.
function currentLookId() {
  if (colorStyle.density !== 1 || colorStyle.offset !== 0) return null;
  const palette = COLORMAPS[colormapIndex].name;
  const drawn = styleDrawn(colorStyle.style, mainState);
  const look = COLOR_LOOKS.find((l) => l.style === drawn && l.palette === palette);
  return look ? look.id : null;
}

function applyLook(look) {
  colormapIndex = COLORMAPS.findIndex((c) => c.name === look.palette);
  updateLUT();
  setColorStyle({ style: look.style, density: 1, offset: 0 });
  requestRender();
}

function colorSheetEl(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    // ARIA states are the strings "true" and "false"; other attributes are
    // omitted when false (so `disabled: false` leaves the button enabled).
    if (/^aria-(checked|selected|disabled|expanded|pressed)$/.test(k) && typeof v === "boolean") node.setAttribute(k, String(v));
    else if (v === false || v === null || v === undefined) continue;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  node.append(...children);
  return node;
}

// "<b>Point</b> and <b>Cross</b>" as nodes.
function boldList(styles) {
  const out = [];
  styles.forEach((s, i) => {
    if (i > 0) out.push(i === styles.length - 1 ? " and " : ", ");
    out.push(colorSheetEl("b", {}, s.label));
  });
  return out;
}

// Says why some styles are greyed out right now, or null if none are. Each tab
// has its own copy (`where` is "looks" or "custom": the ids can't repeat), and
// it names the styles in the words the tiles and the segments use.
function colorSheetNote(where) {
  const byType = COLOR_STYLES.filter((s) => styleBlocked(s, mainState) === "type");
  const byDepth = COLOR_STYLES.filter((s) => styleBlocked(s, mainState) === "depth");
  if (!byType.length && !byDepth.length) return null;
  const note = colorSheetEl("p", { class: "note", id: `colorSheetNote-${where}` });
  if (byDepth.length) {
    // Says how far off the view is: from a Surprise-me place, billions of
    // times deep, getting back under the limit takes a long pinch out.
    note.append(...boldList(byDepth), ` only draw in views under ${COLOR_STYLES.find((s) => s.maxZoom).maxZoom.toLocaleString("en-US")}× deep. This one is ${zoomPhrase(mainState.baseScale, mainState.scale)}.`);
  }
  if (byType.length) {
    if (byDepth.length) note.append(" ");
    note.append(...boldList(byType), ` aren't available for ${fractalLabel(currentName)}.`);
  }
  return note;
}

// The Looks' swatches are cut from one sprite, icons/looks/sprite.webp (the
// Looks in COLOR_LOOKS order; scripts/render_look_thumbs.mjs):
// one file to fetch and decode, drawn as a CSS background so a rebuilt tile
// costs nothing, and sharp at any pixel density.
const LOOK_SWATCHES = COLOR_LOOKS.length;
function lookSwatch(index) {
  const x = LOOK_SWATCHES > 1 ? (index * 100) / (LOOK_SWATCHES - 1) : 0;
  return colorSheetEl("span", { class: "swatch", "aria-hidden": "true", style: `background-size:${LOOK_SWATCHES * 100}% 100%;background-position:${x}% 0` });
}
// While the app is idle after it loads (the sprite isn't otherwise asked for
// until the sheet is first opened, over the network on the website, where the
// service worker also revalidates each file): fetch and decode it, and build
// the sheet, so opening it later is only showing it. The Image is kept so the
// decoded picture stays in memory.
let lookSpriteImage = null;
function prepareColorSheet() {
  lookSpriteImage = new Image();
  lookSpriteImage.src = "icons/looks/sprite.webp";
  lookSpriteImage.decode?.().catch(() => {});
  // Not while the sheet is open: this runs a few seconds after load, and someone
  // who has already opened it and switched tabs must not be sent back to the
  // opening tab, nor have the controls under their finger rebuilt.
  if (colorSheetApplies() && !els.colorSheet.classList.contains("open")) {
    colorSheetTab = colorSheetOpeningTab();
    renderColorSheet();
  }
  warmColorVariants();
}

// Compiling the color styles' shader variants ahead of the pick. Each style
// with per-iteration work (Glow, Stripes, the traps) is its own program, built
// the first time it's drawn; on a phone that compile is a visible stall at the
// tap. So once the app is idle, and again whenever the Color sheet opens, the
// variants this fractal can use are built for the main pane, and for the
// Julia pane too where dual view is offered: one at a time, each in an idle
// moment (or started off the main thread where the browser can), never while
// a gesture or a flight is on.
const warmQueue = [];
let warmRunning = false;
function warmColorVariants() {
  if (mode !== "fractal" || !ESCAPE_TIME_TYPES.includes(mainState.ftype)) return;
  const variants = [...new Set(COLOR_STYLES
    .filter((s) => s.variant && (s.types || ESCAPE_TIME_TYPES).includes(mainState.ftype)).map((s) => s.variant))];
  const jobs = variants.map((v) => [mainRenderer, v]);
  if (FRACTAL_CONFIGS[currentName].dual) jobs.push(...variants.map((v) => [juliaRenderer, v]));
  warmQueue.splice(0, warmQueue.length, ...jobs.filter(([r, v]) => !r.compiledVariants.includes(v)));
  if (warmQueue.length && !warmRunning) { warmRunning = true; warmNextVariant(); }
}
function warmNextVariant() {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  idle(() => {
    if (isInteracting) { setTimeout(warmNextVariant, 400); return; }
    const job = warmQueue[0];
    if (!job) { warmRunning = false; return; }
    let state = "ready";
    try { state = job[0].warmVariant(job[1]); } catch (e) { console.warn("Shader warm-up failed:", e); }
    if (state === "ready") warmQueue.shift();
    if (warmQueue.length) setTimeout(warmNextVariant, state === "pending" ? 60 : 0);
    else warmRunning = false;
  }, { timeout: 2500 });
}
// (prepareColorSheet is scheduled at the start of init.)

// A greyed-out Look says why when it's tapped: the note under the grid lights
// up briefly.
function flashColorSheetNote() {
  const note = els.colorSheet.querySelector(".panel.current .note");
  if (!note) return;
  note.scrollIntoView({ block: "nearest" });
  note.classList.remove("flash");
  void note.offsetWidth; // restart the animation
  note.classList.add("flash");
}

// The arrow keys move focus between the radios of a group, which has one tab
// stop (the checked one, else the first), so the Custom tab isn't 18 stops.
// Enter or Space picks, as for any button.
function rovingRadios(group) {
  const radios = [...group.querySelectorAll('[role="radio"]')].filter((r) => !r.disabled);
  const stop = radios.find((r) => r.getAttribute("aria-checked") === "true") || radios[0];
  radios.forEach((r) => r.setAttribute("tabindex", r === stop ? "0" : "-1"));
  group.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    const i = radios.indexOf(document.activeElement);
    if (!step || i < 0) return;
    e.preventDefault();
    const next = radios[(i + step + radios.length) % radios.length];
    next.setAttribute("tabindex", "0");
    radios[i].setAttribute("tabindex", "-1");
    next.focus();
  });
}

// The Looks: every one on screen at once, in a grid (four across on a phone,
// all in one row on an iPad), so none is hidden and the tab is as tall as
// Custom. None is checked when the settings match no Look.
function colorSheetLooks() {
  const active = currentLookId();
  const grid = colorSheetEl("div", { class: "looks", role: "radiogroup", "aria-label": "Looks" });
  COLOR_LOOKS.forEach((look, i) => {
    const blocked = styleBlocked(COLOR_STYLES.find((s) => s.id === look.style), mainState);
    const tile = colorSheetEl("button", {
      class: `pickTile${active === look.id ? " active" : ""}`, role: "radio", "aria-checked": active === look.id,
      "aria-disabled": blocked ? "true" : false, "aria-describedby": blocked ? "colorSheetNote-looks" : false, "data-key": `look-${look.id}`,
    }, lookSwatch(i), colorSheetEl("span", {}, look.label));
    tile.addEventListener("click", () => {
      if (blocked) { flashColorSheetNote(); return; }
      applyLook(look);
      renderColorSheet();
    });
    grid.append(tile);
  });
  rovingRadios(grid);
  return [grid, colorSheetNote("looks")];
}

// The slider for bands is logarithmic: 0.25x to 8x with 1x (today's coloring) in the middle, snapped.
const BANDS_SLIDER = { min: Math.log2(COLOR_BANDS_RANGE[0]), max: Math.log2(COLOR_BANDS_RANGE[1]), step: 0.05 };
function bandsText(density) { return `${Number(density.toFixed(2))}×`; }
function shiftText(offset) { return `${Math.round(offset * 100)}%`; }

// Every palette at once in a wrapping grid, so nothing needs scrolling: each
// swatch is its own gradient, named for assistive tech (and the line above
// says the current one), the current one ringed and ticked.
function colorSheetPalettes() {
  const pals = colorSheetEl("div", { class: "pals", role: "radiogroup", "aria-label": "Palette" });
  COLORMAPS.forEach((c, i) => {
    const btn = colorSheetEl("button", {
      class: `pal${i === colormapIndex ? " active" : ""}`, role: "radio", "aria-checked": i === colormapIndex, "aria-label": c.name,
      title: c.name, "data-key": `pal-${i}`, style: `background:${cmGradient(c.stops)}`,
    });
    btn.addEventListener("click", () => { colormapIndex = i; updateLUT(); requestRender(); renderColorSheet(); });
    pals.append(btn);
  });
  rovingRadios(pals);
  return pals;
}

// "Palette  Inferno" and, on the Custom tab while anything differs from the
// Default (style, palette, repeat or shift), a Reset that puts all four back.
function colorSheetPaletteHead(withReset) {
  const reset = withReset
    ? colorSheetEl("button", { class: `reset${currentLookId() === "default" ? " off" : ""}`, "data-key": "reset", "aria-label": "Reset to Default" }, "Reset") : null;
  reset?.addEventListener("click", () => { applyLook(COLOR_LOOKS[0]); renderColorSheet(); });
  return colorSheetEl("div", { class: "palHead" },
    ...[colorSheetEl("p", {}, colorSheetEl("span", {}, "Palette"), colorSheetEl("b", {}, COLORMAPS[colormapIndex].name)), reset].filter(Boolean));
}
// The sliders don't rebuild the sheet while they move; this shows or hides
// Reset as the settings leave or return to the Default.
function syncColorSheetReset() {
  els.colorSheet.querySelector(".reset")?.classList.toggle("off", currentLookId() === "default");
}

// A slider with its value on screen, not only for VoiceOver (the output is
// hidden from it: the slider already speaks its value).
function colorSheetSlider(name, label, min, max, step, value, text, onInput) {
  const input = colorSheetEl("input", { type: "range", min, max, step, "aria-label": name, "aria-valuetext": text(value) });
  const out = colorSheetEl("output", { class: "val", "aria-hidden": "true" }, text(value));
  input.value = value;
  syncSliderFill(input);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    syncSliderFill(input);
    input.setAttribute("aria-valuetext", text(v));
    out.textContent = text(v);
    onInput(v);
    syncColorSheetReset();
  });
  return colorSheetEl("label", { class: "field" }, colorSheetEl("span", { class: "name" }, label), input, out);
}

function colorSheetCustom() {
  // What the view draws is what shows as chosen: on Phoenix a Cross choice is
  // kept (it comes back on Mandelbrot) but Smooth is the one drawn.
  const drawn = styleDrawn(colorStyle.style, mainState);
  const seg = colorSheetEl("div", { class: "seg", role: "radiogroup", "aria-label": "Style" });
  for (const s of COLOR_STYLES) {
    const blocked = styleBlocked(s, mainState);
    const btn = colorSheetEl("button", {
      class: drawn === s.id ? "active" : "", role: "radio", "aria-checked": drawn === s.id,
      disabled: !!blocked, "aria-describedby": blocked ? "colorSheetNote-custom" : false, "data-key": `style-${s.id}`,
    }, s.label);
    btn.addEventListener("click", () => { setColorStyle({ style: s.id }); renderColorSheet(); });
    seg.append(btn);
  }
  rovingRadios(seg);
  return [
    colorSheetEl("div", { class: "colA" }, ...[seg, colorSheetNote("custom"), colorSheetPaletteHead(true), colorSheetPalettes()].filter(Boolean)),
    colorSheetEl("div", { class: "colB" },
      colorSheetSlider("Color repeat", "Repeat", BANDS_SLIDER.min, BANDS_SLIDER.max, BANDS_SLIDER.step, Math.log2(colorStyle.density),
        (v) => bandsText(2 ** v), (v) => setColorStyle({ density: Math.abs(v) < 0.03 ? 1 : 2 ** v })),
      colorSheetSlider("Color shift", "Shift", 0, 0.99, 0.01, colorStyle.offset, shiftText, (v) => setColorStyle({ offset: v }))),
  ];
}

// Everything the sheet's contents depend on: when it hasn't changed since the
// sheet was built, opening it again keeps the DOM it has.
function colorSheetStateKey() {
  return JSON.stringify([
    colorSheetTab, colorSheetStyles(), colorStyle.style, colorStyle.density, colorStyle.offset, colormapIndex, currentName,
    COLOR_STYLES.map((s) => styleBlocked(s, mainState) || "").join(","),
  ]);
}

// The tab the sheet opens on: Looks if the settings are one of them, else Custom.
function colorSheetOpeningTab() {
  return currentLookId() ? "looks" : "custom";
}

// Rebuilds the sheet for the current state (unless it is already built for
// it), keeping the focused control and the scroll position (the sliders aren't
// rebuilt while dragged, see their input handlers). Both tabs are always
// built and stacked in one grid cell, the one not shown hidden, so the sheet
// is as tall as the taller tab whichever is up and the tab bar never moves.
// A fractal the styles don't apply to gets only the palette grid.
function renderColorSheet() {
  const sheet = els.colorSheet;
  const key = colorSheetStateKey();
  if (sheet.dataset.stateKey === key && sheet.firstChild) return;
  sheet.dataset.stateKey = key;
  const focusKey = document.activeElement?.dataset?.key;
  const scrollTop = sheet.scrollTop;
  const done = colorSheetEl("button", { class: "done", "data-key": "done" }, "Done");
  done.addEventListener("click", () => els.colorSheet.classList.remove("open"));
  if (!colorSheetStyles()) {
    sheet.classList.add("paletteOnly");
    sheet.replaceChildren(
      colorSheetEl("div", { class: "head" }, colorSheetEl("p", { class: "title" }, "Color"), done),
      colorSheetEl("div", { class: "panels" }, colorSheetEl("div", { class: "panel current", role: "group", "aria-label": "Palette" },
        colorSheetPaletteHead(false), colorSheetPalettes())),
    );
  } else {
    sheet.classList.remove("paletteOnly");
    const tabs = colorSheetEl("div", { class: "tabs", role: "tablist" });
    const panels = colorSheetEl("div", { class: "panels" });
    for (const [id, label, build] of [["looks", "Looks", colorSheetLooks], ["custom", "Custom", colorSheetCustom]]) {
      const current = colorSheetTab === id;
      const tab = colorSheetEl("button", {
        class: current ? "active" : "", role: "tab", "aria-selected": current, id: `colorTab-${id}`, "aria-controls": `colorPanel-${id}`,
        tabindex: current ? false : "-1", "data-key": `tab-${id}`,
      }, label);
      tab.addEventListener("click", () => { colorSheetTab = id; renderColorSheet(); });
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        colorSheetTab = id === "looks" ? "custom" : "looks";
        renderColorSheet();
        els.colorSheet.querySelector(`[data-key=tab-${colorSheetTab}]`)?.focus();
      });
      tabs.append(tab);
      panels.append(colorSheetEl("div", {
        class: `panel${current ? " current" : ""}`, role: "tabpanel", id: `colorPanel-${id}`, "aria-labelledby": `colorTab-${id}`, "data-panel": id,
      }, ...build().filter(Boolean)));
    }
    sheet.replaceChildren(colorSheetEl("div", { class: "head" }, tabs, done), panels);
  }
  sheet.scrollTop = scrollTop;
  fitColorSegment();
  if (focusKey) sheet.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

// The style segments: all seven in one row when every name fits its cell (a
// word wider than its cell would overflow, which is what's measured), else
// four and three. Measured on the open sheet, so it runs after it opens, after
// a rebuild and when the sheet's width changes (a rotation, the text size).
function fitColorSegment() {
  const seg = els.colorSheet.querySelector(".seg");
  if (!seg || !els.colorSheet.classList.contains("open")) return;
  const count = seg.children.length;
  const columns = (n) => { seg.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`; };
  columns(count);
  if ([...seg.children].some((b) => b.scrollWidth > b.clientWidth + 1)) columns(Math.ceil(count / 2));
}
// (fitColorSegment is observed from the start of init.)

function openColorSheet() {
  colorSheetTab = colorSheetOpeningTab();
  renderColorSheet();
  els.colorSheet.classList.add("open");
  fitColorSegment();
  warmColorVariants();
}

// Closing: Done, the color button, Escape, or a plain TAP on the fractal. A
// drag, pinch or twist on it leaves the sheet open, so you can move to another
// spot and watch a style change live. Anything else outside the sheet (a
// toolbar button, a slider) closes it at once, as before. The tap that closes
// it is consumed: in dual view it doesn't also glide the view to where it
// landed (see colorSheetTapClosedAt in the tap-to-recenter check).
const SHEET_TAP_MAX_MOVE = 8; // CSS px
const SHEET_TAP_MAX_MS = 300;
let sheetTap = null; // { id, x, y, t, dead } for the finger on the fractal
let colorSheetTapClosedAt = -1e9;
function colorSheetTapJustClosed() { return performance.now() - colorSheetTapClosedAt < 150; }
document.addEventListener("pointerdown", (e) => {
  if (!els.colorSheet.classList.contains("open")) return;
  if (els.colorSheet.contains(e.target) || e.target.closest("[aria-haspopup]")) return;
  if (e.target.tagName === "CANVAS") {
    // A second finger down means a pinch or twist, never a tap.
    if (sheetTap) sheetTap.dead = true;
    else sheetTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dead: false };
    return;
  }
  els.colorSheet.classList.remove("open");
});
document.addEventListener("pointermove", (e) => {
  if (sheetTap && e.pointerId === sheetTap.id && Math.hypot(e.clientX - sheetTap.x, e.clientY - sheetTap.y) > SHEET_TAP_MAX_MOVE) sheetTap.dead = true;
}, { passive: true });
// In the capture phase, so it runs before the canvas's own release handling.
document.addEventListener("pointerup", (e) => {
  if (!sheetTap || e.pointerId !== sheetTap.id) return; // a second finger lifting leaves the dead tap in place
  const tap = !sheetTap.dead && e.timeStamp - sheetTap.t < SHEET_TAP_MAX_MS
    && Math.hypot(e.clientX - sheetTap.x, e.clientY - sheetTap.y) <= SHEET_TAP_MAX_MOVE;
  sheetTap = null;
  if (tap && els.colorSheet.classList.contains("open")) {
    els.colorSheet.classList.remove("open");
    colorSheetTapClosedAt = performance.now();
  }
}, true);
document.addEventListener("pointercancel", () => { sheetTap = null; }, true);

els.fernBoxZoomBtn.addEventListener("click", () => {
  fernBoxZoomActive = !fernBoxZoomActive;
  els.fernBoxZoomBtn.classList.toggle("active", fernBoxZoomActive);
  if (!fernBoxZoomActive) els.boxRect.classList.add("hidden");
});

els.fernResetBtn.addEventListener("click", () => {
  fernNav.clearHistory();
  fitVectorView(mode);
  requestRender();
});

// (The window resize listener and the canvasArea ResizeObserver are set up at the start of init.)

