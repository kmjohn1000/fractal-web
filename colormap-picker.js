// Colormap picker: the gradient swatches and menu for the escape-time colormap and the solid colors
// of the vector modes. Needs the state and compass-ui.js; calls color-sheet.js (openColorSheet,
// colorSheetApplies) only inside event handlers.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { kochShade } from "./koch.js?v=1.53.9";
import { treeSwatchStops } from "./pythagoras.js?v=1.53.9";
import { hexaflakeShade } from "./hexaflake.js?v=1.53.9";
import { dragonView, els, fernView, vectorColors } from "./state.js?v=1.53.9";
import { colormapIndex, pickColormap } from "./state-colors.js?v=1.53.9";
import { requestRender } from "./render-layout.js?v=1.53.9";
import { colorSheetApplies, openColorSheet } from "./color-sheet.js?v=1.53.9";

// ---------------------------------------------------------------- colormap picker

// The palette button in every row opens this picker (same popover pattern as
// the share menu) instead of cycling blindly. The escape-time fractals pick
// a gradient from COLORMAPS; the fern, Koch, tree and line curves each pick
// one flat color from SOLID_COLORS.
export function cmGradient(stops) {
  return `linear-gradient(to right, ${stops.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ")})`;
}

// The chaos-game modes (fern, Sierpinski, ...) each keep their own color.
export function setFernColor(i) {
  vectorColors[fernView.system] = i;
  updateColorSwatches();
}

// Color buttons name the current choice, so screen readers hear "Choose
// colormap (Classic)" rather than an unlabeled color strip.
export function labelColorButton(btn, action, name) {
  btn.setAttribute("aria-label", `${action} (${name})`);
  btn.title = `${action} (${name})`;
}

