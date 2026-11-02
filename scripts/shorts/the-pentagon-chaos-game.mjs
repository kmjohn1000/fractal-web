// Recipe: "The Chaos Game: Five Corners": the sequel to The Chaos Game (the-chaos-game*.mjs). A vertical
// YouTube Short (1080x1920, 30 fps, about 40 s) on the Sierpinski pentagon, the app's dot shape of five
// corners (fern.js PENTAGON_TRANSFORMS), played with the app's own Play replay. The idea: the triangle's rule
// ("jump halfway to a corner") is tried on five corners and does not give a clean shape; a different jump size does.
//
//   0.0 s     the finished clean pentagon (a striking first frame) dissolves into the empty backdrop of scene 1
//   0.3-14 s  HALFWAY (scene `half`): the same game as the triangle, five corners, every jump HALFWAY (s = 0.5).
//             The dot's first 120 jumps are shown one at a time with the path behind it, then a million points
//             build a dense fill in which the five half-size copies overlap, with small pentagon holes.
//             Captions: "Same game as the triangle. Five corners." then what the picture is.
//   15-33 s   62% (scene `clean`): jump 61.8% of the way instead (s = 1/phi^2 = 0.382, the app's own shape): 240 jumps
//             one at a time with a longer path behind the dot, then the build to a million points: five pieces
//             that just touch, each built from five smaller ones, around a large empty middle.
//   34-39 s   FINALE: the two finished pictures side by side, labelled, "Same random corners. A different jump."
//             The pure cut fades to black over the last 2 s.
//
// The two scenes use the same seed, so the dot's corners are the same random choices in both (checked in the scene
// meta: `facts` lists the first corners of each). Scene `half` needs jump size 0.5, which the app has no control for:
// the recipe sets it the way it sets the replay's schedule constants, by rewriting `PENTAGON_RATIO` in fern.js as the
// page loads (a scene's `replay.pentagonRatio`, see patchReplay in make-short.mjs); the repo's file is not touched.
//
// The sound is the chaos-game family (the-chaos-game-connected's bed: an open D drone, a pluck on each of the first jumps
// pitched by the corner it used, a rising shimmer as a picture builds, bells as each completes), with the pentagon's five
// corners as the D pentatonic from left to right. Agents cannot listen: audition it before posting.
//
// Run `meta --recipe the-pentagon-chaos-game` (fast) before `plan`/`compose`, then `build`.
import { FULL, GRADE, START, DISSOLVE, HOOK_FADE, PUSH, smooth, f3 } from "./the-chaos-game.mjs";

/* global IFS_SYSTEMS */
// (the callbacks given to page.evaluate run inside the app's page)
const SIZE = [1080, 1920];
const RAMP = 4.5, BURN_IN = 12, LIVE_FADE = 60; // the app's REPLAY_RAMP_S, REPLAY_BURN_IN and its dot/trail fade (jumps)
const COUNT = 1000000;
const HALF_RATIO = 0.5;
const SEED = 18; // the first five jumps visit all five corners (checked by simulating the app's mulberry32 and its pick rule)

const replayFor = (slowJumps, trail, extra = {}) => ({
  slowJumps, trail, liveFade: LIVE_FADE, seq: slowJumps + LIVE_FADE + 4, gapFirst: 0.3, cap: 300, // (the app's 10 s cap would end a long one-at-a-time phase)
  gapLast: Number((RAMP / (0.25 * slowJumps * Math.log((COUNT + BURN_IN) / slowJumps))).toFixed(5)),
  ...extra,
});

