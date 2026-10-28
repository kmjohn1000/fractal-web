// Recipe: "The Chaos Game": a vertical YouTube Short (1080x1920, 30 fps, about 45 s) that
// shows the app's Play/replay on the dot shapes (fern.js createIfsView, the Play button):
// a bright dot hops from point to point, each jump by a randomly chosen rule and in that
// rule's color, and a picture grows out of nothing. (The recipe format is documented in
// scripts/make-short.mjs; this one uses renderer "capture" with the "replay" driver.)
//
// The sequence, built for a viewer who has never seen the chaos game:
//   0.0 s     the finished Sierpinski triangle (a striking first frame) dissolves into the empty
//             backdrop with its three faint corner rings and the dot at the start
//   0.3-12 s  TRIANGLE: three corners, one rule (half way to a corner chosen at random). The 24
//             slow jumps are shown at about half speed, each landing a soft pluck whose pitch
//             says which corner; then the picture builds to 1,000,000 points. Caption 1.
//   12-22 s   FERN: four rules chosen 1%, 85%, 7%, 7% of the time: the rare ones are visibly
//             rare in the slow jumps (the seed is picked so the 1% rule turns up once). Caption 2.
//   22-30 s   LEVY C: two rules, 50/50, a little faster, turned upright to fill the portrait frame.
//   30-37 s   VICSEK cross: five rules, faster again.
//   37-45 s   FINALE: the four shapes side by side in a 2x2 grid, all four built at once
//             in about 5 s, held to a close. Caption 3. The pure cut fades to black over the last 2 s.
// Pacing accelerates (the replay's speed is 0.55x, 0.75x, 1.1x, 1.3x, then 1.7x in the grid) so the
// first shape teaches the rule and the later ones only confirm it.
//
// The seeds (ifsRandom, mulberry32 as in tests/visual/dot-replay.spec.mjs) were chosen by
// simulating the first 24 jumps: the triangle's first jumps visit all three corners, the fern's
// show 85% moves, two kinds of 7% move and the 1% stem move once, the Levy's alternate, the
// Vicsek's visit all five rules in the first six jumps.

/* global IFS_SYSTEMS */
// (the callbacks given to page.evaluate run inside the app's page)
const SIZE = [1080, 1920];
const FULL = { size: [540, 960], dsf: 2 }; // css px at device scale 2: a 1080x1920 canvas, the app's own dpr cap
const TILE = { size: [520, 650], dsf: 2 };  // the finale's tiles: captured at 1040x1300, drawn at 520x650

// Which rule is which, per shape (ci = the transform's index in fern.js): the pitch it plays, its pan.
// D major pentatonic over a drone on D; the rare fern rules are the high bright ones.
const VOICES = {
  sierpinski: { hz: [880, 587.33, 739.99], pan: [0, -0.6, 0.6] },            // top, left, right corner
  fern: { hz: [1174.66, 440, 659.25, 493.88], pan: [0, 0, 0.5, -0.5] },      // 1% stem, 85%, 7%, 7%
  levy: { hz: [587.33, 880], pan: [-0.4, 0.4] },
  vicsek: { hz: [587.33, 659.25, 739.99, 880, 987.77], pan: [0, -0.5, 0.5, -0.25, 0.25] },
};

// Speed profiles [video second in the scene, play speed]: 1 = the app's 8 s replay. The slow
// jumps end after 3.61 s of schedule time, the ramp takes 4.5 s more.
const FRAMING = { zoom: 1 };
const SCENES = {
  triangle: { driver: "replay", shape: "sierpinski", color: "Gold", count: 1000000, seed: 16, ...FULL, frame: { ...FRAMING, zoom: 1.0, dy: 0.04 }, speed: [[0, 0.55], [6.4, 0.6], [7.4, 0.95], [20, 1.0]] },
  fern: { driver: "replay", shape: "fern", color: "Green", count: 1000000, seed: 136, ...FULL, frame: { zoom: 0.74, dy: 0.07 }, speed: [[0, 0.75], [4.6, 0.8], [5.6, 1.0], [20, 1.0]] },
  levy: { driver: "replay", shape: "levy", color: "Violet", count: 1000000, seed: 8, ...FULL, frame: { zoom: 1.42, rotation: -Math.PI / 2, dy: 0.0 }, speed: [[0, 1.1], [3, 1.2], [3.6, 1.35], [20, 1.4]] },
  vicsek: { driver: "replay", shape: "vicsek", color: "Rose", count: 1000000, seed: 18, ...FULL, frame: { zoom: 0.98, dy: 0.04 }, speed: [[0, 1.3], [2.6, 1.4], [3.2, 1.6], [20, 1.6]] },
  tileTriangle: { driver: "replay", shape: "sierpinski", color: "Gold", count: 1000000, seed: 16, ...TILE, frame: { zoom: 1.0 }, speed: [[0, 1.7]] },
  tileFern: { driver: "replay", shape: "fern", color: "Green", count: 1000000, seed: 136, ...TILE, frame: { zoom: 1.0 }, speed: [[0, 1.7]] },
  tileLevy: { driver: "replay", shape: "levy", color: "Violet", count: 1000000, seed: 8, ...TILE, frame: { zoom: 1.0, rotation: -Math.PI / 2 }, speed: [[0, 1.7]] },
  tileVicsek: { driver: "replay", shape: "vicsek", color: "Rose", count: 1000000, seed: 18, ...TILE, frame: { zoom: 1.0 }, speed: [[0, 1.7]] },
};
const SEQ = [["triangle", 1.3], ["fern", 0.9], ["levy", 0.7], ["vicsek", 0.8]]; // scene, seconds the finished picture is held
const TILES = [["tileTriangle", 20, 330], ["tileFern", 540, 330], ["tileLevy", 20, 980], ["tileVicsek", 540, 980]]; // scene, x, y of its 520x650 cell
const GRADE = "brightness(1.22) contrast(1.06) saturate(1.12)"; // a light lift for phone screens: the app's own thin lines on a dark backdrop
const START = 0.3, DISSOLVE = 0.7, HOOK_FADE = 0.9, GRID_HOLD = 3.0, PUSH = 0.03;

