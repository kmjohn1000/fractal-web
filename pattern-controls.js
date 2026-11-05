// The controls of the pattern modes (Koch, tree, hexaflake, the line curves and the dot shapes): the
// depth sliders, Koch's fill button, depth play with its speed bubble and slide gesture, the chaos-game
// replay (Play beside the speed button, startDotRun, a link's shared run) and each row's Reset.
// Split from teleport.js, which keeps the flights and the cold open. Needs the state, render-layout,
// vector-interaction.js (the nav objects, fitVectorView), compass-ui.js (prefersReducedMotion, syncSliderFill),
// fern.js, chaos-run.js and teleport.js (cancelTeleport, inside startDotRun only).
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { KOCH_GROW_MS, KOCH_GROW_STEP_SHARE } from "./koch.js?v=1.68.1";
import { isCurveMode } from "./fractal-defs.js?v=1.68.1";
import { dragonState, els, fernState, fernView, hexaflakeState, kochState, kochView, mode, treeState } from "./state.js?v=1.68.1";
import { fernRenderOpts, requestRender } from "./render-layout.js?v=1.68.1";
import { dragonNav, fernNav, fitVectorView, hexaflakeNav, kochNav, treeNav, vectorViewIsFitted } from "./vector-interaction.js?v=1.68.1";
import { prefersReducedMotion, syncSliderFill } from "./compass-ui.js?v=1.68.1";
import { REPLAY_LONG, replayStopPoints, seededRandom } from "./fern.js?v=1.68.1";
import { announceRunDone, newRunSeed, rememberRun, updateRunChip } from "./chaos-run.js?v=1.68.1";
import { cancelTeleport } from "./teleport.js?v=1.68.1";

els.kochDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.kochDepthSlider);
  const before = kochState.depth;
  kochState.depth = parseInt(els.kochDepthSlider.value, 10);
  // One level deeper: the new generation grows in. Any other change, and
  // reduced motion, just redraws. During depth play the growth takes at most
  // KOCH_GROW_STEP_SHARE of the step (which shortens as the speed goes up).
  kochView.cancelGrow();
  if (kochState.depth === before + 1 && !prefersReducedMotion()) {
    const stepMs = depthPlayer.slider === els.kochDepthSlider ? DEPTH_STEP_MS / PLAY_SPEEDS[depthPlayer.speedIndex] : Infinity;
    kochView.startGrow(kochState.depth, Math.min(KOCH_GROW_MS, stepMs * KOCH_GROW_STEP_SHARE));
  }
  requestRender();
});

els.kochFillBtn.addEventListener("click", () => {
  kochState.fill = !kochState.fill;
  els.kochFillBtn.classList.toggle("active", kochState.fill);
  requestRender();
});


// Depth play/pause (Koch, tree, hexaflake, line curves): steps the row's depth slider
// up to its max and back down, over and over, by setting its value and
// firing "input" -- the same path as a drag, so each mode's own listener
// does the redraw. The speed button beside it is pressed and slid: left
// slower, right faster, one step per SPEED_DRAG_PX. Speed is shared by all
// rows. Switching modes or touching the slider stops playback.
export const DEPTH_STEP_MS = 700; // at 1x, as Koch's old animate button
export const PLAY_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
export const SPEED_DRAG_PX = 28;
export const depthPlayer = { slider: null, dir: 1, timer: 0, speedIndex: PLAY_SPEEDS.indexOf(1) };

export function depthSliderForMode() {
  if (mode === "koch") return els.kochDepthSlider;
  if (mode === "tree") return els.treeDepthSlider;
  if (mode === "hexaflake") return els.hexaflakeDepthSlider;
  if (isCurveMode(mode)) return els.dragonDepthSlider;
  return null;
}

export function speedText(speed) {
  return ({ 0.25: "¼", 0.5: "½", 0.75: "¾" }[speed] || String(speed)) + "×";
}

export function syncPlayButtons() {
  const playing = depthPlayer.slider !== null;
  for (const btn of document.querySelectorAll(".depthPlayBtn")) {
    btn.classList.toggle("playing", playing);
    btn.setAttribute("aria-label", playing ? "Pause depth" : "Play depth");
    btn.title = playing ? "Pause depth" : "Play depth";
  }
  const text = speedText(PLAY_SPEEDS[depthPlayer.speedIndex]);
  for (const btn of document.querySelectorAll(".depthSpeedBtn, .replaySpeedBtn")) {
    btn.textContent = text;
    btn.setAttribute("aria-label", `Play speed ${text}`);
  }
}

export function stopDepthPlay() {
  if (!depthPlayer.slider) return;
  clearTimeout(depthPlayer.timer);
  depthPlayer.slider = null;
  syncPlayButtons();
}

export function depthPlayStep() {
  const s = depthPlayer.slider;
  const min = parseInt(s.min, 10), max = parseInt(s.max, 10);
  const v = parseInt(s.value, 10);
  if (max <= min) { stopDepthPlay(); return; }
  if (v + depthPlayer.dir > max || v + depthPlayer.dir < min) depthPlayer.dir = -depthPlayer.dir;
  s.value = v + depthPlayer.dir;
  s.dispatchEvent(new Event("input"));
  depthPlayer.timer = setTimeout(depthPlayStep, DEPTH_STEP_MS / PLAY_SPEEDS[depthPlayer.speedIndex]);
}

