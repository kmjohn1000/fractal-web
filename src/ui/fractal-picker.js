// The fractal picker: its tiles, the Corner Rules "Another rule" button, the hamburger buttons that open it and
// the tap-outside dismissal. Split from compass-ui.js (a pure move). A load-time module: importing it builds the
// tiles and attaches the listeners, so app.js imports it right after compass-ui.js. Needs state.js (els),
// configs.js, fractal-defs.js (PICKER_LAYOUT, PICKER_BLURBS, EXTRA_MODES) and modes.js.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it).
import { FRACTAL_CONFIGS, slugify } from "../core/configs.js?v=1.80.3";
import { EXTRA_MODES, PICKER_BLURBS, PICKER_LAYOUT } from "../fractals/fractal-defs.js?v=1.80.3";
import { els } from "../core/state.js?v=1.80.3";
import { dealCornerRules, selectFractal, setMode, updateMenuActiveState } from "./modes.js?v=1.80.3";

// Picker: a list of rows, each a pre-rendered thumbnail plus the name and a one-line blurb
// (thumbnails come from scripts/render_thumbs.mjs; re-run it after adding a fractal or changing a
// default view). Sections and groups come from PICKER_LAYOUT in fractal-defs.js, the blurbs from
// PICKER_BLURBS beside it. The button's accessible name is the label (or `ariaLabel`, for the two
// tiles that share a label) and the blurb is its description, so a screen reader doesn't read both
// as one long name.
export function addPickerHeader(text, isSub = false) {
  const header = document.createElement("div");
  header.className = isSub ? "menuSectionHeader sub" : "menuSectionHeader";
  header.textContent = text;
  els.fractalTypeRow.appendChild(header);
}
export function addPickerTile(label, slug, onPick, data, blurb, ariaLabel = label) {
  const btn = document.createElement("button");
  btn.className = "pickTile";
  Object.assign(btn.dataset, data);
  btn.setAttribute("aria-label", ariaLabel);
  const img = document.createElement("img");
  img.src = `icons/thumbs/${slug}.webp`;
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy"; // fetched when the picker first opens, not at startup
  const name = document.createElement("span");
  name.className = "pickName";
  name.textContent = label;
  const text = document.createElement("span");
  text.className = "pickText";
  text.append(name);
  if (blurb) {
    const desc = document.createElement("span");
    desc.className = "pickBlurb";
    desc.id = `pickBlurb-${slug}`;
    desc.textContent = blurb;
    btn.setAttribute("aria-describedby", desc.id);
    text.append(desc);
  }
  btn.append(img, text);
  btn.addEventListener("click", onPick);
  els.fractalTypeRow.appendChild(btn);
}
PICKER_LAYOUT.forEach((section) => {
  addPickerHeader(section.label);
  section.groups.forEach((group) => {
    addPickerHeader(group.label, true);
    group.keys.forEach((key) => {
      const config = FRACTAL_CONFIGS[key];
      if (config) {
        addPickerTile(config.label, slugify(key), () => selectFractal(key), { name: key }, PICKER_BLURBS[key], config.ariaLabel);
      } else {
        const mode = EXTRA_MODES.find((m) => m.key === key);
        // Corner Rules deals a rule each time it is picked, also when it is already open
        addPickerTile(mode.label, mode.key, mode.key === "corners" ? dealCornerRules : () => setMode(mode.key), { mode: mode.key }, PICKER_BLURBS[key]);
      }
    });
  });
});
updateMenuActiveState();

// Corner Rules' "Another rule" button (beside Play): the same deal as picking the entry again.
els.cornerRuleBtn.addEventListener("click", dealCornerRules);

// Two hamburger buttons exist (one in #fractalControls, one in #kochControls
// — see index.html) so the menu stays reachable regardless of mode, since
// selecting Koch/a fractal type from it is now the only way to switch modes
// at all. Both share the .fractalMenuBtn class rather than an id.
document.querySelectorAll(".fractalMenuBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.colorSheet.classList.remove("open");
    els.placesSheet.classList.remove("open");
    els.shareMenu.classList.remove("open");
    els.fractalTypeRow.classList.toggle("open");
  });
});
// Tap anywhere outside the open picker (or a hamburger button) to dismiss
// it — standard dropdown/hamburger-menu behavior.
document.addEventListener("pointerdown", (e) => {
  if (!els.fractalTypeRow.classList.contains("open")) return;
  if (els.fractalTypeRow.contains(e.target) || e.target.closest(".fractalMenuBtn")) return;
  els.fractalTypeRow.classList.remove("open");
});