const clamp01 = (u) => Math.min(1, Math.max(0, u));
const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const f3 = (x) => Number(x.toFixed(3));

// The beat structure from the scenes' measured meta (when each replay completes).
function plan(meta) {
  const starts = {}, done = {};
  let t = START;
  for (const [id, hold] of SEQ) {
    starts[id] = t;
    done[id] = t + meta[id].doneAt;
    t = done[id] + hold;
  }
  const grid = t; // the last shape starts to dissolve into the grid
  const gridDone = grid + Math.max(...TILES.map(([id]) => meta[id].doneAt));
  return { starts, done, grid, gridDone, seconds: f3(gridDone + GRID_HOLD) };
}

const CAPTIONS = (P) => [
  { from: P.starts.triangle + 0.9, to: P.starts.triangle + 7.4, text: "Pick a corner at random.\nJump halfway there." },
  { from: P.starts.fern + 0.7, to: P.starts.fern + 7.6, text: "Four rules, picked at random:\n1%  ·  85%  ·  7%  ·  7%" },
  { from: P.grid + 1.3, to: P.seconds - 0.4, text: "Random jumps.\nSimple rules." },
];

function layout(meta, { fps, W, H }) {
  const P = plan(meta);
  const beats = [
    [0, START + HOOK_FADE, "hook: the finished triangle dissolves to the empty backdrop"],
    [P.starts.triangle, P.done.triangle, "triangle: 3 corners, 1 rule (24 slow jumps, then the build)"],
    [P.starts.fern, P.done.fern, "fern: 4 rules, 1% / 85% / 7% / 7%"],
    [P.starts.levy, P.done.levy, "Levy C: 2 rules, 50/50"],
    [P.starts.vicsek, P.done.vicsek, "Vicsek cross: 5 rules"],
    [P.grid, P.gridDone, "finale: the four shapes built at once, side by side"],
    [P.gridDone, P.seconds, "held, fade to black"],
  ];
  const lastFrame = (id) => meta[id].frames - 1;
  const frame = (i, t) => {
    const layers = [];
    // the finale grid, under everything
    if (t >= P.grid) {
      layers.push({ backdrop: true, filter: GRADE });
      for (const [id, x, y] of TILES) layers.push({ scene: id, frame: Math.round((t - P.grid) * fps), x, y, w: 520, h: 650, alpha: smooth((t - P.grid) / 0.5), add: true, filter: GRADE });
    }
    // the full-screen scenes, the newest at the bottom, each fading over the next as it starts
    for (let k = SEQ.length - 1; k >= 0; k--) {
      const [id, hold] = SEQ[k];
      const nextStart = k + 1 < SEQ.length ? P.starts[SEQ[k + 1][0]] : P.grid;
      if (t < P.starts[id] || t >= nextStart + DISSOLVE) continue;
      const alpha = t < nextStart ? 1 : 1 - smooth((t - nextStart) / DISSOLVE);
      const s = 1 + PUSH * smooth((t - P.done[id]) / (hold + DISSOLVE));
      layers.push({ scene: id, frame: Math.round((t - P.starts[id]) * fps), x: (W - W * s) / 2, y: (H - H * s) / 2, w: W * s, h: H * s, alpha, filter: GRADE });
    }
    // the hook: the finished triangle over the start of the replay, fading away
    if (t < START + HOOK_FADE) layers.push({ scene: "triangle", frame: lastFrame("triangle"), x: 0, y: 0, w: W, h: H, alpha: 1 - smooth((t - START) / HOOK_FADE), filter: GRADE });
    for (const c of CAPTIONS(P)) {
      const a = Math.min(smooth((t - c.from) / 0.4), smooth((c.to - t) / 0.4));
      if (a > 0) layers.push({ text: c.text, x: W / 2, y: H * 0.135, size: 66, alpha: 0.95 * a });
    }
    return layers;
  };
  return { seconds: P.seconds, beats, frame, plan: P };
}

