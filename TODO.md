# Roadmap

Now / Next / Later. Adding an item here isn't approval to build it (see CLAUDE.md).

## Now — land the launch
Get approved, and harden the app for App Review and a first wave of phone users.

- [ ] Ship the first App Store update, now 1.14.x (blocked until 1.10.2 is
      approved): `npm run ios:sync`, then Xcode Archive → Distribute App →
      Upload. Brings universal links, the rotation compass,
      Julia-follows-center, smoother coloring, the thumbnail picker and the
      plain-language info overlay

## Next — discovery and delight
Help people find beautiful places, and give them more ways to see them.
Celtic/Buffalo/Lambda first (quick win); distance estimation before zoom-to-minibrot.

- [ ] New escape-time types: Buffalo, Lambda (Celtic is done, see Done)
      (single-state iteration, reuse existing shader/perturbation/
      supersampling pipeline with no structural changes)
- [ ] Surprise me and a one-line description for every escape-time fractal:
      today Surprise me is Mandelbrot only (`7e2c606`). Add curated places per
      fractal (Burning Ship's mini-ships, Tricorn, Celtic, ...), and a short
      "what you're looking at" blurb in the info card or picker. Cheap content
      work next to the new types (idea from the WebSim Fractal Explorer review,
      2026-10-09)
- [ ] More Mandelbrot-family variants beyond Buffalo/Lambda: Heart, Feather,
      Perpendicular Buffalo/Ship, Mandelbar variants and similar. The WebSim
      explorer offers 52 types and drew 2,074 views, so exotic variants seem to
      attract people. Each is a small ftype branch on the shared pipeline; check
      which ones perturbation can handle (abs-folds need `diffabs`) before
      promising deep zoom. Count in the listing is "22 fractals", update with
      any addition (2026-10-09)
- [ ] Burning Ship looks like a ship: the standard images show it upright,
      which means mirroring the imaginary axis (the set sits at y < 0 and
      the picker thumbnail shows the hull on top, upside down), plus a fire
      default palette (Ember/Hot) for this fractal only. Caveats: existing
      share links store y, so a mirror needs a link-version bump or a flag
      so old Burning Ship links keep opening the same place; check whether
      colormaps can have a per-fractal default today (user idea 2026-10-08)
- [ ] Exterior distance estimation as a coloring style: track dc' = 2·z·dc + 1
      alongside z, color by b = 2|z|·ln|z| / |dc| (normalized by u_scale).
      Draws thin filaments crisply instead of as speckle. Fits beside orbit
      traps (Tier 3); the same estimate could steer "zoom to nearest
      minibrot" and auto-discovery toward the boundary. Perturbation path
      needs dc tracked from the full Z+dz; watch float32 overflow at high
      iteration counts
- [ ] Orbit trap coloring as a style selector
- [ ] Minimap: small inset of the whole fractal with a marker for the
      current view, so deep zooms keep their bearings. Render the overview
      once per fractal/colormap into a small texture; at deep zoom the view
      rectangle is sub-pixel, so draw a marker/crosshair at the center
      instead of the rectangle. Respect rotation. Decide show/hide rule
      (e.g. only when zoomed in past some scale)
- [ ] "Zoom to nearest minibrot" guided action
- [ ] Open the Mandelbrot family rotated 90° on portrait phones: the set is
      wider than tall, so today it sits small mid-screen with ~45% empty
      space above and below. Rotation already exists; the opening view's
      fit would use the swapped aspect. Safe fallback: tighter framing
      (UI review)
- [ ] Accent color from the active colormap: selected states (picker ring,
      active buttons, slider fill) use a fixed iOS blue (#3a6ea5/#6cf);
      derive the accent from the current colormap's bright end instead, so
      the controls match the art (UI review)
- [ ] One-time first-launch hint for the gestures (pinch, two-finger twist,
      tap to recenter in dual view); dismiss on first interaction, remember
      it in localStorage (UI review)
- [ ] Colormap animation (WebGL: a u_colorPhase uniform shifting the LUT
      lookup over time via requestAnimationFrame; Koch/Tree: cycle the
      colormap's stops, like kochAnimateBtn cycles depth; new toggle, not
      a repurposed "cycle colormap" button)

## Later — big bets
Flexible scope and timing. Chains: new types → formula editor → Fractint importer;
distance estimation → zoom-to-minibrot / AI discovery.

### Interface polish
- [ ] Friendlier colormap names: "Gist Rainbow" and "HSV" are matplotlib
      jargon; optional, the scientific names are fine for enthusiasts
      (UI review)

### Paid tier (parked, user decision 2026-10-08)
- [ ] High-res export as a paid-tier feature: saved/shared images use the
      live canvas, capped at `Math.min(devicePixelRatio, 2)`. A paid tier
      would render exports at a higher resolution, decoupled from that cap.
      Free export stays as is. Needs a monetization decision first (in-app
      purchase via StoreKit, a price, and updated listing/privacy wording);
      a watermark-free export could be part of the same tier. The app is
      free with no monetization today, so nothing here is approved to build

### Creator tools
- [ ] Make-your-own-fractal formula editor (needs the building blocks
      Celtic/Buffalo/Lambda introduce before the abstraction is clear)
- [ ] Fractint PAR/FRM importer: paste a .par entry + its .frm formula and
      render it. Parse Fractint's formula language (init `:` iterate `,`
      bailout; note `|z|` there is modulus squared) into GLSL, map
      center-mag (center, mag = 1/half-height, x-aspect, rotation, skew),
      decode the `colors=` palette (3 chars/color, 6 bits/channel) and
      logmap/inside. A superset of the formula editor, so build after it
- [ ] Custom 3x3 keep/remove mask for Carpet (a preset of the L-system/
      mask idea, not standalone work)

### New and harder fractals
- [ ] "Powers & Dominions" type (Jim Muth's Fractint MandAutoCritInZ):
      z <- a·z^b + d·z^f + c, defaults a=1, b=2.005, d=2, f=1 (b=2 is
      exactly Mandelbrot via w=z+1); z0 = critical point
      (-d·f/(a·b))^(1/(b-f)), principal branch (≈ -0.9975-0.0156i);
      Fractint bailout |z|² < 100. The principal-branch z^b jumps ~1.8°
      across the negative real axis -- those seams are the point. Ship
      the PAR's view as a preset/share link: center
      -1.721155413111899+0.0576078992724704i, mag 6295098 (scale ~1.59e-7,
      past the float32 wall), rotation -111.5° (check Fractint's rotation
      sign and 4:3 aspect). Import its `colors=` palette as a colormap and
      emulate logmap=125 banding, inside=0 black. Deep zoom: perturbation
      with dz' = Z^b·expm1(b·log1p(dz/Z)) + 2dz + dc (scaled by a/d),
      rebasing to the nonzero Z[0]; flag pixels where arg(Z)+arg(1+dz/Z)
      leaves (-π, π] (pixel on a different branch than the reference ->
      dz jumps to ~0.03 and float32 loses the ~3e-10 pixel offset) and
      recompute those on the CPU in float64 (Web Workers). This view sits
      on the antenna, where orbits run along the branch cut, so the
      fixup matters
- [ ] Viewport-adaptive recursion for Koch/Dragon/Tree (currently the
      only fractal family that doesn't adapt detail to zoom — Carpet/
      Gasket compute depth from pixel size, Fern regenerates from
      viewport, these three don't; subdivide only parts whose bounding box
      touches the viewport, down to ~1px — detail runs out today at ~13×
      Koch, ~1–2× Tree, ~1× Dragon; filled Koch stays correct since
      off-screen chords lie inside their bounding triangles; Dragon moves
      from the L-system string to its two-map IFS form)

### Discovery
- [ ] AI-curated "find something beautiful" auto-discovery
      (if it calls an AI service, that breaks the App Store "no external
      services" answer and the privacy label — needs a privacy.html/label
      update, or an on-device approach)
- [ ] Website visitor analytics (parked decision): GoatCounter, loaded on the
      web build only (gate in platform.js on !isNative), never in the app;
      update privacy.html (shared by site and app) to say the website counts
      anonymous page views. Needs a goatcounter.com site code first

### Deep-zoom engine — only when someone actually hits these limits
- [ ] Arbitrary-precision reference orbit for zoom past ~1e13
      (computeReferenceOrbit is float64-limited to ~15-16 significant
      digits — do this if/when deep zoom becomes an actual marketed
      feature; the reference orbit is CPU/JS work (BigInt fixed-point),
      but past ~1e-35 the shader's float32 deltas also underflow, so it
      also needs extended-exponent deltas, plus BLA iteration skipping and
      2D reference-orbit textures past MAX_TEXTURE_SIZE)
- [ ] maxIter past 2000 (real blockers: the shader loops are compiled
      with a constant 2000 bound, and one draw that loops 10⁴–10⁶ times
      risks a GPU watchdog timeout/context loss — needs multi-pass
      iteration, saving per-pixel state (z, dz, reference index) in float
      textures between passes; also check gl.getParameter(MAX_TEXTURE_SIZE)
      at runtime — Julia-mode reference orbit texture width is
      2*(maxIter+1) texels, safely under 4096 today; without this, deeper
      views show growing false-black interiors)
- [ ] Phoenix deep zoom (perturbation) — the delta step itself is easy
      (dz' = 2Z·dz + dz² + dc + p·dz_prev, carrying dz_prev and reading
      Z[m-1] from the orbit), but rebasing isn't: restarting at Z[0] = 0
      needs the pixel's z AND z_prev near the reference's (0, 0), and
      z_prev usually isn't, so dz_prev enters as an O(1) term and float32
      loses the pixel offset. Needs a two-state rebase condition or
      multi-reference fallback; prototype against a float64 reference
- [ ] Newton perturbation (rational-function deltas near root
      singularities; harder than Phoenix, do after it; the difference
      factors without cancellation as
      N(Z+δ) − N(Z) = δ(2Z⁴ + 4Z³δ + 2Z²δ² − 2Z − δ) / (3Z²(Z+δ)²);
      less established than escape-time perturbation — prototype first)
- [ ] Cell rebasing for Carpet/Gasket (real fix for the depth-16/22
      precision ceiling — track cell address separately from a small
      per-cell delta, refreshed at each subdivision, same principle as
      the escape-time perturbation rebasing already implemented; CPU
      resolves the ≤4 level-k cells the view overlaps and whether each is
      already a hole; exact, no glitches; ~1e15× with float64 cell math,
      more with BigInt — today Carpet ~3.5e4×, Gasket ~3,000×)
- [ ] Periodicity checking (Brent-style: save z every so often, stop when
      the orbit returns within eps) so interior pixels stop early instead of
      running all of maxIter. Only real speedup where the cardioid/bulb skip
      doesn't apply (Julia, Ship, Tricorn, Multibrot³, Phoenix, minibrot
      interiors). Fast path only; eps must scale with zoom; GPU gain is capped
      by warp divergence, so benchmark on a phone before keeping it

## Deferred indefinitely
- Menger Sponge / other 3D fractals (real 3D rendering project, not a
  slot-in)
- Real-time collaborative exploration

## Explicitly rejected
- Toolbar rework (2026-10-04): moving the iter slider into the info card,
  folding Info/Box zoom/Reset into a "⋯" menu for full 44px buttons, and a
  gradient Surprise me button. Mocked up at 360px and declined: the slider
  is needed for some fractals, so it stays in the toolbar. The row no longer
  wraps (buttons flex down to ~36px wide, still 44px tall).
- Log-compressed coloring past ~100 iterations (to "de-noise" deep zooms):
  tried 2026-09-26, reverted before commit. Deep views sit in a narrow
  band of high iteration counts, so compression flattened Seahorse Valley
  at 4e-10 to a single purple; the linear mapping wasn't noisy there. If
  color density needs changing, make it a user control, not automatic.
- Gasket depth cap 22 → 23: don't. The 22 cap was deliberately chosen
  with one level of safety margin below the simulated-safe 23, to
  absorb real GPUs rounding differently than the simulation did.
  Bumping it spends that margin and reintroduces the aliasing this was
  built to prevent. Cell rebasing (Tier 2) is the correct path to
  deeper Gasket zoom, not this.

## Done
- Each fractal remembers its view while the app is open (1.17.0): `fractalMemory` stashes a fractal's view, iteration setting, Back history and Julia pane when you leave it and restores them on return; Reset (that fractal) and share links start fresh, picking the current fractal no longer resets it, and the colormap stays global. In memory only, so a relaunch starts from the defaults. Dual view stays one app-wide toggle, so a detour through a fractal without dual (Newton, Carpet, Gasket) turns it off. Not in a shipped build yet — `01f6633`
- Celtic Mandelbrot (1.16.0): z' = (|x²−y²|, 2xy) + c as FTYPE.CELTIC; deep zoom via a `diffabs` fold on the real part, Julia dual view, picker thumbnail. Checked against a float64 numpy render: deep views agree on the interior mask (98.8% at 1e-9). Not in a shipped build yet — ships with the next release — `e45eee3`
- Follow the iOS Larger Text / Dynamic Type setting in the app (1.15.0): `FractalBridgeViewController` sets `--text-scale` from `UIFontMetrics` at document start/end and on content-size changes, uncapped through the accessibility sizes; the web build stays at 1. Not in a shipped build yet — ships with the next release — `fa00fa7`
- Code-review hardening (1.14.6): strict share-link parsing (real mode keys only, bounded x/y/s, normalized rotation), cold-start launch link applied once, view kept across a WebGL context-loss reload, Back history cleared when a link switches curve/pattern, box-zoom multi-touch reset, launch-screen fallback that can't be defeated — `393cfeb`
- Universal links no longer claim support.html and privacy.html (AASA exclusions, in the kmjohn1000.github.io repo) — `8225221`
- Koch fill toggle shows a half-filled depth-2 snowflake instead of a Stop-like square — `6903923`
- One background for every mode: pattern views and page body pure black like the fractals — `9d37a80`
- Info overlay in plain language (zoom, detail, rotation, Surprise-me place name) with the technical readout underneath; "Fractal Atlas" in the tab and home-screen names — `5d71c50`
- Fractal picker as a thumbnail grid with display names and a Julia sets group (scripts/render_thumbs.mjs) — `f180020`
- Dual view: Julia follows the main pane's center; flashing center crosshair; tap glides to center — `ab30998`
- Rotation compass: appears while rotating, fades when still, tap to reset rotation — `ceb4236`
- App Store release via Capacitor: app shell, Save to Photos, share sheet, icon, launch screen, privacy/support pages; 1.10.2 submitted for review 2026-09-26 — `e10c8f0`
- Single-color picker for Koch/Tree/Dragon/Hilbert/Gosper/Arrowhead; bolder early-depth strokes (were too faint on iPad) — `2127293`
- Watermark on exports: sentence-case "Fractal Atlas" pill (originally "Fractal Explorer", renamed with the app), bottom-right, always on — `bc4e05f`
- Fractals centered above the toolbar (canvas ends at it; split view's lower pane no longer covered); shorter toolbar — `47dd1c7`
- Keyboard navigation: arrows pan, Shift+Left/Right rotate, +/- zoom, R reset — `64ecba2`
- Picker split into "Infinite Zoom" / "Beautiful Patterns" sections; zoom-only buttons gated on category — `3157bb6`
- Generic L-system engine; Koch/Dragon migrated; Hilbert, Gosper, Sierpinski Arrowhead added — `ff5a58f`
- Sierpinski Triangle, Lévy C Curve and Vicsek Fractal as IFS modes on the fern engine — `023d2fc`
- "Surprise me" teleport to curated Mandelbrot locations — `7e2c606`
- Box-zoom (zoom selector) for Barnsley Fern — `0a3ad53`
- Show the last frame while dragging at deep zoom — `f0f0e98`
- UI consistency: canonical control order, fern palette icon, Back for vector views, HUD hidden by default with a toggle — `05ebfaf`
- Every fractal and vector mode opens showing its whole shape — `33f5890`, `0cc7a1d`, `4e60514`
- Canvas stays below the iOS status bar when the HUD is hidden — `bae8ff5`
- Phoenix fractal (parameter-space + Julia:Phoenix) — `bbe2e4a`
- Rotation cos/sin on the CPU — `7a3e717`
- Auto maxIter from zoom (until the slider is touched) — `68cdab6`
- Colormap end color reachable (t = 1.0) + colormap name in the HUD — `a738a20`
- Colormaps Viridis/Turbo/Glacier/Ember/Grayscale + HUD lines wrap on phones — `899a803`
- Share: save image, copy link, native share (Tier 1) — `9f94472`
- Colormap picker popover (replaces cycling) + stale-LUT fix — `1603858`
