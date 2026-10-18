# Changelog

Newest version at the top. See CLAUDE.md for when and how to bump.

## 1.36.2 — 2026-10-17
- Website: the app's files now load with the version number in their address, so a browser can never mix files from two versions.

## 1.36.1 — 2026-10-17
- Website: the installed web app now refreshes its offline copy whenever the app changes, so it never keeps an old version.

## 1.36.0 — 2026-10-17
- New fractal: the Apollonian gasket, circles packed inside circles, made by repeatedly reflecting through four circles. It zooms as deep as the Sierpinski gasket, about a quadrillion times.
- Its info card names the curvature of the circle under the center: in this packing every circle's curvature is a whole number.
- Six Surprise-me places for it, including Golden Dive, a point whose view repeats every 17.9× of zoom, 460 billion times deep.

## 1.35.4 — 2026-10-16
- Surprise me on the Tricorn: Antenna Talons and Baby Tricorn are recentered and zoomed out so the whole shape fits on a phone, tails included.

## 1.35.3 — 2026-10-16
- Surprise me: Elephant Valley lands upside down, so the elephants march along the top of the set; Cauliflower is zoomed out so the whole shape fits on a phone; Bird's Eye and Butterfly Crest are zoomed out a little to show more around them.

## 1.35.2 — 2026-10-16
- If the browser has turned graphics off for the page (iOS Safari can do this for a while after a graphics crash), the app now says so and how to recover, instead of showing "Error: null".

## 1.35.1 — 2026-10-16
- Fixed: deep zooms of Newton's method near its central star, and near the smaller copies of it, turned blocky with the wrong colors. They now stay sharp there too.
- Phoenix switches to its deep-zoom math later, below 1/10,000 instead of 1/1,000. Places in between, like Ember Spiral, now render as before: live while you drag, with full smoothing.
- Fixed: a share link with an enormous coordinate could stop Newton's method or Phoenix from drawing.
- The info card now says why deep zoom is unavailable on a device (no WebGL2, or a failed self-test).

## 1.35.0 — 2026-10-16
- Surprise me has 35 new places, on every zoom fractal except the Rabbit (92 in all):
  - Mandelbrot: Cauliflower, Twin Medallions, Sea Urchin, Cross Medallion
  - Burning Ship: Clipper, Needle Forest, Stingray
  - Tricorn: Sunburst Minibrot, Storm Minibrot, Three Horns
  - Celtic: Celtic Heart, Celtic Arrow
  - Multibrot³: Haloed Minibrot, Coral Minibrot, Sideways Minibrot
  - Phoenix: Triskelion, Black Lotus, Sunrise Fringe
  - Julia sets: Twin Curl, Fire Tendrils, Vortex, Serpent (Phoenix); Snowflake, Frost Cluster (Dragon); Spiral Cloak, Lagoon Spiral (Spiral)
  - Newton's method: Quarter Turn (a spiral dive), Deep Necklace (ten billion times deep), Basin Triad
  - Spiral dives on the Sierpinski carpet (Center Line, Corner Hop, Triple Turn) and gasket (Stair Dive, Long Step, Hypotenuse Slide)

## 1.34.0 — 2026-10-16
- The Phoenix fractal and its Julia set now zoom far deeper: they stay sharp down to about a billion times, where they used to blur past about 10,000 times. Deep views use fast math for most pixels and switch to exact 64-bit math only where it's needed, and the app checks the exact math first; if the check fails, it keeps the old behavior.

## 1.33.4 — 2026-10-16
- Fixed: zooming Newton's method extremely deep right next to its center (past about 10⁻¹⁵) went blank since 1.33.0. There it uses its regular math again, which is sharper that close to the center.

## 1.33.3 — 2026-10-16
- Surprise me on the Mandelbrot set: Sunburst Fan, rows of filament arms fanning out from a hub, over 100 billion times deep (57 places in all).

## 1.33.2 — 2026-10-16
- Surprise me on the Mandelbrot set: Pinwheel, arms of fine filaments spiraling around one center (56 places in all).

