// Entry point; must load last. Holds, in order: compass, UI wiring, teleport (Surprise me), colormap
// picker, color sheet, share links and image, toolbar accessibility, init. The load-time lines that
// schedule a frame or a callback (render, idle callback, resize, ResizeObserver) are at the start
// of init, so they cannot run before the last script has loaded.
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
    activePane = p.fractalPane;
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
      st.scale *= action.zoom;
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
  hudVisible = !hudVisible;
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
// fractal or changing a default view). Julia presets get their own
// subsection under Infinite zoom.
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
FRACTAL_CATEGORIES.forEach((fam) => {
  const names = FRACTAL_NAMES.filter((n) => FRACTAL_CONFIGS[n].category === fam.key);
  const extraModes = EXTRA_MODES.filter((m) => m.category === fam.key);
  if (names.length === 0 && extraModes.length === 0) return;
  addPickerHeader(fam.label);
  const addFractal = (name) => addPickerTile(FRACTAL_CONFIGS[name].label, slugify(name), () => selectFractal(name), { name });
  names.filter((n) => !FRACTAL_CONFIGS[n].group).forEach(addFractal);
  const julias = names.filter((n) => FRACTAL_CONFIGS[n].group === "julia");
  if (julias.length) {
    addPickerHeader("Julia sets", true);
    julias.forEach(addFractal);
  }
  extraModes.forEach((m) => addPickerTile(m.label, m.key, () => setMode(m.key), { mode: m.key }));
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
// "input" (each listener below calls syncSliderFill); everything app.js
// sets from code (URL restore, fractal switches, Koch's depth animation,
// a curve's max depth changing) goes through the value/max setters, which
// are wrapped here once per slider instead of patched at every call site.
const SLIDERS = [els.iterSlider, els.kochDepthSlider, els.treeDepthSlider, els.dragonDepthSlider, els.fernPointsSlider];

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
  boxZoomActive = !boxZoomActive;
  els.boxZoomBtn.classList.toggle("active", boxZoomActive);
  if (!boxZoomActive) els.boxRect.classList.add("hidden");
});

els.backBtn.addEventListener("click", () => { cancelTeleport(); popHistory(activePane); });

// ---------------------------------------------------------------- teleport ("Surprise me")

// d3's interpolateZoom (van Wijk & Nuij, "Smooth and efficient zooming and
// panning"): a far jump zooms out, pans, and zooms back in, instead of
// zooming straight at a point that stays off-screen the whole way. Views
// are [cx, cy, w] with w the visible height; returns f(t) for t in [0, 1].
// The near-case cutoff is relative to w, not d3's absolute 1e-12 --
// deep-zoom jumps are routinely that small in absolute terms. f.distance
// is the path's length in d3's units (roughly zoom levels travelled),
// used to size the flight's duration.
function zoomPath(p0, p1) {
  const rho = Math.SQRT2, rho2 = 2, rho4 = 4;
  const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1;
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
  const tiny = 1e-6 * Math.min(w0, w1);
  if (d2 < tiny * tiny) {
    const S = Math.log(w1 / w0) / rho;
    const f = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
    f.distance = Math.abs(S);
    return f;
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  // d3 writes these as log(sqrt(b*b + 1) - b), which cancels to log(0) when
  // a flight starts deep (b0 ~ distance / w0 ~ 1e10). -asinh(b) is the same
  // value, computed stably.
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const S = (r1 - r0) / rho;
  const coshr0 = Math.cosh(r0), sinhr0 = Math.sinh(r0);
  const f = (t) => {
    const s = t * S;
    const u = w0 / (rho2 * d1) * (coshr0 * Math.tanh(rho * s + r0) - sinhr0);
    return [ux0 + u * dx, uy0 + u * dy, w0 * coshr0 / Math.cosh(rho * s + r0)];
  };
  f.distance = Math.abs(S);
  return f;
}

// Flight time grows with distance: ~1s for a short hop from the opening
// view (distance ~4), up to 2.5s for the longest deep-to-deep dives (~34).
function teleportDurationMs(distance) {
  return Math.min(2500, Math.max(1000, 1000 + (distance - 4) * 50));
}
// Spiral dives (a destination's spiral flag) are slower, at a steady speed,
// turning 90 degrees per 3x of zoom: five full turns on the way down from
// the opening view.
const SPIRAL_DIVE_MS = 7000;
const SPIRAL_RAD_PER_ZOOM = (Math.PI / 2) / Math.log(3); // per e-fold
// Speed ramps up over the first 12% of the flight, cruises, and slows over
// the last 18% (fractions of time); returns the distance covered, 0..1.
function steadyEase(t, a = 0.12, b = 0.18) {
  const vmax = 1 / (1 - a / 2 - b / 2);
  if (t < a) return vmax * t * t / (2 * a);
  if (t <= 1 - b) return vmax * (a / 2 + (t - a));
  const u = 1 - t;
  return 1 - vmax * u * u / (2 * b);
}
let lastTeleportIndex = -1; // index into TELEPORT_DESTINATIONS; never picked twice in a row
let teleportLandingIndex = -1; // TELEPORT_DESTINATIONS index of the last completed flight, for the info overlay
let teleportGeneration = 0;

// Any direct manipulation (pointer, wheel, Back, fractal switch) wins over
// an in-flight flight: bumping the generation makes its next frame a no-op.
function cancelTeleport() { teleportGeneration++; }

function teleport() {
  if (mode !== "fractal") return;
  const own = TELEPORT_DESTINATIONS
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.fractal === currentName);
  if (own.length === 0) return;
  const candidates = own.filter(({ i }) => i !== lastTeleportIndex);
  const st = mainState;
  let d, i, target;
  let landingIndex, spinSign = 1;
  if (candidates.length > 0) {
    ({ d, i } = candidates[Math.floor(Math.random() * candidates.length)]);
    lastTeleportIndex = i;
    target = { cx: Number(d.re), cy: Number(d.im), scale: d.scale };
    landingIndex = i;
  } else {
    // A fractal with one place (none since 1.35.0; Newton and Gasket
    // before that): taps alternate between
    // diving in and spiraling back out to the opening view, picked by
    // which of the two the current view is nearer, so a hand zoom between
    // taps still gets the sensible direction.
    ({ d, i } = own[0]);
    const home = viewFromBounds(FRACTAL_CONFIGS[currentName].view, mainCanvasAspect());
    const here = [st.cx, st.cy, 2 * st.scale];
    const toPlace = zoomPath(here, [Number(d.re), Number(d.im), 2 * d.scale]).distance;
    const toHome = zoomPath(here, [home.cx, home.cy, 2 * home.scale]).distance;
    if (toPlace < toHome) {
      // The opening view is upright, so the way out lands at rotation 0
      // and its spiral unwinds the way in.
      d = { ...d, rotation: 0 };
      target = { cx: home.cx, cy: home.cy, scale: home.scale };
      landingIndex = -1;
      spinSign = -1;
    } else {
      target = { cx: Number(d.re), cy: Number(d.im), scale: d.scale };
      landingIndex = i;
    }
  }

  flyTo(st, d, target, landingIndex, spinSign);
}

