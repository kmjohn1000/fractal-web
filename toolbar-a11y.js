// Toolbar accessibility. Split from app.js (a pure move). A load-time module: importing it attaches the
// observers and the Escape handler, so app.js imports it last, after every other module has been evaluated
// (the block used to run after app.js's imports). An ES module: every top-level declaration is exported
// (test-hooks.js relies on it). Needs state.js (els).
import { els } from "./state.js?v=1.70.4";

// Toggle buttons and popovers change state by toggling "active"/"open" at
// many call sites, so one observer per element mirrors that state into
// ARIA instead: aria-pressed on the toggles, aria-expanded on each popover's
// opener buttons. A popover that opens gets focus on its current (or
// first) item; one that closes with focus inside hands it back to the
// button that opened it. Escape closes whichever popover is open.
export const TOGGLE_BUTTONS = [els.dualBtn, els.boxZoomBtn, els.fernBoxZoomBtn, els.kochFillBtn, ...document.querySelectorAll(".hudToggleBtn")];
for (const btn of TOGGLE_BUTTONS) {
  const sync = () => btn.setAttribute("aria-pressed", String(btn.classList.contains("active")));
  sync();
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ["class"] });
}

export const POPOVERS = [
  { menu: els.fractalTypeRow, openers: [...document.querySelectorAll(".fractalMenuBtn")] },
  { menu: els.colorSheet, openers: [els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.hexaflakeColormapBtn, els.dragonColormapBtn, els.fernColorBtn] },
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
