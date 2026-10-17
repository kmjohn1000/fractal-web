"use strict";

// ---------------------------------------------------------------- fractal configs
// Ported from mandelbrot.py's FRACTAL_CONFIGS. view is [xmin, xmax, ymin, ymax],
// the region that must be fully visible when the fractal first opens;
// viewFromBounds fits it to the canvas's aspect ratio (see there).

const FTYPE = { ESCAPE: 0, SHIP: 1, TRICORN: 2, NEWTON: 3, CARPET: 4, GASKET: 5, PHOENIX: 6, CELTIC: 7 };

// Phoenix's fixed p in z' = z^2 + c + p*z_prev: the classic real -0.5
// (Ushiki). With c = 0.5667 in Julia mode that gives the well-known twin-lobe
// image (Julia:Phoenix); p = -0.5+0.5i was tried first and gives only a single
// tilted lobe in either mode. A constant for the fractal, not view state.
const PHOENIX_P = [-0.5, 0];

// category splits the fractal picker into its two labeled parts (see
// FRACTAL_CATEGORIES), and gates the zoom-only toolbar buttons (box zoom,
// Surprise me):
//   "zoom"    - fractals you explore by zooming: every escape-time type
//               (Mandelbrot and its variants, the Julia presets, Newton)
//               and the digit-test Carpet/Gasket. Everything in
//               FRACTAL_CONFIGS is "zoom"; any future escape-time or
//               digit-extraction type belongs here too.
//   "pattern" - the Canvas2D curves and chaos-game IFS shapes (EXTRA_MODES).
const FRACTAL_CONFIGS = {
  // The escape-time and Julia boxes are the sets' measured extents
  // (antenna/tips included; for dust-like Julia sets, points surviving 60+
  // iterations) plus a ~0.1 margin, so each opens filling the screen.
  // Tricorn's tips reach y = +-1.54, which its old +-1.25 box clipped even
  // before aspect fitting.
  "Mandelbrot":   { label: "Mandelbrot", ftype: FTYPE.ESCAPE,  power: 2, juliaC: null,               view: [-2.15, 0.65, -1.25, 1.25], dual: true,  category: "zoom" },
  "Burn. Ship":   { label: "Burning Ship", ftype: FTYPE.SHIP,    power: 2, juliaC: null,               view: [-2.15, 1.25, -1.85, 0.65], dual: true,  category: "zoom" },
  "Tricorn":      { label: "Tricorn", ftype: FTYPE.TRICORN, power: 2, juliaC: null,               view: [-2.1,  1.15, -1.7,  1.7],  dual: true,  category: "zoom" },
  "Celtic":       { label: "Celtic Mandelbrot", ftype: FTYPE.CELTIC, power: 2, juliaC: null,     view: [-2.0,  0.45, -1.85, 1.85], dual: true,  category: "zoom" },
  "Multibrot³": { label: "Multibrot³", ftype: FTYPE.ESCAPE, power: 3, juliaC: null,             view: [-0.82, 0.82, -1.45, 1.45], dual: true,  category: "zoom" },
  // Needs the previous iterate as state, so no perturbation (deep zoom) path
  // -- see perturbationEligibleType.
  "Phoenix":      { label: "Phoenix", ftype: FTYPE.PHOENIX, power: 2, juliaC: null,               view: [-2.0, 0.65, -0.78, 0.78], dual: true,  category: "zoom" },
  // A Julia preset has no dual view of its own; dualParent is the set whose
  // dual view shows it (see openPresetInDual): the parent in the main pane,
  // centered on the preset's c, and the preset in the Julia pane.
  "Julia:Rabbit": { label: "Douady rabbit", group: "julia", ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.12256, 0.74486], view: [-1.42, 1.42, -1.2, 1.2], dual: false, dualParent: "Mandelbrot", category: "zoom" },
  "Julia:Dragon": { label: "Dragon", group: "julia", ftype: FTYPE.ESCAPE,  power: 2, juliaC: [-0.4, 0.6],         view: [-1.5, 1.5, -1.1, 1.1],   dual: false, dualParent: "Mandelbrot", category: "zoom" },
  "Julia:Spiral": { label: "Spiral", group: "julia", ftype: FTYPE.ESCAPE,  power: 2, juliaC: [0.285, 0.01],       view: [-0.95, 0.95, -1.2, 1.2], dual: false, dualParent: "Mandelbrot", category: "zoom" },
  "Julia:Phoenix": { label: "Phoenix", group: "julia", ftype: FTYPE.PHOENIX, power: 2, juliaC: [0.5667, 0],        view: [-0.8, 0.88, -1.38, 1.38], dual: false, dualParent: "Phoenix", category: "zoom" },
  "Newton z³": { label: "Newton's method", ftype: FTYPE.NEWTON, power: 3, juliaC: null,              view: [-2.0, 2.0, -1.5, 1.5],   dual: false, category: "zoom" },
  // Digit-test fractals (see FRAG_SRC's renderDigitFractal) — defined on
  // the unit square, so centered there with a little margin. power is
  // unused by these but kept non-null for consistency with the others.
  "Carpet":       { label: "Sierpinski carpet", ftype: FTYPE.CARPET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, category: "zoom" },
  "Gasket":       { label: "Sierpinski gasket", ftype: FTYPE.GASKET,  power: 2, juliaC: null,               view: [-0.15, 1.15, -0.15, 1.15], dual: false, category: "zoom" },
};
const FRACTAL_NAMES = Object.keys(FRACTAL_CONFIGS);
// FRACTAL_CONFIGS keys double as share-link ids (f=...), so they never
// change; label is what people see. Julia presets are grouped in the picker
// under "Julia sets", so their label alone ("Spiral") needs that context
// anywhere else.
function fractalLabel(name) {
  const c = FRACTAL_CONFIGS[name];
  return c.group === "julia" ? `Julia set: ${c.label}` : c.label;
}
// File-name-safe id, shared by export file names and picker thumbnails
// (icons/thumbs/<slug>.webp, rendered by scripts/render_thumbs.mjs).
function slugify(text) {
  return text.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// "Surprise me" destinations (see teleport()). Keyed by FRACTAL_CONFIGS name,
// not FTYPE: FTYPE.ESCAPE is shared by Mandelbrot, Multibrot³ and the Julia
// presets, whose coordinates mean different things. scale is the view's
// half-height, as everywhere else. Every entry was checked by rendering it
// (not taken on faith): each lands on visible boundary detail at its scale.
// re/im are strings so the source keeps every digit it was given. Each is
// the feature's center, not just a point near it: Spiral Cluster is the
// Misiurewicz point M(28,2) at the spiral's eye; Mini Mandelbrot sits just
// left of the period-55 nucleus so the minibrot and its halo are centered.
// Three-Way Branch is a Misiurewicz point where three arms meet; Antenna
// Minibrot is the period-4 minibrot (nucleus -0.156520166834 +
// 1.032247108923i), shifted onto its body's visual center.
const TELEPORT_DESTINATIONS = [
  { fractal: "Mandelbrot", label: "Seahorse Valley", re: "-0.743643887037151", im: "0.131825904205330", scale: 4e-10 },
  { fractal: "Mandelbrot", label: "Elephant Valley", re: "0.2825", im: "0.0105", scale: 1.2e-2, rotation: Math.PI },
  { fractal: "Mandelbrot", label: "Mini Mandelbrot", re: "-1.749003357223038", im: "0.0", scale: 1.5e-12 },
  { fractal: "Mandelbrot", label: "Spiral Cluster", re: "-0.7451580638016195553", im: "0.1125749162054165212", scale: 1e-3 },
  { fractal: "Mandelbrot", label: "Double Spiral", re: "-0.774931608855056", im: "-0.13706041846077", scale: 1e-8 },
  { fractal: "Mandelbrot", label: "Frond Thicket", re: "-0.16070135", im: "1.0375665", scale: 5e-7 },
  { fractal: "Mandelbrot", label: "Three-Way Branch", re: "-0.10109636384562", im: "0.95628651080914", scale: 1e-2 },
  { fractal: "Mandelbrot", label: "Tante Renate", re: "-0.7746806106269039", im: "-0.1374168856037867", scale: 1e-6 },
  { fractal: "Mandelbrot", label: "Antenna Minibrot", re: "-0.15860", im: "1.03310", scale: 2e-2 },
  // Starburst is Frond Thicket's spot ~1000x deeper, framed by the user; its
  // rotation keeps their framing.
  { fractal: "Mandelbrot", label: "Starburst", re: "-0.16070135134000138", im: "1.0375666168602689", scale: 5.107413907207074e-10, rotation: -1.6580627893946112 },
  // Bird's Eye is the user's place, centered as they gave it (not recentered
  // on the eye) and zoomed out 1.5x at their request. maxIter (optional)
  // lands with detail locked
  // there instead of auto: auto gives ~1400 here, which leaves a much
  // bigger black hole in the eye than the 2000 maximum does.
  { fractal: "Mandelbrot", label: "Bird's Eye", re: "-0.7499608238178327", im: "0.010995666098898458", scale: 8.4e-6, rotation: 0, maxIter: 2000 },
  // Butterfly Crest is the user's place too, centered as they gave it and
  // zoomed out 1.5x at their request: a minibrot in its halo on the real
  // axis, ringed by mirrored butterfly and seahorse curls.
  { fractal: "Mandelbrot", label: "Butterfly Crest", re: "-1.7498024610968186", im: "-4.2378297315393065e-11", scale: 7.4e-8, rotation: 0 },
  // Pinwheel is the user's place as well, framed as given: dendrite arms
  // spiraling around one center.
  { fractal: "Mandelbrot", label: "Pinwheel", re: "-0.5360670633819427", im: "-0.5255257785409202", scale: 5.1991824685514734e-9, rotation: 0 },
  // Sunburst Fan, also the user's, framed as given: rows of filament arms
  // fanning out from a hub, ~7e-12 deep, near the perturbation path's limit.
  { fractal: "Mandelbrot", label: "Sunburst Fan", re: "0.33698444648740383", im: "0.048778219678026105", scale: 7.178441004711243e-12, rotation: 0 },
  // From the 2026-10-16 places research (each one rendered and centered on
  // a portrait phone): Cauliflower and Twin Medallions are embedded Julia
  // sets from mrob.com's Mandelbrot glossary, Sea Urchin a minibrot in
  // radiating filaments, Cross Medallion mrob's "branch medallion".
  { fractal: "Mandelbrot", label: "Cauliflower", re: "-1.74876455", im: "0", scale: 1.6e-5 },
  { fractal: "Mandelbrot", label: "Twin Medallions", re: "-1.768620774", im: "0.002428273", scale: 4.5e-6 },
  { fractal: "Mandelbrot", label: "Sea Urchin", re: "0.370624233423", im: "-0.670428331878", scale: 1e-6 },
  { fractal: "Mandelbrot", label: "Cross Medallion", re: "-1.7576852691", im: "0.0176750996", scale: 1.9e-7 },
  // Burning Ship is drawn in math orientation (+im up), which hangs every
  // ship's masts below its hull; rotation (radians, optional) turns the
  // landed view ship-side up. A half turn also mirrors left-right compared
  // with the classic picture, which flips the im axis instead. Scales are
  // sized so each hull fits a portrait phone's width. Sunken Crown sits
  // just off the real axis (screen top edge at im = 2e-13): across the
  // axis there, the set is a hard black block with streaks.
  { fractal: "Burn. Ship", label: "Armada", re: "-1.7595", im: "-0.036", scale: 6.8e-2, rotation: Math.PI },
  { fractal: "Burn. Ship", label: "Ghost Ship", re: "-1.941", im: "-0.0038", scale: 6e-3, rotation: Math.PI },
  { fractal: "Burn. Ship", label: "Burning Galleon", re: "-1.6268", im: "-0.03", scale: 5e-2, rotation: Math.PI },
  { fractal: "Burn. Ship", label: "Lightning", re: "-1.93932", im: "-0.00178", scale: 6e-4, rotation: Math.PI },
  { fractal: "Burn. Ship", label: "Twin Ships", re: "-1.9393403", im: "-0.0017282", scale: 4.5e-5, rotation: Math.PI },
  { fractal: "Burn. Ship", label: "Sunken Crown", re: "-1.7490033572229", im: "0.0000000000014", scale: 1.2e-12, rotation: Math.PI },
  // Clipper sits by the "wake" near -1.861-0.002i, Needle Forest among the
  // spires on the horizon near -1.51; Stingray is the off-axis period-3
  // copy (nucleus 0.877438833 - 1.519768640i), turned to point down.
  { fractal: "Burn. Ship", label: "Clipper", re: "-1.8605", im: "-0.0035", scale: 4.5e-3, rotation: Math.PI },
  { fractal: "Burn. Ship", label: "Needle Forest", re: "-1.5099", im: "-0.00115", scale: 1.8e-3, rotation: Math.PI },
  { fractal: "Burn. Ship", label: "Stingray", re: "0.8774", im: "-1.5198", scale: 4e-2, rotation: 2.5 },
  // Tricorn copies alternate in kind: odd periods are baby Tricorns, even
  // ones little Mandelbrot sets. Each starts from its copy's nucleus; Baby
  // Tricorn, Hidden Mandelbrot, Antenna Talons and Flame Minibrot are then
  // shifted onto the copy's visual center on a portrait phone.
  { fractal: "Tricorn", label: "Baby Tricorn", re: "-1.7605", im: "0.0", scale: 5e-2 },
  { fractal: "Tricorn", label: "Hidden Mandelbrot", re: "-1.94136", im: "0.0", scale: 3e-3 },
  { fractal: "Tricorn", label: "Tilted Tricorn", re: "-1.380734140799838", im: "0.059837338423964", scale: 2.2e-4 },
  { fractal: "Tricorn", label: "Lace Minibrot", re: "-1.366420146878388", im: "0.040471294040541", scale: 2e-5 },
  { fractal: "Tricorn", label: "Lace Tricorn", re: "-1.380765134221053", im: "0.059762690448109", scale: 3e-6 },
  { fractal: "Tricorn", label: "Antenna Talons", re: "-1.99909577", im: "0.0", scale: 9.5e-7 },
  { fractal: "Tricorn", label: "Flame Minibrot", re: "-1.9997740533", im: "0.0", scale: 3e-8 },
  // Off-axis copies, nuclei found numerically: two period-6 minibrots and a
  // period-5 baby Tricorn.
  { fractal: "Tricorn", label: "Sunburst Minibrot", re: "0.73800732136421499", im: "1.2782661769606325", scale: 1e-2 },
  { fractal: "Tricorn", label: "Storm Minibrot", re: "0.41654350499179532", im: "1.1346858695986617", scale: 9e-4 },
  { fractal: "Tricorn", label: "Three Horns", re: "0.43348010224029404", im: "1.1083961474917501", scale: 1.5e-2 },
  // The Phoenix Julia set is mirror-symmetric top to bottom, so every place
  // is in the upper lobe. These were picked when Phoenix stopped at ~1e-4
  // in float32; since 1.34.0 it zooms deeper (phoenixDeepEligible).
  { fractal: "Julia:Phoenix", label: "Flame Column", re: "-0.47", im: "1.07", scale: 0.25 },
  { fractal: "Julia:Phoenix", label: "Firebird Isle", re: "-0.6457", im: "0.8416", scale: 5e-2, rotation: Math.PI / 2 },
  { fractal: "Julia:Phoenix", label: "Fire Seahorse", re: "0.315", im: "0.612", scale: 4.5e-2 },
  { fractal: "Julia:Phoenix", label: "Feather Cascade", re: "0.5783", im: "0.5315", scale: 2.8e-3 },
  { fractal: "Julia:Phoenix", label: "Ember Spiral", re: "0.58192", im: "0.52952", scale: 5e-4 },
  { fractal: "Julia:Phoenix", label: "Twin Curl", re: "0.14944", im: "0.50997", scale: 4e-3 },
  { fractal: "Julia:Phoenix", label: "Fire Tendrils", re: "0.16767", im: "0.98407", scale: 8e-3 },
  { fractal: "Julia:Phoenix", label: "Vortex", re: "0.29819", im: "0.68284", scale: 4e-3 },
  { fractal: "Julia:Phoenix", label: "Serpent", re: "-0.49107", im: "0.78041", scale: 2e-2 },
  // spiral: the flight turns SPIRAL_RAD_PER_ZOOM as it zooms and lands
  // upright (rotation 0). Each target's base-3 (carpet) or base-2 (gasket)
  // digits repeat, so the dive looks the same at every level on the way
  // down: 1/4 = 0.0202...3, 1/8 = 0.0101...3, and (1/7, 2/7) =
  // (0.001001...2, 0.010010...2).
  { fractal: "Carpet", label: "Spiral Dive", re: "0.25", im: "0.25", scale: 0.65 / 3 ** 20, rotation: 0, spiral: true },
  { fractal: "Carpet", label: "Lattice Dive", re: "0.125", im: "0.375", scale: 0.65 / 3 ** 20, rotation: 0, spiral: true },
  // More repeating-digit dives: (1/2, 1/4) = (0.111..., 0.0202...),
  // (1/8, 1/4) and the period-3 point (5/26, 15/26) in base 3; in base 2,
  // the period-4 points (2/15, 1/15) and (2/5, 1/15) and the period-2 point
  // (2/3, 1/3) on the hypotenuse. None has a digit pair (1, 1).
  { fractal: "Carpet", label: "Center Line", re: "0.5", im: "0.25", scale: 0.65 / 3 ** 20, rotation: 0, spiral: true },
  { fractal: "Carpet", label: "Corner Hop", re: "0.125", im: "0.25", scale: 0.65 / 3 ** 20, rotation: 0, spiral: true },
  { fractal: "Carpet", label: "Triple Turn", re: String(5 / 26), im: String(15 / 26), scale: 0.65 / 3 ** 21, rotation: 0, spiral: true },
  { fractal: "Gasket", label: "Triangle Spiral", re: String(1 / 7), im: String(2 / 7), scale: 0.65 / 2 ** 30, rotation: 0, spiral: true },
  { fractal: "Gasket", label: "Stair Dive", re: String(2 / 15), im: String(1 / 15), scale: 0.65 / 2 ** 32, rotation: 0, spiral: true },
  { fractal: "Gasket", label: "Long Step", re: String(2 / 5), im: String(1 / 15), scale: 0.65 / 2 ** 32, rotation: 0, spiral: true },
  { fractal: "Gasket", label: "Hypotenuse Slide", re: String(2 / 3), im: String(1 / 3), scale: 0.65 / 2 ** 30, rotation: 0, spiral: true },
  // Newton's map sends 0 (a double pole) to infinity, a repelling fixed
  // point with multiplier 3/2, so the six-armed star at 0 repeats every
  // sqrt(1.5)x of zoom. It's also the one place float32 stays sharp at
  // depth: a center of 0 loses no digits, so the dive renders live all the
  // way down (elsewhere deep Newton is fixed point, see newtonDeepEligible,
  // too slow for live frames). Newton's natural spirals (repelling cycles)
  // turn under a fifth of a turn per 10x, too little to show.
  { fractal: "Newton z³", label: "Pole Star", re: "0", im: "0", scale: 1e-9, rotation: 0, spiral: true },
  // Repelling cycles of Newton's map, found numerically: Quarter Turn is a
  // period-3 point (multiplier 41.57i, a quarter turn per 41.6x of zoom),
  // Deep Necklace and Basin Triad period-4 points. Deep Necklace is shifted
  // 2.6e-11 up to center its loops, and lands in fixed point.
  { fractal: "Newton z³", label: "Quarter Turn", re: "-0.59835788680381585", im: "0.12932136746874948", scale: 1e-3, rotation: 0, spiral: true },
  { fractal: "Newton z³", label: "Deep Necklace", re: "-1.2185320332059983", im: "-0.1375490980309401", scale: 1e-10 },
  { fractal: "Newton z³", label: "Basin Triad", re: "-0.46562397059835542", im: "-0.16972563317200889", scale: 1e-7 },
  // Celtic equals Mandelbrot on the real axis, so Mandelbrot's real-axis
  // landmarks reappear in new shapes: Halo Bell is Mini Mandelbrot's
  // period-55 point. Baby Celtic (period 3, nucleus -1.754877666246693),
  // Manta (period 3, -1.461156649102269 + 0.643209779946320i) and Celtic
  // Cross (period 4, -1.940799806529485) are shifted onto each copy's
  // visual center on a portrait phone.
  { fractal: "Celtic", label: "Baby Celtic", re: "-1.766", im: "0", scale: 6e-2 },
  { fractal: "Celtic", label: "Manta", re: "-1.471", im: "0.641", scale: 7e-2 },
  { fractal: "Celtic", label: "Celtic Cross", re: "-1.9412", im: "0", scale: 9e-3 },
  { fractal: "Celtic", label: "Four-Leaf Clover", re: "-1.749003357223038", im: "0", scale: 1e-7 },
  { fractal: "Celtic", label: "Halo Bell", re: "-1.749003357223038", im: "0", scale: 1.5e-12 },
  // Celtic Heart is an off-axis period-5 copy in its halo (nucleus found
  // numerically); Celtic Arrow a real-axis copy with a tail.
  { fractal: "Celtic", label: "Celtic Heart", re: "-1.3159760561548381", im: "0.60529611912404802", scale: 1.1e-2 },
  { fractal: "Celtic", label: "Celtic Arrow", re: "-1.8615", im: "0", scale: 2.5e-3 },
  // Baby Multibrot is the period-3 copy (nucleus 0.264425021936024 +
  // 1.260489344108479i), shifted onto its visual center and sized so its
  // buds fit a portrait phone's width; Seahorse Curl sits by the top
  // bulb's join at 4i/(3*sqrt(3)); Spiral Galaxy is a Misiurewicz point.
  { fractal: "Multibrot³", label: "Baby Multibrot", re: "0.2656", im: "1.261", scale: 5e-2 },
  { fractal: "Multibrot³", label: "Twin-Disk Minibrot", re: "0.6", im: "0.6847", scale: 2.5e-2 },
  { fractal: "Multibrot³", label: "Seahorse Curl", re: "0.1854", im: "0.8406", scale: 4e-3 },
  { fractal: "Multibrot³", label: "Spiral Galaxy", re: "0.2203299273540233", im: "1.1863292989343286", scale: 1e-5 },
  // Haloed Minibrot is a minibrot in an embedded-Julia halo, centered by eye
  // near a coordinate from a deep-zoom video (source unconfirmed, render
  // checked); Coral (period 7) and Sideways (period 5) are nuclei found
  // numerically.
  { fractal: "Multibrot³", label: "Haloed Minibrot", re: "0.2999501197", im: "1.1003047154", scale: 3e-7 },
  { fractal: "Multibrot³", label: "Coral Minibrot", re: "0.41233326862858705", im: "0.68927034599526826", scale: 6e-3 },
  { fractal: "Multibrot³", label: "Sideways Minibrot", re: "0.22354880762228108", im: "1.2185316350831055", scale: 1.6e-2 },
  // Chosen at or above 3e-3, Phoenix's old float32 floor (it zooms deeper
  // since 1.34.0). Whirlpool is centered on its spiral's eye.
  { fractal: "Phoenix", label: "Whirlpool", re: "-0.60463", im: "0.49775", scale: 3e-3 },
  { fractal: "Phoenix", label: "Firebird", re: "-1.902", im: "0", scale: 8e-3 },
  { fractal: "Phoenix", label: "Ember Swarm", re: "-0.3599", im: "0.6771", scale: 8e-3 },
  { fractal: "Phoenix", label: "Triskelion", re: "0.01014", im: "0.45723", scale: 3e-3 },
  { fractal: "Phoenix", label: "Black Lotus", re: "0.47795", im: "0.18078", scale: 3e-3 },
  { fractal: "Phoenix", label: "Sunrise Fringe", re: "0.00362", im: "0.4010", scale: 8e-3 },
  // Julia spiral dives aim at a repelling fixed point, where the set
  // repeats at every depth (the rabbit's ears every 1.357x). They land at
  // DEEP_ZOOM_THRESHOLD: below it a flight shows the frozen last-frame
  // preview, not live frames, which would stop the spin.
  { fractal: "Julia:Rabbit", label: "Rabbit Hole", re: "-0.2763365709357304", im: "0.4797274969941251", scale: 1e-3, rotation: 0, spiral: true },
  // Little Rabbit frames one small body with its ears and the three-way
  // pinch below it, all within a portrait phone's width.
  { fractal: "Julia:Rabbit", label: "Little Rabbit", re: "-0.3108", im: "0.5186", scale: 8e-3 },
  { fractal: "Julia:Dragon", label: "Dragon's Eye", re: "-0.37595385170901174", im: "0.34248379570988946", scale: 0.2 },
  { fractal: "Julia:Dragon", label: "Twin Spirals", re: "0", im: "0", scale: 0.4 },
  // Dragon's Tail is centered on the rosette at the set's right-hand end.
  { fractal: "Julia:Dragon", label: "Dragon's Tail", re: "1.342", im: "-0.3815", scale: 4e-2 },
  { fractal: "Julia:Dragon", label: "Into the Eye", re: "-0.37595385170901174", im: "0.34248379570988946", scale: 1e-3, rotation: 0, spiral: true },
  // Six-armed crystals centered on preimages of the repelling fixed point.
  { fractal: "Julia:Dragon", label: "Snowflake", re: "0.16187404716230414", im: "-0.92421420034570057", scale: 1.5e-3 },
  { fractal: "Julia:Dragon", label: "Frost Cluster", re: "0.0078430379556528994", im: "-0.87068149781658499", scale: 3e-3 },
  { fractal: "Julia:Spiral", label: "Galaxy", re: "0.47353729561814784", im: "0.18894516327019664", scale: 0.2 },
  { fractal: "Julia:Spiral", label: "Seahorse Tail", re: "0.5264627043818522", im: "-0.18894516327019664", scale: 5e-2 },
  { fractal: "Julia:Spiral", label: "Into the Galaxy", re: "0.47353729561814784", im: "0.18894516327019664", scale: 1e-3, rotation: 0, spiral: true },
  // Copies of the Galaxy spiral, found through preimages of its fixed point.
  { fractal: "Julia:Spiral", label: "Spiral Cloak", re: "-0.59608", im: "0.85961", scale: 1.2e-3 },
  { fractal: "Julia:Spiral", label: "Lagoon Spiral", re: "-0.68712", im: "0.7601", scale: 1.1e-2 },
];
// Picker sections, in display order.
const FRACTAL_CATEGORIES = [
  { key: "zoom",    label: "Infinite zoom" },
  { key: "pattern", label: "Patterns" },
];

// Menu entries that switch the whole app mode (Canvas2D vector views, not a
// WebGL shader ftype) rather than selecting a FRACTAL_CONFIGS entry. All are
// in the picker's "pattern" section.
const EXTRA_MODES = [
  { key: "koch", label: "Koch snowflake", category: "pattern" },
  { key: "tree", label: "Pythagoras tree", category: "pattern" },
  { key: "dragon", label: "Dragon curve", category: "pattern" },
  { key: "hilbert", label: "Hilbert curve", category: "pattern" },
  { key: "gosper", label: "Gosper curve", category: "pattern" },
  { key: "arrowhead", label: "Sierpinski arrowhead", category: "pattern" },
  { key: "fern", label: "Barnsley fern", category: "pattern" },
  { key: "sierpinski", label: "Sierpinski triangle", category: "pattern" },
  { key: "levy", label: "Lévy C curve", category: "pattern" },
  { key: "vicsek", label: "Vicsek fractal", category: "pattern" },
];

// The chaos-game IFS modes (fern.js's IFS_SYSTEMS). They all share one
// view, canvas and control row -- the fern's -- and differ only in which
// transform table that view runs.
const isIfsMode = (m) => Object.prototype.hasOwnProperty.call(IFS_SYSTEMS, m);
// Likewise the L-system line curves (dragon.js's LINE_CURVES) share the
// dragon's view, canvas and control row.
const isCurveMode = (m) => Object.prototype.hasOwnProperty.call(LINE_CURVES, m);

// Carpet and Gasket: the digit-test fractals (renderDigitFractal in
// shaders.js), which use a zoom-derived depth instead of maxIter and cell
// rebasing instead of perturbation.
const isDigitFractal = (ftype) => ftype === FTYPE.CARPET || ftype === FTYPE.GASKET;
const digitBase = (ftype) => (ftype === FTYPE.CARPET ? 3 : 2);

// Most levels float32 digit extraction stays accurate for, per base,
// counted from the cell digitCellFrame rebased to -- see renderDigitFractal
// in shaders.js for how these were measured.
function digitMaxDepth(ftype) {
  return ftype === FTYPE.CARPET ? 16 : 22;
}

// Levels per pass through the colormap (u_digitCycle, see digitColor in
// shaders.js): the old per-pixel caps minus one, so the opening views keep
// the colors they always had.
function digitColorCycle(ftype) {
  return ftype === FTYPE.CARPET ? 15 : 21;
}

// Deepest level whose cells are still at least one device pixel wide.
// Deeper levels are sub-pixel and only produce aliasing speckle -- see
// renderDigitFractal in shaders.js for how the shader colors what's below
// this depth instead.
function digitPixelDepth(ftype, scale, heightPx) {
  const pixelSize = (scale * 2) / heightPx;
  const d = Math.floor(Math.log(1 / pixelSize) / Math.log(digitBase(ftype)) + 1e-9);
  return Math.max(1, d);
}

// Carpet/Gasket recursion depth for the current view: the pixel depth,
// capped at what float32 resolves below the rebased cell level. The
// renderer draws to this depth and the info card reports it.
function digitFractalDepth(ftype, scale, heightPx, aspect) {
  return Math.min(digitPixelDepth(ftype, scale, heightPx), digitCellLevel(ftype, scale, aspect) + digitMaxDepth(ftype));
}

// base^k by repeated multiplication, exact while it stays under 2^53
// (Math.pow isn't guaranteed exact).
function intPow(base, k) {
  let v = 1;
  for (let i = 0; i < k; i++) v *= base;
  return v;
}

// Deepest rebase level per base: 2^52 and 3^33 are the last powers under
// 2^53, so cell addresses and their digits stay exact float64 integers.
// About as deep as a float64 view center can address anyway (~1e15x).
const DIGIT_MAX_CELL_LEVEL = { 2: 52, 3: 33 };

// Cell rebasing for Carpet/Gasket deep zoom -- the digit-test counterpart
// of the escape-time types' perturbation. Picks the deepest level k whose
// cells are at least as wide as the view's half-diagonal, so the view (at
// any rotation) lies inside the 3x3 block of level-k cells around the one
// holding its center. The CPU resolves the top k digits of those 9 cells
// exactly, and the shader only runs the remaining levels on the pixel's
// O(1) position within its cell, which float32 handles at any zoom.
// Returns the view center in level-k cell units relative to the center
// cell, the world-to-cell-units factor, and per cell (row-major from
// dy = -1, dx = -1) the level it was cut out at, or -1 if it survives all k.
function digitCellFrame(ftype, cx, cy, scale, aspect) {
  const base = digitBase(ftype);
  const k = digitCellLevel(ftype, scale, aspect);
  const cells = intPow(base, k);
  // The pattern repeats with period 1, so drop the center's whole-number
  // part first (exact in float64). On a copy far from the original,
  // cx * cells would otherwise pass 2^53, where cell addresses round:
  // neighboring cells got the wrong holes and the view jumped by cells.
  const fx = cx - Math.trunc(cx), fy = cy - Math.trunc(cy);
  const ix = Math.floor(fx * cells), iy = Math.floor(fy * cells);
  const holes = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) holes.push(digitHoleLevel(ix + dx, iy + dy, base, k, cells));
  }
  return { level: k, center: [fx * cells - ix, fy * cells - iy], cellsPerUnit: cells, holes };
}