// The flight itself, shared by Surprise me and the web's first-visit cold
// open (flyToPlace).
function flyTo(st, d, target, landingIndex, spinSign) {
  // A destination with a rotation lands turned to it (Burning Ship's ships
  // are drawn masts-down in math orientation); one without leaves the
  // view's rotation alone, as before. The turn takes the shorter way round.
  const r0 = st.rotation || 0;
  let turn = d.rotation === undefined ? 0 : normalizeAngle(d.rotation - r0);
  if (d.rotation !== undefined) target.rotation = d.rotation;
  pushHistory("main");
  activePane = "main";
  const path = zoomPath([st.cx, st.cy, 2 * st.scale], [target.cx, target.cy, 2 * target.scale]);
  // A spiral adds whole turns to the landing turn, as many as its zoom
  // calls for: path.distance times sqrt(2) is the e-folds of zoom travelled
  // (out and back in, for a flight that starts deep). The path's parameter
  // runs at constant speed in zoom, so a turn linear in it keeps the spin
  // locked to the zoom. Reduced motion skips the spin and the long flight.
  const spiral = d.spiral && !prefersReducedMotion();
  if (spiral) {
    const spin = spinSign * SPIRAL_RAD_PER_ZOOM * Math.SQRT2 * path.distance;
    turn += 2 * Math.PI * Math.round((spin - turn) / (2 * Math.PI));
  }
  const ease = spiral ? steadyEase : (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const durationMs = spiral ? SPIRAL_DIVE_MS : teleportDurationMs(path.distance);
  const gen = ++teleportGeneration;
  const t0 = performance.now();

  // Each frame goes through the same path as a pinch frame: markInteracting
  // puts renderAll on its gesture path (live float32 above
  // DEEP_ZOOM_THRESHOLD, the moving last-frame preview below it), and its
  // settle timer does the full-quality render -- perturbation reference
  // orbit included, via render()'s normal chooseReference call -- plus
  // applyAutoIter once the last frame lands.
  const step = (now) => {
    if (gen !== teleportGeneration || mode !== "fractal" || mainState !== st) return;
    const t = Math.min(1, (now - t0) / durationMs);
    if (t < 1) {
      const k = ease(t);
      const [cx, cy, w] = path(k);
      st.cx = cx; st.cy = cy; st.scale = w / 2;
      // Wrapped, so a spiral cancelled mid-turn leaves a normal angle.
      if (turn) st.rotation = normalizeAngle(r0 + turn * k);
      // A spiral dive's frames are all live, and its spiral centers need
      // more iterations the deeper they go (Into the Eye's center goes black
      // halfway down at the starting detail), so auto detail follows the
      // zoom frame by frame instead of jumping on landing.
      if (spiral) { st.iterAutoLocked = false; applyAutoIter(); }
    } else {
      // Exact landing: the path's last point can be a few ulps off, which
      // matters at 1e-12 scales.
      Object.assign(st, target);
      // A slider-locked maxIter can be far too low for the new place (a
      // lock at 300 lands Seahorse Valley all black), so landing hands
      // maxIter back to auto mode; the settle's applyAutoIter sets it. A
      // place with its own maxIter (Bird's Eye) lands locked to it instead.
      if (landingIndex >= 0 && d.maxIter) {
        st.maxIter = d.maxIter;
        st.iterAutoLocked = true;
      } else {
        st.iterAutoLocked = false;
      }
      teleportLandingIndex = landingIndex;
    }
    markInteracting();
    renderAll();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Flies the main view to one named place, as Surprise me does.
function flyToPlace(i) {
  const d = TELEPORT_DESTINATIONS[i];
  lastTeleportIndex = i;
  flyTo(mainState, d, { cx: Number(d.re), cy: Number(d.im), scale: d.scale }, i, 1);
}

// The website's first visit (no share link): instead of a small plain
// Mandelbrot, fly from the whole set to one of a few showpiece places with
// the info card open. Waits a beat after the first painted frame so the
// whole set registers first; any touch (pointerdown bumps the generation)
// before then, or during the flight, wins. A renamed label throws here
// rather than silently skipping the flight.
const COLD_OPEN_PLACES = ["Seahorse Valley", "Mini Mandelbrot", "Elephant Valley", "Double Spiral", "Sunburst Fan"];
function coldOpen() {
  const gen = teleportGeneration;
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
    if (gen !== teleportGeneration || mode !== "fractal" || currentName !== "Mandelbrot") return;
    const places = COLD_OPEN_PLACES.map((label) => {
      const i = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === "Mandelbrot" && d.label === label);
      if (i < 0) throw new Error(`Cold open place "${label}" is not in TELEPORT_DESTINATIONS`);
      return i;
    });
    hudVisible = true;
    applyHudVisibility();
    flyToPlace(places[Math.floor(Math.random() * places.length)]);
  }, 600)));
}

// Dual view's tap: glide the main view so (x, y) lands at the center, which
// moves the Julia pane's c there (renderAll syncs c to the center). Shares
// teleport's generation counter, so a new gesture/Back/teleport cancels it,
// and its per-frame path (markInteracting + renderAll).
const GLIDE_MS = 300;
function glideMainTo(x, y) {
  const st = mainState;
  cancelTeleport();
  pushHistory("main");
  activePane = "main";
  const x0 = st.cx, y0 = st.cy;
  const durationMs = prefersReducedMotion() ? 0 : GLIDE_MS;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const gen = ++teleportGeneration;
  const t0 = performance.now();
  const step = (now) => {
    if (gen !== teleportGeneration || mode !== "fractal" || mainState !== st || !dualActive) return;
    const t = durationMs ? Math.min(1, (now - t0) / durationMs) : 1;
    const k = ease(t);
    // Exact landing on the last frame (x0 + (x - x0) * 1 can be an ulp off).
    st.cx = t < 1 ? x0 + (x - x0) * k : x;
    st.cy = t < 1 ? y0 + (y - y0) * k : y;
    markInteracting();
    renderAll();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

els.teleportBtn.addEventListener("click", teleport);

els.resetBtn.addEventListener("click", () => selectFractal(currentName, { fresh: true }));

els.kochDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.kochDepthSlider);
  kochState.depth = parseInt(els.kochDepthSlider.value, 10);
  requestRender();
});

els.kochFillBtn.addEventListener("click", () => {
  kochState.fill = !kochState.fill;
  els.kochFillBtn.classList.toggle("active", kochState.fill);
  requestRender();
});


// Depth play/pause (Koch, tree, line curves): steps the row's depth slider
// up to its max and back down, over and over, by setting its value and
// firing "input" -- the same path as a drag, so each mode's own listener
// does the redraw. The speed button beside it is pressed and slid: left
// slower, right faster, one step per SPEED_DRAG_PX. Speed is shared by all
// rows. Switching modes or touching the slider stops playback.
const DEPTH_STEP_MS = 700; // at 1x, as Koch's old animate button
const PLAY_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const SPEED_DRAG_PX = 28;
const depthPlayer = { slider: null, dir: 1, timer: 0, speedIndex: PLAY_SPEEDS.indexOf(1) };

function depthSliderForMode() {
  if (mode === "koch") return els.kochDepthSlider;
  if (mode === "tree") return els.treeDepthSlider;
  if (isCurveMode(mode)) return els.dragonDepthSlider;
  return null;
}

function speedText(speed) {
  return ({ 0.25: "¼", 0.5: "½", 0.75: "¾" }[speed] || String(speed)) + "×";
}

function syncPlayButtons() {
  const playing = depthPlayer.slider !== null;
  for (const btn of document.querySelectorAll(".depthPlayBtn")) {
    btn.classList.toggle("playing", playing);
    btn.setAttribute("aria-label", playing ? "Pause depth" : "Play depth");
    btn.title = playing ? "Pause depth" : "Play depth";
  }
  const text = speedText(PLAY_SPEEDS[depthPlayer.speedIndex]);
  for (const btn of document.querySelectorAll(".depthSpeedBtn")) {
    btn.textContent = text;
    btn.setAttribute("aria-label", `Play speed ${text}`);
  }
}

function stopDepthPlay() {
  if (!depthPlayer.slider) return;
  clearTimeout(depthPlayer.timer);
  depthPlayer.slider = null;
  syncPlayButtons();
}