export function startDepthPlay() {
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
for (const s of [els.kochDepthSlider, els.treeDepthSlider, els.hexaflakeDepthSlider, els.dragonDepthSlider]) {
  s.addEventListener("pointerdown", stopDepthPlay);
}

// The readout above a held speed button: the speed, and which way is which.
export let speedBubbleTimer = 0;
export function showSpeedBubble(btn, hint) {
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
export function hideSpeedBubble(delayMs) {
  clearTimeout(speedBubbleTimer);
  speedBubbleTimer = setTimeout(() => document.getElementById("speedBubble").classList.add("hidden"), delayMs);
}
export function setSpeedIndex(i) {
  depthPlayer.speedIndex = Math.min(PLAY_SPEEDS.length - 1, Math.max(0, i));
  syncPlayButtons();
}

for (const btn of document.querySelectorAll(".depthSpeedBtn, .replaySpeedBtn")) {
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

// Replay of the chaos game (the dot shapes, fern.js): the Play button beside the speed button
// runs it, and the speed above is its speed (1x is a Long run of about 15 s, from the first jump to
// the shape's stop point; the normal render carries on to the points slider's count). Tapping again
// pauses it, with the picture as far as it got, and
// tapping once more carries on; after the end Play starts over. The view is framed first, as
// Reset does (Back undoes that), since the points the game lands on would mostly miss a zoomed
// view. Any gesture, another shape, a color or count change, Reset and Save end it: the dot
// shapes' render takes over, see fernView.render.
export function syncReplayButtons() {
  const running = fernView.replayRunning;
  for (const btn of document.querySelectorAll(".replayPlayBtn")) {
    btn.classList.toggle("playing", running);
    btn.setAttribute("aria-label", running ? "Pause replay" : "Play replay");
    btn.title = running ? "Pause replay" : "Play replay: watch the chaos game build the picture";
  }
  updateRunChip(); // the counter over the canvas shows while a run is on, paused or not
}

export function stopDotReplay() {
  if (fernView.cancelReplay()) requestRender();
}

// A touch, wheel tick, pan, zoom or twist on a vector view: ends a default replay (the Shorts', the
// tests'), but not the app's own run, which follows the view (startDotRun) and draws itself again in it.
export function touchDotReplay() {
  if (!fernView.replayFollows) stopDotReplay();
}

export function toggleDotReplay() {
  if (fernView.replayRunning) { fernView.pauseReplay(); return; }
  if (fernView.replaying) { fernView.resumeReplay(); return; }
  startDotRun(newRunSeed());
}

// A new run of the chaos game from the origin: the Long run (REPLAY_LONG, about 15 s at 1x), which stops
// where this shape's picture has its structure (fern.js IFS_STOP_POINTS; the normal render carries on to
// the points slider's count) and uses the random numbers of its seed, so a link with the seed plays the
// same jumps. The default run (startReplay without options) is left to tests and the Shorts.
export function startDotRun(seed) {
  cancelTeleport();
  if (!vectorViewIsFitted(mode)) {
    fernNav.checkpoint();
    fitVectorView(mode);
  }
  const opts = fernRenderOpts();
  rememberRun(seed); // after the framing: the seed goes with this view
  fernView.startReplay({
    ...opts, ...REPLAY_LONG,
    stop: replayStopPoints(fernView.system, opts.count),
    rng: seededRandom(seed), seed, follow: true,
    speed: () => PLAY_SPEEDS[depthPlayer.speedIndex],
    onChange: syncReplayButtons,
    onDone: announceRunDone,
  });
  requestRender(); // Back, the info card, the compass; the render leaves the replay's picture alone
}

// A share link with a seed: after the first paint, play that run (never under reduced motion, where
// the replay has no buttons). Skipped if the person has already left for another shape or started a run.
export function scheduleSharedRun(seed, system) {
  if (!seed || prefersReducedMotion()) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (mode === system && fernView.system === system && !fernView.replaying) startDotRun(seed);
  }));
}

for (const btn of document.querySelectorAll(".replayPlayBtn")) btn.addEventListener("click", toggleDotReplay);
els.fernResetBtn.addEventListener("click", stopDotReplay);
syncReplayButtons();

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

els.hexaflakeDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.hexaflakeDepthSlider);
  hexaflakeState.depth = parseInt(els.hexaflakeDepthSlider.value, 10);
  requestRender();
});

els.hexaflakeResetBtn.addEventListener("click", () => {
  hexaflakeNav.clearHistory();
  fitVectorView("hexaflake");
  requestRender();
});

els.dragonDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.dragonDepthSlider);
  // A curve's extent changes with its depth (the dragon turns 45 degrees per
  // level), so a view still at its framing is refitted to the new depth, which
  // also keeps depth play centered; one you have moved stays where it is.
  const followDepth = vectorViewIsFitted(mode);
  dragonState.depth = parseInt(els.dragonDepthSlider.value, 10);
  if (followDepth) fitVectorView(mode);
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
  fernView.cancelReplay(); // the slider is the points of the normal render (and the replay's length): back to it
  requestRender();
});
