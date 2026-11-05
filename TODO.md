# Roadmap

Now / Next / Later. Adding an item here isn't approval to build it (see CLAUDE.md).
Codebase work only; product and strategy notes are kept in a local,
git-ignored file.

## Now

- [ ] Code structure after the ES-module conversion (2026-11-01, updated
      2026-11-02; the split plan comes from two read-only reviews; steps are
      approved one at a time, none of the open ones is started). Every app
      file is a module; the first splits and state clean-ups are in Done.
      Status 2026-11-02: a release is planned for 2026-11-03 (step 5 below);
      steps 1 and 2 are ON HOLD until another session's "longer chaos-game
      run" merge lands on `main` (it touches `share.js`, `teleport.js`,
      `interaction.js`, `hud.js`, `app.js`, `index.html` and `fern.js`, and
      adds `chaos-run.js`; it was built on `a070fbd`, so it already follows
      the `share-menu.js` and `hud.js` moves; rebase onto the then-current
      `main` before starting). Method per step: one commit, a patch bump
      with an "Internal" CHANGELOG line, `npm run stamp`, lint, and the specs
      that cover what moved, with `npm run test:quick` (webkit-iphone15 and
      chromium-desktop, about half the time) between releases and all four
      projects only for a release. For a move, write the new file, delete
      the block with one Edit, and diff it against `git show HEAD:<old
      file>`; add the file to `app.js` (import and `exposeForTests`) and
      `sw.js` `APP_SHELL`.
      Open steps, in the order to take them:
      1. DONE 2026-11-02 (`702f1b0`, 1.55.3; 534 tests passed on
         webkit-iphone15 and chromium-desktop; the block diffed identical to
         the old lines; `teleport.js` is now 270 lines, `pattern-controls.js`
         313). Was: `pattern-controls.js` from `teleport.js` (about 270 lines): the
         Koch depth and fill handlers, depth play with its speed bubble and
         slide gestures, the dot-shape replay button, and the depth-slider
         and Reset handlers of the tree, hexaflake, dragon and fern. Leaves
         flights, the cold open and the teleport index state. Importers:
         `modes.js` (`stopDepthPlay`), `interaction.js` (`stopDotReplay`).
         Medium risk (many load-time listeners). Specs: `vector`,
         `koch-generations`, `dot-replay`, `dual`, `cold-open`.
      2. DONE 2026-11-02 (`ff8a408`, 1.55.4; 816 tests passed on
         webkit-iphone15 and chromium-desktop across ten specs; the moved text
         diffed identical; the fern's box-zoom toggle and `curveBoxCache` went
         with it so the two files do not import each other; the keyboard
         stayed in `interaction.js`, now 295 lines, `vector-interaction.js`
         330). Was: `vector-interaction.js` from `interaction.js` (about 290 lines):
         `attachVectorViewInteraction`, `vectorViewBox`, `VECTOR_VIEWS`, the
         fit helpers, the `*Nav` objects and their Back listeners,
         `activeVectorTarget`; optionally the keyboard handler (with
         `keyAction` and `KEY_*`) into `keyboard.js`. Many importers; the
         keyboard has little spec coverage. Specs: `vector`, `places-sheet`,
         `color-sheet`, `solid-colors`, `dot-replay`, `palettes`.
      3. `ifs.js` from `fern.js` DONE 2026-11-02 (`3fcad80`, 1.55.5; 1058
         tests passed on webkit-iphone15 and chromium-desktop; `fern.js` 851
         lines, `ifs.js` 262; `make-short.mjs` patches `PENTAGON_RATIO` in
         `ifs.js` through its own route and now checks that the patched
         values reached the page). Still open, optional: `digit-fractals.js` and `apollonian.js` from
         `fractal-defs.js` (`EXTRA_MODES` must stay where it is: `tests/cases.mjs`
         reads it as text); `ifs.js` from `fern.js` (the replay constants and
         `createIfsView` stay: `scripts/make-short.mjs` patches that text);
         the dragon split into three files; `fractal-picker.js`,
         `toolbar-a11y.js`. Not worth splitting: `shaders.js`, `renderer.js`,
         the view factories, `configs.js`, `places.js`, `colormaps.js`.
      4. Safety nets: `scripts/test-visual.mjs` no longer kills another
         session's run: DONE 2026-11-02 (`9c9fdf0`, only orphaned processes)
         and tightened 2026-11-03 (parent pid 1 is not proof of an orphan:
         WebKit's helpers and Chrome's crash handlers have it in a live
         run, so browsers are swept only when no other Playwright run is
         alive, crash handlers are never killed, and only this run's own
         test-server port is swept; see `tests/README.md`). Still open: a smoke check that runs each store, preview and
         thumbnail script against a scratch output folder (the conversion
         broke `render_thumbs.mjs` silently once); a lint check that two
         modules never export the same name (today that only throws under
         the test hook); add `espree` to `package.json` (lint relies on
         eslint pulling it in; a lockfile change, so ask first).
      5. DONE 2026-11-02: 1.55.5 (build 455) released: full suite 2963 of
         2963 on the tree before the tag, tag `v1.55.5` pushed after the
         pre-push suite passed on its second attempt (the first failed two
         `dot-replay` tests that race a real-time run against the test's own
         steps; they pass alone, so they are load-sensitive: consider moving
         them to the manual clock), IPA `store-assets/1.55.5/ipa/App.ipa`.
         Still the user's: the real-iPhone check, the upload and the App
         Store Connect fields. Was: release planned for 2026-11-03 (last tag `v1.53.0`; 40 commits
         since, 1.53.1 to 1.54.7 almost all internal; the user-visible parts
         are the pentagon dot shape in 1.54.0 and the offline picker
         thumbnails in 1.53.12). Decide first: whether the chaos-game-run
         merge is in it (then it must land and be tried locally before the
         release starts) and the version (1.55.0 proposed, folding the
         "Internal" entries in). Then `/release`: the full four-project suite
         (the refactors since 1.53.11 were each checked with targeted specs
         only; `npm run test:visual` kills every Playwright process, so no
         other session may be running specs then), a Release build tapped
         through on a real iPhone (simctl cannot tap), simulator screenshots,
         archive and IPA, tag and push.
      Not recommended: a bundler, one `session` or `panes` state object (about
      300 reference edits and it weakens the read-only guard on imports),
      regrouping `kochState`/`vectorColors` (tests mutate them in place).
      Optional, low value: try `// @ts-check` plus `tsc --noEmit` on a file
      with many callers (the three leaf files `colormaps.js`, `configs.js`
      and `vectorgeom.js` checked clean once annotated and found no bugs).
- [ ] Proposed order of work (a suggestion the user pasted 2026-10-23;
      not approved, not started; reorder freely). Existing items it
      touches: Minimap, Auto-dive/flyover, deep flights (reverted in
      1.40.3), the WebGL context-loss note, the Sierpinski/gasket pair.
      1. Stabilize: no new fractal types for about a month, weekly
         batched releases, experiments behind flags rather than shipped
         and reverted; first the real-device checks above. (The iPhone
         WebGL context loss: CLOSED by the user 2026-10-27; they reported
         it fixed 2026-10-24, and a read-only investigation that day found
         no loss recorded after 2026-10-16. The optional hardening it
         suggested was not approved or built: a "Reload graphics" button
         after a timeout if `restored` never fires, and an exact-step cap
         on Newton deep like Phoenix's.)
      2. DONE 2026-10-23 (`b7fb4a4`, see Done): `app.js` split along its
         section headers into plain scripts as a pure move, including
         `places.js`. `deepzoom.js` was checked 2026-10-24 and is already
         free of DOM and global state (it needs only `FTYPE` and
         `PHOENIX_P` from `configs.js`), so a Web Worker can load it with
         `importScripts`; the callers are still synchronous (item 5).
      3. An index of the ~100 named places, browsable by fractal and
         region, with thumbnails; tap to fly. Decided 2026-10-23: group
         by fractal only for now; region/type tags can come later. Entry
         point (decided 2026-10-23): a Places sheet, a bottom sheet like
         the Color sheet; places grouped by fractal with thumbnails, tap
         to fly. Revised 2026-10-24: NO new toolbar button; it opens from
         a "Browse places" button in the info card and a "Places" row at
         the top of the fractal picker. Design done (a read-only agent,
         2026-10-24): rows with a 64 pt thumbnail, name, depth in words
         and a "Dive" pill; a chip strip to jump between fractals; sticky
         headers; 1 column on phone, 2 on iPad/desktop; about 230 lines in
         a new `places-sheet.js`, about 1 day, 1.43.0. Decided by the
         user: picking a place turns the info card on; a place on another
         fractal flies from that fractal's whole-shape view (not its
         remembered view); sections follow the picker's order
         (`PICKER_LAYOUT`, regrouped in 1.44.1); commit the ~98 pre-rendered
         160 px webp thumbnails (about 0.5 MB, `icons/places/<id>.webp`,
         not in `APP_SHELL`) to the repo. DONE 2026-10-27 (`8f532b7`, 1.46.0,
         approved by the user that day): `places-sheet.js`, the picker's
         "Places" row and the info card's "Browse places" button, 98
         thumbnails (about 1 MB; `node scripts/render_place_thumbs.mjs
         --missing` renders new ones), `places-sheet.spec.mjs`. Nova has no
         places yet, so it has no section; a new fractal's places appear in
         the sheet by themselves once they are in `places.js`.
      4. The info card says "near X" between named places; the minimap
         (see Minimap); a one- or two-sentence caption per place, with
         established names kept apart from our own names. Later, name the
         actual bulb or minibrot on Mandelbrot.
      5. Deep flights: reference orbits computed in a worker, the next
         destination prepared while the viewer pauses on the current one;
         then the flyover as a tour (a playlist plus pause timing). Skip
         ambient drift and video export for now.
      6. Small IFS wins: an equilateral Sierpinski triangle, settle its
         overlap with the gasket, color the IFS modes by address through
         the palettes; the hexaflake (shipped in 1.42.0, rebuilt as exact
         hexagons in 1.43.0) after that, if at all.

## Next — discovery and delight
Help people find beautiful places, and give them more ways to see them.
Celtic/Buffalo/Lambda first (quick win); distance estimation before zoom-to-minibrot.