function depthPlayStep() {
  const s = depthPlayer.slider;
  const min = parseInt(s.min, 10), max = parseInt(s.max, 10);
  const v = parseInt(s.value, 10);
  if (max <= min) { stopDepthPlay(); return; }
  if (v + depthPlayer.dir > max || v + depthPlayer.dir < min) depthPlayer.dir = -depthPlayer.dir;
  s.value = v + depthPlayer.dir;
  s.dispatchEvent(new Event("input"));
  depthPlayer.timer = setTimeout(depthPlayStep, DEPTH_STEP_MS / PLAY_SPEEDS[depthPlayer.speedIndex]);
}

function startDepthPlay() {
  const s = depthSliderForMode();
  if (!s) return;
  depthPlayer.slider = s;
  // Heads up from where it is, unless it's already at the top.
  depthPlayer.dir = parseInt(s.value, 10) >= parseInt(s.max, 10) ? -1 : 1;
  syncPlayButtons();
  depthPlayStep();
}

for (const btn of document.querySelectorAll(".depthPlayBtn")) {
  btn.addEventListener("click", () => (depthPlayer.slider ? stopDepthPlay() : startDepthPlay()));
}
for (const s of [els.kochDepthSlider, els.treeDepthSlider, els.dragonDepthSlider]) {
  s.addEventListener("pointerdown", stopDepthPlay);
}

// The readout above a held speed button: the speed, and which way is which.
let speedBubbleTimer = 0;
function showSpeedBubble(btn, hint) {
  const b = document.getElementById("speedBubble");
  const r = btn.getBoundingClientRect();
  b.innerHTML = `<b>${speedText(PLAY_SPEEDS[depthPlayer.speedIndex])}</b><span>${hint}</span>`;
  b.classList.remove("hidden");
  // Kept on screen: the speed button can sit near the row's left edge.
  const half = b.offsetWidth / 2 + 8;
  b.style.left = `${Math.min(window.innerWidth - half, Math.max(half, r.left + r.width / 2))}px`;
  b.style.top = `${r.top}px`;
  clearTimeout(speedBubbleTimer);
}
function hideSpeedBubble(delayMs) {
  clearTimeout(speedBubbleTimer);
  speedBubbleTimer = setTimeout(() => document.getElementById("speedBubble").classList.add("hidden"), delayMs);
}
function setSpeedIndex(i) {
  depthPlayer.speedIndex = Math.min(PLAY_SPEEDS.length - 1, Math.max(0, i));
  syncPlayButtons();
}

for (const btn of document.querySelectorAll(".depthSpeedBtn")) {
  let drag = null;
  let slid = false; // the press that ends in this click was a slide, not a tap
  const hint = "◀ slower · faster ▶";
  btn.addEventListener("pointerdown", (e) => {
    btn.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, i0: depthPlayer.speedIndex, moved: false };
    btn.classList.add("dragging");
    showSpeedBubble(btn, hint);
  });
  btn.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (Math.abs(dx) > 6) drag.moved = true;
    const i = drag.i0 + Math.round(dx / SPEED_DRAG_PX);
    if (i !== depthPlayer.speedIndex) {
      setSpeedIndex(i);
      showSpeedBubble(btn, hint);
    }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // A tap without a slide leaves the readout up a little longer, as a
    // how-to for the gesture.
    hideSpeedBubble(drag.moved ? 500 : 1800);
    slid = drag.moved;
    drag = null;
    btn.classList.remove("dragging");
  };
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  // A tap (or VoiceOver/Switch Control activation, or Enter/Space) steps
  // to the next speed, wrapping from 4x back to 1/4x, so the speed can be
  // changed without the hold-and-slide. A slide also ends in a click, which
  // is skipped.
  btn.addEventListener("click", () => {
    if (slid) { slid = false; return; }
    setSpeedIndex((depthPlayer.speedIndex + 1) % PLAY_SPEEDS.length);
    showSpeedBubble(btn, hint);
    hideSpeedBubble(1800);
  });
  // Keyboard: arrow keys step the speed while the button has focus.
  btn.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    setSpeedIndex(depthPlayer.speedIndex + step);
    showSpeedBubble(btn, hint);
    hideSpeedBubble(1200);
  });
}
syncPlayButtons();

els.kochResetBtn.addEventListener("click", () => {
  kochNav.clearHistory();
  fitVectorView("koch");
  requestRender();
});

els.treeDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.treeDepthSlider);
  treeState.depth = parseInt(els.treeDepthSlider.value, 10);
  requestRender();
});


els.treeResetBtn.addEventListener("click", () => {
  treeNav.clearHistory();
  fitVectorView("tree");
  requestRender();
});

els.dragonDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.dragonDepthSlider);
  dragonState.depth = parseInt(els.dragonDepthSlider.value, 10);
  requestRender();
});


els.dragonResetBtn.addEventListener("click", () => {
  dragonNav.clearHistory();
  fitVectorView(mode);
  requestRender();
});

els.fernPointsSlider.addEventListener("input", () => {
  syncSliderFill(els.fernPointsSlider);
  fernState.count = parseInt(els.fernPointsSlider.value, 10);
  requestRender();
});

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

[els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.dragonColormapBtn, els.fernColorBtn].forEach((btn) => {
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
      [els.treeColormapBtn.id]: "tree", [els.dragonColormapBtn.id]: dragonView.curve,
    }[btn.id] || null);
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.colormapMenu.classList.contains("open")) return;
  if (els.colormapMenu.contains(e.target) || e.target.closest("[aria-haspopup]")) return;
  els.colormapMenu.classList.remove("open");
});

// ---------------------------------------------------------------- color sheet

// The Looks: a style with a palette, at the neutral bands and shift. Their
// swatches are icons/looks/sprite.webp (scripts/render_look_thumbs.mjs).
// Picking one changes the palette, and the color button shows it.
// "Default" is today's coloring (Smooth on Inferno): the tile that gets you
// back to how the app starts. A palette alone isn't a Look; the palettes are
// in the Custom tab. The grid has room for more Looks.
const COLOR_LOOKS = [
  { id: "default", label: "Default", style: "smooth", palette: "Inferno" },
  { id: "edge-glow", label: "Edge glow", style: "glow", palette: "Inferno" },
  { id: "stripes", label: "Stripes", style: "stripes", palette: "Glacier" },
  { id: "bands", label: "Bands", style: "bands", palette: "Turbo" },
  { id: "orbs", label: "Orbs", style: "point", palette: "Twilight" },
  { id: "rays", label: "Rays", style: "cross", palette: "Plasma" },
  { id: "relief", label: "Relief", style: "relief", palette: "Classic" },
];
let colorSheetTab = "looks";

// The sheet is the palette list on every fractal; the escape-time fractals get
// the styles, Looks and sliders with it, the rest (Newton, Carpet, Gasket,
// Apollonian, which color by their own schemes) only the palette grid.
function colorSheetApplies() {
  return mode === "fractal";
}
function colorSheetStyles() {
  return colorSheetApplies() && ESCAPE_TIME_TYPES.includes(mainState.ftype);
}

// The Look the current choices amount to, or null (Custom). What the view
// draws counts, not what was chosen: on Phoenix a Cross choice draws Smooth.
function currentLookId() {
  if (colorStyle.density !== 1 || colorStyle.offset !== 0) return null;
  const palette = COLORMAPS[colormapIndex].name;
  const drawn = styleDrawn(colorStyle.style, mainState);
  const look = COLOR_LOOKS.find((l) => l.style === drawn && l.palette === palette);
  return look ? look.id : null;
}

