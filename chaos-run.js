// The chaos-game run of the dot shapes as the person sees it: the run's seed (which is in the share
// link and on the info card), the points-and-coverage counter (the chip over the canvas and the same
// numbers on the info card) and the few lines a screen reader hears. The engine itself is fern.js
// (startReplay, fernView.runStats); teleport.js starts the runs and render-layout.js calls in here.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it).
import { fernView, mode } from "./state.js?v=1.63.0";
import { formatPointCount } from "./hud-format.js?v=1.63.0";
import { cornerDeal } from "./corner-rules.js?v=1.63.0";

// ---------------------------------------------------------------- the seed

// A run's seed is a number from 1 to RUN_SEED_MAX: six digits at most, easy to read out and to type.
export const RUN_SEED_MAX = 999999;
export function newRunSeed() { return 1 + Math.floor(Math.random() * RUN_SEED_MAX); }

// A seed as a share link or anything else gives it, or 0 if it isn't one (a link with a bad seed still opens).
export function parseRunSeed(raw) {
  if (raw === null || raw === undefined || !/^\d{1,6}$/.test(String(raw))) return 0;
  const v = Number(raw);
  return v >= 1 && v <= RUN_SEED_MAX ? v : 0;
}

// The run last played: its seed, the shape and the view it was played on. The seed belongs to the
// picture only while all of that is as it was (a pan or zoom, another shape: it is not that run's
// picture any more), so the share link and the info card ask currentRunSeed.
export const chaosRun = { seed: 0, system: "", rule: 0, view: null, announced: 0, lastPoints: 0 };
// Corner Rules: the run belongs to the rule it was played under too (0 for the shapes without rules)
export const runRule = () => (fernView.system === "corners" ? cornerDeal.id : 0);
export function rememberRun(seed) {
  const v = fernView.view;
  Object.assign(chaosRun, { seed, system: fernView.system, rule: runRule(), view: { cx: v.cx, cy: v.cy, halfHeight: v.halfHeight, rotation: v.rotation || 0 }, announced: 0, lastPoints: 0 });
}
export function currentRunSeed() {
  const v = fernView.view, w = chaosRun.view;
  if (!chaosRun.seed || !w || mode !== chaosRun.system || fernView.system !== chaosRun.system || runRule() !== chaosRun.rule) return 0;
  return v.cx === w.cx && v.cy === w.cy && v.halfHeight === w.halfHeight && (v.rotation || 0) === w.rotation ? chaosRun.seed : 0;
}

// ---------------------------------------------------------------- the counter

// "1,204 points · 38% filled": the points counted so far and the share of the shape's grid cells lit.
// (Rounded down, so 100% means every cell.)
export function runChipText(stats) {
  const points = formatPointCount(stats.points);
  return `${points} ${stats.points === 1 ? "point" : "points"} · ${Math.floor(stats.coverage * 100 + 1e-9)}% filled`;
}

// For the info card's plain-language lines: while a run is on, its counter replaces the card's usual
// "N of M points" (normalLine), and the card names the run's seed.
export function runHudParts(normalLine) {
  const stats = fernView.runStats, seed = (stats && stats.seed) || currentRunSeed();
  return [stats ? runChipText(stats) : normalLine, seed ? `Run ${seed}` : ""];
}

// Shows the chip while a run is on (playing or paused), hides it otherwise. Called by updateFernHud
// each time the replay draws a frame, and by syncReplayButtons when the run starts, pauses or ends.
export function updateRunChip() {
  const chip = document.getElementById("runChip");
  if (!chip) return;
  const stats = fernView.runStats;
  chip.classList.toggle("hidden", !stats);
  if (!stats) return;
  const text = runChipText(stats);
  if (chip.textContent !== text) chip.textContent = text;
  announceMilestones(stats);
}

// ---------------------------------------------------------------- what a screen reader hears

// One polite live region, and only the milestones: each time the points reach a power of ten
// ("100 points", "1,000 points", "10 thousand points", ...) and when the run is done.
export function announce(text) {
  const region = document.getElementById("runAnnounce");
  if (region) region.textContent = text;
}
export function announceMilestones(stats) {
  if (stats.points < chaosRun.lastPoints) chaosRun.announced = 0; // a new run began
  chaosRun.lastPoints = stats.points;
  const decade = stats.points >= 10 ? Math.floor(Math.log10(stats.points)) : 0;
  if (decade > chaosRun.announced) {
    chaosRun.announced = decade;
    announce(`${formatPointCount(10 ** decade)} points`);
  }
}
// The run ended by itself (its stop point, or the cap): the normal render finishes the picture.
export function announceRunDone(stats) {
  announce(`Done. ${formatPointCount(stats.points)} points, ${Math.floor(stats.coverage * 100 + 1e-9)}% filled.`);
}
