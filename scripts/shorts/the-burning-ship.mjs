// Recipe: "The Burning Ship": a 5 minute (300 s) landscape YouTube video (1920x1080, 30 fps), a guided tour
// of the Burning Ship fractal rendered from the app itself. A long-form cousin of the Shorts
// (same engine, scripts/make-short.mjs; the recipe format is documented there). Picture and sound only:
// no text in the picture, the chapter list is in post.md (YouTube chapters).
//
// The tour (times in seconds; the camera is one continuous path of eased flights, slow pushes and two dives):
//   0   The whole ship        the whole fractal in the app's Fire palette, the Edge glow look dissolving into Relief
//   40  The mast              a flight up to the mast at the top right, the app's place "Stingray"
//                             (a small copy of the whole ship, turned the way the app lands it), in the Classic palette
//   72  The waterline         back across the sky to the left tip: "Armada", then "Burning Galleon"
//   118 Clipper, Needle Forest  the Glacier palette at "Clipper", the Twilight palette in "Needle Forest"
//   170 Ghost Ship to Twin Ships  a flight to "Ghost Ship", then a steady dive through "Lightning" into "Twin Ships" (Inferno)
//   210 The long dive        a dip to black, then ONE steady dive (equal factor per second) down to the
//                             app's place "Sunken Crown" (Fire again, the callback to the opening), the deepest frame
//                             exactly the app's own place
// The places and their coordinates are the app's (places.js); every depth figure in post.md comes from `facts`.
//
// Colors: each "look" is a palette + a color style from the app's Color sheet; a change of look is a dissolve,
// two shots blended (the engine's layers), placed in the flights between places.
// Sound: ffmpeg only (no files, no downloads): one open chord per chapter (A, D, Bm7, G, E, A: I IV ii bVII V I in A),
// crossfading over 8 s, a bell at each chapter's start, and a sparse music-box line in the two dives.

// ---------------------------------------------------------------- the places (places.js)
const P = {
  whole: { c: [-0.45, -0.6] },                      // FRACTAL_CONFIGS["Burn. Ship"].view, centered (scale 1.25 at 16:9)
  stingray: { c: [0.8774, -1.5198], rot: Math.PI - 2.5 },
  armada: { c: [-1.7595, -0.036] },
  galleon: { c: [-1.6268, -0.03] },
  clipper: { c: [-1.8605, -0.0035] },
  needle: { c: [-1.5099, -0.00115] },
  ghost: { c: [-1.941, -0.0038] },
  lightning: { c: [-1.93932, -0.00178] },
  twin: { c: [-1.9393403, -0.0017282] },
  crown: { c: [Number("-1.7490033572229"), Number("0.0000000000014")], scale: 1.2e-12 },
};
const K_END = P.crown.c[1] / P.crown.scale; // the crown's center sits this many half-heights below the real axis

// ---------------------------------------------------------------- the looks (palette + color style)
const LOOKS = {
  fireGlow: { palette: "Fire", style: "glow", density: 1 },
  fire: { palette: "Fire", style: "relief", density: 1 },
  classic: { palette: "Classic", style: "relief", density: 1 },
  glacier: { palette: "Glacier", style: "relief", density: 1 },
  twilight: { palette: "Twilight", style: "relief", density: 1 },
  inferno: { palette: "Inferno", style: "relief", density: 1 },
};
// [look, the second it starts to dissolve in, seconds the dissolve takes]
const LOOK_PLAN = [
  ["fireGlow", 0, 0], ["classic", 30, 12], ["glacier", 108, 8], ["twilight", 134, 8], ["inferno", 156, 10], ["fire", 205, 3],
];