// 1x = the app's schedule time; knots are [video second in the scene, play speed].
const SLOW = { half: 120, clean: 240 };
const TRAIL = { half: 22, clean: 36 };
const SCENES = {
  half: { driver: "replay", shape: "pentagon", color: "Ice", count: COUNT, seed: SEED, ...FULL, frame: { zoom: 1.0, dy: 0.03 },
    replay: replayFor(SLOW.half, TRAIL.half, { pentagonRatio: HALF_RATIO }),
    speed: [[0, 0.8], [3, 1.0], [7, 1.4], [9.5, 1.3], [40, 1.2]] },
  clean: { driver: "replay", shape: "pentagon", color: "Ice", count: COUNT, seed: SEED, ...FULL, frame: { zoom: 1.0, dy: 0.03 },
    replay: replayFor(SLOW.clean, TRAIL.clean),
    speed: [[0, 0.75], [3.5, 0.95], [8, 1.5], [12, 1.9], [14.5, 1.9], [15.5, 1.2], [40, 1.0]] },
};
const SEQ = [["half", 1.0], ["clean", 3.2]]; // scene, seconds its finished picture is held (the 62% pentagon, the last one drawn, 2 s longer than first made: 1.2 -> 3.2)
const FINALE_HOLD = 5.0; // the side-by-side finale, held 1 s longer than first made (4.0 -> 5.0)

// The pitch (D major pentatonic, rising left to right across the pentagon) and pan of each corner's rule, by its index in
// fern.js's PENTAGON_TRANSFORMS (clockwise from the top: top, upper right, lower right, lower left, upper left).
const VOICE = { hz: [739.99, 987.77, 880, 659.25, 587.33], pan: [0, 0.55, 0.3, -0.3, -0.55] };
const MAX_PLUCK = { half: 70, clean: 110 };

// The beat structure from the scenes' measured meta (when each replay completes).
function plan(meta) {
  const starts = {}, done = {};
  let t = START;
  for (const [id, hold] of SEQ) {
    starts[id] = t;
    done[id] = t + meta[id].doneAt;
    t = done[id] + hold;
  }
  return { starts, done, finale: t, seconds: f3(t + DISSOLVE + FINALE_HOLD + 0.5) };
}

// Captions: top of the frame (as the earlier cuts), two lines, 66 px. Each says only what is on screen at that moment.
const CAPTION_SIZE = 66;
function captions(P, meta) {
  const m = meta, buildFrom = (id) => P.starts[id] + m[id].marks[1000];
  return [
    { from: P.starts.half + 0.7, to: P.starts.half + 5.7, text: "Same rules as the triangle game,\nbut with five corners\ninstead of three." }, // three lines: the second of two would be 39 characters, wider than the frame at 66 px
    { from: P.starts.half + 6.0, to: buildFrom("half") - 0.3, text: "Pick a corner at random.\nJump halfway there." },
    { from: buildFrom("half"), to: P.done.half + 1.0, text: "Halfway to a corner each time:\nthe pieces overlap and fill in." },
    { from: P.starts.clean + 0.9, to: Math.min(P.starts.clean + 8.0, buildFrom("clean") - 0.3), text: "Change the jump from halfway\nto 62% of the way." },
    { from: P.starts.clean + 8.6, to: buildFrom("clean") + 0.2, text: "Each jump starts where\nthe last one landed." },
    { from: buildFrom("clean") + 0.6, to: P.done.clean + 3.0, text: "Five pieces that just touch,\neach built from five more." }, // (stays up through the hold on the finished pentagon)
    { from: P.finale + 0.9, to: P.seconds - 0.4, text: "Same random corners make\ntwo very different shapes." },
  ];
}

const FINALE_CELLS = [["half", 0, "halfway"], ["clean", 540, "62% of the way"]]; // scene, x of its 540x960 cell, label

