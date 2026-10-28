// Recipe: "The Infinite": a 58 s vertical YouTube Short (1080x1920, 30 fps) of one
// long steady zoom into the Mandelbrot set, rendered from the app itself.
// (The recipe format is documented in scripts/make-short.mjs.)
//
// The picture, beat by beat (what the rival Short does, with our own picture):
//   0.0 s   bright pastel concentric bands around the whole Mandelbrot set,
//           small and centered, already zooming (the Bands look)
//   0.5-3 s the bands dissolve into the Relief look as the set grows to its
//           full silhouette and the cardioid and the period-2 bulb fill the frame
//   3-13 s  the view narrows into the gap between them (near -0.75), rises
//           through it into Seahorse Valley, and settles on Spiral Cluster, the
//           Misiurewicz point M(28,2) at the eye of a spiral (places.js)
//   3.6 s-end  ONE steady dive at a constant zoom rate (equal factor per
//           second in log scale) straight down the spiral's eye, a seamlessly
//           self-similar picture all the way, to the deepest view (about 2e-12,
//           inside the perturbation path's 1e13 limit)
//   color   the Relief look in a pastel cyclic palette (defined below), the
//           Color sheet's `shift` (colorStyle.offset) driven round once per
//           14.5 s, four turns, ending on the color it began with
//   end     the pure cut fades to black over the last 2 s; the end-card cut
//           lets a "Fractal Atlas, free for iPhone and iPad" card in over the
//           last 0.6 s and holds it 1.5 s
//   sound   a drone of an open A chord with a noise breath, a swell that opens
//           with the picture, and one bell strike at t = 0

// ---------------------------------------------------------------- the design

// The eye of Spiral Cluster (places.js): the Misiurewicz point M(28,2).
const TARGET = { cx: Number("-0.7451580638016195553"), cy: Number("0.1125749162054165212") };
// The view starts on the neck between the main cardioid and the period-2 bulb.
const START = { cx: -0.75, cy: 0 };
// A cyclic pastel palette (purple, pink, beige, green, teal, blue, purple): the
// app's own palettes are darker; the first stop equals the last so the shift
// wraps with no seam. It is added to the page's palette list at run time.
const PASTEL = { name: "Pastel Cycle", stops: [[0, 176, 150, 210], [0.1667, 236, 170, 200], [0.3333, 240, 222, 190], [0.5, 170, 220, 180], [0.6667, 140, 214, 210], [0.8333, 150, 175, 230], [1, 176, 150, 210]] };

const D = {
  scale0: 10,        // half-height at frame 0: the whole set small and centered
  scaleKnot: 3.4, tKnot: 1.5,   // the full silhouette at 1.5 s
  scaleCruise: 0.5, tCruise: 3.6, // the cardioid and bulb fill the frame; from here the zoom rate is constant
  scaleEnd: 2e-12,   // the deepest half-height, at the last frame
  d0: -0.55, dKnot: -1.0, // zoom speeds (d ln scale / dt) at the first two knots
  homeFrom: 2.0, homeTo: 0.02,  // the center slides from the neck to the eye as the scale goes from homeFrom to homeTo
  cyclePeriod: 14.5, // seconds per trip round the palette (4 trips in 58 s)
  reliefDensity: 0.4,  // the Color sheet's Repeat, in the Relief look
  bandsOut: [0.5, 2.4], // seconds: the Bands layer's dissolve into Relief
  bandsDensity0: 8, bandsDensity1: 1, // Repeat of the Bands layer at scale0 and at scaleCruise
};

const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
const hermite = (p0, p1, m0, m1, h, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1;
};

