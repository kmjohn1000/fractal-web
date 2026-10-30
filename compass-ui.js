// Compass, keyboard actions, HUD toggle and welcome card, the fractal picker tiles and the slider
// fill. Needs everything the earlier scripts define (state, render-layout, modes, interaction);
// calls teleport.js (cancelTeleport) only inside event handlers.
"use strict";

// ---------------------------------------------------------------- compass

// Shows el (class "shown") and hides it FLASH_HIDE_MS after the last call;
// holder keeps the pending timer. Shared by the compass and the dual-view
// crosshair.
const FLASH_HIDE_MS = 1500;
function flash(el, holder, onHide) {
  el.classList.add("shown");
  if (holder.hideTimer) clearTimeout(holder.hideTimer);
  holder.hideTimer = setTimeout(() => {
    holder.hideTimer = null;
    el.classList.remove("shown");
    if (onHide) onHide();
  }, FLASH_HIDE_MS);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A compass per rotatable pane that fades in while the view rotates and out
// once it's been still for FLASH_HIDE_MS; tapping it animates the rotation
// back to 0 (touch has no other rotation-only reset -- keyboard R resets the
// whole view). It watches each pane's rotation from renderAll, so every
// source of rotation (twist, Shift+arrows, Back, the reset animation itself)
// shows it without hooking each one. Small twists are ignored: every pinch
// changes the angle a little, so the compass only appears once the rotation
// has moved COMPASS_SHOW_RAD from where it was when the compass last hid.
const COMPASS_SHOW_RAD = 3 * Math.PI / 180;
const COMPASS_RESET_MS = 350;
const compasses = {}; // pane key -> { el, needle, anchor, context, hideTimer }

// The rotatable panes currently on screen: key, canvas, and get/set of the
// view's rotation, plus a history checkpoint so Back undoes a reset.
function rotatablePanes() {
  if (mode === "fractal") {
    const panes = [{ key: "main", canvas: els.mainCanvas, st: mainState, fractalPane: "main" }];
    if (dualActive && juliaState) panes.push({ key: "julia", canvas: els.juliaCanvas, st: juliaState, fractalPane: "julia" });
    return panes;
  }
  const target = activeVectorTarget();
  return target ? [{ key: "vector", canvas: target.canvas, st: target.v.view, nav: target.nav }] : [];
}

function getCompass(key) {
  if (compasses[key]) return compasses[key];
  const el = document.createElement("button");
  el.className = "compass";
  el.setAttribute("aria-label", "Reset rotation");
  el.title = "Reset rotation";
  el.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><g>
    <polygon points="20,6 24.5,20 15.5,20" fill="#ff453a"/>
    <polygon points="20,34 24.5,20 15.5,20" fill="#d8d8dc"/>
    <circle cx="20" cy="20" r="2" fill="#1c1c1e"/></g></svg>`;
  const c = { el, needle: el.querySelector("g"), anchor: null, lastRot: null, context: null, hideTimer: null };
  el.addEventListener("click", () => resetRotation(key));
  document.body.appendChild(el);
  compasses[key] = c;
  return c;
}

function hideCompass(c) {
  c.el.classList.remove("shown");
  if (c.hideTimer) { clearTimeout(c.hideTimer); c.hideTimer = null; }
}

function updateCompasses() {
  const panes = rotatablePanes();
  const context = `${mode}|${currentName}|${dualActive}`;
  for (const key of Object.keys(compasses)) {
    if (!panes.some((p) => p.key === key)) hideCompass(compasses[key]);
  }
  for (const p of panes) {
    const c = getCompass(p.key);
    const rot = p.st.rotation || 0;
    // A different fractal/mode/layout starts fresh: no flash for the jump.
    if (c.context !== context) {
      c.context = context;
      c.anchor = rot;
      hideCompass(c);
    }
    const shown = c.el.classList.contains("shown");
    if (!shown && Math.abs(normalizeAngle(rot - c.anchor)) < COMPASS_SHOW_RAD) continue;
    if (shown && rot === c.lastRot) continue; // pan/zoom only: let it fade
    c.lastRot = rot;
    // Screen "up" is world up rotated by -rotation (screenToComplex rotates
    // uv by +rotation into world axes), which is CSS rotate(+rotation).
    c.needle.style.transform = `rotate(${rot}rad)`;
    c.needle.style.transformOrigin = "20px 20px";
    const rect = p.canvas.getBoundingClientRect();
    c.el.style.left = `${rect.right - 40 - 10}px`;
    c.el.style.top = `${rect.top + 10}px`;
    flash(c.el, c, () => {
      c.anchor = rotatablePanes().find((q) => q.key === p.key)?.st.rotation || 0;
    });
  }
}

function resetRotation(key) {
  const p = rotatablePanes().find((q) => q.key === key);
  if (!p) return;
  const st = p.st;
  const from = normalizeAngle(st.rotation || 0);
  if (from === 0) return;
  if (p.fractalPane) {
    cancelTeleport();
    pushHistory(p.fractalPane);
    setActivePane(p.fractalPane);
  } else {
    p.nav.checkpoint();
  }
  const durationMs = prefersReducedMotion() ? 0 : COMPASS_RESET_MS;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const t0 = performance.now();
  // Same per-frame path as teleport: markInteracting keeps deep-zoom panes on
  // the cheap preview until the last frame, then the settle timer renders
  // for real. Rotation turns about the view center, so cx/cy stay put.
  const step = (now) => {
    const cur = rotatablePanes().find((q) => q.key === key);
    if (!cur || cur.st !== st) return; // mode/fractal changed mid-animation
    const t = durationMs ? Math.min(1, (now - t0) / durationMs) : 1;
    st.rotation = t < 1 ? from * (1 - ease(t)) : 0;
    if (p.fractalPane) markInteracting();
    renderAll();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let lastKeyHistoryPush = 0;

document.addEventListener("keydown", (e) => {
  // Leave browser/OS shortcuts (Cmd+arrows, Cmd +/-) alone, and let
  // focused form controls (sliders take arrow keys) keep their keys.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
  const action = keyAction(e);
  if (!action) return;
  e.preventDefault();

  if (mode === "fractal") {
    if (action.reset) { els.resetBtn.click(); return; }
    // In dual mode, keys drive whichever pane was last touched.
    const pane = dualActive && activePane === "julia" && juliaState ? "julia" : "main";
    const st = pane === "julia" ? juliaState : mainState;
    const renderer = pane === "julia" ? juliaRenderer : mainRenderer;
    cancelTeleport();
    const now = performance.now();
    if (now - lastKeyHistoryPush > 400) { pushHistory(pane); lastKeyHistoryPush = now; }
    const w = renderer.canvas.width / renderer.dpr, h = renderer.canvas.height / renderer.dpr;
    if (action.pan) {
      const step = KEY_PAN_FRACTION * Math.min(w, h);
      const c = screenToComplex(renderer, st, w / 2 + action.pan[0] * step, h / 2 + action.pan[1] * step);
      st.cx = c.x;
      st.cy = c.y;
    } else if (action.zoom) {
      st.scale = limitScale(st, st.scale * action.zoom);
    } else if (action.rotate) {
      st.rotation = normalizeAngle((st.rotation || 0) + action.rotate);
    }
    markInteracting();
    requestRender();
    return;
  }

  const target = activeVectorTarget();
  if (!target) return;
  if (action.reset) { target.resetBtn.click(); return; }
  const { v, canvas, nav } = target;
  nav.checkpoint();
  if (action.pan) {
    // screenToWorld works in device pixels (canvas.width/height), so the
    // step is measured in them too.
    const step = KEY_PAN_FRACTION * Math.min(canvas.width, canvas.height);
    const [x, y] = v.screenToWorld(canvas.width / 2 + action.pan[0] * step, canvas.height / 2 + action.pan[1] * step);
    v.view.cx = x;
    v.view.cy = y;
  } else if (action.zoom) {
    v.view.halfHeight *= action.zoom;
  } else if (action.rotate) {
    v.view.rotation = normalizeAngle((v.view.rotation || 0) + action.rotate);
  }
  requestRender();
});

function applyHudVisibility() {
  els.hud.classList.toggle("hidden", !hudVisible);
  document.querySelectorAll(".hudToggleBtn").forEach((b) => b.classList.toggle("active", hudVisible));
  requestRender(); // the canvas area just changed height
}
document.querySelectorAll(".hudToggleBtn").forEach((b) => b.addEventListener("click", () => {
  setHudVisible(!hudVisible);
  applyHudVisibility();
}));
// (The first applyHudVisibility() call is at the start of init: it schedules a render.)

// Website welcome card (never shown in the app, see platform.js). The
// fractal count comes from the picker's tiles so it can't go stale.
function initWelcomeCard() {
  if (Platform.welcome.isDismissed()) return;
  const n = els.fractalTypeRow.querySelectorAll("button[data-name], button[data-mode]").length;
  els.welcomeText.textContent = `Zoom into ${n} fractals. Pinch, drag, or tap the die to fly somewhere new.`;
  els.welcome.classList.remove("hidden");
}
els.welcomeClose.addEventListener("click", () => {
  Platform.welcome.dismiss();
  els.welcome.classList.add("hidden");
});

// ---------------------------------------------------------------- UI wiring

// Picker: a grid of tiles, each a pre-rendered thumbnail plus the name
// (thumbnails come from scripts/render_thumbs.mjs; re-run it after adding a
// fractal or changing a default view). Sections and groups come from
// PICKER_LAYOUT in fractal-defs.js.
function addPickerHeader(text, isSub = false) {
  const header = document.createElement("div");
  header.className = isSub ? "menuSectionHeader sub" : "menuSectionHeader";
  header.textContent = text;
  els.fractalTypeRow.appendChild(header);
}
function addPickerTile(label, slug, onPick, data) {
  const btn = document.createElement("button");
  btn.className = "pickTile";
  Object.assign(btn.dataset, data);
  const img = document.createElement("img");
  img.src = `icons/thumbs/${slug}.webp`;
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy"; // fetched when the picker first opens, not at startup
  const name = document.createElement("span");
  name.textContent = label;
  btn.append(img, name);
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
        addPickerTile(config.label, slugify(key), () => selectFractal(key), { name: key });
      } else {
        const mode = EXTRA_MODES.find((m) => m.key === key);
        addPickerTile(mode.label, mode.key, () => setMode(mode.key), { mode: mode.key });
      }
    });
  });
});
updateMenuActiveState();

// Two hamburger buttons exist (one in #fractalControls, one in #kochControls
// — see index.html) so the menu stays reachable regardless of mode, since
// selecting Koch/a fractal type from it is now the only way to switch modes
// at all. Both share the .fractalMenuBtn class rather than an id.
document.querySelectorAll(".fractalMenuBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.colormapMenu.classList.remove("open");
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

// Sliders: keep each one's filled-track position (--fill, 0-1, read by
// the track's gradient in index.html) in sync with its value. Dragging fires
// "input" (each listener below calls syncSliderFill); everything the app's
// scripts set from code (URL restore, fractal switches, Koch's depth animation,
// a curve's max depth changing) goes through the value/max setters, which
// are wrapped here once per slider instead of patched at every call site.
const SLIDERS = [els.iterSlider, els.kochDepthSlider, els.treeDepthSlider, els.hexaflakeDepthSlider, els.dragonDepthSlider, els.fernPointsSlider];

function syncSliderFill(slider) {
  const min = parseFloat(slider.min), max = parseFloat(slider.max);
  const pct = max > min ? (parseFloat(slider.value) - min) / (max - min) * 100 : 0;
  slider.style.setProperty("--fill", String(Math.min(100, Math.max(0, pct)) / 100));
}

for (const slider of SLIDERS) {
  for (const prop of ["value", "max", "min"]) {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, prop);
    Object.defineProperty(slider, prop, {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); syncSliderFill(this); },
    });
  }
  syncSliderFill(slider);
}

els.iterSlider.addEventListener("input", () => {
  syncSliderFill(els.iterSlider);
  const v = parseInt(els.iterSlider.value, 10);
  mainState.maxIter = v;
  if (juliaState) juliaState.maxIter = v;
  // Manual interaction is the only thing that turns auto iter mode off
  // (for both panes, since this slider drives both); Reset and a fractal's
  // first visit turn it back on (a revisit keeps its remembered setting).
  mainState.iterAutoLocked = true;
  if (juliaState) juliaState.iterAutoLocked = true;
  requestRender();
});


els.dualBtn.addEventListener("click", () => {
  if (dualActive) closeDual();
  else if (FRACTAL_CONFIGS[currentName].dualParent) openPresetInDual(currentName, mainState);
  else enterDual();
  els.dualBtn.classList.toggle("active", dualActive);
});

els.boxZoomBtn.addEventListener("click", () => {
  setBoxZoomActive(!boxZoomActive);
  els.boxZoomBtn.classList.toggle("active", boxZoomActive);
  if (!boxZoomActive) els.boxRect.classList.add("hidden");
});

els.backBtn.addEventListener("click", () => { cancelTeleport(); popHistory(activePane); });