// The rebase level k for digitCellFrame: the deepest whose cells are at
// least as wide as the view's half-diagonal.
function digitCellLevel(ftype, scale, aspect) {
  const base = digitBase(ftype);
  const halfDiag = scale * Math.hypot(1, aspect);
  let k = Math.floor(Math.log(1 / halfDiag) / Math.log(base));
  k = Math.max(0, Math.min(DIGIT_MAX_CELL_LEVEL[base], k));
  while (k > 0 && intPow(base, k) * halfDiag > 1) k--;
  return k;
}

// Color for pixels that survive every level the shader resolves: the
// area-weighted average of the colors of the sub-pixel levels below
// u_digitDepth -- the limit a supersampled render converges to, so flat
// regions and resolved holes agree as you zoom in. It's the same for every
// pixel, so it's worked out here once per view rather than per pixel.
// Each level removes 1/base^2 of whatever survived the level above it. The
// fractal itself has zero area, so the weights are renormalized over the
// levels summed; 48 of them already account for over 99.6% of the area
// (Carpet; far more for Gasket). Returns RGB in 0..1.
function digitSubPixelColor(ftype, depth, lutBytes) {
  const base = digitBase(ftype), cycle = digitColorCycle(ftype);
  const hitFrac = 1 / (base * base);
  let surviving = 1;
  const sum = [0, 0, 0];
  for (let k = 0; k < 48; k++) {
    const t = (depth + k) / cycle;
    const c = lutColorCpu(lutBytes, 1 - Math.abs(1 - (t - 2 * Math.floor(t / 2))));
    for (let i = 0; i < 3; i++) sum[i] += surviving * hitFrac * c[i];
    surviving *= 1 - hitFrac;
  }
  return sum.map((v) => v / (1 - surviving));
}

// CPU twin of lutColor in shaders.js: the same wrap, end-color special
// case, and LINEAR filtering of the 256-texel LUT (CLAMP_TO_EDGE). RGB in 0..1.
function lutColorCpu(bytes, t) {
  const u = Math.abs(t - 1) < 1e-5 ? 255.5 / 256 : t - Math.floor(t);
  const x = u * 256 - 0.5;
  const i0 = Math.floor(x), f = x - i0;
  const a = Math.max(0, i0) * 4, b = Math.min(255, i0 + 1) * 4;
  return [0, 1, 2].map((c) => (bytes[a + c] * (1 - f) + bytes[b + c] * f) / 255);
}

// The level (0 = top) at which level-k cell (ix, iy) is cut out -- the
// first digit position where both addresses have a 1 -- or -1 if it
// survives all k levels. The pattern tiles with period 1, so addresses wrap
// mod base^k. Digits come off the bottom (% and an exact division), so the
// last match is the topmost level.
function digitHoleLevel(ix, iy, base, k, cells) {
  let x = ((ix % cells) + cells) % cells, y = ((iy % cells) + cells) % cells;
  let hole = -1;
  for (let i = k - 1; i >= 0; i--) {
    const dx = x % base, dy = y % base;
    if (dx === 1 && dy === 1) hole = i;
    x = (x - dx) / base;
    y = (y - dy) / base;
  }
  return hole;
}

// Suggested maxIter for a view: the slider's 300 default at the fractal's
// own opening scale, plus K per halving of scale past it (deeper views need
// more iterations before boundary points escape). Never below the default
// when zoomed out past the opening view. Rounded to the iter slider's step
// of 10 so the slider can show the exact value. Used while a pane's
// iterAutoLocked is false -- see applyAutoIter.
function suggestedMaxIter(baseScale, currentScale) {
  const DEFAULT_ITER = 300; // matches iterSlider's default
  const K = 60;
  const extraLevels = Math.max(0, Math.log2(baseScale / currentScale));
  const v = DEFAULT_ITER + K * extraLevels;
  return Math.max(50, Math.min(2000, Math.round(v / 10) * 10));
}

// Fits the whole box on screen: scale is the view's half-height, and the
// visible half-width is scale * aspect, so the box's half-width needs
// scale >= halfW / aspect. Fitting the height alone (the old behavior) cut
// off the sides of every wide box on a portrait phone.
function viewFromBounds(b, aspect) {
  const halfW = (b[1] - b[0]) / 2, halfH = (b[3] - b[2]) / 2;
  return { cx: (b[0] + b[1]) / 2, cy: (b[2] + b[3]) / 2, scale: Math.max(halfH, halfW / aspect) };
}

// ---------------------------------------------------------------- Phase 3: deep zoom
// Below this scale, plain float32 starts losing pixels to precision collapse
// (measured on-device at ~5.7e-6 in Phase 1) — switch to perturbation-based
// rendering (see shaders.js) with margin to spare before that point.
const DEEP_ZOOM_THRESHOLD = 1e-3;
// Squared escape radius (256), matching ESCAPE_RADIUS_SQ in shaders.js, so the
// reference orbit runs as long as the pixels that are perturbed against it.
const ESCAPE_RADIUS_SQ = 65536.0;

// Which fractal types have a perturbation (deep zoom) path -- see
// perturbStep in shaders.js for the per-type delta formulas. Covers both
// parameter-space and Julia mode.
function perturbationEligibleType(state) {
  return state.ftype === FTYPE.ESCAPE || state.ftype === FTYPE.TRICORN || state.ftype === FTYPE.SHIP ||
    state.ftype === FTYPE.CELTIC;
}

// Newton's deep zoom is fixed point instead (NEWTON_DEEP_FRAG_SRC in
// shaders.js), and only where float32 actually fails: once the view is
// deep AND far from the origin relative to its size. float32 resolves a
// center c to ~|c| * 1e-7, so a view within NEWTON_FLOAT32_REACH half-heights
// of 0 still renders exactly in float32 -- Pole Star's dive into 0 stays on
// that path the whole way down, with the live frames its spin needs.
// Fixed point also only pays off where its fixed 2^-48 step is finer than
// float32's ~|c| * 2^-23: within ~3e-8 of 0 float32 is the finer one (a
// dive centered 1e-16 from 0 went blank at 2e-19 in fixed point).
// The shader also needs |c| < 100 (its first 1/z keeps |z|^2 inside the
// fixed-point range; far out, the basins are plain sectors anyway).
const NEWTON_FLOAT32_REACH = 1000;
function newtonDeepEligible(state) {
  const r = Math.hypot(state.cx, state.cy);
  return state.ftype === FTYPE.NEWTON && state.scale < DEEP_ZOOM_THRESHOLD
    && r > NEWTON_FLOAT32_REACH * state.scale && r * 2 ** -23 > 2 ** -48 && r < 100;
}

// A float64 value as the deep shaders' 16.48 fixed point: four 16-bit limbs
// of the two's-complement integer round(x * 2^48), most significant first.
// Exact for |x| < 2^15 (rounded to 2^-48); the eligibility checks keep every
// value passed here inside FIXED_RANGE, so it never wraps or overflows.
const FIXED_RANGE = 2 ** 14;
function fixedLimbs(x) {
  let b = BigInt(Math.round(x * 2 ** 48));
  if (b < 0n) b += 1n << 64n;
  return [48n, 32n, 16n, 0n].map((s) => Number((b >> s) & 0xFFFFn));
}
const FIXED_THIRD = (() => {
  const b = (1n << 48n) / 3n;
  return [48n, 32n, 16n, 0n].map((s) => Number((b >> s) & 0xFFFFn));
})();

// Phoenix's deep zoom (PHOENIX_DEEP_FRAG_SRC: float32 perturbation, exact
// fixed point for glitched pixels), in both modes. Plain float32 stays sharp
// down to ~1e-4, and it renders live during gestures with full refinement,
// so Phoenix switches later than the perturbation types' 1e-3.
const PHOENIX_DEEP_THRESHOLD = 1e-4;
function phoenixDeepEligible(state) {
  const inRange = (v) => Math.abs(v) < FIXED_RANGE;
  return state.ftype === FTYPE.PHOENIX && state.scale < PHOENIX_DEEP_THRESHOLD
    && inRange(state.cx) && inRange(state.cy) && inRange(state.juliaC[0]) && inRange(state.juliaC[1]);
}
// Phoenix deep frames are ~10x a float32 frame, so refinement stops at this
// many samples instead of SAMPLE_COUNT.
const PHOENIX_DEEP_SAMPLES = 4;
// Exact steps per pixel before it finishes in float32: bounds a draw's
// worst case (all-exact Phoenix lost the WebGL context on an iPhone 15).
const PHOENIX_EXACT_CAP = 600;

// One float64 Phoenix orbit from (zr, zi) with z_prev = 0: the escape
// iteration (as the shaders count it), or Infinity if it never escapes.
function phoenixEscapeF64(zr, zi, cr, ci, maxIter) {
  const [pr0, pi0] = PHOENIX_P;
  let pr = 0, pi = 0;
  for (let n = 0; n < maxIter; n++) {
    const nr = zr * zr - zi * zi + cr + pr0 * pr - pi0 * pi;
    const ni = 2 * zr * zi + ci + pr0 * pi + pi0 * pr;
    pr = zr; pi = zi; zr = nr; zi = ni;
    if (zr * zr + zi * zi > ESCAPE_RADIUS_SQ) return n;
  }
  return Infinity;
}

// Phoenix's reference: like chooseReference, the view center if it never
// escapes, else the longest-surviving point of a coarse grid. Returns its
// offset from the center and its float64 orbit as a 3-row texture: row 0
// Z as float32 (the delta step), rows 1-2 Z's x and y as fixed-point limbs
// (the exact switch-over; 16-bit integers are exact in float32).
function phoenixReference(state, widthPx, heightPx) {
  const cFor = (pr, pi) => (state.isJulia ? state.juliaC : [pr, pi]);
  const survive = (pr, pi) => {
    const [cr, ci] = cFor(pr, pi);
    return state.isJulia ? phoenixEscapeF64(pr, pi, cr, ci, state.maxIter) : phoenixEscapeF64(0, 0, cr, ci, state.maxIter);
  };
  let best = { dx: 0, dy: 0, iter: survive(state.cx, state.cy) };
  if (best.iter !== Infinity) {
    const rot = state.rotation || 0;
    const rc = Math.cos(rot), rs = Math.sin(rot);
    const halfW = 0.5 * widthPx / heightPx;
    for (let gy = 0; gy < REFERENCE_GRID && best.iter !== Infinity; gy++) {
      for (let gx = 0; gx < REFERENCE_GRID; gx++) {
        const uvx = ((gx + 0.5) / REFERENCE_GRID * 2 - 1) * halfW;
        const uvy = ((gy + 0.5) / REFERENCE_GRID * 2 - 1) * 0.5;
        const dx = (uvx * rc - uvy * rs) * state.scale * 2.0;
        const dy = (uvx * rs + uvy * rc) * state.scale * 2.0;
        const iter = survive(state.cx + dx, state.cy + dy);
        if (iter > best.iter) {
          best = { dx, dy, iter };
          if (iter === Infinity) break;
        }
      }
    }
  }
  const rx = state.cx + best.dx, ry = state.cy + best.dy;
  const [cr, ci] = cFor(rx, ry);
  const [pr0, pi0] = PHOENIX_P;
  let zr = state.isJulia ? rx : 0, zi = state.isJulia ? ry : 0, pr = 0, pi = 0;
  const orbit = [zr, zi];
  for (let n = 0; n < state.maxIter; n++) {
    const nr = zr * zr - zi * zi + cr + pr0 * pr - pi0 * pi;
    const ni = 2 * zr * zi + ci + pr0 * pi + pi0 * pr;
    pr = zr; pi = zi; zr = nr; zi = ni;
    orbit.push(zr, zi);
    if (zr * zr + zi * zi > ESCAPE_RADIUS_SQ) break;
  }
  const len = orbit.length / 2;
  const data = new Float32Array(len * 3 * 4);
  for (let k = 0; k < len; k++) {
    const x = orbit[2 * k], y = orbit[2 * k + 1];
    data[k * 4] = x; data[k * 4 + 1] = y;
    // The escaped last point can be past the fixed-point range; the shader
    // never switches there (see PHOENIX_DEEP_FRAG_SRC).
    if (Math.abs(x) < 2 ** 14 && Math.abs(y) < 2 ** 14) {
      data.set(fixedLimbs(x), (len + k) * 4);
      data.set(fixedLimbs(y), (2 * len + k) * 4);
    }
  }
  return { dx: best.dx, dy: best.dy, len, data };
}

// Newton's map in float64, as the self-test's reference: iterations used and
// root index (-1 if none), same loop as renderNewton/NEWTON_DEEP_FRAG_SRC.
const NEWTON_ROOTS = [[1, 0], [-0.5, Math.sqrt(3) / 2], [-0.5, -Math.sqrt(3) / 2]];
function newtonOrbitF64(zr, zi, maxIter) {
  let used = 0;
  for (let i = 0; i < maxIter; i++) {
    used = i;
    const d = zr * zr + zi * zi;
    if (d > 0) {
      const wr = zr / d, wi = -zi / d;
      zr = (2 * zr + wr * wr - wi * wi) / 3;
      zi = (2 * zi + 2 * wr * wi) / 3;
    }
    for (let k = 0; k < 3; k++) {
      const dr = zr - NEWTON_ROOTS[k][0], di = zi - NEWTON_ROOTS[k][1];
      if (dr * dr + di * di < 1e-12) return { used, root: k };
    }
  }
  return { used, root: -1 };
}

// One float64 step of the escape-family map, z <- f(z) + c, in place on the
// 2-element array z (avoids allocating per step in chooseReference's hot
// loop). Must match renderEscapeFast in shaders.js.
function stepOrbit(ftype, power, z, cr, ci) {
  const zr = z[0], zi = z[1];
  if (ftype === FTYPE.SHIP) {
    // (|zr| + i|zi|)^2
    const ar = Math.abs(zr), ai = Math.abs(zi);
    z[0] = ar * ar - ai * ai + cr;
    z[1] = 2 * ar * ai + ci;
  } else if (ftype === FTYPE.CELTIC) {
    // (|zr^2 - zi^2|, 2*zr*zi)
    z[0] = Math.abs(zr * zr - zi * zi) + cr;
    z[1] = 2 * zr * zi + ci;
  } else if (ftype === FTYPE.TRICORN) {
    // conj(z)^2 = (zr^2 - zi^2) - 2*zr*zi*i
    z[0] = zr * zr - zi * zi + cr;
    z[1] = -2 * zr * zi + ci;
  } else if (power === 3) {
    const zr2 = zr * zr - zi * zi, zi2 = 2 * zr * zi;
    z[0] = zr2 * zr - zi2 * zi + cr;
    z[1] = zr2 * zi + zi2 * zr + ci;
  } else {
    z[0] = zr * zr - zi * zi + cr;
    z[1] = 2 * zr * zi + ci;
  }
}

