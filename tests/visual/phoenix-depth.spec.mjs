// How deep the Phoenix deep-zoom shader stays right (renderer.js phoenixDeepProbe, deepzoom.js minScaleFor): a 16x16 probe
// of the deep shader's iteration counts at one view per scale, against an independent BigInt iteration of each pixel's own
// c (or starting z, in Julia mode), with the view's doubles as the exact center. Plain behavior checks, no screenshot baselines;
// the table it logs is what the Phoenix floor was set from.
import { test, expect } from "@playwright/test";

/* global mainRenderer, toExact, TELEPORT_DESTINATIONS, FRACTAL_CONFIGS */

const PHOENIX_MIN_SCALE = 1e-13; // deepzoom.js PHOENIX_MIN_SCALE (read here as a number: the page's copy is not a test global)

let pageErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("fractalAtlas.visited", "1");
      localStorage.setItem("fractalAtlas.welcomeDismissed", "1");
    } catch { /* storage blocked */ }
  });
  await page.goto("index.html");
  await page.waitForFunction(() => typeof mainRenderer === "object" && typeof toExact === "function");
});

test.afterEach(() => {
  expect(pageErrors, "uncaught page errors").toEqual([]);
});

// Per scale: the share of probe pixels where the deep shader's count is within 1 of the BigInt truth (and it escaped
// or not the same way).
const measure = (page, base, scales) => page.evaluate(({ base, scales }) => {
  const F = 256, FB = BigInt(F), limit = 65536n << (2n * FB);
  const n = 16, out = [];
  const half = (v) => -(v >> 1n); // P = -0.5 times the previous z
  const truthIter = (zr0, zi0, cr, ci, maxIter) => {
    let zr = zr0, zi = zi0, pr = 0n, pi = 0n;
    for (let k = 0; k < maxIter; k++) {
      const nr = ((zr * zr - zi * zi) >> FB) + cr + half(pr);
      const ni = ((zr * zi) >> (FB - 1n)) + ci + half(pi);
      pr = zr; pi = zi; zr = nr; zi = ni;
      if (zr * zr + zi * zi > limit) return k;
    }
    return Infinity;
  };
  // Does the point (as BigInts) stay bounded for maxIter steps?
  const bounded = (b, px, py) => (b.isJulia
    ? truthIter(px, py, toExact(b.juliaC[0], F), toExact(b.juliaC[1], F), b.maxIter)
    : truthIter(0n, 0n, px, py, b.maxIter)) === Infinity;
  // A point on the set's boundary to ~1e-21 of the base view: scan a grid for a neighbouring pair that is bounded and
  // not, then bisect between them in BigInt. The double of that point is the test view's center, so every depth has
  // structure (a center away from the boundary shows nothing but one flat band at depth).
  const boundary = (b) => {
    for (const scale of [1e-9, 1e-7, 1e-5, 1e-4, 1e-3, 1e-2]) {
      const g = 24, at = (x, y) => [toExact(b.cx + ((x + 0.5 - g / 2) / g) * scale * 2, F), toExact(b.cy + ((y + 0.5 - g / 2) / g) * scale * 2, F)];
      for (let y = 0; y < g; y++) {
        for (let x = 0; x + 1 < g; x++) {
          let p = at(x, y), q = at(x + 1, y);
          const bp = bounded(b, p[0], p[1]);
          if (bp === bounded(b, q[0], q[1])) continue;
          for (let k = 0; k < 60; k++) {
            const m = [(p[0] + q[0]) >> 1n, (p[1] + q[1]) >> 1n];
            if (bounded(b, m[0], m[1]) === bp) p = m; else q = m;
          }
          return { cx: Number(p[0]) / 2 ** F, cy: Number(p[1]) / 2 ** F };
        }
      }
    }
    return null;
  };
  const edge = boundary(base);
  if (!edge) return null;
  const view0 = { ...base, ...edge };
  for (const scale of scales) {
    const v = { ...view0, scale };
    const probe = mainRenderer.phoenixDeepProbe(v, n);
    if (!probe) return null;
    let okShader = 0, escapedCount = 0;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const uvx = (x + 0.5 - 0.5 * n) / n, uvy = (y + 0.5 - 0.5 * n) / n;
        // the exact pixel coordinate: the center (a double, exactly) plus the offset uv * scale * 2
        const px = toExact(v.cx, F) + toExact(uvx * scale * 2, F), py = toExact(v.cy, F) + toExact(uvy * scale * 2, F);
        const it = v.isJulia
          ? truthIter(px, py, toExact(v.juliaC[0], F), toExact(v.juliaC[1], F), v.maxIter)
          : truthIter(0n, 0n, px, py, v.maxIter);
        const i = y * n + x;
        if (it !== Infinity) escapedCount++;
        const agree = probe.escaped[i] ? (it !== Infinity && Math.abs(probe.used[i] - it) <= 1) : it === Infinity;
        if (agree) okShader++;
      }
    }
    out.push({ scale, shader: okShader / (n * n), escaped: escapedCount / (n * n) });
  }
  return out;
}, { base, scales });

