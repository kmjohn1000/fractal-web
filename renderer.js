// The WebGL renderer factory: createFractalRenderer(canvas) and everything it draws with.
// Needs the shader sources (shaders.js), FTYPE (configs.js), the digit/Apollonian helpers
// (fractal-defs.js), deepzoom.js and, inside its functions only, state-colors.js (colorStyle etc.).
"use strict";

// ---------------------------------------------------------------- WebGL renderer factory

function createFractalRenderer(canvas) {
  // preserveDrawingBuffer: supersampling blends each new sample into the
  // previous frame's canvas contents, which the browser would otherwise be
  // free to discard after compositing.
  const ctxOpts = { antialias: false, alpha: false, preserveDrawingBuffer: true };
  // WebGL2 when there is one: Newton's deep zoom needs its 32-bit uints
  // (NEWTON_DEEP_FRAG_SRC). The ES 1.00 shaders run unchanged on either.
  const gl = canvas.getContext("webgl2", ctxOpts)
          || canvas.getContext("webgl", ctxOpts)
          || canvas.getContext("experimental-webgl", ctxOpts);
  if (!gl) return null;
  const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
  Diag.watch(canvas.id, gl, canvas);

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      // A lost context fails every compile with no log. iOS Safari does
      // this for a while after the GPU crashes, from the very first shader.
      if (gl.isContextLost()) throw new Error("The browser has turned graphics off for this page. Close the tab and reopen it; if that doesn't help, restart the device.");
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  // a_pos is pinned to attribute 0 in both programs so they share the
  // quad's vertex-attribute setup below without re-pointing it per draw.
  function link(fragSrc, vertSrc = VERT_SRC, label = "program") {
    const t0 = performance.now();
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.bindAttribLocation(p, 0, "a_pos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    Diag.link(`${canvas.id} ${label}`, performance.now() - t0);
    return p;
  }
  // The escape-time program comes in variants (COLOR_VARIANT in FRAG_SRC),
  // one per kind of per-iteration color work: 0 is Smooth and Bands, which
  // need none and which everything but the other styles draws with, so its
  // code stays exactly what it was. The others (see colorStyleFor) compile
  // the first time a style asks for them.
  const programs = new Map();
  const UNIFORMS = ["resolution", "center", "scale", "rotCos", "rotSin", "maxIter", "ftype", "power", "isJulia",
    "juliaC", "phoenixP", "lut", "style", "density", "offset", "pixelSize", "trapCenter", "digitDepth", "digitLevel",
    "digitCenter", "digitScale", "cellHole", "digitCycle", "subPixelColor", "apoW0", "apoK", "apoL", "apoFlip",
    "apoSteps", "apoCapColor", "jitter", "usePerturbation", "refOrbitTex", "refOrbitLen", "critOffset",
    "critLen", "refTexWidth", "refOffset", "trapLo", "trapHi", "trapProbe"];
  function fractalEntry(variant, p) {
    const entry = { prog: p, u: Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(p, `u_${n}`)])) };
    programs.set(variant, entry);
    warming.delete(variant);
    return entry;
  }
  function fractalProgram(variant) {
    let entry = programs.get(variant);
    if (!entry) {
      const inFlight = warming.get(variant);
      if (inFlight) {
        // A warm-up compile is under way: finish with it (waits if it isn't done) rather than starting again.
        const t0 = performance.now();
        if (!gl.getProgramParameter(inFlight, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(inFlight));
        Diag.link(`${canvas.id} escape-time variant ${variant}, finishing a warm-up`, performance.now() - t0);
        entry = fractalEntry(variant, inFlight);
      } else {
        entry = fractalEntry(variant, link(`#define COLOR_VARIANT ${variant}\n${FRAG_SRC}`, VERT_SRC, `escape-time variant ${variant}`));
      }
    }
    return entry;
  }
  // Compiling a variant before it's asked for (warmColorVariants in app.js),
  // so that picking a style doesn't wait on the compiler. With
  // KHR_parallel_shader_compile the compile runs off the main thread: this
  // starts it and later calls report "pending" until it's done, without
  // blocking. Without it, the compile happens here, once, in the idle time the
  // caller picked. Returns "ready" or "pending".
  const parallelCompile = gl.getExtension("KHR_parallel_shader_compile");
  const warming = new Map();
  function warmVariant(variant) {
    if (programs.has(variant)) return "ready";
    if (!parallelCompile) { fractalProgram(variant); primeVariant(variant); return "ready"; }
    let p = warming.get(variant);
    if (!p) {
      const t0 = performance.now();
      p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, VERT_SRC], [gl.FRAGMENT_SHADER, `#define COLOR_VARIANT ${variant}\n${FRAG_SRC}`]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, "a_pos");
      gl.linkProgram(p);
      warming.set(variant, p);
      Diag.link(`${canvas.id} escape-time variant ${variant}, warm start`, performance.now() - t0);
    }
    if (!gl.getProgramParameter(p, parallelCompile.COMPLETION_STATUS_KHR)) return "pending";
    fractalProgram(variant); // finishes with the program just compiled
    primeVariant(variant);
    return "ready";
  }
  // A compiled program still has a first draw to pay for: the GPU builds its own
  // version of the shader for the canvas the first time it is drawn (50-100 ms
  // more than a later pass in the app's first run, measured on the phone). One
  // fragment in the canvas corner, with a first pass's state (no blending),
  // builds it ahead of the pick. The pixel is read first and put back after, so
  // the picture doesn't change; clear() isn't a draw, so it builds nothing.
  function primeVariant(variant) {
    const entry = programs.get(variant);
    if (!entry || gl.isContextLost()) return;
    const t0 = performance.now();
    const px = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.useProgram(entry.prog);
    gl.uniform2f(entry.u.resolution, canvas.width, canvas.height);
    gl.uniform1i(entry.u.maxIter, 0); // every pass sets it again; zero makes this draw trivial
    gl.disable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, 0, 1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.clearColor(px[0] / 255, px[1] / 255, px[2] / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    Diag.link(`${canvas.id} escape-time variant ${variant}, first-draw prime`, performance.now() - t0);
  }
  fractalProgram(0);
  const previewProg = link(PREVIEW_FRAG_SRC, VERT_SRC, "preview");
  gl.useProgram(programs.get(0).prog);

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const pu = {
    resolution: gl.getUniformLocation(previewProg, "u_resolution"),
    snap: gl.getUniformLocation(previewProg, "u_snap"),
    snapRes: gl.getUniformLocation(previewProg, "u_snapRes"),
    toSnap: gl.getUniformLocation(previewProg, "u_toSnap"),
    snapOffset: gl.getUniformLocation(previewProg, "u_snapOffset"),
  };
  const snapTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, snapTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const lutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  // CLAMP, not REPEAT: lutColor already cycles with fract(), so the texture
  // never needs to wrap -- and under REPEAT + LINEAR, a lookup at u = 0 (every
  // first-step escape once smoothIter is clamped at 0) blends texel 0 with
  // texel 255, tinting those regions with the colormap's end color.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Kept for digitSubPixelColor, which samples the LUT on the CPU.
  let lutBytes = null;
  function setLUT(bytes) {
    lutBytes = bytes;
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }

  // Perturbation needs a float texture to hold the reference orbit (each
  // texel a genuine re/im pair, not an 8-bit-quantized color). Feature-detect
  // once; if unavailable, perturbation mode is simply never offered and deep
  // zoom stays capped at the plain float32 ceiling for this renderer.
  // WebGL2 has float textures built in (and no OES_texture_float to ask for).
  const floatTexOk = isWebGL2 || !!gl.getExtension("OES_texture_float");
  const refOrbitTex = floatTexOk ? gl.createTexture() : null;
  if (refOrbitTex) {
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  const perturbationSupported = !!refOrbitTex;

  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    }
    return false;
  }

  // Final draw to the canvas. Sample 0 overwrites; sample k>0 blends in
  // with weight 1/(k+1), which keeps the canvas equal to the running mean of
  // samples 0..k.
  function drawToCanvas(sampleIndex) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (sampleIndex > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 1 / (sampleIndex + 1));
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  }

  // Live frames (a flight, a pinch above the deep-zoom threshold) draw one
  // pass each. When they're running late, app.js asks for a smaller one
  // (setLiveDivisor): the fractal is drawn at 1/div of the canvas size into a
  // small texture, and that is painted over the canvas through the preview
  // program. Only while a gesture or flight is on (isInteracting); the full
  // render when it settles is untouched, so the landing is as sharp as ever.
  let liveDiv = 1;
  let liveTex = null, liveFbo = null, liveW = 0, liveH = 0;
  function ensureLiveTarget(w, h) {
    // Unit 4 is the preview's; units 0 and 1 hold the colormap and the
    // reference orbit that the program about to draw is sampling.
    gl.activeTexture(gl.TEXTURE4);
    if (!liveTex) {
      liveTex = gl.createTexture();
      liveFbo = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, liveTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    if (w !== liveW || h !== liveH) {
      gl.bindTexture(gl.TEXTURE_2D, liveTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, liveFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, liveTex, 0);
      liveW = w; liveH = h;
    }
  }
  // The fractal program is bound with its uniforms set (u.resolution aside):
  // draw it small, then paint that over the canvas.
  function drawSmall(u) {
    const w = Math.max(1, Math.round(canvas.width / liveDiv));
    const h = Math.max(1, Math.round(canvas.height / liveDiv));
    ensureLiveTarget(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, liveFbo);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.resolution, w, h);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, liveTex);
    gl.useProgram(previewProg);
    gl.uniform2f(pu.resolution, canvas.width, canvas.height);
    gl.uniform1i(pu.snap, 4);
    gl.uniform2f(pu.snapRes, w, h);
    gl.uniformMatrix2fv(pu.toSnap, false, [1, 0, 0, 1]);
    gl.uniform2f(pu.snapOffset, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  function drawFinal(sampleIndex, u) {
    if (liveDiv > 1 && isInteracting && sampleIndex === 0) drawSmall(u);
    else drawToCanvas(sampleIndex);
  }

  // Orbit traps' range (Point and Cross). A deep view's orbits all look
  // alike, so a fixed distance range paints it one color; the range is
  // instead set per view from a probe: the same program draws a small
  // (TRAP_PROBE_H rows) copy of the view that writes each pixel's distance
  // and escaped flag (the trap-probe mode of trapColor in shaders.js), read
  // back with readPixels, and the 2nd-98th percentile of the escaped pixels'
  // distances becomes [lo, hi]. It runs when a refinement chain starts on a
  // view it hasn't seen, and not while a gesture or flight is on (the last
  // range is reused then, so the colors don't flicker), only the first time
  // if there is none yet. trapRangeKey is every input the distances depend on.
  const TRAP_PROBE_H = 48;
  let trapRange = null; // { key, lo, hi } or null
  function trapFixedRange(cs) { return cs.glsl === 5 ? { lo: 0, hi: 0.2 } : { lo: 0, hi: 1 }; }
  function probeTrapRange(u, cs) {
    const h = TRAP_PROBE_H;
    const w = Math.max(8, Math.round(h * canvas.width / canvas.height));
    gl.uniform1i(u.trapProbe, 1);
    gl.uniform2f(u.jitter, 0, 0);
    gl.uniform2f(u.resolution, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.uniform1i(u.trapProbe, 0);
    gl.uniform2f(u.jitter, SAMPLE_OFFSETS[0][0], SAMPLE_OFFSETS[0][1]);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
    return trapRangeFor(px, trapFixedRange(cs));
  }
  function updateTrapRange(u, state, cs, sampleIndex) {
    const key = [cs.glsl, cs.trap[0], cs.trap[1], state.ftype, state.cx, state.cy, state.scale, state.rotation || 0,
      state.power, state.maxIter, state.isJulia, state.juliaC[0], state.juliaC[1], canvas.width, canvas.height].join(",");
    if (sampleIndex === 0 && (!trapRange || (trapRange.key !== key && !isInteracting))) {
      trapRange = { key, ...probeTrapRange(u, cs) };
    }
    const r = trapRange || trapFixedRange(cs);
    gl.uniform1f(u.trapLo, r.lo);
    gl.uniform1f(u.trapHi, r.hi);
  }

  // Reference orbit for the current view, reused by that view's
  // supersampling passes instead of re-running chooseReference's grid scan
  // and re-uploading the texture 16 times.
  let refCacheKey = "";
  let refCache = null;

  // Newton's fixed-point deep zoom (NEWTON_DEEP_FRAG_SRC): compiled and
  // self-tested the first time a deep Newton view needs it, not at launch.
  // null = not tried yet, false = unavailable (no WebGL2, a compile error,
  // or a failed self-test: deep Newton then stays on float32, as before).
  let newtonDeep = isWebGL2 ? null : false;
  function newtonDeepProgram() {
    if (newtonDeep !== null) return newtonDeep;
    try {
      const p = link(NEWTON_DEEP_FRAG_SRC, VERT_SRC_300, "Newton deep");
      const names = ["resolution", "jitter", "rotCos", "rotSin", "scale", "maxIter", "cx", "cy", "third", "testMode", "lut"];
      const nu = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, `u_${n}`)]));
      newtonDeep = { prog: p, u: nu };
      if (!newtonDeepSelfTest()) newtonDeep = false;
    } catch (e) {
      console.warn("Newton deep zoom unavailable:", e);
      newtonDeep = false;
    }
    return newtonDeep;
  }

  function setNewtonDeepUniforms(state, w, h, jitter) {
    const { u: nu } = newtonDeep;
    gl.useProgram(newtonDeep.prog);
    gl.uniform2f(nu.resolution, w, h);
    gl.uniform2f(nu.jitter, jitter[0], jitter[1]);
    const rot = state.rotation || 0;
    gl.uniform1f(nu.rotCos, Math.cos(rot));
    gl.uniform1f(nu.rotSin, Math.sin(rot));
    gl.uniform1f(nu.scale, state.scale);
    gl.uniform1i(nu.maxIter, state.maxIter | 0);
    gl.uniform4ui(nu.cx, ...fixedLimbs(state.cx));
    gl.uniform4ui(nu.cy, ...fixedLimbs(state.cy));
    gl.uniform4ui(nu.third, ...FIXED_THIRD);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(nu.lut, 0);
  }

  // The fixed-point math is exact on paper, but a shader compiler can still
  // get it wrong (an "optimized" variant rendered garbage on an iPhone 15
  // while passing on a Mac), so before first use it draws a 16x16 corner of
  // a deep view where float32 gets every pixel wrong and checks each pixel's
  // root and iteration count against float64. The real frame drawn right
  // after covers the corner.
  // Two views: one far from the pole, and one ~0.01 from it, where orbits
  // pass close to 0 and run in u = 1/z (a version without u-mode passed the
  // far view and got 5% of the near one).
  const NEWTON_TEST_VIEWS = [
    { cx: 0.4637970443508781, cy: 0.6374591385438365, scale: 1e-9, rotation: 0, maxIter: 300 },
    { cx: 0.008882243030414086, cy: 0.004594100428665051, scale: 1e-9, rotation: 0, maxIter: 300 },
  ];
  function newtonDeepSelfTest() {
    const n = 16;
    for (const view of NEWTON_TEST_VIEWS) {
      setNewtonDeepUniforms(view, n, n, [0, 0]);
      gl.uniform1i(newtonDeep.u.testMode, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, n, n);
      gl.disable(gl.BLEND);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      const px = new Uint8Array(n * n * 4);
      gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.uniform1i(newtonDeep.u.testMode, 0);
      gl.viewport(0, 0, canvas.width, canvas.height);
      let ok = 0;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const uvx = (x + 0.5 - 0.5 * n) / n, uvy = (y + 0.5 - 0.5 * n) / n;
          const ref = newtonOrbitF64(view.cx + uvx * view.scale * 2, view.cy + uvy * view.scale * 2, view.maxIter);
          const i = (y * n + x) * 4;
          const used = px[i] + 256 * px[i + 1], root = px[i + 2] - 1;
          if (root === ref.root && Math.abs(used - ref.used) <= 1) ok++;
        }
      }
      // 98-100% agreed in testing; float32 gets 0-5%.
      if (ok < 0.9 * n * n) return false;
    }
    return true;
  }

  // Phoenix's deep zoom (PHOENIX_DEEP_FRAG_SRC), same lifecycle as Newton's.
  let phoenixDeep = isWebGL2 ? null : false;
  const phoenixRefTex = isWebGL2 ? gl.createTexture() : null;
  if (phoenixRefTex) {
    gl.bindTexture(gl.TEXTURE_2D, phoenixRefTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }
  let phoenixRefKey = "";
  let phoenixRef = null;
  function phoenixDeepProgram() {
    if (phoenixDeep !== null) return phoenixDeep;
    try {
      const p = link(PHOENIX_DEEP_FRAG_SRC, VERT_SRC_300, "Phoenix deep");
      const names = ["resolution", "jitter", "rotCos", "rotSin", "scale", "maxIter", "isJulia", "cx", "cy",
        "jcx", "jcy", "ref", "refLen", "refOff", "exactCap", "testMode", "lut", "style", "density", "offset"];
      const pu = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, `u_${n}`)]));
      phoenixDeep = { prog: p, u: pu };
      if (!phoenixDeepSelfTest()) phoenixDeep = false;
    } catch (e) {
      console.warn("Phoenix deep zoom unavailable:", e);
      phoenixDeep = false;
    }
    return phoenixDeep;
  }

  function setPhoenixDeepUniforms(state, w, h, jitter) {
    const { u: pu } = phoenixDeep;
    gl.useProgram(phoenixDeep.prog);
    gl.uniform2f(pu.resolution, w, h);
    gl.uniform2f(pu.jitter, jitter[0], jitter[1]);
    const rot = state.rotation || 0;
    gl.uniform1f(pu.rotCos, Math.cos(rot));
    gl.uniform1f(pu.rotSin, Math.sin(rot));
    gl.uniform1f(pu.scale, state.scale);
    gl.uniform1i(pu.maxIter, state.maxIter | 0);
    gl.uniform1i(pu.isJulia, state.isJulia ? 1 : 0);
    gl.uniform4ui(pu.cx, ...fixedLimbs(state.cx));
    gl.uniform4ui(pu.cy, ...fixedLimbs(state.cy));
    gl.uniform4ui(pu.jcx, ...fixedLimbs(state.juliaC[0]));
    gl.uniform4ui(pu.jcy, ...fixedLimbs(state.juliaC[1]));
    gl.uniform1i(pu.exactCap, PHOENIX_EXACT_CAP);
    const cs = colorStyleFor(state);
    gl.uniform1i(pu.style, cs.glsl);
    gl.uniform1f(pu.density, cs.density);
    gl.uniform1f(pu.offset, cs.offset);
    // The reference orbit, recomputed only when the view changes (the
    // refinement passes reuse it, as with refCacheKey).
    const key = [state.cx, state.cy, state.scale, state.rotation || 0, state.maxIter, state.isJulia,
      state.juliaC[0], state.juliaC[1], w, h].join(",");
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, phoenixRefTex);
    if (key !== phoenixRefKey) {
      phoenixRef = phoenixReference(state, w, h);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, phoenixRef.len, 3, 0, gl.RGBA, gl.FLOAT, phoenixRef.data);
      phoenixRefKey = key;
    }
    gl.uniform1i(pu.ref, 2);
    gl.uniform1i(pu.refLen, phoenixRef.len);
    gl.uniform2f(pu.refOff, phoenixRef.dx, phoenixRef.dy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(pu.lut, 0);
  }

  // Same idea as newtonDeepSelfTest: a 16x16 corner of a deep parameter-
  // space view where float32 gets ~half the pixels wrong, checked against
  // float64 escape counts.
  function phoenixDeepSelfTest() {
    const n = 16;
    const view = { cx: -0.6034929369570187, cy: 0.4995077460562414, scale: 1e-9, rotation: 0,
      maxIter: 2000, isJulia: false, juliaC: [0, 0] };
    setPhoenixDeepUniforms(view, n, n, [0, 0]);
    gl.uniform1i(phoenixDeep.u.testMode, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, n, n);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const px = new Uint8Array(n * n * 4);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.uniform1i(phoenixDeep.u.testMode, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    phoenixRefKey = ""; // the test's reference isn't the real view's
    let ok = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const uvx = (x + 0.5 - 0.5 * n) / n, uvy = (y + 0.5 - 0.5 * n) / n;
        const iter = phoenixEscapeF64(0, 0, view.cx + uvx * view.scale * 2, view.cy + uvy * view.scale * 2, view.maxIter);
        const i = (y * n + x) * 4;
        const escaped = px[i + 2] === 1, used = px[i] + 256 * px[i + 1];
        if (escaped ? iter !== Infinity && Math.abs(used - iter) <= 1 : iter === Infinity) ok++;
      }
    }
    // 100% agreed in testing; float32 gets ~48%.
    return ok >= 0.95 * n * n;
  }

  // sampleIndex selects the sub-pixel offset from SAMPLE_OFFSETS; see there
  // and drawToCanvas for how successive samples accumulate.
  // The view the canvas's current accurate frame was drawn for, and whether
  // the next renderPreview should capture it as a fresh snapshot.
  let lastView = null;
  let snapView = null;
  let needSnapshot = false;

  // Returns which deep-zoom path drew the frame ("perturbation" or
  // "fixed point"), or null for plain float32 -- for the info card.
  function render(state, sampleIndex = 0) {
    const t0 = performance.now();
    const path = renderPass(state, sampleIndex);
    if (Diag.enabled) {
      // The fractal's name (the Julia pane of a dual view is its own row),
      // the path and style, and the kind of pass; a live frame also says if it
      // was drawn small (setLiveDivisor), since that changes what its time means.
      const where = canvas.id === "mainCanvas" ? currentName : "Julia pane";
      const kind = isInteracting ? (liveDiv > 1 ? `live at 1/${liveDiv} size` : "live") : sampleIndex === 0 ? "first pass" : "refine pass";
      Diag.pass(gl, `${where} ${path || "float32"} ${styleDrawn(colorStyle.style, state)}, ${kind}`, performance.now() - t0);
    }
    return path;
  }

  function renderPass(state, sampleIndex) {
    // A resize clears the canvas, so there's nothing left to blend into.
    if (resize()) sampleIndex = 0;
    if (sampleIndex === 0) {
      lastView = { cx: state.cx, cy: state.cy, scale: state.scale, rotation: state.rotation || 0 };
      needSnapshot = true;
    }
    // Mid-gesture, deep views show the moving preview instead (renderAll);
    // this guard covers a pane renderAll still draws live.
    if (!isInteracting && newtonDeepEligible(state) && newtonDeepProgram()) {
      setNewtonDeepUniforms(state, canvas.width, canvas.height, SAMPLE_OFFSETS[sampleIndex]);
      drawToCanvas(sampleIndex);
      return "fixed point";
    }
    if (!isInteracting && phoenixDeepEligible(state) && phoenixDeepProgram()) {
      // Past PHOENIX_DEEP_SAMPLES the canvas keeps its average so far.
      if (sampleIndex < PHOENIX_DEEP_SAMPLES) {
        setPhoenixDeepUniforms(state, canvas.width, canvas.height, SAMPLE_OFFSETS[sampleIndex]);
        drawToCanvas(sampleIndex);
      }
      return "perturbation + fixed point";
    }
    const cs = colorStyleFor(state);
    const { prog, u } = fractalProgram(cs.variant);
    gl.useProgram(prog);
    const jitter = SAMPLE_OFFSETS[sampleIndex];
    gl.uniform2f(u.jitter, jitter[0], jitter[1]);
    gl.uniform2f(u.resolution, canvas.width, canvas.height);
    gl.uniform2f(u.center, state.cx, state.cy);
    gl.uniform1f(u.scale, state.scale);
    const rot = state.rotation || 0;
    gl.uniform1f(u.rotCos, Math.cos(rot));
    gl.uniform1f(u.rotSin, Math.sin(rot));
    gl.uniform1i(u.maxIter, state.maxIter | 0);
    gl.uniform1i(u.ftype, state.ftype);
    gl.uniform1f(u.power, state.power);
    gl.uniform1i(u.isJulia, state.isJulia ? 1 : 0);
    gl.uniform2f(u.juliaC, state.juliaC[0], state.juliaC[1]);
    gl.uniform2f(u.phoenixP, PHOENIX_P[0], PHOENIX_P[1]);
    gl.uniform1i(u.style, cs.glsl);
    gl.uniform1f(u.density, cs.density);
    gl.uniform1f(u.offset, cs.offset);
    // World units per CSS pixel: the distance estimate's glow width is
    // measured in these, so a retina phone and a laptop show the same glow.
    gl.uniform1f(u.pixelSize, 2 * state.scale / (canvas.clientHeight || canvas.height / dpr));
    gl.uniform2f(u.trapCenter, cs.trap[0], cs.trap[1]);
    gl.uniform1i(u.trapProbe, 0);
    // Per view, not per pass: every later sample in a refinement chain is
    // the same view (any change restarts at sample 0), and the program
    // keeps its uniforms between draws.
    if (sampleIndex === 0 && isDigitFractal(state.ftype)) {
      const aspect = canvas.width / canvas.height;
      const frame = digitCellFrame(state.ftype, state.cx, state.cy, state.scale, aspect);
      const depth = digitFractalDepth(state.ftype, state.scale, canvas.height, aspect);
      gl.uniform1i(u.digitDepth, depth);
      gl.uniform1f(u.digitCycle, digitColorCycle(state.ftype));
      gl.uniform3fv(u.subPixelColor, digitSubPixelColor(state.ftype, depth, lutBytes));
      gl.uniform1i(u.digitLevel, frame.level);
      gl.uniform2f(u.digitCenter, frame.center[0], frame.center[1]);
      gl.uniform1f(u.digitScale, 2 * state.scale * frame.cellsPerUnit);
      gl.uniform1fv(u.cellHole, frame.holes);
    }
    if (sampleIndex === 0 && state.ftype === FTYPE.APOLLONIAN) {
      const frame = apolloFrame(state.cx, state.cy, state.scale, canvas.width / canvas.height);
      gl.uniform2f(u.apoW0, frame.w0[0], frame.w0[1]);
      gl.uniform2f(u.apoK, frame.k[0], frame.k[1]);
      gl.uniform2f(u.apoL, frame.l[0], frame.l[1]);
      gl.uniform1i(u.apoFlip, frame.flip ? 1 : 0);
      gl.uniform1f(u.apoSteps, frame.steps);
      gl.uniform3fv(u.apoCapColor, apolloCapColor(lutBytes));
    }

    // See perturbationEligibleType for which types are covered. Also
    // suppressed mid-gesture (see isInteracting) since recomputing the
    // reference orbit every frame during a live pinch/wheel is expensive
    // enough to visibly jank.
    const usePerturbation = perturbationSupported
      && !isInteracting
      && perturbationEligibleType(state)
      && state.scale < DEEP_ZOOM_THRESHOLD;
    gl.uniform1i(u.usePerturbation, usePerturbation ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(u.lut, 0);

    if (!usePerturbation) {
      if (cs.variant === 3) updateTrapRange(u, state, cs, sampleIndex);
      drawFinal(sampleIndex, u);
      return null;
    }

    const key = [state.ftype, state.cx, state.cy, state.scale, state.rotation || 0,
      state.power, state.maxIter, state.isJulia, state.juliaC[0], state.juliaC[1],
      canvas.width, canvas.height].join(",");
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, refOrbitTex);
    if (key !== refCacheKey) {
      const ref = chooseReference(state, canvas.width, canvas.height);
      const rx = state.cx + ref.dx, ry = state.cy + ref.dy;
      let data, refLen, critOffset, critLen;
      if (state.isJulia) {
        // [view-point orbit | critical orbit] in one texture, see
        // renderEscapePerturbation. At most 2*(maxIter+1) = 4002 texels,
        // within every WebGL device's MAX_TEXTURE_SIZE (4096 minimum in
        // practice).
        const [jr, ji] = state.juliaC;
        const view = computeReferenceOrbit(state, rx, ry, jr, ji);
        const crit = computeReferenceOrbit(state, 0, 0, jr, ji);
        data = new Float32Array(view.data.length + crit.data.length);
        data.set(view.data, 0);
        data.set(crit.data, view.data.length);
        refLen = view.length; critOffset = view.length; critLen = crit.length;
      } else {
        const orbit = computeReferenceOrbit(state, 0, 0, rx, ry);
        data = orbit.data;
        refLen = orbit.length; critOffset = 0; critLen = orbit.length;
      }
      const width = data.length / 4;
      gl.texImage2D(gl.TEXTURE_2D, 0, isWebGL2 ? gl.RGBA32F : gl.RGBA, width, 1, 0, gl.RGBA, gl.FLOAT, data);
      refCache = { dx: ref.dx, dy: ref.dy, refLen, critOffset, critLen, width };
      refCacheKey = key;
    }
    gl.uniform1i(u.refOrbitTex, 1);
    gl.uniform1i(u.refOrbitLen, refCache.refLen);
    gl.uniform1i(u.critOffset, refCache.critOffset);
    gl.uniform1i(u.critLen, refCache.critLen);
    gl.uniform1f(u.refTexWidth, refCache.width);
    gl.uniform2f(u.refOffset, refCache.dx, refCache.dy);
    if (cs.variant === 3) updateTrapRange(u, state, cs, sampleIndex);
    drawToCanvas(sampleIndex);
    return "perturbation";
  }

  // Deep-zoom gesture preview (see renderAll): on the first call after an
  // accurate render, copy the canvas -- still showing that frame, thanks to
  // preserveDrawingBuffer -- into snapTex, then redraw it mapped onto the
  // current view. The mapping is one similarity transform, snapshot uv =
  // k*R(dRot)*uv + offset, with k, dRot and offset computed here in float64
  // from the two views' difference, so it stays exact at any depth.
  function renderPreview(state) {
    if (resize()) needSnapshot = false; // a resize cleared the canvas
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, snapTex);
    if (needSnapshot && lastView) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // RGB, not RGBA: the context has alpha:false, and WebGL rejects
      // copying components the framebuffer doesn't have.
      gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, canvas.width, canvas.height, 0);
      snapView = { ...lastView, width: canvas.width, height: canvas.height };
      needSnapshot = false;
    }
    if (!snapView) return;

    const k = state.scale / snapView.scale;
    const dRot = (state.rotation || 0) - snapView.rotation;
    const c = Math.cos(dRot) * k, s = Math.sin(dRot) * k;
    const rc = Math.cos(snapView.rotation), rs = Math.sin(snapView.rotation);
    const dx = state.cx - snapView.cx, dy = state.cy - snapView.cy;
    const inv = 1 / (2 * snapView.scale);

    gl.useProgram(previewProg);
    gl.uniform2f(pu.resolution, canvas.width, canvas.height);
    gl.uniform1i(pu.snap, 4);
    gl.uniform2f(pu.snapRes, snapView.width, snapView.height);
    // Column-major: columns (c, s) and (-s, c) = k * rotation by dRot.
    gl.uniformMatrix2fv(pu.toSnap, false, [c, s, -s, c]);
    // R(-snapRotation) * (center - snapCenter) / (2 * snapScale)
    gl.uniform2f(pu.snapOffset, (dx * rc + dy * rs) * inv, (-dx * rs + dy * rc) * inv);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    canvas, render, renderPreview, setLUT, resize, perturbationSupported,
    setLiveDivisor(d) { liveDiv = d; },
    warmVariant,
    primeVariant,
    get compiledVariants() { return [...programs.keys()]; },
    // Until its first use, an optimistic yes on WebGL2 (see newtonDeep).
    get newtonDeepSupported() { return newtonDeep !== false; },
    get phoenixDeepSupported() { return phoenixDeep !== false; },
    webgl2: isWebGL2,
    get dpr() { return dpr; },
  };
}

