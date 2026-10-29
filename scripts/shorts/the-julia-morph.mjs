// Recipe: "The Julia Morph": a 52 s seamless-loop Short (1080x1920, 30 fps) in the app's own dual view:
// the Mandelbrot set on top, and under it the Julia set of the point at the top pane's center (the
// crosshair). The camera glides the crosshair, so c travels through some of the set's famous places
// and the Julia set below morphs with it; a readout names c as it goes.
// (The recipe format is documented in scripts/make-short.mjs; the renderer is "dive".)
//
//   the path    c glides through the waypoints below and ends back at c = 0 (a circle), so the Short loops;
//               the top pane zooms in near each place and out again, as a user would
//   the picture the app's Relief look in the pastel palette, the Color sheet's shift going round twice
//   the page    pageSetup opens the dual view as the app does (the dual button), hides the toolbar and the
//               info card, keeps the crosshair, and draws one readout of c (the app's own formatHudCoords)
//   the sound   a synthesized drone (no third-party music), folded so its end runs into its start
import { loopPosting } from "./loop-dive.mjs";

const PASTEL = { name: "Pastel Cycle", stops: [[0, 176, 150, 210], [0.1667, 236, 170, 200], [0.3333, 240, 222, 190], [0.5, 170, 220, 180], [0.6667, 140, 214, 210], [0.8333, 150, 175, 230], [1, 176, 150, 210]] };

const SECONDS = 52;
const TURNS = 2; // trips round the palette (a whole number, so the colors close the loop)

// [t seconds, Re c, Im c, half-height of the top pane, what it is]
const WAYPOINTS = [
  [0, 0, 0, 1.5, "c = 0: a circle"],
  [6, -0.1226, 0.7449, 0.3, "the Douady rabbit"],
  [12, 0, 1, 0.35, "c = i: a dendrite"],
  [18, -0.4, 0.6, 0.4, ""],
  [24, -0.75, 0.11, 0.12, "the neck of Seahorse Valley"],
  [31, -0.7436, 0.1318, 0.015, "a seahorse's tail"],
  [38, 0.285, 0.013, 0.05, "next to the cusp"],
  [45, -1.7549, 0, 0.03, "the airplane: period 3"],
  [SECONDS, 0, 0, 1.5, "c = 0: a circle"],
];

const smooth = (u) => u * u * (3 - 2 * u);

function makePath() {
  return (t) => {
    let k = WAYPOINTS.findIndex((_, i) => i < WAYPOINTS.length - 1 && t < WAYPOINTS[i + 1][0]);
    if (k < 0) k = WAYPOINTS.length - 2;
    const [t0, x0, y0, s0] = WAYPOINTS[k], [t1, x1, y1, s1] = WAYPOINTS[k + 1];
    const u0 = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const u = 0.5 * (u0 + smooth(u0)); // slows at each place, does not stop
    return {
      t, cx: x0 + (x1 - x0) * u, cy: y0 + (y1 - y0) * u,
      scale: Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * u),
      offset: TURNS * t / SECONDS % 1, rotation: 0,
      layers: [{ style: "relief", density: 0.6 }],
    };
  };
}

// Run once in the page after the palette is picked.
const pageSetup = `(() => {
  const css = document.createElement("style");
  css.textContent = \`
    #crosshair { display: block !important; }
    #cReadout { position: fixed; z-index: 50; left: 50%; top: 14px; transform: translateX(-50%); pointer-events: none;
      padding: 7px 16px 8px; border-radius: 14px; background: rgba(20,20,22,0.62); white-space: nowrap;
      -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
      box-shadow: 0 0 0 0.5px rgba(255,255,255,0.14); color: #fff; text-align: center;
      font: italic 1.45rem/1.15 "Iowan Old Style", "Palatino", Georgia, serif; }
    #cReadout small { display: block; font: 0.7rem/1.3 -apple-system, system-ui, sans-serif; opacity: 0.65; letter-spacing: 0.04em; }
  \`;
  document.head.appendChild(css);
  els.dualBtn.click();
  window.dispatchEvent(new Event("resize"));
  hudVisible = true; // the Julia pane's label shows with the info card (the card itself is hidden above)
  Object.assign(juliaState, { cx: 0, cy: 0, scale: 1.6, baseScale: 1.6, rotation: 0, maxIter: 400, iterAutoLocked: true });
  const box = document.createElement("div");
  box.id = "cReadout";
  document.body.appendChild(box);
  const upd = () => {
    const f = formatHudCoords(mainState.cx, mainState.cy, mainState.scale);
    const text = "c = " + f.center.replace(/-/g, "\\u2212");
    if (box.dataset.t !== text) { box.dataset.t = text; box.innerHTML = text + "<small>the Julia set below is made from this point</small>"; }
    requestAnimationFrame(upd);
  };
  upd();
  requestRender();
})()`;