function layout(meta, { fps, W, H }) {
  const P = plan(meta);
  const beats = [
    [0, START + HOOK_FADE, "hook: the finished 62% pentagon dissolves to the empty backdrop"],
    [P.starts.half, P.done.half, `halfway (s = 0.5): five corners, ${SLOW.half} jumps one at a time, then the build; the pieces overlap`],
    [P.starts.clean, P.done.clean, `62% of the way (s = 0.382): ${SLOW.clean} jumps one at a time, then the build; five touching pieces`],
    [P.finale, P.seconds - 2, "finale: the two pictures side by side"],
    [P.seconds - 2, P.seconds, "held, fade to black"],
  ];
  const lastFrame = (id) => meta[id].frames - 1;
  const caps = captions(P, meta);
  for (let i = 1; i < caps.length; i++) if (caps[i].from < caps[i - 1].to) throw new Error(`captions ${i - 1} and ${i} overlap`);
  const frame = (i, t) => {
    const layers = [];
    if (t >= P.finale) {
      layers.push({ backdrop: true, filter: GRADE });
      const a = smooth((t - P.finale) / 0.6);
      for (const [id, x, label] of FINALE_CELLS) {
        layers.push({ scene: id, frame: 100000, x, y: (H - 960) / 2, w: 540, h: 960, alpha: a, add: true, filter: GRADE });
        layers.push({ text: label, x: x + 270, y: H * 0.7, size: 52, alpha: 0.9 * a });
      }
    }
    for (let k = SEQ.length - 1; k >= 0; k--) {
      const [id, hold] = SEQ[k];
      const nextStart = k + 1 < SEQ.length ? P.starts[SEQ[k + 1][0]] : P.finale;
      if (t < P.starts[id] || t >= nextStart + DISSOLVE) continue;
      const alpha = t < nextStart ? 1 : 1 - smooth((t - nextStart) / DISSOLVE);
      const s = 1 + PUSH * smooth((t - P.done[id]) / (hold + DISSOLVE));
      layers.push({ scene: id, frame: Math.round((t - P.starts[id]) * fps), x: (W - W * s) / 2, y: (H - H * s) / 2, w: W * s, h: H * s, alpha, filter: GRADE });
    }
    // the hook: the finished clean pentagon over the start of the first replay, fading away
    if (t < START + HOOK_FADE) layers.push({ scene: "clean", frame: lastFrame("clean"), x: 0, y: 0, w: W, h: H, alpha: 1 - smooth((t - START) / HOOK_FADE), filter: GRADE });
    for (const c of caps) {
      const a = Math.min(smooth((t - c.from) / 0.4), smooth((c.to - t) / 0.4));
      if (a > 0) layers.push({ text: c.text, x: W / 2, y: H * 0.135, size: CAPTION_SIZE, alpha: 0.95 * a });
    }
    return layers;
  };
  return { seconds: P.seconds, beats, frame, plan: P };
}

// ---------------------------------------------------------------- the sound
// The connected cut's bed (an open D drone, a pluck on each jump placed to the sample and pitched by the corner it used,
// a rising shimmer as each picture builds, bells as each completes), here with two pictures and a closing chord.
function audioFor({ layout, meta }) {
  const P = layout.plan;
  const events = [];
  for (const [id] of SEQ) {
    for (const e of meta[id].events) {
      if (e.n > MAX_PLUCK[id]) break;
      const g = e.n <= 24 ? 1 : Math.max(0.12, Math.pow(24 / e.n, 1.1));
      events.push({ t: f3(P.starts[id] + e.t), hz: VOICE.hz[e.ci], gain: f3(g), pan: VOICE.pan[e.ci] });
    }
  }
  const windows = SEQ.map(([id]) => [P.starts[id] + meta[id].events[SLOW[id] - 1].t, P.done[id], 1]);
  const env = (exponent, amp) => windows.map(([a, b, g]) => `${f3(amp * g)}*if(lt(t,${f3(a)}),0,if(lt(t,${f3(b)}),pow((t-${f3(a)})/${f3(b - a)},${exponent}),exp(-(t-${f3(b)})/0.45)))`).join("+");
  const bells = [
    { at: 0, freq: 587.33, gain: 0.7 },
    { at: f3(P.done.half), freq: 587.33, gain: 0.5 },
    { at: f3(P.done.clean), freq: 880, gain: 0.6 },
    { at: f3(P.finale + 0.6), freq: 587.33, gain: 0.9 },
    { at: f3(P.finale + 0.72), freq: 880, gain: 0.7 },
    { at: f3(P.finale + 0.84), freq: 1479.98, gain: 0.5 },
  ];
  const x = `min(max((t-${f3(P.finale)})/3.5,0),1)`;
  return {
    seconds: Math.ceil(layout.seconds) + 4, targetLufs: -15, limiter: 0.7,
    layers: [
      {
        type: "drone",
        notes: [[73.42, 0.30], [146.83, 0.22], [220, 0.15], [293.66, 0.12], [369.99, 0.08], [493.88, 0.04]],
        detune: [0.05, 0.02], tremolo: [0.04, 0.013], drift: [0.6, 0.2, 0.021, 0.007],
        noise: "lowpass=f=500,highpass=f=80,tremolo=f=0.1:d=0.6,volume=0.18",
        post: "lowpass=f=1300,aecho=0.8:0.85:140|290:0.4|0.25",
        swell: `0.6*(0.55+0.45*(3*pow(min(t/4,1),2)-2*pow(min(t/4,1),3)))*(1+0.4*(3*pow(${x},2)-2*pow(${x},3)))`,
      },
      {
        type: "plucks", gain: 0.5, echo: "aecho=0.7:0.6:260|470:0.28|0.18",
        voice: { partials: [[1, 1, 0.5], [2, 0.32, 0.28], [3.01, 0.12, 0.16], [4.2, 0.04, 0.1]], attack: 0.004, length: 1.8 },
        events,
      },
      {
        type: "shimmer", gain: 1.8, seed: 21,
        bands: [{ hp: 500, lp: 1500, env: env(1.2, 0.5) }, { hp: 1800, lp: 4500, env: env(2.2, 0.4) }, { hp: 5000, lp: 11000, env: env(3.5, 0.3) }],
      },
      {
        type: "bell", gain: 0.32, length: 14,
        partials: [[1, 1, 3.0], [2.0, 0.4, 1.8], [2.76, 0.3, 1.2], [5.4, 0.1, 0.6]],
        strikes: bells,
      },
    ],
  };
}