// ---------------------------------------------------------------- the camera
const TOTAL = 300;
const END_T = TOTAL - 1 / 30; // the last frame (at 30 fps) is the dive's end exactly: the app's own place
const DIVE_FROM = 3e-7; // the long dive starts at this half-height
const DIVE_T = 210; // and at this second
// Waypoints: arrive at `t` (s) at center c, half-height s, rotation rot, by `kind`:
//   fly   an eased flight (van Wijk style: it pulls back to see both ends when they are far apart, and pans at a constant screen speed)
//   push  the same place, a slow eased push in
//   dive  a steady zoom (equal factor per second after the ramp-in) with the center following `via`, a function of ln(scale)
// a, b: the share of the segment spent ramping the speed up / down (the rest is at full speed)
const W = [
  { t: 0, c: P.whole.c, s: 1.7, rot: 0 },
  { t: 20, kind: "push", c: P.whole.c, s: 1.2, a: 0.3, b: 0.5 },
  { t: 40, kind: "fly", c: P.stingray.c, s: 0.04, rot: P.stingray.rot },
  { t: 52, kind: "push", c: P.stingray.c, s: 0.02, rot: P.stingray.rot },
  { t: 72, kind: "fly", c: P.armada.c, s: 0.068, rot: 0 },
  { t: 82, kind: "push", c: P.armada.c, s: 0.04 },
  { t: 94, kind: "fly", c: P.galleon.c, s: 0.05 },
  { t: 102, kind: "push", c: P.galleon.c, s: 0.03 },
  { t: 118, kind: "fly", c: P.clipper.c, s: 0.0045 },
  { t: 128, kind: "push", c: P.clipper.c, s: 0.0033 },
  { t: 144, kind: "fly", c: P.needle.c, s: 0.0018 },
  { t: 154, kind: "push", c: P.needle.c, s: 0.0008 },
  { t: 170, kind: "fly", c: P.ghost.c, s: 0.006 },
  // Ghost Ship, then Lightning, into Twin Ships: the center slides between the places as the zoom goes through them
  { t: DIVE_T - 6, kind: "dive", c: P.twin.c, s: 1.5e-5, a: 0.12, b: 0.15,
    via: [[0.006, P.ghost.c], [6e-4, P.lightning.c], [4.5e-5, P.twin.c], [1.5e-5, P.twin.c]] },
  // (from Twin Ships to the crown is 15 e-folds of zoom out and in: too fast to fly, so the picture dips to black
  // and comes up on the waterline again)
  { t: DIVE_T, kind: "cut", c: [P.crown.c[0], 0], s: DIVE_FROM },
  // The long dive: steady zoom down to Sunken Crown. The center keeps to the real axis until the picture is
  // small enough, then the axis rises to the top of the frame (the way the app's place is framed), so the last
  // frame is the place itself.
  { t: END_T, kind: "dive", c: P.crown.c, s: P.crown.scale, a: 0.1, b: 0,
    via: (L) => {
      const u = Math.min(1, Math.max(0, (Math.log(1e-7) - L) / (Math.log(1e-7) - Math.log(P.crown.scale))));
      // (before 1e-7 the center is on the axis: u is 0)
      const k = K_END * u * u * (3 - 2 * u);
      return [P.crown.c[0], k * Math.exp(L)];
    } },
];

const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;

// The share of a segment's way covered at share u of its time, with a ramp up over the first a and down over the last b.
function progress(u, a, b) {
  const total = 1 - (a + b) / 2;
  let area;
  if (a > 0 && u < a) area = u * u / (2 * a);
  else if (b === 0 || u <= 1 - b) area = a / 2 + (u - a);
  else { const w = 1 - u; area = a / 2 + (1 - b - a) + (b / 2 - w * w / (2 * b)); }
  return area / total;
}

// A flight's shape: the zoom goes from one end's to the other's, pulling back when the ends are far apart, and the
// center moves at a constant speed on the screen (its speed in the plane is proportional to the scale, so the
// progress along the line is the integral of the scale: most of the pan happens while pulled back).
function prepareFly(A, B) {
  const LA = Math.log(A.s), LB = Math.log(B.s);
  const dist = Math.hypot(B.c[0] - A.c[0], B.c[1] - A.c[1]);
  const extra = dist > 0 ? Math.max(0, Math.log(dist * 0.6) - (LA + LB) / 2) : 0;
  const L = (s) => lerp(LA, LB, s) + extra * Math.sin(Math.PI * s) ** 2;
  const n = 400, tab = [0];
  for (let i = 1; i <= n; i++) tab.push(tab[i - 1] + (Math.exp(L((i - 0.5) / n)) / n));
  const total = tab[n];
  const pan = (s) => { const x = s * n, i = Math.min(n - 1, Math.floor(x)); return (lerp(tab[i], tab[i + 1], x - i)) / total; };
  return { L, pan };
}