- [ ] Turning Vicsek ("Vicsek clock", user idea 2026-11-05; not approved, not
      started). Inspired by a short r/fractals animation of the Vicsek cross
      (about 8.7 s, thin multicolored strokes on black, the whole pattern
      turning through an upright plus, a 45-degree X and in-between frames
      where the small crosses sit at a different angle from the cross they
      belong to). Source post could not be opened from here (reddit.com is
      blocked for every tool this session has); this reading is from eight
      frames of the saved clip only. UNVERIFIED: whether each level turns at
      its own rate (hour, minute and second hands) or all levels share one
      angle, and what the colors encode. Sketch: a level-by-level Canvas2D
      mode in the style of `hexaflake.js` / `pythagoras.js` (exact crosses,
      only what the viewport needs; 5^6 = 15,625 crosses at depth 6 is cheap
      enough to redraw every frame), not the chaos game in `fern.js`, which
      needs far too many random points to redraw at 60 fps. Each child cross
      is its parent turned by an extra angle theta, so level k sits at k*theta;
      a Turn slider and a play button animate theta (the pattern repeats every
      90 degrees, the cross's own symmetry) beside the existing depth slider.
      Twist, share link (`m=` key plus theta), picker thumbnail and
      learn-more row follow the conventions in CLAUDE.md. Open questions:
      a new mode next to the dot-shape Vicsek, or a Turn control on the
      existing one (the dots would need re-sampling each frame, so probably
      not); whether the cropped, drifting framing in the clip is part of the
      effect. Also check whether theta-turned children overlap at the
      default angles.

- [ ] Ambient auto-zoom mode (user idea 2026-11-03; not approved). A
      hands-off slow zoom toward a curated destination, Mandelbrot only to
      start; any touch stops it. To make it endless, loop a Misiurewicz point
      by wrapping scale and rotation by its self-similarity factor (the
      point's multiplier, a complex number: its modulus is the scale step and
      its argument the rotation step), with the center in plain double
      precision, so the zoom never reaches the float64 floor. UNVERIFIED: the
      self-similarity math is from memory and untested; prototype one point
      first (for example the Misiurewicz point at c = i, whose multiplier
      comes from the derivative along its preperiodic orbit; derive it,
      then check that the frame after a wrap matches the frame before it
      to a few pixels). Related: the autopilot and tour items in the XaoS
      list below, and the "ambient drift" note in the places list above;
      decide how they fit together before building any of them. See also
      STRATEGY.md.

- Ideas from studying the open-source XaoS zoomer (2026-11-02; none approved,
  none started). XaoS is GPL v2 or later (checked: GitHub reports GPL-2.0) and
  this repo is all rights reserved, so use only the ideas and the published
  maths: write everything from scratch, never paste or port XaoS code (and
  treat its XaoSjs repo, which has no license, as off limits). What follows
  is a read-only agent's reading of the XaoS source, not checked line by line
  by me; the formulas especially must be confirmed from the published maths
  before anything is built.
  - [ ] Ambient drift with a pixel-probe target picker: XaoS's autopilot looks
        at the image it just drew, tries random small windows (about 5x5
        pixels) and picks one that mixes inside and outside pixels (or, for
        fractals with no inside, a noisy window), keeps zooming toward it,
        searches near the last target so it doesn't turn sharply, re-picks at
        random intervals, zooms out when nothing qualifies, and resets the
        view at the precision limit. No distance estimation needed, but it
        follows the boundary and never settles on a minibrot, so it doesn't
        replace "zoom to nearest minibrot". Here: a small low-resolution
        probe pass in `renderer.js` read back a few times a second (iPhone
        readback stalls are the risk), a new file feeding `teleport.js`'s
        `zoomPath`, any touch stops it, a depth cap or `DEEP_ZOOM_THRESHOLD`
        as the "start somewhere new" trigger, a frame cap and pausing when
        hidden. Small to medium.
  - [ ] Tour as data: XaoS tours are scripts of commands (jump, glide, wait,
        caption, palette) with a trapezoid speed profile (ease in, constant,
        ease out). Here a tour could be a small list `[{ place, flightMs,
        dwellMs, caption }]` played through `teleport.js` with the 107 places
        as the playlist; the app's flight path is already smoother than
        XaoS's, so borrow only the dwell and ease. A dev-only "record my
        flights" button could author tours by flying around. Pairs with the
        flyover-as-a-tour step in the list above. Small to medium.
  - [ ] Seeded seamless palettes and a "Shuffle colors" button, beside the
        Colormap animation item under Later: XaoS makes a random palette from
        a seed as alternating dark and bright keyframe colors, interpolated,
        with the last color forced equal to the first so a cycle loops
        without a seam; a palette is just (type, seed, shift), tiny enough
        for a share-link field. Cycling there runs at steps per second (30 by
        default) and can reverse. Small.
  - [ ] "Inside out" plane mappings: render c = 1/w (or 1/(w+0.25), which
        gives infinitely repeating parabolic boundaries) by remapping the
        pixel coordinate before iterating; one pre-transform per pixel on
        existing formulas. UNVERIFIED whether it composes with the
        perturbation path (it would need the transform's derivative), so
        limit it to the shallow path first. Small to medium.
  - (The formulas XaoS ships that the app lacks, such as Spider, Manowar and
        the Magnets, are merged into the "More escape-time formulas" item
        under Next.)

- Ideas from reading the MIT-licensed fractal-garden project (read-only
  agent review, 2026-11-02; not approved, not started; the review is the
  agent's reading of their source, not checked line by line by me). MIT would
  require keeping their copyright notice in any reused code, which clashes
  with this repo's all-rights-reserved license, so take only the ideas and
  write everything from scratch.
  - [ ] Place captions and themed groups in the Places sheet (this is the
        "caption per place" idea in the atlas plan above, step 4): give each
        place one plain sentence saying what you will see (their examples:
        "Tiny branches repeat along the knot's edges", "Another tenfold zoom
        into the same spiral") and an "N× deeper" label (rows already show
        depth in words). They also group places by theme as well as by
        fractal ("Start wide", "Valleys and spirals", "Along the antenna");
        thematic groups may read better than grouping only by fractal, and a
        "same spot, tenfold deeper" pair is a nice device. Add `detail` (and a
        theme `group`) fields to the entries in `places.js` and show them in
        `places-sheet.js`; keep established names apart from our own invented
        names. Small.
  - [ ] A caption voice note for place captions, info-card text and the
        "Learn more" blurbs (their rules, which fit "passive delight, not a
        mathy nerdfest"): start with something the reader can see or try;
        short plain sentences; no lyrical filler and no generic "wow"; name
        the one discovery in a sentence; cut any fact that doesn't earn "huh,
        I didn't know that". Write it down in this file's workflow notes
        rather than CLAUDE.md unless decided otherwise. Small.

- [ ] Picker cards: variant B, rows with a one-line descriptor (user choice
      2026-10-24, after the evaluation of three mockups; not started). One
      row per fractal (about 76 px, a 64 px thumbnail, a bold name and a
      one-line blurb; two columns from 640 px up), scoped to
      `#fractalTypeRow`. The user wants to edit the blurb wording and see it
      on a phone first. Needs a `blurb` field per fractal (not keys), the
      `.pickTile` / `button[data-name]` / `button[data-mode]` selectors
      kept (cold-open spec and store scripts use them), `aria-current` on
      the active tile, and a unique accessible name for the Julia Phoenix
      tile. Re-render the store "2-picker" shot at the next listing
      refresh (it needs the regrouped picker from 1.44.1, see Done, too).
      The regrouping shipped first, on its own; the rows go into
      `PICKER_LAYOUT`'s loop in `compass-ui.js`.
- [ ] Picker grouping and order (user question 2026-11-05; proposal, not
      approved, not started). Display only, in `PICKER_LAYOUT`
      (`fractal-defs.js`): Sine Julia is a single Julia set, so it belongs
      under "Julia sets"; Sine plane is the parameter map those sets come
      from (dual view on), so it belongs with the Mandelbrot family, as
      would Magnet I and II (parameter maps too; unverified whether the user
      wants that long a family). Within a group the order is hand-placed with
      newer fractals appended (no per-fractal usage data exists in the repo),
      so a rule would be: the classic first, then variants by how far the
      formula departs (power, folds and conjugates, memory, then the newest).
      "More to zoom into" is a grab bag (Newton and Nova; Apollonian, Carpet
      and Gasket) that could split into two titled groups. Check first what
      `group: "julia"` and `dualParent` drive besides the picker, and that the
      Places sheet (sections follow picker order) and `app.spec.mjs` (each key
      appears once) still hold. Tier 2; patch bump. Do it together with
      picker cards variant B (above), whose blurb file is keyed by group.
- [ ] Peano curve, shaded by component with the colormaps (user idea
      2026-10-23): the 3x3 space-filling curve (nine sub-squares per level,
      snaking through them), colored along its length so each component
      takes its place in the colormap, like the depth gradient on the other
      line curves. Likely an L-system in the generic engine beside Hilbert,
      Gosper and arrowhead (`LINE_CURVES`, same stroke path and colormap
      picker); check whether the existing color is per segment or per
      depth and how to color by position along the curve, so the levels
      read as a gradient. Needs the new-fractal checklist: twist gesture,
      a picker thumbnail (`node scripts/render_thumbs.mjs`), and a row in
      `docs/learn-more-links.md` (Wikipedia "Peano curve").
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
        most of the items below. BUILT 2026-10-22 (`diag.js`, tests in
        `diag.spec.mjs`): open the site with `#diag` (in the app, open
        `https://kmjohn1000.github.io/fractal-web/#diag` as a link), tap the
        "diag" pill, use the views that matter (deep Mandelbrot, Phoenix
        and Newton deep, a Glow or Stripes pick, a Surprise-me flight), then
        Copy or Share the report. Results 2026-10-22, iPhone 15 in Safari
        (not yet in the app; GPU ms are submit-to-fence, so up to ~4 ms
        late and including queueing):
        - Extensions: `EXT_color_buffer_float`, `EXT_color_buffer_half_float`
          and `KHR_parallel_shader_compile` yes; `EXT_float_blend`,
          `OES_texture_float_linear` and `EXT_disjoint_timer_query_webgl2`
          no (desktop WebKit has the first two, so desktop tests don't
          predict this). Fences work; a WebGPU adapter is present, with
          `shader-f16` and `timestamp-query` but not `subgroups`
        - Shader links: default variant 6-18 ms, Phoenix deep 393 ms the
          first time and 22 ms on later loads (Safari seems to cache the
          compile). The Glow/Stripes/trap variants warm up in parallel at
          0-1 ms of main-thread time and finish at 0 ms
        - Opening view (786x1098), per pass: Smooth 8, Bands 10, Glow 11,
          Stripes 11, Orbs 19, Rays 20 ms; a drag frame costs the same as
          a refine pass (Orbs/Rays live 17-18 ms, over a 16.7 ms frame)
        - Mandelbrot at 4e-10 (perturbation), per refine pass: Smooth 41,
          Stripes 51, Orbs/Rays 44, Glow 59 ms; 16 passes finish in ~0.7-1.0
          s. Another deep place measured 98 ms per pass, so cost varies by
          place, not by depth alone
        - Phoenix: float32 first/refine/live 60/39/20 ms; deep ~300-350 ms
          per pass, 4 samples (its refine median is a no-op artifact:
          passes after the 4th draw nothing)
        - Dual view: Mandelbrot pane refine 9, Julia pane 11 ms
        - Julia-set flights (Smooth, float32): 2117 live frames at 19 ms
          median, p90 22, max 25; no context loss. Whether the late-frame
          resolution drop was active wasn't logged then (labels now carry
          it)
        - What this changes: per-fractal shader variants are not worth
          building (links are cheap and warm up off the thread); a float
          accumulation buffer must be RGBA16F or ping-pong (no float
          blending); perturbation at 40-100 ms per pass is the cost that
          interior skip and adaptive supersampling would cut
        - In the app's web view (Release build 1.39.4, 13:14-13:16): the
          opening-view and drag numbers match Safari; first draws of the
          Glow, Stripes and Orbs variants cost ~50-100 ms more than in Safari
          (a one-off per style, small samples). Deep perturbation looked 3.8x
          slower than Safari's earlier figures, but Safari repeated right
          afterwards on the same phone gave 123 ms (Smooth) instead of 41, so
          the phone's state (probably heat) moves deep-view cost about 3x.
          Per pixel the app and Safari agree (155 ms on 786x1362 vs 123 ms on
          786x1098). Treat every absolute deep-zoom time above as a cool-phone
          best case: a warm phone takes 2-3.7 s to finish 16 passes at 4e-10
      - DONE 2026-10-22 (1.40.1): fewer passes on deep views. Deep-zoom
        passes (perturbation, Newton deep) now stop at 8 of 16 by default
        (`DEEP_PASSES`); Save and Share finish all 16 (`finishRefinement`).
        Judged by eye on an iPhone 15: 8 looked the same as 16 at Seahorse
        4e-10, Mini Mandelbrot 1.5e-12 and a deep Newton view; 4 was slightly
        grainier. Measured against 16 passes, 8 differs by a mean of 3.8-4.5
        levels at Seahorse (9-11% of pixels over 16 levels off) and 1.2-1.8 at
        Mini Mandelbrot. Halves deep refinement time (about 2.4 s to 1.2 s on
        a warm phone, 0.7 s to 0.35 s cool). `#passes=N` overrides it. Still
        open: 6 passes was never judged
      - Interior skip + variance-adaptive supersampling (~100-180 lines in
        `render`, `scheduleRefinement`, a mask pass): after pass 0 mask the
        interior; after pass 3 keep refining only where samples still differ
        by more than ~12 levels. Modeled work 51-98% of today's across five
        views. Output stops being bit-identical, so re-record the visual
        baselines. Subsumes "Skip the black interior" step 1 above.
        TRIED 2026-10-22, DID NOT PAY (an opt-in `#adaptive` experiment,
        commit `122e20f`: 4 full samples, a 3x3-dilated stencil mask of the
        pixels whose 4-sample mean differs from sample 0 by more than 4
        levels, the other 12 samples drawn only under the mask). What was
        measured on the iPhone 15: the stencil test does skip work (a
        synthetic 50% mask of blocks of 8-128 px took 50% of the time, a
        10% mask 17%; single-pixel scatter only 83%); but the real mask keeps
        the expensive pixels. In a float32 spike the mask kept 7-45% of the
        pixels and the whole refinement still took 76-100% of full (whole
        set 94-100%, Elephant 80%, Spiral Cluster 76%, Seahorse 2e-4 92%;
        mean error 0.03-0.15 of 255, p99 1-2, worst pixels up to 47). In the
        app at Seahorse 4e-10 the 12 masked passes took 155 ms against 153 ms
        for an ordinary pass: no saving, though the mask keeps only 33% of
        the pixels there (Bird's Eye 25%, Mini Mandelbrot 27%, Rabbit Hole
        5%, Spiral Cluster 20%, Elephant 9%; the share barely moves with the
        threshold from 4 to 32 levels). Why: the pixels that still disagree
        between samples are the near-boundary ones, which also run the most
        iterations, so a third of the pixels hold nearly all of a pass's
        cost. The model that predicted 51-69% for deep views assumed a cost
        spread it didn't have. Gate was >=25% less refinement time on deep
        views: not met. Reverted in `fc14078` (the code is in history, `122e20f`)
      - Per-fractal shader variants (~60-100 lines in `link()`): `#define`
        variants compiled lazily, with `KHR_parallel_shader_compile` where
        present. Pass: pixel-identical output and >=15% faster pass or >=30%
        faster link on the phone. Phone telemetry (above) says links are
        6-18 ms and warm up off the thread, so only a >=15% faster pass
        could justify it; unmeasured
      - Fence-paced rendering (~80-150 lines): time each pass with
        `fenceSync`, adapt passes per frame (several cheap passes per
        frame, one strip per frame for heavy ones). The route to retrying
        Bird's Eye at 8000, together with multi-pass iteration state in
        float textures (+150-250 lines; see Deep-zoom engine). Test: 20
        zoom-ins at 8000 without context loss
      - Offscreen float accumulation buffer instead of
        `preserveDrawingBuffer` + `alpha:false` (~100-140 lines; the phone
        has no `EXT_float_blend`, so use RGBA16F, which blends, or a
        ping-pong pair with the average done in the shader). Enables
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
- [ ] Pre-rendering common changes (user idea 2026-10-21; the first two are
      part of the color-style speed fixes in progress, the rest not approved):
      - DONE (`70183b0`): warm the shader variants in idle time (when the Color
        sheet opens, or once the app is idle after the first frame): the Glow,
        Stripes, Bands and trap variants, and the Julia pane's variant when
        dual view is available, so the compile happens before the tap. One
        program per idle callback, or parallel compile with
        `KHR_parallel_shader_compile`; each variant is also drawn once (one
        fragment, pixel restored) so the GPU builds it before the pick. The
        first-pick hitch it targets (~50-100 ms in the app's first run) was
        re-measured 2026-10-22 on a fresh install (iPhone 15, 1.40.0 build
        297, cold shader cache): compile is free (0-1 ms, parallel) and the
        primes ran, but the first real draw of Edge glow, Stripes and Orbs
        still took 72-76 ms (Rays 18: it shares Orbs' program), against 8-20
        after. So the prime is unproven. To settle it: an A/B on the same
        cold cache with and without `primeVariant`, or prime with exactly
        the state of the first real pass (blend, color mask, attachments)
      - First launch after an install is slow: the default program linked in
        573 ms and the preview in 268 ms before the first frame (6-9 ms on
        later launches, cache warm), about 0.85 s extra on the launch screen,
        once per install. Measured on the same fresh install
      - Keep the old image on screen (scaled) until the first new pass of a
        style change or dual toggle is ready, rather than clearing to blank
      - Frame cache: the last 3-4 finished frames of the current view, keyed by
        style, palette, bands and shift, so flipping a style back is instant;
        cleared by any pan, zoom, rotation or detail change. Count the memory
        on the phone (frame size x 4 bytes each at dpr 2) before keeping it
      - Looks thumbnails that show the current view in each Look: tiny
        single-pass, quarter-resolution renders in idle time, only where the
        view is cheap (shallow zoom). Speculative full renders of other
        styles at deep zoom are out: a deep Glow pass costs about 200 ms in
        headless measurements and a frame is 16 of them, so they would
        compete with the live frame and drain the battery
- [ ] More escape-time formulas: Buffalo, Lambda, the Mandelbrot-family
      variants and the formulas XaoS ships (merged 2026-11-02 from three
      items: "New escape-time types: Buffalo, Lambda", "More Mandelbrot-family
      variants beyond Buffalo/Lambda" and the XaoS formulas bullet; none
      approved; Celtic is done, see Done). Single-state iterations reuse the
      shared shader, perturbation and supersampling pipeline with no
      structural changes: each is a small `ftype` branch. Check which ones
      perturbation can handle (abs-folds need `diffabs`) before promising deep
      zoom, and note that a new fold type would silently inherit Celtic's
      derivative in the Edge glow and Relief Looks unless it gets its own
      branch in `glowStep`. Any addition changes the fractal count in the
      store listing. Candidate formulas (mostly unconfirmed: check each
      against a published source, never against XaoS's or anyone's code,
      before building) and a comparison render are in the local
      `docs/mandelbrot-variants/` (2026-10-20):
      - Names listed before: Buffalo, Lambda, Heart, Feather, Perpendicular
        Buffalo and Ship, Mandelbar variants.
      - A 2026-11-02 review (read-only agent, partly single forum source, the
        expansions below are its own): Buffalo = the Mandelbrot step with the
        absolute value on both parts, (|x^2 - y^2|, 2|xy|) + c, sign
        UNVERIFIED, check against a rendered reference; Perpendicular Burning
        Ship (x^2 - y^2, 2x|y|) + c; Perpendicular Buffalo (|x^2 - y^2|,
        2x|y|) + c; the Perpendicular Mandelbrot is described differently by a
        second source, so build the Ship first. Multibrot to the 4th and 5th
        power answers the "powers 8, 9, 10" requests without a slider, but the
        power is hard-coded to 2 or 3 in the shader (`u_power > 2.5` in
        `shaders.js`, `logBase`, the glow derivative, `stepOrbit` in
        `deepzoom.js`), so it needs a repeated-multiply loop and a binomial
        perturbation step (medium); deep zoom looks feasible, unverified.
        Heart, Simonbrot and Feather had no verifiable source.
      - From the XaoS source (agent's reading; ideas only, GPL, never port
        code): Spider (z = z^2 + c, then c = c/2 + z; no perturbation), Manowar
        (z(n+1) = z(n)^2 + z(n-1) + c; Phoenix-shaped, so the existing
        `zPrev` path could carry it once `PHOENIX_P` is per config), Magnet I
        (z = ((z^2 + c - 1)/(2z + c - 2))^2, with a convergence test to 1, no
        perturbation path; Magnet II likewise), the three Barnsley fold
        fractals, and odd ones (trice, Catseye, Beryl, Octo). Spider and
        Manowar looked good in the agent's reading; Lambda's roles for z0 and
        c were unclear to it (Lambda is z -> c z (1 - z)).
      - Magnet, the sine family and Spider were chosen by the user on
        2026-11-04 after seeing CPU mock-ups (not in the repo) and have their
        own items below, with Lyapunov. Manowar (a five-armed star when
        zoomed at 0, 0) was not chosen and stays here. Still low priority: the
        exponential family (the mock-ups were mostly flat color fields, only
        0.5 e^z showed structure), fractional and negative powers (no
        perturbation, shallow only).
- [ ] Nova for other powers: Nova², Nova⁴, Nova⁵, Nova⁶ beside the current Nova
      (user idea 2026-11-02, prompted by a Reddit post giving the general
      form z -> z - R (z^n - 1)/(n z^(n-1)) + c, z0 = 1, c = the pixel, n from
      2 to 6, R a complex "relax" value; not approved, not started). The app's
      Nova is the n = 3, R = 1 case (`renderNova`, `shaders.js` ~556-600: the
      cube is hard-coded; the Nova config already carries `power: 3`).
      A CPU mock-up of the same rule (not in the repo) reproduced the app's
      crescent at n = 3 and showed distinct shapes for the others on a wide
      view: n = 2 is a vertical crescent with two bulbs, n = 4 to 6 have more
      lobes and rings around the origin, all mostly empty at the wide view, so
      each needs its own default view found by exploring. Build: generalize
      the step to `((n-1) z + (1/z)^(n-1)) / n` by repeated multiplication
      driven by `u_power`; a config key per power (new `f=` ids, never
      renamed), a default view, a few places and a thumbnail each; Nova stays
      float32 only (no deep zoom path, `NOVA_MIN_SCALE` in `deepzoom.js`).
      Open design questions: four more picker entries, or one Nova entry with
      a power chooser (the interface is meant to stay small); and a complex
      Relax value R, which the same rule allows but which adds controls the
      user was unsure about. Each new entry changes the fractal count in the
      store listing.
      Conventions (a web search, 2026-11-02; third-party pages, check Ultra
      Fractal's and Wikipedia's own pages before quoting): the formula is Paul
      Derbyshire's Nova, named by Damien M. Jones; Ultra Fractal's "Nova
      (Mandelbrot)" defaults to exponent 3 and start value 1, and Wikipedia
      says the Mandelbrot variant starts at a critical point of the Newton
      step, which for z^n - 1 includes the root z = 1 for every n, so
      starting at 1 is valid for all powers. So "Nova" in the picker is
      already the conventional exponent-3 Nova; the new ones would be named
      by power (Nova², Nova⁴ …) like Multibrot³.
      Fractional powers (CPU mock-up, principal branch): they render and
      morph smoothly between the integer shapes (n = 2.25 and 2.5 grow out of
      n = 2, 2.75 looks like n = 3, 3.25 and 3.5 are n = 3 with a black seam
      along the negative real axis, the branch cut). They need a polar power
      in the shader (log, exp, atan) instead of repeated multiplication. More
      interesting as a slow morph animation than as separate entries.
- [ ] Newton for other polynomials (user asked 2026-11-04 to make sure this
      is tracked; it was not, only "Nova for other powers" above is; not
      approved, not started). The picker has Newton z³ only (`FTYPE.NEWTON`).
      Candidates: z^n - 1 for n = 4, 5 and 6 (more basins, n-fold symmetry),
      and z³ - 2z + 2, Newton's own example, whose step has the 2-cycle
      0 <-> 1 (checked by hand: N(0) = 1, N(1) = 0). Build: generalize the
      cube in the Newton shader to a repeated multiply driven by a power
      uniform, or to a small coefficient list for non-binomials; check how
      the three roots are colored today and what the basin coloring needs for
      n roots; Newton's deep path is exact 16.48 fixed point (1.33.0), so
      each polynomial needs its own check of the floor. Open design question,
      as for Nova: more picker entries, or one Newton entry with a
      polynomial chooser (the interface is meant to stay small).
- [ ] Higher-degree Multibrot and Multicorn (user, 2026-11-04: "record as a
      possible todo"; not approved, not started). Multibrot z^n + c and
      Multicorn conj(z)^n + c for n = 4, 5, 6 and up. Tricorn is the n = 2
      Multicorn and Multibrot³ is n = 3 today. The power is hard-coded to 2 or
      3 in the shader, so this needs the repeated-multiply loop and the
      binomial perturbation step already described in "More escape-time
      formulas" above (Multibrot to the 4th and 5th power); Multicorn is the
      Tricorn branch with the same generalization, and its deep zoom needs
      the conjugate handled in the perturbation step (unverified). Could
      start shallow-only. New `f=` ids (never renamed), a default view, a
      thumbnail and a few places each.
- [ ] Four new fractals chosen by the user on 2026-11-04 after seeing CPU
      mock-ups (a throwaway script, not in the repo; 320 px panels, plain
      iteration-count colors): Lyapunov, Spider, Magnet and the sine family.
      None approved to build, none started. The maths is standard and was
      checked against the formulas in a local copy of an archive of Fractint
      formula files (read for the definitions only, nothing copied). Each
      needs, per the feature conventions: two-finger twist (free for WebGL
      types), a picker thumbnail (`render_thumbs.mjs`), a row in the local
      `docs/learn-more-links.md`, new `f=` ids (never renamed), a default view
      and a few places. Suggested order by size, a guess: Spider, Magnet,
      sine, Lyapunov. All four are float32 only (no perturbation), so each
      gets a zoom floor like the other non-Mandelbrot families.
      - Spider (z -> z^2 + c, then c -> z + c/2, starting from z = c = the
        pixel; bailout |z| > 4). Mock-up: the parameter plane is a black body
        with rainbow stripes, and a zoom at (-0.2, 0.9) width 1.2 is the most
        striking of the set. The state includes c, which changes each step,
        so the derivative Looks (Edge glow, Relief, Halo, Paper cut) would
        need their own branch or stay off (the Looks list is per type in
        `color-styles.js`); Smooth, Bands, Stripes and the traps need only z.
      - Magnet I and II. I: z -> ((z^2 + c - 1) / (2z + c - 2))^2; II: z ->
        ((z^3 + 3(c-1) z + (c-1)(c-2)) / (3 z^2 + 3(c-2) z + (c-1)(c-2) + 1))^2.
        Mandelbrot-type (z = 0, c = the pixel) and Julia-type (z = the pixel,
        c fixed). Each pixel ends one of two ways, escaping (|z| > 100) or
        converging to 1 (|z - 1| < about 1e-4 to 3e-5), so the shader needs
        a second terminal state and both get a color. Mock-up: the plane at
        width 3.8 centered (1.4, 0) is black bulbs in a cyan field with pink
        bubbles; Magnet I Julia sets at c = 2, 2 + 0.5i and 2.5 + 0.3i are
        dense circle-packing patterns, while c = 1.5 + 0.5i is speckled noise
        (partly the mock-up's cyclic palette on fast escapes, partly the
        set). Open: whether the dual view (Mandelbrot beside its Julia set)
        works for it.
      - Sine family: Julia sets of z -> L sin z with the complex sine from
        sin(a + bi) = sin a cosh b + i cos a sinh b; escape at |z| > 50.
        Mock-up: L = 1 + 0.4i is a field of spirals, L = 0.6 + i a
        snowflake-like dendrite; L = 1 + 0.4i with cosh is noisier. The
        plane z -> sin z + cosh(pixel), starting at z = the pixel, is a
        Mandelbrot-like picture with a fractal border. Needs complex sin and
        cosh helpers in GLSL; float32 accuracy of sin at |Re z| near 50 is
        worth checking (reduce Re z modulo 2 pi first). Open: presets for L
        per picker entry or a draggable parameter.
      - Lyapunov fractals: the logistic map x -> r x (1 - x) with r taken
        from a sequence of A and B (A = the x axis value, B = the y axis
        value), exponent = the mean of log |r (1 - 2x)| after a warm-up (the
        mock-up used 60 warm-up and 150 steps, x0 = 0.5), colored by the
        exponent (negative: warm palette; positive: dark). A different class
        from the escape-time fractals, a per-pixel loop with a log in it, so
        the cost on a phone is not verified. Mock-up on [2, 4] x [2, 4]:
        sequences AB, AABAB and BBBBBBAAAAAA are lava-like flowing structure
        with bright cross-shaped hot spots; the last two are the best. The
        Looks (orbit traps and so on) do not apply, palette only. Open: how
        to offer the sequences (presets as picker entries, or one entry with
        a sequence chooser) and which window each opens on.
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
- [ ] More Looks (user, 2026-10-22; none of the open ones is approved to
      build). Nine Looks are shipped: Default, Edge glow, Stripes, Bands,
      Orbs, Rays (1.40.0), Relief (1.41.0), Halo and Paper cut (1.60.0); the
      orbit traps work at any depth (auto-range, `99712fc`). Open candidates:
      Ink / Blueprint, Glow plus Stripes, Angle / Hue, Binary decomposition,
      Triangle-inequality average, interior by cycle length, colorway recipes
      (Edge glow on Hot, Ice and Neon), Contours / Topo (and Engraving),
      Gloss (Chrome needs work, Pearl), Pixel, Clay, and the less developed
      ones (Halftone, Compass, Ripples, Neon, Gems, Watercolor, Haze, Looks
      for the pattern modes). Cathedral did not work in its mock-up. The
      research, every contact sheet, the verdicts, costs, the float32 and
      depth findings and the checklist for adding a style are in the local,
      git-ignored `docs/coloring-styles/README.md`; start there.
- [ ] Palette follow-ups after the curated defaults and the upright Burning
      Ship (1.44.0, see Done): no Surprise-me place names its own palette yet
      (the `colormap` field and its tests are in; pick by looking at each
      place); the Default Look's tile swatch is the Inferno picture, so on
      the seven fractals with another default palette it shows Inferno while
      applying that fractal's own (a per-fractal swatch, or a neutral one);
      phone check of the upright Ship: done. The user ran 1.44.0 on an
      iPhone 15 on 2026-10-24 and said it looks good, and on 2026-10-27
      confirmed the Burning Ship is fine after testing it
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
      `docs/saved-places/design.md` (local, git-ignored). User said
      2026-10-22 they might build it as saved links (stored share links);
      not approved yet. Whatever it stores must go through the share-link
      writer, which never carries the `#diag` telemetry flag
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
      canvas gives VoiceOver nothing. Items below; after them, run
      VoiceOver and Voice Control over the app
- [ ] Flashing check: record deep flights in Bands and Stripes (high Repeat)
      and step through frame by frame against the three-flashes-per-second
      limit. If they flash, Reduce Motion crossfades instead of flying, and
      consider calming Bands/Stripes during flights for everyone.
- [ ] Label the fractal for screen readers: `role="img"` on the main canvas
      with a label that updates as you move ("Elephant Valley, Mandelbrot
      set, 40 times in"); reuse the index captions once they exist.
- [ ] Announcements: say the place name when Surprise me lands; make the
      "graphics turned off" message an alert.
- [ ] One-finger alternatives: double-tap to zoom in, a one-finger way to
      zoom out, and a rotate control that doesn't need a twist. Box zoom is
      the only one-finger zoom today, so keep it until these exist.
- [ ] VoiceOver zoom in the app: zoom buttons only screen readers see, or an
      adjustable canvas where swiping up and down zooms.
- [ ] Color sheet focus: focus moves into the sheet when it opens and back to
      the color button when it closes (check with VoiceOver).
- [ ] Website only: try dropping `user-scalable=no` and `maximum-scale=1` so
      visitors can enlarge the page; check on an iPhone that gestures still work.
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
- [ ] Flight time and detail during deep flights (user idea 2026-10-22;
      tried in 1.40.2 and 1.40.3, reverted in 1.40.4 because it did not
      work: the owner reported it stuttered too much on the phone. Which
      of the two changes caused it was not separated; the likely cause is
      the 1.40.3 keyframes, each a blocking full-size render plus a
      reference orbit on the main thread, but 1.40.2's longer flights
      were never seen alone on a phone).
      The problem: a Surprise-me flight from a shallow view to a deep one
      goes by too fast to follow, and below `DEEP_ZOOM_THRESHOLD` (1e-3)
      it shows one stretched snapshot (a flat color by the end) because
      `renderAll` suppresses the accurate render during a gesture. Today:
      `teleportDurationMs` is 1 s to 2.5 s (every flight past distance
      ~34 takes 2.5 s); spiral dives are a fixed 7 s.
      Tried:
      - 1.40.2: duration = 250 ms per e-fold of zoom (`path.distance *
        Math.SQRT2`), 1 s floor, 7 s cap; spiral dives a 7 s floor then
        320 ms per e-fold up to 12 s; Reduce Motion kept the old formula.
        Timed in headless WebKit (a deep flight 6.99 s, was 1.8 s); not
        checked on a phone.
      - 1.40.3: during a flight below the threshold, a real render
        replaces the snapshot each time the preview is stretched 8×
        (isInteracting cleared for that one call, at most one per
        200 ms; 9 on the deepest flight), and flights over 10 e-folds
        used the steady ease. In headless WebKit the mid-flight frames
        showed real detail (the snapshot alone was flat); the cost of a
        keyframe on a phone was never measured.
      Not tried: a pinch or drag at depth still shows the single
      snapshot; precomputing keyframes along the known flight path before
      it starts; a lower-resolution keyframe; time scaling without the
      keyframes (or the reverse).

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
- [ ] More L-system curves as data (idea from the fractal-garden review,
      2026-11-02; Penrose P3 is DONE in 1.59.0, see Done; the rest is not
      approved and not started; the rules below are the review
      agent's reading of their preset files, so confirm each against a
      published source before building, not against their repo). The
      generic engine (`lsystem.js`, `dragon.js`) can take them, each needing
      a thumbnail, a `docs/learn-more-links.md` row and an `APP_SHELL` entry:
      Terdragon (axiom F, F -> F+F-F, angle 120); Twindragon (axiom FX+FX+,
      X -> X+YF, Y -> FX-Y, angle 90); Moore curve (a closed Hilbert loop;
      axiom LFL+F+LFL, L -> -RF+LFL+FR-, R -> +LF-RFR-FL+, angle 90); Peano
      (axiom X, X -> XFYFX+F+YFXFY-F-XFYFX, Y -> YFXFY-F-XFYFX+F+YFXFY, angle
      90); a Sierpinski curve (axiom F+XF+F+XF, X -> XF-F+F-XF+F+XF-F+F-X,
      angle 90); Penrose P3 via an L-system (angle 36). All small. Weigh them
      against the proposal to hold new fractal types back.
      A second read-only agent rendered about 45 curves with a throwaway
      turtle and looked at each (2026-11-02; sheets are scratchpad images, not
      in the repo). What it found, with confidence marked:
      - Engine facts: `lsystem.js` (`expandLSystem`, `turtleInterpret`)
        already handles any angle, `[ ]`, several draw symbols and several
        polylines. The `LINE_CURVES` fast path (`makeLCurveSpec` and
        `curveAdaptive` in `dragon.js`) is narrower: the axiom must be one rule
        variable, rules may use only variables, draw symbols and `+`/`-`
        (brackets ignored), the angle must divide 360, one polyline, a uniform
        stroke width, and a "square" or "chord" frame. Depth caps are about
        200k segments.
      - All five rules in the list above came out right (they were checked
        against Bourke, Wikipedia and a second repo; Peano and Moore differ
        from other sources only by a mirror image). Moore needs one extra
        closing segment to show as a closed loop. Penrose's rules agree across
        three sources: axiom `[N]++[N]++[N]++[N]++[N]`, angle 36, `M ->
        OF++PF----NF[-OF----MF]++`, `N -> +OF--PF[---MF--NF]+`, `O ->
        -MF++NF[+++OF++PF]-`, `P -> --OF++++MF[+PF++++NF]--NF`, `F ->`
        (empty), and M, N, O and P draw nothing (depth 4 is 1,780 segments,
        depth 5 is 7,920).
      - More verified-by-picture curves (rules in the agent's report; each
        also needs checking against a published source): Terdragon (depth 11,
        177,147 segments) and its closed triangle tile (axiom `F+F+F`, `F ->
        F-F+F`, 120); Krishna anklets (`-X--X`, `X -> XFX--XFX`, 45);
        Pentigree (`F-F-F-F-F`, `F -> F-F++F+F-F-F`, 72, depth 5 is 38,880
        segments, cap about 6); a five-arm Pentadendrite (rule `F ->
        F+F-F--F+F+F`, 72; the five-arm axiom is the agent's own); a Lévy
        tapestry (four Lévy copies, 45; the name and axiom are the agent's
        own); Minkowski sausage; Board; Rings; Cross. Unverified: Cesàro torn
        square (85 degrees, from memory), the Koch island variant's book
        attribution, Plant E (standard Lindenmayer plant, no source found).
      - Suggested order: Terdragon, Peano, Moore (all small on the fast path),
        then Penrose P3 (large: needs brackets, several polylines, non-drawing
        letters and an F-to-empty rule, so it uses the plain `turtleInterpret`
        path), then Krishna anklets or the Sierpinski square curve (pick one,
        they look alike), then Pentigree. Bracketed plants would need a new
        polylines view with per-branch colour, because the fast path ignores
        brackets and 25.7 degrees doesn't divide 360. Rejected as redundant or
        ugly: both quadratic Gosper forms, the Koch anti-snowflake variants,
        Crystal, Tiles, the second Cross, the Sierpinski 45-degree curve and
        some bushes. Skipped because the engine can't draw them cleanly:
        golden dragon, Gosper island, Z-order, H-tree, ADH, Dekking, Hilbert II.
      - Plants: the user liked `plant_c` best (2026-11-02, from the plant
        sheet): axiom `F`, `F -> FF-[-F+F+F]+[+F-F-F]`, 22.5 degrees,
        starting upright, depth 4 in the render (a feathery, windswept bush;
        no source found for the rule, so confirm it against a published
        L-system before using it). If bracketed plants are ever added, start
        from this one; it needs the polylines view with per-branch colour
        mentioned above, which the Penrose mode's turtle path may provide.
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

### Tilted 3D terrain view
- [ ] Mandelbrot (and the other distance-estimate fractals) as a tiltable 3D
      relief terrain you can pan across, a "Tilt" view on the existing zoom
      fractals (user idea 2026-11-02; spike only, not approved to build). An
      evaluation (read-only agent, 2026-11-02) recommended: height from the
      exterior distance estimate shaped by a saturating falloff
      (Lorentzian, ridges at least ~3 texels wide, a few blur passes), not
      the iteration count; a view-local (floating-origin) clipmap of nested
      height textures drawn as a displaced mesh with a vertex texture fetch,
      so "zoom forever" survives; a short height-march for cast shadows; tilt
      as a new control; fits only the escape-time family (not Phoenix, Nova,
      the pattern modes). Estimate for a shippable version: 10 to 15 days
      (not measured). The throwaway spike is local-only in
      `scripts/relief-spike/` (git-excluded, never commit it; it serves its
      own folder with `node scripts/relief-spike/server.mjs` for a phone on
      the LAN). Measured on the owner's iPhone, 60 s runs, shallow views,
      1024x1024 height texture: dpr 1.5 averaged 17.1 ms (58 fps), worst
      frame 70 ms, 0 context losses, slowest height render 59 ms; dpr 2
      averaged 18.0 ms (56 fps), worst frame 111 ms, 0 context losses,
      slowest height render 86 ms; the phone stayed fine (user, no heat
      problem). NOT yet known: deep zoom (the spike has no perturbation path;
      the evaluation's worry is deep height passes of 0.2 to 1 s against a
      400 ms limit), the look against the flat Relief Look (user judgement),
      shimmer while panning, a 2-minute session, older phones. Next step if
      pursued: a second spike that feeds the app's deep-zoom path into the
      height pass.

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
      the BigInt center orbit); ~250-400 lines. Measured 2026-10-21
      (headless Chromium, a 100 px drag, same for every color style and
      every fractal family tried): the float64 view center follows a drag
      correctly down to scale ~1e-15, moves in coarse steps at 1e-16 (not
      at all for centers near 1-2, up to 1.7x the drag for centers near
      0.1-0.3) and doesn't move at 7.8e-18 (1.6e17x), while zoom itself
      keeps working; there is no zoom cap
- [ ] Exact center, what is left after 1.62.4 to 1.64.2 (see Done): (a) Newton
      still keeps a float64 / fixed-point center and stops at its zoom floor
      (the Apollonian is done, 1.64.0; Phoenix's floor was lowered by
      measurement to 1e-13 to 4e-13 in 1.64.2, and going past that needs an
      exact reference orbit plus a wider fixed point in the shader: several
      hours and a phone test, since the exact pixel path is the slow one);
      a place with a
      long decimal text now lands on its exact center (1.64.1, Golden Glide
      and Golden Dive, 160 digits), so a hand zoom on from it stays on the
      point; the other places still carry doubles, and a deeper place (a new
      Golden dive past 1e-12, or the Mandelbrot minibrots past 1e-13) needs
      its center computed to more digits and checked (a Newton search in
      BigInt for a nucleus; never guess digits), and Jacob's Ladder (a
      user's link, a view or two off the fixed point) stays as it is; (b) [done 2026-11-03: on the
      user's iPhone 15 the reference search plus orbit took 8 ms median and
      11 ms worst in the `#diag` report, first pass 28 ms GPU, refine passes
      20 ms; the Mac's worst case is 14 ms]; (c) the
      exact pair is dropped when a view zooms out past scale 1e-4 (a wide
      view needs no more than a double), so zooming far out and back in loses
      the sub-double position; Back keeps it; (d) a flight that lands on the
      same double as a stale pair leaves the pair in place (`flyTo` assigns
      the target with Object.assign); under a pixel for every shipped place;
      (e) [done 2026-11-03, user's iPhone 15, Release build 1.63.0: Mandelbrot
      at 1e-20, 1e-30 and 1e-33 all sharp (1e-33 clamped to the floor), drag
      and pinch followed the finger at 1e-20, no heat, Carpet and Gasket
      perfect past 1e15x]. Still unchecked on a phone: scales between 1e-30
      and the Mac's 1e-36 grain limit are never drawn (the floor stops
      them), so the denormal question only matters for the deeper-than-1e-30
      item below.
- [ ] Deeper than 1e-30 (user question 2026-11-03; not approved). The center
      (192 bits, about 1e-55) and the BigInt orbit are not the limit; the
      GPU's float32 deltas are (measured clean to 1e-33, grainy by 1e-36 on
      the Mac). Needs extended-range deltas in the perturbation shader:
      rescaled deltas (z = S*w with a CPU-tracked power-of-two S) or a
      floatexp (mantissa plus exponent), likely 150-300 lines and 2-3x
      slower per pass (unmeasured); a wider `EXACT_FRAC`; and past 2000
      iterations the multi-pass iteration item below. Measure on the phone
      first with `#diag`. See `docs/render-research-2026-10-20.md` section 3.1.
- [ ] Infinite zoom for the other digit-addressed IFS modes (Carpet and
      Gasket are done, see Done 1.63.0): the same grown-fraction exact
      center (`state.ef`, `exactBitsFor`, `digitCellFrame`'s `exact`
      argument) may fit them; check which of them still stall at a float64
      center, and whether the HUD should show more than 17 decimals of the
      center at that depth (today the share link is the only way back to a
      very deep spot).
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
- [ ] 3D fractals as picker modes, from `../fractalweb-3d/` (a plan
      written 2026-10-27 from a read-only evaluation; not approved, not
      started; it conflicts with the "no new fractal types for about a
      month" item under Now and with the "Deferred indefinitely" entry
      below, so those two need a decision first; see STRATEGY.md).
      `fractalweb-3d` is about 72 KB of WebGL1 ray-marching source with no
      dependencies (Mandelbulb, Menger sponge, Sierpinski tetrahedron,
      fractal tree), lighting, orbit/pinch/twist and share links.
      Plan: (1) one-day phone spike first: serve its `?bench` mode over the
      LAN to an iPhone; median ms/frame per type, lit and unlit, at full,
      1/2 and 1/3 render scale, again after 60 s of orbiting (thermals);
      shader compile time; whether any WebGL context loss shows up in the
      app after switching to and from 2D modes (the context-loss handler
      covers only the main and Julia canvases today). Pass/fail bars are
      proposals until measured. (2) If it passes: Mandelbulb, Menger sponge
      and Sierpinski tetrahedron as a third picker section, placed last;
      leave the fractal tree out (it overlaps the Pythagoras tree). (3)
      Integration points: namespaced, never-renamed `f=` ids (its
      `sierpinski` and `tree` keys collide with existing mode keys); the
      `.glsl` source becomes a JS string, since `scripts/build-www.mjs`
      copies only root `.html`/`.js`/`.webmanifest`; save/share through
      `Platform`; add the new files to `APP_SHELL`; a render-scale governor
      (it has none and renders at 2x); fix the default framing, which crops
      the bulb on a 390x780 portrait viewport; thumbnails via
      `scripts/render_thumbs.mjs`; a `docs/learn-more-links.md` row each;
      the twist gesture; specs for the new modes (software-GL ray marching
      may be slow or flaky in the visual suite). Known limits to accept or
      work around: zoom stops at about 3,000x on the bulb (float32); one
      finger orbits instead of panning; no box zoom or named places.
      Estimate: spike 0.5-1 day, integration 4-6 days, release 1 day. If the
      spike fails, leave `fractalweb-3d` standalone (about half a day of
      tidying).

## Deferred indefinitely
- Menger Sponge / other 3D fractals (real 3D rendering project, not a
  slot-in). Proposal and spike plan: see "3D fractals as picker modes"
  under Later
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
- 1.65.0 release prepared (2026-11-03, `/release`): tag `v1.65.0` on `527bf8a`, build 538, IPA `store-assets/1.65.0/ipa/App.ipa` (not uploaded; the upload and App Store Connect fields are the user's). Covers 1.55.6 to 1.65.0. Verified: lint; the full four-setup suite three times: before the release commit 3736 passed and 5 failed (two Jacob's Ladder first-run baselines, looked at and fine; two load flakes that pass alone, the pinch round trip and Paper cut on `webkit-desktop`; and the edge spec's control-bar ratio, recalibrated from 10x to 4x in `4f41f88`), after the stamp 3739 passed and 2 failed (`dot-replay` "fern, 100x" and Paper cut on `webkit-desktop`, both load flakes that pass alone; Paper cut takes 49 s alone against a 90 s timeout, so it is close to the limit under load), and the pre-push suite on the tag, 3741 passed and 2 skipped, none failed, the simulator real-build check (iPhone 17 Pro, iPad Pro 13", four shots each), every store screenshot looked at. Fixed in the release: the store script's hardcoded "Seven Looks." caption (now nine, `527bf8a`). Not verified: a Release build of 1.65.0 tapped through on a real iPhone (the phone has 1.64.2).
- Phoenix zoom floor lowered by measurement (1.64.2, 2026-11-03, user asked to change it, then to run the measurement): `renderer.js` `phoenixDeepProbe` (a test hook: the deep shader's iteration counts for an n x n probe) and `tests/visual/phoenix-depth.spec.mjs` compare the probe with an independent BigInt iteration of each pixel at a boundary point (found by bisection), by scale. Parameter space agreed at 100% from 1e-9 to 1e-15; Julia (two usable start points of four) agreed at 89-100% to 1e-13, 73-87% at 1e-14, 14-71% at 1e-15. The floor was `FLOOR_STEPS` of the 2^-48 fixed-point grid, 7.1e-12; the view's center is a double (the reference orbit and the pixel offsets come from it; the grid only places the exact fallback for glitched pixels), so it is now the double-center formula with a minimum of `PHOENIX_MIN_SCALE` = 1e-13: 2.2e-13 at |c| = 0.5, about 30 to 70x deeper than before. Verified: lint; `phoenix-depth` and `zoom-floor` specs on both projects; `default-identity.mjs` zero differing pixels; 586 specs (app, dual, info-card, places-sheet, styles). Not verified: a real iPhone; a hand zoom through the Phoenix places at the new floor (the measurement is of the shader's counts, not of a drawn picture); other Phoenix boundary points beyond the three measured.
- Longer-center places (1.64.1, 2026-11-03, user approved after the explanation): `places.js` `GOLDEN_RE`/`GOLDEN_IM` are 1/sqrt5 and 2/sqrt5 to 160 digits (integers; 2*re = im exactly, 5*re^2 within 1e-160 of 1), used by Golden Glide and Golden Dive; `view-math.js` `exactFromDecimal`, `decimalDigits`, `exactFromPlace` read a place's text into the exact center (fraction length from its digits and its scale, 576 bits for 160 digits; a place with 18 or more significant digits qualifies, so Spiral Cluster's 19-digit text now lands exact too, harmless at 1e-3); `teleport.js` `flyTo` sets the pair on landing and clears any stale pair on every other landing (fixes the "flight lands on the same double as a stale pair" leftover); `tests/cases.mjs` reads the two constants. Verified: lint; `long-centers.spec.mjs` (5) on both projects, including a 1e-60 zoom on from Golden Dive that matches the integer-computed point (the doubles alone give a flat view); `default-identity.mjs` zero differing pixels; 524 specs on both projects (long-centers, apollo-exact, exact-center, zoom-floor, app, dual, share-menu, info-card, places-sheet, cold-open). Not verified: a real iPhone; the spiral dive's frames still run on doubles until the landing snaps to the exact center.
- Apollonian gasket from an exact center (1.64.0, 2026-11-03, user asked after a measurement): `apolloFrameExact` runs the chain of inversions with `w0` as a BigInt at `exactBitsFor(scale)` bits (K, L and the choice of dual disk stay doubles; `apolloFrame` takes an optional `exact`), used whenever the view has an exact pair or scale is below `exactRender.apollo` (1e-13); below `exactRender.apolloRescale` (1e-15) the shader gets K*scale and L*scale and applies them to uv*2 (`u_apoRescale`), so nothing overflows float32; the floor is `APOLLO_MIN_SCALE` = 1e-100 (a choice, not a limit). Measured first (scratch script): at Golden Dive's exact point the chain takes 27 steps at 2.8e-12, 46 at 1e-20, 118 at 1e-50, 370 at 1e-200 (cap 100000), 0.03 to 0.1 ms per frame at 192 bits, and w0 is right to the last double with about log2(1/scale) plus a few dozen bits; today's double chain is wrong (error 1.3) from about 1e-20. Verified: lint; `apollo-exact.spec.mjs` (11) on both projects; a view moved 60 px equals the original 60 px over at 1e-20, 1e-50, 1e-100 (mean 0.004 to 0.006, over16 0; the code before the change draws one flat color there); the exact chain matches the float64 chain at four shallow views; Golden Dive, Jacob's Ladder and Triangle Dive draw the same through the exact+rescaled path (mean 0.0002 to 0.03); `default-identity.mjs` zero differing pixels; 608 specs on both projects (apollo-exact, zoom-floor, exact-center, digit-infinite, deep-exact, app, dual, share-menu, info-card, places-sheet); a contact sheet of the five depths (1e-3 to 1e-100) looked sharp. Not verified: a real iPhone, a view that sits on a tangency point (its chain stops early at any depth, as before).
- Infinite zoom for Carpet and Gasket (1.63.0, 2026-11-03, user asked for it; built by an agent in a worktree, merged in `d65f9c8` from `651ddc5`): the exact BigInt center now grows with the zoom (`state.ef` fraction bits, `exactBitsFor(scale)`, 192 bits as before until scale 2.9e-39, then 64-bit steps), `digitCellFrame` reads the cell address and holes from its digits (Gasket from the bit strings, Carpet from base-3 digits), no level cap, and the floor is `DIGIT_MIN_SCALE = 1e-300` (levels 628 Carpet, 997 Gasket); links carry `ex`/`ey` at a length set by the link's own `s` (scales above 2.9e-39 are identical to 1.62.x links; older builds open deeper links at the double), Back keeps `ef`. Verified: lint; `digit-infinite.spec.mjs` (28) and `zoom-floor.spec.mjs` updated; a view moved 60 px equals the original 60 px over at 1e-20, 1e-40, 1e-100, 1e-200, 1e-290 (mean 0 to 0.0013; the pre-change code fails at 1e-20 and is flat from 1e-40); the 11 Carpet and Gasket places draw identically through the exact and float64 paths; `default-identity.mjs` zero differing pixels; on main after the merge 611 specs passed (digit-infinite, exact-center, deep-exact, deep-exact-edges, zoom-floor, app, dual, share-menu, info-card, places-sheet) on both projects; on the user's iPhone 15 (Release build, 2026-11-03) Carpet and Gasket were perfect past 1e15x and the phone stayed cool. CPU cost of the frame: 0.005 to 0.045 ms at 1e-290 on the Mac. Not verified: speed and battery during a long live drag at 1e-290 on a phone; `webkit-desktop` and `chromium-iphone15` projects; the whole visual suite.
- Exact view center and zoom floor (1.62.4 to 1.62.8, 2026-11-03, user chose the expensive fix, Mandelbrot family first): deep views keep their center as a BigInt pair (`ex`/`ey`, 2^-192 units) beside the doubles, moved by offsets in pan, pinch, wheel, box zoom, keys and Back (`ba9c60f`, 1.62.4); share links carry `ex`/`ey` only when the doubles aren't the center, old links open at their doubles, bad pairs are ignored (`0df5b47`, 1.62.5); below scale 1e-13 the reference orbit and the 8x8 reference search run in BigInt (`ade1e90`, 1.62.6); a zoom floor through `limitScale`: escape-time family 1e-30, Apollonian/Newton/Phoenix two last-digit steps, Nova as before, Carpet and Gasket none yet (`d3c6d10`, 1.62.7); the dual button carries the exact center (`21f8498`, 1.62.8). Verified: lint; new specs `exact-center` (14), `deep-exact` (22), `deep-exact-edges` (13), `zoom-floor` (5) on `webkit-iphone15` and `chromium-desktop`; a view moved N pixels equals the original N pixels over (mean 0.002 at 1e-16 to 1e-33, 9.4 with the exact path off), `default-identity.mjs` zero differing pixels; every place above its floor. Float32 deltas were measured clean to 1e-33, grainy by 1e-36 (Mac). Not verified: a real iPhone (speed, heat, denormals), the float64 oracle below 1e-13 (it cannot go that deep), the whole visual suite.
- Halo and Paper cut Looks (1.60.0, 2026-11-03, user approved after seeing mock-ups and the build's screenshots; branch merged in `fdaefb8`, version in `b9bec8c`): both share Relief's compiled program (style codes `ha` and `pc`; no new program, `warmColorVariants` unchanged); Halo glows the interior from log(1+|D|) over the palette (the cardioid and bulb shortcut is skipped for this style only), with a different formula for Julia sets (D decays and underflows in float32, so the glow comes from the iteration where |D| falls below 1e-3), and is greyed on the Burning Ship and Celtic (their non-escaping regions saturate D and draw flat white); Paper cut layers every 2 iterations of the smooth count, mixed with cream, with a shadow from the gradient of the count gated against the upper-left light. New Looks: Halo on Inferno, Paper cut on Twilight. The Color sheet's Looks grid is 5 plus 4 on phones and the Custom tab's style row wraps to two rows, so the sheet is taller (354 px, 41.5% of an 852 pt screen, up from about 324 px); a sheet-height guard went from 40 to 35 percent. Verified: lint; `default-identity.mjs` zero differing pixels in every state, on the branch and on main; the float64 oracle within its gates on calm views (higher on chaotic and deep views; Halo "fails" on Ship, Celtic and Armada because it draws Smooth there by design); 480 specs passed on main on all four setups after re-recording the two Color sheet baselines (looked at them) and writing the eight new style baselines. Not verified: iPhone cost and battery. Halo's cost: about 99 ms against Relief's 21 ms at the Mandelbrot opening view (the cardioid and bulbs now run to `maxIter`) and about 1,191 ms against 938 ms at deep Seahorse, measured at heavy machine load, so rough. Halo at the deep Rabbit Hole place (1e-3) is one flat orange fill.
- Coherence pass from the 2026-11-03 design review (1.61.1 `3253f7a`, 1.62.0 `b56ef24`; user asked for the recommendations to be implemented): the pattern shapes' color button opens the same Color sheet as the fractals (`color-sheet.js`: `openSolidColorSheet`, a five-by-two grid of the ten flat colors with Done), so `#colormapMenu` and its code, CSS and element are gone; the sheet's arrow keys no longer pan the view behind it (`rovingRadios` stops propagation, which also fixes the fractals' palette grid); the pattern shapes' info cards no longer show "Browse places" (they have no places), which also lets a description fit on the landscape phones; the info card's technical line breaks between readings instead of inside one; sentence-case "Chaos games" and "Corner rules"; the Places row says "named places to dive into"; the info and dual buttons are named "Info card" and "Dual view"; the palette-only fractals' color button says "Choose palette". Verified: lint; on `webkit-iphone15` and `chromium-desktop`, 552 specs after 1.61.1 and 1103 after 1.62.0 (plus the color specs on the way), the old menu's tests rewritten for the sheet. Looked at the new sheet on a 393 px phone next to the palette-only sheet. Not verified: real iPhone, VoiceOver on the new sheet, landscape by eye (the specs check fit on 852x393 and 667x375). Then 1.62.1 (user chose the corner-brackets icon, option A of seven mocked in the real toolbar, and a rename): the Reset button is now four corner brackets named "Show whole shape" (it was a house named "Reset view"), in all six toolbar rows; 551 specs on two setups. Left open, needs a decision: the fractal picker has no title or Done while the sheets do.
- Penrose tiling by deflation (1.61.0, 2026-11-03, user approved the merge after seeing the screenshots; merged in `f6d5208`, version in `af8e5e7`): finer tiles as you zoom, down to about 1e15, instead of one fixed patch. `penrose.js` is rewritten to cut Robinson triangles from the viewport (the L-system walker `PENROSE_TILING` is gone from `lsystem.js`); the level follows the depth slider (now 1 to 8, default 5) plus the zoom, levels cross-fade (Play fades from level to level; reduced motion snaps); the exact view center is kept as a 128-bit fixed-point origin plus a small double offset, so deep views stay exact (`ox`/`oy` in the view, `ex`/`ey` in links); deep views color thick and thin rhombs by tile type. Links: new ones carry `pv=2`; 1.59.0 links open framed on the whole star with depth 9 read as 8. The info card says "Each level cuts every tile into smaller ones, so the tiles get finer as you zoom in." and shows "(+N from zoom)". Verified: lint; `penrose.spec.mjs` (29 tests, including drawn edges against an independent 256-bit reference at 8 places from 1e5 to 1e15, worst error under 0.02 px); on main after the merge 382 specs passed on `webkit-iphone15` and `chromium-desktop` (penrose, vector, info-card, share-menu, solid-colors); `default-identity.mjs` zero differing pixels; the `mode-penrose` baseline re-recorded on all four setups after looking at it. Not verified: raster speed and memory on a real iPhone (headless software canvas: a full depth-5 frame zoomed 180 to 525 ms, a gesture frame 30 to 55 ms; dropping the glow above about 20k triangles is the fallback), real multi-touch, real Safari. Every tile edge is drawn twice (once per rhomb); deduping would roughly halve the segments but needs the P3 edge-arrow rule, not derived. A frame caught mid-fade can look fuzzy.
- Penrose Tiling (1.59.0, 2026-11-03, user chose it after seeing the L-system picture; merged in `d72825f`, version in `71c8750`): a `penrose` entry in `LINE_CURVES` (new `penrose.js`, `PENROSE_TILING` in `lsystem.js`), depth 1 to 9, in "Build level by level"; the L-system is the three-source-verified one (1,780 segments at depth 4, 7,920 at depth 5; 995 distinct edges at depth 5, which is what is drawn), colored by distance from the star's center (by angle left a hard seam, by edge direction gave five near-identical colors). Verified: lint, the new `penrose.spec.mjs` (68 of 68 on the branch) and 747 specs on main on two setups. Known limitation: the L-system grows a patch outward with same-size tiles, so zooming only magnifies the same rhombs and never adds finer tiles; a deflation-based prototype (a throwaway page in the git-excluded `scripts/penrose-deflation-spike/`) was started 2026-11-03 to see whether finer tiles at zoom are worth integrating. Not verified: iPhone performance at depth 9 (up to about 50k edges).
- 24 new places (1.58.0, 2026-11-03, user approved the top 24 of a research agent's 40; branch merged in `1694b25`, version in `714621c`): Mandelbrot 18 to 24, Burning Ship 9 to 11, Tricorn 10 to 11, Julia Rabbit 2 to 5, Carpet 5 to 7, Gasket 4 to 5, Apollonian 6 to 9, Newton 4 to 6, Celtic 7 to 8, Multibrot 7 to 8, Phoenix 6 to 7, Julia Spiral 5 to 6 (total 107 to 131, so the picker's Places row reads 131), each with a thumbnail; coordinates were found by the research agent's CPU renders and each place was flown to in the real app at 390x844 and matches (Triangle Dive's spiral flight works, 7.7 s, lands upright). Only "Feigenbaum Point" is an established name; "Starfish" is from memory of Wikipedia's gallery, unverified. The user will review Zipper (a Gasket view that is mostly flat purple); the research agent's reserve "Twin Lace" (0.5, 0.5, scale 0.35, rotation 0.5236) looked better. 16 reserve places were not added. Not verified: phone performance and the float32 deep views on a real device. See STRATEGY.md for the store-listing follow-up.
- Corner Rules, restricted-corner chaos games with zoom (1.57.0, 2026-11-03, user idea and approval 2026-11-02; branch merged in `4370fcc`, version and changelog in `5913170`): one "Corner Rules" entry, last in the Chaos Games picker group, deals a rule on each tap from a shuffled list (the first deal in a session is always the diamond, so the thumbnail is stable; it never repeats the rule on screen), with an "Another rule" button beside Play; seven rules (square: never the same corner twice, never the next clockwise, never the opposite, after a repeat no neighbour; hexagon never the opposite; pentagon never the same twice, never the next). New `corner-rules.js` holds the rules as small finite-state machines and a graph-directed zoom sampler (a node is a map plus a state), so zooming keeps the true shape at any depth, overlapping copies included; hooks in `ifs.js`, `fern.js`, `modes.js`, `share.js` (`ru` field), `chaos-run.js`, `hud.js`, `compass-ui.js`, `index.html`, `state.js`, `vector-interaction.js`, `fractal-defs.js`, `sw.js`, `app.js`; the rule name shows in a chip and on the info card; Play shows barred corners as faint rings. Verified: lint; the agent's `corner-rules.spec.mjs` on all four setups (it broke the sampler on purpose twice and the checks caught both); the sampler against the real game by total-variation distance and reachable support to 16,384x; and on main after the merge 1,085 specs passed on `webkit-iphone15` and `chromium-desktop` (corner-rules, app, vector, places-sheet, share-menu, info-card, dot-replay, dot-colors, shape-finish, solid-colors, sw, review-prompt). The `mode-corners` picker baseline was recorded on all four setups after looking at it. Not verified: phone performance and the Play run on a real device; the full suite has not run. The Wikipedia link row is in the local `docs/learn-more-links.md`.
- First-visit work (1.38.0) checked on real devices (user, 2026-11-02: "completed, it works"). Earlier checks: the app side in the simulator 2026-10-20 (iPhone 17 Pro and iPad Pro 13", build 258: whole set, no flight, no card, iPad toolbar unchanged, no crash); the cold-open flight on a phone 2026-10-23. The welcome card's placement, Back on a share link and the link preview in Messages and Slack, which were listed open on 2026-10-23, are covered by this sign-off.
- Longer chaos-game demo (user, 2026-11-02: "I think this is done"; shipped in 1.55.0, 2026-11-01): Play on the dot shapes is a run of about 15 s with 100 jumps shown one at a time and the path behind the dot, then it builds the picture and hands over to the normal render; panning, zooming or turning no longer ends a run; a points-and-coverage counter shows during a run and on the info card; each run has a six-digit seed on the info card and in links made after a run, which replay the same run (not under reduced motion). The spec's last step, polygon variants (hexagon, carpet), was not part of 1.55.0 (the pentagon came in 1.54.0); more polygon and restricted-corner shapes are under the Chaos Games items under Next.
- Rating prompt in the iOS app (1.56.0, 2026-11-02, user approved the build and the trigger the same day): the app asks iOS to show its rating sheet once, after the app was opened on 3 different days and the person saves an image to Photos or completes a share (a dismissed share sheet doesn't count). Pieces: `RateAppPlugin` (Swift, in `FractalBridgeViewController.swift`; `AppStore.requestReview` on iOS 18+, `SKStoreReviewController` before), `Platform.requestReview()` and a boolean result from `Platform.share()` in `platform.js`, the decision logic and its few dates in localStorage in `review-prompt.js` (3 days, at least 120 days between asks, asks 2 s after the save, never on the web), the hook in `share-menu.js`, `review-prompt.spec.mjs` (decision, storage, web no-op, the app flow with stand-ins). Verified: lint, the quick tier (29 passed across the new spec, `share-menu` and `sw`), and an Xcode simulator build (compiles). NOT verified: the real sheet (iOS only shows it from the App Store build or a Debug build; TestFlight never shows it), so check it on a Release or Debug build on the phone; the whole suite has not run — `d320353`
- Places sorted by depth (1.55.6, 2026-11-02, user idea and request the same day): `placeGroups()` in `places-sheet.js` orders each fractal's places shallowest to deepest by view scale (a larger scale is shallower; stable for ties), with no control, since the user asked for the sort itself. `places-sheet.spec.mjs` checks the order, and the sheet's baseline was re-recorded after looking at the new image (all four setups). The same commit renamed the picker group "Dots that build up" to "Chaos Games" (a label in `PICKER_LAYOUT` only). Not built: a flat list across fractals and a toggle between orders. Verified with lint and the quick tier (452 passed); the other two setups' baselines for the places-sheet image were re-recorded but the full suite has not run — `387eb4e`
- ES-module conversion and the first file splits (2026-10-30 to 2026-11-01, from the "why not just do the whole conversion?" discussion): every app file is a module (1.53.1 to 1.53.11; `index.html` loads only `app.js`), shared `let`s are written only through setters in the declaring file, `test-hooks.js` exposes every export to the tests when `navigator.webdriver` or `localStorage["fractalAtlas.test"]` is set, `npm run stamp` versions the imports, and `scripts/check-test-globals.mjs` (in lint) checks it all. Then splits: `view-math.js` and `hud-format.js` (1.53.14, 1.53.15), `color-styles.js` with the renderer no longer importing `state.js` (1.54.1), the box-zoom flags into `interaction.js` (1.54.2), `hudVisible` into `compass-ui.js` with `showHud()` (1.54.3), the settle timer with `cancelSettle()` (1.54.4), `paneState`/`paneHistory`/`paneRenderer`/`shownPane` (1.54.5), `share-menu.js` (1.54.6, with `share-menu.spec.mjs` first), `hud.js` and `deepZoomEligible` into `deepzoom.js` (1.54.7). Also: picker thumbnails precached for offline use (1.53.12) and `render_thumbs.mjs` fixed for the test flag.
- Fractal picker regrouped (1.44.1, 2026-10-24, approved the same day): a display-only `PICKER_LAYOUT` in `fractal-defs.js` (sections "Zoom forever" and "Watch it grow", each with titled groups) replaces `FRACTAL_CATEGORIES`, and the loop in `compass-ui.js` builds the picker from it. Zoom forever = Mandelbrot family (Mandelbrot, Burning Ship, Tricorn, Celtic, Multibrot³, Phoenix), Julia sets (Spiral, Rabbit, Dragon, Phoenix; no longer below the fold), More to zoom into (Newton, Apollonian, carpet, gasket); Watch it grow = Build level by level (Koch, tree, Hexaflake, dragon, Hilbert, Gosper, arrowhead) and Dots that build up (fern, Sierpinski triangle, Lévy, Vicsek). The Hexaflake went under "level by level" instead of "dots" as first proposed, since 1.43.0 draws it as exact hexagons by level like the tree. `category`, `FRACTAL_CONFIGS` order and every share-link key are untouched; no label tweaks. The new `app.spec.mjs` test checks every fractal and mode appears exactly once, in `PICKER_LAYOUT` order, on all four projects. Looked at on a 390 px viewport in headless Chromium, not on a phone. The Places sheet's sections should follow this order — `631eda8`
- `app.js` split into plain scripts (2026-10-23, from step 2 of the proposed order of work): a pure move along the section headers into plain scripts (the commit says 10; among them `places.js`, `deepzoom.js`, `renderer.js`, `state-colors.js`, `render-layout.js`, `modes.js`, `interaction.js`, `compass-ui.js`, `teleport.js`, `colormap-picker.js`, `color-sheet.js`, `share.js`), section order kept; `app.js` is now 158 lines. `deepzoom.js` has no DOM references and needs only `FTYPE` and `PHOENIX_P` from `configs.js` (checked 2026-10-24), so it can move into a Web Worker once the reference-orbit callers are made asynchronous — `b7fb4a4`
- Curated palettes and an upright Burning Ship (1.44.0, 2026-10-24, from the "Curated palettes" and "Burning Ship looks like a ship" items): (1) a default palette per fractal, `defaultColormap` in `FRACTAL_CONFIGS` (Burning Ship Fire, Tricorn Classic, Multibrot³ Viridis, Phoenix and its Julia set Hot, Carpet Glacier, Gasket Plasma; the rest stay Inferno), chosen from contact sheets of every fractal's opening view and places in each palette; and an optional `colormap` per Surprise-me place. `colormapPicked` in `state-colors.js` (in memory only, like `fractalMemory`, which keeps views and not palettes) is set by a palette pick in the Color sheet, a Look other than Default, or a share link naming a palette other than the fractal's own default; until then `applyDefaultColormap` (from `selectFractal` and `flyTo`) follows the fractal or place, and the Default Look and Reset (`releaseColormapPick`) put the defaults back. The Default Look's palette is the default of what's on screen (`lookPalette`). Links keep the palette they name (a link without `cm=` is Inferno, as before). (2) The Ship's classic upright picture: `state.flipY` (from `config.flipY`) mirrors the view's imaginary axis last, after the rotation, in `main()` of the escape-time shader (`u_flipY`), `screenToComplex`/`centerForAnchor`, the perturbation reference grid (`chooseReference`) and the deep-zoom gesture preview; the iteration is untouched and `cx`/`cy` stay real coordinates, so Back history carries the flag and links are unchanged except `fl=1`, written only when on and read only for a fractal that has it (old links open exactly as before: `scripts/default-identity.mjs` proves the old path pixel-identical). The places moved from a half turn to rotation 0 (Stingray to `Math.PI - 2.5`) and now look like the classic picture, mirrored left to right from before; Surprise me from an old-link view takes the upright picture at takeoff. The Julia pane is symmetric top to bottom and takes no flag. Checked against the float64 oracle with `oracle-compare.mjs --flip 1` (ship, armada and deep twinships in six styles, within the gates and equal to the old orientation's numbers), 29 identity states with the 26 earlier ones at zero differing pixels, `palettes.spec.mjs` (new) and the covering specs on all four projects. Baselines re-recorded for the Ship, Tricorn, Multibrot³, Phoenix, Julia Phoenix, Carpet and Gasket (and their places) and the Ship's style baselines; the style specs now pin Inferno. Not checked on a phone. What's left is the "Palette follow-ups" item under Next — `8033d0d`
- Hexaflake rebuilt as exact hexagons (1.43.0, 2026-10-24, user idea): `hexaflake.js` draws a hexagon as seven at 1/3 scale (middle plus six at 2/3 out, 60° steps) level by level, the way `pythagoras.js` does squares, on its own canvas and control row (`hexaflakeCanvas`, `createHexaflakeView`, `hexaflakeAdaptive`, plain reference `hexaflakeHexagons`): depth slider 0-6 (default 4) with the play and hold-and-slide buttons, only the hexagons on screen at any zoom (disc culling, ~1 canvas px leaf limit, 40,000-hexagon budget, a 3 px pass during drag and pinch, levels added past the slider by zoom), flat shade per level drawn back to front (hue turned 18° and brighter each level, so the gaps show the parent), levels hidden behind a hexagon that covers the canvas are skipped and hexagons over 4,000 px are clipped to the canvas (Canvas2D is float32). Twist, Back, Reset, info card, Save/Share and the color picker work as for the tree. `m=hexaflake` links keep working: 1.42.0 links (points value `n`, no depth) open on the same part of the shape and the depth `dp` is written only when it isn't the default; the chaos-game entry is gone from `fern.js`. Tests: the four IFS hexaflake tests in `vector.spec.mjs` replaced by seven for the new geometry, plus hexaflake cases in the shared adaptive, culling, zoom, twist, pinch and extreme-view loops; `mode-hexaflake` baseline re-recorded. Not checked on a phone. Left from the old item: the Sierpinski triangle (3 maps) and Vicsek (5) could move onto the same engine — `d14f6d1`
- Hexaflake (1.42.0, 2026-10-23, user idea): an IFS mode on the chaos-game engine (`fern.js`), seven maps at scale 1/3 (one in the middle, six around it); points slider, share links (`m=hexaflake`), twist and zoom as for Vicsek; picker thumbnail, learn-more row, four tests in `vector.spec.mjs`. Also fixed `render_thumbs.mjs` (`Page.enable`), which let the welcome card into thumbnails. Not checked on a phone yet — `d818399`
- Pythagoras tree shading (1.41.1, 2026-10-23, user idea): squares lit from the upper left by their lean, brighter from trunk to twigs, every other level's hue turned 45°; the light stays fixed on screen under a twist. `TREE_SHADED` in `pythagoras.js` switches back to the flat look. About 10% more frame time at depth 12. Checked by the user on a phone — `667576b`
- Relief (1.41.0, 2026-10-23, user request): a seventh color style and Look (Classic palette), the fractal lit as an embossed surface. Lambert shading (height factor 1.5) of the unit gradient of the escape potential, `J^T z` from the derivative Edge glow tracks, times the smooth palette color; the light is fixed at the upper left of the screen (the gradient is turned by `u_rotCos`/`u_rotSin`). It is Edge glow's compiled variant (`COLOR_VARIANT 1`) with `u_style == 6`, so the default program is untouched (`scripts/default-identity.mjs`: 26 states, zero differing pixels), the same fractal types (no Phoenix), share-link code `rl`. Oracle (`oracle.py` `relief`): blurred difference 0.16-1.29 over the twelve gate views. Known look, from the prototype review: bland on shallow views, striking at mid and deep zoom; the Ship and Celtic show creases where their folds are (the potential's gradient really is discontinuous there). Not done: a gloss highlight, a light-direction control, a phone cost measurement (it should cost about what Edge glow does). The sheet's style row went to 11 px so seven fit at 360 pt, and the sheet's width cap from 460 to 540 px so seven Looks share a row on an iPad. `default-identity.mjs` now pins 16 passes (its reference predates the 8-pass default and it failed on clean HEAD) — `4b5fb4f`
- Flight changes of 1.40.2 and 1.40.3 reverted (1.40.4, 2026-10-22): the owner reported they did not work. `app.js` and the tests are identical to 1.40.1's; the CHANGELOG keeps both entries and adds 1.40.4. What was tried and what is still open is the item under Next, "Flight time and detail during deep flights" — `2ff4c0d`
- Color styles on for everyone (1.40.0, 2026-10-22): the styles flag is gone (`stylesEnabled`, its reload helpers, the flag-off tests and the diag panel's Styles button); the Color sheet, Looks, Custom tab and the `st`/`cd`/`co` share-link fields are always on. The `## Unreleased` notes became the 1.40.0 entry. Phone checks passed first (flags on in Safari and in the app: costs per style at the opening view and at depth, drags, flights, VoiceOver); results are in the telemetry item above. Not yet in an App Store build — `70183b0`
- Color sheet fix pass, behind the styles flag (2026-10-22), from an independent design review and the owner's answers: the Looks are a grid with every tile on screen (four across on a phone, one row on an iPad) and both tabs are the same height, so the tab bar never moves; Classic and Inferno are palettes, so the Looks start with a Default tile (Smooth on Inferno); one set of plain names everywhere (Smooth, Bands, Edge glow, Stripes, Orbs, Rays) with the slider renamed Repeat, display names only (the `st` ids and share links are unchanged); a plain tap on the fractal closes the sheet while a drag or pinch leaves it open, and the closing tap doesn't also glide in dual view; on Newton, Carpet, Gasket and Apollonian the color button opens the same sheet with only the palette grid; Phoenix shows the style it draws; Reset, slider values on screen, roving focus in the radio groups, Done named "Done", the scroll position kept on a rebuild, the color button's name includes the Look; a 360 pt phone, landscape, 1.5x and 2x text and a centered iPad sheet; thumbnails re-rendered for the six Looks (94 KB). The Looks are about 38% of an 852 pt screen, both tabs, up from the 20% and 30% of the first rework, because Reset's 44 pt row and the grid's two rows share one height. `scripts/default-identity.mjs`: 26 states, zero differing pixels — `29febe2`, `799750c`
- Coloring Style selector and Looks, built but dark (2026-10-21): behind `localStorage["fractalAtlas.styles"] = "1"` (or load the page with `#styles`; `#styles=0` turns it off), so the live output is unchanged (`scripts/default-identity.mjs`: 26 states, zero differing pixels). Six styles on the escape-time fractals: Smooth, Bands, Glow (exterior distance estimate, `dz/dc` as a 2x2 matrix for the folded maps, saturated at 1e30 for float32), Stripes (windowed stripe average, frequency 4 from x and y with no trig) and the Point and Cross orbit traps (offered up to ~1,000x deep, they color the interior); each costly style is a compiled variant of the escape-time shader, so the default program's code is untouched. Phoenix has Smooth and Bands; Newton, Carpet, Gasket and Apollonian keep their own schemes. A Color sheet on the color button (Looks tab: Classic, Inferno, Edge glow, Iteration bands, Stripes, Orbit trap, Cross trap with `icons/looks/` thumbnails from `scripts/render_look_thumbs.mjs`; Custom tab: style, palette, bands and shift), share-link fields `st`/`cd`/`co` (lenient, written only when not the default) and info card lines. Checked against a float64 oracle (`scripts/oracle/oracle.py`, `scripts/oracle-compare.mjs`; gates in `tests/README.md`) including the perturbation path, and by `styles.spec.mjs` and `color-sheet.spec.mjs`. Phone checks and flag removal are the item under Next — `acb3c1d`, `d37c39c`, `7592bdc`, `114a6f0`, `ce33ccb`, `0b9638a`, `45711eb`, `0677b34`
- Viewport-adaptive Koch, tree and dragon, with the vector-mode speedups (1.39.0): the three views build only what's on screen each frame (a piece wholly off screen stays a chord or is skipped; pieces under a pixel stay straight; a vertex budget bounds the frame), and add levels beyond the depth slider as you zoom, so detail no longer runs out at ~13× / 2× / 1×; the info card shows "(+N from zoom)". The dragon is drawn from its two-map form (matches the L-system curve to 4e-15 at depths 0-16); Koch/dragon/other line curves use typed arrays and stroke in groups of 256 segments, the tree fills in groups of 32 squares (Canvas2D cost per path grows faster than its size). Hilbert, Gosper and arrowhead share the faster stroke path. `tests/visual/vector.spec.mjs` checks geometry against the old generators, that culling changes no pixel, zoom detail, twist at depth and nonsense views. Left open: a lighter level of detail while a gesture is in progress (the dragon at depth 16, zoomed 4×, is the heaviest frame measured) — `3232da9`
- First-visit experience on the web and link previews (1.38.0): a first web visit with no share link flies from the whole set to one of five showpiece Mandelbrot places (Seahorse Valley, Mini Mandelbrot, Elephant Valley, Double Spiral, Sunburst Fan) with the info card open; a dismissible welcome card (name, one line, App Store link, Privacy · Support; shown every web visit until closed, never in the app); `<meta name="description">` plus `og:` and `twitter:card` tags with `icons/og-image.jpg`; the opening view reads "The whole shape"; on website windows 900px and wider the toolbar rows sit in a centered 760px column (web only, `html.web`, so the iPad app is unchanged). Visit state lives in `Platform.welcome` (`platform.js`); `tests/visual/cold-open.spec.mjs` covers the three paths, and the visual suite, store-screenshots and thumbnail scripts pre-set the storage keys. App checked in the iPhone and iPad simulators (no flight, no card, iPad toolbar unchanged); the phone checks and the info card's new line on screen in the app are still open (see Now) — `189e823`
- 1.37.0 (build 245) submitted for App Review 2026-10-19 with the listing copy updated to 24 fractals and 98 places in English and French (`listing/copy/listing-1.37.0.md`), Spanish added (`copy/listing-es.md`), What's New covering 1.30.1–1.37.0, the new `2-picker` screenshots (iPhone 6.3", iPad 13") and the app preview videos. Screenshots and promo images now come from `scripts/store-screenshots.mjs` — `82cf394`
- Apollonian gasket (1.36.0, user idea 2026-10-17): the (−1, 2, 2, 3) packing by iterated inversion in its four dual circles, colored by inversion count (mirrored cycle of 24, offset 6 so Inferno's big disks are purple, not black; capped at 500 per pixel, capped pixels get the colormap's average). Deep zoom composes the inversions the whole view shares into one Möbius map in float64 (`apolloFrame`); checked sharp at 1.4e15× in headless Chrome. Info card shows the integer curvature of the circle under the center when it's visible. Six Surprise-me places, five of them repelling fixed points of three-inversion words (they repeat every φ⁶ ≈ 17.94×), including the 4.7e-12 spiral dive Golden Dive. Not yet checked on a phone. The listing's "23 fractals" is now 24 — `9e5abfe`
- Phoenix deep zoom (1.34.0): float32 perturbation against one float64 reference, and a pixel that glitches continues in exact fixed point from Z[m] + d. 100% agreement with float64 at 1e-9 and ~0.3 s full screen on an iPhone 15 in the spike (`scripts/precision-spike.html`, not committed); all-fixed-point was 2–4 s and its long draws lost the phone's WebGL context. Exact steps capped at 600 per pixel, 4 refinement samples, self-test on first use. Checked by the user on their iPhone 15 (website, 1.35.2): Phoenix and Newton (incl. near the central star, 1.35.1) both sharp at depth — `362a355`
- Newton deep zoom (1.33.0), in place of the "Newton perturbation" item: away from the origin, deep views render in exact 16.48 fixed point (WebGL2 uints) and stay sharp to ~1e-11 (float32 blurred past ~1e-4). ~0.2 s per full-screen pass on an iPhone 15; self-tested on first use, float32 fallback. The renderer now asks for WebGL2 first — `732e5ca`
- Surprise me on every zoom fractal (1.31.0): 21 places from the 2026-10-15 research on Celtic, Multibrot³, Phoenix and the Rabbit, Dragon and Spiral Julia sets. Three of them are spiral dives (Rabbit Hole, Into the Eye, Into the Galaxy) that land at 1e-3, so the whole flight renders live. Auto detail now follows the zoom during spiral dives. Earlier the same day: Pole Star on Newton (1.30.1) and spiral-out on fractals with one place (1.30.2) — `7155a63`
- New App Store screenshots for 1.25.0 (2026-10-15): six captioned shots per device in git-ignored `listing/1.25.0/` (iPhone 6.5" 1284x2778, iPad 13" 2064x2752), rendered from the web app in headless Chrome: Mini Mandelbrot with the legend card, the picker, Spiral Julia in dual view, Lace Tricorn, Armada, Pythagoras tree with play. Sierpinski deep zoom was tried and dropped: flat-looking at depth. Re-rendered 2026-10-15 for the 1.30.0 toolbar in `listing/1.30.0/`. What's New and a copy review are in `listing/copy/whats-new-1.30.0.md`; the full paste-ready English and French listing is `copy/listing-1.30.0.md`. Upload with the 1.30.0 release
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