// ---------------------------------------------------------------- the post
// Numbers, each read from the repo or the scene meta (run `facts` to print them): PENTAGON_RATIO = 1/phi^2 = 0.381966, so each
// jump covers 1 - 0.381966 = 61.8% of the way to the corner; five corners of a regular pentagon (circumradius 1, point up),
// p = 1/5 each; the half scene's ratio is 0.5 (jumps halfway, as the triangle's); one million points in each picture;
// the one-at-a-time jumps are SLOW.half = 120 and SLOW.clean = 240. The dimension log 5 / log(1/0.381966) = 1.672
// (the info card says "Dimension 1.67"). Wikipedia's N-flake article calls this shape's variant "with no central pentagon"
// a variation of the pentaflake (the pentaflake itself has a sixth pentagon in the middle), so the post says "Sierpinski
// pentagon" and does not call it the pentaflake.
function postFor({ layout }) {
  const pure = layout.seconds.toFixed(1), card = (layout.seconds + 1.5).toFixed(1);
  return {
    notes: `Files: \`the-pentagon-chaos-game-pure.mp4\` (${pure} s, fades to black; the primary cut), \`the-pentagon-chaos-game-endcard.mp4\` (${card} s, the same picture and sound, then a 1.5 s "Fractal Atlas, free for iPhone and iPad" card), \`the-pentagon-chaos-game-bed.m4a\` (the sound bed alone), \`thumbnail.png\`. The sequel to The Chaos Game: the triangle's jump-halfway rule on five corners, then a different jump size.`,
    titles: [
      "The Chaos Game on a Pentagon: Why Halfway Fails and 62% Works",
      "Random Jumps on Five Corners: Halfway Overlaps, 62% Draws a Fractal",
      "Chaos Game, Pentagon Version: What Jump Size Draws the Fractal?",
    ],
    titleNote: "(All three describe what is on screen and make no claim about records or reach. \"Fails\" in option 1 means no clean fractal; the halfway picture is a fill with small holes, not nothing.)",
    description: `Same game as the triangle, but with five corners.

Pick one of the five corners of a pentagon at random and jump halfway to it; repeat. The first ${SLOW.half} jumps are shown one at a time, then a million points fill in, and the pieces overlap.

Now jump 62% of the way to the corner instead (each piece shrinks to 0.382 of the size, which is one over the golden ratio squared). The first ${SLOW.clean} jumps are shown one at a time with the path behind the dot, then a million points build the Sierpinski pentagon: five pieces that just touch, each made of five smaller ones, around a large empty middle.

The two runs use the same random corners; only the jump size changes. Every landing is colored by the corner that made it. Played live in the free app Fractal Atlas; the dice are a seeded pseudo-random generator, so the same jumps come every time.`,
    hashtags: "#chaosgame #fractals #shorts",
    pinned: `The rule in one line: pick one of the five corners of a regular pentagon at random, move to the point a fixed fraction of the way there, plot it, repeat. Halfway (a fraction of 1/2): the five half-size copies overlap, so the picture fills in. Jumping 61.8% of the way (the copies shrink to 0.382 = 1/phi^2, phi the golden ratio): the five copies just touch, each corner to the next, which gives the Sierpinski pentagon, a fractal of dimension about 1.67 (log 5 / log 2.618). It is the pentaflake variant with no pentagon in the middle (Wikipedia's N-flake article describes both).

Each picture is one million points, drawn live by Fractal Atlas, a free app for iPhone and iPad (the replay is the Play button on its dot shapes; the halfway version here is the same replay with the jump size changed for this video; the app's pentagon is the 62% one). The random numbers are seeded, so the jumps shown are the same on every run. The link is in my channel profile.`,
    posting: [
      "Upload the pure cut as the main Short. It fades to black and the Short loops back to the finished clean pentagon that dissolves into the first jumps, so the loop is the hook. Use the end-card cut instead if you want the app's name on screen at the end; the card is 1.5 s of the " + card + " s.",
      "Shorts links are not clickable: put the App Store link in the channel profile (the pinned comment says so).",
      "The thumbnail is a frame from the video (Shorts use the video's own frame); `thumbnail.png` is the one picked.",
      "The halfway picture is not in the app as a shape: this video changes one constant (the pentagon's jump size, 0.5 instead of 0.382) in the app's own code as the page loads, and nothing else. The caption says only what is on screen (\"the pieces overlap and fill in\").",
      "The sound is self-made in ffmpeg (an open D drone, a soft pluck on each of the first jumps pitched by the corner it used, a rising shimmer as each picture builds, and bells as each completes), so it carries no third-party licensing. `the-pentagon-chaos-game-bed.m4a` is the bed alone.",
      "I could not listen to the audio or watch the video play when making this; audition it before posting. Loudness and pluck timing were measured, not heard, and the pictures were checked as still frames.",
      "The captions are in the picture (top of the frame, clear of the Shorts buttons at the bottom): \"Same rules as the triangle game, but with five corners instead of three.\", \"Pick a corner at random. Jump halfway there.\", \"Halfway to a corner each time: the pieces overlap and fill in.\", \"Change the jump from halfway to 62% of the way.\", \"Each jump starts where the last one landed.\", \"Five pieces that just touch, each built from five more.\" and \"Same random corners make two very different shapes.\"",
      "No claim is made about records or reach.",
    ],
  };
}