// The pill on a solid-color button is a miniature of that shape's real ramp
// for the picked color, left to right, as a few gradient stops (the same
// functions the render uses, so the two can't drift apart):
// - the line curves: the start, middle and end of their hue ramp (curveRamp);
// - the dot shapes: the color of each of their transforms, by hue offset
//   (ifsTransformColors), which is the tint of each self-similar piece;
// - the hexaflake and Koch: the level / generation ladder from its darkest
//   shade to the picked color (the shades beyond that only alternate dimmer);
// - the tree: the trunk's shade up to the canopy's picked color.
// White has no hue to turn, so its ramps are dim to bright.
export function pillGradient(key, colorIndex) {
  const rgbCss = (c) => `rgb(${c.map((v) => Math.round(v)).join(",")})`;
  const even = (colors) => colors.map((c, i) => [typeof c === "string" ? c : rgbCss(c), 100 * i / (colors.length - 1)]);
  const base = SOLID_COLORS[colorIndex].rgb;
  let stops;
  if (key === "tree") stops = treeSwatchStops(colorIndex);
  else if (key === "koch") stops = even([0, 1, 2, 3, 4].map((g) => kochShade(base, g, 4)));
  else if (key === "hexaflake") stops = even([0, 1, 2, 3, 4].map((level) => hexaflakeShade(base, level)));
  else if (IFS_SYSTEMS[key]) {
    const colors = ifsTransformColors(key, colorIndex), offsets = IFS_SYSTEMS[key].hueOffsets;
    stops = even(colors.map((c, i) => [offsets[i], c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c));
  } else {
    const ramp = curveRamp(colorIndex);
    stops = even([ramp[0], ramp[Math.floor(ramp.length / 2)], ramp[ramp.length - 1]]);
  }
  return `linear-gradient(to right, ${stops.map(([c, pos]) => `${c} ${pos}%`).join(", ")})`;
}

// The pill on each solid-color button shows that mode's ramp (pillGradient);
// the curve row's pill follows whichever curve is shown, the dot row's
// whichever dot shape. The label still names the picked color.
export function updateColorSwatches() {
  [
    [els.fernColorBtn, els.fernColorSwatch, fernView.system],
    [els.kochColormapBtn, els.kochColorSwatch, "koch"],
    [els.treeColormapBtn, els.treeColorSwatch, "tree"],
    [els.hexaflakeColormapBtn, els.hexaflakeColorSwatch, "hexaflake"],
    [els.dragonColormapBtn, els.dragonColorSwatch, dragonView.curve],
  ].forEach(([btn, pill, key]) => {
    const i = vectorColors[key];
    pill.style.background = pillGradient(key, i);
    labelColorButton(btn, "Choose color", SOLID_COLORS[i].name);
  });
}

// solidKey: null for the escape-time colormap, or a vectorColors key.
export function openColormapMenu(solidKey) {
  // Each item carries the index it sets: the solid colors are listed in hue
  // order (SOLID_COLOR_ORDER), which is not their SOLID_COLORS index.
  const items = solidKey
    ? SOLID_COLOR_ORDER.map((i) => ({ index: i, name: SOLID_COLORS[i].name, bg: solidCss(i) }))
    : COLORMAPS.map((c, i) => ({ index: i, name: c.name, bg: cmGradient(c.stops) }));
  const current = !solidKey ? colormapIndex : vectorColors[solidKey];
  els.colormapMenu.replaceChildren(...items.map((item) => {
    const i = item.index;
    const btn = document.createElement("button");
    btn.setAttribute("role", "menuitemradio");
    btn.setAttribute("aria-checked", String(i === current));
    btn.classList.toggle("active", i === current);
    const swatch = document.createElement("span");
    swatch.className = "cmSwatch";
    swatch.style.background = item.bg;
    const name = document.createElement("span");
    name.className = "cmName";
    name.textContent = item.name;
    btn.append(name, swatch);
    btn.addEventListener("click", () => {
      if (solidKey) {
        vectorColors[solidKey] = i;
        updateColorSwatches();
      } else {
        // Always refreshes the shader's LUT, whichever mode picked it: the
        // old koch/tree/dragon cycle handlers skipped this, leaving the
        // fractal on a stale colormap after switching back.
        pickColormap(i);
      }
      els.colormapMenu.classList.remove("open");
      requestRender();
    });
    return btn;
  }));
  els.colormapMenu.classList.add("open");
  els.colormapMenu.querySelector(".active")?.scrollIntoView({ block: "nearest" });
}

[els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.hexaflakeColormapBtn, els.dragonColormapBtn, els.fernColorBtn].forEach((btn) => {
  btn.setAttribute("aria-haspopup", "true");
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-tap closer below fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.placesSheet.classList.remove("open");
    els.shareMenu.classList.remove("open");
    // The fractals get the Color sheet; the pattern modes (Koch and the rest)
    // keep the plain palette list.
    if (btn === els.colormapBtn && colorSheetApplies()) {
      els.colormapMenu.classList.remove("open");
      if (els.colorSheet.classList.contains("open")) els.colorSheet.classList.remove("open");
      else openColorSheet();
      return;
    }
    els.colorSheet.classList.remove("open");
    if (els.colormapMenu.classList.contains("open")) els.colormapMenu.classList.remove("open");
    else openColormapMenu({
      [els.fernColorBtn.id]: fernView.system, [els.kochColormapBtn.id]: "koch",
      [els.treeColormapBtn.id]: "tree", [els.hexaflakeColormapBtn.id]: "hexaflake", [els.dragonColormapBtn.id]: dragonView.curve,
    }[btn.id] || null);
  });
});
// Keyboard: the arrow keys (and Home/End) move the focus between the rows, which
// wrap around. Without this the document's arrow-key handler panned the shape
// behind the open menu instead; with ten rows, stepping beats Tab-ing the whole
// list. Enter or Space picks the focused row, as for any button.
els.colormapMenu.addEventListener("keydown", (e) => {
  const step = { ArrowUp: -1, ArrowDown: 1, Home: -Infinity, End: Infinity }[e.key];
  if (!step || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  const rows = [...els.colormapMenu.querySelectorAll("button")];
  const i = rows.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  e.stopPropagation();
  const next = Math.abs(step) === Infinity ? (step < 0 ? 0 : rows.length - 1) : (i + step + rows.length) % rows.length;
  rows[next].focus();
});
document.addEventListener("pointerdown", (e) => {
  if (!els.colormapMenu.classList.contains("open")) return;
  if (els.colormapMenu.contains(e.target) || e.target.closest("[aria-haspopup]")) return;
  els.colormapMenu.classList.remove("open");
});