function makePath() {
  const segs = [];
  for (let j = 1; j < W.length; j++) {
    const A = { ...W[j - 1] }, B = W[j];
    A.rot ??= 0;
    const seg = { t0: A.t, t1: B.t, kind: B.kind, A, B, a: B.a ?? 0.35, b: B.b ?? 0.35 };
    if (B.kind === "fly") seg.fly = prepareFly(A, B);
    W[j].rot ??= A.rot; // a rotation carries on until a waypoint changes it
    segs.push(seg);
  }
  const lookAt = (t) => {
    let k = 0;
    for (let i = 0; i < LOOK_PLAN.length; i++) if (t >= LOOK_PLAN[i][1]) k = i;
    const [name, t0, dur] = LOOK_PLAN[k];
    const w = dur > 0 ? smooth((t - t0) / dur) : 1;
    if (k === 0 || w >= 0.998) return [{ ...LOOKS[name] }];
    return [{ ...LOOKS[LOOK_PLAN[k - 1][0]] }, { ...LOOKS[name], weight: w }];
  };
  return (t) => {
    t = Math.min(TOTAL, Math.max(0, t));
    const seg = segs.find((g) => t <= g.t1) ?? segs[segs.length - 1];
    const s = progress((t - seg.t0) / (seg.t1 - seg.t0), seg.a, seg.b);
    const { A, B } = seg;
    const LA = Math.log(A.s), LB = Math.log(B.s);
    let L, c, dim = 0, rot = lerp(A.rot, B.rot, s);
    if (seg.kind === "cut") { // a dip to black: A keeps creeping in while it dims, B comes up creeping in
      const u = (t - seg.t0) / (seg.t1 - seg.t0);
      if (u < 0.5) { L = LA - 0.05 * u * 2; c = A.c; dim = smooth(u * 2); rot = A.rot; }
      else { L = LB + 0.05 * (1 - (u - 0.5) * 2); c = B.c; dim = 1 - smooth((u - 0.5) * 2); rot = B.rot; }
    } else if (seg.kind === "fly") {
      L = seg.fly.L(s);
      const p = seg.fly.pan(s);
      c = [lerp(A.c[0], B.c[0], p), lerp(A.c[1], B.c[1], p)];
    } else if (seg.kind === "dive") {
      L = lerp(LA, LB, s);
      if (typeof B.via === "function") c = B.via(L);
      else { // piecewise between the via points (scale, center), smoothed in ln(scale)
        const v = B.via;
        let j = 0;
        while (j < v.length - 2 && L < Math.log(v[j + 1][0])) j++;
        const La = Math.log(v[j][0]), Lb = Math.log(v[j + 1][0]);
        const q = smooth((La - L) / (La - Lb));
        c = [lerp(v[j][1][0], v[j + 1][1][0], q), lerp(v[j][1][1], v[j + 1][1][1], q)];
      }
    } else { // push
      L = lerp(LA, LB, s);
      c = [lerp(A.c[0], B.c[0], s), lerp(A.c[1], B.c[1], s)];
    }
    return { t, scale: Math.exp(L), cx: c[0], cy: c[1], offset: 0, rotation: rot, dim, layers: lookAt(t) };
  };
}