function makePath(seconds) {
  const L0 = Math.log(D.scale0), LK = Math.log(D.scaleKnot), LC = Math.log(D.scaleCruise), LE = Math.log(D.scaleEnd);
  const v = (LC - LE) / (seconds - D.tCruise); // the cruise's zoom rate, e-folds per second
  const logScale = (t) => {
    if (t >= D.tCruise) return LC - v * (t - D.tCruise);
    if (t >= D.tKnot) return hermite(LK, LC, D.dKnot, -v, D.tCruise - D.tKnot, (t - D.tKnot) / (D.tCruise - D.tKnot));
    return hermite(L0, LK, D.d0, D.dKnot, D.tKnot, t / D.tKnot);
  };
  return (t) => {
    const L = logScale(t);
    const scale = Math.exp(L);
    // The center slides from the neck to the eye, smoothly, as the zoom closes in.
    const p = smooth((Math.log(D.homeFrom) - L) / (Math.log(D.homeFrom) - Math.log(D.homeTo)));
    const wb = 1 - smooth((t - D.bandsOut[0]) / (D.bandsOut[1] - D.bandsOut[0]));
    const bandsDensity = Math.exp(Math.log(D.bandsDensity1) + (Math.log(D.bandsDensity0) - Math.log(D.bandsDensity1)) * Math.min(1, Math.max(0, (L - LC) / (L0 - LC))));
    return {
      t, scale, rate: v,
      cx: START.cx + (TARGET.cx - START.cx) * p,
      cy: START.cy + (TARGET.cy - START.cy) * p,
      offset: ((t / D.cyclePeriod) % 1 + 1) % 1,
      bandsWeight: wb, bandsDensity,
      // The Relief picture; while the Bands layer is still dissolving, a second shot with the
      // Bands look is blended in over it.
      layers: [{ style: "relief", density: D.reliefDensity }, { style: "bands", density: bandsDensity, weight: wb }],
    };
  };
}

// ---------------------------------------------------------------- the sound

// 60 s master (the cuts trim and fade it): a drone of an open A chord (each note a pair of
// slightly detuned sines, left and right a hair apart, with its own slow tremolo and a slow
// phase drift) with a low-passed pink-noise breath; a swell that opens with the picture (up
// over the first 4.5 s, breathing once per palette trip after that); a low-pass, a soft echo;
// and one bell strike at t = 0 (an exponentially decaying sine with inharmonic partials).
const AUDIO = {
  seconds: 60,
  targetLufs: -15,
  limiter: 0.7,
  layers: [
    {
      type: "drone",
      notes: [[55, 0.30], [110, 0.22], [164.81, 0.15], [220, 0.12], [277.18, 0.08], [329.63, 0.05]], // [Hz, amplitude]
      detune: [0.05, 0.02], tremolo: [0.04, 0.013], drift: [0.6, 0.2, 0.021, 0.007],
      noise: "lowpass=f=500,highpass=f=80,tremolo=f=0.1:d=0.6,volume=0.18",
      post: "lowpass=f=1300,aecho=0.8:0.85:140|290:0.4|0.25",
      swell: `(0.55+0.45*(3*pow(min(t/4.5,1),2)-2*pow(min(t/4.5,1),3)))*(1+0.07*sin(2*PI*t/${D.cyclePeriod}))`,
    },
    {
      type: "bell", gain: 0.55,
      partials: [[1, 1, 5.0], [0.5, 0.5, 7.0], [2.0, 0.55, 3.2], [2.76, 0.4, 2.2], [5.4, 0.18, 1.2], [8.93, 0.08, 0.7]], // [ratio, amplitude, decay seconds]
      strikes: [{ at: 0, freq: 659.25, detune: 1.002 }],
    },
  ],
};