// ---------------------------------------------------------------- the sound
// The same family as The Infinite's bed (an ffmpeg-synthesized drone with a noise breath, a swell,
// bells, a fade), in D instead of A, and with the picture's own events sonified:
//   plucks    every jump of the slow phase (and on, thinning out, up to jump 64) plays a soft
//             decaying tone at the moment the dot lands, its pitch and stereo position set by the
//             rule it used: the triangle's three corners are a D major triad (left D5, top A5,
//             right F#5); the fern's 85% rule is a steady A4, its two 7% rules E5 and B4 and its
//             rare 1% rule a high D6 bell-ish tone; Levy and Vicsek use the same D pentatonic
//   shimmer   as each picture builds (the replay's ramp), three bands of filtered noise swell
//             one after another, low to high, and let go the moment the picture is complete
//   bells     a bell as each picture completes (rising D, F#, A, D), a chord when the four finish
//             together, and one soft strike at 0 s under the finished triangle of the hook
//   drone     an open D chord with a noise breath, swelling in the finale
function audioFor({ layout, meta }) {
  const P = layout.plan;
  const events = [];
  for (const [id] of SEQ) {
    const m = meta[id], V = VOICES[m.shape];
    for (const e of m.events) {
      if (e.n > 64) break;
      let g = e.n <= 24 ? 1 : Math.max(0.14, Math.pow(24 / e.n, 1.1));
      if (m.shape === "fern" && e.ci === 0) g *= 1.5; // the rare rule is a bright accent
      events.push({ t: f3(P.starts[id] + e.t), hz: V.hz[e.ci], gain: f3(g), pan: V.pan[e.ci] });
    }
  }
  // shimmer windows: [from, until, gain]: from the end of the slow jumps to the completion
  const windows = SEQ.map(([id]) => [P.starts[id] + meta[id].events[23].t, P.done[id], 1]);
  windows.push([P.grid + meta.tileTriangle.events[23].t, P.gridDone, 1.7]);
  const env = (exponent, amp) => windows.map(([a, b, g]) => `${f3(amp * g)}*if(lt(t,${f3(a)}),0,if(lt(t,${f3(b)}),pow((t-${f3(a)})/${f3(b - a)},${exponent}),exp(-(t-${f3(b)})/0.45)))`).join("+");
  const bells = [
    { at: 0, freq: 587.33, gain: 0.7 },
    { at: f3(P.done.triangle), freq: 587.33, gain: 0.55 },
    { at: f3(P.done.fern), freq: 739.99, gain: 0.55 },
    { at: f3(P.done.levy), freq: 880, gain: 0.55 },
    { at: f3(P.done.vicsek), freq: 1174.66, gain: 0.55 },
    { at: f3(P.gridDone), freq: 587.33, gain: 0.9 },
    { at: f3(P.gridDone + 0.12), freq: 880, gain: 0.7 },
    { at: f3(P.gridDone + 0.24), freq: 1479.98, gain: 0.5 },
  ];
  const x = `min(max((t-${f3(P.grid)})/3.5,0),1)`;
  return {
    seconds: 60, targetLufs: -15, limiter: 0.7,
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
        type: "plucks", gain: 0.55, echo: "aecho=0.7:0.6:260|470:0.28|0.18",
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

export default {
  id: "the-chaos-game",
  title: "The Chaos Game",
  stem: "the-chaos-game",
  outDir: "~/Movies/fractal-atlas-shorts/the-chaos-game",
  fps: 30,
  size: SIZE,
  fadeOut: 2.0, cardFade: 0.6, cardHold: 1.5,
  thumbAt: 41.4, // the four finished shapes, with the last caption
  renderer: {
    type: "capture",
    scenes: SCENES,
    layout,
    async facts({ page, meta, layout: lay }) {
      const sys = await page.evaluate(() => Object.fromEntries(Object.entries(IFS_SYSTEMS).map(([k, v]) => [k, v.transforms.map((t) => ({ p: t.p, a: t.a, d: t.d }))])));
      return { systems: sys, scenes: Object.fromEntries(Object.entries(meta).map(([k, m]) => [k, { shape: m.shape, count: m.count, total: m.total, doneAt: m.doneAt, frames: m.frames }])), beats: lay.beats };
    },
  },
  audio: audioFor,
  post: postFor,
};

// What the revised cut (the-chaos-game-v2.mjs) shares with this one.
export { SIZE, FULL, TILE, VOICES, SCENES, SEQ, TILES, GRADE, START, DISSOLVE, HOOK_FADE, GRID_HOLD, PUSH, clamp01, smooth, f3, plan, audioFor };

// ---------------------------------------------------------------- the post
// Every number below was read from the repo (fern.js: SIERPINSKI_TRANSFORMS a = d = 0.5 and p = 1/3 each,
// FERN_TRANSFORMS p = 0.01 / 0.85 / 0.07 / 0.07, LEVY_C_TRANSFORMS p = 0.5 each, VICSEK_TRANSFORMS scale 1/3
// and p = 0.2 each, REPLAY_SLOW_JUMPS = 24, REPLAY_BURN_IN = 12, fernState.count = 1,000,000) or from the
// scene meta (`facts` prints them); run `facts --recipe the-chaos-game` to check them again.
function postFor({ layout }) {
  const pure = layout.seconds.toFixed(1), card = (layout.seconds + 1.5).toFixed(1);
  return {
    notes: `Files: \`the-chaos-game-pure.mp4\` (${pure} s, fades to black; the primary cut), \`the-chaos-game-endcard.mp4\` (${card} s, the same picture and sound, then a 1.5 s "Fractal Atlas, free for iPhone and iPad" card), \`the-chaos-game-bed.m4a\` (the sound bed alone, so you can swap it), \`thumbnail.png\`.`,
    titles: [
      "The Chaos Game: Random Jumps Draw a Sierpinski Triangle and a Fern",
      "How Random Jumps Build the Sierpinski Triangle (the Chaos Game)",
      "Chaos Game Fractals: Triangle, Fern, Lévy C and Vicsek Cross From Random Jumps",
    ],
    titleNote: "(All three describe what is on screen and make no claim about records or reach. Option 2 is the one that names the rule people search for.)",
    description: `A dot jumps at random, and a picture appears. This is the chaos game, as the free app Fractal Atlas plays it.

The triangle: start at the origin, pick one of three corners at random, jump halfway to it, mark the spot, repeat. After a million marks the dots have drawn the Sierpinski triangle, though no jump aimed at it.

The same idea builds the rest. The Barnsley fern has four rules, chosen 1%, 85%, 7% and 7% of the time; the rare 1% rule only ever draws the stem. The Lévy C has two rules, chosen equally; the Vicsek cross has five. Each landing is colored by the rule that made the jump.

The dice here are a seeded pseudo-random generator, so the same jumps come every time. Each picture is one million points; the first 24 jumps are shown one at a time.`,
    hashtags: "#chaosgame #fractals #shorts",
    pinned: `The chaos game in one line: pick a rule at random, apply it to the current point, plot the result, repeat. Triangle: three rules, each "move halfway to one corner" (probability 1/3 each). Fern: four rules with probabilities 1%, 85%, 7% and 7% (Barnsley's published values; the 1% rule collapses everything onto the stem). Lévy C: two rules, 50% each. Vicsek cross: five rules, each shrinking by a third, 20% each.

Every shape is one million points, drawn live by Fractal Atlas, a free app for iPhone and iPad (the replay is the Play button on these shapes). The random numbers are seeded, so the jumps shown are the same on every run. The link is in my channel profile.`,
    posting: [
      "Upload the pure cut as the main Short. It fades to black and the Short loops back to the finished triangle that dissolves into the first jumps, so the loop is the hook. Use the end-card cut instead if you want the app's name on screen at the end; the card is 1.5 s of the " + card + " s.",
      "Shorts links are not clickable: put the App Store link in the channel profile (the pinned comment says so).",
      "The thumbnail is a frame from the video (Shorts use the video's own frame); `thumbnail.png` is the one picked: the four finished shapes with the last caption.",
      "The sound is self-made in ffmpeg (an open D drone, a soft pluck on every one of the first jumps whose pitch says which rule was used, a rising shimmer as each picture builds, and bells as each completes), so it carries no third-party licensing. `the-chaos-game-bed.m4a` is the bed alone if you want to remix it.",
      "I could not listen to the audio when making this; audition it before posting. The loudness and the timing of the plucks were measured, not heard.",
      "The three captions are in the picture (top of the frame, clear of the Shorts buttons at the bottom): \"Pick a corner at random. Jump halfway there.\", \"Four rules, picked at random: 1% · 85% · 7% · 7%\" and \"Random jumps. Simple rules.\"",
      "No claim is made about records or reach.",
    ],
  };
}