const AUDIO = {
  targetLufs: -15, limiter: 0.7,
  seconds: SECONDS + 7,
  layers: [{
    type: "drone",
    notes: [[73.42, 0.30], [110, 0.22], [146.83, 0.15], [220, 0.12], [293.66, 0.08], [349.23, 0.05]], // D, A, D, A, D, F: an open Dm chord
    detune: [0.05, 0.02], tremolo: [0.04, 0.013], drift: [0.6, 0.2, 0.021, 0.007],
    noise: "lowpass=f=500,highpass=f=80,tremolo=f=0.1:d=0.6,volume=0.18",
    post: "lowpass=f=1300,aecho=0.8:0.85:140|290:0.4|0.25",
    swell: "1",
  }],
};

export default {
  id: "the-julia-morph",
  title: "The Julia Morph",
  stem: "the-julia-morph",
  outDir: "~/Movies/fractal-atlas-shorts/the-julia-morph",
  fps: 30, size: [1080, 1920], seconds: SECONDS,
  fadeOut: 0, cardFade: 0.6, cardHold: 1.5, loopAudio: 3,
  thumbAt: 8,
  renderer: {
    type: "dive",
    fractal: "Mandelbrot",
    dsf: 2,
    palette: PASTEL,
    pageSetup,
    path: makePath,
    plan: { header: "frame,t,re,im,scale", row: (i, s) => [i, s.t.toFixed(3), s.cx.toFixed(5), s.cy.toFixed(5), s.scale.toExponential(3)].join(",") },
    facts: async () => ({ seconds: SECONDS, waypoints: WAYPOINTS.length, turns: TURNS }),
  },
  audio: AUDIO,
  post: () => ({
    notes: "Files: `the-julia-morph-pure.mp4` (52 s, no fade; the primary cut, a seamless loop), `the-julia-morph-endcard.mp4` (the same plus a 1.5 s app card, not a loop), `the-julia-morph-bed.m4a` (the sound bed alone), `thumbnail.png`.",
    titles: [
      "Julia Set Morphing in Real Time as You Move Through the Mandelbrot Set",
      "Every Point of the Mandelbrot Set Makes a Different Julia Set (Live in an App)",
      "Julia Set Morph: Watch the Shape Change With c",
    ],
    titleNote: "(No number claims in any title.)",
    description: `Every point c of the Mandelbrot set has its own Julia set. In the free app Fractal Atlas the two sit one above the other: whatever is at the center of the Mandelbrot set (the ring) is the c of the Julia set below it, so as you glide the center the Julia set morphs live. Here the center passes the Douady rabbit, the dendrite at c = i, a seahorse's tail in Seahorse Valley, the cusp of the heart-shaped cardioid and the airplane, and ends where it began (c = 0, a circle) so the video loops.

The coordinates at the top are the real c at each moment. Where c is inside the set, its Julia set is one connected piece; where c is outside, it falls apart into dust.

Explore it yourself in the free app Fractal Atlas for iPhone and iPad: tap the dual-view button, then drag the Mandelbrot set.`,
    hashtags: "#julia #mandelbrot #fractals #shorts",
    pinned: "What you are seeing: the Mandelbrot set (top) with a ring at its center, and the Julia set of that exact point c (bottom). The readout at the top is c. Made in Fractal Atlas, a free app for iPhone and iPad: tap the dual-view button and drag. The link is in my channel profile.",
    posting: loopPosting("the-julia-morph"),
  }),
};