// Computes a reference orbit Z[0..n] for perturbation rendering: Z[0] =
// (z0r,z0i), Z[n+1] = f(Z[n]) + (cr,ci), stopping early if it escapes.
// Parameter mode uses z0 = 0 and c = the reference point; Julia mode uses
// both the view-point orbit (z0 = point, c fixed) and the critical orbit
// (z0 = 0, c fixed) -- see renderEscapePerturbation in shaders.js. Runs in plain
// JS (float64) — no bignum needed at this target depth, and this is the one
// place genuine extended precision matters; everything the GPU touches
// afterward (the reference values once read back, and the per-pixel delta)
// only ever needs float32. Returns a Float32Array laid out as RGBA texels
// (re, im, 0, 1) so it can be uploaded directly as a texture.
function computeReferenceOrbit(state, z0r, z0i, cr, ci) {
  const maxIter = state.maxIter;
  const cap = maxIter + 1;
  const data = new Float32Array(cap * 4);
  data[0] = z0r; data[1] = z0i; data[3] = 1.0;
  const z = [z0r, z0i];
  let len = 1;
  for (let n = 0; n < maxIter; n++) {
    stepOrbit(state.ftype, state.power, z, cr, ci);
    const zr = z[0], zi = z[1];
    data[len * 4] = zr;
    data[len * 4 + 1] = zi;
    data[len * 4 + 3] = 1.0;
    len++;
    if (zr * zr + zi * zi > ESCAPE_RADIUS_SQ) break;
  }
  return { data: data.subarray(0, len * 4), length: len };
}

// Picks the reference point for perturbation: the view center if it never
// escapes, else the longest-surviving point on a coarse grid over the
// (rotated) view. The shader rebases correctly when a pixel outlives the
// reference, but after that particular rebase dz is O(1), and in float32 the
// pixel's tiny dc (~scale) is lost against it -- that pixel quietly drops to
// plain-float32 accuracy. Double-precision perturbation renderers don't have
// this problem; ours does, so it's worth a few ms of float64 CPU iteration to
// make "reference escapes first" as rare as possible. Returns the reference
// point's offset from the view center (the shader's u_refOffset).
const REFERENCE_GRID = 32;
function chooseReference(state, widthPx, heightPx) {
  // A candidate point is c in parameter mode, the starting z in Julia mode.
  const z = [0, 0];
  const escapeIter = (pr, pi) => {
    const cr = state.isJulia ? state.juliaC[0] : pr, ci = state.isJulia ? state.juliaC[1] : pi;
    z[0] = state.isJulia ? pr : 0; z[1] = state.isJulia ? pi : 0;
    for (let n = 0; n < state.maxIter; n++) {
      stepOrbit(state.ftype, state.power, z, cr, ci);
      if (z[0] * z[0] + z[1] * z[1] > ESCAPE_RADIUS_SQ) return n;
    }
    return Infinity;
  };
  if (escapeIter(state.cx, state.cy) === Infinity) return { dx: 0, dy: 0 };

  // Same uv -> world mapping as FRAG_SRC's main(), rotation included.
  const rot = state.rotation || 0;
  const rc = Math.cos(rot), rs = Math.sin(rot);
  const halfW = 0.5 * widthPx / heightPx;
  let best = { dx: 0, dy: 0, iter: -1 };
  for (let gy = 0; gy < REFERENCE_GRID; gy++) {
    for (let gx = 0; gx < REFERENCE_GRID; gx++) {
      const uvx = ((gx + 0.5) / REFERENCE_GRID * 2 - 1) * halfW;
      const uvy = ((gy + 0.5) / REFERENCE_GRID * 2 - 1) * 0.5;
      const dx = (uvx * rc - uvy * rs) * state.scale * 2.0;
      const dy = (uvx * rs + uvy * rc) * state.scale * 2.0;
      const iter = escapeIter(state.cx + dx, state.cy + dy);
      if (iter > best.iter) {
        best = { dx, dy, iter };
        if (iter === Infinity) return best;
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------- supersampling
// Sub-pixel sample offsets (in pixels) for progressive supersampling. One
// sample per pixel aliases badly wherever the fractal varies faster than the
// pixel grid -- worst on Burning Ship, whose abs() creases make the boundary
// rougher than Mandelbrot's. Sample 0 is the pixel center (what a plain
// render shows, so interaction looks the same as before); the rest are
// Halton(2,3) points shifted into [-0.5, 0.5), which spread evenly over the
// pixel for any prefix length. Each sample is a separate full-frame draw
// averaged into the canvas by blending (see render()), not a loop inside the
// shader: a single draw costs the same as an unsupersampled one, so heavy
// deep-zoom frames don't risk a GPU watchdog timeout / context loss, and
// refinement can be abandoned the moment the view changes.
// 16 samples cuts per-pixel noise ~4x; in Burning Ship's chaotic regions 8
// still left visible grain.
function halton(index, base) {
  let f = 1, r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}
const SAMPLE_COUNT = 16;
const SAMPLE_OFFSETS = Array.from({ length: SAMPLE_COUNT }, (_, i) =>
  i === 0 ? [0, 0] : [halton(i, 2) - 0.5, halton(i, 3) - 0.5]);

// ---------------------------------------------------------------- WebGL renderer factory

function createFractalRenderer(canvas) {
  // preserveDrawingBuffer: supersampling blends each new sample into the
  // previous frame's canvas contents, which the browser would otherwise be
  // free to discard after compositing.
  const ctxOpts = { antialias: false, alpha: false, preserveDrawingBuffer: true };
  // WebGL2 when there is one: Newton's deep zoom needs its 32-bit uints
  // (NEWTON_DEEP_FRAG_SRC). The ES 1.00 shaders run unchanged on either.
  const gl = canvas.getContext("webgl2", ctxOpts)
          || canvas.getContext("webgl", ctxOpts)
          || canvas.getContext("experimental-webgl", ctxOpts);
  if (!gl) return null;
  const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      // A lost context fails every compile with no log. iOS Safari does
      // this for a while after the GPU crashes, from the very first shader.
      if (gl.isContextLost()) throw new Error("The browser has turned graphics off for this page. Close the tab and reopen it; if that doesn't help, restart the device.");
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  // a_pos is pinned to attribute 0 in both programs so they share the
  // quad's vertex-attribute setup below without re-pointing it per draw.
  function link(fragSrc, vertSrc = VERT_SRC) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const prog = link(FRAG_SRC);
  const previewProg = link(PREVIEW_FRAG_SRC);
  gl.useProgram(prog);

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const pu = {
    resolution: gl.getUniformLocation(previewProg, "u_resolution"),
    snap: gl.getUniformLocation(previewProg, "u_snap"),
    snapRes: gl.getUniformLocation(previewProg, "u_snapRes"),
    toSnap: gl.getUniformLocation(previewProg, "u_toSnap"),
    snapOffset: gl.getUniformLocation(previewProg, "u_snapOffset"),
  };
  const snapTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, snapTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const u = {
    resolution: gl.getUniformLocation(prog, "u_resolution"),
    center: gl.getUniformLocation(prog, "u_center"),
    scale: gl.getUniformLocation(prog, "u_scale"),
    rotCos: gl.getUniformLocation(prog, "u_rotCos"),
    rotSin: gl.getUniformLocation(prog, "u_rotSin"),
    maxIter: gl.getUniformLocation(prog, "u_maxIter"),
    ftype: gl.getUniformLocation(prog, "u_ftype"),
    power: gl.getUniformLocation(prog, "u_power"),
    isJulia: gl.getUniformLocation(prog, "u_isJulia"),
    juliaC: gl.getUniformLocation(prog, "u_juliaC"),
    phoenixP: gl.getUniformLocation(prog, "u_phoenixP"),
    lut: gl.getUniformLocation(prog, "u_lut"),
    digitDepth: gl.getUniformLocation(prog, "u_digitDepth"),
    digitLevel: gl.getUniformLocation(prog, "u_digitLevel"),
    digitCenter: gl.getUniformLocation(prog, "u_digitCenter"),
    digitScale: gl.getUniformLocation(prog, "u_digitScale"),
    cellHole: gl.getUniformLocation(prog, "u_cellHole"),
    digitCycle: gl.getUniformLocation(prog, "u_digitCycle"),
    subPixelColor: gl.getUniformLocation(prog, "u_subPixelColor"),
    jitter: gl.getUniformLocation(prog, "u_jitter"),
    usePerturbation: gl.getUniformLocation(prog, "u_usePerturbation"),
    refOrbitTex: gl.getUniformLocation(prog, "u_refOrbitTex"),
    refOrbitLen: gl.getUniformLocation(prog, "u_refOrbitLen"),
    critOffset: gl.getUniformLocation(prog, "u_critOffset"),
    critLen: gl.getUniformLocation(prog, "u_critLen"),
    refTexWidth: gl.getUniformLocation(prog, "u_refTexWidth"),
    refOffset: gl.getUniformLocation(prog, "u_refOffset"),
  };

  const lutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  // CLAMP, not REPEAT: lutColor already cycles with fract(), so the texture
  // never needs to wrap -- and under REPEAT + LINEAR, a lookup at u = 0 (every
  // first-step escape once smoothIter is clamped at 0) blends texel 0 with
  // texel 255, tinting those regions with the colormap's end color.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Kept for digitSubPixelColor, which samples the LUT on the CPU.
  let lutBytes = null;
  function setLUT(bytes) {
    lutBytes = bytes;
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  // Perturbation needs a float texture to hold the reference orbit (each
  // texel a genuine re/im pair, not an 8-bit-quantized color). Feature-detect
  // once; if unavailable, perturbation mode is simply never offered and deep
  // zoom stays capped at the plain float32 ceiling for this renderer.
  // WebGL2 has float textures built in (and no OES_texture_float to ask for).
  const floatTexOk = isWebGL2 || !!gl.getExtension("OES_texture_float");
  const refOrbitTex = floatTexOk ? gl.createTexture() : null;
  if (refOrbitTex) {
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  const perturbationSupported = !!refOrbitTex;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    }
    return false;
  }

  // Final draw to the canvas. Sample 0 overwrites; sample k>0 blends in
  // with weight 1/(k+1), which keeps the canvas equal to the running mean of
  // samples 0..k.
  function drawToCanvas(sampleIndex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (sampleIndex > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (sampleIndex + 1));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  }

  // Reference orbit for the current view, reused by that view's
  // supersampling passes instead of re-running chooseReference's grid scan
  // and re-uploading the texture 16 times.
  let refCacheKey = "";
  let refCache = null;

  // Newton's fixed-point deep zoom (NEWTON_DEEP_FRAG_SRC): compiled and
  // self-tested the first time a deep Newton view needs it, not at launch.
  // null = not tried yet, false = unavailable (no WebGL2, a compile error,
  // or a failed self-test: deep Newton then stays on float32, as before).
  let newtonDeep = isWebGL2 ? null : false;
  function newtonDeepProgram() {
    if (newtonDeep !== null) return newtonDeep;
    try {
      const p = link(NEWTON_DEEP_FRAG_SRC, VERT_SRC_300);
      const names = ["resolution", "jitter", "rotCos", "rotSin", "scale", "maxIter", "cx", "cy", "third", "testMode", "lut"];
      const nu = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, `u_${n}`)]));
      newtonDeep = { prog: p, u: nu };
      if (!newtonDeepSelfTest()) newtonDeep = false;
    } catch (e) {
      console.warn("Newton deep zoom unavailable:", e);
      newtonDeep = false;
    }
    return newtonDeep;
  }

  function setNewtonDeepUniforms(state, w, h, jitter) {
    const { u: nu } = newtonDeep;
    gl.useProgram(newtonDeep.prog);
    gl.uniform2f(nu.resolution, w, h);
    gl.uniform2f(nu.jitter, jitter[0], jitter[1]);
    const rot = state.rotation || 0;
    gl.uniform1f(nu.rotCos, Math.cos(rot));
    gl.uniform1f(nu.rotSin, Math.sin(rot));
    gl.uniform1f(nu.scale, state.scale);
    gl.uniform1i(nu.maxIter, state.maxIter | 0);
    gl.uniform4ui(nu.cx, ...fixedLimbs(state.cx));
    gl.uniform4ui(nu.cy, ...fixedLimbs(state.cy));
    gl.uniform4ui(nu.third, ...FIXED_THIRD);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(nu.lut, 0);
  }

  // The fixed-point math is exact on paper, but a shader compiler can still
  // get it wrong (an "optimized" variant rendered garbage on an iPhone 15
  // while passing on a Mac), so before first use it draws a 16x16 corner of
  // a deep view where float32 gets every pixel wrong and checks each pixel's
  // root and iteration count against float64. The real frame drawn right
  // after covers the corner.
  // Two views: one far from the pole, and one ~0.01 from it, where orbits
  // pass close to 0 and run in u = 1/z (a version without u-mode passed the
  // far view and got 5% of the near one).
  const NEWTON_TEST_VIEWS = [
    { cx: 0.4637970443508781, cy: 0.6374591385438365, scale: 1e-9, rotation: 0, maxIter: 300 },
    { cx: 0.008882243030414086, cy: 0.004594100428665051, scale: 1e-9, rotation: 0, maxIter: 300 },
  ];
  function newtonDeepSelfTest() {
    const n = 16;
    for (const view of NEWTON_TEST_VIEWS) {
      setNewtonDeepUniforms(view, n, n, [0, 0]);
      gl.uniform1i(newtonDeep.u.testMode, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, n, n);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const px = new Uint8Array(n * n * 4);
      gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.uniform1i(newtonDeep.u.testMode, 0);
      gl.viewport(0, 0, canvas.width, canvas.height);
      let ok = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const uvx = (x + 0.5 - 0.5 * n) / n, uvy = (y + 0.5 - 0.5 * n) / n;
          const ref = newtonOrbitF64(view.cx + uvx * view.scale * 2, view.cy + uvy * view.scale * 2, view.maxIter);
          const i = (y * n + x) * 4;
          const used = px[i] + 256 * px[i + 1], root = px[i + 2] - 1;
          if (root === ref.root && Math.abs(used - ref.used) <= 1) ok++;
        }
      }
      // 98-100% agreed in testing; float32 gets 0-5%.
      if (ok < 0.9 * n * n) return false;
    }
    return true;
  }

  // Phoenix's deep zoom (PHOENIX_DEEP_FRAG_SRC), same lifecycle as Newton's.
  let phoenixDeep = isWebGL2 ? null : false;
  const phoenixRefTex = isWebGL2 ? gl.createTexture() : null;
  if (phoenixRefTex) {
    gl.bindTexture(gl.TEXTURE_2D, phoenixRefTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  let phoenixRefKey = "";
  let phoenixRef = null;
  function phoenixDeepProgram() {
    if (phoenixDeep !== null) return phoenixDeep;
    try {
      const p = link(PHOENIX_DEEP_FRAG_SRC, VERT_SRC_300);
      const names = ["resolution", "jitter", "rotCos", "rotSin", "scale", "maxIter", "isJulia", "cx", "cy",
        "jcx", "jcy", "ref", "refLen", "refOff", "exactCap", "testMode", "lut"];
      const pu = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, `u_${n}`)]));
      phoenixDeep = { prog: p, u: pu };
      if (!phoenixDeepSelfTest()) phoenixDeep = false;
    } catch (e) {
      console.warn("Phoenix deep zoom unavailable:", e);
      phoenixDeep = false;
    }
    return phoenixDeep;
  }

  function setPhoenixDeepUniforms(state, w, h, jitter) {
    const { u: pu } = phoenixDeep;
    gl.useProgram(phoenixDeep.prog);
    gl.uniform2f(pu.resolution, w, h);
    gl.uniform2f(pu.jitter, jitter[0], jitter[1]);
    const rot = state.rotation || 0;
    gl.uniform1f(pu.rotCos, Math.cos(rot));
    gl.uniform1f(pu.rotSin, Math.sin(rot));
    gl.uniform1f(pu.scale, state.scale);
    gl.uniform1i(pu.maxIter, state.maxIter | 0);
    gl.uniform1i(pu.isJulia, state.isJulia ? 1 : 0);
    gl.uniform4ui(pu.cx, ...fixedLimbs(state.cx));
    gl.uniform4ui(pu.cy, ...fixedLimbs(state.cy));
    gl.uniform4ui(pu.jcx, ...fixedLimbs(state.juliaC[0]));
    gl.uniform4ui(pu.jcy, ...fixedLimbs(state.juliaC[1]));
    gl.uniform1i(pu.exactCap, PHOENIX_EXACT_CAP);
    // The reference orbit, recomputed only when the view changes (the
    // refinement passes reuse it, as with refCacheKey).
    const key = [state.cx, state.cy, state.scale, state.rotation || 0, state.maxIter, state.isJulia,
      state.juliaC[0], state.juliaC[1], w, h].join(",");
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, phoenixRefTex);
    if (key !== phoenixRefKey) {
      phoenixRef = phoenixReference(state, w, h);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, phoenixRef.len, 3, 0, gl.RGBA, gl.FLOAT, phoenixRef.data);
      phoenixRefKey = key;
    }
    gl.uniform1i(pu.ref, 2);
    gl.uniform1i(pu.refLen, phoenixRef.len);
    gl.uniform2f(pu.refOff, phoenixRef.dx, phoenixRef.dy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(pu.lut, 0);
  }

  // Same idea as newtonDeepSelfTest: a 16x16 corner of a deep parameter-
  // space view where float32 gets ~half the pixels wrong, checked against
  // float64 escape counts.
  function phoenixDeepSelfTest() {
    const n = 16;
    const view = { cx: -0.6034929369570187, cy: 0.4995077460562414, scale: 1e-9, rotation: 0,
      maxIter: 2000, isJulia: false, juliaC: [0, 0] };
    setPhoenixDeepUniforms(view, n, n, [0, 0]);
    gl.uniform1i(phoenixDeep.u.testMode, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, n, n);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const px = new Uint8Array(n * n * 4);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.uniform1i(phoenixDeep.u.testMode, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    phoenixRefKey = ""; // the test's reference isn't the real view's
    let ok = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const uvx = (x + 0.5 - 0.5 * n) / n, uvy = (y + 0.5 - 0.5 * n) / n;
        const iter = phoenixEscapeF64(0, 0, view.cx + uvx * view.scale * 2, view.cy + uvy * view.scale * 2, view.maxIter);
        const i = (y * n + x) * 4;
        const escaped = px[i + 2] === 1, used = px[i] + 256 * px[i + 1];
        if (escaped ? iter !== Infinity && Math.abs(used - iter) <= 1 : iter === Infinity) ok++;
      }
    }
    // 100% agreed in testing; float32 gets ~48%.
    return ok >= 0.95 * n * n;
  }

  // sampleIndex selects the sub-pixel offset from SAMPLE_OFFSETS; see there
  // and drawToCanvas for how successive samples accumulate.
  // The view the canvas's current accurate frame was drawn for, and whether
  // the next renderPreview should capture it as a fresh snapshot.
  let lastView = null;
  let snapView = null;
  let needSnapshot = false;

  // Returns which deep-zoom path drew the frame ("perturbation" or
  // "fixed point"), or null for plain float32 -- for the info card.
  function render(state, sampleIndex = 0) {
    // A resize clears the canvas, so there's nothing left to blend into.
    if (resize()) sampleIndex = 0;
    if (sampleIndex === 0) {
      lastView = { cx: state.cx, cy: state.cy, scale: state.scale, rotation: state.rotation || 0 };
      needSnapshot = true;
    }
    // Mid-gesture, deep views show the moving preview instead (renderAll);
    // this guard covers a pane renderAll still draws live.
    if (!isInteracting && newtonDeepEligible(state) && newtonDeepProgram()) {
      setNewtonDeepUniforms(state, canvas.width, canvas.height, SAMPLE_OFFSETS[sampleIndex]);
      drawToCanvas(sampleIndex);
      return "fixed point";
    }
    if (!isInteracting && phoenixDeepEligible(state) && phoenixDeepProgram()) {
      // Past PHOENIX_DEEP_SAMPLES the canvas keeps its average so far.
      if (sampleIndex < PHOENIX_DEEP_SAMPLES) {
        setPhoenixDeepUniforms(state, canvas.width, canvas.height, SAMPLE_OFFSETS[sampleIndex]);
        drawToCanvas(sampleIndex);
      }
      return "perturbation + fixed point";
    }
    gl.useProgram(prog);
    const jitter = SAMPLE_OFFSETS[sampleIndex];
    gl.uniform2f(u.jitter, jitter[0], jitter[1]);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.uniform2f(u.center, state.cx, state.cy);
    gl.uniform1f(u.scale, state.scale);
    const rot = state.rotation || 0;
    gl.uniform1f(u.rotCos, Math.cos(rot));
    gl.uniform1f(u.rotSin, Math.sin(rot));
    gl.uniform1i(u.maxIter, state.maxIter | 0);
    gl.uniform1i(u.ftype, state.ftype);
    gl.uniform1f(u.power, state.power);
    gl.uniform1i(u.isJulia, state.isJulia ? 1 : 0);
    gl.uniform2f(u.juliaC, state.juliaC[0], state.juliaC[1]);
    gl.uniform2f(u.phoenixP, PHOENIX_P[0], PHOENIX_P[1]);
    // Per view, not per pass: every later sample in a refinement chain is
    // the same view (any change restarts at sample 0), and the program
    // keeps its uniforms between draws.
    if (sampleIndex === 0 && isDigitFractal(state.ftype)) {
      const aspect = canvas.width / canvas.height;
      const frame = digitCellFrame(state.ftype, state.cx, state.cy, state.scale, aspect);
      const depth = digitFractalDepth(state.ftype, state.scale, canvas.height, aspect);
      gl.uniform1i(u.digitDepth, depth);
      gl.uniform1f(u.digitCycle, digitColorCycle(state.ftype));
      gl.uniform3fv(u.subPixelColor, digitSubPixelColor(state.ftype, depth, lutBytes));
      gl.uniform1i(u.digitLevel, frame.level);
      gl.uniform2f(u.digitCenter, frame.center[0], frame.center[1]);
      gl.uniform1f(u.digitScale, 2 * state.scale * frame.cellsPerUnit);
      gl.uniform1fv(u.cellHole, frame.holes);
    }

    // See perturbationEligibleType for which types are covered. Also
    // suppressed mid-gesture (see isInteracting) since recomputing the
    // reference orbit every frame during a live pinch/wheel is expensive
    // enough to visibly jank.
    const usePerturbation = perturbationSupported
      && !isInteracting
      && perturbationEligibleType(state)
      && state.scale < DEEP_ZOOM_THRESHOLD;
    gl.uniform1i(u.usePerturbation, usePerturbation ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(u.lut, 0);

    if (!usePerturbation) {
      drawToCanvas(sampleIndex);
      return null;
    }

    const key = [state.ftype, state.cx, state.cy, state.scale, state.rotation || 0,
      state.power, state.maxIter, state.isJulia, state.juliaC[0], state.juliaC[1],
      canvas.width, canvas.height].join(",");
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTex);
    if (key !== refCacheKey) {
      const ref = chooseReference(state, canvas.width, canvas.height);
      const rx = state.cx + ref.dx, ry = state.cy + ref.dy;
      let data, refLen, critOffset, critLen;
      if (state.isJulia) {
        // [view-point orbit | critical orbit] in one texture, see
        // renderEscapePerturbation. At most 2*(maxIter+1) = 4002 texels,
        // within every WebGL device's MAX_TEXTURE_SIZE (4096 minimum in
        // practice).
        const [jr, ji] = state.juliaC;
        const view = computeReferenceOrbit(state, rx, ry, jr, ji);
        const crit = computeReferenceOrbit(state, 0, 0, jr, ji);
        data = new Float32Array(view.data.length + crit.data.length);
        data.set(view.data, 0);
        data.set(crit.data, view.data.length);
        refLen = view.length; critOffset = view.length; critLen = crit.length;
      } else {
        const orbit = computeReferenceOrbit(state, 0, 0, rx, ry);
        data = orbit.data;
        refLen = orbit.length; critOffset = 0; critLen = orbit.length;
      }
      const width = data.length / 4;
      gl.texImage2D(gl.TEXTURE_2D, 0, isWebGL2 ? gl.RGBA32F : gl.RGBA, width, 1, 0, gl.RGBA, gl.FLOAT, data);
      refCache = { dx: ref.dx, dy: ref.dy, refLen, critOffset, critLen, width };
      refCacheKey = key;
    }
    gl.uniform1i(u.refOrbitTex, 1);
    gl.uniform1i(u.refOrbitLen, refCache.refLen);
    gl.uniform1i(u.critOffset, refCache.critOffset);
    gl.uniform1i(u.critLen, refCache.critLen);
    gl.uniform1f(u.refTexWidth, refCache.width);
    gl.uniform2f(u.refOffset, refCache.dx, refCache.dy);
    drawToCanvas(sampleIndex);
    return "perturbation";
  }

  // Deep-zoom gesture preview (see renderAll): on the first call after an
  // accurate render, copy the canvas -- still showing that frame, thanks to
  // preserveDrawingBuffer -- into snapTex, then redraw it mapped onto the
  // current view. The mapping is one similarity transform, snapshot uv =
  // k*R(dRot)*uv + offset, with k, dRot and offset computed here in float64
  // from the two views' difference, so it stays exact at any depth.
  function renderPreview(state) {
    if (resize()) needSnapshot = false; // a resize cleared the canvas
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, snapTex);
    if (needSnapshot && lastView) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // RGB, not RGBA: the context has alpha:false, and WebGL rejects
      // copying components the framebuffer doesn't have.
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, canvas.width, canvas.height, 0);
      snapView = { ...lastView, width: canvas.width, height: canvas.height };
      needSnapshot = false;
    }
    if (!snapView) return;

    const k = state.scale / snapView.scale;
    const dRot = (state.rotation || 0) - snapView.rotation;
    const c = Math.cos(dRot) * k, s = Math.sin(dRot) * k;
    const rc = Math.cos(snapView.rotation), rs = Math.sin(snapView.rotation);
    const dx = state.cx - snapView.cx, dy = state.cy - snapView.cy;
    const inv = 1 / (2 * snapView.scale);

    gl.useProgram(previewProg);
    gl.uniform2f(pu.resolution, canvas.width, canvas.height);
    gl.uniform1i(pu.snap, 4);
    gl.uniform2f(pu.snapRes, snapView.width, snapView.height);
    // Column-major: columns (c, s) and (-s, c) = k * rotation by dRot.
    gl.uniformMatrix2fv(pu.toSnap, false, [c, s, -s, c]);
    // R(-snapRotation) * (center - snapCenter) / (2 * snapScale)
    gl.uniform2f(pu.snapOffset, (dx * rc + dy * rs) * inv, (-dx * rs + dy * rc) * inv);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    canvas, render, renderPreview, setLUT, resize, perturbationSupported,
    // Until its first use, an optimistic yes on WebGL2 (see newtonDeep).
    get newtonDeepSupported() { return newtonDeep !== false; },
    get phoenixDeepSupported() { return phoenixDeep !== false; },
    webgl2: isWebGL2,
    get dpr() { return dpr; },
  };
}