// ---------------------------------------------------------------- the chapters (YouTube chapters in post.md)
const CHAPTERS = [
  [0, "The whole ship"],
  [40, "The mast"],
  [72, "The waterline"],
  [118, "Clipper and Needle Forest"],
  [170, "Ghost Ship to Twin Ships"],
  [DIVE_T, "The long dive to Sunken Crown"],
];
const stamp = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ---------------------------------------------------------------- the sound
// Six chords, one per chapter, each a drone (the Shorts' recipe: detuned sine pairs, slow tremolo and phase drift, a
// low-passed noise breath, a soft echo), crossfading over 8 s at the chapters' boundaries; a bell at each chapter start;
// a quiet music-box line (a pentatonic scale of the chord) in the two dives. 303 s master (the cuts trim and fade it).
const CHORDS = [
  [[55, 0.30], [110, 0.22], [164.81, 0.15], [220, 0.12], [277.18, 0.08], [329.63, 0.05]],            // A
  [[73.42, 0.30], [110, 0.22], [164.81, 0.14], [185, 0.12], [220, 0.09], [293.66, 0.06]],             // Dmaj9
  [[61.74, 0.30], [123.47, 0.22], [146.83, 0.15], [185, 0.12], [220, 0.08], [246.94, 0.06]],          // Bm7
  [[98, 0.30], [146.83, 0.22], [220, 0.13], [246.94, 0.12], [293.66, 0.09], [392, 0.05]],             // G add9
  [[82.41, 0.30], [123.47, 0.22], [164.81, 0.15], [207.65, 0.12], [246.94, 0.08], [369.99, 0.05]],    // E
  [[55, 0.30], [110, 0.22], [164.81, 0.16], [220, 0.13], [277.18, 0.10], [329.63, 0.08], [440, 0.05]], // A, the last one fuller
];
const BOUNDS = CHAPTERS.map(([t]) => t).concat([TOTAL + 3]);
const XF = 8;
const sm = (x) => `(pow(clip(${x},0,1),2)*(3-2*clip(${x},0,1)))`;
const droneLayers = CHORDS.map((notes, i) => {
  const a = BOUNDS[i], b = BOUNDS[i + 1];
  const fin = i === 0 ? `(0.5+0.5*${sm("t/6")})` : sm(`(t-${a - XF / 2})/${XF}`);
  const fout = i === CHORDS.length - 1 ? "1" : `(1-${sm(`(t-${b - XF / 2})/${XF}`)})`;
  const breathe = `(1+0.06*sin(2*PI*t/19+${i}))`;
  return {
    type: "drone", notes,
    detune: [0.05, 0.02], tremolo: [0.04 + i * 0.002, 0.013], drift: [0.6, 0.2, 0.021, 0.007],
    noise: "lowpass=f=500,highpass=f=80,tremolo=f=0.1:d=0.6,volume=0.12",
    post: "lowpass=f=1300,aecho=0.8:0.85:140|290:0.4|0.25",
    swell: `${fin}*${fout}*${breathe}`,
  };
});
const BELLS = [
  { at: 0.3, freq: 659.25 }, { at: 40, freq: 739.99 }, { at: 72, freq: 587.33 }, { at: 118, freq: 987.77 },
  { at: 170, freq: 830.61 }, { at: DIVE_T, freq: 880 }, { at: DIVE_T + 0.6, freq: 1318.5, gain: 0.6 },
].map((s) => ({ ...s, detune: 1.002 }));
// music box: a slow line in the dives (E pentatonic in the first, A pentatonic ascending in the last)
const pluckEvents = [];
{
  const E5 = [659.25, 739.99, 830.61, 987.77, 1108.73], pat1 = [0, 2, 3, 2, 1, 3, 4, 3];
  for (let k = 0; 176 + k * 4.2 < 206; k++) pluckEvents.push({ t: Math.round((176 + k * 4.2) * 1000) / 1000, hz: E5[pat1[k % pat1.length]], gain: 0.5 + 0.02 * k, pan: k % 2 ? 0.45 : -0.45 });
  const A5 = [440, 554.37, 659.25, 739.99, 880, 1108.73], pat2 = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 5];
  for (let k = 0; 216 + k * 3.6 < 296; k++) pluckEvents.push({ t: Math.round((216 + k * 3.6) * 1000) / 1000, hz: A5[pat2[k % pat2.length]], gain: Math.min(1, 0.5 + 0.015 * k), pan: k % 2 ? 0.5 : -0.5 });
}
const AUDIO = {
  seconds: TOTAL + 3,
  targetLufs: -16,
  limiter: 0.7,
  layers: [
    ...droneLayers,
    { type: "bell", gain: 0.45, length: 14, partials: [[1, 1, 5.0], [0.5, 0.5, 7.0], [2.0, 0.55, 3.2], [2.76, 0.4, 2.2], [5.4, 0.18, 1.2], [8.93, 0.08, 0.7]], strikes: BELLS },
    { type: "plucks", gain: 0.5, echo: "aecho=0.7:0.6:260|470:0.28|0.18",
      voice: { partials: [[1, 1, 0.55], [2, 0.3, 0.3], [3.01, 0.1, 0.16], [4.2, 0.03, 0.1]], attack: 0.004, length: 2.2 },
      events: pluckEvents },
  ],
};

