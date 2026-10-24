// Colormap picker: the gradient swatches and menu for the escape-time colormap and the solid colors
// of the vector modes. Needs the state and compass-ui.js; calls color-sheet.js (openColorSheet,
// colorSheetApplies) only inside event handlers.
"use strict";

// ---------------------------------------------------------------- colormap picker

// The palette button in every row opens this picker (same popover pattern as
// the share menu) instead of cycling blindly. The escape-time fractals pick
// a gradient from COLORMAPS; the fern, Koch, tree and line curves each pick
// one flat color from SOLID_COLORS.
function cmGradient(stops) {
  return `linear-gradient(to right, ${stops.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ")})`;
}

function setFernColor(i) {
  fernState.colorIndex = i;
  updateColorSwatches();
}

// Color buttons name the current choice, so screen readers hear "Choose
// colormap (Classic)" rather than an unlabeled color strip.
function labelColorButton(btn, action, name) {
  btn.setAttribute("aria-label", `${action} (${name})`);
  btn.title = `${action} (${name})`;
}

// The pill on each solid-color button shows that mode's color; the curve
// row's pill follows whichever curve is shown.
function updateColorSwatches() {
  [
    [els.fernColorBtn, els.fernColorSwatch, fernState.colorIndex],
    [els.kochColormapBtn, els.kochColorSwatch, vectorColors.koch],
    [els.treeColormapBtn, els.treeColorSwatch, vectorColors.tree],
    [els.hexaflakeColormapBtn, els.hexaflakeColorSwatch, vectorColors.hexaflake],
    [els.dragonColormapBtn, els.dragonColorSwatch, vectorColors[dragonView.curve]],
  ].forEach(([btn, pill, i]) => {
    pill.style.background = solidCss(i);
    labelColorButton(btn, "Choose color", SOLID_COLORS[i].name);
  });
}

// solidKey: null for the escape-time colormap, "fern", or a vectorColors key.
function openColormapMenu(solidKey) {
  const items = solidKey
    ? SOLID_COLORS.map((c, i) => ({ name: c.name, bg: solidCss(i) }))
    : COLORMAPS.map((c) => ({ name: c.name, bg: cmGradient(c.stops) }));
  const current = !solidKey ? colormapIndex : solidKey === "fern" ? fernState.colorIndex : vectorColors[solidKey];
  els.colormapMenu.replaceChildren(...items.map((item, i) => {
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
      if (solidKey === "fern") {
        setFernColor(i);
      } else if (solidKey) {
        vectorColors[solidKey] = i;
        updateColorSwatches();
      } else {
        colormapIndex = i;
        // Always refresh the shader's LUT, whichever mode picked it: the
        // old koch/tree/dragon cycle handlers skipped this, leaving the
        // fractal on a stale colormap after switching back.
        updateLUT();
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
      [els.fernColorBtn.id]: "fern", [els.kochColormapBtn.id]: "koch",
      [els.treeColormapBtn.id]: "tree", [els.hexaflakeColormapBtn.id]: "hexaflake", [els.dragonColormapBtn.id]: dragonView.curve,
    }[btn.id] || null);
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.colormapMenu.classList.contains("open")) return;
  if (els.colormapMenu.contains(e.target) || e.target.closest("[aria-haspopup]")) return;
  els.colormapMenu.classList.remove("open");
});

