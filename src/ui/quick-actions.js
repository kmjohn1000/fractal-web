// Home Screen quick action "Surprise Me" (long-press the app icon): flies to a random place, as the die does.
// The app only; the website has none, so nothing here ever fires there. The Swift side (QuickActionsPlugin,
// ios/App/App/FractalBridgeViewController.swift) keeps the action until the page asks; platform.js carries it.
// Cold launch (the shortcut started the app): startQuickActions() asks for the pending action before the
// opening flight would start; if it is "surprise" the opening flight is skipped and the die is rolled once
// the first picture is up. The app has no opening flight today (coldOpen is the website's first visit only),
// so in practice the roll is the launch's only flight. If the first-run tour is due (the very first launch,
// or the first after the update that brought it) the tour's usual rules win and the shortcut is ignored.
// Warm (the app was running or in the background): handleQuickAction() does what the die does, unless a
// flight is in the air, a sheet or menu is open, or the tour is up. No cooldown or on/off switch (an
// action is a deliberate choice, not a shake that can happen by accident).
// Needs platform.js, state.js (els), teleport.js (teleport, isFlying), first-run-tour.js (tourShowing).
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it).
import { Platform } from "../core/platform.js?v=1.81.0";
import { els } from "../core/state.js?v=1.81.0";
import { isFlying, teleport } from "./teleport.js?v=1.81.0";
import { tourShowing } from "./first-run-tour.js?v=1.81.0";

export const QUICK_ACTION_SURPRISE = "surprise";
export const QUICK_ACTION_COLD_DELAY_MS = 250; // after the first painted frame, as the launch screen fades

// Why a warm action would be ignored right now, or "" when it would roll.
export function quickActionBlockedBy() {
  if (isFlying()) return "flight";
  // Any open sheet or menu in the toolbar (the colors, places, share and dive menus, the fractal row).
  if (els.controls.querySelector(".open")) return "dialog";
  if (tourShowing()) return "tour";
  return "";
}

// A quick action chosen while the app was running. Returns true when it rolled the die.
export function handleQuickAction(type) {
  if (type !== QUICK_ACTION_SURPRISE || quickActionBlockedBy()) return false;
  if (!teleport()) return false;
  Platform.tapHaptic();
  return true;
}

// A cold launch's action. Returns true when it rolled the die. Not blocked by a flight or a menu (nothing
// can be open yet); only the due tour refuses it.
export function handleColdQuickAction(type) {
  if (type !== QUICK_ACTION_SURPRISE || Platform.tour.isDue()) return false;
  return teleport();
}

// Called once at startup, in place of starting the opening flight directly: `openingFlight` runs unless the
// app was launched by the Surprise Me action (and the tour isn't due), which rolls the die instead.
// The delay is injectable for the tests.
export function startQuickActions(openingFlight, delayMs = QUICK_ACTION_COLD_DELAY_MS) {
  Platform.quickActions.onQuickAction((type) => handleQuickAction(type));
  return Platform.quickActions.takePending().then((type) => {
    if (type !== QUICK_ACTION_SURPRISE || Platform.tour.isDue()) {
      openingFlight();
      return false;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => handleColdQuickAction(type), delayMs)));
    return true;
  });
}
