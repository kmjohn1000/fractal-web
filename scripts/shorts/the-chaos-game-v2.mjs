// Recipe: "The Chaos Game", second cut (v2). The first cut (the-chaos-game.mjs, still reproducible
// with `--recipe the-chaos-game`) explained only the triangle and the fern; the Levy C and the
// Vicsek cross just ran. This cut explains all four, and reuses the first one's scenes, grid,
// audio and helpers (imported from it); what changes:
//
//   Levy C   a caption for its two moves ("shrink, then turn 45 degrees left or right"; the maps are
//            a 1/sqrt2 scaling with a +45 degree turn about (0,0) and a -45 degree turn about (1,0);
//            both are rotation-invariant descriptions, so they stay true in the picture turned -90
//            degrees), a two-dot legend ("left", "right") in the two moves' colors, and a slow phase
//            of about 5.4 s instead of 3.2 s
//   Vicsek   a caption ("Jump two thirds of the way to the center or the middle of a side"), five
//            faint rings at those five points (each map is p' = p/3 + (2/3)T, T its fixed point:
//            (0.5,0.5), (0.5,0), (0.5,1), (0,0.5), (1,0.5)), drawn by the compositor in the app's
//            own style for the Sierpinski corners (fern.js replayOverlay: radius 7 css px, 1.4 css px
//            line, alpha 0.32 at rest, lit by the chosen rule while the dot flies), and a slow phase
//            of about 5.4 s instead of 2.8 s
//   timing   the two scenes' speed knots are slower for the first jumps; the replay's 24 slow jumps
//            and the build to a million points are the app's own and unchanged. The Short is about
//            4.5 s longer.
//
// Scene meta (view, rgb, fixed, event positions) is what the compositor needs to place the rings: see
// scripts/make-short.mjs. Run `meta --recipe the-chaos-game-v2` (fast) before `plan`/`compose`.
import base, { SCENES, SEQ, TILES, GRADE, START, DISSOLVE, HOOK_FADE, PUSH, clamp01, smooth, f3, plan, audioFor } from "./the-chaos-game.mjs";

const FPS = 30;

const levySpeed = [[0, 0.62], [4.6, 0.7], [5.6, 1.15], [6.6, 1.4], [20, 1.4]];
const vicsekSpeed = [[0, 0.62], [4.6, 0.7], [5.6, 1.2], [6.6, 1.6], [20, 1.6]];
// (the Levy is framed a little smaller and lower than in the first cut, so its finished top edge clears the caption and the legend)
const levyFrame = { zoom: 1.28, rotation: -Math.PI / 2, dx: 0.07, dy: 0 };
const scenes = { ...SCENES, levy: { ...SCENES.levy, frame: levyFrame, speed: levySpeed }, vicsek: { ...SCENES.vicsek, speed: vicsekSpeed } };

// The captions of the two new beats stay up through the slow jumps and the first part of the build, until
// the picture is about half there (halfway, in the replay's own log-time, between 10,000 and 100,000 points);
// the first two are the first cut's.
const CAPTION_SIZE = 66;
const LEGEND = true; // the two dots and "left", "right" under the Levy caption (judged in stills: it reads cleanly; rings at the Levy's two turning points did not: they sit off to the side and add clutter)
const VICSEK_RING = { r: 7, lit: 3, lw: 1.4, a0: 0.42, aLit: 0.5 };
const captions = (P, meta) => {
  const halfBuilt = (id) => (meta[id].marks[10000] + meta[id].marks[100000]) / 2;
  return [
    { from: P.starts.triangle + 0.9, to: P.starts.triangle + 7.4, text: "Pick a corner at random.\nJump halfway there." },
    { from: P.starts.fern + 0.7, to: P.starts.fern + 7.6, text: "Four rules, picked at random:\n1%  ·  85%  ·  7%  ·  7%" },
    { from: P.starts.levy + 0.6, to: P.starts.levy + halfBuilt("levy"), text: "Two moves, picked at random:\nshrink, then turn 45° left or right.", legend: LEGEND },
    { from: P.starts.vicsek + 0.6, to: P.starts.vicsek + halfBuilt("vicsek"), text: "Jump two thirds of the way to\nthe center or the middle of a side." },
    { from: P.grid + 1.3, to: P.seconds - 0.4, text: "Random jumps.\nSimple rules." },
  ];
};