// ---------------------------------------------------------------- app state

const els = {
  hud: document.getElementById("hud"),
  canvasArea: document.getElementById("canvasArea"),
  mainCanvas: document.getElementById("mainCanvas"),
  juliaCanvas: document.getElementById("juliaCanvas"),
  kochCanvas: document.getElementById("kochCanvas"),
  treeCanvas: document.getElementById("treeCanvas"),
  dragonCanvas: document.getElementById("dragonCanvas"),
  fernCanvas: document.getElementById("fernCanvas"),
  boxRect: document.getElementById("boxZoomRect"),
  crosshair: document.getElementById("crosshair"),
  hudName: document.querySelector("#hud .hudName"),
  hudPlain: document.querySelector("#hud .hudPlain"),
  hudStats: document.querySelector("#hud .hudStats"),
  hudScale: document.querySelector("#hud .hudScale"),
  hudBar: document.querySelector("#hud .hudBar"),
  hudScaleText: document.querySelector("#hud .hudScaleText"),
  hudCenter: document.querySelector("#hud .hudCenter"),
  juliaLabel: document.getElementById("juliaLabel"),
  fractalTypeRow: document.getElementById("fractalTypeRow"),
  fractalControls: document.getElementById("fractalControls"),
  kochControls: document.getElementById("kochControls"),
  treeControls: document.getElementById("treeControls"),
  dragonControls: document.getElementById("dragonControls"),
  fernControls: document.getElementById("fernControls"),
  iterField: document.getElementById("iterField"),
  iterSlider: document.getElementById("iterSlider"),
  colormapBtn: document.getElementById("colormapBtn"),
  colormapPill: document.getElementById("colormapPill"),
  dualBtn: document.getElementById("dualBtn"),
  boxZoomBtn: document.getElementById("boxZoomBtn"),
  backBtn: document.getElementById("backBtn"),
  teleportBtn: document.getElementById("teleportBtn"),
  resetBtn: document.getElementById("resetBtn"),
  kochDepthSlider: document.getElementById("kochDepthSlider"),
  kochFillBtn: document.getElementById("kochFillBtn"),
  kochColormapBtn: document.getElementById("kochColormapBtn"),
  kochResetBtn: document.getElementById("kochResetBtn"),
  treeDepthSlider: document.getElementById("treeDepthSlider"),
  treeColormapBtn: document.getElementById("treeColormapBtn"),
  treeResetBtn: document.getElementById("treeResetBtn"),
  dragonDepthSlider: document.getElementById("dragonDepthSlider"),
  dragonColormapBtn: document.getElementById("dragonColormapBtn"),
  dragonResetBtn: document.getElementById("dragonResetBtn"),
  fernPointsSlider: document.getElementById("fernPointsSlider"),
  fernColorBtn: document.getElementById("fernColorBtn"),
  fernColorSwatch: document.getElementById("fernColorSwatch"),
  kochColorSwatch: document.getElementById("kochColorSwatch"),
  treeColorSwatch: document.getElementById("treeColorSwatch"),
  dragonColorSwatch: document.getElementById("dragonColorSwatch"),
  fernResetBtn: document.getElementById("fernResetBtn"),
  fernBoxZoomBtn: document.getElementById("fernBoxZoomBtn"),
  kochBackBtn: document.getElementById("kochBackBtn"),
  treeBackBtn: document.getElementById("treeBackBtn"),
  dragonBackBtn: document.getElementById("dragonBackBtn"),
  fernBackBtn: document.getElementById("fernBackBtn"),
  shareMenu: document.getElementById("shareMenu"),
  colormapMenu: document.getElementById("colormapMenu"),
  shareSaveBtn: document.getElementById("shareSaveBtn"),
  shareCopyBtn: document.getElementById("shareCopyBtn"),
  shareNativeBtn: document.getElementById("shareNativeBtn"),
};

let mode = "fractal"; // "fractal" | "koch" | "tree" | a LINE_CURVES key ("dragon", ...) | an IFS_SYSTEMS key ("fern", ...)
let colormapIndex = 0;
let currentName = "Mandelbrot";
let dualActive = false;
let boxZoomActive = false;
let fernBoxZoomActive = false; // separate toggle: the fern has its own control row
// Info overlay (#hud): hidden by default, one app-wide toggle shared by every
// mode's control row, so it persists across mode switches.
let hudVisible = false;
let activePane = "main"; // "main" | "julia" — which pane Back/box-zoom targets

// Perturbation rendering runs a CPU reference search (chooseReference) plus
// a heavy full-frame GPU pass — slow on mobile, often 100s of ms at high
// maxIter. The main canvas shows a moving preview (see renderAll) for the whole time
// isInteracting is true, so this delay only affects how soon it snaps back
// to an accurate render after you stop — no correctness risk either way,
// just responsiveness.
let isInteracting = false;
let settleTimer = null;
function markInteracting() {
  isInteracting = true;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    isInteracting = false;
    settleTimer = null;
    applyAutoIter();
    requestRender();
  }, 200);
}

const mainRenderer = createFractalRenderer(els.mainCanvas);
const juliaRenderer = createFractalRenderer(els.juliaCanvas);
const kochView = createKochView(els.kochCanvas);
const treeView = createPythagorasTreeView(els.treeCanvas);
const dragonView = createCurveView(els.dragonCanvas);
const fernView = createIfsView(els.fernCanvas);

if (!mainRenderer) reportError("WebGL context creation failed on mainCanvas — this browser/device may not support WebGL.");
if (!juliaRenderer) reportError("WebGL context creation failed on juliaCanvas.");

// iOS Safari has historically been more willing than desktop browsers to
// silently drop a WebGL context under memory pressure — exactly the kind of
// load a deep-zoom perturbation session creates. There's no cheap way to
// reconstruct every GL resource (buffers, textures, compiled shaders, the
// two-pass FBOs) in place, so rather than risk a half-reinitialized,
// subtly-broken renderer, this does the simple, reliable thing: freeze the
// canvas, tell the user, and reload once the context comes back.
[els.mainCanvas, els.juliaCanvas].forEach((canvas) => {
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    reportError("WebGL context lost (likely memory pressure). Waiting to recover — the page will reload automatically once it does.");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    // Carry the current view across the reload as a share link, so a deep
    // zoom isn't lost at exactly the moment memory pressure hits.
    // replaceState, not location.hash: that would fire hashchange, whose
    // handler strips the hash again before the reload commits.
    try { history.replaceState(null, "", location.pathname + location.search + buildShareHash()); } catch { /* reload to the default view */ }
    location.reload();
  });
});

function mainCanvasAspect() {
  const c = els.mainCanvas;
  return c.clientWidth > 0 && c.clientHeight > 0 ? c.clientWidth / c.clientHeight : 1;
}

function freshState(config) {
  const v = viewFromBounds(config.view, mainCanvasAspect());
  return {
    cx: v.cx, cy: v.cy, scale: v.scale, rotation: 0,
    ftype: config.ftype, power: config.power,
    isJulia: config.juliaC !== null,
    juliaC: config.juliaC || [0, 0],
    // Auto iter mode (see applyAutoIter): baseScale is this fractal's
    // opening scale, the zero point of suggestedMaxIter.
    maxIter: suggestedMaxIter(v.scale, v.scale),
    baseScale: v.scale,
    iterAutoLocked: false,
  };
}

// For each pane still in auto iter mode, set maxIter from its zoom level,
// and keep the (single, shared) iter slider showing the active pane's
// value. Called on discrete view changes only -- gesture settle, box zoom,
// Back, fractal select/Reset -- never per frame, so it can't fight a live
// pinch. The slider writes both panes and locks both (see its handler).
// Carpet/Gasket ignore maxIter entirely (usesFixedDepth) and are skipped.
function applyAutoIter() {
  for (const st of [mainState, dualActive ? juliaState : null]) {
    if (!st || st.iterAutoLocked) continue;
    if (isDigitFractal(st.ftype)) continue;
    st.maxIter = suggestedMaxIter(st.baseScale, st.scale);
  }
  const shown = activePane === "julia" && dualActive && juliaState ? juliaState : mainState;
  els.iterSlider.value = shown.maxIter;
}

let mainState = freshState(FRACTAL_CONFIGS[currentName]);
let juliaState = null; // populated when dual mode is entered
let mainHistory = [];
let juliaHistory = [];

const kochState = { depth: 4, fill: true };
const treeState = { depth: 9 };
// Each line curve keeps its own depth; dragonState.depth reads/writes the
// one currently shown, so code written for the dragon alone still works.
const curveDepths = Object.fromEntries(Object.entries(LINE_CURVES).map(([k, c]) => [k, c.defaultDepth]));
const dragonState = {
  get depth() { return curveDepths[dragonView.curve]; },
  set depth(v) { curveDepths[dragonView.curve] = v; },
};
const fernState = { count: 1000000, colorIndex: 0 };
// Solid color (a SOLID_COLORS index) per line/shape mode. The escape-time
// fractals keep the gradient colormapIndex; these used to sample it by
// depth, which left low depths near-black and hard to see.
const solidIndex = (name) => SOLID_COLORS.findIndex((c) => c.name === name);
const vectorColors = {
  koch: solidIndex("Ice"), tree: solidIndex("Green"), dragon: solidIndex("Autumn"),
  hilbert: solidIndex("Violet"), gosper: solidIndex("Rose"), arrowhead: solidIndex("Gold"),
};

function pushHistory(pane) {
  const st = pane === "julia" ? juliaState : mainState;
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  if (!st) return;
  hist.push({ cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation || 0 });
  if (hist.length > 50) hist.shift();
}

function popHistory(pane) {
  const hist = pane === "julia" ? juliaHistory : mainHistory;
  const snap = hist.pop();
  if (!snap) return;
  const st = pane === "julia" ? juliaState : mainState;
  st.cx = snap.cx; st.cy = snap.cy; st.scale = snap.scale; st.rotation = snap.rotation ?? 0;
  applyAutoIter();
  renderAll();
}

// ---------------------------------------------------------------- rendering + layout

function updateLUT() {
  const bytes = buildLUTBytes(COLORMAPS[colormapIndex].stops);
  mainRenderer.setLUT(bytes);
  juliaRenderer.setLUT(bytes);
  const cm = COLORMAPS[colormapIndex];
  els.colormapPill.style.background = cmGradient(cm.stops);
  labelColorButton(els.colormapBtn, "Choose colormap", cm.name);
}

function layoutCanvasArea() {
  const stacked = els.canvasArea.clientWidth < els.canvasArea.clientHeight;
  els.canvasArea.classList.toggle("stacked", dualActive && stacked);
  els.canvasArea.classList.toggle("row", dualActive && !stacked);
}

// The main pane's last render() result: "perturbation", "fixed point" or null.
let lastMainDeepPath = null;

// Below the deep-zoom threshold, a live float32 re-render during an active
// gesture isn't a lower-quality version of the same view — the per-pixel
// offset rounds away entirely against the view center at that scale, so it
// shows what's effectively unrelated content — and a full perturbation
// render per gesture frame is too slow. So while interacting at deep zoom,
// each pane shows its last accurate frame moved with the gesture
// (renderPreview), and renders for real once the gesture settles. A
// CSS-transform version of this preview was tried first and was jumpy; this
// one draws the snapshot through the same float64 view math the renderer
// uses, so it can't drift from where the real render will land.
function deepZoomEligible(renderer, state) {
  return (renderer.perturbationSupported
    && perturbationEligibleType(state)
    && state.scale < DEEP_ZOOM_THRESHOLD)
    || (renderer.newtonDeepSupported && newtonDeepEligible(state))
    || (renderer.phoenixDeepSupported && phoenixDeepEligible(state));
}

function renderAll() {
  updateBackButtons();
  if (mode === "fractal") {
    if (isInteracting && deepZoomEligible(mainRenderer, mainState)) {
      mainRenderer.renderPreview(mainState);
    } else {
      lastMainDeepPath = mainRenderer.render(mainState);
    }

    // The dual-mode Julia pane can be deep-zoomed too (perturbation covers
    // Julia mode), so it gets the same preview while interacting.
    if (dualActive && juliaState) {
      // The Julia pane's c is always the main pane's center, synced here so
      // every way the main view moves (drag, pinch, wheel, keys, Back,
      // teleport, tap-to-glide, share links) carries the Julia set with it.
      // A deep-zoomed Julia pane keeps its last-frame preview while c moves
      // -- a live float32 frame at that depth would be unrelated content --
      // and re-renders for the new c when the gesture settles.
      juliaState.juliaC = [mainState.cx, mainState.cy];
      if (isInteracting && deepZoomEligible(juliaRenderer, juliaState)) {
        juliaRenderer.renderPreview(juliaState);
      } else {
        juliaRenderer.render(juliaState);
      }
      positionCrosshair();
    }
    updateHud();
    scheduleRefinement();
  } else if (mode === "koch") {
    kochView.render({ depth: kochState.depth, fill: kochState.fill, colorIndex: vectorColors.koch });
    updateKochHud();
  } else if (mode === "tree") {
    treeView.render({ depth: treeState.depth, colorIndex: vectorColors.tree });
    updateTreeHud();
  } else if (isCurveMode(mode)) {
    dragonView.render({ depth: dragonState.depth, colorIndex: vectorColors[dragonView.curve] });
    updateDragonHud();
  } else {
    fernView.render({
      count: fernState.count,
      colorIndex: fernState.colorIndex,
      isActive: () => mode === fernView.system,
      onProgress: updateFernHud,
    });
    updateFernHud();
  }
  updateCompasses();
  updateJuliaLabel();
}

// Progressive supersampling: after renderAll draws sample 0, add the rest of
// SAMPLE_OFFSETS one per animation frame. Any later renderAll (every gesture
// frame, colormap change, etc.) bumps refineGeneration, which abandons the
// in-flight chain -- the canvas it was blending into was just overwritten
// by a fresh sample 0 for the new view. Skipped while interacting so
// gestures stay at full frame rate; the settle timer's requestRender then
// starts a fresh chain once the view stops moving.
let refineGeneration = 0;
// False from the moment a render starts a refinement chain until that chain
// draws its last sample; share capture waits on it (captureShareBlob).
let refineDone = true;
function scheduleRefinement() {
  const gen = ++refineGeneration;
  refineDone = false;
  if (isInteracting) return;
  let k = 1;
  const step = () => {
    if (gen !== refineGeneration || mode !== "fractal" || isInteracting) return;
    mainRenderer.render(mainState, k);
    if (dualActive && juliaState) juliaRenderer.render(juliaState, k);
    if (++k < SAMPLE_OFFSETS.length) requestAnimationFrame(step);
    else refineDone = true;
  };
  requestAnimationFrame(step);
}

let renderPending = false;
// Back is dimmed while there's nothing to go back to. Every history push,
// pop or clear is followed by a render (gestures, Back, Reset, fractal and
// mode switches), so renderAll refreshes it instead of each of those sites.
// The vector navs are declared further down; renderAll first runs after
// they exist.
function updateBackButtons() {
  const nav = mode === "koch" ? kochNav : mode === "tree" ? treeNav
    : isCurveMode(mode) ? dragonNav : isIfsMode(mode) ? fernNav : null;
  const canGoBack = nav ? nav.canGoBack() : (activePane === "julia" ? juliaHistory : mainHistory).length > 0;
  const btn = nav ? els[`${isCurveMode(mode) ? "dragon" : isIfsMode(mode) ? "fern" : mode}BackBtn`] : els.backBtn;
  if (btn.disabled === canGoBack) btn.disabled = !canGoBack;
}

function requestRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderAll(); });
}

// Only shown when non-zero. Shared by every mode's HUD (WebGL fractal + all four Canvas2D vector
// views) since they all support the same twist gesture.
function rotationHudText(rotation) {
  const rotDeg = (rotation || 0) * 180 / Math.PI;
  return Math.abs(rotDeg) > 0.5 ? `Rotated ${rotDeg.toFixed(0)}°` : "";
}

