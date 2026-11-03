// Sharing: share-link encoding and parsing, and applying a link (the share menu and the share image are
// in share-menu.js). Needs the state, render-layout, modes, teleport.js (cancelTeleport) and
// colormap-picker.js; applyShareHashFromUrl and applyShareLink are called from init in app.js.
// An ES module: every top-level declaration is exported (test-hooks.js and app.js rely on it) and
// the other converted files' names are imported, with the same ?v= query everywhere (npm run stamp).
import { Platform } from "./platform.js?v=1.62.0";
import { COLORMAPS, SOLID_COLORS } from "./colormaps.js?v=1.62.0";
import { FRACTAL_CONFIGS } from "./configs.js?v=1.62.0";
import { LINE_CURVES } from "./dragon.js?v=1.62.0";
import { Diag } from "./diag.js?v=1.62.0";
import { EXTRA_MODES, isCurveMode, isIfsMode } from "./fractal-defs.js?v=1.62.0";
import { limitScale } from "./deepzoom.js?v=1.62.0";
import { COLOR_BANDS_RANGE, STYLE_LINK_CODES, colorStyle } from "./color-styles.js?v=1.62.0";
import { HEXAFLAKE_DEFAULT_DEPTH, HEXAFLAKE_MAX_DEPTH, currentName, dragonState, dragonView, dualActive, els, fernState, fernView, hexaflakeState, juliaState, kochState, mainState, mode, treeState, vectorColors } from "./state.js?v=1.62.0";
import { colormapIndex, colormapIndexNamed, defaultColormapName, setColorStyle, setColormapIndex, setColormapPicked } from "./state-colors.js?v=1.62.0";
import { requestRender, updateLUT } from "./render-layout.js?v=1.62.0";
import { normalizeAngle } from "./view-math.js?v=1.62.0";
import { enterDual, exitDual, selectFractal, setCornerRule, setMode } from "./modes.js?v=1.62.0";
import { VECTOR_VIEWS, dragonNav, fernNav, fitVectorView, fittedVectorModes } from "./vector-interaction.js?v=1.62.0";
import { PENROSE_HH_MAX, PENROSE_HH_MIN, penroseCenterFields, penroseClampHalfHeight, penroseParseExact } from "./penrose.js?v=1.62.0";
import { cancelTeleport } from "./teleport.js?v=1.62.0";
import { scheduleSharedRun } from "./pattern-controls.js?v=1.62.0";
import { currentRunSeed, parseRunSeed } from "./chaos-run.js?v=1.62.0";
import { cornerDeal, parseCornerRule } from "./corner-rules.js?v=1.62.0";
import { setFernColor, updateColorSwatches } from "./colormap-picker.js?v=1.62.0";

// ---------------------------------------------------------------- share: links

// A share link is the page URL plus a hash encoding the current view, e.g.
// #v=1&m=fractal&f=Mandelbrot&x=...&y=...&s=...  Numbers use String(),
// the shortest decimal that round-trips to the exact same double -- the
// HUD's rounded display would move deep-zoom views. Julia c is encoded
// explicitly: enterDual only seeds it from the main center; tapping the
// main pane moves it independently afterward.
export function depthStateFor(m) {
  return isCurveMode(m) ? dragonState : { koch: kochState, tree: treeState, hexaflake: hexaflakeState }[m];
}