// The app's world-to-canvas mapping (fern.js replayOverlay), canvas pixels of the scene.
function worldToCanvas(m) {
  const [cw, ch] = m.canvas, v = m.view, rot = -(v.rotation || 0), k = (ch / 2) / v.halfHeight;
  const kc = Math.cos(rot) * k, ks = Math.sin(rot) * k;
  return (x, y) => [cw / 2 + (x - v.cx) * kc - (y - v.cy) * ks, ch / 2 - ((x - v.cx) * ks + (y - v.cy) * kc)];
}

// The jump under way at scene frame f: how many have landed, the rule it uses, and how far its flight is (0 = sitting, 1 = landed).
function jumpAt(m, f) {
  const n = m.nAt[f];
  if (n === undefined || n < 0 || n >= m.events.length) return null;
  const tNext = m.events[n].t, tPrev = n ? m.events[n - 1].t : 0;
  const frac = clamp01((f / m.fps - tPrev) / (tNext - tPrev));
  return { n, ci: m.events[n].ci, ft: clamp01((frac - 0.3) / 0.7) }; // (the app's REPLAY_HOLD is 0.3)
}

// Rings at the fixed points of a scene's maps, as the app draws the Sierpinski's: radius 7 css px
// (3 more while lit), line 1.4 css px, alpha 0.32 (0.92 lit), all faded with the dot, trail and corners
// over the 60 jumps after the slow ones. u = the scene's dpr (2).
const RING = { r: 7, lit: 3, lw: 1.4, a0: 0.32, aLit: 0.6 }; // the app's values (css px, alpha)
function ringLayers(id, m, t, P, W, H, ring = RING) {
  const start = P.starts[id], f = Math.round((t - start) * FPS), j = jumpAt(m, f);
  if (!j) return [];
  const live = 1 - clamp01((j.n - 24) / 60);
  if (live <= 0) return [];
  const reveal = smooth((t - start) / DISSOLVE); // the scene comes up under the one before it
  const u = 2, toXY = worldToCanvas(m), kx = W / m.canvas[0], ky = H / m.canvas[1];
  const out = [];
  m.fixed.forEach((fp, q) => {
    if (!fp) return;
    const lit = q === j.ci && j.ft > 0 ? Math.sin(Math.PI * j.ft) : 0;
    const [px, py] = toXY(fp[0], fp[1]);
    out.push({ circle: true, add: true, x: px * kx, y: py * ky, r: (ring.r + ring.lit * lit) * u * kx, lw: ring.lw * u * kx, stroke: `rgb(${m.rgb[q].join(",")})`, alpha: Math.min(1, ring.a0 + ring.aLit * lit) * live * reveal, filter: GRADE });
  });
  return out;
}

// The Levy's legend under its caption: the two moves' colors (the dot takes the color of the move it jumps by), the
// way the app tints the dot in flight: 75% of the move's color plus 25% white.
const legendLayers = (m, W, y, a) => {
  const tint = (c) => `rgb(${c.map((q) => Math.round(0.75 * q + 0.25 * 255)).join(",")})`;
  const out = [];
  [["left", 392, m.rgb[0]], ["right", 568, m.rgb[1]]].forEach(([word, x, c]) => {
    out.push({ circle: true, x: W / 2 - 540 + x, y, r: 13, fillColor: tint(c), alpha: a });
    out.push({ text: word, x: W / 2 - 540 + x + 28, y, size: 52, align: "left", alpha: 0.9 * a });
  });
  return out;
};

