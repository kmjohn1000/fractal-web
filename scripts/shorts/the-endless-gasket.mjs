// Recipe: "The Endless Gasket": a seamless-loop Short (1080x1920, 30 fps) of one steady dive into the
// Sierpinski gasket, turning as it goes, that ends on the very picture it began with.
// (How the loop closes: scripts/shorts/loop-dive.mjs. The recipe format: scripts/make-short.mjs.)
//
//   the point   (1/7, 2/7): base 2 digits 0.001001... and 0.010010... (period 3), the app's "Triangle Spiral"
//   the loop    12 levels = 2^12 = 4096x deeper (period 3 divides 12; the color cycle below has period 12)
//   the turn    two full turns over the loop
//   the colors  a hole's color is its level through the palette, out and back over 12 levels
import { loopRecipe, loopPosting } from "./loop-dive.mjs";

export default loopRecipe({
  id: "the-endless-gasket",
  title: "The Endless Gasket",
  fractal: "Gasket",
  base: 2, levels: 12, cycle: 6, turns: 2,
  target: [1 / 7, 2 / 7],
  scale0: 0.012,
  builtinPalette: "Twilight",
  audio: {
    targetLufs: -15, limiter: 0.7,
    layers: [{
      type: "drone",
      notes: [[73.42, 0.30], [146.83, 0.22], [220, 0.15], [293.66, 0.12], [369.99, 0.08], [440, 0.05]],
      detune: [0.05, 0.02], tremolo: [0.04, 0.013], drift: [0.6, 0.2, 0.021, 0.007],
      noise: "lowpass=f=500,highpass=f=80,tremolo=f=0.1:d=0.6,volume=0.18",
      post: "lowpass=f=1300,aecho=0.8:0.85:140|290:0.4|0.25",
      swell: "1",
    }],
  },
  post: ({ f }) => ({
    notes: `Files: \`the-endless-gasket-pure.mp4\` (${f.seconds} s, no fade; the primary cut, a seamless loop), \`the-endless-gasket-endcard.mp4\` (the same plus a 1.5 s app card, not a loop), \`the-endless-gasket-bed.m4a\` (the sound bed alone), \`thumbnail.png\`.`,
    titles: [
      "Sierpinski Gasket Zoom That Loops Seamlessly",
      "Zooming Into the Sierpinski Triangle: 4,096x Deeper, Back to Where It Began",
      "A Fractal Zoom That Ends Exactly Where It Starts (Sierpinski Gasket)",
    ],
    titleNote: `(The depth figure is exact: 12 levels of zoom is 2^12 = ${f.loopZoomFactor.toLocaleString("en-US")}x, the length of one loop. Option 3 makes no number claim.)`,
    description: `One steady zoom into the Sierpinski gasket, rendered frame by frame in the free app Fractal Atlas, that ends on the very picture it began with.

The gasket is a triangle with its middle removed, then the same cut in each triangle left, forever. Each color is one level of that cutting. The point we zoom into sits where the gasket repeats itself: eight times closer shows the same gasket, so after ${f.loopZoomFactor.toLocaleString("en-US")}x (twelve levels, ${f.seconds} seconds here, turning twice as it goes) the picture is the first one again, and the video loops with no seam.

Explore the Sierpinski gasket yourself, and dozens of other fractals, in the free app Fractal Atlas for iPhone and iPad.`,
    hashtags: "#fractals #sierpinski #loop #shorts",
    pinned: `What you are seeing: the Sierpinski gasket (the right-triangle form), zoomed ${f.loopZoomFactor.toLocaleString("en-US")}x over ${f.seconds} seconds while the view turns twice. Each color is one level of cutting the middle out of every triangle. We zoom into a point where the pattern repeats exactly (eight times closer is the same gasket), which is why the last frame is the first frame.

Made with Fractal Atlas, a free app for iPhone and iPad where you can zoom this and many other fractals yourself. The link is in my channel profile.`,
    posting: loopPosting("the-endless-gasket"),
  }),
});