function applyLook(look) {
  colormapIndex = COLORMAPS.findIndex((c) => c.name === look.palette);
  updateLUT();
  setColorStyle({ style: look.style, density: 1, offset: 0 });
  requestRender();
}

function colorSheetEl(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    // ARIA states are the strings "true" and "false"; other attributes are
    // omitted when false (so `disabled: false` leaves the button enabled).
    if (/^aria-(checked|selected|disabled|expanded|pressed)$/.test(k) && typeof v === "boolean") node.setAttribute(k, String(v));
    else if (v === false || v === null || v === undefined) continue;
    else if (k === "class") node.className = v;
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  node.append(...children);
  return node;
}

// "<b>Point</b> and <b>Cross</b>" as nodes.
function boldList(styles) {
  const out = [];
  styles.forEach((s, i) => {
    if (i > 0) out.push(i === styles.length - 1 ? " and " : ", ");
    out.push(colorSheetEl("b", {}, s.label));
  });
  return out;
}

// Says why some styles are greyed out right now, or null if none are. Each tab
// has its own copy (`where` is "looks" or "custom": the ids can't repeat), and
// it names the styles in the words the tiles and the segments use.
function colorSheetNote(where) {
  const byType = COLOR_STYLES.filter((s) => styleBlocked(s, mainState) === "type");
  const byDepth = COLOR_STYLES.filter((s) => styleBlocked(s, mainState) === "depth");
  if (!byType.length && !byDepth.length) return null;
  const note = colorSheetEl("p", { class: "note", id: `colorSheetNote-${where}` });
  if (byDepth.length) {
    // Says how far off the view is: from a Surprise-me place, billions of
    // times deep, getting back under the limit takes a long pinch out.
    note.append(...boldList(byDepth), ` only draw in views under ${COLOR_STYLES.find((s) => s.maxZoom).maxZoom.toLocaleString("en-US")}× deep. This one is ${zoomPhrase(mainState.baseScale, mainState.scale)}.`);
  }
  if (byType.length) {
    if (byDepth.length) note.append(" ");
    note.append(...boldList(byType), ` aren't available for ${fractalLabel(currentName)}.`);
  }
  return note;
}

// The Looks' swatches are cut from one sprite, icons/looks/sprite.webp (the
// Looks in COLOR_LOOKS order; scripts/render_look_thumbs.mjs):
// one file to fetch and decode, drawn as a CSS background so a rebuilt tile
// costs nothing, and sharp at any pixel density.
const LOOK_SWATCHES = COLOR_LOOKS.length;
function lookSwatch(index) {
  const x = LOOK_SWATCHES > 1 ? (index * 100) / (LOOK_SWATCHES - 1) : 0;
  return colorSheetEl("span", { class: "swatch", "aria-hidden": "true", style: `background-size:${LOOK_SWATCHES * 100}% 100%;background-position:${x}% 0` });
}
// While the app is idle after it loads (the sprite isn't otherwise asked for
// until the sheet is first opened, over the network on the website, where the
// service worker also revalidates each file): fetch and decode it, and build
// the sheet, so opening it later is only showing it. The Image is kept so the
// decoded picture stays in memory.
let lookSpriteImage = null;
function prepareColorSheet() {
  lookSpriteImage = new Image();
  lookSpriteImage.src = "icons/looks/sprite.webp";
  lookSpriteImage.decode?.().catch(() => {});
  // Not while the sheet is open: this runs a few seconds after load, and someone
  // who has already opened it and switched tabs must not be sent back to the
  // opening tab, nor have the controls under their finger rebuilt.
  if (colorSheetApplies() && !els.colorSheet.classList.contains("open")) {
    colorSheetTab = colorSheetOpeningTab();
    renderColorSheet();
  }
  warmColorVariants();
}

// Compiling the color styles' shader variants ahead of the pick. Each style
// with per-iteration work (Glow, Stripes, the traps) is its own program, built
// the first time it's drawn; on a phone that compile is a visible stall at the
// tap. So once the app is idle, and again whenever the Color sheet opens, the
// variants this fractal can use are built for the main pane, and for the
// Julia pane too where dual view is offered: one at a time, each in an idle
// moment (or started off the main thread where the browser can), never while
// a gesture or a flight is on.
const warmQueue = [];
let warmRunning = false;
function warmColorVariants() {
  if (mode !== "fractal" || !ESCAPE_TIME_TYPES.includes(mainState.ftype)) return;
  const variants = [...new Set(COLOR_STYLES
    .filter((s) => s.variant && (s.types || ESCAPE_TIME_TYPES).includes(mainState.ftype)).map((s) => s.variant))];
  const jobs = variants.map((v) => [mainRenderer, v]);
  if (FRACTAL_CONFIGS[currentName].dual) jobs.push(...variants.map((v) => [juliaRenderer, v]));
  warmQueue.splice(0, warmQueue.length, ...jobs.filter(([r, v]) => !r.compiledVariants.includes(v)));
  if (warmQueue.length && !warmRunning) { warmRunning = true; warmNextVariant(); }
}
function warmNextVariant() {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  idle(() => {
    if (isInteracting) { setTimeout(warmNextVariant, 400); return; }
    const job = warmQueue[0];
    if (!job) { warmRunning = false; return; }
    let state = "ready";
    try { state = job[0].warmVariant(job[1]); } catch (e) { console.warn("Shader warm-up failed:", e); }
    if (state === "ready") warmQueue.shift();
    if (warmQueue.length) setTimeout(warmNextVariant, state === "pending" ? 60 : 0);
    else warmRunning = false;
  }, { timeout: 2500 });
}
// (prepareColorSheet is scheduled at the start of init.)

// A greyed-out Look says why when it's tapped: the note under the grid lights
// up briefly.
function flashColorSheetNote() {
  const note = els.colorSheet.querySelector(".panel.current .note");
  if (!note) return;
  note.scrollIntoView({ block: "nearest" });
  note.classList.remove("flash");
  void note.offsetWidth; // restart the animation
  note.classList.add("flash");
}

// The arrow keys move focus between the radios of a group, which has one tab
// stop (the checked one, else the first), so the Custom tab isn't 18 stops.
// Enter or Space picks, as for any button.
function rovingRadios(group) {
  const radios = [...group.querySelectorAll('[role="radio"]')].filter((r) => !r.disabled);
  const stop = radios.find((r) => r.getAttribute("aria-checked") === "true") || radios[0];
  radios.forEach((r) => r.setAttribute("tabindex", r === stop ? "0" : "-1"));
  group.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    const i = radios.indexOf(document.activeElement);
    if (!step || i < 0) return;
    e.preventDefault();
    const next = radios[(i + step + radios.length) % radios.length];
    next.setAttribute("tabindex", "0");
    radios[i].setAttribute("tabindex", "-1");
    next.focus();
  });
}

// The Looks: every one on screen at once, in a grid (four across on a phone,
// all in one row on an iPad), so none is hidden and the tab is as tall as
// Custom. None is checked when the settings match no Look.
function colorSheetLooks() {
  const active = currentLookId();
  const grid = colorSheetEl("div", { class: "looks", role: "radiogroup", "aria-label": "Looks" });
  COLOR_LOOKS.forEach((look, i) => {
    const blocked = styleBlocked(COLOR_STYLES.find((s) => s.id === look.style), mainState);
    const tile = colorSheetEl("button", {
      class: `pickTile${active === look.id ? " active" : ""}`, role: "radio", "aria-checked": active === look.id,
      "aria-disabled": blocked ? "true" : false, "aria-describedby": blocked ? "colorSheetNote-looks" : false, "data-key": `look-${look.id}`,
    }, lookSwatch(i), colorSheetEl("span", {}, look.label));
    tile.addEventListener("click", () => {
      if (blocked) { flashColorSheetNote(); return; }
      applyLook(look);
      renderColorSheet();
    });
    grid.append(tile);
  });
  rovingRadios(grid);
  return [grid, colorSheetNote("looks")];
}

