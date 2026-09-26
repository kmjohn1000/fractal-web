# Changelog

Newest version at the top. See CLAUDE.md for when and how to bump.

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