## 1.33.1 — 2026-10-16
- Surprise me on the Mandelbrot set: Butterfly Crest, a tiny Mandelbrot set ringed by mirrored butterfly curls (55 places in all).

## 1.33.0 — 2026-10-16
- Newton's method now zooms about ten million times deeper away from its center: it stays sharp down to about 100 billion times, where it used to blur past about 10,000 times. It uses exact 64-bit math on the graphics chip, and checks itself first; if the check fails, it falls back to the old behavior.

## 1.32.4 — 2026-10-16
- Fire Seahorse and Ember Spiral are recentered on an iPhone: the whole seahorse now fits, and the spiral sits in the middle.

## 1.32.3 — 2026-10-16
- Five Surprise-me places are reframed so they fit and sit centered on an iPhone: Manta, Baby Multibrot, Whirlpool, Little Rabbit and Dragon's Tail.

## 1.32.2 — 2026-10-16
- Bird's Eye is back in Surprise me on the Mandelbrot set (54 places), landing at the highest detail, 2000.

## 1.32.1 — 2026-10-16
- Rolled back 1.32.0: detail tops out at 2000 again, and Bird's Eye is out of Surprise me for now (53 places). At high detail, zooming in could lose the graphics and force a reload.

## 1.32.0 — 2026-10-15
- Surprise me on the Mandelbrot set: Bird's Eye, a spiral eye that only appears at very high detail (54 places in all). It lands with detail set to 8000.
- The detail slider now goes up to 8000, up from 2000, and moves in even steps across its range. Auto detail still stops at 2000.
- If high detail is ever too much for the device and the view has to reload, it comes back at auto detail and says why.

## 1.31.0 — 2026-10-15
- Surprise me now covers every zoom fractal, with 21 new places (53 in all):
  - Celtic: Baby Celtic, Manta, Celtic Cross, Four-Leaf Clover, Halo Bell
  - Multibrot³: Baby Multibrot, Twin-Disk Minibrot, Seahorse Curl, Spiral Galaxy
  - Phoenix: Whirlpool, Firebird, Ember Swarm
  - Julia sets: Little Rabbit, Dragon's Eye, Twin Spirals, Dragon's Tail, Galaxy, Seahorse Tail
- Three new spiral dives: Rabbit Hole, Into the Eye and Into the Galaxy.
- Detail now rises smoothly during every spiral dive, so the centers stay detailed instead of going black, and Pole Star's colors no longer jump on landing.