// The slider for bands is logarithmic: 0.25x to 8x with 1x (today's coloring) in the middle, snapped.
const BANDS_SLIDER = { min: Math.log2(COLOR_BANDS_RANGE[0]), max: Math.log2(COLOR_BANDS_RANGE[1]), step: 0.05 };
function bandsText(density) { return `${Number(density.toFixed(2))}×`; }
function shiftText(offset) { return `${Math.round(offset * 100)}%`; }

// Every palette at once in a wrapping grid, so nothing needs scrolling: each
// swatch is its own gradient, named for assistive tech (and the line above
// says the current one), the current one ringed and ticked.
function colorSheetPalettes() {
  const pals = colorSheetEl("div", { class: "pals", role: "radiogroup", "aria-label": "Palette" });
  COLORMAPS.forEach((c, i) => {
    const btn = colorSheetEl("button", {
      class: `pal${i === colormapIndex ? " active" : ""}`, role: "radio", "aria-checked": i === colormapIndex, "aria-label": c.name,
      title: c.name, "data-key": `pal-${i}`, style: `background:${cmGradient(c.stops)}`,
    });
    btn.addEventListener("click", () => { colormapIndex = i; updateLUT(); requestRender(); renderColorSheet(); });
    pals.append(btn);
  });
  rovingRadios(pals);
  return pals;
}

// "Palette  Inferno" and, on the Custom tab while anything differs from the
// Default (style, palette, repeat or shift), a Reset that puts all four back.
function colorSheetPaletteHead(withReset) {
  const reset = withReset
    ? colorSheetEl("button", { class: `reset${currentLookId() === "default" ? " off" : ""}`, "data-key": "reset", "aria-label": "Reset to Default" }, "Reset") : null;
  reset?.addEventListener("click", () => { applyLook(COLOR_LOOKS[0]); renderColorSheet(); });
  return colorSheetEl("div", { class: "palHead" },
    ...[colorSheetEl("p", {}, colorSheetEl("span", {}, "Palette"), colorSheetEl("b", {}, COLORMAPS[colormapIndex].name)), reset].filter(Boolean));
}
// The sliders don't rebuild the sheet while they move; this shows or hides
// Reset as the settings leave or return to the Default.
function syncColorSheetReset() {
  els.colorSheet.querySelector(".reset")?.classList.toggle("off", currentLookId() === "default");
}

// A slider with its value on screen, not only for VoiceOver (the output is
// hidden from it: the slider already speaks its value).
function colorSheetSlider(name, label, min, max, step, value, text, onInput) {
  const input = colorSheetEl("input", { type: "range", min, max, step, "aria-label": name, "aria-valuetext": text(value) });
  const out = colorSheetEl("output", { class: "val", "aria-hidden": "true" }, text(value));
  input.value = value;
  syncSliderFill(input);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    syncSliderFill(input);
    input.setAttribute("aria-valuetext", text(v));
    out.textContent = text(v);
    onInput(v);
    syncColorSheetReset();
  });
  return colorSheetEl("label", { class: "field" }, colorSheetEl("span", { class: "name" }, label), input, out);
}

function colorSheetCustom() {
  // What the view draws is what shows as chosen: on Phoenix a Cross choice is
  // kept (it comes back on Mandelbrot) but Smooth is the one drawn.
  const drawn = styleDrawn(colorStyle.style, mainState);
  const seg = colorSheetEl("div", { class: "seg", role: "radiogroup", "aria-label": "Style" });
  for (const s of COLOR_STYLES) {
    const blocked = styleBlocked(s, mainState);
    const btn = colorSheetEl("button", {
      class: drawn === s.id ? "active" : "", role: "radio", "aria-checked": drawn === s.id,
      disabled: !!blocked, "aria-describedby": blocked ? "colorSheetNote-custom" : false, "data-key": `style-${s.id}`,
    }, s.label);
    btn.addEventListener("click", () => { setColorStyle({ style: s.id }); renderColorSheet(); });
    seg.append(btn);
  }
  rovingRadios(seg);
  return [
    colorSheetEl("div", { class: "colA" }, ...[seg, colorSheetNote("custom"), colorSheetPaletteHead(true), colorSheetPalettes()].filter(Boolean)),
    colorSheetEl("div", { class: "colB" },
      colorSheetSlider("Color repeat", "Repeat", BANDS_SLIDER.min, BANDS_SLIDER.max, BANDS_SLIDER.step, Math.log2(colorStyle.density),
        (v) => bandsText(2 ** v), (v) => setColorStyle({ density: Math.abs(v) < 0.03 ? 1 : 2 ** v })),
      colorSheetSlider("Color shift", "Shift", 0, 0.99, 0.01, colorStyle.offset, shiftText, (v) => setColorStyle({ offset: v }))),
  ];
}

// Everything the sheet's contents depend on: when it hasn't changed since the
// sheet was built, opening it again keeps the DOM it has.
function colorSheetStateKey() {
  return JSON.stringify([
    colorSheetTab, colorSheetStyles(), colorStyle.style, colorStyle.density, colorStyle.offset, colormapIndex, currentName,
    COLOR_STYLES.map((s) => styleBlocked(s, mainState) || "").join(","),
  ]);
}

// The tab the sheet opens on: Looks if the settings are one of them, else Custom.
function colorSheetOpeningTab() {
  return currentLookId() ? "looks" : "custom";
}

// Rebuilds the sheet for the current state (unless it is already built for
// it), keeping the focused control and the scroll position (the sliders aren't
// rebuilt while dragged, see their input handlers). Both tabs are always
// built and stacked in one grid cell, the one not shown hidden, so the sheet
// is as tall as the taller tab whichever is up and the tab bar never moves.
// A fractal the styles don't apply to gets only the palette grid.
function renderColorSheet() {
  const sheet = els.colorSheet;
  const key = colorSheetStateKey();
  if (sheet.dataset.stateKey === key && sheet.firstChild) return;
  sheet.dataset.stateKey = key;
  const focusKey = document.activeElement?.dataset?.key;
  const scrollTop = sheet.scrollTop;
  const done = colorSheetEl("button", { class: "done", "data-key": "done" }, "Done");
  done.addEventListener("click", () => els.colorSheet.classList.remove("open"));
  if (!colorSheetStyles()) {
    sheet.classList.add("paletteOnly");
    sheet.replaceChildren(
      colorSheetEl("div", { class: "head" }, colorSheetEl("p", { class: "title" }, "Color"), done),
      colorSheetEl("div", { class: "panels" }, colorSheetEl("div", { class: "panel current", role: "group", "aria-label": "Palette" },
        colorSheetPaletteHead(false), colorSheetPalettes())),
    );
  } else {
    sheet.classList.remove("paletteOnly");
    const tabs = colorSheetEl("div", { class: "tabs", role: "tablist" });
    const panels = colorSheetEl("div", { class: "panels" });
    for (const [id, label, build] of [["looks", "Looks", colorSheetLooks], ["custom", "Custom", colorSheetCustom]]) {
      const current = colorSheetTab === id;
      const tab = colorSheetEl("button", {
        class: current ? "active" : "", role: "tab", "aria-selected": current, id: `colorTab-${id}`, "aria-controls": `colorPanel-${id}`,
        tabindex: current ? false : "-1", "data-key": `tab-${id}`,
      }, label);
      tab.addEventListener("click", () => { colorSheetTab = id; renderColorSheet(); });
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        colorSheetTab = id === "looks" ? "custom" : "looks";
        renderColorSheet();
        els.colorSheet.querySelector(`[data-key=tab-${colorSheetTab}]`)?.focus();
      });
      tabs.append(tab);
      panels.append(colorSheetEl("div", {
        class: `panel${current ? " current" : ""}`, role: "tabpanel", id: `colorPanel-${id}`, "aria-labelledby": `colorTab-${id}`, "data-panel": id,
      }, ...build().filter(Boolean)));
    }
    sheet.replaceChildren(colorSheetEl("div", { class: "head" }, tabs, done), panels);
  }
  sheet.scrollTop = scrollTop;
  fitColorSegment();
  if (focusKey) sheet.querySelector(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
}

