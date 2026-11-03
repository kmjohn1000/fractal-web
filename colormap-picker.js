// Color buttons: the swatches and labels for the escape-time palettes and the pattern shapes' solid
// colors, and the click that opens the Color sheet for either. Needs the state and compass-ui.js;
// calls color-sheet.js (openColorSheet, openSolidColorSheet, colorSheetApplies) only inside event handlers.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { SOLID_COLORS } from "./colormaps.js?v=1.62.3";
import { curveRamp } from "./dragon.js?v=1.62.3";
import { IFS_SYSTEMS, ifsTransformColors } from "./ifs.js?v=1.62.3";
import { kochShade } from "./koch.js?v=1.62.3";
import { treeSwatchStops } from "./pythagoras.js?v=1.62.3";
import { hexaflakeShade } from "./hexaflake.js?v=1.62.3";
import { dragonView, els, fernView, vectorColors } from "./state.js?v=1.62.3";
import { colorSheetApplies, colorSheetSolid, openColorSheet, openSolidColorSheet } from "./color-sheet.js?v=1.62.3";

// ---------------------------------------------------------------- color buttons

// The color button in every row opens the Color sheet instead of cycling blindly. The escape-time
// fractals pick a Look and a palette (a gradient from COLORMAPS); the fern, Koch, tree and line
// curves each pick one flat color from SOLID_COLORS.
export function cmGradient(stops) {
  return `linear-gradient(to right, ${stops.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ")})`;
}

// The chaos-game modes (fern, Sierpinski, ...) each keep their own color.
export function setFernColor(i) {
  vectorColors[fernView.system] = i;
  updateColorSwatches();
}

// Color buttons name the current choice, so screen readers hear "Choose
// color (Ice)" rather than an unlabeled color strip.
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

// Every color button opens the Color sheet (color-sheet.js): the fractals' own (Looks, styles,
// palettes), or, for the pattern shapes, the grid of flat colors for that shape. Tapping the
// button again closes it.
[els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.hexaflakeColormapBtn, els.dragonColormapBtn, els.fernColorBtn].forEach((btn) => {
  btn.setAttribute("aria-haspopup", "true");
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-tap closer in color-sheet.js fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.placesSheet.classList.remove("open");
    els.shareMenu.classList.remove("open");
    if (btn === els.colormapBtn && colorSheetApplies()) {
      if (els.colorSheet.classList.contains("open")) els.colorSheet.classList.remove("open");
      else openColorSheet();
      return;
    }
    // A pattern shape: the key of the color this button sets (the curve button follows the curve shown).
    const key = {
      [els.fernColorBtn.id]: fernView.system, [els.kochColormapBtn.id]: "koch",
      [els.treeColormapBtn.id]: "tree", [els.hexaflakeColormapBtn.id]: "hexaflake", [els.dragonColormapBtn.id]: dragonView.curve,
    }[btn.id];
    if (els.colorSheet.classList.contains("open") && colorSheetSolid === key) els.colorSheet.classList.remove("open");
    else openSolidColorSheet(key);
  });
});

