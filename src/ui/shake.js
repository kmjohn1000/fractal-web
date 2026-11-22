// Shake to roll the dice: in the iOS app, shaking the phone does what the Surprise-me die does (teleport.js).
// On by default (user, 2026-11-21), with a switch in the die's touch-and-hold menu (index.html #diveMenu, beside the dive style),
// shown only in the app: the website has no shake. The die button stays the way to roll for VoiceOver and for
// anyone who doesn't shake. The shake itself comes from platform.js (the Swift side forwards motionEnded).
// A shake does nothing while a flight is in the air, a sheet or menu is open, the first-run tour is up, or
// within a second of the last roll. The choice is kept on the device.
// Needs state.js (els), teleport.js (teleport, isFlying), first-run-tour.js (tourShowing), platform.js.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { Platform } from "../core/platform.js?v=1.81.0";
import { els } from "../core/state.js?v=1.81.0";
import { isFlying, teleport } from "./teleport.js?v=1.81.0";
import { tourShowing } from "./first-run-tour.js?v=1.81.0";

export const SHAKE_KEY = "fractalAtlas.shakeToRoll";
export const SHAKE_COOLDOWN_MS = 1000;

// On unless the person turned it off (user, 2026-11-21: on by default; an unset or unreadable choice is on).
export function readShakeEnabled() {
  try { return localStorage.getItem(SHAKE_KEY) !== "0"; } catch { return true; }
}
export let shakeEnabled = readShakeEnabled();

export function setShakeEnabled(on) {
  shakeEnabled = !!on;
  try { localStorage.setItem(SHAKE_KEY, shakeEnabled ? "1" : "0"); } catch { /* storage blocked: this visit only */ }
  syncShakeToggle();
}

export function syncShakeToggle() {
  els.shakeToggle.setAttribute("aria-checked", String(shakeEnabled));
}

// Why a shake would be ignored right now, or "" when it would roll.
export function shakeBlockedBy() {
  if (!shakeEnabled) return "off";
  if (isFlying()) return "flight";
  // Any open sheet or menu in the toolbar (the colors, places, share and dive menus, the fractal row).
  if (els.controls.querySelector(".open")) return "dialog";
  if (tourShowing()) return "tour";
  return "";
}

export let lastRollAt = -Infinity;
// Called for each shake; returns true when it rolled the die. `now` is injectable for the tests.
export function handleShake(now = performance.now()) {
  if (shakeBlockedBy() || now - lastRollAt < SHAKE_COOLDOWN_MS) return false;
  if (!teleport()) return false;
  lastRollAt = now;
  Platform.tapHaptic();
  return true;
}

// The toggle is for the app only; on the website it stays hidden and no shake ever arrives.
els.shakeToggle.classList.toggle("hidden", !Platform.canShake);
els.shakeToggle.addEventListener("click", () => setShakeEnabled(!shakeEnabled));
syncShakeToggle();
Platform.onShake(() => handleShake());