// The style segments: all seven in one row when every name fits its cell (a
// word wider than its cell would overflow, which is what's measured), else
// four and three. Measured on the open sheet, so it runs after it opens, after
// a rebuild and when the sheet's width changes (a rotation, the text size).
function fitColorSegment() {
  const seg = els.colorSheet.querySelector(".seg");
  if (!seg || !els.colorSheet.classList.contains("open")) return;
  const count = seg.children.length;
  const columns = (n) => { seg.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`; };
  columns(count);
  if ([...seg.children].some((b) => b.scrollWidth > b.clientWidth + 1)) columns(Math.ceil(count / 2));
}
// (fitColorSegment is observed from the start of init.)

function openColorSheet() {
  colorSheetTab = colorSheetOpeningTab();
  renderColorSheet();
  els.colorSheet.classList.add("open");
  fitColorSegment();
  warmColorVariants();
}

// Closing: Done, the color button, Escape, or a plain TAP on the fractal. A
// drag, pinch or twist on it leaves the sheet open, so you can move to another
// spot and watch a style change live. Anything else outside the sheet (a
// toolbar button, a slider) closes it at once, as before. The tap that closes
// it is consumed: in dual view it doesn't also glide the view to where it
// landed (see colorSheetTapClosedAt in the tap-to-recenter check).
const SHEET_TAP_MAX_MOVE = 8; // CSS px
const SHEET_TAP_MAX_MS = 300;
let sheetTap = null; // { id, x, y, t, dead } for the finger on the fractal
let colorSheetTapClosedAt = -1e9;
function colorSheetTapJustClosed() { return performance.now() - colorSheetTapClosedAt < 150; }
document.addEventListener("pointerdown", (e) => {
  if (!els.colorSheet.classList.contains("open")) return;
  if (els.colorSheet.contains(e.target) || e.target.closest("[aria-haspopup]")) return;
  if (e.target.tagName === "CANVAS") {
    // A second finger down means a pinch or twist, never a tap.
    if (sheetTap) sheetTap.dead = true;
    else sheetTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, dead: false };
    return;
  }
  els.colorSheet.classList.remove("open");
});
document.addEventListener("pointermove", (e) => {
  if (sheetTap && e.pointerId === sheetTap.id && Math.hypot(e.clientX - sheetTap.x, e.clientY - sheetTap.y) > SHEET_TAP_MAX_MOVE) sheetTap.dead = true;
}, { passive: true });
// In the capture phase, so it runs before the canvas's own release handling.
document.addEventListener("pointerup", (e) => {
  if (!sheetTap || e.pointerId !== sheetTap.id) return; // a second finger lifting leaves the dead tap in place
  const tap = !sheetTap.dead && e.timeStamp - sheetTap.t < SHEET_TAP_MAX_MS
    && Math.hypot(e.clientX - sheetTap.x, e.clientY - sheetTap.y) <= SHEET_TAP_MAX_MOVE;
  sheetTap = null;
  if (tap && els.colorSheet.classList.contains("open")) {
    els.colorSheet.classList.remove("open");
    colorSheetTapClosedAt = performance.now();
  }
}, true);
document.addEventListener("pointercancel", () => { sheetTap = null; }, true);

els.fernBoxZoomBtn.addEventListener("click", () => {
  fernBoxZoomActive = !fernBoxZoomActive;
  els.fernBoxZoomBtn.classList.toggle("active", fernBoxZoomActive);
  if (!fernBoxZoomActive) els.boxRect.classList.add("hidden");
});

els.fernResetBtn.addEventListener("click", () => {
  fernNav.clearHistory();
  fitVectorView(mode);
  requestRender();
});

// (The window resize listener and the canvasArea ResizeObserver are set up at the start of init.)

// ---------------------------------------------------------------- share: links

// A share link is the page URL plus a hash encoding the current view, e.g.
// #v=1&m=fractal&f=Mandelbrot&x=...&y=...&s=...  Numbers use String(),
// the shortest decimal that round-trips to the exact same double -- the
// HUD's rounded display would move deep-zoom views. Julia c is encoded
// explicitly: enterDual only seeds it from the main center; tapping the
// main pane moves it independently afterward.
function depthStateFor(m) {
  return isCurveMode(m) ? dragonState : { koch: kochState, tree: treeState }[m];
}

function buildShareHash() {
  const p = new URLSearchParams();
  p.set("v", "1");
  p.set("m", mode);
  const put = (k, v) => p.set(k, String(v));
  if (mode === "fractal") {
    const s = mainState;
    p.set("f", currentName);
    put("x", s.cx); put("y", s.cy); put("s", s.scale); put("r", s.rotation || 0);
    put("i", s.maxIter); if (s.iterAutoLocked) p.set("il", "1");
    put("cm", COLORMAPS[colormapIndex].name);
    // The color style, only when it isn't the default coloring, so links made
    // without one are unchanged.
    if (colorStyle.style !== "smooth") put("st", STYLE_LINK_CODES.get(colorStyle.style));
    if (colorStyle.density !== 1) put("cd", Number(colorStyle.density.toFixed(3)));
    if (colorStyle.offset !== 0) put("co", Number(colorStyle.offset.toFixed(3)));
    if (dualActive && juliaState) {
      const j = juliaState;
      p.set("d", "1");
      put("jcx", mainState.cx); put("jcy", mainState.cy); // = c; see applyShareState
      put("jx", j.cx); put("jy", j.cy); put("js", j.scale); put("jr", j.rotation || 0);
      put("ji", j.maxIter); put("jb", j.baseScale);
    }
  } else {
    const v = VECTOR_VIEWS[mode][0].view;
    put("x", v.cx); put("y", v.cy); put("s", v.halfHeight); put("r", v.rotation || 0);
    if (isIfsMode(mode)) {
      put("n", fernState.count); put("c", fernState.colorIndex);
    } else {
      put("cm", COLORMAPS[colormapIndex].name);
      put("c", vectorColors[mode]);
      put("dp", depthStateFor(mode).depth);
      if (mode === "koch") p.set("fl", kochState.fill ? "1" : "0");
    }
  }
  return "#" + p.toString();
}

function buildShareUrl() {
  return Platform.shareBaseUrl() + buildShareHash();
}

// The color style fields of a link (st, cd, co). Unlike the view fields, a
// bad one never rejects the link: it falls back to today's coloring, so a
// hand-edited or newer link still opens. An unknown style code (a newer
// app's), a density outside 0.25-8 and a shift outside 0-1 all fall back;
// the code is looked up in a Map, never an object, so "constructor" is just
// an unknown code.
function parseStyleFields(p) {
  const code = p.get("st");
  const style = [...STYLE_LINK_CODES].find(([, c]) => c === code);
  const number = (k, lo, hi, fallback) => {
    const raw = p.get(k);
    const v = raw === null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
  };
  return {
    style: style ? style[0] : "smooth",
    density: number("cd", COLOR_BANDS_RANGE[0], COLOR_BANDS_RANGE[1], 1),
    offset: number("co", 0, 1 - 1e-9, 0),
  };
}

// Parses a share hash into a plain state object, or null if it isn't a
// valid v1 link -- any missing/out-of-range field rejects the whole link,
// so a malformed one falls back to the normal default view.
function parseShareHash(hash) {
  try {
    if (!hash || hash.length < 2) return null;
    const p = new URLSearchParams(hash.slice(1));
    if (p.get("v") !== "1") return null;
    const num = (k, test = () => true) => {
      const raw = p.get(k);
      const v = raw === null || raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(v) || !test(v)) throw new Error(`bad share field ${k}`);
      return v;
    };
    const int = (k, lo, hi) => num(k, (v) => Number.isInteger(v) && v >= lo && v <= hi);
    const pos = (v) => v > 0;
    // The colormap is named, not numbered, so reordering or retiring
    // colormaps doesn't change what existing links show. An unknown name
    // (a retired colormap, or an old numeric link) opens in the default
    // colormap instead of rejecting the whole link.
    const cmIndex = () => Math.max(0, COLORMAPS.findIndex((c) => c.name === p.get("cm")));
    const m = p.get("m");
    // m is attacker-controlled: only "fractal" or a real mode key, never an
    // inherited property name like "constructor" (which the lookups below
    // would otherwise resolve against Object.prototype).
    if (m !== "fractal" && !EXTRA_MODES.some((e) => e.key === m)) return null;
    // Positions/scales beyond +-1e300 only produce NaN views; rotation is
    // wrapped so the HUD and compass see a bounded angle.
    const big = (v) => Math.abs(v) <= 1e300;
    const view = { cx: num("x", big), cy: num("y", big), scale: num("s", (v) => pos(v) && big(v)), rotation: normalizeAngle(num("r", big)) };
    if (m === "fractal") {
      const name = p.get("f");
      if (!Object.prototype.hasOwnProperty.call(FRACTAL_CONFIGS, name)) return null;
      const st = { mode: m, name, ...view, maxIter: int("i", 50, 2000), iterAutoLocked: p.get("il") === "1",
        cm: cmIndex(), dual: false, color: parseStyleFields(p) };
      if (p.get("d") === "1" && FRACTAL_CONFIGS[name].dual) {
        st.dual = true;
        st.julia = { juliaC: [num("jcx", big), num("jcy", big)], cx: num("jx", big), cy: num("jy", big),
          scale: num("js", (v) => pos(v) && big(v)), rotation: normalizeAngle(num("jr", big)),
          maxIter: int("ji", 50, 2000), baseScale: num("jb", (v) => pos(v) && big(v)) };
      }
      return st;
    }
    if (isIfsMode(m)) return { mode: m, ...view, count: int("n", 100000, 4000000), colorIndex: int("c", 0, SOLID_COLORS.length - 1) };
    const maxDepth = isCurveMode(m) ? LINE_CURVES[m].maxDepth : { koch: 8, tree: 12 }[m];
    if (maxDepth === undefined || !Object.prototype.hasOwnProperty.call(vectorColors, m)) return null;
    const minDepth = isCurveMode(m) ? LINE_CURVES[m].minDepth || 0 : 0;
    // "c" (solid color) is optional: links made before 1.10.0 don't have it.
    const colorIndex = p.has("c") ? int("c", 0, SOLID_COLORS.length - 1) : vectorColors[m];
    return { mode: m, ...view, cm: cmIndex(), colorIndex, depth: int("dp", minDepth, maxDepth), fill: p.get("fl") !== "0" };
  } catch {
    return null;
  }
}

function applyShareState(st) {
  if (st.mode === "fractal") {
    colormapIndex = st.cm;
    // The style travels with the colormap (both global); a link without one
    // means the default coloring.
    setColorStyle({ style: st.color.style, density: st.color.density, offset: st.color.offset });
    if (dualActive) exitDual();
    selectFractal(st.name, { fresh: true });
    Object.assign(mainState, { cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation,
      maxIter: st.maxIter, iterAutoLocked: st.iterAutoLocked });
    if (st.dual) {
      enterDual();
      // jcx/jcy are ignored: c is the main pane's center (synced in
      // renderAll). Links still carry them so older builds, whose parser
      // requires them, can open links from this one.
      Object.assign(juliaState, st.julia, { juliaC: [mainState.cx, mainState.cy], iterAutoLocked: st.iterAutoLocked });
    }
    els.dualBtn.classList.toggle("active", dualActive);
    els.iterSlider.value = mainState.maxIter;
  } else {
    if (isIfsMode(st.mode)) {
      if (fernView.system !== st.mode) {
        fernView.setSystem(st.mode); // before the view is written below
        fernNav.clearHistory(); // Back history belongs to the previous system
      }
      fernState.count = st.count;
      els.fernPointsSlider.value = st.count;
      setFernColor(st.colorIndex);
    } else {
      colormapIndex = st.cm;
      vectorColors[st.mode] = st.colorIndex;
      if (isCurveMode(st.mode) && dragonView.curve !== st.mode) {
        dragonView.setCurve(st.mode); // before depth/view are written
        dragonNav.clearHistory(); // Back history belongs to the previous curve
      }
      updateColorSwatches();
      depthStateFor(st.mode).depth = st.depth;
      els[`${isCurveMode(st.mode) ? "dragon" : st.mode}DepthSlider`].value = st.depth;
      if (st.mode === "koch") {
        kochState.fill = st.fill;
        els.kochFillBtn.classList.toggle("active", st.fill);
      }
    }
    // Mark as fitted first: setMode's first-visit fit would otherwise
    // replace the linked view with the default one.
    fittedVectorModes.add(st.mode);
    Object.assign(VECTOR_VIEWS[st.mode][0].view, { cx: st.cx, cy: st.cy, halfHeight: st.scale, rotation: st.rotation });
    setMode(st.mode);
  }
  updateLUT();
  requestRender();
}

// Applies a share link from the URL, then strips the hash so a reload
// returns to the app's normal start rather than re-pinning the link.
function applyShareHashFromUrl() {
  const st = parseShareHash(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (st) applyShareState(st);
}

// A share link that opened the iOS app (universal link, see platform.js):
// same parse/apply as a link loaded on the web. Anything that isn't a valid
// share hash is ignored, leaving the current view alone.
function applyShareLink(url) {
  Diag.fromLink(url);
  const i = url.indexOf("#");
  const st = i >= 0 ? parseShareHash(url.slice(i)) : null;
  if (st) {
    cancelTeleport();
    applyShareState(st);
  }
}

// ---------------------------------------------------------------- share: image + menu

function shareFileName() {
  const label = mode === "fractal" ? fractalLabel(currentName) : modeLabel(mode);
  const slug = slugify(label);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `fractal-web-${slug}-${date}.png`;
}

function waitUntil(cond, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => (cond() || performance.now() - t0 > timeoutMs ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

// Dual mode: both panes onto one canvas in the layout actually on screen
// (layoutCanvasArea's "stacked" = main above Julia, otherwise side by side),
// with #canvasArea's 2px black gap between them.
function compositeDualCanvas() {
  const a = els.mainCanvas, b = els.juliaCanvas;
  const stacked = els.canvasArea.classList.contains("stacked");
  const gap = Math.round(2 * mainRenderer.dpr);
  const out = document.createElement("canvas");
  out.width = stacked ? Math.max(a.width, b.width) : a.width + gap + b.width;
  out.height = stacked ? a.height + gap + b.height : Math.max(a.height, b.height);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(a, 0, 0);
  ctx.drawImage(b, stacked ? 0 : a.width + gap, stacked ? a.height + gap : 0);
  return out;
}

// A copy of src with the "Fractal Atlas™" wordmark in a dark translucent
// pill, bottom-right. Drawn on the export only, never the live canvas. The
// pill (not bare or shadowed text) keeps it legible on any colormap,
// including flat light or flat dark regions. Sized off the image's short
// side so it looks the same on a phone and an iPad export.
function watermarkedCopy(src) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);

  const text = "Fractal Atlas™";
  const fontPx = Math.max(12, Math.round(Math.min(out.width, out.height) * 0.03));
  ctx.font = `600 ${fontPx}px -apple-system, system-ui, "Helvetica Neue", sans-serif`;
  const h = Math.round(fontPx * 1.9);
  const w = Math.round(ctx.measureText(text).width + fontPx * 1.5);
  const margin = Math.round(fontPx * 0.9);
  const x = out.width - margin - w, y = out.height - margin - h, r = h / 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fill();
  // Hairline edge so the pill still reads against a flat black export.
  ctx.lineWidth = Math.max(1, fontPx / 16);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + fontPx * 0.04);
  return out;
}

// PNG of the current view, taken only once progressive refinement has
// finished (fractal supersampling, fern point fill) -- or after 3s, so a
// slow device or an ongoing gesture can't hang it. Koch/tree/dragon draw
// synchronously and are captured immediately. Every export path (Save
// image, Save to Photos, Share…) goes through here, so all get the
// watermark.
async function captureShareBlob() {
  if (mode === "fractal") {
    finishRefinement();
    await waitUntil(() => refineDone && !isInteracting, 3000);
  }
  else if (isIfsMode(mode)) await waitUntil(() => !fernView.refining, 3000);
  const canvas = watermarkedCopy(mode !== "fractal" ? VECTOR_VIEWS[mode][1] : dualActive ? compositeDualCanvas() : els.mainCanvas);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
}

els.shareNativeBtn.classList.toggle("hidden", !Platform.canShare);

// Capture starts when the menu opens, not when an option is tapped: iOS
// Safari only allows navigator.share() close to the user's tap, so the PNG
// should already be ready by then.
let pendingCapture = null;
function closeShareMenu() { els.shareMenu.classList.remove("open"); }
document.querySelectorAll(".shareBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.colormapMenu.classList.remove("open");
    els.colorSheet.classList.remove("open");
    const opening = !els.shareMenu.classList.contains("open");
    els.shareMenu.classList.toggle("open", opening);
    if (opening) {
      pendingCapture = captureShareBlob();
      pendingCapture.catch(() => {}); // surfaced when an option actually uses it
    }
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.shareMenu.classList.contains("open")) return;
  if (els.shareMenu.contains(e.target) || e.target.closest(".shareBtn")) return;
  closeShareMenu();
});

// ---------------------------------------------------------------- toolbar accessibility

// Toggle buttons and popovers change state by toggling "active"/"open" at
// many call sites, so one observer per element mirrors that state into
// ARIA instead: aria-pressed on the toggles, aria-expanded on each popover's
// opener buttons. A popover that opens gets focus on its current (or
// first) item; one that closes with focus inside hands it back to the
// button that opened it. Escape closes whichever popover is open.
const TOGGLE_BUTTONS = [els.dualBtn, els.boxZoomBtn, els.fernBoxZoomBtn, els.kochFillBtn, ...document.querySelectorAll(".hudToggleBtn")];
for (const btn of TOGGLE_BUTTONS) {
  const sync = () => btn.setAttribute("aria-pressed", String(btn.classList.contains("active")));
  sync();
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ["class"] });
}

const POPOVERS = [
  { menu: els.fractalTypeRow, openers: [...document.querySelectorAll(".fractalMenuBtn")] },
  { menu: els.colormapMenu, openers: [els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.dragonColormapBtn, els.fernColorBtn] },
  { menu: els.colorSheet, openers: [els.colormapBtn] },
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

function flashLabel(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; closeShareMenu(); }, 1500);
}

els.shareSaveBtn.textContent = Platform.saveImageLabel;
els.shareSaveBtn.addEventListener("click", async () => {
  try {
    const saved = await Platform.saveImage(await pendingCapture, shareFileName());
    if (saved) flashLabel(els.shareSaveBtn, "Saved!");
    else closeShareMenu();
  } catch (err) {
    closeShareMenu();
    reportError(`Save image failed: ${err && err.message ? err.message : err}`);
  }
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard needs a secure context (not the LAN dev server).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

Diag.setCopy(copyText);
if (Platform.canShare) Diag.setShare((text) => Platform.share({ title: "Fractal Atlas diagnostics", text }));

els.shareCopyBtn.addEventListener("click", async () => {
  const ok = await copyText(buildShareUrl());
  flashLabel(els.shareCopyBtn, ok ? "Copied!" : "Copy failed");
});

els.shareNativeBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  closeShareMenu();
  try {
    await Platform.share({ blob: await pendingCapture, fileName: shareFileName(), url, title: "Fractal Atlas" });
  } catch (err) {
    reportError(`Share failed: ${err && err.message ? err.message : err}`);
  }
});

// Pasting a different link into an open tab only changes the hash.
window.addEventListener("hashchange", applyShareHashFromUrl);

// ---------------------------------------------------------------- init

// Everything that can schedule a frame or a callback at load lives here, in
// the last script, so nothing can run before all the scripts above have
// loaded (these were top-level lines in the sections above; same order).
applyHudVisibility();
(window.requestIdleCallback || ((f) => setTimeout(f, 1000)))(prepareColorSheet, { timeout: 3000 });
if (typeof ResizeObserver !== "undefined") new ResizeObserver(fitColorSegment).observe(els.colorSheet);
window.addEventListener("resize", () => { layoutCanvasArea(); requestRender(); });
// The toolbar is in flow under the canvas, so the canvas area also changes
// size without a window resize (e.g. a mode's control row wrapping
// differently); re-lay out and re-render then too.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => { layoutCanvasArea(); requestRender(); }).observe(els.canvasArea);
}

updateLUT(); // first: Carpet/Gasket renders read the LUT on the CPU
selectFractal(currentName, { fresh: true });
updateColorSwatches();
requestRender();
// Read before applyShareHashFromUrl strips the hash: a visitor who arrived
// by share link gets that view, not the cold open.
const arrivedByLink = !!parseShareHash(location.hash);
applyShareHashFromUrl();
Platform.onOpenUrl(applyShareLink); // before hideLaunchScreen, which waits on it
if (!arrivedByLink && Platform.welcome.isFirstVisit()) coldOpen();
Platform.welcome.markVisited();
initWelcomeCard();
// requestRender draws on the next animation frame; one frame after that it
// has been painted, so the app's launch screen can fade into it (no-op on
// the web, see platform.js).
requestAnimationFrame(() => requestAnimationFrame(() => Platform.hideLaunchScreen()));

// One-shot layout diagnostic: if the canvas collapsed to near-zero size
// (a CSS/flexbox bug) nothing will be visible even though no JS error
// was thrown, so surface that case explicitly too. Checks the canvas the
// current mode shows: a share link that opens a vector mode hides
// mainCanvas (display: none, so 0x0), which is correct, not a collapse.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = mode === "fractal" ? els.mainCanvas : VECTOR_VIEWS[mode][1];
  if (c.clientWidth < 4 || c.clientHeight < 4) {
    reportError(`Diagnostic: ${c.id} has collapsed to ${c.clientWidth}x${c.clientHeight} CSS px (canvasArea: ${els.canvasArea.clientWidth}x${els.canvasArea.clientHeight}). This is a layout bug, not a rendering bug.`);
  }
}));