// Magnification relative to the fractal's opening view, in words past a
// thousand ("3.1 billion times"): what a person means by "how far in am I".
const ZOOM_WORDS = [[1e15, "quadrillion"], [1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
function formatZoom(baseScale, scale) {
  const z = baseScale / scale;
  if (z < 9.95) return `${Number(z.toFixed(1))}×`;
  if (z < 1000) return `${Math.round(z)}×`;
  const [n, word] = ZOOM_WORDS.find(([limit]) => z >= limit);
  return z / n < 1000 ? `${Number((z / n).toPrecision(2))} ${word} times` : `${z.toExponential(1)}×`;
}

// How deep the view is, for the info card: "415× deeper", "1.8 trillion
// times deeper", "Opening view", or "Zoomed out 2×".
function zoomPhrase(baseScale, scale) {
  const z = baseScale / scale;
  if (Math.abs(Math.log(z)) < 0.05) return "opening view";
  return z < 1 ? `zoomed out ${formatZoom(scale, baseScale)}` : `${formatZoom(baseScale, scale)} deeper`;
}

// Map-style scale bar for a view showing unitsPerPx world units per CSS
// pixel: the 1, 2 or 5 x 10^n length whose bar comes closest to 64px (in
// log terms, so bars stay roughly 40-100px wide), and its label.
function scaleBar(unitsPerPx) {
  const target = 64 * unitsPerPx;
  const e = Math.floor(Math.log10(target));
  let best = null;
  for (const k of [e - 1, e, e + 1]) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** k;
      const d = Math.abs(Math.log(v / target));
      if (!best || d < best.d) best = { v, d, m, k };
    }
  }
  const sup = (n) => String(n).replace("-", "⁻").replace(/\d/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]);
  const label = best.k >= -4 && best.k <= 3 ? String(Number(best.v.toPrecision(1)))
    : best.m === 1 ? `10${sup(best.k)}` : `${best.m} × 10${sup(best.k)}`;
  return { px: best.v / unitsPerPx, label: `${label} across` };
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Info overlay (see #hud in index.html): the title (a place name, or the
// fractal or pattern), a plain-language line (how deep, rotation), a scale
// bar for the pane's height in world units (unitsPerPx), and for the WebGL
// fractals the center point and a quieter technical readout.
// Runs every render frame, so it does nothing while the overlay is hidden
// (showing it re-renders, see applyHudVisibility) or when nothing changed.
let lastHudKey = "";
function setHud(name, plainParts, { unitsPerPx = 0, center = "", tech = "" } = {}) {
  if (!hudVisible) return;
  const parts = plainParts.filter(Boolean);
  const bar = unitsPerPx > 0 && Number.isFinite(unitsPerPx) ? scaleBar(unitsPerPx) : null;
  const key = [name, ...parts, bar && bar.px.toFixed(1), bar && bar.label, center, tech].join("\n");
  if (key === lastHudKey) return;
  lastHudKey = key;
  els.hudName.textContent = name;
  els.hudPlain.replaceChildren(...parts.map((t) => {
    const span = document.createElement("span");
    span.textContent = t;
    return span;
  }));
  els.hudScale.classList.toggle("hidden", !bar);
  if (bar) {
    els.hudBar.style.width = `${bar.px.toFixed(1)}px`;
    els.hudScaleText.textContent = bar.label;
  }
  els.hudCenter.textContent = center;
  els.hudCenter.classList.toggle("hidden", !center);
  els.hudStats.textContent = tech;
  els.hudStats.classList.toggle("hidden", !tech);
}

// Dual view: a small label on the Julia pane, shown with the info card.
function updateJuliaLabel() {
  const show = hudVisible && mode === "fractal" && dualActive;
  els.juliaLabel.classList.toggle("hidden", !show);
  if (!show) return;
  const preset = dualPresetName();
  const text = preset ? `${FRACTAL_CONFIGS[preset].label}: Julia set of the center point` : "Julia set of the center point";
  if (els.juliaLabel.textContent !== text) els.juliaLabel.textContent = text;
  els.juliaLabel.style.top = `${els.juliaCanvas.offsetTop + 10}px`;
  els.juliaLabel.style.left = `${els.juliaCanvas.offsetLeft + 10}px`;
}

// World units per CSS pixel for a pane whose view is 2 * halfHeight tall.
function unitsPerCssPx(halfHeight, canvas) {
  return canvas.clientHeight > 0 ? (2 * halfHeight) / canvas.clientHeight : 0;
}

// Plain decimals while zoomed out (scale >= DEEP_ZOOM_THRESHOLD), where
// "-0.75 + 0.00i / 1.25" reads better than exponents; full-precision
// scientific notation once in deep-zoom territory, where the digits are
// the point.
function formatHudCoords(cx, cy, scale) {
  // Enough decimals to find the spot again from the card alone: the center
  // to within ~1/1000 of the view height (2 * scale), so one more decimal
  // per decade of zoom. Capped at 17, past which a float64 center holds no
  // more digits. Fixed-point at every depth: the precision that matters is
  // absolute, which scientific notation hides for centers near 0.
  const decimals = Math.min(17, Math.max(2, Math.ceil(3 - Math.log10(2 * scale))));
  const fmt = (v) => {
    let t = v.toFixed(decimals);
    // Trim trailing zeros, but keep at least 2 decimals (0.00, not 0).
    while (t.length - t.indexOf(".") - 1 > 2 && t.endsWith("0")) t = t.slice(0, -1);
    return t.replace(/^-(0\.0+)$/, "$1"); // no "-0.00"
  };
  return {
    center: `${fmt(cx)} + ${fmt(cy)}i`,
    scale: scale < DEEP_ZOOM_THRESHOLD ? scale.toExponential(3) : String(Number(scale.toPrecision(3))),
  };
}

function updateHud() {
  const s = mainState;
  const eligibleType = perturbationEligibleType(s);
  // Carpet/Gasket ignore the iter slider entirely (zoom-derived depth in
  // the shader) — showing "maxIter: 300" would misleadingly imply it still
  // does something, the same mismatch that caused the coloring bug.
  const usesFixedDepth = isDigitFractal(s.ftype);
  let precision = "float32";
  if (usesFixedDepth) {
    if (s.scale < DEEP_ZOOM_THRESHOLD) precision = "cell rebasing (deep zoom)";
  } else if (isInteracting && deepZoomEligible(mainRenderer, s)) {
    precision = "preview (renders at deep zoom once you stop)";
  } else if (lastMainDeepPath) {
    precision = `${lastMainDeepPath} (deep zoom)`;
  } else if (s.scale < DEEP_ZOOM_THRESHOLD) {
    // Newton near 0 and Phoenix above 1e-4 are float32 by design (see
    // newtonDeepEligible, PHOENIX_DEEP_THRESHOLD); past that, say why the
    // fixed-point path isn't drawing.
    const fixedReason = mainRenderer.webgl2
      ? "float32 (deep zoom unavailable: failed its self-test on this device)"
      : "float32 (deep zoom unavailable: needs WebGL2)";
    if (s.ftype === FTYPE.NEWTON) {
      if (newtonDeepEligible(s)) precision = fixedReason;
    } else if (s.ftype === FTYPE.PHOENIX) {
      if (phoenixDeepEligible(s)) precision = fixedReason;
    } else if (!mainRenderer.perturbationSupported) {
      precision = "float32 (deep zoom unavailable: no float texture support)";
    } else if (!eligibleType) {
      precision = "float32 (deep zoom unsupported for this fractal type)";
    }
  }
  const c = mainRenderer.canvas;
  const depth = usesFixedDepth ? digitFractalDepth(s.ftype, s.scale, c.height, c.width / c.height) : 0;
  const iterText = usesFixedDepth ? `depth: ${depth} (auto)` : `maxIter: ${s.maxIter}${s.iterAutoLocked ? "" : " (auto)"}`;
  // A Surprise-me destination's name, for as long as the view is still the
  // one the flight landed on -- including its rotation, for a destination
  // that sets one (any turn away from it ends the match; mod 2pi, so a
  // landing at PI still matches a rotation stored as -PI).
  const d = TELEPORT_DESTINATIONS[teleportLandingIndex];
  const sameTurn = !d || d.rotation === undefined || Math.abs(normalizeAngle((s.rotation || 0) - d.rotation)) < 1e-12;
  const place = d && d.fractal === currentName && Number(d.re) === s.cx && Number(d.im) === s.cy && d.scale === s.scale && sameTurn ? d.label : "";
  const f = formatHudCoords(s.cx, s.cy, s.scale);
  const label = fractalLabel(currentName);
  const deep = zoomPhrase(s.baseScale, s.scale);
  setHud(place || label, [
    place ? `${label}, ${deep}` : capitalize(deep),
    rotationHudText(s.rotation),
  ], {
    unitsPerPx: unitsPerCssPx(s.scale, mainRenderer.canvas),
    center: f.center,
    tech: `scale: ${f.scale}   ${iterText}   precision: ${precision}`,
  });
}

// Pattern modes are titled with their picker label (EXTRA_MODES).
function modeLabel(key) {
  return EXTRA_MODES.find((m) => m.key === key).label;
}

// Scale bar for a pattern's view (Canvas2D views keep halfHeight).
const patternBar = (view, canvas) => ({ unitsPerPx: unitsPerCssPx(view.halfHeight, canvas) });

function updateKochHud() {
  setHud(modeLabel("koch"), [`Depth ${kochState.depth}, ${kochState.fill ? "filled" : "outline"}`, rotationHudText(kochView.view.rotation)],
    patternBar(kochView.view, els.kochCanvas));
}

function updateTreeHud() {
  setHud(modeLabel("tree"), [`Depth ${treeState.depth}`, rotationHudText(treeView.view.rotation)],
    patternBar(treeView.view, els.treeCanvas));
}

function updateDragonHud() {
  setHud(modeLabel(dragonView.curve), [`Depth ${dragonState.depth}`, rotationHudText(dragonView.view.rotation)],
    patternBar(dragonView.view, els.dragonCanvas));
}

function updateFernHud() {
  // accepted = points actually on screen so far; it climbs toward the
  // target as refinement runs, and resets on every pan/zoom.
  setHud(modeLabel(fernView.system), [`${fernView.accepted.toLocaleString()} of ${fernState.count.toLocaleString()} points`, rotationHudText(fernView.view.rotation)],
    patternBar(fernView.view, els.fernCanvas));
}

// Dual view's crosshair marks the main pane's center -- the Julia pane's c.
// Like the rotation compass, it shows while the main view moves (and once
// when dual view opens) and fades once it's still.
const crosshairFlash = { hideTimer: null, lastView: null };
function positionCrosshair() {
  if (!dualActive) { els.crosshair.classList.add("hidden"); return; }
  const rect = els.mainCanvas.getBoundingClientRect();
  els.crosshair.classList.remove("hidden");
  els.crosshair.style.left = `${rect.left + rect.width / 2}px`;
  els.crosshair.style.top = `${rect.top + rect.height / 2}px`;
  const v = crosshairFlash.lastView;
  const s = mainState;
  if (!v || v.cx !== s.cx || v.cy !== s.cy || v.scale !== s.scale || v.rotation !== s.rotation) {
    crosshairFlash.lastView = { cx: s.cx, cy: s.cy, scale: s.scale, rotation: s.rotation };
    flash(els.crosshair, crosshairFlash);
  }
}

function screenToComplex(renderer, state, sx, sy) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const uvx = (sx * dpr - 0.5 * canvas.width) / canvas.height;
  const uvy = (0.5 * canvas.height - sy * dpr) / canvas.height;
  const rot = state.rotation || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  // Rotate the screen-space offset into world axes before scaling — must
  // stay in sync with FRAG_SRC's identical rotation of uv, or the rendered
  // fractal and every pointer/gesture computation that goes through this
  // function (pan, box-zoom, the Julia-c crosshair) disagree about "up".
  const wx = uvx * cos - uvy * sin;
  const wy = uvx * sin + uvy * cos;
  return { x: state.cx + wx * state.scale * 2.0, y: state.cy + wy * state.scale * 2.0 };
}

// Wraps an angle to (-PI, PI]. cos/sin are periodic, so this never changes
// what's rendered (rotation=720deg looks identical to 0deg either way) —
// it's purely for the HUD display, which otherwise showed "720deg" instead
// of wrapping back toward 0deg after a couple of full spins, and to keep
// the rotation's cos/sin (computed on the CPU for the shader's
// u_rotCos/u_rotSin) operating on a bounded input rather than one that
// grows without limit over a long session.
function normalizeAngle(a) {
  return ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

// Inverse of screenToComplex, solved for (cx, cy): the center a view would
// need so that local screen point (sx, sy) maps exactly to world point
// (targetX, targetY) at the view's current scale/rotation. This is the
// "grab a point and drag it" primitive — pan uses it directly, and it's
// what the pinch/wheel zoom's before/after-diff anchoring is equivalent to.
function centerForAnchor(renderer, state, sx, sy, targetX, targetY) {
  const canvas = renderer.canvas;
  const dpr = renderer.dpr;
  const uvx = (sx * dpr - 0.5 * canvas.width) / canvas.height;
  const uvy = (0.5 * canvas.height - sy * dpr) / canvas.height;
  const rot = state.rotation || 0;
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const wx = uvx * cos - uvy * sin;
  const wy = uvx * sin + uvy * cos;
  return { cx: targetX - wx * state.scale * 2.0, cy: targetY - wy * state.scale * 2.0 };
}

// ---------------------------------------------------------------- fractal-type / mode switching

// Leaving a fractal stashes its live view here, and picking it again restores
// it, so switching never costs you your place (the colormap is already one
// global). In memory only: a fresh launch starts from the default views.
// Reset and share links want a clean slate and pass { fresh: true }.
const fractalMemory = new Map();

function selectFractal(name, { fresh = false } = {}) {
  cancelTeleport();
  if (dualActive && FRACTAL_CONFIGS[name].dualParent) { openPresetInDual(name); return; }
  // Picking the fractal already showing keeps its view; it only leaves a
  // vector mode (whose switch back lands here too).
  if (!fresh && name === currentName) { setMode("fractal"); return; }
  fractalMemory.set(currentName, { mainState, juliaState, mainHistory, juliaHistory });
  const remembered = fresh ? null : fractalMemory.get(name);
  currentName = name;
  const config = FRACTAL_CONFIGS[name];
  mainState = remembered ? remembered.mainState : freshState(config);
  mainHistory = remembered ? remembered.mainHistory : [];
  juliaHistory = [];
  // Same reasoning as exitDual(): if activePane was left on "julia" from
  // before this switch, Back would try to pop an empty array and silently
  // do nothing.
  activePane = "main";
  if (dualActive && !config.dual) dualActive = false;
  // dualActive stays one app-wide toggle; a remembered Julia pane (its own
  // view and Back history) comes back with its fractal.
  if (dualActive) enterDual(remembered && remembered.juliaState ? remembered : null);
  els.dualBtn.disabled = !config.dual && !config.dualParent;
  els.dualBtn.classList.toggle("active", dualActive);
  // Zoom-only tools. Everything in FRACTAL_CONFIGS is "zoom" today, but the
  // category is the rule; teleport also needs curated destinations, which
  // a new zoom fractal may not have yet.
  const isZoom = config.category === "zoom";
  els.boxZoomBtn.classList.toggle("hidden", !isZoom);
  els.teleportBtn.classList.toggle("hidden", !isZoom || !TELEPORT_DESTINATIONS.some((d) => d.fractal === name));
  // Carpet/Gasket use a zoom-derived depth (see FRAG_SRC) — the iter slider does
  // nothing for them, and leaving it enabled implied otherwise, which is
  // exactly the mismatch that made them render as almost solid black
  // before that was caught and fixed.
  const usesFixedDepth = isDigitFractal(config.ftype);
  els.iterSlider.disabled = usesFixedDepth;
  els.iterField.classList.toggle("hidden", usesFixedDepth);
  els.juliaCanvas.classList.toggle("hidden", !dualActive);
  if (!dualActive) els.crosshair.classList.add("hidden");
  layoutCanvasArea();
  setMode("fractal");
  // Refit now that layout is final: freshState ran above while the canvas
  // could still be hidden (coming from a vector mode) or about to change
  // size (Julia pane / iter slider shown or hidden). setMode only schedules
  // the render, so it picks this up. A remembered view is left as it was.
  if (!remembered) {
    const fitted = viewFromBounds(config.view, mainCanvasAspect());
    Object.assign(mainState, fitted, { baseScale: fitted.scale });
  }
  // A new fractal (or Reset) starts in auto iter mode; a remembered one
  // keeps its lock, and auto mode re-derives from its zoom.
  applyAutoIter();
}

// from: a remembered { juliaState, juliaHistory } (see selectFractal) to bring
// back instead of opening a fresh Julia pane.
function enterDual(from = null) {
  const config = FRACTAL_CONFIGS[currentName];
  if (!config.dual) return;
  dualActive = true;
  juliaState = from ? from.juliaState : {
    cx: 0, cy: 0, scale: mainState.scale, rotation: 0,
    ftype: mainState.ftype, power: mainState.power,
    isJulia: true, juliaC: [mainState.cx, mainState.cy],
    maxIter: mainState.maxIter,
    // The slider drives both panes, so a manual lock carries over; auto
    // mode counts zoom from this pane's own opening scale.
    baseScale: mainState.scale,
    iterAutoLocked: mainState.iterAutoLocked,
  };
  // c is the main pane's center, whichever pane this is.
  juliaState.juliaC = [mainState.cx, mainState.cy];
  crosshairFlash.lastView = null; // flash the crosshair as dual view opens
  juliaHistory = from ? from.juliaHistory : [];
  els.juliaCanvas.classList.remove("hidden");
  layoutCanvasArea();
  requestRender();
}

// A Julia preset in dual view: its parent set (dualParent) in the main pane,
// centered on the preset's c and zoomed in PRESET_DUAL_ZOOM times so you can
// see which part of the set c is in (the crosshair marks it), and the preset
// in the Julia pane -- at its opening framing, or at juliaView (the preset's
// own view, when the dual button is pressed on it). Panning the main pane
// moves c as usual; the Julia pane's label names the preset until it does.
const PRESET_DUAL_ZOOM = 4;
let dualPreset = null; // { name, c } of the last preset opened this way
function openPresetInDual(name, juliaView = null) {
  const preset = FRACTAL_CONFIGS[name];
  const [cx, cy] = preset.juliaC;
  dualActive = true;
  selectFractal(preset.dualParent, { fresh: true });
  Object.assign(mainState, { cx, cy, scale: mainState.baseScale / PRESET_DUAL_ZOOM });
  const jc = els.juliaCanvas;
  const aspect = jc.clientWidth > 0 && jc.clientHeight > 0 ? jc.clientWidth / jc.clientHeight : 1;
  const opening = viewFromBounds(preset.view, aspect);
  const jv = juliaView || { ...opening, rotation: 0, baseScale: opening.scale };
  Object.assign(juliaState, { cx: jv.cx, cy: jv.cy, scale: jv.scale, rotation: jv.rotation, baseScale: jv.baseScale, juliaC: [cx, cy] });
  if (juliaView && juliaView.iterAutoLocked) Object.assign(juliaState, { maxIter: juliaView.maxIter, iterAutoLocked: true });
  dualPreset = { name, c: [cx, cy] };
  applyAutoIter();
  requestRender();
}

// The preset whose c the main pane is still centered on, if any.
function dualPresetName() {
  if (!dualActive || !dualPreset) return null;
  const p = FRACTAL_CONFIGS[dualPreset.name];
  return currentName === p.dualParent && mainState.cx === dualPreset.c[0] && mainState.cy === dualPreset.c[1] ? dualPreset.name : null;
}

function exitDual() {
  dualActive = false;
  // Without this, Back (popHistory(activePane)) silently pops the now-
  // hidden juliaState/juliaHistory if the julia pane was the last one
  // touched -- nothing visibly changes, so Back appears dead until the
  // main canvas is tapped again (which resets activePane itself).
  activePane = "main";
  els.juliaCanvas.classList.add("hidden");
  els.crosshair.classList.add("hidden");
  layoutCanvasArea();
  requestRender();
}

function setMode(next) {
  stopDepthPlay();
  mode = next;
  els.fractalTypeRow.classList.remove("open"); // collapse the picker on any mode switch
  els.shareMenu.classList.remove("open");
  els.colormapMenu.classList.remove("open");
  els.fractalControls.classList.toggle("hidden", mode !== "fractal");
  els.kochControls.classList.toggle("hidden", mode !== "koch");
  els.treeControls.classList.toggle("hidden", mode !== "tree");
  els.dragonControls.classList.toggle("hidden", !isCurveMode(mode));
  els.fernControls.classList.toggle("hidden", !isIfsMode(mode));
  els.mainCanvas.classList.toggle("hidden", mode !== "fractal");
  els.juliaCanvas.classList.toggle("hidden", mode !== "fractal" || !dualActive);
  els.kochCanvas.classList.toggle("hidden", mode !== "koch");
  els.treeCanvas.classList.toggle("hidden", mode !== "tree");
  els.dragonCanvas.classList.toggle("hidden", !isCurveMode(mode));
  if (isCurveMode(mode)) {
    // Same sharing as the IFS modes below, plus the depth slider, whose
    // range is per curve.
    if (dragonView.curve !== mode) {
      dragonView.setCurve(mode);
      dragonNav.clearHistory();
    }
    updateColorSwatches();
    els.dragonDepthSlider.min = LINE_CURVES[mode].minDepth || 0;
    els.dragonDepthSlider.max = LINE_CURVES[mode].maxDepth;
    els.dragonDepthSlider.value = dragonState.depth;
  }
  els.fernCanvas.classList.toggle("hidden", !isIfsMode(mode));
  // The IFS modes share fernView: point it at this mode's transforms (it
  // keeps each one's pan/zoom). Back history belongs to the previous one.
  if (isIfsMode(mode) && fernView.system !== mode) {
    fernView.setSystem(mode);
    fernNav.clearHistory();
  }
  // First visit to a vector mode: fit its view now that its canvas is
  // visible and has a real size (later visits keep wherever you left it).
  if (mode !== "fractal" && !fittedVectorModes.has(mode)) fitVectorView(mode);
  updateMenuActiveState();
  requestRender();
}

// Highlights whichever hamburger-menu entry matches the current mode/
// selection — a FRACTAL_CONFIGS entry (dataset.name) only counts while in
// fractal mode, an EXTRA_MODES entry (dataset.mode) whenever mode matches it.
function updateMenuActiveState() {
  els.fractalTypeRow.querySelectorAll("button").forEach((btn) => {
    const isActive = btn.dataset.mode
      ? btn.dataset.mode === mode
      : mode === "fractal" && btn.dataset.name === currentName;
    btn.classList.toggle("active", isActive);
  });
}

// ---------------------------------------------------------------- interaction: fractal canvases

function attachFractalInteraction(canvas, getState, paneName, renderer) {
  const pointers = new Map();
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartScale = null;
  let pinchStartAngle = null;
  let pinchStartRotation = null;
  let downPos = null;
  let lastZoomPush = 0;
  // True for the whole span from a second finger touching down until every
  // finger has lifted — guards the tap-to-set-Julia-c check below, which
  // otherwise fires on the LAST finger of a pinch/rotate to release: downPos
  // gets overwritten by every pointerdown (not tracked per-pointer), so once
  // the first finger lifts, the remaining (second) finger's release is
  // checked against ITS OWN down position, and a finger that acted as a
  // relatively stationary pinch/rotate anchor can easily stay under the 6px
  // tap threshold from where IT went down, even though a real two-finger
  // gesture happened.
  let multiTouch = false;

  function screenToWorldHere(sx, sy) {
    return screenToComplex(renderer, getState(), sx, sy);
  }

  // screenToComplex expects coordinates relative to this canvas's own
  // top-left corner, but pointer/wheel events report page-relative
  // clientX/clientY — the canvas isn't flush with the page origin (the HUD
  // sits above it, and in dual mode the Julia pane sits beside/below it), so
  // this offset must be subtracted before any zoom-anchoring math.
  function toLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  canvas.addEventListener("pointerdown", (e) => {
    cancelTeleport();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) multiTouch = true;
    activePane = paneName;
    downPos = { x: e.clientX, y: e.clientY };

    if (boxZoomActive) {
      // The main canvas can be showing a frozen, stale frame if this drag
      // starts while a previous gesture's settle delay hasn't fired yet
      // (see markInteracting/renderAll) — force it caught up to the actual
      // current state first, so the box is always drawn on top of exactly
      // the pixels commitBoxZoom's math will use.
      if (isInteracting) {
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
        isInteracting = false;
        renderAll();
      }
      // boxRect is position:fixed, so its geometry lives entirely in
      // viewport (clientX/clientY) coordinates during the drag — storing
      // the start point here and reusing it directly in pointermove avoids
      // re-deriving it via a fresh canvas rect on every move, which used to
      // drift the box whenever the canvas's on-screen position shifted
      // mid-drag (e.g. Safari's toolbar collapsing/expanding).
      els.boxRect.classList.remove("hidden");
      els.boxRect.dataset.pane = paneName;
      els.boxRect.dataset.startClientX = e.clientX;
      els.boxRect.dataset.startClientY = e.clientY;
      els.boxRect.style.left = `${e.clientX}px`;
      els.boxRect.style.top = `${e.clientY}px`;
      els.boxRect.style.width = "0px";
      els.boxRect.style.height = "0px";
      return;
    }

    if (pointers.size === 1) {
      // Anchor on the world point under the finger, not a screen-space
      // delta from it — a delta-based pan doesn't generalize to a rotated
      // view (see centerForAnchor), and this is exact regardless of
      // rotation.
      const local = toLocal(e.clientX, e.clientY);
      const world = screenToWorldHere(local.x, local.y);
      panStart = { worldX: world.x, worldY: world.y };
      // Pinch/wheel/box-zoom all push a history checkpoint before they
      // change the view; a plain one-finger drag never did, so Back after
      // zoom -> drag skipped straight past the drag to the pre-zoom state,
      // silently discarding the pan. Matches the pinch branch below exactly
      // (push immediately at gesture start, before any movement).
      pushHistory(paneName);
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartScale = getState().scale;
      pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchStartRotation = getState().rotation || 0;
      pushHistory(paneName);
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (boxZoomActive && els.boxRect.dataset.pane === paneName && !els.boxRect.classList.contains("hidden")) {
      const startClientX = parseFloat(els.boxRect.dataset.startClientX);
      const startClientY = parseFloat(els.boxRect.dataset.startClientY);
      const left = Math.min(startClientX, e.clientX);
      const top = Math.min(startClientY, e.clientY);
      els.boxRect.style.left = `${left}px`;
      els.boxRect.style.top = `${top}px`;
      els.boxRect.style.width = `${Math.abs(e.clientX - startClientX)}px`;
      els.boxRect.style.height = `${Math.abs(e.clientY - startClientY)}px`;
      return;
    }

    const st = getState();
    if (pointers.size === 1 && panStart) {
      const local = toLocal(e.clientX, e.clientY);
      const anchored = centerForAnchor(renderer, st, local.x, local.y, panStart.worldX, panStart.worldY);
      st.cx = anchored.cx;
      st.cy = anchored.cy;
      markInteracting();
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midClient = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const mid = toLocal(midClient.x, midClient.y);
      const before = screenToWorldHere(mid.x, mid.y);
      st.scale = pinchStartScale * (pinchStartDist / Math.max(dist, 1));
      // Two-finger twist: rotate by however much the finger-pair's angle has
      // changed since the gesture started. Setting rotation here, before
      // recomputing `after`, means the existing before/after anchor trick
      // below keeps the midpoint under the fingers stable under combined
      // pinch+rotate, exactly like it already does for pinch+pan.
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      st.rotation = normalizeAngle(pinchStartRotation + (angle - pinchStartAngle));
      const after = screenToWorldHere(mid.x, mid.y);
      st.cx += before.x - after.x;
      st.cy += before.y - after.y;
      markInteracting();
      requestRender();
    }
  });

  function release(e) {
    if (boxZoomActive && els.boxRect.dataset.pane === paneName && !els.boxRect.classList.contains("hidden")) {
      commitBoxZoom(paneName, getState(), renderer, canvas);
      els.boxRect.classList.add("hidden");
      pointers.delete(e.pointerId);
      if (pointers.size === 0) multiTouch = false;
      return;
    }

    // Tap-to-recenter: only on the main pane while dual mode is active,
    // only if the pointer barely moved (a click, not a drag), and only
    // outside a multi-touch gesture -- downPos isn't tracked per-pointer,
    // so without the multiTouch guard the last finger to lift from a
    // pinch/rotate gets checked against its OWN down position and can read
    // as a "tap" even though two fingers were down (see multiTouch's
    // comment above).
    if (paneName === "main" && dualActive && downPos && pointers.size === 1 && !multiTouch) {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved < 6) {
        const local = toLocal(e.clientX, e.clientY);
        const world = screenToWorldHere(local.x, local.y);
        glideMainTo(world.x, world.y); // the Julia pane follows the center

      }
    }

    pointers.delete(e.pointerId);
    if (pointers.size === 0) multiTouch = false;
    if (pointers.size === 1) {
      const [p] = pointers.values();
      const local = toLocal(p.x, p.y);
      const world = screenToWorldHere(local.x, local.y);
      panStart = { worldX: world.x, worldY: world.y };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
    pinchStartAngle = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (boxZoomActive) return;
    cancelTeleport();
    activePane = paneName;
    const now = performance.now();
    if (now - lastZoomPush > 400) { pushHistory(paneName); lastZoomPush = now; }
    const st = getState();
    const local = toLocal(e.clientX, e.clientY);
    const before = screenToWorldHere(local.x, local.y);
    st.scale *= Math.exp(e.deltaY * 0.0015);
    const after = screenToWorldHere(local.x, local.y);
    st.cx += before.x - after.x;
    st.cy += before.y - after.y;
    markInteracting();
    requestRender();
  }, { passive: false });
}

