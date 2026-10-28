// Recipe: "The Endless Carpet": a seamless-loop Short (1080x1920, 30 fps) of one steady dive into the
// Sierpinski carpet, turning as it goes, that ends on the very picture it began with.
// (How the loop closes: scripts/shorts/loop-dive.mjs. The recipe format: scripts/make-short.mjs.)
//
//   the point   (1/4, 1/4): base 3 digits 0.0202...  (period 2), the app's "Spiral Dive" place
//   the loop    8 levels = 3^8 = 6561x deeper (digits period 2 divides 8; the color cycle below has period 8)
//   the turn    90 degrees per level, as the app's own spiral dives, so two full turns over the loop
//   the colors  a hole's color is its level through the Pastel Cycle palette, out and back over 8 levels
import { loopRecipe, loopPosting } from "./loop-dive.mjs";

const PASTEL = { name: "Pastel Cycle", stops: [[0, 176, 150, 210], [0.1667, 236, 170, 200], [0.3333, 240, 222, 190], [0.5, 170, 220, 180], [0.6667, 140, 214, 210], [0.8333, 150, 175, 230], [1, 176, 150, 210]] };

export default loopRecipe({
  id: "the-endless-carpet",
  title: "The Endless Carpet",
  fractal: "Carpet",
  base: 3, levels: 8, cycle: 4, turns: 2,
  target: [0.25, 0.25],
  scale0: 0.02,
  palette: PASTEL,
  audio: {
    targetLufs: -15, limiter: 0.7,
    layers: [{
      type: "drone",
      notes: [[55, 0.30], [110, 0.22], [164.81, 0.15], [220, 0.12], [277.18, 0.08], [329.63, 0.05]],
      detune: [0.05, 0.02], tremolo: [0.04, 0.013], drift: [0.6, 0.2, 0.021, 0.007],
      noise: "lowpass=f=500,highpass=f=80,tremolo=f=0.1:d=0.6,volume=0.18",
      post: "lowpass=f=1300,aecho=0.8:0.85:140|290:0.4|0.25",
      swell: "1",
    }],
  },
  post: ({ f }) => ({
    notes: `Files: \`the-endless-carpet-pure.mp4\` (${f.seconds} s, no fade; the primary cut, a seamless loop), \`the-endless-carpet-endcard.mp4\` (the same plus a 1.5 s app card, not a loop), \`the-endless-carpet-bed.m4a\` (the sound bed alone), \`thumbnail.png\`.`,
    titles: [
      "Sierpinski Carpet Zoom That Loops Seamlessly",
      "Zooming Into the Sierpinski Carpet: 6,561x Deeper, Back to Where It Began",
      "A Fractal Zoom That Ends Exactly Where It Starts (Sierpinski Carpet)",
    ],
    titleNote: `(The depth figure is exact: 8 levels of zoom is 3^8 = ${f.loopZoomFactor.toLocaleString("en-US")}x, the length of one loop. Option 3 makes no number claim.)`,
    description: `One steady zoom into the Sierpinski carpet, rendered frame by frame in the free app Fractal Atlas, that ends on the very picture it began with.

The carpet is a square cut into a 3 by 3 grid with the middle square removed, then the same cut in each remaining square, forever. Each color is one level of that cutting. The point we zoom into sits where the carpet repeats itself: nine times closer shows the same carpet, so after ${f.loopZoomFactor.toLocaleString("en-US")}x (eight levels, ${f.seconds} seconds here, turning twice as it goes) the picture is the first one again, and the video loops with no seam.

Explore the Sierpinski carpet yourself, and dozens of other fractals, in the free app Fractal Atlas for iPhone and iPad.`,
    hashtags: "#fractals #sierpinski #loop #shorts",
    pinned: `What you are seeing: the Sierpinski carpet, zoomed ${f.loopZoomFactor.toLocaleString("en-US")}x over ${f.seconds} seconds while the view turns twice. The carpet is made of squares with a square missing from the middle of each, over and over, and each color is one level of that removal. We zoom into a point where the pattern repeats exactly (nine times closer is the same carpet), which is why the last frame is the first frame.

Made with Fractal Atlas, a free app for iPhone and iPad where you can zoom this and many other fractals yourself. The link is in my channel profile.`,
    posting: loopPosting("the-endless-carpet"),
  }),
});
