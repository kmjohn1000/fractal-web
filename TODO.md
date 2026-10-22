# Roadmap

Now / Next / Later. Adding an item here isn't approval to build it (see CLAUDE.md).
Codebase work only; product and strategy notes are kept in a local,
git-ignored file.

## Now

- [ ] Check the 1.38.0 first-visit work on real devices (the code shipped
      to the website in `189e823`; see Done): on a phone, the cold-open
      flight and the welcome card's placement above the toolbar; whether
      Back looks enabled or disabled on a cold open from a share link; a
      link preview in Messages and Slack (previews are cached, so try a
      fresh URL). The app side was checked 2026-10-20 in the simulator
      (iPhone 17 Pro and iPad Pro 13", build 258): opens on the whole set
      with no flight and no card, the iPad toolbar is unchanged, no crash
      or error banner. Still unseen on screen in the app: the info card's
      "The whole shape" line (simctl can't tap; check it on a phone or in
      Xcode before the next release). Relates to the portrait-rotation
      item under Next.

## Next — discovery and delight
Help people find beautiful places, and give them more ways to see them.
Celtic/Buffalo/Lambda first (quick win); distance estimation before zoom-to-minibrot.

- [ ] Render past the screen edges so a drag reveals image, not blank
      (user idea 2026-10-15). Where it matters: only deep zoom (scale <
      1e-3, perturbation). Shallower views already re-render live every
      drag frame. At depth a drag moves a snapshot of the last frame
      (`renderPreview`), and anything outside it is flat gray (#111) until
      the gesture settles and re-renders. Approach (detail tops out at
      2000 since the 8000 build was rolled back in 1.32.1):
      - Snapshot into an offscreen framebuffer bigger than the screen (a
        margin of ~25% per side), and have `renderPreview` sample it
        (`u_snapRes`/offset already handle a snapshot of a different
        size).
      - Fill the margin after the visible frame is done (after its 16
        supersample passes, one pass, in strips, cancelled by any new
        view), so it never delays what you see. A 25% margin is ~2.25×
        the pixels: rendering it up front would make every deep render
        ~2× slower.
      - Pinch-out reveals edges too; the margin covers small zoom-outs.
      - Costs: an extra framebuffer (~27 MB at iPhone dpr 2), more memory
        pressure (context loss); `chooseReference` must pick from the
        larger area, or margin pixels may glitch.
      - Size: ~80–120 lines in the renderer.

- [ ] Code-review leftovers (2026-10-16; bugs 1-2, the info card and
      Phoenix's threshold were fixed in 1.35.1):
      - Compass reset (`resetRotation`) ignores `teleportGeneration` and
        pointerdown, so a twist or Surprise-me flight started during its
        350 ms fights it frame by frame (from reading; not reproduced)
      - Newton orbits passing within ~1e-4 of 0 still finish in float32,
        so the deepest views right beside a star copy can still blur
      - `teleport()`'s one-place branch is unused now that every fractal
        has 2+ places; kept for a future fractal with a single place
      - Unexplained: on 2026-10-16 the user's iPhone Safari turned WebGL
        off for the site (startup "Error: null", readable since 1.35.2)
        after some earlier GPU crash; the trigger wasn't found (the deep
        Mandelbrot link opened afterwards is light, ~38 ms/pass on M3;
        Phoenix and Newton deep checked fine on the phone later). If it
        recurs, note what was on screen just before
- [ ] WebGPU renderer (plan sketched 2026-10-16, not approved to build;
      chosen over a full Metal rewrite, which would split the code in two).
      Goal: faster deep zoom, no watchdog context loss, detail past 2000,
      one codebase for web and app.
      - Spike first (test page): is `navigator.gpu` available in iOS Safari
        AND the app's WKWebView? Phoenix hybrid / Newton fixed point as
        compute shaders vs WebGL's ~0.3 / 0.2 s; Mandelbrot perturbation
        with BLA; does double-float survive WGSL's compiler; do time-
        budgeted tile dispatches survive Bird's Eye at 8000. Go only if it
        runs in WKWebView and is clearly faster on the phone
      - Build: `createGpuRenderer` with createFractalRenderer's interface,
        WebGL kept as fallback (app supports iOS 15); port shaders.js to
        WGSL; tiled compute passes under a ~30 ms frame budget;
        quarter-res first pass; supersampling in a float accumulation
        texture; reference orbit in a storage buffer (no texture-width
        cap); BLA iteration skipping for the Mandelbrot family
      - Re-check preview snapshots, Save/Share readback (WebGPU canvases
        don't keep their frame), device-loss recovery; thumbnails stay on
        WebGL
      - Size: ~1000-1500 lines JS + ~900 WGSL; spike a few hours
      - Spike results 2026-10-16 (`scripts/webgpu-spike.html`, not
        committed; run in headless Chrome, Playwright WebKit (Safari 26.6),
        the iOS simulator and inside the app on the user's iPhone 15):
        - WebGPU works in the app's WKWebView on the phone (Apple adapter,
          compute shaders). The simulator's WKWebView returns no adapter
        - Double-float (Dekker and fma-based) collapses to float32 under
          WGSL everywhere: no cheap precision from WebGPU. Fixed point
          stays exact (100/100/99.9%)
        - Watchdog: all-exact Phoenix at phone size, which lost the WebGL
          context, finished in 2.7 s as 312 awaited 64 px tiles (slowest
          30 ms), device OK. Tiling fixes the crash class
        - Speed as tested is ~3x slower than WebGL (Newton fixed point
          685 vs ~220 ms full screen): per-tile submit+await overhead
          (~100 tiles), not GPU time (tile max 11 ms). Batch tiles per
          submit within a frame budget before judging speed
        - So WebGPU's case is stability and headroom (detail > 2000,
          heavier exact paths), not precision. Next if pursued: batched
          tiles, and BLA for the Mandelbrot family (also possible in
          WebGL)
- [ ] Rendering speed, depth and robustness (research 2026-10-20; full
      report, sources and scratch simulations in the git-ignored
      `docs/render-research-2026-10-20.md`; not approved to build). The
      timings below are the research's models, not phone measurements:
      measure each on the phone first (headless SwiftShader doesn't
      predict it). Rough order, cheapest first:
      - Phone telemetry (~50 lines): log GL extensions (`EXT_color_buffer_float`,
        `EXT_float_blend`, `KHR_parallel_shader_compile`,
        `EXT_disjoint_timer_query_webgl2`), shader link time, per-pass
        fence latency and WebGPU `adapter.features` on the iPhone. Decides
        most of the items below
      - Interior skip + variance-adaptive supersampling (~100-180 lines in
        `render`, `scheduleRefinement`, a mask pass): after pass 0 mask the
        interior; after pass 3 keep refining only where samples still differ
        by more than ~12 levels. Modeled work 51-98% of today's across five
        views. Output stops being bit-identical, so re-record the visual
        baselines. Subsumes "Skip the black interior" step 1 above
      - Per-fractal shader variants (~60-100 lines in `link()`): `#define`
        variants compiled lazily, with `KHR_parallel_shader_compile` where
        present. Pass: pixel-identical output and >=15% faster pass or >=30%
        faster link on the phone
      - Fence-paced rendering (~80-150 lines): time each pass with
        `fenceSync`, adapt passes per frame (several cheap passes per
        frame, one strip per frame for heavy ones). The route to retrying
        Bird's Eye at 8000, together with multi-pass iteration state in
        float textures (+150-250 lines; see Deep-zoom engine). Test: 20
        zoom-ins at 8000 without context loss
      - Offscreen float accumulation buffer instead of
        `preserveDrawingBuffer` + `alpha:false` (~100-140 lines). Enables
        the two items above and "Render past the screen edges"; touches
        Save/Share readback and the preview snapshot path
      - Dynamic resolution during live float32 gestures, driven by frame
        time (~50 lines)
      - GPU chaos game for the point-based IFS modes: WebGL2 point splats,
        additive blend into RGBA16F (~150-220 lines; low confidence)
      - WebGPU spike v2: batch many tiles per queue submit (the first spike
        awaited every tile, which Apple's forums say costs 2-4x). Go only
        if Newton full screen <= 250 ms and all-exact Phoenix survives;
        otherwise shelve. WGSL has no f64, so 16-bit-limb fixed point
        stays the only exact path
      - Researched and not worth it at today's depth and 2000 cap: BLA /
        series approximation (0 steps skipped at float64, 0-25% at float32
        in a simulation of the app's own places), native Metal, threads /
        `SharedArrayBuffer`, GPU Mariani-Silver, wavefront compaction, f16
- [ ] New escape-time types: Buffalo, Lambda (Celtic is done, see Done)
      (single-state iteration, reuse existing shader/perturbation/
      supersampling pipeline with no structural changes)
- [ ] A one-line "what you're looking at" blurb per fractal or place, in
      the info card or picker (idea from the WebSim Fractal Explorer review,
      2026-10-09). Surprise me itself now covers every zoom fractal
      (`7155a63`, see Done). Phoenix research leftovers, not added:
      Rising Phoenix (0.06, 0.706, s 1.25, rot π/2: the whole upper lobe,
      small in dark space) and Twin Curls (-0.112, 0.475, s 0.1: two big
      flat blobs); Phoenix has no perturbation, so ~1e-4 is its floor
- [ ] Bird's Eye at full detail. The place itself is back in 1.32.2,
      landing locked at 2000 (user: worth keeping without the higher
      iterations); at 8000 its black eye resolves into a spiral. Built in 1.32.0
      (`69f61ff`: log slider to 8000, flushed strips above 2000, 2D
      orbit texture, context-loss reset) and ROLLED BACK in 1.32.1
      (`7f1fb72`) on 2026-10-16: on the user's phone, zooming in ended in
      "WebGL context lost". Strips + flush didn't keep the GPU safe.
      Before retrying: reproduce on the phone, find what actually
      triggers it (one pass's length, memory, or refinement passes queued
      back to back with no yield), and consider multi-pass iteration
      (state in float textures, see the Later item) instead of one long
      loop per pixel
- [ ] Playful Surprise-me ideas (same research, 2026-10-15):
      - Top 3:
        - Rare "golden" places drawn about 1 in 15 taps, with a gold "Rare
          find" line and a local found-count. (S)
        - Long-press the die for "Anywhere": a random fractal, then a
          random place. Needs a VoiceOver alternative. (M)
        - Place of the day, picked from a hash of the date, so everyone
          gets the same place with no server. (S)
      - Others:
        - A rolling die icon during the flight
        - "Looks like…" subtitles
        - Haptic ticks per 10× of zoom
        - A secret place after 7 quick taps. Must be mentioned in the
          listing (guideline 2.3.1).
        - A rare wrong-way "oops" dive
        - A per-place suggested colormap (never override silently)
        - A "Where am I?" guessing game
        - Tour mode
        - A spin-locked dive whose spiral appears to freeze
        - Vicsek "you rolled a five" joke, if patterns ever get a die
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
      `docs/learn-more-links.md` (local, not in the repo; verified table, all 23 entries: 20 links,
      Celtic and both Phoenix entries hidden; four open decisions listed
      there). In the app,
      open it through `platform.js` (an in-app Safari sheet via
      `@capacitor/browser`, a new plugin, or the system browser), not a
      plain link that would navigate the WebView away from the app. It's a
      user-tapped outbound link, so the "no external services" privacy
      answer should still hold, but re-check privacy.html wording
- [ ] More Mandelbrot-family variants beyond Buffalo/Lambda: Heart, Feather,
      Perpendicular Buffalo/Ship, Mandelbar variants and similar. Each is a
      small ftype branch on the shared pipeline; check which ones
      perturbation can handle (abs-folds need `diffabs`) before promising
      deep zoom. Any addition changes the fractal count in the store
      listing (2026-10-09). Candidate formulas (mostly unconfirmed: check
      each against a source before building) and a comparison render are in
      the local `docs/mandelbrot-variants/` (2026-10-20)
- [ ] Burning Ship looks like a ship. Partly done: the Surprise-me places
      land ship-side up by turning the view 180° (`rotation: Math.PI`,
      1.21.0; the compass turns it back). Still open: the default Opening
      view, the picker thumbnail and a plain pick of Burning Ship are
      still drawn masts-down, and a half turn mirrors left-right compared
      with the classic picture. The standard images show it upright,
      which means mirroring the imaginary axis (the set sits at y < 0 and
      the picker thumbnail shows the hull on top, upside down), plus a fire
      default palette (Ember/Hot) for this fractal only. Caveats: existing
      share links store y, so a mirror needs a link-version bump or a flag
      so old Burning Ship links keep opening the same place; check whether
      colormaps can have a per-fractal default today (user idea 2026-10-08);
      see "Curated palettes" below
- [ ] Coloring Style selector and Looks (merges "Exterior distance
      estimation as a coloring style" and "Orbit trap coloring as a style
      selector"; benchmarked against fractal.garden, MIT,
      github.com/trebeljahr/fractal-garden, utils/escapeTimeColoring.ts and
      utils/shaders/escape-time.frag, read 2026-10-17):
      - Status (2026-10-21): in progress, behind a flag so the live
        site's output doesn't change: `localStorage["fractalAtlas.styles"]
        = "1"`, or open the page once with `#styles` in the address
        (`#styles=0` turns it off). Shipped so far: the shader plumbing
        (style, bands and shift uniforms; Bands style), and the Glow
        (exterior distance estimate), Stripes and the Point and Cross
        orbit traps (offered up to ~1,000x deep). Checks: `node
        scripts/default-identity.mjs check` (default output identical to
        before, zero differing pixels), `node scripts/oracle-compare.mjs`
        (app against a float64 reference, `scripts/oracle/oracle.py`),
        `node scripts/style-bench.mjs` (headless frame time).
      - Styles: smooth (today); exterior distance estimate; stripe
        average (Härkönen: 0.5+0.5·sin(5·arg z) averaged over the orbit,
        blended between the last two averages by the smooth fraction);
        orbit traps (point, cross) that also color the interior instead
        of black.
      - Distance estimation: track dc' = 2·z·dc + 1 alongside z, color by
        b = 2|z|·ln|z| / |dc| (normalized by u_scale, i.e. pixel size, so
        the glow is zoom-invariant). Draws thin filaments crisply instead
        of as speckle. Fits beside orbit traps (Tier 3); the same estimate
        could steer "zoom to nearest minibrot" and auto-discovery toward
        the boundary. Perturbation path needs dc tracked from the full
        Z+dz; watch float32 overflow at high iteration counts.
      - Deep zoom: every style must use the full z (Z + dz) each iteration
        in the perturbation path. Traps are cheap; stripes add atan+sin
        per iteration; DE needs dc tracked from the full Z+dz (above).
      - Two user controls: color density (scales the 40-iteration cycle,
        today's fixed 0.025 in `escapeColor`) and color offset (palette
        phase). Density is the user control the rejected log-compression
        note asks for. Offset is the same uniform as the "Colormap
        animation" item's u_colorPhase.
      - Looks: named presets bundling style + colormap + density + offset
        (theirs: Classic, Ultra Fractal, Inferno, Edge glow, Iteration
        bands, Stripes, Orbit trap, Cross trap); touching any control
        switches to "Custom". Cheap, and the curated answer to
        per-fractal variety.
      - Don't copy their "Log escape time": it is the log compression
        already rejected (flattened Seahorse Valley at 4e-10), and it
        shifts as auto detail raises maxIter.
      - Their palettes overlap ours: their "Ultra Fractal" has the same
        stops as our Classic.
- [ ] Curated palettes instead of one global default (2026-10-17;
      considered randomizing the palette per fractal and recommended
      against it: a random pick gambles the first impression, gives bad
      pairings like Grayscale on Newton, and overrides a user's choice,
      since the colormap is global since 1.17.0). Instead:
      1. A default colormap (or Look, see the coloring Style item) per
         fractal, used until the user picks one; after that their pick
         applies everywhere.
      2. An optional colormap per Surprise-me destination, the same way
         destinations already carry `rotation`.
      Share links are unaffected (`cm=` stores the name). Check how
      fractalMemory and the global colormap interact before designing.
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
      mirrors the phone screen, toolbar included. Nothing comparable on
      the web build (Safari's Remote Playback only covers video, and
      AirPlay of a canvas captureStream video is broken, WebKit bug 281693).
      Research 2026-10-16 (agent, sources in that session):
      - iOS 27 SDK: the Info.plist role alone no longer gets the TV scene;
        register `UISceneAccessory.externalNonInteractive` via
        `registerSceneAccessory` (iOS 27+), plus the role branch in
        `AppDelegate.application(_:configurationForConnecting:)` for
        iOS 15–26
      - TV web view loads `capacitor://localhost/index.html?tv=1` (same
        origin, no second bridge); sync the view with the existing share
        hash (`buildShareHash`/`applyShareLink`, exact doubles); a small
        `TVDisplay` plugin relays it. Render the TV at 1080p, and let the
        phone show a cheap preview while connected; keep the phone awake
        (`isIdleTimerDisabled`)
      - Video route (AVPlayer/HLS) rejected: seconds of latency, no live
        control
      - Test without an Apple TV: the Mac as an AirPlay receiver (Screen
        Mirroring), or `xcrun simctl io booted screenConfig --display=2`
      - Size: ~150–200 lines Swift + ~150–250 JS. Risks: new iOS 27 API,
        GPU contention between two web views, AirPlay compression on motion
- [ ] Check (unverified bug): `AppDelegate.configurationForConnecting`
      hands `SceneDelegate` to every scene role, so on iOS 16–26 AirPlay
      Screen Mirroring may put a second, non-interactive copy of the whole
      app on the TV instead of a mirror. Try it with the Mac as the AirPlay
      receiver
- [ ] Native tvOS app (asked 2026-10-14): the tvOS SDK has no WebKit, so
      Capacitor can't target it. It would be a separate Swift + Metal app
      (port shaders.js to Metal, the reference orbit and cell rebasing to
      Swift; MetalFX for 4K upscaling), driven by the Siri Remote (no
      pinch or twist): an ambient tour app. Few thousand lines, and every
      new fractal gets built twice. Only if AirPlay TV mode gets used
- [ ] "Zoom to nearest minibrot" guided action
- [ ] Auto-dive mode: a button that zooms steadily into an interesting spot
      on its own, with drag to steer. Likely builds on distance estimation
      and "zoom to nearest minibrot" for picking the target; capped by our
      ~1e13 depth until the arbitrary-precision item under Later is done
      (2026-10-10). Related "flyover" (user idea 2026-10-14): could
      also mean a tour that flies between Surprise-me places, or an ambient
      drift along the boundary; design evaluation pending
- [ ] Saved places (bookmarks): save the current view by name inside the app
      and fly back to it later. Today we only have share links and
      per-fractal memory that resets on relaunch. Store the full-precision
      location and colors; decide whether iCloud sync is worth it or
      local-only is enough. Could reuse the share-link format as the stored
      view (2026-10-10). Design spike done 2026-10-21, see
      `docs/saved-places/design.md` (local, git-ignored)
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
- [ ] Haptics at key moments: the Haptics plugin is installed but only fires
      on a successful save. Candidates: Surprise me landing, the compass
      snapping to upright, picking a colormap, Reset, crossing 0° while
      rotating. Keep them subtle, through `platform.js`
- [ ] Shake to roll the dice (user idea 2026-10-20): shaking the phone does
      what the Surprise-me die does. App-only. Likely route: override
      `motionEnded` for `.motionShake` in `FractalBridgeViewController.swift`
      and forward it to the web app through a small plugin in `platform.js`;
      that needs no motion-permission prompt (verify), unlike web
      `devicemotion`, which iOS gates behind `requestPermission()`. Open
      design points: a Settings toggle so it can't fire while walking or
      panning, ignoring shakes during a flight or open dialog, a haptic on
      the shake, and the die button stays as the VoiceOver and non-shake
      path. Mention it in the listing if it ships (guideline 2.3.1)
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
      a repurposed "cycle colormap" button). u_colorPhase is the same
      uniform as the coloring Style item's color offset control
- [ ] Koch snowflake Easter egg (user idea 2026-10-17; not approved to
      build). Trigger: a full 360° twist in one gesture on the Koch view.
      The snowflake splits into its seven-piece self-tiling (one copy at
      1/√3 in the center, six at 1/3 around it; areas 1/3 + 6/9 = 1),
      each piece splits again, then the two-size plane tiling grows
      outward to fill the screen (Wikipedia, Koch snowflake: one size
      can't tile the plane, two sizes can). Reduce Motion: show the
      finished mosaic, no animation. Save/Share must capture it.
      ~100-150 lines; cap depth on small flakes (4 rounds = 2,401
      flakes, ~460k vertices at depth 3). Koch already has two-finger
      twist (`attachVectorViewInteraction`, checked 2026-10-17), but the
      twist angle is `atan2` minus the start angle, run through
      `normalizeAngle`, so it wraps at ±180°: detecting 360° needs an
      unwrapped running sum of per-frame angle deltas. A possible seasonal
      extra: snowfall on the Koch view
- [ ] Sharper picker thumbnails (2026-10-17): icons/thumbs/*.webp are
      192px, but a picker tile is ~110pt wide on a 393pt phone, ~330
      device px at 3x, so they're upscaled ~1.7x. (Checked against
      index.html 2026-10-17: the panel's content box is 347pt after the
      10px insets, 1px border and 12px padding, and `minmax(96px, 1fr)`
      with 10px gaps gives 3 columns of 109pt.) Render at 384px in
      scripts/render_thumbs.mjs (`SIZE`; its "2x a ~96px tile" comment
      is stale) (the whole set is ~180 KB today; expect several times
      that). SVG was considered and rejected: 13 of 23 are escape-time
      renders with no vector form, and the fern is 1M points. Optional
      later: thumbnails that follow the current colormap, by storing
      grayscale iteration maps and colorizing them with the LUT when the
      picker opens.

## Later — big bets
Flexible scope and timing. Chains: new types → formula editor → Fractint importer;
distance estimation → zoom-to-minibrot / AI discovery.

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

### Discovery
- [ ] AI-curated "find something beautiful" auto-discovery
      (if it calls an AI service, that breaks the App Store "no external
      services" answer and the privacy label — needs a privacy.html/label
      update, or an on-device approach)

### Deep-zoom engine — only when someone actually hits these limits
- [ ] Arbitrary-precision reference orbit for zoom past ~1e13
      (computeReferenceOrbit is float64-limited to ~15-16 significant
      digits — do this if/when deep zoom becomes an actual marketed
      feature; the reference orbit is CPU/JS work (BigInt fixed-point),
      but past ~1e-35 the shader's float32 deltas also underflow, so it
      also needs extended-exponent deltas, plus BLA iteration skipping and
      2D reference-orbit textures past MAX_TEXTURE_SIZE). Research
      2026-10-20 (see `docs/render-research-2026-10-20.md`): a BigInt
      orbit of 2000 iterations took 0.3 ms at 128 bits, 1.1 ms at 1024
      bits, 10.8 ms at 4096 bits (M3), so the orbit isn't the bottleneck;
      float32 deltas should hold to ~scale 1e-30 (inference); BLA wasn't
      worth it at this iteration cap. Needs a share-link v2 and a
      `chooseReference` redesign (scan candidates as float64 deltas against
      the BigInt center orbit); ~250-400 lines
- [ ] maxIter past 8000 (the cap planned for Bird's Eye, see Next): one
      draw looping 10⁴–10⁶ times needs multi-pass iteration, saving
      per-pixel state (z, dz, reference index) in float textures between
      passes, and a 2D reference-orbit texture (dual view's orbit row is
      2*(maxIter+1) texels; iPhone's MAX_TEXTURE_SIZE is 16384)
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
- Viewport-adaptive Koch, tree and dragon, with the vector-mode speedups (1.39.0): the three views build only what's on screen each frame (a piece wholly off screen stays a chord or is skipped; pieces under a pixel stay straight; a vertex budget bounds the frame), and add levels beyond the depth slider as you zoom, so detail no longer runs out at ~13× / 2× / 1×; the info card shows "(+N from zoom)". The dragon is drawn from its two-map form (matches the L-system curve to 4e-15 at depths 0-16); Koch/dragon/other line curves use typed arrays and stroke in groups of 256 segments, the tree fills in groups of 32 squares (Canvas2D cost per path grows faster than its size). Hilbert, Gosper and arrowhead share the faster stroke path. `tests/visual/vector.spec.mjs` checks geometry against the old generators, that culling changes no pixel, zoom detail, twist at depth and nonsense views. Left open: a lighter level of detail while a gesture is in progress (the dragon at depth 16, zoomed 4×, is the heaviest frame measured) — `3232da9`
- First-visit experience on the web and link previews (1.38.0): a first web visit with no share link flies from the whole set to one of five showpiece Mandelbrot places (Seahorse Valley, Mini Mandelbrot, Elephant Valley, Double Spiral, Sunburst Fan) with the info card open; a dismissible welcome card (name, one line, App Store link, Privacy · Support; shown every web visit until closed, never in the app); `<meta name="description">` plus `og:` and `twitter:card` tags with `icons/og-image.jpg`; the opening view reads "The whole shape"; on website windows 900px and wider the toolbar rows sit in a centered 760px column (web only, `html.web`, so the iPad app is unchanged). Visit state lives in `Platform.welcome` (`platform.js`); `tests/visual/cold-open.spec.mjs` covers the three paths, and the visual suite, store-screenshots and thumbnail scripts pre-set the storage keys. App checked in the iPhone and iPad simulators (no flight, no card, iPad toolbar unchanged); the phone checks and the info card's new line on screen in the app are still open (see Now) — `189e823`
- 1.37.0 (build 245) submitted for App Review 2026-10-19 with the listing copy updated to 24 fractals and 98 places in English and French (`appstore-screenshots/copy/listing-1.37.0.md`), Spanish added (`copy/listing-es.md`), What's New covering 1.30.1–1.37.0, the new `2-picker` screenshots (iPhone 6.3", iPad 13") and the app preview videos. Screenshots and promo images now come from `scripts/store-screenshots.mjs` — `82cf394`
- Apollonian gasket (1.36.0, user idea 2026-10-17): the (−1, 2, 2, 3) packing by iterated inversion in its four dual circles, colored by inversion count (mirrored cycle of 24, offset 6 so Inferno's big disks are purple, not black; capped at 500 per pixel, capped pixels get the colormap's average). Deep zoom composes the inversions the whole view shares into one Möbius map in float64 (`apolloFrame`); checked sharp at 1.4e15× in headless Chrome. Info card shows the integer curvature of the circle under the center when it's visible. Six Surprise-me places, five of them repelling fixed points of three-inversion words (they repeat every φ⁶ ≈ 17.94×), including the 4.7e-12 spiral dive Golden Dive. Not yet checked on a phone. The listing's "23 fractals" is now 24 — `9e5abfe`
- Phoenix deep zoom (1.34.0): float32 perturbation against one float64 reference, and a pixel that glitches continues in exact fixed point from Z[m] + d. 100% agreement with float64 at 1e-9 and ~0.3 s full screen on an iPhone 15 in the spike (`scripts/precision-spike.html`, not committed); all-fixed-point was 2–4 s and its long draws lost the phone's WebGL context. Exact steps capped at 600 per pixel, 4 refinement samples, self-test on first use. Checked by the user on their iPhone 15 (website, 1.35.2): Phoenix and Newton (incl. near the central star, 1.35.1) both sharp at depth — `362a355`
- Newton deep zoom (1.33.0), in place of the "Newton perturbation" item: away from the origin, deep views render in exact 16.48 fixed point (WebGL2 uints) and stay sharp to ~1e-11 (float32 blurred past ~1e-4). ~0.2 s per full-screen pass on an iPhone 15; self-tested on first use, float32 fallback. The renderer now asks for WebGL2 first — `732e5ca`
- Surprise me on every zoom fractal (1.31.0): 21 places from the 2026-10-15 research on Celtic, Multibrot³, Phoenix and the Rabbit, Dragon and Spiral Julia sets. Three of them are spiral dives (Rabbit Hole, Into the Eye, Into the Galaxy) that land at 1e-3, so the whole flight renders live. Auto detail now follows the zoom during spiral dives. Earlier the same day: Pole Star on Newton (1.30.1) and spiral-out on fractals with one place (1.30.2) — `7155a63`
- New App Store screenshots for 1.25.0 (2026-10-15): six captioned shots per device in git-ignored `appstore-screenshots/1.25.0/` (iPhone 6.5" 1284x2778, iPad 13" 2064x2752), rendered from the web app in headless Chrome: Mini Mandelbrot with the legend card, the picker, Spiral Julia in dual view, Lace Tricorn, Armada, Pythagoras tree with play. Sierpinski deep zoom was tried and dropped: flat-looking at depth. Re-rendered 2026-10-15 for the 1.30.0 toolbar in `appstore-screenshots/1.30.0/`. What's New and a copy review are in `appstore-screenshots/copy/whats-new-1.30.0.md`; the full paste-ready English and French listing is `copy/listing-1.30.0.md`. Upload with the 1.30.0 release
- 1.20.0 (build 174) live on the App Store 2026-10-14 (iTunes lookup API); user checked Carpet/Gasket deep zoom, the legend card and the colormap menu on a real phone 2026-10-15. Hold-and-slide depth speed (1.25.0) also checked on the phone ahead of the next release
- Play/pause for pattern depth (1.25.0, user idea 2026-10-14): Koch, tree and the line curves get a play button that bounces the depth slider min↔max (700 ms per step at 1×) and a hold-and-slide speed button (¼×–4×, 28 px per step; arrow keys too), replacing Koch's one-way animate button. The IFS row (fern, Sierpinski triangle, Lévy C, Vicsek) has a points slider, not depth, so it's left out — `1e732f6`
- Sierpinski carpet spiral dive (1.24.0, user idea 2026-10-14): Surprise me on Carpet (Spiral Dive at (1/4, 1/4), Lattice Dive at (1/8, 3/8)) and Gasket (Triangle Spiral at (1/7, 2/7)) flies a 7 s steady dive ~3^20 deep, turning 90° per 3× of zoom and landing upright; points with repeating digits so every level looks alike. Reduce Motion drops the spin. Same release: five Phoenix Julia places — `809957b`
- Starburst, the user's Mandelbrot Surprise-me spot (1.22.0): dendrite arms around a dense core, 1000× below Frond Thicket, landed at the user's −95° rotation. Same release: Tricorn places, auto detail on landing (a slider lock could land deep places black) and the Feather Valley/Double Spiral label swap — `71c8458`
- Map-legend info card (1.20.0, from the 2026-10-13 design review): place or fractal as an italic title, "1.8 trillion times deeper", a 1/2/5 × 10ⁿ scale bar, the center point with enough digits to find the spot again (`4b89c24`), and the technical readout underneath, on a darker frosted card that clears the compass. Patterns get the card with a scale bar; dual view labels the Julia pane; the iter slider reads "detail". Shipped in 1.20.0 — `98d894f`
- Cell rebasing for Carpet/Gasket deep zoom (1.18.6), after user feedback that the gasket wasn't infinite zoom: `digitCellFrame` resolves the 3x3 level-k cells around the view exactly in float64 and the shader runs only the last ~10 levels in cell-local float32, so both now zoom to ~1e15× (the float64 view-center limit; going further would need a BigInt center app-wide). Colors cycle mirrored past the old depth cap. Not in a shipped build yet — `0910325`
- Brighter app icon (1.18.2): Seahorse Valley close-up in the Classic colormap instead of the near-black Mandelbrot, so it stands out in the dark search card; `scripts/render_icon.py` now writes every web/PWA size and the iOS AppIcon. Not in a shipped build yet — `1bf7461`
- Share links name the colormap (`cm=Classic`) instead of an index (1.18.1), so palettes can be reordered or added without changing what links show; unknown names open in the default — `974a54b`
- Colormap refresh (1.18.0): added Classic and Fire, dropped Magma and HSV, Gist Rainbow renamed Spectrum, reordered the picker; Inferno/Plasma/Viridis/Turbo/Twilight regenerated from the real matplotlib tables (33 stops). Share links' `cm=` indices shifted (fine this early). Burning Ship's fire default is still open above, but Fire now exists. Not in a shipped build yet — `fac1cbd`
- Each fractal remembers its view while the app is open (1.17.0): `fractalMemory` stashes a fractal's view, iteration setting, Back history and Julia pane when you leave it and restores them on return; Reset (that fractal) and share links start fresh, picking the current fractal no longer resets it, and the colormap stays global. In memory only, so a relaunch starts from the defaults. Dual view stays one app-wide toggle, so a detour through a fractal without dual (Newton, Carpet, Gasket) turns it off. Not in a shipped build yet — `09b7ac5`
- Celtic Mandelbrot (1.16.0): z' = (|x²−y²|, 2xy) + c as FTYPE.CELTIC; deep zoom via a `diffabs` fold on the real part, Julia dual view, picker thumbnail. Checked against a float64 numpy render: deep views agree on the interior mask (98.8% at 1e-9). Not in a shipped build yet — ships with the next release — `cacbf8c`
- Follow the iOS Larger Text / Dynamic Type setting in the app (1.15.0): `FractalBridgeViewController` sets `--text-scale` from `UIFontMetrics` at document start/end and on content-size changes, uncapped through the accessibility sizes; the web build stays at 1. Not in a shipped build yet — ships with the next release — `aec6273`
- Code-review hardening (1.14.6): strict share-link parsing (real mode keys only, bounded x/y/s, normalized rotation), cold-start launch link applied once, view kept across a WebGL context-loss reload, Back history cleared when a link switches curve/pattern, box-zoom multi-touch reset, launch-screen fallback that can't be defeated — `1c686a7`
- Universal links no longer claim support.html and privacy.html (AASA exclusions, in the kmjohn1000.github.io repo) — `8225221`
- Koch fill toggle shows a half-filled depth-2 snowflake instead of a Stop-like square — `d8ea535`
- One background for every mode: pattern views and page body pure black like the fractals — `c6534a4`
- Info overlay in plain language (zoom, detail, rotation, Surprise-me place name) with the technical readout underneath; "Fractal Atlas" in the tab and home-screen names — `bd85de8`
- Fractal picker as a thumbnail grid with display names and a Julia sets group (scripts/render_thumbs.mjs) — `47096ad`
- Dual view: Julia follows the main pane's center; flashing center crosshair; tap glides to center — `8fe629e`
- Rotation compass: appears while rotating, fades when still, tap to reset rotation — `c17c2de`
- App Store release via Capacitor: app shell, Save to Photos, share sheet, icon, launch screen, privacy/support pages; 1.10.2 submitted for review 2026-09-26 — `3687e7e`
- Single-color picker for Koch/Tree/Dragon/Hilbert/Gosper/Arrowhead; bolder early-depth strokes (were too faint on iPad) — `73ea146`
- Watermark on exports: sentence-case "Fractal Atlas" pill (originally "Fractal Explorer", renamed with the app), bottom-right, always on — `d725a5e`
- Fractals centered above the toolbar (canvas ends at it; split view's lower pane no longer covered); shorter toolbar — `a015da0`
- Keyboard navigation: arrows pan, Shift+Left/Right rotate, +/- zoom, R reset — `c198500`
- Picker split into "Infinite Zoom" / "Beautiful Patterns" sections; zoom-only buttons gated on category — `53a45d1`
- Generic L-system engine; Koch/Dragon migrated; Hilbert, Gosper, Sierpinski Arrowhead added — `917b252`
- Sierpinski Triangle, Lévy C Curve and Vicsek Fractal as IFS modes on the fern engine — `442d805`
- "Surprise me" teleport to curated Mandelbrot locations — `f1fc7c7`
- Box-zoom (zoom selector) for Barnsley Fern — `8122f72`
- Show the last frame while dragging at deep zoom — `41abf50`
- UI consistency: canonical control order, fern palette icon, Back for vector views, HUD hidden by default with a toggle — `7b723c5`
- Every fractal and vector mode opens showing its whole shape — `6a55b3a`, `7fa164a`, `249e3d2`
- Canvas stays below the iOS status bar when the HUD is hidden — `74c6c86`
- Phoenix fractal (parameter-space + Julia:Phoenix) — `c92953f`
- Rotation cos/sin on the CPU — `e6c31b4`
- Auto maxIter from zoom (until the slider is touched) — `032c7d2`
- Colormap end color reachable (t = 1.0) + colormap name in the HUD — `092f6ea`
- Colormaps Viridis/Turbo/Glacier/Ember/Grayscale + HUD lines wrap on phones — `77c60ed`
- Share: save image, copy link, native share (Tier 1) — `fe699bf`
- Colormap picker popover (replaces cycling) + stale-LUT fix — `29195e0`