// ---------------------------------------------------------------- the post
// (numbers hand-checked against `facts`: see the notes in post.md)
const POST = {
  notes: "Files: `the-burning-ship-pure.mp4` (the video, 5:00, 1920x1080, 30 fps; fades in and out), `the-burning-ship-endcard.mp4` (the same plus a 3 s \"Fractal Atlas, free for iPhone and iPad\" card), `the-burning-ship-bed.m4a` (the sound bed alone), `thumbnail.png` (a frame of the picture, 1920x1080, no text).",
  titles: [
    "The Burning Ship Fractal: A Guided Tour, Down to a Trillion Times Deeper",
    "Burning Ship Fractal Zoom: Five Minutes Across the Whole Ship",
    "Inside the Burning Ship Fractal: Masts, an Armada and a Trillion-Fold Dive",
  ],
  titleNote: "(Options 1 and 3 use the app's own phrase for the deepest frame, \"1 trillion times deeper\" than its opening view; the exact ratio from `facts` is 1.04 trillion. Option 2 makes no number claim.)",
  linkNote: "(A regular video's description links are clickable, but there is no single link to paste: say \"free app Fractal Atlas for iPhone and iPad\" as below and keep the App Store link in the channel profile.)",
  description: `A five-minute guided tour of the Burning Ship fractal, rendered frame by frame in the free app Fractal Atlas for iPhone and iPad. Every picture in this video comes from the app; the sound is synthesized.

The Burning Ship is built like the Mandelbrot set, with one change. For each point c, start at 0 and repeat z -> z squared + c, but before squaring, take the absolute value of the real part and of the imaginary part of z. That single fold makes sharp masts and hulls where the Mandelbrot set has round bulbs. Black points never escaped within the app's step limit; the colors count how quickly everything else did. The app raises that limit as you zoom: 300 steps in the opening view, 2,000 at the deepest frame here.

What you see, in order:
- The whole ship, in the app's Fire palette with the Edge glow look. The app draws it upright, with the masts above the hull.
- Up to the mast at the top right, to a small copy of the whole ship (the app's place "Stingray"), in the Classic palette.
- Back across the sky to the left, to the app's places "Armada" and "Burning Galleon": towers rising from the waterline, with smaller ships along it.
- "Clipper" in the Glacier palette, then "Needle Forest" in the Twilight palette.
- "Ghost Ship", then a steady dive through "Lightning" into "Twin Ships", in the Inferno palette. Twin Ships is about 83 thousand times deeper than the app's opening view.
- The last minute and a half is one long dive down to "Sunken Crown", the app's deepest place on the Burning Ship. The zoom rate is constant after a short ramp-up: 1.16 times closer every second. The last frame is about 1 trillion times deeper than the app's opening view; that depth needs perturbation theory (one reference orbit at high precision, every pixel a small offset from it).

Chapters
${CHAPTERS.map(([t, name]) => `${stamp(t)} ${name}`).join("\n")}

Explore the Burning Ship and dozens of other fractals yourself in the free app Fractal Atlas for iPhone and iPad.`,
  hashtags: "#burningship #fractals #mathart #zoom",
  chapters: CHAPTERS.map(([t, name]) => `${stamp(t)} ${name}`),
  pinned: `What you are seeing: the Burning Ship fractal, toured and then zoomed about 1 trillion times past the app's opening view. It is the Mandelbrot iteration with one change: take the absolute value of the real and imaginary parts of z before squaring. That fold is what makes the masts, hulls and small ships. The places are the app's own: Stingray, Armada, Burning Galleon, Clipper, Needle Forest, Ghost Ship, Lightning, Twin Ships and Sunken Crown.

Made with Fractal Atlas, a free app for iPhone and iPad where you can fly to these places and zoom anywhere yourself. The App Store link is in my channel profile.`,
  posting: [
    "Upload `the-burning-ship-pure.mp4` (it fades in from black and out to black). `the-burning-ship-endcard.mp4` adds a 3 s \"Fractal Atlas, free for iPhone and iPad\" card after the fade; use it only if you want the app's name on screen at the end.",
    "The chapter list above is in YouTube's format (first stamp 0:00, each chapter at least 10 s): paste it at the end of the description and the timeline gets chapters. The title options and the description are drafts to edit.",
    "The thumbnail (`thumbnail.png`, 1920x1080) is a plain frame from the video's opening shot with no text; add a title in an editor if you want one.",
    "The sound is self-made in ffmpeg (an open chord per chapter, A, D, Bm7, G, E, A, crossfading; a bell at each chapter's start; a quiet music-box line in the two dives), so it carries no third-party licensing. `the-burning-ship-bed.m4a` is the bed alone if you want to swap it.",
    "I could not listen to the audio when making this; audition it before posting. Its loudness was measured (-16 LUFS integrated, true peak -2.9 dBTP, levels within a few dB of each other across the five minutes), not heard. YouTube's own loudness normalization applies on top.",
    "The long dive's picture: for its first part the upper half of the frame is the streaky texture above the real axis (the dive's center sits on the axis until the picture is small), then the crown's spirals fill the frame. The last frame is exactly the app's Sunken Crown place (half-height 1.2e-12 and its 13-digit center), the deepest Burning Ship place in the app's places list.",
    "No claim is made about records or reach.",
  ],
};

