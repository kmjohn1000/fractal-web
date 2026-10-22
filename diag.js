// On-device telemetry for tuning the renderer on a real phone (TODO.md,
// "Rendering speed, depth and robustness"). Off unless asked for: open the
// page once with #diag (the app opens https://kmjohn1000.github.io/fractal-web/#diag
// as a universal link; "#diag=0" turns it off again). While on, a small "diag"
// pill opens a report to read or Copy. Nothing is sent anywhere.
//
// What it records:
//   - GL facts: version, renderer, limits, every extension (and whether the
//     four that decide the speed work are there), WebGPU adapter features
//   - shader link times (always, they are cheap): what the first use of a
//     program costs, and whether a parallel warm-up really leaves the thread free
//   - per-pass timings (only while on): JS ms for the render() call, and GPU
//     ms from submit until a fence signals. The fence is polled with
//     setTimeout, so it reads up to ~4 ms late, and a pass queued behind
//     another includes the wait.
const Diag = (() => {
  const KEY = "fractalAtlas.diag";
  const SAMPLES = 80;
  const OF_INTEREST = ["EXT_color_buffer_float", "EXT_float_blend", "KHR_parallel_shader_compile",
    "EXT_disjoint_timer_query_webgl2", "EXT_color_buffer_half_float", "OES_texture_float_linear"];

  let enabled = (() => {
    const p = new URLSearchParams(location.hash.slice(1));
    const off = p.get("diag") === "0";
    try {
      if (p.has("diag")) {
        if (off) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, "1");
      }
      return localStorage.getItem(KEY) === "1";
    } catch {
      return p.has("diag") && !off; // storage blocked: on for this visit only
    }
  })();

  // A test and tuning override ("#passes=16" for full quality, "#passes=6" to
  // try fewer; "#passes=0" or anything invalid clears it): how many of the 16
  // sharpening passes the slow deep-zoom views draw, instead of the default
  // (DEEP_PASSES in app.js). Read live, so no reload is needed; null when unset.
  const PASSES_KEY = "fractalAtlas.deepPasses";
  const parsePasses = (v) => { const n = Number(v); return v !== null && v !== "" && Number.isInteger(n) && n >= 2 && n <= 16 ? n : null; };
  let passesOverride = (() => {
    const p = new URLSearchParams(location.hash.slice(1));
    try {
      if (p.has("passes")) {
        const n = parsePasses(p.get("passes"));
        if (n === null) localStorage.removeItem(PASSES_KEY); else localStorage.setItem(PASSES_KEY, String(n));
      }
      return parsePasses(localStorage.getItem(PASSES_KEY));
    } catch {
      return p.has("passes") ? parsePasses(p.get("passes")) : null; // storage blocked: this visit only
    }
  })();
  function setPassesOverride(n) {
    passesOverride = n;
    try { if (n === null) localStorage.removeItem(PASSES_KEY); else localStorage.setItem(PASSES_KEY, String(n)); } catch { /* this visit only */ }
  }

  const contexts = []; // [name, gl, canvas]
  const links = []; // [label, ms]
  const events = []; // [seconds since load, text]
  const passes = new Map(); // label -> { n, js: [], gpu: [] }
  const pending = [];
  let timer = 0;
  let copyFn = null;
  let shareFn = null;
  let gpuInfo = "WebGPU: checking…";

  const push = (arr, v) => { arr.push(v); if (arr.length > SAMPLES) arr.shift(); };

  function record(label, js, gpu) {
    let s = passes.get(label);
    if (!s) passes.set(label, s = { n: 0, js: [], gpu: [] });
    s.n++;
    push(s.js, js);
    push(s.gpu, gpu);
  }

  function poll() {
    timer = 0;
    const now = performance.now();
    for (let i = pending.length - 1; i >= 0; i--) {
      const f = pending[i];
      let done = false, drop;
      try {
        if (f.gl.isContextLost()) drop = true;
        else {
          const r = f.gl.clientWaitSync(f.sync, 0, 0);
          done = r === f.gl.ALREADY_SIGNALED || r === f.gl.CONDITION_SATISFIED;
          drop = r === f.gl.WAIT_FAILED;
        }
      } catch { drop = true; }
      if (done) { record(f.label, f.js, now - f.t0); f.gl.deleteSync(f.sync); }
      if (done || drop) pending.splice(i, 1);
    }
    if (pending.length) timer = setTimeout(poll, 0);
  }

  // Called after each render() with the label for the pass and the JS time it
  // took to submit. WebGL1 has no fences: only the JS time is kept.
  function pass(gl, label, js) {
    if (!enabled) return;
    if (typeof gl.fenceSync !== "function") { record(label, js, NaN); return; }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush(); // a fence only signals once its commands are submitted
    if (pending.length > 200) pending.shift();
    pending.push({ gl, sync, label, js, t0: performance.now() });
    if (!timer) timer = setTimeout(poll, 0);
  }

  const link = (label, ms) => push(links, [label, ms]);
  const event = (text) => push(events, [performance.now() / 1000, text]);
  const watch = (name, gl, canvas) => {
    contexts.push([name, gl, canvas]);
    canvas.addEventListener("webglcontextlost", () => event(`${name}: WebGL context lost`));
    canvas.addEventListener("webglcontextrestored", () => event(`${name}: WebGL context restored`));
  };

  if (navigator.gpu) {
    navigator.gpu.requestAdapter().then((a) => {
      if (!a) { gpuInfo = "WebGPU: navigator.gpu exists, no adapter"; return; }
      const info = a.info || {};
      const lim = a.limits || {};
      gpuInfo = `WebGPU: adapter ${[info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" / ") || "(no info)"}\n`
        + `  features: ${[...a.features].sort().join(", ") || "none"}\n`
        + `  limits: maxTextureDimension2D ${lim.maxTextureDimension2D}, maxStorageBufferBindingSize ${lim.maxStorageBufferBindingSize}, `
        + `maxComputeInvocationsPerWorkgroup ${lim.maxComputeInvocationsPerWorkgroup}`;
    }).catch((e) => { gpuInfo = `WebGPU: requestAdapter failed (${e && e.message ? e.message : e})`; });
  } else {
    gpuInfo = "WebGPU: navigator.gpu is not there";
  }

  const f1 = (v) => (Number.isFinite(v) ? v.toFixed(v < 10 ? 1 : 0) : "-");
  const quantile = (a, q) => {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };

  function glReport([name, gl, canvas]) {
    if (gl.isContextLost()) return `${name}: context lost`;
    const ext = gl.getSupportedExtensions() || [];
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? `${gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)} / ${gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)}` : "(masked)";
    const uniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
    return `${name}: ${gl.getParameter(gl.VERSION)} · ${renderer}\n`
      + `  canvas ${canvas.width}x${canvas.height} · MAX_TEXTURE_SIZE ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} · `
      + `fragment uniform vectors ${uniforms} · fences ${typeof gl.fenceSync === "function" ? "yes" : "no"}\n`
      + `  ${OF_INTEREST.map((n) => `${n} ${ext.includes(n) ? "yes" : "no"}`).join(", ")}`;
  }

  function report() {
    const out = [`Fractal Atlas diagnostics · ${new Date().toISOString()}`,
      navigator.userAgent,
      `devicePixelRatio ${window.devicePixelRatio} · screen ${screen.width}x${screen.height} · window ${innerWidth}x${innerHeight}`,
      `deep-view passes: ${passesOverride === null ? "the default" : `overridden to ${passesOverride} of 16`}`,
      ""];
    contexts.forEach((c) => out.push(glReport(c)));
    out.push(gpuInfo, "", "Shader links, ms (compile + link until usable; \"warm start\" is what a parallel warm-up costs the thread):");
    out.push(...(links.length ? links.map(([l, ms]) => `  ${l}: ${f1(ms)}`) : ["  none yet"]));
    out.push("", enabled ? "Passes: n, GPU ms median / p90 / max (submit to fence), JS ms median / max" : "Passes: not recording");
    for (const [label, s] of passes) {
      out.push(`  ${label}: ${s.n}, GPU ${f1(quantile(s.gpu, 0.5))} / ${f1(quantile(s.gpu, 0.9))} / ${f1(Math.max(...s.gpu))}, `
        + `JS ${f1(quantile(s.js, 0.5))} / ${f1(Math.max(...s.js))}`);
    }
    if (events.length) out.push("", "Events:", ...events.map(([t, text]) => `  ${t.toFixed(1)} s: ${text}`));
    // Last, so the long list doesn't push the timings off the screen.
    const gl = contexts[0] && contexts[0][1];
    const ext = gl && !gl.isContextLost() ? gl.getSupportedExtensions() || [] : [];
    out.push("", `All WebGL extensions (${ext.length}): ${ext.join(", ")}`);
    return out.join("\n");
  }

  // The pill and the report panel, built only while on.
  let pill = null, panel = null, body = null, shareBtn = null, refresh = 0;
  function makeButton(text, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cssText = "font:inherit;padding:6px 10px;margin-right:6px;border-radius:6px;border:1px solid #666;background:#222;color:#fff";
    b.addEventListener("click", onClick);
    return b;
  }
  function showUi() {
    if (pill) return;
    pill = makeButton("diag", () => {
      panel.hidden = !panel.hidden;
      clearInterval(refresh);
      if (!panel.hidden) { body.textContent = report(); refresh = setInterval(() => { body.textContent = report(); }, 1000); }
    });
    pill.style.cssText += ";position:fixed;left:6px;top:calc(env(safe-area-inset-top) + 6px);z-index:100000;opacity:.7;font-size:12px";
    panel = document.createElement("div");
    panel.hidden = true;
    panel.style.cssText = "position:fixed;left:6px;right:6px;top:calc(env(safe-area-inset-top) + 44px);max-height:65vh;overflow:auto;"
      + "z-index:100000;background:rgba(0,0,0,.92);color:#cfc;font:11px/1.35 ui-monospace,Menlo,monospace;padding:8px;border-radius:8px;user-select:text";
    const bar = document.createElement("div");
    bar.style.cssText = "margin-bottom:8px;font:12px system-ui";
    const flash = (btn, text) => { const t = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = t; }, 1200); };
    const copy = makeButton("Copy", async () => {
      let ok = false;
      try { ok = copyFn ? await copyFn(report()) : false; } catch { /* fall through */ }
      flash(copy, ok ? "Copied!" : "Copy failed");
    });
    // For AirDrop to the Mac or Save to Files; shown once app.js supplies it.
    shareBtn = makeButton("Share", async () => {
      try { await shareFn(report()); } catch (e) { flash(shareBtn, `Share failed: ${e && e.message ? e.message : e}`); }
    });
    shareBtn.hidden = !shareFn;
    bar.append(copy, shareBtn,
      makeButton("Clear passes", () => { passes.clear(); body.textContent = report(); }),
      makeButton("Turn off", () => { setEnabled(false); }));
    body = document.createElement("pre");
    body.style.cssText = "margin:0;white-space:pre-wrap;overflow-wrap:anywhere";
    panel.append(bar, body);
    document.body.append(pill, panel);
  }
  function hideUi() {
    clearInterval(refresh);
    pill?.remove(); panel?.remove();
    pill = panel = body = shareBtn = null;
  }

  function setEnabled(on) {
    enabled = on;
    try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* this visit only */ }
    if (on) showUi(); else hideUi();
  }

  // A link opened inside the app (no page load, so no hash at startup).
  function fromLink(url) {
    const i = url.indexOf("#");
    if (i < 0) return;
    const p = new URLSearchParams(url.slice(i + 1));
    if (p.has("diag")) setEnabled(p.get("diag") !== "0");
    if (p.has("passes")) setPassesOverride(parsePasses(p.get("passes")));
  }

  // A hash typed into an open tab changes no page load. This listener is
  // registered before app.js's, which strips the hash.
  window.addEventListener("hashchange", () => fromLink(location.href));

  if (enabled) showUi();

  return { pass, link, event, watch, fromLink, get passesOverride() { return passesOverride; }, setCopy(fn) { copyFn = fn; },
    setShare(fn) { shareFn = fn; if (shareBtn) shareBtn.hidden = !fn; }, get enabled() { return enabled; } };
})();
