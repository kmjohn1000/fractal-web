// Places sheet: every named place (TELEPORT_DESTINATIONS) in a bottom sheet, grouped by fractal in
// the picker's order and shallowest to deepest within each group, each with a thumbnail, its depth in words and a Dive pill; a tap flies there.
// Opens from the "Browse places" button in the info card and the "Places" row at the top of the
// picker. Needs the state, places.js, fractal-defs.js, render-layout.js, modes.js, teleport.js
// (flyToPlace), compass-ui.js (prefersReducedMotion, showHud) and color-sheet.js
// (colorSheetEl); app.js lists the sheet with the popovers (Escape, aria-expanded).
//
// An ES module (no "use strict", modules are strict), imported by app.js, so it runs before app.js
// does (app.js looks up the Places row it makes). Every top-level declaration is exported,
// which is what lets test-hooks.js expose them (the places spec and scripts/render_place_thumbs.mjs
// read placeId); see scripts/check-test-globals.mjs.

import { FRACTAL_CONFIGS, fractalLabel, slugify } from "../core/configs.js?v=1.80.5";
import { PICKER_LAYOUT, viewFromBounds } from "../fractals/fractal-defs.js?v=1.80.5";
import { TELEPORT_DESTINATIONS } from "../fractals/places.js?v=1.80.5";
import { currentName, dualActive, els, mainCanvasAspect, mode } from "../core/state.js?v=1.80.5";
import { capitalize, zoomPhrase } from "./hud-format.js?v=1.80.5";
import { exitDual, selectFractal } from "./modes.js?v=1.80.5";
import { prefersReducedMotion, showHud } from "./compass-ui.js?v=1.80.5";
import { flyToPlace } from "./teleport.js?v=1.80.5";
import { colorSheetEl } from "./color-sheet.js?v=1.80.5";

// ---------------------------------------------------------------- places sheet

// The Places icon, a map pin over a ripple, in the toolbar's style (24 px grid, outline, current
// color). The one definition of it: the picker's row, the sheet's title and the info card's button
// (a static button in index.html, given its icon below) all build it here. Decorative: aria-hidden,
// so no control's accessible name changes. Size and color come from the CSS of where it sits.
export function placesIcon() {
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const svg = make("svg", {
    class: "placesIcon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false",
  });
  svg.append(
    make("path", { d: "M12 18.2c-1.3-1.3-5-4.9-5-8.8a5 5 0 1 1 10 0c0 3.9-3.7 7.5-5 8.8z" }),
    make("circle", { cx: "12", cy: "9.4", r: "1.8", fill: "currentColor", stroke: "none" }),
    make("ellipse", { cx: "12", cy: "20.6", rx: "5.8", ry: "1.7" }));
  return svg;
}

// Thumbnails are icons/places/<id>.webp (scripts/render_place_thumbs.mjs). They are not in the
// service worker's APP_SHELL: the sheet fetches them when it first scrolls them into view.
export const placeId = (d) => `${slugify(d.fractal)}-${slugify(d.label)}`;

// The fractals that have places, in the picker's order, each with its TELEPORT_DESTINATIONS indexes,
// shallowest place first. A place's scale is the width of its view, so a larger scale is shallower;
// every place in a group is measured against the same opening view, so comparing scales compares
// depths (the sort is stable: equal scales keep their order in places.js).
export function placeGroups() {
  const keys = PICKER_LAYOUT.flatMap((section) => section.groups.flatMap((group) => group.keys));
  return keys
    .map((key) => ({
      key,
      indexes: TELEPORT_DESTINATIONS.flatMap((d, i) => (d.fractal === key ? [i] : []))
        .sort((a, b) => TELEPORT_DESTINATIONS[b].scale - TELEPORT_DESTINATIONS[a].scale),
    }))
    .filter((g) => g.indexes.length > 0);
}

// The chip strip's short name: "Julia: Rabbit" where the section title says "Julia set: Douady rabbit".
export function placeChipLabel(key) {
  const c = FRACTAL_CONFIGS[key];
  return c.group === "julia" ? `Julia: ${c.label}` : c.label;
}

// How deep a place is, as the info card says it ("8.6 billion times deeper"): against the
// fractal's opening view on the screen it would be flown to.
export function placeDepthText(d, aspect) {
  const base = viewFromBounds(FRACTAL_CONFIGS[d.fractal].view, aspect).scale;
  return capitalize(zoomPhrase(base, d.scale));
}

// The shape of the canvas a flown-to place gets: the fractal canvas itself, or the area it would
// take when a pattern mode has it hidden.
export function placesAspect() {
  if (mode === "fractal") return mainCanvasAspect();
  const area = document.getElementById("canvasArea");
  return area.clientWidth > 0 && area.clientHeight > 0 ? area.clientWidth / area.clientHeight : 1;
}

export let placesSheetKey = "";
export let placesScrollSpy = null; // updates the active chip from the scroll position

export function placeRow(i, aspect) {
  const d = TELEPORT_DESTINATIONS[i];
  const depth = placeDepthText(d, aspect);
  const img = colorSheetEl("img", { src: `icons/places/${placeId(d)}.webp`, alt: "", width: 64, height: 64, loading: "lazy", decoding: "async" });
  // A place without a thumbnail yet keeps its black square.
  img.addEventListener("error", () => { img.style.visibility = "hidden"; });
  const row = colorSheetEl("button", { class: "placeRow", "data-place": placeId(d), "aria-label": `${d.label}, ${depth}. Dive in` },
    img,
    colorSheetEl("span", { class: "placeText" }, colorSheetEl("span", { class: "placeName" }, d.label), colorSheetEl("span", { class: "placeDepth" }, depth)),
    colorSheetEl("span", { class: "dive", "aria-hidden": "true" }, "Dive"));
  row.addEventListener("click", () => flyToPlaceFrom(i));
  return row;
}

