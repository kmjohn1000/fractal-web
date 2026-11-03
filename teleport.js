// Teleport ("Surprise me"): flights to places and the cold open. (Depth play, the chaos-game replay
// and the sliders and Resets of the pattern modes are in pattern-controls.js.)
// Needs the state, render-layout, modes, places.js and compass-ui.js (prefersReducedMotion,
// showHud); the scripts before and after it call cancelTeleport etc.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { FRACTAL_CONFIGS } from "./configs.js?v=1.62.0";
import { viewFromBounds } from "./fractal-defs.js?v=1.62.0";
import { TELEPORT_DESTINATIONS } from "./places.js?v=1.62.0";
import { applyAutoIter, currentName, dualActive, els, mainCanvasAspect, mainState, mode, pushHistory, setActivePane } from "./state.js?v=1.62.0";
import { applyDefaultColormap, markInteracting } from "./state-colors.js?v=1.62.0";
import { renderAll } from "./render-layout.js?v=1.62.0";
import { normalizeAngle } from "./view-math.js?v=1.62.0";
import { selectFractal } from "./modes.js?v=1.62.0";
import { prefersReducedMotion, showHud } from "./compass-ui.js?v=1.62.0";

// ---------------------------------------------------------------- teleport ("Surprise me")

// d3's interpolateZoom (van Wijk & Nuij, "Smooth and efficient zooming and
// panning"): a far jump zooms out, pans, and zooms back in, instead of
// zooming straight at a point that stays off-screen the whole way. Views
// are [cx, cy, w] with w the visible height; returns f(t) for t in [0, 1].
// The near-case cutoff is relative to w, not d3's absolute 1e-12 --
// deep-zoom jumps are routinely that small in absolute terms. f.distance
// is the path's length in d3's units (roughly zoom levels travelled),
// used to size the flight's duration.
export function zoomPath(p0, p1) {
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
export function teleportDurationMs(distance) {
  return Math.min(2500, Math.max(1000, 1000 + (distance - 4) * 50));
}
// Spiral dives (a destination's spiral flag) are slower, at a steady speed,
// turning 90 degrees per 3x of zoom: five full turns on the way down from
// the opening view.
export const SPIRAL_DIVE_MS = 7000;
export const SPIRAL_RAD_PER_ZOOM = (Math.PI / 2) / Math.log(3); // per e-fold
// Speed ramps up over the first 12% of the flight, cruises, and slows over
// the last 18% (fractions of time); returns the distance covered, 0..1.
export function steadyEase(t, a = 0.12, b = 0.18) {
  const vmax = 1 / (1 - a / 2 - b / 2);
  if (t < a) return vmax * t * t / (2 * a);
  if (t <= 1 - b) return vmax * (a / 2 + (t - a));
  const u = 1 - t;
  return 1 - vmax * u * u / (2 * b);
}
export let lastTeleportIndex = -1; // index into TELEPORT_DESTINATIONS; never picked twice in a row
export let teleportLandingIndex = -1; // TELEPORT_DESTINATIONS index of the last completed flight, for the info overlay
export let teleportGeneration = 0;
// For the screenshot and preview scripts, which land the view on a place without flying there
// (another file can't assign these variables).
export function setLastTeleportIndex(v) { lastTeleportIndex = v; }
export function setTeleportLandingIndex(v) { teleportLandingIndex = v; }

// Any direct manipulation (pointer, wheel, Back, fractal switch) wins over
// an in-flight flight: bumping the generation makes its next frame a no-op.
export function cancelTeleport() { teleportGeneration++; }

export function teleport() {
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
export function flyTo(st, d, target, landingIndex, spinSign) {
  // A destination with a rotation lands turned to it (0 for the Burning
  // Ship's places, so they land upright whatever the view was turned to);
  // one without leaves the view's rotation alone, as before. The turn takes
  // the shorter way round.
  const r0 = st.rotation || 0;
  let turn = d.rotation === undefined ? 0 : normalizeAngle(d.rotation - r0);
  if (d.rotation !== undefined) target.rotation = d.rotation;
  pushHistory("main");
  // Places are drawn the way the fractal opens: a Burning Ship view that
  // came from a link made before 1.44.0 (flipY off, masts down) takes the
  // upright picture here, the mirror changing at takeoff (Back restores it).
  st.flipY = !!FRACTAL_CONFIGS[currentName].flipY;
  // A place can name its own palette (colormap); heading home, or a place
  // without one, goes to the fractal's default. A palette the user picked
  // stays (applyDefaultColormap).
  applyDefaultColormap(landingIndex >= 0 ? d : null);
  setActivePane("main");
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
export function flyToPlace(i) {
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
export const COLD_OPEN_PLACES = ["Seahorse Valley", "Mini Mandelbrot", "Elephant Valley", "Double Spiral", "Sunburst Fan"];
export function coldOpen() {
  const gen = teleportGeneration;
  requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
    if (gen !== teleportGeneration || mode !== "fractal" || currentName !== "Mandelbrot") return;
    const places = COLD_OPEN_PLACES.map((label) => {
      const i = TELEPORT_DESTINATIONS.findIndex((d) => d.fractal === "Mandelbrot" && d.label === label);
      if (i < 0) throw new Error(`Cold open place "${label}" is not in TELEPORT_DESTINATIONS`);
      return i;
    });
    showHud();
    flyToPlace(places[Math.floor(Math.random() * places.length)]);
  }, 600)));
}

// Dual view's tap: glide the main view so (x, y) lands at the center, which
// moves the Julia pane's c there (renderAll syncs c to the center). Shares
// teleport's generation counter, so a new gesture/Back/teleport cancels it,
// and its per-frame path (markInteracting + renderAll).
export const GLIDE_MS = 300;
export function glideMainTo(x, y) {
  const st = mainState;
  cancelTeleport();
  pushHistory("main");
  setActivePane("main");
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