export default {
  id: "the-burning-ship",
  title: "The Burning Ship",
  stem: "the-burning-ship",
  outDir: "~/Movies/fractal-atlas-shorts/the-burning-ship",
  fps: 30,
  size: [1920, 1080],
  seconds: TOTAL,
  fadeIn: 1.5, fadeOut: 3.0, cardFade: 0.8, cardHold: 3.0,
  thumbAt: 10,
  renderer: {
    type: "dive",
    fractal: "Burn. Ship",
    path: makePath,
    plan: {
      header: "frame,t,scale,log10_scale,cx,cy,rotation,looks",
      row: (i, s) => [i, s.t.toFixed(3), s.scale.toExponential(4), Math.log10(s.scale).toFixed(4), s.cx.toFixed(13), s.cy.toFixed(13), s.rotation.toFixed(4),
        s.layers.map((l) => `${l.palette}/${l.style}${l.weight ? `@${l.weight.toFixed(2)}` : ""}`).join("+")].join(","),
    },
    // What the app itself says about each place's depth (its own zoomPhrase, from the opening view's scale), for the post.
    async facts({ page, path, N, W: width, H, FPS }) {
      const marks = [["opening", 0], ["whole", 22], ["stingray", 52], ["armada", 72], ["galleon", 94], ["clipper", 118], ["needle", 144], ["ghost", 170], ["twinEnd", DIVE_T - 6], ["dive start", DIVE_T], ["last", (N - 1) / FPS]];
      const base = await page.evaluate("mainState.baseScale");
      const rows = [];
      for (const [name, t] of marks) {
        const s = path(t);
        rows.push({ name, t, scale: s.scale, phrase: await page.evaluate(`zoomPhrase(mainState.baseScale, ${s.scale})`), autoIter: await page.evaluate(`suggestedMaxIter(mainState.baseScale, ${s.scale})`) });
      }
      const last = path((N - 1) / FPS), start = path(DIVE_T), a = 0.1; // the final dive's ramp-in share
      const efolds = Math.log(start.scale / last.scale), cruiseSeconds = (END_T - DIVE_T) * (1 - a / 2);
      return {
        size: `${width}x${H}`, baseScale: base, deepThreshold: await page.evaluate("DEEP_ZOOM_THRESHOLD"),
        rows, lastScale: last.scale, lastCenter: [last.cx, last.cy],
        zoomVsAppOpeningView: base / last.scale,
        finalDive: { from: start.scale, to: last.scale, seconds: END_T - DIVE_T, factorPerSecond: Math.exp(efolds / cruiseSeconds), secondsPerDecade: cruiseSeconds / (efolds / Math.LN10), decades: efolds / Math.LN10 },
        crownPlace: { scale: P.crown.scale, cx: P.crown.c[0], cy: P.crown.c[1] },
      };
    },
  },
  audio: AUDIO,
  post: POST,
  chapters: CHAPTERS.map(([t, name]) => `${stamp(t)} ${name}`),
};