function commitBoxZoom(paneName, state, renderer, canvas) {
  const rect = canvas.getBoundingClientRect();
  const left = parseFloat(els.boxRect.style.left) - rect.left;
  const top = parseFloat(els.boxRect.style.top) - rect.top;
  const w = parseFloat(els.boxRect.style.width);
  const h = parseFloat(els.boxRect.style.height);
  if (w < 4 || h < 4) return;

  // Center: the world point under the box's screen-center. A single-point
  // query through screenToComplex is exact at any rotation.
  const centerPoint = screenToComplex(renderer, state, left + w / 2, top + h / 2);

  // Half-extents: derived from the box's on-screen size and the current
  // scale directly, NOT from subtracting two rotated corners (c2 - c1) —
  // rotation is a rigid transform, so it doesn't change how many world
  // units a screen pixel spans, but it does rotate the corner-difference
  // vector, which would silently distort this if rotation is nonzero.
  // (Reduces to the exact previous corner-difference formula at rotation=0,
  // verified by hand before this was shipped.)
  const dpr = renderer.dpr;
  const halfW = (w / 2) * dpr / canvas.height * state.scale * 2.0;
  const halfH = (h / 2) * dpr / canvas.height * state.scale * 2.0;
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const newScale = Math.max(halfH, halfW / Math.max(aspect, 1e-6));

  pushHistory(paneName);
  const cx = centerPoint.x, cy = centerPoint.y;
  // rotation is intentionally left unchanged — box-zoom reframes, it
  // doesn't reorient
  state.cx = cx; state.cy = cy; state.scale = newScale;
  applyAutoIter();
  requestRender();
}

attachFractalInteraction(els.mainCanvas, () => mainState, "main", mainRenderer);
attachFractalInteraction(els.juliaCanvas, () => juliaState, "julia", juliaRenderer);

// ---------------------------------------------------------------- interaction: Koch canvas

// Shared pan/pinch-zoom/wheel-zoom for any Canvas2D vector view (Koch,
// Pythagoras tree) — both createKochView() and createPythagorasTreeView()
// return the same shape ({view, dpr, screenToWorld, ...}), so this one
// function covers both instead of duplicating the gesture logic per mode,
// the way attachFractalInteraction is the single shared handler for the
// two WebGL canvases.
// isBoxZoomActive (optional): when it returns true, a one-finger drag draws
// the shared #boxZoomRect and zooms to it on release instead of panning --
// the vector-view analog of the WebGL panes' box zoom (commitBoxZoom).
//
// Returns { back, clearHistory, checkpoint }: each vector view keeps its own
// pan/zoom history stack, checkpointed at the same moments
// attachFractalInteraction pushes for the WebGL panes (one-finger drag
// start, pinch start, wheel zoom throttled to one checkpoint per 400ms
// burst, box-zoom commit). checkpoint() is that same throttled push, for
// keyboard navigation.
function attachVectorViewInteraction(canvas, vectorView, isBoxZoomActive = () => false) {
  const pointers = new Map();
  const history = [];
  let lastWheelPush = 0;
  function pushViewHistory() {
    const v = vectorView.view;
    history.push({ cx: v.cx, cy: v.cy, halfHeight: v.halfHeight, rotation: v.rotation || 0 });
    if (history.length > 50) history.shift();
  }
  function back() {
    const snap = history.pop();
    if (!snap) return;
    Object.assign(vectorView.view, snap);
    requestRender();
  }
  const boxPane = `vector:${canvas.id}`;
  const boxDragging = () => isBoxZoomActive()
    && els.boxRect.dataset.pane === boxPane && !els.boxRect.classList.contains("hidden");

  // Same rotation-safe construction as commitBoxZoom: the new center is the
  // world point under the box's screen-center (one screenToWorld query,
  // exact at any rotation), and the new half-height comes from the box's
  // on-screen size, never from differencing two rotated corners. Rotation
  // is left unchanged -- box zoom reframes, it doesn't reorient.
  function commitVectorBoxZoom() {
    const rect = canvas.getBoundingClientRect();
    const w = parseFloat(els.boxRect.style.width);
    const h = parseFloat(els.boxRect.style.height);
    if (w < 4 || h < 4) return;
    const dpr = vectorView.dpr;
    const sx = (parseFloat(els.boxRect.style.left) - rect.left + w / 2) * dpr;
    const sy = (parseFloat(els.boxRect.style.top) - rect.top + h / 2) * dpr;
    const [cx, cy] = vectorView.screenToWorld(sx, sy);
    // halfHeight world units span canvas.height/2 device pixels.
    const unitsPerPx = vectorView.view.halfHeight / (canvas.height / 2);
    const halfH = (h / 2) * dpr * unitsPerPx;
    const halfW = (w / 2) * dpr * unitsPerPx;
    const aspect = canvas.width / canvas.height;
    pushViewHistory();
    vectorView.view.cx = cx;
    vectorView.view.cy = cy;
    vectorView.view.halfHeight = Math.max(halfH, halfW / Math.max(aspect, 1e-6));
    requestRender();
  }
  let panStart = null;
  let pinchStartDist = null;
  let pinchStartHalfHeight = null;
  let pinchStartAngle = null;
  let pinchStartRotation = null;

  // Given a canvas-pixel (dpr-scaled) screen point and the world point that
  // should end up under it, solves for the view center that makes that so
  // — the vector-view analog of centerForAnchor above, needed once these
  // views can rotate (a plain screen-delta pan, which this replaced,
  // doesn't generalize to a rotated view for the same reason
  // centerForAnchor's own comment gives).
  function centerForVectorAnchor(sx, sy, targetX, targetY) {
    const uvx = (sx - canvas.width / 2) / (canvas.height / 2);
    const uvy = (canvas.height / 2 - sy) / (canvas.height / 2);
    const rot = vectorView.view.rotation || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const wx = uvx * cos - uvy * sin;
    const wy = uvx * sin + uvy * cos;
    return {
      cx: targetX - wx * vectorView.view.halfHeight,
      cy: targetY - wy * vectorView.view.halfHeight,
    };
  }

  function localPixel(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: (clientX - rect.left) * vectorView.dpr, y: (clientY - rect.top) * vectorView.dpr };
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isBoxZoomActive() && pointers.size === 1) {
      // Same viewport-coordinate bookkeeping as the WebGL panes' box zoom
      // (see attachFractalInteraction's pointerdown for why).
      els.boxRect.classList.remove("hidden");
      els.boxRect.dataset.pane = boxPane;
      els.boxRect.dataset.startClientX = e.clientX;
      els.boxRect.dataset.startClientY = e.clientY;
      els.boxRect.style.left = `${e.clientX}px`;
      els.boxRect.style.top = `${e.clientY}px`;
      els.boxRect.style.width = "0px";
      els.boxRect.style.height = "0px";
      return;
    }
    if (pointers.size === 1) {
      const p = localPixel(e.clientX, e.clientY);
      const world = vectorView.screenToWorld(p.x, p.y);
      panStart = { worldX: world[0], worldY: world[1] };
      pushViewHistory();
    } else if (pointers.size === 2) {
      panStart = null;
      const pts = [...pointers.values()];
      pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartHalfHeight = vectorView.view.halfHeight;
      pinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      pinchStartRotation = vectorView.view.rotation || 0;
      pushViewHistory();
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (boxDragging()) {
      const startClientX = parseFloat(els.boxRect.dataset.startClientX);
      const startClientY = parseFloat(els.boxRect.dataset.startClientY);
      els.boxRect.style.left = `${Math.min(startClientX, e.clientX)}px`;
      els.boxRect.style.top = `${Math.min(startClientY, e.clientY)}px`;
      els.boxRect.style.width = `${Math.abs(e.clientX - startClientX)}px`;
      els.boxRect.style.height = `${Math.abs(e.clientY - startClientY)}px`;
      return;
    }
    if (pointers.size === 1 && panStart) {
      const p = localPixel(e.clientX, e.clientY);
      const anchored = centerForVectorAnchor(p.x, p.y, panStart.worldX, panStart.worldY);
      vectorView.view.cx = anchored.cx;
      vectorView.view.cy = anchored.cy;
      requestRender();
    } else if (pointers.size === 2 && pinchStartDist) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const rect = canvas.getBoundingClientRect();
      const midX = ((pts[0].x + pts[1].x) / 2 - rect.left) * vectorView.dpr;
      const midY = ((pts[0].y + pts[1].y) / 2 - rect.top) * vectorView.dpr;
      const before = vectorView.screenToWorld(midX, midY);
      vectorView.view.halfHeight = pinchStartHalfHeight * (pinchStartDist / Math.max(dist, 1));
      // Two-finger twist, same convention as attachFractalInteraction:
      // set rotation before recomputing `after` so the before/after anchor
      // trick keeps the midpoint stable under combined pinch+rotate.
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      vectorView.view.rotation = normalizeAngle(pinchStartRotation + (angle - pinchStartAngle));
      const after = vectorView.screenToWorld(midX, midY);
      vectorView.view.cx += before[0] - after[0];
      vectorView.view.cy += before[1] - after[1];
      requestRender();
    }
  });

  function release(e) {
    if (boxDragging()) {
      commitVectorBoxZoom();
      els.boxRect.classList.add("hidden");
      pointers.delete(e.pointerId);
      return;
    }
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [p] = pointers.values();
      const local = localPixel(p.x, p.y);
      const world = vectorView.screenToWorld(local.x, local.y);
      panStart = { worldX: world[0], worldY: world[1] };
    } else {
      panStart = null;
    }
    pinchStartDist = null;
    pinchStartAngle = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function checkpoint() {
    const now = performance.now();
    if (now - lastWheelPush > 400) { pushViewHistory(); lastWheelPush = now; }
  }

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (isBoxZoomActive()) return;
    checkpoint();
    const rect = canvas.getBoundingClientRect();
    const sx = (e.clientX - rect.left) * vectorView.dpr;
    const sy = (e.clientY - rect.top) * vectorView.dpr;
    const before = vectorView.screenToWorld(sx, sy);
    vectorView.view.halfHeight *= Math.exp(e.deltaY * 0.0015);
    const after = vectorView.screenToWorld(sx, sy);
    vectorView.view.cx += before[0] - after[0];
    vectorView.view.cy += before[1] - after[1];
    requestRender();
  }, { passive: false });

  return { back, checkpoint, clearHistory: () => { history.length = 0; }, canGoBack: () => history.length > 0 };
}

// The region each vector view shows in full when its mode first opens and
// on Reset: the measured extent of its geometry plus a small margin, fitted
// to the canvas aspect with the same viewFromBounds the WebGL fractals use
// (a fixed zoom level cut the sides off wide shapes on portrait phones).
// Koch spans x +-0.866, y +-1; the tree (depth 12) x +-2.95, y 0..3.95; the
// fern FERN_BOUNDS. The dragon rotates 45 degrees per depth level, so a
// box covering every depth would open it badly zoomed out -- it's fitted
// to the current depth instead.
function vectorViewBox(modeKey) {
  if (modeKey === "koch") return [-0.95, 0.95, -1.08, 1.08];
  if (modeKey === "tree") return [-3.1, 3.1, -0.15, 4.1];
  if (modeKey === "fern") return [-2.4, 2.9, -0.2, 10.25];
  if (isIfsMode(modeKey)) {
    const [x0, x1, y0, y1] = ifsData(modeKey).bounds;
    const m = 0.04 * Math.max(x1 - x0, y1 - y0);
    return [x0 - m, x1 + m, y0 - m, y1 + m];
  }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of LINE_CURVES[modeKey].points(dragonState.depth)) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const m = 0.06 * Math.max(x1 - x0, y1 - y0);
  return [x0 - m, x1 + m, y0 - m, y1 + m];
}

const VECTOR_VIEWS = {
  koch: [kochView, els.kochCanvas], tree: [treeView, els.treeCanvas],
  dragon: [dragonView, els.dragonCanvas], fern: [fernView, els.fernCanvas],
  sierpinski: [fernView, els.fernCanvas], levy: [fernView, els.fernCanvas],
  vicsek: [fernView, els.fernCanvas],
  hilbert: [dragonView, els.dragonCanvas], gosper: [dragonView, els.dragonCanvas],
  arrowhead: [dragonView, els.dragonCanvas],
};
const fittedVectorModes = new Set();
function fitVectorView(modeKey) {
  const [vectorView, canvas] = VECTOR_VIEWS[modeKey];
  const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1;
  const v = viewFromBounds(vectorViewBox(modeKey), aspect);
  Object.assign(vectorView.view, { cx: v.cx, cy: v.cy, halfHeight: v.scale, rotation: 0 });
  fittedVectorModes.add(modeKey);
}

const kochNav = attachVectorViewInteraction(els.kochCanvas, kochView);
const treeNav = attachVectorViewInteraction(els.treeCanvas, treeView);
const dragonNav = attachVectorViewInteraction(els.dragonCanvas, dragonView);
const fernNav = attachVectorViewInteraction(els.fernCanvas, fernView, () => fernBoxZoomActive);
els.kochBackBtn.addEventListener("click", () => kochNav.back());
els.treeBackBtn.addEventListener("click", () => treeNav.back());
els.dragonBackBtn.addEventListener("click", () => dragonNav.back());
els.fernBackBtn.addEventListener("click", () => fernNav.back());

// ---------------------------------------------------------------- interaction: keyboard

// Desktop keyboard navigation for every mode: arrows pan, Shift+Left/Right
// rotate (Google Maps' convention; Ctrl+arrows switch Spaces on macOS),
// +/- zoom about the center, R resets. Everything is expressed in screen
// terms and mapped through the view's own screen-to-world function, so
// "up" is always screen-up however the view is rotated. Held keys
// auto-repeat; history is checkpointed once per 400ms burst, like the
// wheel, so one Back undoes a whole held-key move.
const KEY_PAN_FRACTION = 0.1;              // of the canvas's shorter side
const KEY_ZOOM_FACTOR = 1.25;
const KEY_ROTATE_STEP = 5 * Math.PI / 180; // + is clockwise, like the twist

function keyAction(e) {
  const k = e.key;
  if (e.shiftKey && (k === "ArrowLeft" || k === "ArrowRight")) {
    return { rotate: k === "ArrowRight" ? KEY_ROTATE_STEP : -KEY_ROTATE_STEP };
  }
  if (e.shiftKey && (k === "ArrowUp" || k === "ArrowDown")) return null;
  if (k === "ArrowLeft") return { pan: [-1, 0] };
  if (k === "ArrowRight") return { pan: [1, 0] };
  if (k === "ArrowUp") return { pan: [0, -1] };   // screen y grows downward
  if (k === "ArrowDown") return { pan: [0, 1] };
  if (k === "+" || k === "=") return { zoom: 1 / KEY_ZOOM_FACTOR };
  if (k === "-" || k === "_") return { zoom: KEY_ZOOM_FACTOR };
  if ((k === "r" || k === "R") && !e.shiftKey) return { reset: true };
  return null;
}

// The vector view, its canvas, nav (history) and Reset button for the
// active non-fractal mode.
function activeVectorTarget() {
  if (mode === "koch") return { v: kochView, canvas: els.kochCanvas, nav: kochNav, resetBtn: els.kochResetBtn };
  if (mode === "tree") return { v: treeView, canvas: els.treeCanvas, nav: treeNav, resetBtn: els.treeResetBtn };
  if (isCurveMode(mode)) return { v: dragonView, canvas: els.dragonCanvas, nav: dragonNav, resetBtn: els.dragonResetBtn };
  if (isIfsMode(mode)) return { v: fernView, canvas: els.fernCanvas, nav: fernNav, resetBtn: els.fernResetBtn };
  return null;
}

// ---------------------------------------------------------------- compass