function layout(meta, { fps, W, H }) {
  const P = plan(meta);
  const beats = [
    [0, START + HOOK_FADE, "hook: the finished triangle dissolves to the empty backdrop"],
    [P.starts.triangle, P.done.triangle, "triangle: 3 corners, 1 rule (24 slow jumps, then the build)"],
    [P.starts.fern, P.done.fern, "fern: 4 rules, 1% / 85% / 7% / 7%"],
    [P.starts.levy, P.done.levy, `Levy C: 2 moves, shrink and turn 45 degrees left or right (slow jumps to ${f3(P.starts.levy + meta.levy.events[23].t)} s)`],
    [P.starts.vicsek, P.done.vicsek, `Vicsek cross: 5 rules, two thirds of the way to 5 points, rings shown (slow jumps to ${f3(P.starts.vicsek + meta.vicsek.events[23].t)} s)`],
    [P.grid, P.gridDone, "finale: the four shapes built at once, side by side"],
    [P.gridDone, P.seconds, "held, fade to black"],
  ];
  const lastFrame = (id) => meta[id].frames - 1;
  const caps = captions(P, meta);
  const frame = (i, t) => {
    const layers = [];
    if (t >= P.grid) {
      layers.push({ backdrop: true, filter: GRADE });
      for (const [id, x, y] of TILES) layers.push({ scene: id, frame: Math.round((t - P.grid) * fps), x, y, w: 520, h: 650, alpha: smooth((t - P.grid) / 0.5), add: true, filter: GRADE });
    }
    for (let k = SEQ.length - 1; k >= 0; k--) {
      const [id, hold] = SEQ[k];
      const nextStart = k + 1 < SEQ.length ? P.starts[SEQ[k + 1][0]] : P.grid;
      if (t < P.starts[id] || t >= nextStart + DISSOLVE) continue;
      const alpha = t < nextStart ? 1 : 1 - smooth((t - nextStart) / DISSOLVE);
      const s = 1 + PUSH * smooth((t - P.done[id]) / (hold + DISSOLVE));
      layers.push({ scene: id, frame: Math.round((t - P.starts[id]) * fps), x: (W - W * s) / 2, y: (H - H * s) / 2, w: W * s, h: H * s, alpha, filter: GRADE });
    }
    // the Vicsek's five target rings (the scene's own overlay has none), over the scenes
    if (t >= P.starts.vicsek && t < P.starts.vicsek + 12) layers.push(...ringLayers("vicsek", meta.vicsek, t, P, W, H, VICSEK_RING));
    if (t < START + HOOK_FADE) layers.push({ scene: "triangle", frame: lastFrame("triangle"), x: 0, y: 0, w: W, h: H, alpha: 1 - smooth((t - START) / HOOK_FADE), filter: GRADE });
    for (const c of caps) {
      const a = Math.min(smooth((t - c.from) / 0.4), smooth((c.to - t) / 0.4));
      if (a > 0) layers.push({ text: c.text, x: W / 2, y: H * 0.135, size: CAPTION_SIZE, alpha: 0.95 * a });
      if (a > 0 && c.legend) layers.push(...legendLayers(meta.levy, W, H * 0.135 + 112, 0.95 * a));
    }
    return layers;
  };
  return { seconds: P.seconds, beats, frame, plan: P };
}

export default {
  ...base,
  id: "the-chaos-game-v2",
  title: "The Chaos Game (v2)",
  stem: "the-chaos-game-v2",
  outDir: "~/Movies/fractal-atlas-shorts/the-chaos-game-v2",
  thumbAt: 46.6, // the four finished shapes with the last caption (the grid is built at 46.2 s)
  renderer: { ...base.renderer, scenes, layout },
  audio: audioFor,
  post: postFor,
};

