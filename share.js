// Sharing: share-link encoding and parsing, applying a link, the share menu and the share image.
// Needs the state, render-layout, modes, teleport.js (cancelTeleport) and colormap-picker.js;
// applyShareHashFromUrl and applyShareLink are called from init in app.js.
"use strict";

// ---------------------------------------------------------------- share: links

// A share link is the page URL plus a hash encoding the current view, e.g.
// #v=1&m=fractal&f=Mandelbrot&x=...&y=...&s=...  Numbers use String(),
// the shortest decimal that round-trips to the exact same double -- the
// HUD's rounded display would move deep-zoom views. Julia c is encoded
// explicitly: enterDual only seeds it from the main center; tapping the
// main pane moves it independently afterward.
function depthStateFor(m) {
  return isCurveMode(m) ? dragonState : { koch: kochState, tree: treeState, hexaflake: hexaflakeState }[m];
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
    put("x", v.cx); put("y", v.cy); put("s", v.halfHeight); put("r", v.rotation || 0);
    if (isIfsMode(mode)) {
      put("n", fernState.count); put("c", vectorColors[mode]);
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

function buildShareUrl() {
  return Platform.shareBaseUrl() + buildShareHash();
}

// The color style fields of a link (st, cd, co). Unlike the view fields, a
// bad one never rejects the link: it falls back to today's coloring, so a
// hand-edited or newer link still opens. An unknown style code (a newer
// app's), a density outside 0.25-8 and a shift outside 0-1 all fall back;
// the code is looked up in a Map, never an object, so "constructor" is just
// an unknown code.
function parseStyleFields(p) {
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
    if (isIfsMode(m)) return { mode: m, ...view, count: int("n", 100000, 4000000), colorIndex: int("c", 0, SOLID_COLORS.length - 1) };
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
    return { mode: m, ...view, cm: cmIndex(), colorIndex, depth: int("dp", minDepth, maxDepth), fill: p.get("fl") !== "0" };
  } catch {
    return null;
  }
}

function applyShareState(st) {
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
  Diag.fromLink(url);
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
  if (mode === "fractal") {
    finishRefinement();
    await waitUntil(() => refineDone && !isInteracting, 3000);
  }
  else if (isIfsMode(mode)) {
    // A chaos-game replay under way (or paused): the picture saved is the finished normal frame.
    if (fernView.replaying) { fernView.cancelReplay(); renderAll(); }
    await waitUntil(() => !fernView.refining, 3000);
  }
  else if (mode === "koch" && kochView.growing) {
    // A generation still growing in: the picture saved is the finished one.
    kochView.cancelGrow();
    renderAll();
  }
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
    els.colorSheet.classList.remove("open");
    els.placesSheet.classList.remove("open");
    const opening =!els.shareMenu.classList.contains("open");
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