// Shows el (class "shown") and hides it FLASH_HIDE_MS after the last call;
// holder keeps the pending timer. Shared by the compass and the dual-view
// crosshair.
const FLASH_HIDE_MS = 1500;
function flash(el, holder, onHide) {
  el.classList.add("shown");
  if (holder.hideTimer) clearTimeout(holder.hideTimer);
  holder.hideTimer = setTimeout(() => {
    holder.hideTimer = null;
    el.classList.remove("shown");
    if (onHide) onHide();
  }, FLASH_HIDE_MS);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A compass per rotatable pane that fades in while the view rotates and out
// once it's been still for FLASH_HIDE_MS; tapping it animates the rotation
// back to 0 (touch has no other rotation-only reset -- keyboard R resets the
// whole view). It watches each pane's rotation from renderAll, so every
// source of rotation (twist, Shift+arrows, Back, the reset animation itself)
// shows it without hooking each one. Small twists are ignored: every pinch
// changes the angle a little, so the compass only appears once the rotation
// has moved COMPASS_SHOW_RAD from where it was when the compass last hid.
const COMPASS_SHOW_RAD = 3 * Math.PI / 180;
const COMPASS_RESET_MS = 350;
const compasses = {}; // pane key -> { el, needle, anchor, context, hideTimer }

// The rotatable panes currently on screen: key, canvas, and get/set of the
// view's rotation, plus a history checkpoint so Back undoes a reset.
function rotatablePanes() {
  if (mode === "fractal") {
    const panes = [{ key: "main", canvas: els.mainCanvas, st: mainState, fractalPane: "main" }];
    if (dualActive && juliaState) panes.push({ key: "julia", canvas: els.juliaCanvas, st: juliaState, fractalPane: "julia" });
    return panes;
  }
  const target = activeVectorTarget();
  return target ? [{ key: "vector", canvas: target.canvas, st: target.v.view, nav: target.nav }] : [];
}

function getCompass(key) {
  if (compasses[key]) return compasses[key];
  const el = document.createElement("button");
  el.className = "compass";
  el.setAttribute("aria-label", "Reset rotation");
  el.title = "Reset rotation";
  el.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><g>
    <polygon points="20,6 24.5,20 15.5,20" fill="#ff453a"/>
    <polygon points="20,34 24.5,20 15.5,20" fill="#d8d8dc"/>
    <circle cx="20" cy="20" r="2" fill="#1c1c1e"/></g></svg>`;
  const c = { el, needle: el.querySelector("g"), anchor: null, lastRot: null, context: null, hideTimer: null };
  el.addEventListener("click", () => resetRotation(key));
  document.body.appendChild(el);
  compasses[key] = c;
  return c;
}

function hideCompass(c) {
  c.el.classList.remove("shown");
  if (c.hideTimer) { clearTimeout(c.hideTimer); c.hideTimer = null; }
}

function updateCompasses() {
  const panes = rotatablePanes();
  const context = `${mode}|${currentName}|${dualActive}`;
  for (const key of Object.keys(compasses)) {
    if (!panes.some((p) => p.key === key)) hideCompass(compasses[key]);
  }
  for (const p of panes) {
    const c = getCompass(p.key);
    const rot = p.st.rotation || 0;
    // A different fractal/mode/layout starts fresh: no flash for the jump.
    if (c.context !== context) {
      c.context = context;
      c.anchor = rot;
      hideCompass(c);
    }
    const shown = c.el.classList.contains("shown");
    if (!shown && Math.abs(normalizeAngle(rot - c.anchor)) < COMPASS_SHOW_RAD) continue;
    if (shown && rot === c.lastRot) continue; // pan/zoom only: let it fade
    c.lastRot = rot;
    // Screen "up" is world up rotated by -rotation (screenToComplex rotates
    // uv by +rotation into world axes), which is CSS rotate(+rotation).
    c.needle.style.transform = `rotate(${rot}rad)`;
    c.needle.style.transformOrigin = "20px 20px";
    const rect = p.canvas.getBoundingClientRect();
    c.el.style.left = `${rect.right - 40 - 10}px`;
    c.el.style.top = `${rect.top + 10}px`;
    flash(c.el, c, () => {
      c.anchor = rotatablePanes().find((q) => q.key === p.key)?.st.rotation || 0;
    });
  }
}

function resetRotation(key) {
  const p = rotatablePanes().find((q) => q.key === key);
  if (!p) return;
  const st = p.st;
  const from = normalizeAngle(st.rotation || 0);
  if (from === 0) return;
  if (p.fractalPane) {
    cancelTeleport();
    pushHistory(p.fractalPane);
    activePane = p.fractalPane;
  } else {
    p.nav.checkpoint();
  }
  const durationMs = prefersReducedMotion() ? 0 : COMPASS_RESET_MS;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const t0 = performance.now();
  // Same per-frame path as teleport: markInteracting keeps deep-zoom panes on
  // the cheap preview until the last frame, then the settle timer renders
  // for real. Rotation turns about the view center, so cx/cy stay put.
  const step = (now) => {
    const cur = rotatablePanes().find((q) => q.key === key);
    if (!cur || cur.st !== st) return; // mode/fractal changed mid-animation
    const t = durationMs ? Math.min(1, (now - t0) / durationMs) : 1;
    st.rotation = t < 1 ? from * (1 - ease(t)) : 0;
    if (p.fractalPane) markInteracting();
    renderAll();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

let lastKeyHistoryPush = 0;

document.addEventListener("keydown", (e) => {
  // Leave browser/OS shortcuts (Cmd+arrows, Cmd +/-) alone, and let
  // focused form controls (sliders take arrow keys) keep their keys.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
  const action = keyAction(e);
  if (!action) return;
  e.preventDefault();

  if (mode === "fractal") {
    if (action.reset) { els.resetBtn.click(); return; }
    // In dual mode, keys drive whichever pane was last touched.
    const pane = dualActive && activePane === "julia" && juliaState ? "julia" : "main";
    const st = pane === "julia" ? juliaState : mainState;
    const renderer = pane === "julia" ? juliaRenderer : mainRenderer;
    cancelTeleport();
    const now = performance.now();
    if (now - lastKeyHistoryPush > 400) { pushHistory(pane); lastKeyHistoryPush = now; }
    const w = renderer.canvas.width / renderer.dpr, h = renderer.canvas.height / renderer.dpr;
    if (action.pan) {
      const step = KEY_PAN_FRACTION * Math.min(w, h);
      const c = screenToComplex(renderer, st, w / 2 + action.pan[0] * step, h / 2 + action.pan[1] * step);
      st.cx = c.x;
      st.cy = c.y;
    } else if (action.zoom) {
      st.scale *= action.zoom;
    } else if (action.rotate) {
      st.rotation = normalizeAngle((st.rotation || 0) + action.rotate);
    }
    markInteracting();
    requestRender();
    return;
  }

  const target = activeVectorTarget();
  if (!target) return;
  if (action.reset) { target.resetBtn.click(); return; }
  const { v, canvas, nav } = target;
  nav.checkpoint();
  if (action.pan) {
    // screenToWorld works in device pixels (canvas.width/height), so the
    // step is measured in them too.
    const step = KEY_PAN_FRACTION * Math.min(canvas.width, canvas.height);
    const [x, y] = v.screenToWorld(canvas.width / 2 + action.pan[0] * step, canvas.height / 2 + action.pan[1] * step);
    v.view.cx = x;
    v.view.cy = y;
  } else if (action.zoom) {
    v.view.halfHeight *= action.zoom;
  } else if (action.rotate) {
    v.view.rotation = normalizeAngle((v.view.rotation || 0) + action.rotate);
  }
  requestRender();
});

function applyHudVisibility() {
  els.hud.classList.toggle("hidden", !hudVisible);
  document.querySelectorAll(".hudToggleBtn").forEach((b) => b.classList.toggle("active", hudVisible));
  requestRender(); // the canvas area just changed height
}
document.querySelectorAll(".hudToggleBtn").forEach((b) => b.addEventListener("click", () => {
  hudVisible = !hudVisible;
  applyHudVisibility();
}));
applyHudVisibility();

// ---------------------------------------------------------------- UI wiring

// Picker: a grid of tiles, each a pre-rendered thumbnail plus the name
// (thumbnails come from scripts/render_thumbs.mjs; re-run it after adding a
// fractal or changing a default view). Julia presets get their own
// subsection under Infinite zoom.
function addPickerHeader(text, isSub = false) {
  const header = document.createElement("div");
  header.className = isSub ? "menuSectionHeader sub" : "menuSectionHeader";
  header.textContent = text;
  els.fractalTypeRow.appendChild(header);
}
function addPickerTile(label, slug, onPick, data) {
  const btn = document.createElement("button");
  btn.className = "pickTile";
  Object.assign(btn.dataset, data);
  const img = document.createElement("img");
  img.src = `icons/thumbs/${slug}.webp`;
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy"; // fetched when the picker first opens, not at startup
  const name = document.createElement("span");
  name.textContent = label;
  btn.append(img, name);
  btn.addEventListener("click", onPick);
  els.fractalTypeRow.appendChild(btn);
}
FRACTAL_CATEGORIES.forEach((fam) => {
  const names = FRACTAL_NAMES.filter((n) => FRACTAL_CONFIGS[n].category === fam.key);
  const extraModes = EXTRA_MODES.filter((m) => m.category === fam.key);
  if (names.length === 0 && extraModes.length === 0) return;
  addPickerHeader(fam.label);
  const addFractal = (name) => addPickerTile(FRACTAL_CONFIGS[name].label, slugify(name), () => selectFractal(name), { name });
  names.filter((n) => !FRACTAL_CONFIGS[n].group).forEach(addFractal);
  const julias = names.filter((n) => FRACTAL_CONFIGS[n].group === "julia");
  if (julias.length) {
    addPickerHeader("Julia sets", true);
    julias.forEach(addFractal);
  }
  extraModes.forEach((m) => addPickerTile(m.label, m.key, () => setMode(m.key), { mode: m.key }));
});
updateMenuActiveState();

// Two hamburger buttons exist (one in #fractalControls, one in #kochControls
// — see index.html) so the menu stays reachable regardless of mode, since
// selecting Koch/a fractal type from it is now the only way to switch modes
// at all. Both share the .fractalMenuBtn class rather than an id.
document.querySelectorAll(".fractalMenuBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.colormapMenu.classList.remove("open");
    els.shareMenu.classList.remove("open");
    els.fractalTypeRow.classList.toggle("open");
  });
});
// Tap anywhere outside the open picker (or a hamburger button) to dismiss
// it — standard dropdown/hamburger-menu behavior.
document.addEventListener("pointerdown", (e) => {
  if (!els.fractalTypeRow.classList.contains("open")) return;
  if (els.fractalTypeRow.contains(e.target) || e.target.closest(".fractalMenuBtn")) return;
  els.fractalTypeRow.classList.remove("open");
});

// Sliders: keep each one's filled-track position (--fill, 0-1, read by
// the track's gradient in index.html) in sync with its value. Dragging fires
// "input" (each listener below calls syncSliderFill); everything app.js
// sets from code (URL restore, fractal switches, Koch's depth animation,
// a curve's max depth changing) goes through the value/max setters, which
// are wrapped here once per slider instead of patched at every call site.
const SLIDERS = [els.iterSlider, els.kochDepthSlider, els.treeDepthSlider, els.dragonDepthSlider, els.fernPointsSlider];

function syncSliderFill(slider) {
  const min = parseFloat(slider.min), max = parseFloat(slider.max);
  const pct = max > min ? (parseFloat(slider.value) - min) / (max - min) * 100 : 0;
  slider.style.setProperty("--fill", String(Math.min(100, Math.max(0, pct)) / 100));
}

for (const slider of SLIDERS) {
  for (const prop of ["value", "max", "min"]) {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, prop);
    Object.defineProperty(slider, prop, {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); syncSliderFill(this); },
    });
  }
  syncSliderFill(slider);
}

els.iterSlider.addEventListener("input", () => {
  syncSliderFill(els.iterSlider);
  const v = parseInt(els.iterSlider.value, 10);
  mainState.maxIter = v;
  if (juliaState) juliaState.maxIter = v;
  // Manual interaction is the only thing that turns auto iter mode off
  // (for both panes, since this slider drives both); Reset and a fractal's
  // first visit turn it back on (a revisit keeps its remembered setting).
  mainState.iterAutoLocked = true;
  if (juliaState) juliaState.iterAutoLocked = true;
  requestRender();
});


els.dualBtn.addEventListener("click", () => {
  if (dualActive) exitDual();
  else if (FRACTAL_CONFIGS[currentName].dualParent) openPresetInDual(currentName, mainState);
  else enterDual();
  els.dualBtn.classList.toggle("active", dualActive);
});

els.boxZoomBtn.addEventListener("click", () => {
  boxZoomActive = !boxZoomActive;
  els.boxZoomBtn.classList.toggle("active", boxZoomActive);
  if (!boxZoomActive) els.boxRect.classList.add("hidden");
});

els.backBtn.addEventListener("click", () => { cancelTeleport(); popHistory(activePane); });

// ---------------------------------------------------------------- teleport ("Surprise me")

// d3's interpolateZoom (van Wijk & Nuij, "Smooth and efficient zooming and
// panning"): a far jump zooms out, pans, and zooms back in, instead of
// zooming straight at a point that stays off-screen the whole way. Views
// are [cx, cy, w] with w the visible height; returns f(t) for t in [0, 1].
// The near-case cutoff is relative to w, not d3's absolute 1e-12 --
// deep-zoom jumps are routinely that small in absolute terms. f.distance
// is the path's length in d3's units (roughly zoom levels travelled),
// used to size the flight's duration.
function zoomPath(p0, p1) {
  const rho = Math.SQRT2, rho2 = 2, rho4 = 4;
  const [ux0, uy0, w0] = p0, [ux1, uy1, w1] = p1;
  const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy;
  const tiny = 1e-6 * Math.min(w0, w1);
  if (d2 < tiny * tiny) {
    const S = Math.log(w1 / w0) / rho;
    const f = (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
    f.distance = Math.abs(S);
    return f;
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  // d3 writes these as log(sqrt(b*b + 1) - b), which cancels to log(0) when
  // a flight starts deep (b0 ~ distance / w0 ~ 1e10). -asinh(b) is the same
  // value, computed stably.
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  const S = (r1 - r0) / rho;
  const coshr0 = Math.cosh(r0), sinhr0 = Math.sinh(r0);
  const f = (t) => {
    const s = t * S;
    const u = w0 / (rho2 * d1) * (coshr0 * Math.tanh(rho * s + r0) - sinhr0);
    return [ux0 + u * dx, uy0 + u * dy, w0 * coshr0 / Math.cosh(rho * s + r0)];
  };
  f.distance = Math.abs(S);
  return f;
}

// Flight time grows with distance: ~1s for a short hop from the opening
// view (distance ~4), up to 2.5s for the longest deep-to-deep dives (~34).
function teleportDurationMs(distance) {
  return Math.min(2500, Math.max(1000, 1000 + (distance - 4) * 50));
}
// Spiral dives (a destination's spiral flag) are slower, at a steady speed,
// turning 90 degrees per 3x of zoom: five full turns on the way down from
// the opening view.
const SPIRAL_DIVE_MS = 7000;
const SPIRAL_RAD_PER_ZOOM = (Math.PI / 2) / Math.log(3); // per e-fold
// Speed ramps up over the first 12% of the flight, cruises, and slows over
// the last 18% (fractions of time); returns the distance covered, 0..1.
function steadyEase(t, a = 0.12, b = 0.18) {
  const vmax = 1 / (1 - a / 2 - b / 2);
  if (t < a) return vmax * t * t / (2 * a);
  if (t <= 1 - b) return vmax * (a / 2 + (t - a));
  const u = 1 - t;
  return 1 - vmax * u * u / (2 * b);
}
let lastTeleportIndex = -1; // index into TELEPORT_DESTINATIONS; never picked twice in a row
let teleportLandingIndex = -1; // TELEPORT_DESTINATIONS index of the last completed flight, for the info overlay
let teleportGeneration = 0;

// Any direct manipulation (pointer, wheel, Back, fractal switch) wins over
// an in-flight flight: bumping the generation makes its next frame a no-op.
function cancelTeleport() { teleportGeneration++; }

function teleport() {
  if (mode !== "fractal") return;
  const own = TELEPORT_DESTINATIONS
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.fractal === currentName);
  if (own.length === 0) return;
  const candidates = own.filter(({ i }) => i !== lastTeleportIndex);
  const st = mainState;
  let d, i, target;
  let landingIndex, spinSign = 1;
  if (candidates.length > 0) {
    ({ d, i } = candidates[Math.floor(Math.random() * candidates.length)]);
    lastTeleportIndex = i;
    target = { cx: Number(d.re), cy: Number(d.im), scale: d.scale };
    landingIndex = i;
  } else {
    // A fractal with one place (none since 1.35.0; Newton and Gasket
    // before that): taps alternate between
    // diving in and spiraling back out to the opening view, picked by
    // which of the two the current view is nearer, so a hand zoom between
    // taps still gets the sensible direction.
    ({ d, i } = own[0]);
    const home = viewFromBounds(FRACTAL_CONFIGS[currentName].view, mainCanvasAspect());
    const here = [st.cx, st.cy, 2 * st.scale];
    const toPlace = zoomPath(here, [Number(d.re), Number(d.im), 2 * d.scale]).distance;
    const toHome = zoomPath(here, [home.cx, home.cy, 2 * home.scale]).distance;
    if (toPlace < toHome) {
      // The opening view is upright, so the way out lands at rotation 0
      // and its spiral unwinds the way in.
      d = { ...d, rotation: 0 };
      target = { cx: home.cx, cy: home.cy, scale: home.scale };
      landingIndex = -1;
      spinSign = -1;
    } else {
      target = { cx: Number(d.re), cy: Number(d.im), scale: d.scale };
      landingIndex = i;
    }
  }

  // A destination with a rotation lands turned to it (Burning Ship's ships
  // are drawn masts-down in math orientation); one without leaves the
  // view's rotation alone, as before. The turn takes the shorter way round.
  const r0 = st.rotation || 0;
  let turn = d.rotation === undefined ? 0 : normalizeAngle(d.rotation - r0);
  if (d.rotation !== undefined) target.rotation = d.rotation;
  pushHistory("main");
  activePane = "main";
  const path = zoomPath([st.cx, st.cy, 2 * st.scale], [target.cx, target.cy, 2 * target.scale]);
  // A spiral adds whole turns to the landing turn, as many as its zoom
  // calls for: path.distance times sqrt(2) is the e-folds of zoom travelled
  // (out and back in, for a flight that starts deep). The path's parameter
  // runs at constant speed in zoom, so a turn linear in it keeps the spin
  // locked to the zoom. Reduced motion skips the spin and the long flight.
  const spiral = d.spiral && !prefersReducedMotion();
  if (spiral) {
    const spin = spinSign * SPIRAL_RAD_PER_ZOOM * Math.SQRT2 * path.distance;
    turn += 2 * Math.PI * Math.round((spin - turn) / (2 * Math.PI));
  }
  const ease = spiral ? steadyEase : (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const durationMs = spiral ? SPIRAL_DIVE_MS : teleportDurationMs(path.distance);
  const gen = ++teleportGeneration;
  const t0 = performance.now();

  // Each frame goes through the same path as a pinch frame: markInteracting
  // puts renderAll on its gesture path (live float32 above
  // DEEP_ZOOM_THRESHOLD, the moving last-frame preview below it), and its
  // settle timer does the full-quality render -- perturbation reference
  // orbit included, via render()'s normal chooseReference call -- plus
  // applyAutoIter once the last frame lands.
  const step = (now) => {
    if (gen !== teleportGeneration || mode !== "fractal" || mainState !== st) return;
    const t = Math.min(1, (now - t0) / durationMs);
    if (t < 1) {
      const k = ease(t);
      const [cx, cy, w] = path(k);
      st.cx = cx; st.cy = cy; st.scale = w / 2;
      // Wrapped, so a spiral cancelled mid-turn leaves a normal angle.
      if (turn) st.rotation = normalizeAngle(r0 + turn * k);
      // A spiral dive's frames are all live, and its spiral centers need
      // more iterations the deeper they go (Into the Eye's center goes black
      // halfway down at the starting detail), so auto detail follows the
      // zoom frame by frame instead of jumping on landing.
      if (spiral) { st.iterAutoLocked = false; applyAutoIter(); }
    } else {
      // Exact landing: the path's last point can be a few ulps off, which
      // matters at 1e-12 scales.
      Object.assign(st, target);
      // A slider-locked maxIter can be far too low for the new place (a
      // lock at 300 lands Seahorse Valley all black), so landing hands
      // maxIter back to auto mode; the settle's applyAutoIter sets it. A
      // place with its own maxIter (Bird's Eye) lands locked to it instead.
      if (landingIndex >= 0 && d.maxIter) {
        st.maxIter = d.maxIter;
        st.iterAutoLocked = true;
      } else {
        st.iterAutoLocked = false;
      }
      teleportLandingIndex = landingIndex;
    }
    markInteracting();
    renderAll();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Dual view's tap: glide the main view so (x, y) lands at the center, which
// moves the Julia pane's c there (renderAll syncs c to the center). Shares
// teleport's generation counter, so a new gesture/Back/teleport cancels it,
// and its per-frame path (markInteracting + renderAll).
const GLIDE_MS = 300;
function glideMainTo(x, y) {
  const st = mainState;
  cancelTeleport();
  pushHistory("main");
  activePane = "main";
  const x0 = st.cx, y0 = st.cy;
  const durationMs = prefersReducedMotion() ? 0 : GLIDE_MS;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const gen = ++teleportGeneration;
  const t0 = performance.now();
  const step = (now) => {
    if (gen !== teleportGeneration || mode !== "fractal" || mainState !== st || !dualActive) return;
    const t = durationMs ? Math.min(1, (now - t0) / durationMs) : 1;
    const k = ease(t);
    // Exact landing on the last frame (x0 + (x - x0) * 1 can be an ulp off).
    st.cx = t < 1 ? x0 + (x - x0) * k : x;
    st.cy = t < 1 ? y0 + (y - y0) * k : y;
    markInteracting();
    renderAll();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

els.teleportBtn.addEventListener("click", teleport);

els.resetBtn.addEventListener("click", () => selectFractal(currentName, { fresh: true }));

els.kochDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.kochDepthSlider);
  kochState.depth = parseInt(els.kochDepthSlider.value, 10);
  requestRender();
});

els.kochFillBtn.addEventListener("click", () => {
  kochState.fill = !kochState.fill;
  els.kochFillBtn.classList.toggle("active", kochState.fill);
  requestRender();
});


// Depth play/pause (Koch, tree, line curves): steps the row's depth slider
// up to its max and back down, over and over, by setting its value and
// firing "input" -- the same path as a drag, so each mode's own listener
// does the redraw. The speed button beside it is pressed and slid: left
// slower, right faster, one step per SPEED_DRAG_PX. Speed is shared by all
// rows. Switching modes or touching the slider stops playback.
const DEPTH_STEP_MS = 700; // at 1x, as Koch's old animate button
const PLAY_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const SPEED_DRAG_PX = 28;
const depthPlayer = { slider: null, dir: 1, timer: 0, speedIndex: PLAY_SPEEDS.indexOf(1) };

function depthSliderForMode() {
  if (mode === "koch") return els.kochDepthSlider;
  if (mode === "tree") return els.treeDepthSlider;
  if (isCurveMode(mode)) return els.dragonDepthSlider;
  return null;
}

function speedText(speed) {
  return ({ 0.25: "¼", 0.5: "½", 0.75: "¾" }[speed] || String(speed)) + "×";
}

function syncPlayButtons() {
  const playing = depthPlayer.slider !== null;
  for (const btn of document.querySelectorAll(".depthPlayBtn")) {
    btn.classList.toggle("playing", playing);
    btn.setAttribute("aria-label", playing ? "Pause depth" : "Play depth");
    btn.title = playing ? "Pause depth" : "Play depth";
  }
  const text = speedText(PLAY_SPEEDS[depthPlayer.speedIndex]);
  for (const btn of document.querySelectorAll(".depthSpeedBtn")) {
    btn.textContent = text;
    btn.setAttribute("aria-label", `Play speed ${text}`);
  }
}

function stopDepthPlay() {
  if (!depthPlayer.slider) return;
  clearTimeout(depthPlayer.timer);
  depthPlayer.slider = null;
  syncPlayButtons();
}

function depthPlayStep() {
  const s = depthPlayer.slider;
  const min = parseInt(s.min, 10), max = parseInt(s.max, 10);
  const v = parseInt(s.value, 10);
  if (max <= min) { stopDepthPlay(); return; }
  if (v + depthPlayer.dir > max || v + depthPlayer.dir < min) depthPlayer.dir = -depthPlayer.dir;
  s.value = v + depthPlayer.dir;
  s.dispatchEvent(new Event("input"));
  depthPlayer.timer = setTimeout(depthPlayStep, DEPTH_STEP_MS / PLAY_SPEEDS[depthPlayer.speedIndex]);
}

function startDepthPlay() {
  const s = depthSliderForMode();
  if (!s) return;
  depthPlayer.slider = s;
  // Heads up from where it is, unless it's already at the top.
  depthPlayer.dir = parseInt(s.value, 10) >= parseInt(s.max, 10) ? -1 : 1;
  syncPlayButtons();
  depthPlayStep();
}

for (const btn of document.querySelectorAll(".depthPlayBtn")) {
  btn.addEventListener("click", () => (depthPlayer.slider ? stopDepthPlay() : startDepthPlay()));
}
for (const s of [els.kochDepthSlider, els.treeDepthSlider, els.dragonDepthSlider]) {
  s.addEventListener("pointerdown", stopDepthPlay);
}

// The readout above a held speed button: the speed, and which way is which.
let speedBubbleTimer = 0;
function showSpeedBubble(btn, hint) {
  const b = document.getElementById("speedBubble");
  const r = btn.getBoundingClientRect();
  b.innerHTML = `<b>${speedText(PLAY_SPEEDS[depthPlayer.speedIndex])}</b><span>${hint}</span>`;
  b.classList.remove("hidden");
  // Kept on screen: the speed button can sit near the row's left edge.
  const half = b.offsetWidth / 2 + 8;
  b.style.left = `${Math.min(window.innerWidth - half, Math.max(half, r.left + r.width / 2))}px`;
  b.style.top = `${r.top}px`;
  clearTimeout(speedBubbleTimer);
}
function hideSpeedBubble(delayMs) {
  clearTimeout(speedBubbleTimer);
  speedBubbleTimer = setTimeout(() => document.getElementById("speedBubble").classList.add("hidden"), delayMs);
}
function setSpeedIndex(i) {
  depthPlayer.speedIndex = Math.min(PLAY_SPEEDS.length - 1, Math.max(0, i));
  syncPlayButtons();
}

for (const btn of document.querySelectorAll(".depthSpeedBtn")) {
  let drag = null;
  let slid = false; // the press that ends in this click was a slide, not a tap
  const hint = "◀ slower · faster ▶";
  btn.addEventListener("pointerdown", (e) => {
    btn.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, i0: depthPlayer.speedIndex, moved: false };
    btn.classList.add("dragging");
    showSpeedBubble(btn, hint);
  });
  btn.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    if (Math.abs(dx) > 6) drag.moved = true;
    const i = drag.i0 + Math.round(dx / SPEED_DRAG_PX);
    if (i !== depthPlayer.speedIndex) {
      setSpeedIndex(i);
      showSpeedBubble(btn, hint);
    }
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // A tap without a slide leaves the readout up a little longer, as a
    // how-to for the gesture.
    hideSpeedBubble(drag.moved ? 500 : 1800);
    slid = drag.moved;
    drag = null;
    btn.classList.remove("dragging");
  };
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  // A tap (or VoiceOver/Switch Control activation, or Enter/Space) steps
  // to the next speed, wrapping from 4x back to 1/4x, so the speed can be
  // changed without the hold-and-slide. A slide also ends in a click, which
  // is skipped.
  btn.addEventListener("click", () => {
    if (slid) { slid = false; return; }
    setSpeedIndex((depthPlayer.speedIndex + 1) % PLAY_SPEEDS.length);
    showSpeedBubble(btn, hint);
    hideSpeedBubble(1800);
  });
  // Keyboard: arrow keys step the speed while the button has focus.
  btn.addEventListener("keydown", (e) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    setSpeedIndex(depthPlayer.speedIndex + step);
    showSpeedBubble(btn, hint);
    hideSpeedBubble(1200);
  });
}
syncPlayButtons();

els.kochResetBtn.addEventListener("click", () => {
  kochNav.clearHistory();
  fitVectorView("koch");
  requestRender();
});

els.treeDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.treeDepthSlider);
  treeState.depth = parseInt(els.treeDepthSlider.value, 10);
  requestRender();
});


els.treeResetBtn.addEventListener("click", () => {
  treeNav.clearHistory();
  fitVectorView("tree");
  requestRender();
});

els.dragonDepthSlider.addEventListener("input", () => {
  syncSliderFill(els.dragonDepthSlider);
  dragonState.depth = parseInt(els.dragonDepthSlider.value, 10);
  requestRender();
});


els.dragonResetBtn.addEventListener("click", () => {
  dragonNav.clearHistory();
  fitVectorView(mode);
  requestRender();
});

els.fernPointsSlider.addEventListener("input", () => {
  syncSliderFill(els.fernPointsSlider);
  fernState.count = parseInt(els.fernPointsSlider.value, 10);
  requestRender();
});

// ---------------------------------------------------------------- colormap picker

// The palette button in every row opens this picker (same popover pattern as
// the share menu) instead of cycling blindly. The escape-time fractals pick
// a gradient from COLORMAPS; the fern, Koch, tree and line curves each pick
// one flat color from SOLID_COLORS.
function cmGradient(stops) {
  return `linear-gradient(to right, ${stops.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${t * 100}%`).join(", ")})`;
}

function setFernColor(i) {
  fernState.colorIndex = i;
  updateColorSwatches();
}

// Color buttons name the current choice, so screen readers hear "Choose
// colormap (Classic)" rather than an unlabeled color strip.
function labelColorButton(btn, action, name) {
  btn.setAttribute("aria-label", `${action} (${name})`);
  btn.title = `${action} (${name})`;
}

// The pill on each solid-color button shows that mode's color; the curve
// row's pill follows whichever curve is shown.
function updateColorSwatches() {
  [
    [els.fernColorBtn, els.fernColorSwatch, fernState.colorIndex],
    [els.kochColormapBtn, els.kochColorSwatch, vectorColors.koch],
    [els.treeColormapBtn, els.treeColorSwatch, vectorColors.tree],
    [els.dragonColormapBtn, els.dragonColorSwatch, vectorColors[dragonView.curve]],
  ].forEach(([btn, pill, i]) => {
    pill.style.background = solidCss(i);
    labelColorButton(btn, "Choose color", SOLID_COLORS[i].name);
  });
}

// solidKey: null for the escape-time colormap, "fern", or a vectorColors key.
function openColormapMenu(solidKey) {
  const items = solidKey
    ? SOLID_COLORS.map((c, i) => ({ name: c.name, bg: solidCss(i) }))
    : COLORMAPS.map((c) => ({ name: c.name, bg: cmGradient(c.stops) }));
  const current = !solidKey ? colormapIndex : solidKey === "fern" ? fernState.colorIndex : vectorColors[solidKey];
  els.colormapMenu.replaceChildren(...items.map((item, i) => {
    const btn = document.createElement("button");
    btn.setAttribute("role", "menuitemradio");
    btn.setAttribute("aria-checked", String(i === current));
    btn.classList.toggle("active", i === current);
    const swatch = document.createElement("span");
    swatch.className = "cmSwatch";
    swatch.style.background = item.bg;
    const name = document.createElement("span");
    name.className = "cmName";
    name.textContent = item.name;
    btn.append(name, swatch);
    btn.addEventListener("click", () => {
      if (solidKey === "fern") {
        setFernColor(i);
      } else if (solidKey) {
        vectorColors[solidKey] = i;
        updateColorSwatches();
      } else {
        colormapIndex = i;
        // Always refresh the shader's LUT, whichever mode picked it: the
        // old koch/tree/dragon cycle handlers skipped this, leaving the
        // fractal on a stale colormap after switching back.
        updateLUT();
      }
      els.colormapMenu.classList.remove("open");
      requestRender();
    });
    return btn;
  }));
  els.colormapMenu.classList.add("open");
  els.colormapMenu.querySelector(".active")?.scrollIntoView({ block: "nearest" });
}

[els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.dragonColormapBtn, els.fernColorBtn].forEach((btn) => {
  btn.setAttribute("aria-haspopup", "true");
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-tap closer below fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.shareMenu.classList.remove("open");
    if (els.colormapMenu.classList.contains("open")) els.colormapMenu.classList.remove("open");
    else openColormapMenu({
      [els.fernColorBtn.id]: "fern", [els.kochColormapBtn.id]: "koch",
      [els.treeColormapBtn.id]: "tree", [els.dragonColormapBtn.id]: dragonView.curve,
    }[btn.id] || null);
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.colormapMenu.classList.contains("open")) return;
  if (els.colormapMenu.contains(e.target) || e.target.closest("[aria-haspopup]")) return;
  els.colormapMenu.classList.remove("open");
});

els.fernBoxZoomBtn.addEventListener("click", () => {
  fernBoxZoomActive = !fernBoxZoomActive;
  els.fernBoxZoomBtn.classList.toggle("active", fernBoxZoomActive);
  if (!fernBoxZoomActive) els.boxRect.classList.add("hidden");
});

els.fernResetBtn.addEventListener("click", () => {
  fernNav.clearHistory();
  fitVectorView(mode);
  requestRender();
});

window.addEventListener("resize", () => { layoutCanvasArea(); requestRender(); });
// The toolbar is in flow under the canvas, so the canvas area also changes
// size without a window resize (e.g. a mode's control row wrapping
// differently); re-lay out and re-render then too.
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => { layoutCanvasArea(); requestRender(); }).observe(els.canvasArea);
}