// ---------------------------------------------------------------- the post
// Every number below was checked against fern.js (verify-maths: the Levy C's maps are [[.5,-.5],[.5,.5]] and
// [[.5,.5],[-.5,.5]] with a shift of (.5,.5): scale 1/sqrt2 = 0.7071, turns of +45 (counter-clockwise, about
// (0,0)) and -45 degrees (clockwise, about (1,0)), p = 0.5 each; the Vicsek's five maps scale by 1/3 with
// shifts that make each p' = p/3 + (2/3)T for T = (.5,.5), (.5,0), (.5,1), (0,.5), (1,.5), p = 0.2 each, and its
// attractor fills the unit square; the triangle's three maps halve toward a corner, p = 1/3; the fern's
// p = 0.01 / 0.85 / 0.07 / 0.07; REPLAY_SLOW_JUMPS = 24; every picture is 1,000,000 points) and against the
// captured landings (every Vicsek jump lands exactly 2/3 of the way to its target; every Levy jump is its map).
function postFor({ layout }) {
  const pure = layout.seconds.toFixed(1), card = (layout.seconds + 1.5).toFixed(1);
  return {
    notes: `Files: \`the-chaos-game-v2-pure.mp4\` (${pure} s, fades to black; the primary cut), \`the-chaos-game-v2-endcard.mp4\` (${card} s, the same picture and sound, then a 1.5 s "Fractal Atlas, free for iPhone and iPad" card), \`the-chaos-game-v2-bed.m4a\` (the sound bed alone, so you can swap it), \`thumbnail.png\`. This is the second cut: it adds a caption for the Lévy C and the Vicsek cross, five target rings on the Vicsek, and longer first jumps.`,
    titles: [
      "The Chaos Game: Random Jumps Draw a Sierpinski Triangle and a Fern",
      "How Random Jumps Build the Sierpinski Triangle (the Chaos Game)",
      "Chaos Game Fractals: Triangle, Fern, Lévy C and Vicsek Cross From Random Jumps",
    ],
    titleNote: "(All three describe what is on screen and make no claim about records or reach. Option 2 is the one that names the rule people search for.)",
    description: `A dot jumps at random, and a picture appears. This is the chaos game, as the free app Fractal Atlas plays it.

Triangle: pick one of three corners at random and jump halfway there. A million jumps later the dots have drawn the Sierpinski triangle, though no jump aimed at it.

Fern: four rules, chosen 1%, 85%, 7% and 7% of the time. The rare 1% rule only ever draws the stem.

Lévy C: two moves, chosen equally. Each shrinks to about 71% and turns 45°, one to the left and one to the right.

Vicsek cross: five targets, the center and the middle of each side, chosen equally. Each jump goes two thirds of the way there.

Every landing is colored by the rule that made it. The dice are a seeded pseudo-random generator, so the same jumps come every time. Each picture is one million points; the first 24 jumps are shown one at a time.`,
    hashtags: "#chaosgame #fractals #shorts",
    pinned: `The chaos game in one line: pick a rule at random, apply it to the current point, plot the result, repeat. Triangle: three rules, each "move halfway to one corner" (probability 1/3 each). Fern: four rules with probabilities 1%, 85%, 7% and 7% (Barnsley's published values; the 1% rule collapses everything onto the stem). Lévy C: two rules, 50% each; each scales by 1/√2 (about 0.71) and turns by 45°, one counter-clockwise about one end of the C and one clockwise about the other end. Vicsek cross: five rules, 20% each; each scales by 1/3, which is the same as jumping two thirds of the way toward one of five fixed points: the center of the square or the middle of one of its sides.

Every shape is one million points, drawn live by Fractal Atlas, a free app for iPhone and iPad (the replay is the Play button on these shapes). The random numbers are seeded, so the jumps shown are the same on every run. The link is in my channel profile.`,
    posting: [
      "Upload the pure cut as the main Short. It fades to black and the Short loops back to the finished triangle that dissolves into the first jumps, so the loop is the hook. Use the end-card cut instead if you want the app's name on screen at the end; the card is 1.5 s of the " + card + " s.",
      "Shorts links are not clickable: put the App Store link in the channel profile (the pinned comment says so).",
      "The thumbnail is a frame from the video (Shorts use the video's own frame); `thumbnail.png` is the one picked: the four finished shapes with the last caption.",
      "The sound is self-made in ffmpeg (an open D drone, a soft pluck on every one of the first jumps whose pitch says which rule was used, a rising shimmer as each picture builds, and bells as each completes), so it carries no third-party licensing. `the-chaos-game-v2-bed.m4a` is the bed alone if you want to remix it.",
      "I could not listen to the audio or watch the video play when making this; audition it before posting. The loudness and the timing of the plucks were measured, not heard, and the pictures were checked as still frames.",
      "The five captions are in the picture (top of the frame, clear of the Shorts buttons at the bottom): \"Pick a corner at random. Jump halfway there.\", \"Four rules, picked at random: 1% · 85% · 7% · 7%\", \"Two moves, picked at random: shrink, then turn 45° left or right.\", \"Jump two thirds of the way to the center or the middle of a side.\" and \"Random jumps. Simple rules.\"",
      "The five faint rings on the Vicsek cross mark the points it jumps toward (the app draws such rings only for the triangle, so this cut draws them over the app's picture); the ring of the rule just chosen lights up while the dot flies. The two dots by the Lévy caption are the colors of its two moves.",
      "No claim is made about records or reach.",
    ],
  };
}