export function buildShareHash() {
  const p = new URLSearchParams();
  p.set("v", "1");
  p.set("m", mode);
  const put = (k, v) => p.set(k, String(v));
  if (mode === "fractal") {
    const s = mainState;
    p.set("f", currentName);
    put("x", s.cx); put("y", s.cy); put("s", s.scale); put("r", s.rotation || 0);
    // The Burning Ship's upright picture (state.flipY), written only when it
    // is on: x and y are real coordinates either way, and a link without
    // the field (every link made before 1.44.0) opens as it always did.
    if (s.flipY) p.set("fl", "1");
    put("i", s.maxIter); if (s.iterAutoLocked) p.set("il", "1");
    put("cm", COLORMAPS[colormapIndex].name);
    // The color style, only when it isn't the default coloring, so links made
    // without one are unchanged.
    if (colorStyle.style !== "smooth") put("st", STYLE_LINK_CODES.get(colorStyle.style));
    if (colorStyle.density !== 1) put("cd", Number(colorStyle.density.toFixed(3)));
    if (colorStyle.offset !== 0) put("co", Number(colorStyle.offset.toFixed(3)));
    if (dualActive && juliaState) {
      const j = juliaState;
      p.set("d", "1");
      put("jcx", mainState.cx); put("jcy", mainState.cy); // = c; see applyShareState
      put("jx", j.cx); put("jy", j.cy); put("js", j.scale); put("jr", j.rotation || 0);
      put("ji", j.maxIter); put("jb", j.baseScale);
    }
  } else {
    const v = VECTOR_VIEWS[mode][0].view;
    if (mode === "penrose") {
      // The tiling's center is exact (an origin plus an offset): x and y are its doubles, ex and ey (signed
      // hex of the 128-bit fixed point) are written once the view is deep enough for doubles to blur it. pv=2
      // marks the view as the deflation tiling's: a 1.59.0 link, whose view is the old patch's, has none.
      const f = penroseCenterFields(v);
      put("x", f.x); put("y", f.y); put("s", penroseClampHalfHeight(v.halfHeight)); put("r", v.rotation || 0);
      p.set("pv", "2");
      if (f.ex !== undefined) { p.set("ex", f.ex); p.set("ey", f.ey); }
    } else {
      put("x", v.cx); put("y", v.cy); put("s", v.halfHeight); put("r", v.rotation || 0);
    }
    if (isIfsMode(mode)) {
      put("n", fernState.count); put("c", vectorColors[mode]);
      // Corner Rules: which rule's shape this is (corner-rules.js; a link without one opens the default rule)
      if (mode === "corners") put("ru", cornerDeal.id);
      // The seed of the chaos-game run on screen (chaos-run.js), only after one was played and
      // while the view is as it left it; opening the link plays that run.
      if (currentRunSeed()) put("sd", currentRunSeed());
    } else {
      put("cm", COLORMAPS[colormapIndex].name);
      put("c", vectorColors[mode]);
      // The hexaflake leaves the depth out at its default (its links, which
      // 1.42.0 wrote without one, read the same either way).
      if (mode !== "hexaflake" || hexaflakeState.depth !== HEXAFLAKE_DEFAULT_DEPTH) put("dp", depthStateFor(mode).depth);
      if (mode === "koch") p.set("fl", kochState.fill ? "1" : "0");
    }
  }
  return "#" + p.toString();
}

export function buildShareUrl() {
  return Platform.shareBaseUrl() + buildShareHash();
}

// The color style fields of a link (st, cd, co). Unlike the view fields, a
// bad one never rejects the link: it falls back to today's coloring, so a
// hand-edited or newer link still opens. An unknown style code (a newer
// app's), a density outside 0.25-8 and a shift outside 0-1 all fall back;
// the code is looked up in a Map, never an object, so "constructor" is just
// an unknown code.
export function parseStyleFields(p) {
  const code = p.get("st");
  const style = [...STYLE_LINK_CODES].find(([, c]) => c === code);
  const number = (k, lo, hi, fallback) => {
    const raw = p.get(k);
    const v = raw === null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;
  };
  return {
    style: style ? style[0] : "smooth",
    density: number("cd", COLOR_BANDS_RANGE[0], COLOR_BANDS_RANGE[1], 1),
    offset: number("co", 0, 1 - 1e-9, 0),
  };
}

// Parses a share hash into a plain state object, or null if it isn't a
// valid v1 link -- any missing/out-of-range field rejects the whole link,
// so a malformed one falls back to the normal default view.
export function parseShareHash(hash) {
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
        // fl=1 only counts on a fractal that has the flipped picture; lenient, like the style fields.
        flipY: !!FRACTAL_CONFIGS[name].flipY && p.get("fl") === "1",
        cm: cmIndex(), dual: false, color: parseStyleFields(p) };
      if (p.get("d") === "1" && FRACTAL_CONFIGS[name].dual) {
        st.dual = true;
        st.julia = { juliaC: [num("jcx", big), num("jcy", big)], cx: num("jx", big), cy: num("jy", big),
          scale: num("js", (v) => pos(v) && big(v)), rotation: normalizeAngle(num("jr", big)),
          maxIter: int("ji", 50, 2000), baseScale: num("jb", (v) => pos(v) && big(v)) };
      }
      return st;
    }
    if (isIfsMode(m)) {
      // sd (the run's seed) is lenient, like the style fields: a bad one is left out and the link still opens.
      const seed = parseRunSeed(p.get("sd"));
      // ru (Corner Rules' rule) is lenient too: a missing or unknown one is the default rule.
      return { mode: m, ...view, count: int("n", 100000, 4000000), colorIndex: int("c", 0, SOLID_COLORS.length - 1), ...(seed ? { seed } : {}),
        ...(m === "corners" ? { rule: parseCornerRule(p.get("ru")) } : {}) };
    }
    if (m === "hexaflake") {
      // Lenient, because 1.42.0 links (a chaos-game mode) carry a points value
      // "n" and no depth: n is ignored, and a missing or out-of-range depth,
      // like a missing color, falls back to the default.
      const d = p.has("dp") ? Number(p.get("dp")) : NaN;
      const c = p.has("c") ? Number(p.get("c")) : NaN;
      return { mode: m, ...view, cm: cmIndex(), fill: true,
        colorIndex: Number.isInteger(c) && c >= 0 && c < SOLID_COLORS.length ? c : vectorColors[m],
        depth: Number.isInteger(d) && d >= 0 && d <= HEXAFLAKE_MAX_DEPTH ? d : HEXAFLAKE_DEFAULT_DEPTH };
    }
    const maxDepth = isCurveMode(m) ? LINE_CURVES[m].maxDepth : { koch: 8, tree: 12 }[m];
    if (maxDepth === undefined || !Object.prototype.hasOwnProperty.call(vectorColors, m)) return null;
    const minDepth = isCurveMode(m) ? LINE_CURVES[m].minDepth || 0 : 0;
    // "c" (solid color) is optional: links made before 1.10.0 don't have it.
    const colorIndex = p.has("c") ? int("c", 0, SOLID_COLORS.length - 1) : vectorColors[m];
    if (m === "penrose") {
      // pv=2: the deflation tiling's view (center, with an exact one past 1e6x in ex and ey, and a zoom inside
      // the limits), strict like every view. A 1.59.0 link has no pv: its depth and color still count (a depth
      // the slider no longer has, 9, becomes its last), its view is the old patch's, so the app frames the
      // star as Reset does (legacyView).
      const legacy = p.get("pv") !== "2";
      const depth = int("dp", minDepth, legacy ? 9 : maxDepth);
      let exact = null;
      if (!legacy) {
        if (!(view.scale >= PENROSE_HH_MIN && view.scale <= PENROSE_HH_MAX)) return null;
        if (p.has("ex") || p.has("ey")) {
          const ex = penroseParseExact(p.get("ex")), ey = penroseParseExact(p.get("ey"));
          if (ex === null || ey === null) return null;
          exact = [ex, ey];
        }
      }
      return { mode: m, ...view, cm: cmIndex(), colorIndex, depth: Math.min(depth, maxDepth), fill: true, legacyView: legacy, exact };
    }
    return { mode: m, ...view, cm: cmIndex(), colorIndex, depth: int("dp", minDepth, maxDepth), fill: p.get("fl") !== "0" };
  } catch {
    return null;
  }
}