// ---------------------------------------------------------------- share: links

// A share link is the page URL plus a hash encoding the current view, e.g.
// #v=1&m=fractal&f=Mandelbrot&x=...&y=...&s=...  Numbers use String(),
// the shortest decimal that round-trips to the exact same double -- the
// HUD's rounded display would move deep-zoom views. Julia c is encoded
// explicitly: enterDual only seeds it from the main center; tapping the
// main pane moves it independently afterward.
function depthStateFor(m) {
  return isCurveMode(m) ? dragonState : { koch: kochState, tree: treeState }[m];
}

function buildShareHash() {
  const p = new URLSearchParams();
  p.set("v", "1");
  p.set("m", mode);
  const put = (k, v) => p.set(k, String(v));
  if (mode === "fractal") {
    const s = mainState;
    p.set("f", currentName);
    put("x", s.cx); put("y", s.cy); put("s", s.scale); put("r", s.rotation || 0);
    put("i", s.maxIter); if (s.iterAutoLocked) p.set("il", "1");
    put("cm", COLORMAPS[colormapIndex].name);
    if (dualActive && juliaState) {
      const j = juliaState;
      p.set("d", "1");
      put("jcx", mainState.cx); put("jcy", mainState.cy); // = c; see applyShareState
      put("jx", j.cx); put("jy", j.cy); put("js", j.scale); put("jr", j.rotation || 0);
      put("ji", j.maxIter); put("jb", j.baseScale);
    }
  } else {
    const v = VECTOR_VIEWS[mode][0].view;
    put("x", v.cx); put("y", v.cy); put("s", v.halfHeight); put("r", v.rotation || 0);
    if (isIfsMode(mode)) {
      put("n", fernState.count); put("c", fernState.colorIndex);
    } else {
      put("cm", COLORMAPS[colormapIndex].name);
      put("c", vectorColors[mode]);
      put("dp", depthStateFor(mode).depth);
      if (mode === "koch") p.set("fl", kochState.fill ? "1" : "0");
    }
  }
  return "#" + p.toString();
}

function buildShareUrl() {
  return Platform.shareBaseUrl() + buildShareHash();
}

// Parses a share hash into a plain state object, or null if it isn't a
// valid v1 link -- any missing/out-of-range field rejects the whole link,
// so a malformed one falls back to the normal default view.
function parseShareHash(hash) {
  try {
    if (!hash || hash.length < 2) return null;
    const p = new URLSearchParams(hash.slice(1));
    if (p.get("v") !== "1") return null;
    const num = (k, test = () => true) => {
      const raw = p.get(k);
      const v = raw === null || raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(v) || !test(v)) throw new Error(`bad share field ${k}`);
      return v;
    };
    const int = (k, lo, hi) => num(k, (v) => Number.isInteger(v) && v >= lo && v <= hi);
    const pos = (v) => v > 0;
    // The colormap is named, not numbered, so reordering or retiring
    // colormaps doesn't change what existing links show. An unknown name
    // (a retired colormap, or an old numeric link) opens in the default
    // colormap instead of rejecting the whole link.
    const cmIndex = () => Math.max(0, COLORMAPS.findIndex((c) => c.name === p.get("cm")));
    const m = p.get("m");
    // m is attacker-controlled: only "fractal" or a real mode key, never an
    // inherited property name like "constructor" (which the lookups below
    // would otherwise resolve against Object.prototype).
    if (m !== "fractal" && !EXTRA_MODES.some((e) => e.key === m)) return null;
    // Positions/scales beyond +-1e300 only produce NaN views; rotation is
    // wrapped so the HUD and compass see a bounded angle.
    const big = (v) => Math.abs(v) <= 1e300;
    const view = { cx: num("x", big), cy: num("y", big), scale: num("s", (v) => pos(v) && big(v)), rotation: normalizeAngle(num("r", big)) };
    if (m === "fractal") {
      const name = p.get("f");
      if (!Object.prototype.hasOwnProperty.call(FRACTAL_CONFIGS, name)) return null;
      const st = { mode: m, name, ...view, maxIter: int("i", 50, 2000), iterAutoLocked: p.get("il") === "1",
        cm: cmIndex(), dual: false };
      if (p.get("d") === "1" && FRACTAL_CONFIGS[name].dual) {
        st.dual = true;
        st.julia = { juliaC: [num("jcx", big), num("jcy", big)], cx: num("jx", big), cy: num("jy", big),
          scale: num("js", (v) => pos(v) && big(v)), rotation: normalizeAngle(num("jr", big)),
          maxIter: int("ji", 50, 2000), baseScale: num("jb", (v) => pos(v) && big(v)) };
      }
      return st;
    }
    if (isIfsMode(m)) return { mode: m, ...view, count: int("n", 100000, 4000000), colorIndex: int("c", 0, SOLID_COLORS.length - 1) };
    const maxDepth = isCurveMode(m) ? LINE_CURVES[m].maxDepth : { koch: 8, tree: 12 }[m];
    if (maxDepth === undefined || !Object.prototype.hasOwnProperty.call(vectorColors, m)) return null;
    const minDepth = isCurveMode(m) ? LINE_CURVES[m].minDepth || 0 : 0;
    // "c" (solid color) is optional: links made before 1.10.0 don't have it.
    const colorIndex = p.has("c") ? int("c", 0, SOLID_COLORS.length - 1) : vectorColors[m];
    return { mode: m, ...view, cm: cmIndex(), colorIndex, depth: int("dp", minDepth, maxDepth), fill: p.get("fl") !== "0" };
  } catch {
    return null;
  }
}

function applyShareState(st) {
  if (st.mode === "fractal") {
    colormapIndex = st.cm;
    if (dualActive) exitDual();
    selectFractal(st.name, { fresh: true });
    Object.assign(mainState, { cx: st.cx, cy: st.cy, scale: st.scale, rotation: st.rotation,
      maxIter: st.maxIter, iterAutoLocked: st.iterAutoLocked });
    if (st.dual) {
      enterDual();
      // jcx/jcy are ignored: c is the main pane's center (synced in
      // renderAll). Links still carry them so older builds, whose parser
      // requires them, can open links from this one.
      Object.assign(juliaState, st.julia, { juliaC: [mainState.cx, mainState.cy], iterAutoLocked: st.iterAutoLocked });
    }
    els.dualBtn.classList.toggle("active", dualActive);
    els.iterSlider.value = mainState.maxIter;
  } else {
    if (isIfsMode(st.mode)) {
      if (fernView.system !== st.mode) {
        fernView.setSystem(st.mode); // before the view is written below
        fernNav.clearHistory(); // Back history belongs to the previous system
      }
      fernState.count = st.count;
      els.fernPointsSlider.value = st.count;
      setFernColor(st.colorIndex);
    } else {
      colormapIndex = st.cm;
      vectorColors[st.mode] = st.colorIndex;
      if (isCurveMode(st.mode) && dragonView.curve !== st.mode) {
        dragonView.setCurve(st.mode); // before depth/view are written
        dragonNav.clearHistory(); // Back history belongs to the previous curve
      }
      updateColorSwatches();
      depthStateFor(st.mode).depth = st.depth;
      els[`${isCurveMode(st.mode) ? "dragon" : st.mode}DepthSlider`].value = st.depth;
      if (st.mode === "koch") {
        kochState.fill = st.fill;
        els.kochFillBtn.classList.toggle("active", st.fill);
      }
    }
    // Mark as fitted first: setMode's first-visit fit would otherwise
    // replace the linked view with the default one.
    fittedVectorModes.add(st.mode);
    Object.assign(VECTOR_VIEWS[st.mode][0].view, { cx: st.cx, cy: st.cy, halfHeight: st.scale, rotation: st.rotation });
    setMode(st.mode);
  }
  updateLUT();
  requestRender();
}

// Applies a share link from the URL, then strips the hash so a reload
// returns to the app's normal start rather than re-pinning the link.
function applyShareHashFromUrl() {
  const st = parseShareHash(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (st) applyShareState(st);
}

// A share link that opened the iOS app (universal link, see platform.js):
// same parse/apply as a link loaded on the web. Anything that isn't a valid
// share hash is ignored, leaving the current view alone.
function applyShareLink(url) {
  const i = url.indexOf("#");
  const st = i >= 0 ? parseShareHash(url.slice(i)) : null;
  if (st) {
    cancelTeleport();
    applyShareState(st);
  }
}

// ---------------------------------------------------------------- share: image + menu

function shareFileName() {
  const label = mode === "fractal" ? fractalLabel(currentName) : modeLabel(mode);
  const slug = slugify(label);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `fractal-web-${slug}-${date}.png`;
}

function waitUntil(cond, timeoutMs) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => (cond() || performance.now() - t0 > timeoutMs ? resolve() : requestAnimationFrame(tick));
    tick();
  });
}

// Dual mode: both panes onto one canvas in the layout actually on screen
// (layoutCanvasArea's "stacked" = main above Julia, otherwise side by side),
// with #canvasArea's 2px black gap between them.
function compositeDualCanvas() {
  const a = els.mainCanvas, b = els.juliaCanvas;
  const stacked = els.canvasArea.classList.contains("stacked");
  const gap = Math.round(2 * mainRenderer.dpr);
  const out = document.createElement("canvas");
  out.width = stacked ? Math.max(a.width, b.width) : a.width + gap + b.width;
  out.height = stacked ? a.height + gap + b.height : Math.max(a.height, b.height);
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(a, 0, 0);
  ctx.drawImage(b, stacked ? 0 : a.width + gap, stacked ? a.height + gap : 0);
  return out;
}

// A copy of src with the "Fractal Atlas™" wordmark in a dark translucent
// pill, bottom-right. Drawn on the export only, never the live canvas. The
// pill (not bare or shadowed text) keeps it legible on any colormap,
// including flat light or flat dark regions. Sized off the image's short
// side so it looks the same on a phone and an iPad export.
function watermarkedCopy(src) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);

  const text = "Fractal Atlas™";
  const fontPx = Math.max(12, Math.round(Math.min(out.width, out.height) * 0.03));
  ctx.font = `600 ${fontPx}px -apple-system, system-ui, "Helvetica Neue", sans-serif`;
  const h = Math.round(fontPx * 1.9);
  const w = Math.round(ctx.measureText(text).width + fontPx * 1.5);
  const margin = Math.round(fontPx * 0.9);
  const x = out.width - margin - w, y = out.height - margin - h, r = h / 2;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.arc(x + r, y + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fill();
  // Hairline edge so the pill still reads against a flat black export.
  ctx.lineWidth = Math.max(1, fontPx / 16);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + fontPx * 0.04);
  return out;
}

// PNG of the current view, taken only once progressive refinement has
// finished (fractal supersampling, fern point fill) -- or after 3s, so a
// slow device or an ongoing gesture can't hang it. Koch/tree/dragon draw
// synchronously and are captured immediately. Every export path (Save
// image, Save to Photos, Share…) goes through here, so all get the
// watermark.
async function captureShareBlob() {
  if (mode === "fractal") await waitUntil(() => refineDone && !isInteracting, 3000);
  else if (isIfsMode(mode)) await waitUntil(() => !fernView.refining, 3000);
  const canvas = watermarkedCopy(mode !== "fractal" ? VECTOR_VIEWS[mode][1] : dualActive ? compositeDualCanvas() : els.mainCanvas);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))), "image/png");
  });
}

els.shareNativeBtn.classList.toggle("hidden", !Platform.canShare);

// Capture starts when the menu opens, not when an option is tapped: iOS
// Safari only allows navigator.share() close to the user's tap, so the PNG
// should already be ready by then.
let pendingCapture = null;
function closeShareMenu() { els.shareMenu.classList.remove("open"); }
document.querySelectorAll(".shareBtn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation(); // don't let the outside-click closer below fire on this same tap
    els.fractalTypeRow.classList.remove("open");
    els.colormapMenu.classList.remove("open");
    const opening = !els.shareMenu.classList.contains("open");
    els.shareMenu.classList.toggle("open", opening);
    if (opening) {
      pendingCapture = captureShareBlob();
      pendingCapture.catch(() => {}); // surfaced when an option actually uses it
    }
  });
});
document.addEventListener("pointerdown", (e) => {
  if (!els.shareMenu.classList.contains("open")) return;
  if (els.shareMenu.contains(e.target) || e.target.closest(".shareBtn")) return;
  closeShareMenu();
});

// ---------------------------------------------------------------- toolbar accessibility

// Toggle buttons and popovers change state by toggling "active"/"open" at
// many call sites, so one observer per element mirrors that state into
// ARIA instead: aria-pressed on the toggles, aria-expanded on each popover's
// opener buttons. A popover that opens gets focus on its current (or
// first) item; one that closes with focus inside hands it back to the
// button that opened it. Escape closes whichever popover is open.
const TOGGLE_BUTTONS = [els.dualBtn, els.boxZoomBtn, els.fernBoxZoomBtn, els.kochFillBtn, ...document.querySelectorAll(".hudToggleBtn")];
for (const btn of TOGGLE_BUTTONS) {
  const sync = () => btn.setAttribute("aria-pressed", String(btn.classList.contains("active")));
  sync();
  new MutationObserver(sync).observe(btn, { attributes: true, attributeFilter: ["class"] });
}

const POPOVERS = [
  { menu: els.fractalTypeRow, openers: [...document.querySelectorAll(".fractalMenuBtn")] },
  { menu: els.colormapMenu, openers: [els.colormapBtn, els.kochColormapBtn, els.treeColormapBtn, els.dragonColormapBtn, els.fernColorBtn] },
  { menu: els.shareMenu, openers: [...document.querySelectorAll(".shareBtn")] },
];
for (const p of POPOVERS) {
  let opener = null;
  for (const btn of p.openers) {
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => { opener = btn; });
  }
  let wasOpen = false;
  new MutationObserver(() => {
    const open = p.menu.classList.contains("open");
    if (open === wasOpen) return;
    wasOpen = open;
    for (const btn of p.openers) btn.setAttribute("aria-expanded", String(open));
    if (open) {
      const item = p.menu.querySelector("button.active:not(.hidden)") || p.menu.querySelector("button:not(.hidden)");
      item?.focus({ preventScroll: true });
    } else if (p.menu.contains(document.activeElement) || document.activeElement === document.body) {
      // Picking a fractal can switch modes, hiding the row the opener was
      // in: fall back to the same button in the row now showing.
      const target = opener?.offsetParent ? opener : p.openers.find((b) => b.offsetParent);
      target?.focus({ preventScroll: true });
    }
  }).observe(p.menu, { attributes: true, attributeFilter: ["class"] });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = POPOVERS.find((p) => p.menu.classList.contains("open"));
  if (!open) return;
  e.preventDefault();
  open.menu.classList.remove("open");
});

function flashLabel(btn, text) {
  const original = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = original; closeShareMenu(); }, 1500);
}

els.shareSaveBtn.textContent = Platform.saveImageLabel;
els.shareSaveBtn.addEventListener("click", async () => {
  try {
    const saved = await Platform.saveImage(await pendingCapture, shareFileName());
    if (saved) flashLabel(els.shareSaveBtn, "Saved!");
    else closeShareMenu();
  } catch (err) {
    closeShareMenu();
    reportError(`Save image failed: ${err && err.message ? err.message : err}`);
  }
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard needs a secure context (not the LAN dev server).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

els.shareCopyBtn.addEventListener("click", async () => {
  const ok = await copyText(buildShareUrl());
  flashLabel(els.shareCopyBtn, ok ? "Copied!" : "Copy failed");
});

els.shareNativeBtn.addEventListener("click", async () => {
  const url = buildShareUrl();
  closeShareMenu();
  try {
    await Platform.share({ blob: await pendingCapture, fileName: shareFileName(), url, title: "Fractal Atlas" });
  } catch (err) {
    reportError(`Share failed: ${err && err.message ? err.message : err}`);
  }
});

// Pasting a different link into an open tab only changes the hash.
window.addEventListener("hashchange", applyShareHashFromUrl);

// ---------------------------------------------------------------- init

updateLUT(); // first: Carpet/Gasket renders read the LUT on the CPU
selectFractal(currentName, { fresh: true });
updateColorSwatches();
requestRender();
applyShareHashFromUrl();
Platform.onOpenUrl(applyShareLink); // before hideLaunchScreen, which waits on it
// requestRender draws on the next animation frame; one frame after that it
// has been painted, so the app's launch screen can fade into it (no-op on
// the web, see platform.js).
requestAnimationFrame(() => requestAnimationFrame(() => Platform.hideLaunchScreen()));

// One-shot layout diagnostic: if the canvas collapsed to near-zero size
// (a CSS/flexbox bug) nothing will be visible even though no JS error
// was thrown, so surface that case explicitly too. Checks the canvas the
// current mode shows: a share link that opens a vector mode hides
// mainCanvas (display: none, so 0x0), which is correct, not a collapse.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const c = mode === "fractal" ? els.mainCanvas : VECTOR_VIEWS[mode][1];
  if (c.clientWidth < 4 || c.clientHeight < 4) {
    reportError(`Diagnostic: ${c.id} has collapsed to ${c.clientWidth}x${c.clientHeight} CSS px (canvasArea: ${els.canvasArea.clientWidth}x${els.canvasArea.clientHeight}). This is a layout bug, not a rendering bug.`);
  }
}));
