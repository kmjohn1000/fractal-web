// Places sheet: every named place (TELEPORT_DESTINATIONS) in a bottom sheet, grouped by fractal in
// the picker's order, each with a thumbnail, its depth in words and a Dive pill; a tap flies there.
// Opens from the "Browse places" button in the info card and the "Places" row at the top of the
// picker. Needs the state, places.js, fractal-defs.js, render-layout.js, modes.js, teleport.js
// (flyToPlace), compass-ui.js (prefersReducedMotion, applyHudVisibility) and color-sheet.js
// (colorSheetEl); app.js lists the sheet with the popovers (Escape, aria-expanded).
//
// An ES module (no "use strict", modules are strict), imported by app.js, so it runs before app.js
// does (app.js looks up the Places row it makes). It reads the other files' names as globals, which
// works because a module runs after every plain script. Every top-level declaration is exported,
// which is what lets test-hooks.js expose them (the places spec and scripts/render_place_thumbs.mjs
// read placeId); see scripts/check-test-globals.mjs.

// ---------------------------------------------------------------- places sheet

// Thumbnails are icons/places/<id>.webp (scripts/render_place_thumbs.mjs). They are not in the
// service worker's APP_SHELL: the sheet fetches them when it first scrolls them into view.
export const placeId = (d) => `${slugify(d.fractal)}-${slugify(d.label)}`;

// The fractals that have places, in the picker's order, each with its TELEPORT_DESTINATIONS indexes.
export function placeGroups() {
  const keys = PICKER_LAYOUT.flatMap((section) => section.groups.flatMap((group) => group.keys));
  return keys
    .map((key) => ({ key, indexes: TELEPORT_DESTINATIONS.flatMap((d, i) => (d.fractal === key ? [i] : [])) }))
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
    colorSheetEl("div", { class: "head" }, colorSheetEl("p", { class: "title" }, "Places"), done),
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
  els.colormapMenu.classList.remove("open");
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
  setHudVisible(true);
  applyHudVisibility();
  flyToPlace(i);
}

// The picker's first row, and the info card's button (index.html).
export const placesRow = colorSheetEl("button", { class: "placesRow", "aria-haspopup": "true", "data-opens-places": "" },
  colorSheetEl("span", { class: "placesRowTitle" }, "Places"),
  colorSheetEl("span", { class: "placesRowSub" }, `${TELEPORT_DESTINATIONS.length} named places to fly to`),
  colorSheetEl("span", { class: "placesRowGo", "aria-hidden": "true" }, "›"));
els.fractalTypeRow.prepend(placesRow);

for (const btn of document.querySelectorAll("[data-opens-places]")) {
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
