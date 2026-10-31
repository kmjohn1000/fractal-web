// The "Surprise me" places: only TELEPORT_DESTINATIONS (split from app.js, a pure move).
// Plain data; needs nothing from earlier files (Math.PI only). Used by teleport.js and the mode code.
// An ES module: every top-level declaration is exported (test-hooks.js and the importing files rely on it;
// tests/cases.mjs reads this file's text and accepts the `export`).

// "Surprise me" destinations (see teleport()). Keyed by FRACTAL_CONFIGS name,
// not FTYPE: FTYPE.ESCAPE is shared by Mandelbrot, Multibrot³ and the Julia
// presets, whose coordinates mean different things. scale is the view's
// half-height, as everywhere else. Optional fields: rotation (radians; the
// landed view turns to it), maxIter (lands with detail locked), spiral (a
// spinning dive) and colormap (a COLORMAPS name: the flight to this place
// applies it unless the user has picked a palette, and a place without one
// goes to the fractal's own default, defaultColormap in FRACTAL_CONFIGS; no
// place names one yet). Every entry was checked by rendering it
// (not taken on faith): each lands on visible boundary detail at its scale.
// re/im are strings so the source keeps every digit it was given. Each is
// the feature's center, not just a point near it: Spiral Cluster is the
// Misiurewicz point M(28,2) at the spiral's eye; Mini Mandelbrot sits just
// left of the period-55 nucleus so the minibrot and its halo are centered.
// Three-Way Branch is a Misiurewicz point where three arms meet; Antenna
// Minibrot is the period-4 minibrot (nucleus -0.156520166834 +
// 1.032247108923i), shifted onto its body's visual center.
export const TELEPORT_DESTINATIONS = [
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
  // Burning Ship opens with the screen's up at -im (flipY, see
  // FRACTAL_CONFIGS), the classic upright picture with every ship's masts
  // above its hull; rotation 0 lands a place upright whatever the view was
  // turned to. (Until 1.44.0 the places turned the view a half turn
  // instead, which mirrored them left to right compared with the classic
  // picture.) Scales are sized so each hull fits a portrait phone's width.
  // Sunken Crown sits just off the real axis (screen top edge at im = 2e-13):
  // across the axis there, the set is a hard black block with streaks.
  { fractal: "Burn. Ship", label: "Armada", re: "-1.7595", im: "-0.036", scale: 6.8e-2, rotation: 0 },
  { fractal: "Burn. Ship", label: "Ghost Ship", re: "-1.941", im: "-0.0038", scale: 6e-3, rotation: 0 },
  { fractal: "Burn. Ship", label: "Burning Galleon", re: "-1.6268", im: "-0.03", scale: 5e-2, rotation: 0 },
  { fractal: "Burn. Ship", label: "Lightning", re: "-1.93932", im: "-0.00178", scale: 6e-4, rotation: 0 },
  { fractal: "Burn. Ship", label: "Twin Ships", re: "-1.9393403", im: "-0.0017282", scale: 4.5e-5, rotation: 0 },
  { fractal: "Burn. Ship", label: "Sunken Crown", re: "-1.7490033572229", im: "0.0000000000014", scale: 1.2e-12, rotation: 0 },
  // Clipper sits by the "wake" near -1.861-0.002i, Needle Forest among the
  // spires on the horizon near -1.51; Stingray is the off-axis period-3
  // copy (nucleus 0.877438833 - 1.519768640i), turned to point down (its
  // 2.5 rad turn of the old orientation, mirrored for the new one).
  { fractal: "Burn. Ship", label: "Clipper", re: "-1.8605", im: "-0.0035", scale: 4.5e-3, rotation: 0 },
  { fractal: "Burn. Ship", label: "Needle Forest", re: "-1.5099", im: "-0.00115", scale: 1.8e-3, rotation: 0 },
  { fractal: "Burn. Ship", label: "Stingray", re: "0.8774", im: "-1.5198", scale: 4e-2, rotation: Math.PI - 2.5 },
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
  // Apollonian places sit off the tangency points, where the inversion count
  // has no limit and a deep view is flat. Circle Fifteen is the gap between
  // the three big circles, centered in its biggest circle (curvature 15).
  // The rest are repelling fixed points of three inversions in a row (dual
  // circles 2, 1, 0 for the Golden pair, numbered as in APOLLO_DUAL; 3, 0, 2;
  // 1, 0, 3; 1, 2, 3), found by iterating the inverse: each view repeats,
  // mirrored, every 9 + 4 sqrt(5) = phi^6 ~ 17.94x of zoom. Golden Dive is
  // Golden Glide's view 17.94^8 x deeper.
  { fractal: "Apollonian", label: "Circle Fifteen", re: "0", im: "0.215", scale: 0.2 },
  { fractal: "Apollonian", label: "Golden Glide", re: String(1 / Math.sqrt(5)), im: String(2 / Math.sqrt(5)), scale: 5e-2 },
  { fractal: "Apollonian", label: "Golden Dive", re: String(1 / Math.sqrt(5)), im: String(2 / Math.sqrt(5)), scale: 5e-2 / (9 + 4 * Math.sqrt(5)) ** 8, rotation: 0, spiral: true },
  { fractal: "Apollonian", label: "Triangle Chain", re: "0.035190936333361365", im: "0.18426213483334736", scale: 2e-2 },
  { fractal: "Apollonian", label: "Lace Triangle", re: "-0.6314757303333053", im: "0.4824045318333193", scale: 3e-3 },
  { fractal: "Apollonian", label: "Bead Strand", re: "-0.3144318014344091", im: "0.7773181617212908", scale: 1e-2 },
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
  // Nova is float32 only (its zoom stops at NOVA_MIN_SCALE = 4e-5), so none of
  // these goes deeper than 8e-5. Each was found by a search and checked on a
  // render. "Minibrot" is the established maths term for a small copy of the
  // Mandelbrot set; every name here is our own. Dark Moon is the period-2
  // component (centered on its nucleus); Fiddlehead the hooked tip of the
  // crescent; Sea Foam a bubble field over gray lace. Mandelbrot Cameo is an
  // upright copy (the period-3 minibrot, nucleus c = -0.6565181996) in a
  // filament web; Filament Star a period-4 minibrot at the hub of an
  // eight-armed beaded star; Pinwheel Field kaleidoscopic pinwheels round a
  // period-5 minibrot; Pearl Chain a node on a beaded filament (rotation
  // -0.36 levels the chain); Web Hub a period-12 minibrot in a dense filament
  // web; Seahorse Cove the Seahorse Valley structure reproduced inside the
  // period-3 copy, the deepest of them, near Nova's zoom limit.
  { fractal: "Nova", label: "Dark Moon", re: "-0.4417424305", im: "0", scale: 0.2, rotation: 0 },
  { fractal: "Nova", label: "Fiddlehead", re: "0.3", im: "0.55", scale: 0.06, rotation: 0 },
  { fractal: "Nova", label: "Sea Foam", re: "-0.32275", im: "0.27357", scale: 0.01, rotation: 0 },
  { fractal: "Nova", label: "Mandelbrot Cameo", re: "-0.6674", im: "0", scale: 0.04, rotation: 0 },
  { fractal: "Nova", label: "Filament Star", re: "-0.7546072144", im: "0", scale: 0.02, rotation: 0 },
  { fractal: "Nova", label: "Pinwheel Field", re: "-0.6108494908", im: "0", scale: 0.006, rotation: 0 },
  { fractal: "Nova", label: "Pearl Chain", re: "-0.48047", im: "0.43159", scale: 8e-4, rotation: -0.36 },
  { fractal: "Nova", label: "Web Hub", re: "-0.7605177785", im: "0", scale: 4e-4, rotation: 0 },
  { fractal: "Nova", label: "Seahorse Cove", re: "-0.66576", im: "0.0016304", scale: 8e-5, rotation: 0 },
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