export default {
  id: "the-pentagon-chaos-game",
  title: "The Chaos Game: Five Corners",
  stem: "the-pentagon-chaos-game",
  outDir: "~/Movies/fractal-atlas-shorts/the-pentagon-chaos-game",
  fps: 30,
  size: SIZE,
  fadeOut: 2.0, cardFade: 0.6, cardHold: 1.5,
  thumbAt: 38.5, // the finale: both finished pictures, labelled, with its caption (the finale starts at 36.1 s since the 2 s longer hold)
  renderer: {
    type: "capture",
    scenes: SCENES,
    layout,
    async facts({ page, meta, layout: lay }) {
      const sys = await page.evaluate(() => Object.fromEntries(Object.entries(IFS_SYSTEMS).filter(([k]) => k === "pentagon").map(([k, v]) => [k, v.transforms.map((t) => ({ p: t.p, a: t.a, d: t.d }))])));
      const corners = Object.fromEntries(Object.entries(meta).map(([k, m]) => [k, m.events.slice(0, 24).map((e) => e.ci).join("")]));
      return { systems: sys, firstCorners: corners, scenes: Object.fromEntries(Object.entries(meta).map(([k, m]) => [k, { shape: m.shape, count: m.count, total: m.total, doneAt: m.doneAt, frames: m.frames }])), beats: lay.beats };
    },
  },
  audio: audioFor,
  post: postFor,
};
