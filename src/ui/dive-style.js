// Dive style: how Surprise me's flights look. Touch and hold the die (or right-click it, or press the context-menu
// key) for a small menu: Full Motion, the flights as they always were (the default), or Blur, the flight blend of
// flight-blend.js, which smooths the fast dark-and-bright sweeps of a quick zoom (the flash check measured up to 19
// a second in Full Motion, against WCAG 2.3.1's 6). Reduce Motion overrides both with a dissolve (teleport.js).
// The choice is kept on the device. Needs state.js (els); teleport.js reads diveStyle and asks
// consumeDiveLongPress before a tap flies; toolbar-a11y.js lists the menu as a popover (focus, Escape).
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { els } from "../core/state.js?v=1.85.1";

export const DIVE_STYLE_KEY = "fractalAtlas.diveStyle";
// "slow": a test style (user 2026-11-16, not decided): plain flights at a steady, slower pace with their deep frames
// drawn live (teleport.js slowDiveMs, renderer.js setFlightReference); spiral dives fly as in Full Motion.
export const DIVE_STYLES = ["full", "blur", "slow"];
export const DIVE_HOLD_MS = 500;

export function readDiveStyle() {
  try {
    const v = localStorage.getItem(DIVE_STYLE_KEY);
    return DIVE_STYLES.includes(v) ? v : "full";
  } catch { return "full"; }
}
export let diveStyle = readDiveStyle();

export function setDiveStyle(style) {
  if (!DIVE_STYLES.includes(style)) return;
  diveStyle = style;
  try { localStorage.setItem(DIVE_STYLE_KEY, style); } catch { /* storage blocked: this visit only */ }
  syncDiveMenu();
}

export function syncDiveMenu() {
  for (const b of els.diveMenu.querySelectorAll("button[data-dive]")) {
    const on = b.dataset.dive === diveStyle;
    b.setAttribute("aria-checked", String(on));
    b.classList.toggle("active", on); // toolbar-a11y.js focuses the active item when the menu opens
  }
}

// Above the die, kept inside the toolbar's width.
export function openDiveMenu() {
  els.shareMenu.classList.remove("open");
  els.colorSheet.classList.remove("open");
  els.placesSheet.classList.remove("open");
  els.fractalTypeRow.classList.remove("open");
  syncDiveMenu();
  const menu = els.diveMenu;
  menu.classList.add("open");
  const box = els.controls.getBoundingClientRect(), btn = els.teleportBtn.getBoundingClientRect();
  const left = btn.left + btn.width / 2 - box.left - menu.offsetWidth / 2;
  menu.style.left = `${Math.max(8, Math.min(box.width - menu.offsetWidth - 8, left))}px`;
}
export function closeDiveMenu() { els.diveMenu.classList.remove("open"); }

// A hold that opened the menu must not also fly when the finger lifts (the click that follows it).
export let diveLongPressed = false;
export function consumeDiveLongPress() {
  const was = diveLongPressed;
  diveLongPressed = false;
  return was;
}

export let diveHoldTimer = 0;
export function cancelDiveHold() { clearTimeout(diveHoldTimer); diveHoldTimer = 0; }
els.teleportBtn.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  diveLongPressed = false;
  cancelDiveHold();
  diveHoldTimer = setTimeout(() => { diveHoldTimer = 0; diveLongPressed = true; openDiveMenu(); }, DIVE_HOLD_MS);
});
for (const type of ["pointerup", "pointercancel", "pointerleave"]) els.teleportBtn.addEventListener(type, cancelDiveHold);
els.teleportBtn.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  cancelDiveHold();
  openDiveMenu();
});

for (const b of els.diveMenu.querySelectorAll("button[data-dive]")) {
  b.addEventListener("click", () => { setDiveStyle(b.dataset.dive); closeDiveMenu(); });
}
document.addEventListener("pointerdown", (e) => {
  if (!els.diveMenu.classList.contains("open")) return;
  if (els.diveMenu.contains(e.target)) return;
  closeDiveMenu();
});
syncDiveMenu();