// ---------------------------------------------------------------- the post
// (numbers hand-checked against `facts`; the text of the first Short's post.md)
const POST = {
  notes: "Files: `the-infinite-pure.mp4` (58.0 s, fades to black; the primary cut), `the-infinite-endcard.mp4` (59.5 s, the same picture and sound, then a 1.5 s \"Fractal Atlas, free for iPhone and iPad\" card), `the-infinite-bed.m4a` (the sound bed alone, so you can swap it), `thumbnail.png`.",
  titles: [
    "Mandelbrot Set Zoom: One Steady Dive, Over a Trillion Times Deeper",
    "Zooming Into a Mandelbrot Spiral, 1.2 Trillion Times Deeper",
    "One Continuous Mandelbrot Zoom Into a Self-Similar Spiral",
  ],
  titleNote: "(Option 1 and 2 use the app's own figure for the deepest frame: 1.2 trillion times deeper than the app's opening view of the whole set. Option 3 makes no number claim.)",
  description: `One continuous zoom into the Mandelbrot set, rendered frame by frame in the free app Fractal Atlas.

The set is every complex number c for which z squared + c, repeated, never escapes to infinity. Black did not escape within the app's step limit (up to 2,000 here); the colors count how fast the rest did.

The dive slips through the narrow gap between the heart-shaped cardioid and the round bulb beside it (near -0.75), rises through the region around Seahorse Valley, then goes straight down the eye of a spiral. That point is a Misiurewicz point, where the set repeats its shape at every scale. From 3.6 seconds on the zoom rate never changes: 1.62 times closer every second.

The last frame is about 2 trillionths of a unit wide (the whole set is about 2.5 wide): 1.2 trillion times deeper than the app's opening view. That depth needs perturbation theory: one reference point at high precision, every pixel a small offset from it.

Explore the Mandelbrot set yourself with the free app Fractal Atlas, for iPhone and iPad.`,
  hashtags: "#mandelbrot #fractals #shorts",
  pinned: `What you are seeing: the Mandelbrot set, zoomed about 1.2 trillion times past the app's opening view, in one steady dive (1.62x closer every second). The black shapes are points that never escape; the colors count how quickly the rest do. The spiral at the center is a Misiurewicz point, where the set repeats itself at every scale, so the picture stays alive however deep you go.

Made with Fractal Atlas, a free app for iPhone and iPad where you can pan and zoom the Mandelbrot set and many other fractals yourself. The link is in my channel profile.`,
  posting: [
    "Upload the pure cut as the main Short. It ends on black, and Shorts replay automatically, so the loop returns to the opening bell and the bright rings. Use the end-card cut instead if you want the app's name on screen at the end; the card is 1.5 s of the 59.5 s.",
    "Shorts links are not clickable: put the App Store link in the channel profile (and the pinned comment says so).",
    "The thumbnail is a frame from the video (Shorts use the video's own frame); `thumbnail.png` is the one picked.",
    "The sound is self-made (synthesized drone plus one bell strike), so it carries no third-party licensing. If you swap in other music, make sure you have the rights to it or use a track from YouTube's own audio library. `the-infinite-bed.m4a` is the original bed if you want to remix it.",
    "I could not listen to the audio when making this; audition it before posting.",
    "No claim is made about records or reach.",
  ],
};

export default {
  id: "the-infinite",
  title: "The Infinite",
  stem: "the-infinite",
  outDir: "~/Movies/fractal-atlas-shorts/the-infinite",
  fps: 30,
  size: [1080, 1920],
  seconds: 58,
  fadeOut: 2.0, cardFade: 0.6, cardHold: 1.5,
  thumbAt: 24,
  renderer: {
    type: "dive",
    fractal: "Mandelbrot",
    palette: PASTEL,
    path: makePath,
    plan: {
      header: "frame,t,scale,log_scale,cx,cy,offset,bands_weight,bands_density",
      row: (i, s) => [i, s.t.toFixed(3), s.scale.toExponential(4), Math.log(s.scale).toFixed(5), s.cx.toFixed(12), s.cy.toFixed(12), s.offset.toFixed(4), s.bandsWeight.toFixed(3), s.bandsDensity.toFixed(2)].join(","),
    },
    // What the app itself says about the deepest frame (zoom factor, iterations), for the post.
    async facts({ page, path, N, W, H, FPS }) {
      const first = path(0), last = path((N - 1) / FPS);
      const f = await page.evaluate(`(() => {
        const base = mainState.baseScale;
        return {
          baseScale: base, deepThreshold: DEEP_ZOOM_THRESHOLD,
          zoomPhrase: zoomPhrase(base, ${last.scale}),
          autoIter: suggestedMaxIter(base, ${last.scale}),
          firstScale: ${first.scale}, lastScale: ${last.scale},
        };
      })()`);
      return {
        ...f, size: `${W}x${H}`, aspect: W / H,
        deepestHalfHeight: last.scale, deepestFrameWidthInPlane: 2 * last.scale * W / H,
        zoomVsOpeningFrame: first.scale / last.scale, zoomVsAppOpeningView: f.baseScale / last.scale,
        cruiseEfoldsPerSecond: last.rate, cruiseDoublingSeconds: Math.LN2 / last.rate, cruiseFactorPerSecond: Math.exp(last.rate),
        cruiseDecadesPerSecond: last.rate / Math.LN10,
      };
    },
  },
  audio: AUDIO,
  post: POST,
};