## 1.30.2 — 2026-10-15
- On fractals with one Surprise-me place (Newton's method, Sierpinski gasket), tapping Surprise me again spirals back out to the opening view; before, it did nothing.

## 1.30.1 — 2026-10-15
- Surprise me on Newton's method: Pole Star, a spiral dive a billion times into the six-armed star at the center.

## 1.30.0 — 2026-10-15
A refined toolbar (developed as 1.25.1–1.25.4 on the web, released together):
- Quieter sliders: a slimmer track and a small light-gray thumb in place of the big white one, so the slider no longer draws the eye away from the fractal. It grows slightly while you hold it, with the same large touch area.
- The toolbar buttons keep the same order in every mode: fractal picker, color and info first, then that mode's own tools, then Back, Share and Reset. On iPad and wider screens, Back, Share and Reset sit at the right edge.
- New icons: a die for Surprise me and a house for Reset (the old ones read as "AI" and "undo").
- Back is dimmed when there's nothing to go back to.
- Tap the speed button to step to the next speed; hold and slide still works.
- In landscape on iPhone, the toolbar stays clear of the notch and Dynamic Island.
- VoiceOver now hears whether dual view, box zoom, info and fill are on, and whether a menu is open. Escape closes the open menu, and focus returns to its button.
- At the largest text sizes, the speed button's label no longer spills out of the button.

## 1.25.0 — 2026-10-14
- Play depth: the Koch snowflake, Pythagoras tree, dragon, Hilbert, Gosper and arrowhead curves get a play/pause button that steps the depth up and back down on its own. Next to it, a speed button: hold it and slide left for slower, right for faster (¼× to 4×). Touching the depth slider or switching fractals stops playback. Replaces the Koch snowflake's one-way animate button.

## 1.24.0 — 2026-10-14
- Surprise me now works on the Phoenix Julia set, with five places: Flame Column, Firebird Isle, Fire Seahorse, Feather Cascade and Ember Spiral.
- Surprise me on the Sierpinski carpet and gasket: a seven-second spiral dive, turning as it zooms about a billion times deeper, landing upright. With Reduce Motion on, it's a normal flight without the spin.

## 1.23.0 — 2026-10-14
- Julia sets in dual view: picking a Julia preset (or tapping dual view on one) shows the Mandelbrot set it comes from (Phoenix for the Phoenix Julia), zoomed in around its point c, with the Julia set below. The Julia pane names the preset until you move c.

## 1.22.1 — 2026-10-14
- Surprise me framing: Ghost Ship and Burning Galleon zoom out to show their full masts; Antenna Talons, Baby Tricorn and Hidden Mandelbrot are centered on a phone screen.

## 1.22.0 — 2026-10-14
- Surprise me now works on Tricorn, with seven curated places: Baby Tricorn, Hidden Mandelbrot, Tilted Tricorn, Lace Minibrot, Lace Tricorn, Antenna Talons and Flame Minibrot.
- New Mandelbrot place: Starburst.
- Fixed: Surprise me could land on a black screen after you'd moved the detail slider. Landing now sets detail automatically for the new place.
- Renamed two Mandelbrot places to match what they show: Feather Valley is now Double Spiral, and the old Double Spiral is now Frond Thicket.

## 1.21.0 — 2026-10-14
- Surprise me now works on Burning Ship, with six curated places: Armada, Ghost Ship, Burning Galleon, Lightning, Twin Ships and Sunken Crown.
- Burning Ship places are shown ship-side up: the flight turns the view 180° on the way in. Tap the compass to turn it back.

## 1.20.2 — 2026-10-14
- Surprise me has three new Mandelbrot places: Three-Way Branch, Tante Renate and Antenna Minibrot.

## 1.20.1 — 2026-10-13
- No visible change: the iOS app now declares up front that it uses no special encryption, so App Store Connect stops asking the export-compliance question on every upload.

## 1.20.0 — 2026-10-13
- The info card is redesigned like a map legend: the place name (after Surprise me) or the fractal as the title, how deep you are ("1.8 trillion times deeper"), a scale bar showing how wide the view is, and the center point, with the technical readout underneath. A darker frosted card keeps it readable over bright colors, and it stays clear of the rotation compass.
- Patterns (Koch, tree, curves, fern and the other point patterns) get the same card with a scale bar.
- In dual view, the Julia pane is labeled "Julia set of the center point".
- The iteration slider is now labeled "detail".

## 1.19.0 — 2026-10-13
- Sierpinski carpet no longer jumps or scrambles when you zoom very deep into one of its repeated copies far from the original.
- Sierpinski gasket and carpet do less graphics work per frame when zoomed deep, which should help on older phones. They look exactly the same.
- At extreme zooms the info card's depth for the gasket and carpet now always matches the depth actually drawn.

## 1.18.10 — 2026-10-13
- The info card's center point now always has enough digits to find the spot again, at any zoom. Past 1,000× it used to show only 6 digits, which at deep zoom pointed somewhere else entirely. It's now a plain decimal at every depth (e.g. -0.745289000123457 + 0.113070000056789i), growing one digit per tenfold zoom.

## 1.18.9 — 2026-10-13
- The color button now shows your current colormap as a small strip, like the rows in the colormap menu, instead of the same three-circle icon everywhere. On patterns (fern, Koch, tree, curves) it shows the current color. VoiceOver reads the current choice, e.g. "Choose colormap (Classic)".

## 1.18.8 — 2026-10-13
- Big zooms in the info card read in words, like "Zoom 1.8 trillion times", instead of "1.8 trillion×".

## 1.18.7 — 2026-10-13
- Redesigned colormap menu: each palette shows as a full-width strip under its name, the current one has a check mark, and all of them fit on screen without scrolling on most phones.

## 1.18.6 — 2026-10-13
- Sierpinski gasket and carpet now keep revealing new detail as far as you zoom (to about a quadrillion times), instead of going blank or blurry past a few thousand times.

## 1.18.5 — 2026-10-12
- "Fractal Atlas™": the trademark symbol now appears in the browser tab title, on the support and privacy pages (with a trademark notice at the bottom), and in the label on saved and shared images.

## 1.18.4 — 2026-10-11
- The website now shows Safari's "Get the app" banner on iPhone and iPad, linking to Fractal Atlas on the App Store.

## 1.18.3 — 2026-10-10
- Smaller app and website download: icons recompressed (about 1 MB lighter, no visible change).

## 1.18.2 — 2026-10-10
- New app icon: a bright close-up of Seahorse Valley in the Classic colors, so it stands out on dark backgrounds instead of fading into them.

## 1.18.1 — 2026-10-09
- Share links now name the colormap (cm=Classic) instead of numbering it, so links keep their colors when colormaps are added or reordered. A link naming an unknown colormap opens in the default one.

## 1.18.0 — 2026-10-09
- Two new colormaps: Classic (blue, white, orange, black, the familiar Mandelbrot poster look) and Fire (black through red and orange to cream).
- Inferno, Plasma, Viridis, Turbo and Twilight now use the full-detail versions of their matplotlib palettes, so gradients are smoother and Turbo and Twilight look like the originals.
- Removed Magma (nearly identical to Inferno) and HSV; Gist Rainbow is now called Spectrum. The picker is reordered, with Inferno still the default. Older share links may open in a different colormap.

## 1.17.0 — 2026-10-08
- Each fractal now remembers where you left it. Switch to another fractal and back, or visit Koch and return, and your zoom, rotation, iteration setting, Back history and Julia pane are still there. Reset (that fractal only) or relaunching the app starts over.
- Picking the fractal you're already on no longer resets it.

## 1.16.0 — 2026-10-08
- Added the Celtic Mandelbrot, a Mandelbrot variant with a folded edge, with deep zoom, a Julia dual view and a picker thumbnail.

## 1.15.0 — 2026-10-05
- The app now follows the iOS Larger Text setting, including the accessibility sizes: menus, the picker, the info overlay and labels grow with it.

## 1.14.6 — 2026-10-04
- Opening a shared link when the app launches no longer applies it twice.
- Malformed share links (odd mode names, huge numbers or rotations) are rejected or cleaned up instead of reaching the view.
- If the browser drops the graphics context, the reload now keeps your current view.
- Opening a link to another curve or pattern clears Back history from the previous one.
- After a two-finger gesture in box-zoom mode, the next tap in dual view is no longer swallowed.
- The launch screen's safety timeout now works even if startup stalls.

## 1.14.5 — 2026-10-04
- Surprise me now lands centered on its sights: Spiral Cluster and Feather Valley on the spiral's eye, Elephant Valley on a row of elephants, and Mini Mandelbrot on an actual mini Mandelbrot.

## 1.14.4 — 2026-10-04
- Koch's fill button now shows a half-filled snowflake instead of a square that looked like a Stop button.

## 1.14.3 — 2026-10-04
- Patterns (Koch, tree, curves, fern and the other point patterns) now sit on the same pure black as the fractals, instead of dark grey.

## 1.14.2 — 2026-10-04
- Faster startup: picker previews load the first time the picker opens, and the info overlay does no work while it's hidden.

## 1.14.1 — 2026-10-04
- The info overlay now leads with plain language (zoom, detail, rotation, and the place name after Surprise me), with the technical readout underneath.
- The browser tab and home-screen name are now "Fractal Atlas".

## 1.14.0 — 2026-10-04
- The fractal picker now shows a preview of every fractal and pattern, with clearer names (Burning Ship, Newton's method, Sierpinski carpet) and the Julia sets grouped together.

## 1.13.0 — 2026-09-26
- Shared links open straight in the Fractal Atlas app on iPhone and iPad when it's installed (universal links), landing on the shared view.

## 1.12.0 — 2026-09-26
- Dual view: the Julia set now follows the center of the main fractal as you pan and zoom it, so the two panes stay in step.
- The dual-view crosshair marks that center; it appears while the main view moves and fades when it's still.
- Tapping the main pane glides that point to the center (it used to set the Julia point directly).

## 1.11.1 — 2026-09-26
- Opening a shared link to a pattern (Koch, fern, curves…) no longer shows a false "layout bug" error banner.

## 1.11.0 — 2026-09-26
- A compass appears while you rotate a view and fades once it's still; tap it to turn the view back upright. Works on every fractal and pattern, including both panes of the dual view.

## 1.10.3 — 2026-09-26
- Smoother color gradients on the Mandelbrot-family fractals: faint ripple bands are gone, most visibly on Multibrot³.

## 1.10.2 — 2026-09-26
- The app is now called Fractal Atlas (app name, home-screen name, export watermark and privacy policy).
- Privacy policy now accurately describes saving images to Photos (add-only permission).

## 1.10.1 — 2026-09-26
- The iOS app's identifier is now com.kmjohn.fractalexplorer (was io.github.kmjohn1000.fractalexplorer), ahead of App Store registration.

## 1.10.0 — 2026-09-26
- Koch Snowflake, Pythagoras Tree and the line curves (Dragon, Hilbert, Gosper, Arrowhead) now have a single-color picker instead of a colormap, each with its own default color. Early depths used to draw in the colormap's darkest color and were hard to see.
- Line curves and the Koch outline draw with bolder lines at early depths, thinning out as the detail gets denser.
- Added Gold and White to the color choices (also for the fern).

## 1.9.1 — 2026-09-26
- The launch screen now waits longer for a slow first draw instead of briefly showing a black screen.

## 1.9.0 — 2026-09-26
- The iOS app has a launch screen: it opens on the app's empty frame (dark canvas and toolbar strip) and fades straight into the drawn fractal, with no blank screen in between.

## 1.8.0 — 2026-09-26
- Saved and shared images now carry a small "Fractal Explorer" label in the bottom-right corner. The on-screen view is unchanged.

## 1.7.3 — 2026-09-26
- Fixed pale yellow patches in the corners of escape-time fractals (most visible in split view). Areas far outside the set are now the colormap's darkest color, as they should be.

## 1.7.2 — 2026-09-25
- Fixed an error when dragging the Hilbert Curve's depth slider all the way down. Its lowest depth is now 1, the first depth that draws anything.

## 1.7.1 — 2026-09-24
- Fractals are centered in the visible area above the toolbar instead of partly behind it, and split view's lower pane is no longer covered by the toolbar.
- Shorter toolbar: thinner slider row and less empty space below the buttons.

## 1.7.0 — 2026-09-24
- New iOS app version (Capacitor), built from the same code as the website.
- In the iOS app, "Save to Photos" saves the image straight to your photo library, and "Share…" opens the iPhone share sheet with the image and a link to the website.

## 1.6.0 — 2026-09-24
- Sliders look like native iOS sliders: the track fills in blue up to the thumb and stays gray after it, and the thumb is plain white.
- All text sizes (info card, buttons, labels, menu headers) now scale together from one setting. Nothing looks different yet; this prepares for following the iPhone's text-size setting in the app version.

## 1.5.2 — 2026-09-24
- The slider is back on its own row above the buttons on wider screens. Phones keep all the buttons on one line.

## 1.5.1 — 2026-09-24
- Shorter toolbar. On phones the toolbar buttons share the width evenly, so every toolbar (including Mandelbrot's nine buttons) fits on one line instead of wrapping onto a third row. On wider screens the slider sits on the same line as the buttons instead of on its own row.

## 1.5.0 — 2026-09-24
- The toolbar is now frosted glass that floats over the bottom of the image: the fractal shows through it, blurred, instead of stopping above a dark bar. The image now uses the full screen height.
- Redrawn toolbar icons as one matching set (same line weight, rounded ends and corners). The menu, info and box-zoom icons are bolder and simpler so they're easier to read; box zoom is now a viewfinder frame.
- Toolbar buttons are a subtle translucent tint instead of solid gray tiles.

## 1.4.0 — 2026-09-24
- Keyboard navigation on desktop, in every fractal and pattern: arrow keys pan, Shift + Left/Right rotates, + and − zoom, R resets the view. Up always means up on screen, even when the view is rotated. Back undoes keyboard moves too.

## 1.3.4 — 2026-09-24
- The info overlay now floats over the top-left corner of the image instead of sitting above it, so showing or hiding it no longer resizes or shifts the fractal. Pans and pinches that start on the overlay still reach the image.

## 1.3.3 — 2026-09-24
- The info overlay is now a rounded dark card, so it stays readable over any colors. The fractal name is larger and bold; the stats underneath are smaller and dimmer.
- Center and scale show as plain decimals (e.g. -0.75 + 0.00i, scale 1.25) until you zoom past 1e-3. From there they switch to full-precision scientific notation, as before.

## 1.3.2 — 2026-09-24
- Vicsek Fractal now draws the cross (plus-sign) form: center plus the four edge midpoints, instead of center plus the four corners.

## 1.3.1 — 2026-09-24
- The fractal picker has two labeled parts, "Infinite Zoom" and "Beautiful Patterns", instead of three technical groups (escape-time, Julia sets, other). The dividing line between sections is gone, so it reads as one menu.

## 1.3.0 — 2026-09-24
- Three new curves in the picker: Hilbert Curve, Gosper Curve (the "flowsnake") and Sierpinski Arrowhead. They share the Dragon Curve's controls; each has its own depth slider range and keeps its own depth and pan/zoom.
- Koch Snowflake and Dragon Curve now use the same shared curve engine; they look exactly as before.

## 1.2.0 — 2026-09-24
- Three new fractals in the picker: Sierpinski Triangle, Lévy C Curve and Vicsek Fractal. They're drawn the same way as the Barnsley Fern and share its controls (points, color, box zoom, twist to rotate), and each keeps its own pan/zoom.

## 1.1.1 — 2026-09-24
- Surprise me flights are slower: about 1 second for short hops, up to 2.5 seconds for the deepest dives.

## 1.1.0 — 2026-09-24
- New "Surprise me" button (sparkle icon, Mandelbrot only): flies to a random hand-picked spot — Seahorse Valley, Elephant Valley, a mini Mandelbrot, and more — never the same one twice in a row. Back returns to where you were.

## 1.0.3 — 2026-09-24
- Ember colormap retuned to copper/bronze tones so it no longer looks like Inferno and Magma.

## 1.0.2 — 2026-09-24
- New toolbar icons: a 2×2 grid for the fractal menu and a circled "i" for the info overlay.

## 1.0.1 — 2026-09-24
- Box zoom button now uses a dashed-rectangle icon.

## 1.0.0 — 2026-09-24
- Baseline version for the changelog. Latest changes up to this point:
  - Colormap picker: the palette button opens a menu instead of cycling through colormaps.
  - Added Viridis, Turbo, Glacier, Ember and Grayscale colormaps.
  - Share menu: save image, copy link, native share.
  - Phoenix fractal (parameter space plus classic Julia:Phoenix).
  - Max iterations adjust automatically with zoom until you set them yourself.
  - The HUD no longer shows the colormap name. The split-view icon now stacks its two panes vertically.