export function applyShareState(st) {
  if (st.mode === "fractal") {
    // A link names its palette and opens in exactly that one. It counts as a
    // pick (so later fractals keep it) unless it is the fractal's own default,
    // where the next fractal still opens in its own. Set before selectFractal,
    // which applies the default when nothing is picked.
    setColormapIndex(st.cm);
    setColormapPicked(st.cm !== colormapIndexNamed(defaultColormapName(st.name)));
    // The style travels with the colormap (both global); a link without one
    // means the default coloring.
    setColorStyle({ style: st.color.style, density: st.color.density, offset: st.color.offset });
    if (dualActive) exitDual();
    selectFractal(st.name, { fresh: true });
    Object.assign(mainState, { cx: st.cx, cy: st.cy, scale: limitScale(mainState, st.scale), rotation: st.rotation, flipY: st.flipY,
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
      if (st.mode === "corners") setCornerRule(st.rule); // before the view is written below: the rule's own shape
      if (fernView.system !== st.mode) {
        fernView.setSystem(st.mode); // before the view is written below
        fernNav.clearHistory(); // Back history belongs to the previous system
      }
      fernState.count = st.count;
      els.fernPointsSlider.value = st.count;
      setFernColor(st.colorIndex);
    } else {
      setColormapIndex(st.cm);
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
    const linked = VECTOR_VIEWS[st.mode][0].view;
    Object.assign(linked, { cx: st.cx, cy: st.cy, halfHeight: st.scale, rotation: st.rotation });
    if (st.mode === "penrose") {
      // An exact center is the origin itself (the offset is zero); without one the doubles are the center.
      linked.ox = st.exact ? st.exact[0] : 0n;
      linked.oy = st.exact ? st.exact[1] : 0n;
      if (st.exact) { linked.cx = 0; linked.cy = 0; }
    }
    setMode(st.mode);
    if (st.legacyView) fitVectorView(st.mode); // a 1.59.0 Penrose link: its view is the old patch's, so the star is framed whole
  }
  updateLUT();
  requestRender();
  if (st.seed) scheduleSharedRun(st.seed, st.mode); // a link with a run's seed plays that run
}

// Applies a share link from the URL, then strips the hash so a reload
// returns to the app's normal start rather than re-pinning the link.
export function applyShareHashFromUrl() {
  const st = parseShareHash(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (st) applyShareState(st);
}

// A share link that opened the iOS app (universal link, see platform.js):
// same parse/apply as a link loaded on the web. Anything that isn't a valid
// share hash is ignored, leaving the current view alone.
export function applyShareLink(url) {
  Diag.fromLink(url);
  const i = url.indexOf("#");
  const st = i >= 0 ? parseShareHash(url.slice(i)) : null;
  if (st) {
    cancelTeleport();
    applyShareState(st);
  }
}

