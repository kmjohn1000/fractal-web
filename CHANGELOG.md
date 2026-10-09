# Changelog

Newest version at the top. See CLAUDE.md for when and how to bump.

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