// Builds the sheet's contents; it is rebuilt only when the depths in it would read differently (the
// screen changed shape), since the places themselves never change.
export function renderPlacesSheet() {
  const sheet = els.placesSheet;
  const aspect = placesAspect();
  const key = aspect.toFixed(2);
  if (placesSheetKey === key && sheet.firstChild) return;
  placesSheetKey = key;
  const scrollTop = sheet.querySelector(".placesScroll")?.scrollTop || 0;
  const groups = placeGroups();

  const done = colorSheetEl("button", { class: "done", "data-key": "done" }, "Done");
  done.addEventListener("click", closePlacesSheet);
  const chips = colorSheetEl("div", { class: "placesChips", role: "group", "aria-label": "Jump to a fractal" });
  const scroller = colorSheetEl("div", { class: "placesScroll" });

  const sections = groups.map((g) => {
    const head = colorSheetEl("h3", { class: "placesGroupHead" }, fractalLabel(g.key), colorSheetEl("span", {}, String(g.indexes.length)));
    const list = colorSheetEl("div", { class: "placesList" }, ...g.indexes.map((i) => placeRow(i, aspect)));
    const section = colorSheetEl("section", { class: "placesGroup", "data-fractal": g.key }, head, list);
    const chip = colorSheetEl("button", { class: "chip", "data-fractal": g.key }, placeChipLabel(g.key));
    chip.addEventListener("click", () => scrollPlacesTo(section));
    chips.append(chip);
    scroller.append(section);
    return { section, chip };
  });

  // The chip of the section at the top of the list is the active one.
  let ticking = false;
  placesScrollSpy = () => {
    const top = scroller.getBoundingClientRect().top + 8;
    const current = sections.filter((s) => s.section.getBoundingClientRect().top <= top).pop() || sections[0];
    for (const s of sections) {
      const on = s === current;
      s.chip.classList.toggle("active", on);
      if (on) s.chip.setAttribute("aria-current", "true");
      else s.chip.removeAttribute("aria-current");
    }
    if (current) keepChipVisible(chips, current.chip);
  };
  scroller.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; placesScrollSpy(); });
  }, { passive: true });

  sheet.replaceChildren(
    colorSheetEl("div", { class: "head" }, colorSheetEl("p", { class: "title" }, placesIcon(), "Places"), done),
    chips, scroller);
  scroller.scrollTop = scrollTop;
}

// Scrolls a chip into the strip's view without moving the page.
export function keepChipVisible(chips, chip) {
  const c = chips.getBoundingClientRect(), r = chip.getBoundingClientRect();
  if (r.left < c.left) chips.scrollLeft += r.left - c.left - 8;
  else if (r.right > c.right) chips.scrollLeft += r.right - c.right + 8;
}

export function scrollPlacesTo(section, smooth = true) {
  const scroller = els.placesSheet.querySelector(".placesScroll");
  const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTo({ top, behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
}

export function openPlacesSheet() {
  els.fractalTypeRow.classList.remove("open");
  els.colorSheet.classList.remove("open");
  els.shareMenu.classList.remove("open");
  renderPlacesSheet();
  els.placesSheet.classList.add("open");
  // Opens on the fractal being looked at, when it has places.
  const own = els.placesSheet.querySelector(`.placesGroup[data-fractal="${CSS.escape(currentName)}"]`);
  const first = els.placesSheet.querySelector(".placesGroup");
  const target = mode === "fractal" && own ? own : first;
  if (target) scrollPlacesTo(target, false);
  placesScrollSpy?.();
}

export function closePlacesSheet() {
  els.placesSheet.classList.remove("open");
}

// Flies to place i. The info card turns on, so the name shows when the flight lands. A place on
// another fractal starts from that fractal's whole-shape view, not the one it was left in.
export function flyToPlaceFrom(i) {
  const d = TELEPORT_DESTINATIONS[i];
  closePlacesSheet();
  if (mode !== "fractal" || currentName !== d.fractal) {
    // Dual view would open a Julia preset beside its parent instead of picking it.
    if (dualActive) exitDual();
    selectFractal(d.fractal, { fresh: true });
  }
  showHud();
  flyToPlace(i);
}

// The picker's first row, and the info card's button (index.html).
export const placesRow = colorSheetEl("button", { class: "placesRow", "aria-haspopup": "true", "data-opens-places": "" },
  placesIcon(),
  colorSheetEl("span", { class: "placesRowTitle" }, "Places"),
  colorSheetEl("span", { class: "placesRowSub" }, `${TELEPORT_DESTINATIONS.length} named places to dive into`),
  colorSheetEl("span", { class: "placesRowGo", "aria-hidden": "true" }, "›"));
els.fractalTypeRow.prepend(placesRow);

for (const btn of document.querySelectorAll("[data-opens-places]")) {
  // The info card's button is static HTML (index.html); it gets the same icon, before its text.
  if (!btn.querySelector(".placesIcon")) btn.prepend(placesIcon());
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-tap closer below fire on this same tap
    if (els.placesSheet.classList.contains("open")) closePlacesSheet();
    else openPlacesSheet();
  });
}

// Tap anywhere outside the open sheet to dismiss it, as for the picker.
document.addEventListener("pointerdown", (e) => {
  if (!els.placesSheet.classList.contains("open")) return;
  if (els.placesSheet.contains(e.target) || e.target.closest("[data-opens-places]")) return;
  closePlacesSheet();
});
