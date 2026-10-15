# Roadmap

Now / Next / Later. Adding an item here isn't approval to build it (see CLAUDE.md).

## Now — grow reach
1.18.2 is live on the App Store (2026-10-11) with the overhauled listing:
subtitle "Explore 23 fractals, zoom deep", headed description ("No maths
required", 23 fractals and patterns, private by design), What's New, and
Graphics & Design as the primary category (Entertainment secondary). At 21
downloads (2026-10-11: 321 impressions, 11% conversion), reach is the
bottleneck, not conversion.

- [ ] New App Store screenshots: today's are from ~1.10 (three-circle color
      button, "iter" slider, no info card, no picker). Proposed set, with
      short captions: picker grid ("23 fractals, all free"), deep zoom with
      the legend card, split view, Sierpinski gasket deep zoom, a rotated
      view with the compass, a pattern. Not yet approved
- [ ] Remaining listing work, from benchmarking Fractal Dive
      (apps.apple.com/us/app/fractal-dive/id6813485724) and Fractal Explorer:
      Deep Zoom (apps.apple.com/us/app/fractal-explorer-deep-zoom/id6794896393,
      $2.99, ranked #46 Top Paid in Graphics & Design), 2026-10-10:
      - Localization pass: they ship English plus Dutch, French, German,
        Italian, Spanish; we're English only. Even Spanish/French/German
        widens search reach
      - Neither listing has an app preview video; add one
      - Beginner framing: named places with short explanations and scale
        comparisons (see the Surprise me item under Next)
      - Depth claims: the live copy says "trillions of times" (Mandelbrot
        family, ~1e13). The Sierpinski gasket and carpet now reach ~1e15×;
        "forever" still isn't defensible app-wide

## Next — discovery and delight
Help people find beautiful places, and give them more ways to see them.
Celtic/Buffalo/Lambda first (quick win); distance estimation before zoom-to-minibrot.

- [ ] New escape-time types: Buffalo, Lambda (Celtic is done, see Done)
      (single-state iteration, reuse existing shader/perturbation/
      supersampling pipeline with no structural changes)
- [ ] Surprise me and a one-line description for every escape-time fractal:
      Mandelbrot (`7e2c606`), Burning Ship (`5715799`: six places, landed
      ship-side up via a per-destination `rotation`) and Tricorn (`704c03a`:
      seven places), Julia: Phoenix (`3fe04a4`: five places) and Carpet/
      Gasket (`3fe04a4`: spiral dives) are done. Add curated places per
      remaining fractal (Celtic, Multibrot³, the other Julia presets, ...),
      and a short "what you're looking at" blurb in the info card or picker.
      Cheap content work next to the new types (idea from the WebSim Fractal
      Explorer review, 2026-10-09). Phoenix research leftovers, not added:
      Rising Phoenix (0.06, 0.706, s 1.25, rot π/2: the whole upper lobe,
      small in dark space) and Twin Curls (-0.112, 0.475, s 0.1: two big
      flat blobs); Phoenix has no perturbation, so ~1e-4 is its floor
- [ ] Surprise me for the Patterns category — PARKED by the user
      2026-10-14. Research done (contact sheet was
      patterns_surprise_contact_sheet.png in a session scratchpad, not
      kept). Recommendations, all as share-link hashes (r in radians):
      - Do — Pythagoras tree at depth 12: Spiral Arm
        `#v=1&m=tree&x=-2&y=1.5&s=1.5&r=0&cm=Inferno&c=0&dp=12`, Canopy
        Crown `x=0&y=3.5&s=0.6`, Mosaic `x=-1.3&y=3.3&s=0.6` (same dp=12)
      - Do — Lévy C curve: Lace Rosette
        `#v=1&m=levy&x=-0.25&y=0.25&s=0.2&r=0.7853981633974483&n=1000000&c=0`,
        Lace Window `x=0.75&y=0.8&s=0.17&r=0`, Fine Lace
        `x=0.75&y=0.903&s=0.06&r=0` (Lace Dome `x=0.75&y=0.85&s=0.2` was a
        near-duplicate)
      - Do, weaker — Barnsley fern (n=1000000&c=0): A Frond Is a Fern
        `x=-1.25&y=2.7575&s=1.7533&r=0.8942`, Fern in a Fern in a Fern
        `x=-0.692369&y=1.7998145&s=0.1773&r=2.5475`, The Endless Tip
        `x=2.64934&y=9.96448&s=0.008163&r=-1.881`, Frond Lattice
        `x=0.6&y=5.0&s=1.5&r=0`, Where Fronds Meet `x=0.2&y=1.5&s=1.2&r=0`,
        Frond Row `x=-1.0&y=2.4&s=0.8&r=0.8942`. The self-similar ones look
        like the opening view
      - Maybe — arrowhead One Continuous Line
        `#v=1&m=arrowhead&x=0&y=-0.86&s=0.04&r=0&cm=Inferno&c=5&dp=11`;
        Gosper Coast `#v=1&m=gosper&x=-0.3&y=-0.85&s=0.12&r=0&cm=Inferno&c=4&dp=6`
      - Skip — Koch, dragon, Hilbert, Sierpinski triangle, Vicsek, random
        depth/color/rotation combos (close-ups look like the opening view)
      - Cost ~120–150 lines: a separate PATTERN_DESTINATIONS list (vector
        views have their own view objects, not mainState), a flight helper
        shared with teleport(), cancel wiring on the vector views' gestures,
        a Surprise me button in the pattern control rows, HUD place names.
        Phone performance of 1M-point fern/Lévy frames mid-flight unverified
- [ ] Skip the black interior: a competitor (Fractal Dive) says it saves
      time by not calculating black regions (user, 2026-10-14). Evaluated
      2026-10-14, not approved to build:
      - Step 1 (~40 lines): during supersample refinement, skip passes 1–15
        for pixels whose 3×3 neighborhood was black in sample 0. Measured
        ~0.3–0.6× refinement cost on interior-heavy views. Needs the Fire
        and Grayscale colormaps to start at ≥1/255 so "black" means interior
        only
      - Step 2 (~30 lines): Brent periodicity checking in the fast shader,
        switched on per view by a CPU probe for interior. Rabbit renders at
        0.20× the cost, but views with no interior get ~1.5× slower, hence
        the probe; not for the deep-zoom (perturbation) path
      - Rejected: derivative-based interior test, GPU Mariani–Silver
        rectangle fill, lowering maxIter
      - All timings were headless (SwiftShader); measure on a phone GPU
        before building
- [ ] "Learn more" link to each fractal's Wikipedia article, e.g. in the
      info card next to the blurb above (user idea 2026-10-13). A `wiki`
      field per FRACTAL_CONFIGS/EXTRA_MODES entry, taken from
      `docs/learn-more-links.md` (verified table, all 23 entries: 20 links,
      Celtic and both Phoenix entries hidden; four open decisions listed
      there). In the app,
      open it through `platform.js` (an in-app Safari sheet via
      `@capacitor/browser`, a new plugin, or the system browser), not a
      plain link that would navigate the WebView away from the app. It's a
      user-tapped outbound link, so the "no external services" privacy
      answer should still hold, but re-check privacy.html wording
- [ ] More Mandelbrot-family variants beyond Buffalo/Lambda: Heart, Feather,
      Perpendicular Buffalo/Ship, Mandelbar variants and similar. The WebSim
      explorer offers 52 types and drew 2,074 views, so exotic variants seem to
      attract people. Each is a small ftype branch on the shared pipeline; check
      which ones perturbation can handle (abs-folds need `diffabs`) before
      promising deep zoom. The listing's subtitle and description say "23
      fractals"; update both with any addition (2026-10-09)
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
      instead of the rectangle. Respect rotation. Show/hide rule (user,
      2026-10-13): visible only while you're moving (pan, zoom, rotate) and
      fading out once you stop, like the rotation compass. Mocked up
      2026-10-13 (96px frosted inset, bottom-right; box marker, crosshair
      when deep); not yet approved. Open: depth cue past ~1,000×, Julia
      pane in dual view, non-Mandelbrot fractals, what tapping it does
- [ ] AirPlay TV mode (user liked it, 2026-10-14): when the iPhone/iPad
      connects to an Apple TV or AirPlay display, show a clean full-screen
      fractal there (no toolbar, no info card) and keep the controls on
      the phone. Natural content: a slow tour of Surprise me places and
      spiral dives (the flyover idea under Auto-dive). App-only: iOS gives
      an external-display scene (`UIWindowSceneSessionRoleExternalDisplay
      NonInteractive`); the app would open a second WKWebView in it on a
      TV page from the same bundle, and the two web views talk through a
      small native plugin (`platform.js`). Without this, AirPlay already
      mirrors the phone screen, toolbar included. Needs an Info.plist
      scene-manifest entry; check the second web view's memory/GPU cost
      at 4K, maybe render at 1080p. Nothing comparable on the web build
      (Safari's Remote Playback only covers video)
- [ ] Native tvOS app (asked 2026-10-14): the tvOS SDK has no WebKit, so
      Capacitor can't target it. It would be a separate Swift + Metal app
      (port shaders.js to Metal, the reference orbit and cell rebasing to
      Swift; MetalFX for 4K upscaling), driven by the Siri Remote (no
      pinch or twist): an ambient tour app. Few thousand lines, and every
      new fractal gets built twice. Only if AirPlay TV mode gets used
- [ ] "Zoom to nearest minibrot" guided action
- [ ] Auto-dive mode: a button that zooms steadily into an interesting spot
      on its own, with drag to steer (Fractal Dive's "Press Dive", Fractal
      Explorer: Deep Zoom's "Fly"). Both competitors make guided travel their
      hook and we have none. Likely builds on distance estimation and "zoom to
      nearest minibrot" for picking the target; capped by our ~1e13 depth
      until the arbitrary-precision item under Later is done (competitor
      benchmark, 2026-10-10). Related "flyover" (user idea 2026-10-14): could
      also mean a tour that flies between Surprise-me places, or an ambient
      drift along the boundary; design evaluation pending
- [ ] Saved places (bookmarks): save the current view by name inside the app
      and fly back to it later. Today we only have share links and
      per-fractal memory that resets on relaunch. Fractal Explorer: Deep Zoom
      saves full-precision location and colors and syncs them through iCloud;
      decide whether sync is worth it or local-only is enough. Could reuse the
      share-link format as the stored view (competitor benchmark, 2026-10-10)
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
- [ ] Link-preview tags so shared links look good in Messages, Slack and
      social apps: `index.html` has no `og:title`/`og:description`/
      `og:image` (or `twitter:card`) today, so a shared link shows as a bare
      URL. Add them with one striking static fractal image; per-link previews
      would need a server, so not now. Likely the best marketing per hour
      spent (iOS review, 2026-10-09)
- [ ] Haptics at key moments: the Haptics plugin is installed but only fires
      on a successful save. Candidates: Surprise me landing, the compass
      snapping to upright, picking a colormap, Reset, crossing 0° while
      rotating. Keep them subtle, through `platform.js`
- [ ] Home Screen quick actions (long-press the icon): Surprise me, last
      view, random colormap. Swift in the app/scene delegate plus a hook
      into the web app
- [ ] Copy image (and Save to Files) in the share menu, beside Save to
      Photos and Copy link; `@capacitor/filesystem` is already installed
- [ ] Accessibility pass: the buttons have aria-labels, but the fractal
      canvas gives VoiceOver nothing. Add a short label describing the
      current view (fractal, zoom, rotation), then run VoiceOver and Voice
      Control over the app
- [ ] iPad check: layout at Stage Manager window sizes and in split view
      (untested)
- [ ] Listing hook: "Save to Photos, then set as your wallpaper" (apps can't
      set wallpapers directly, but it's a strong use case); fold into the
      listing overhaul with the next iOS release
- [ ] Smooth (mirrored) palette option: escape-time colors wrap every 40
      iterations (`fract(n * 0.025)` in `escapeColor`), so sequential
      palettes (Inferno, Fire, Hot, Ember, Plasma, Viridis, Turbo, Glacier,
      Grayscale) snap from their bright end back to dark, drawing a hard seam
      at each band. A toggle (or per-palette flag) would mirror alternate
      cycles (dark to bright, then bright to dark) so no seam appears; the
      cyclic palettes (Classic, Twilight, Spectrum) are unaffected. Could be
      done by baking a forward+reverse LUT, no shader change. Keep the seam
      as the default: it suits Fire on the Burning Ship (2026-10-09)
- [ ] Colormap animation (WebGL: a u_colorPhase uniform shifting the LUT
      lookup over time via requestAnimationFrame; Koch/Tree: cycle the
      colormap's stops, like kochAnimateBtn cycles depth; new toggle, not
      a repurposed "cycle colormap" button)

## Later — big bets
Flexible scope and timing. Chains: new types → formula editor → Fractint importer;
distance estimation → zoom-to-minibrot / AI discovery.

### Paid tier (parked, user decision 2026-10-08)
- [ ] High-res export as a paid-tier feature: saved/shared images use the
      live canvas, capped at `Math.min(devicePixelRatio, 2)`. A paid tier
      would render exports at a higher resolution, decoupled from that cap.
      Free export stays as is. Needs a monetization decision first (in-app
      purchase via StoreKit, a price, and updated listing/privacy wording);
      a watermark-free export could be part of the same tier. The app is
      free with no monetization today, so nothing here is approved to build

### iOS integrations
- [ ] "Fractal of the Day" widget (home or lock screen): a WidgetKit
      extension, so native work; retention rather than discovery, so only
      once the app has users
- [ ] App Intents / Shortcuts: expose "Surprise me" and "Open last view" to
      Siri, Spotlight and Shortcuts
- Skipped for now (no fit without a favorites feature): Apple Pencil,
  SharePlay, App Clips, Live Activities, iCloud sync

### Creator tools
- [ ] Custom palette inside a share link: an optional `cp=` parameter carrying
      the whole colormap (about 16-33 evenly spaced colors as hex, roughly
      100-200 characters) so a link works for a palette the recipient's app
      version doesn't have. Only matters once users can make their own
      palettes (a colormap editor); built-ins already travel by name
      (`cm=Classic`, 1.18.1). Needs strict parsing like the other share
      fields (bounded length, hex only, bad value falls back to `cm`)
      (2026-10-09)
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
  built to prevent. Cell rebasing was the correct path to deeper Gasket
  zoom, and is now done (1.18.6); the cap now only limits per-pixel levels
  below the rebased cell.

## Done
- 1.20.0 (build 174) live on the App Store 2026-10-14 (iTunes lookup API); user checked Carpet/Gasket deep zoom, the legend card and the colormap menu on a real phone 2026-10-15. Hold-and-slide depth speed (1.25.0) also checked on the phone ahead of the next release
- Play/pause for pattern depth (1.25.0, user idea 2026-10-14): Koch, tree and the line curves get a play button that bounces the depth slider min↔max (700 ms per step at 1×) and a hold-and-slide speed button (¼×–4×, 28 px per step; arrow keys too), replacing Koch's one-way animate button. The IFS row (fern, Sierpinski triangle, Lévy C, Vicsek) has a points slider, not depth, so it's left out — `0fab4de`
- Sierpinski carpet spiral dive (1.24.0, user idea 2026-10-14): Surprise me on Carpet (Spiral Dive at (1/4, 1/4), Lattice Dive at (1/8, 3/8)) and Gasket (Triangle Spiral at (1/7, 2/7)) flies a 7 s steady dive ~3^20 deep, turning 90° per 3× of zoom and landing upright; points with repeating digits so every level looks alike. Reduce Motion drops the spin. Same release: five Phoenix Julia places — `3fe04a4`
- Starburst, the user's Mandelbrot Surprise-me spot (1.22.0): dendrite arms around a dense core, 1000× below Frond Thicket, landed at the user's −95° rotation. Same release: Tricorn places, auto detail on landing (a slider lock could land deep places black) and the Feather Valley/Double Spiral label swap — `704c03a`
- Map-legend info card (1.20.0, from the 2026-10-13 design review): place or fractal as an italic title, "1.8 trillion times deeper", a 1/2/5 × 10ⁿ scale bar, the center point with enough digits to find the spot again (`055ad8c`), and the technical readout underneath, on a darker frosted card that clears the compass. Patterns get the card with a scale bar; dual view labels the Julia pane; the iter slider reads "detail". Shipped in 1.20.0 — `5104034`
- Cell rebasing for Carpet/Gasket deep zoom (1.18.6), after user feedback that the gasket wasn't infinite zoom: `digitCellFrame` resolves the 3x3 level-k cells around the view exactly in float64 and the shader runs only the last ~10 levels in cell-local float32, so both now zoom to ~1e15× (the float64 view-center limit; going further would need a BigInt center app-wide). Colors cycle mirrored past the old depth cap. Not in a shipped build yet — `1d1b31b`
- Brighter app icon (1.18.2): Seahorse Valley close-up in the Classic colormap instead of the near-black Mandelbrot, so it stands out in the dark search card; `scripts/render_icon.py` now writes every web/PWA size and the iOS AppIcon. Not in a shipped build yet — `ebac1b5`
- Share links name the colormap (`cm=Classic`) instead of an index (1.18.1), so palettes can be reordered or added without changing what links show; unknown names open in the default — `6d7f404`
- Colormap refresh (1.18.0): added Classic and Fire, dropped Magma and HSV, Gist Rainbow renamed Spectrum, reordered the picker; Inferno/Plasma/Viridis/Turbo/Twilight regenerated from the real matplotlib tables (33 stops). Share links' `cm=` indices shifted (fine this early). Burning Ship's fire default is still open above, but Fire now exists. Not in a shipped build yet — `772e718`
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
