// Helper for the seamless-loop dives (the-endless-carpet.mjs, the-endless-gasket.mjs): builds a recipe
// for a steady zoom into a Carpet or Gasket point whose base-b digits repeat, so the picture at a
// scale `base^levels` times deeper is the SAME picture, pixel for pixel, and the Short loops with no seam.
//
// Why it closes (checked on stills: 0 RMSE between a frame and the one `base^levels` deeper):
//   - the target's digits repeat with period p, so the view at scale s and at s / base^p show the same
//     cells (the picture needs only that the view stays inside the cell whose scaled copy it is: `scale0`
//     is small enough for that, including the corners the rotation sweeps)
//   - a hole's color is its level through the colormap, going out and back every 2*cycle levels
//     (digitColor in shaders.js), so the colors come back after 2*cycle levels; the page's
//     digitColorCycle is set to `cycle` (the app's own is 15 / 21, far too slow for a loop) and
//     `levels` is a multiple of both p and 2*cycle
//   - the rotation turns a whole number of times over the loop; the zoom rate is constant, so even the
//     speed is continuous across the seam
//
// `facts` is computed on the CPU from the recipe's numbers (the app's own zoom phrase is not needed).

const TAU = 2 * Math.PI;

// The posting notes every loop Short shares (the recipes add their own post text around them).
export const loopPosting = (stem) => [
  `Upload \`${stem}-pure.mp4\` as the main Short. It does not fade out: the last frame is the picture the first frame shows, and the sound bed is folded so its end runs into its start, so Shorts' automatic replay has no seam. \`${stem}-endcard.mp4\` adds a 1.5 s "Fractal Atlas, free for iPhone and iPad" card at the end and so is not a loop; use it only if you want the app's name on screen.`,
  "Shorts links are not clickable: put the App Store link in the channel profile (the pinned comment says so).",
  "The thumbnail is a frame of the video (Shorts use the video's own frame); `thumbnail.png` is the one picked.",
  `The sound is self-made (a synthesized drone), so it carries no third-party licensing. \`${stem}-bed.m4a\` is the bed alone if you want to swap it. If you use other music, make sure you have the rights to it or use a track from YouTube's own audio library.`,
  "I could not listen to the audio when making this; audition it before posting, and listen once through the loop point (the last 3 s run into the first 3 s).",
  "No claim is made about records or reach.",
];

export function loopRecipe(o) {
  const { id, title, base, levels, cycle, scale0, zoomPerSecond = 1.3, turns, target, palette, audio, post, fractal } = o;
  const totalEfolds = levels * Math.log(base);
  const seconds = Math.round(totalEfolds / Math.log(zoomPerSecond));
  const rate = totalEfolds / seconds;
  const path = () => (t) => ({
    t, scale: scale0 * Math.exp(-rate * t), cx: target[0], cy: target[1], offset: 0,
    rotation: turns * TAU * t / seconds,
    layers: [{ style: "relief", density: 1 }],
  });
  const facts = () => ({
    seconds, levels, cycle, base, loopZoomFactor: base ** levels, perSecond: Math.exp(rate), turns, scale0,
    scaleEnd: scale0 * Math.exp(-rate * seconds), colorPeriodLevels: 2 * cycle, tilesPerLevel: base,
  });
  return {
    id, title, stem: id, outDir: `~/Movies/fractal-atlas-shorts/${id}`,
    fps: 30, size: [1080, 1920], seconds,
    fadeOut: 0, cardFade: 0.6, cardHold: 1.5, loopAudio: 3,
    thumbAt: Math.round(seconds * 0.3),
    renderer: {
      type: "dive", fractal, palette,
      pageSetup: `digitColorCycle = () => ${cycle};${o.builtinPalette ? ` pickColormap(COLORMAPS.findIndex((c) => c.name === ${JSON.stringify(o.builtinPalette)}));` : ""}`,
      path,
      plan: { header: "frame,t,scale,rotation_deg", row: (i, s) => [i, s.t.toFixed(3), s.scale.toExponential(4), (s.rotation * 180 / Math.PI).toFixed(2)].join(",") },
      facts,
    },
    audio: { ...audio, seconds: seconds + (audio.extra ?? 4) + 3 },
    post: (ctx) => post({ ...ctx, f: facts() }),
  };
}