const SCALES = [1e-9, 1e-10, 1e-11, 7e-12, 3e-12, 1e-12, 3e-13, 1e-13, 1e-14, 1e-15];

test("Phoenix parameter space: the deep shader against a BigInt iteration, by scale", async ({ page }) => {
  const rows = await measure(page, { cx: -0.6034929369570187, cy: 0.4995077460562414, maxIter: 2000, isJulia: false, juliaC: [0, 0] }, SCALES);
  expect(rows, "Phoenix deep zoom is available").not.toBeNull();
  console.log("phoenix parameter-space agreement:", rows.map((r) => `${r.scale}: ${(r.shader * 100).toFixed(0)}% (escaped ${(r.escaped * 100).toFixed(0)}%)`).join("  "));
  expect(rows[0].shader, "at 1e-9 the shader agrees with the truth").toBeGreaterThan(0.95);
  for (const r of rows.filter((x) => x.scale >= PHOENIX_MIN_SCALE)) expect(r.shader, `parameter space at ${r.scale}`).toBeGreaterThan(0.95);
});

// Julia mode, from four starting centers (Ember Spiral's, and three more) so one boundary doesn't decide the answer; each
// is moved onto the set's boundary by bisection. The Phoenix Julia preset's c.
const JULIA_STARTS = [null, [0.1, 0.2], [-0.3, 0.5], [0.6, -0.2]];
for (const [index, start] of JULIA_STARTS.entries()) {
  test(`Phoenix Julia, start ${index}: the deep shader against a BigInt iteration, by scale`, async ({ page }) => {
    const view = await page.evaluate((s) => {
      const d = TELEPORT_DESTINATIONS.find((p) => p.label === "Ember Spiral");
      return { cx: s ? s[0] : Number(d.re), cy: s ? s[1] : Number(d.im), maxIter: 2000, isJulia: true, juliaC: FRACTAL_CONFIGS[d.fractal].juliaC };
    }, start);
    const rows = await measure(page, view, SCALES);
    if (rows === null) { console.log(`phoenix julia start ${index}: no boundary found near the start`); return; }
    console.log(`phoenix julia start ${index} agreement:`, rows.map((r) => `${r.scale}: ${(r.shader * 100).toFixed(0)}% (escaped ${(r.escaped * 100).toFixed(0)}%)`).join("  "));
    expect(rows[0].shader).toBeGreaterThan(0.9);
    // Down to the floor the shader keeps most pixels (the Julia views' own grain is 1-11% from 1e-9 on); past it, not.
    for (const r of rows.filter((x) => x.scale >= PHOENIX_MIN_SCALE)) expect(r.shader, `Julia at ${r.scale}`).toBeGreaterThan(0.85);
  });
}
