#!/usr/bin/env python3
"""Reference renderer ("oracle") for the color styles in shaders.js.

Iterates a view once in numpy float64 straight from world coordinates (not
the app's float32 perturbation path, so a deep view here is the right answer
a float32 perturbation render is compared with), keeps every per-pixel
quantity the styles need, and recolors them with each style. scripts/
oracle-compare.mjs renders the same view in the app and diffs the two.

Math follows shaders.js: escape radius 256 (ESCAPE_RADIUS_SQ = 65536), smooth
count n = iter + 1 - log2(log2|z|), the Mandelbrot / Burning Ship / Tricorn /
Celtic maps, Julia = z0 is the pixel. Palettes are parsed from the app's own
colormaps.js, and the lookup copies lutColor and the LUT texture rules
(256 texels, NEAREST, CLAMP_TO_EDGE, t == 1 is the end color), so Smooth at
bands 1 and shift 0 is what the app draws.

The style constants below (DE_RANGE, STRIPE_*, TRAP_*, HALO_*, PAPER_*) are mirrored in
shaders.js (the COLOR_*, HALO_* and PAPER_* constants); change both together.

The sine family (the L-plane and Sine Julia, ftype "sine") has its own iteration, render_fields_sine, with the
bailout |z| > 50, its smooth count (sineSmoothCount) and its colormap scale (0.1 per iteration).

Needs python3 with numpy and Pillow (`python3 -c "import numpy, PIL"`).

  oracle.py views                          the views as JSON (for oracle-compare.mjs)
  oracle.py render VIEW STYLE CMAP OUT.png [--density D] [--shift S] [--size PX]
            [--ss N] [--trap=X,Y]
  STYLE is one of smooth, bands, glow, stripes, stripes_atan, point, cross, relief, halo, paper
      writes OUT.png and OUT.mask.png (white = escaped); fields are cached in
      test-results/oracle/ (git-ignored)
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "test-results" / "oracle"

ESC_SQ = 65536.0
STRIPE_K = 5.0       # frequency of the atan stripe average (the style stripes_atan; the app uses the k = 4 algebraic one)
STRIPE_LAM = 0.85    # decay of the windowed stripe average (~7 iterations of memory)
STRIPE_GAIN = 2.2    # contrast gain around 0.5
DE_RANGE = 40.0      # distance estimate: glow fades out over this many CSS pixels
TRAP_RANGE = 1.0     # point trap distance that maps to the far end of the colormap
CROSS_RANGE = 0.2    # the same for the cross trap
HALO_RANGE = 40.0    # halo: |D| that reaches the brightest interior glow
HALO_FLOOR = 0.12    # palette position at the dimmest interior
HALO_DIM = 0.25      # brightness at the dimmest
HALO_GAIN = 1.1      # brightness added at the brightest
HALO_EPS = 1e-3      # halo on a Julia set: the |D| whose crossing time lights the interior
PAPER_BAND = 2.0     # paper cut: iterations of n per layer
PAPER_STEP = 0.1     # palette positions from one layer to the next
PAPER_SHADOW = 0.55  # darkest the shadow gets
PAPER_REACH = 8.0    # CSS pixels the shadow falls over
PAPER_CREAM = 0.4    # share of cream in each layer's color
PAPER_STOCK = np.array([0.97, 0.95, 0.9])
PAPER_HOLE = np.array([0.1, 0.08, 0.12])   # the set itself

# name: app fractal (FRACTAL_CONFIGS key), ftype, center, half-height (the
# app's "scale"), maxIter (what suggestedMaxIter gives), Julia c, trap center.
VIEWS = {
    "mandelbrot": dict(fractal="Mandelbrot", ftype="mandel", c=(-0.75, 0.0), s=1.4, it=300, trap=(-0.5, 0.0)),
    "seahorse": dict(fractal="Mandelbrot", ftype="mandel", c=(-0.743643887037151, 0.131825904205330), s=4e-10,
                     it=2000, trap=(0.25, 0.25)),
    "valley": dict(fractal="Mandelbrot", ftype="mandel", c=(-0.743643887037151, 0.131825904205330), s=6e-3,
                   it=770, trap=(0.25, 0.25)),
    "minibrot": dict(fractal="Mandelbrot", ftype="mandel", c=(-1.749003357223038, 0.0), s=1.5e-12, it=2000,
                     trap=(0.25, 0.25)),
    "ship": dict(fractal="Burn. Ship", ftype="ship", c=(-0.45, -0.6), s=1.7, it=300, trap=(-1.75, -0.03)),
    "armada": dict(fractal="Burn. Ship", ftype="ship", c=(-1.7595, -0.036), s=6.8e-2, it=300,
                   trap=(-1.7595, -0.036)),
    "twinships": dict(fractal="Burn. Ship", ftype="ship", c=(-1.9393403, -0.0017282), s=4.5e-5, it=600,
                      trap=(-1.9393403, -0.0017282)),
    "rabbit": dict(fractal="Julia:Rabbit", ftype="mandel", julia=(-0.12256, 0.74486), c=(0.0, 0.0), s=1.42,
                   it=300, trap=(0.0, 0.0)),
    "elephant": dict(fractal="Mandelbrot", ftype="mandel", c=(0.2825, 0.0105), s=1.2e-2, it=500,
                     trap=(0.2825, 0.0105)),
    "tricorn": dict(fractal="Tricorn", ftype="tricorn", c=(-0.475, 0.0), s=1.7, it=300, trap=(0.0, 0.0)),
    "celtic": dict(fractal="Celtic", ftype="celtic", c=(-0.775, 0.0), s=1.85, it=300, trap=(-0.5, 0.0)),
    "multibrot": dict(fractal="Multibrot³", ftype="mandel3", c=(0.0, 0.0), s=1.45, it=300, trap=(0.0, 0.0)),
    # Spider: z <- z^2 + c, then c <- z + c/2, from z = c = the pixel. Smooth, Bands, Stripes and the traps only (the
    # derivative styles are off for it in the app), so the D this script tracks is not meaningful for it.
    "spider": dict(fractal="Spider", ftype="spider", c=(-0.59, 0.0), s=1.3, it=300, trap=(0.0, 0.0)),
    "spiderfans": dict(fractal="Spider", ftype="spider", c=(-0.2, 0.9), s=0.6, it=370, trap=(0.0, 0.0)),
    # The sine family's L-plane and its Julia set (FTYPE.SINE): z <- L sin z, escape |z| > 50. The plane takes L = the
    # pixel and starts at the critical point pi/2; the Julia set takes a fixed L (the "julia" key) and starts at the
    # pixel. Smooth, Bands, Stripes and the traps only (the derivative styles are off for the sine types).
    "lplane": dict(fractal="Sine L plane", ftype="sine", c=(1.5, 0.0), s=3.9, it=120, trap=(0.0, 0.0)),
    "lplane-fans": dict(fractal="Sine L plane", ftype="sine", c=(5.008356546, 0.08547486), s=0.01, it=200, trap=(5.0, 0.085)),
    "lplane-rim": dict(fractal="Sine L plane", ftype="sine", c=(2.4, 0.17553971307238725), s=0.02, it=150, trap=(2.4, 0.18)),
    "sinejulia": dict(fractal="Sine Julia", ftype="sine", julia=(1.0, 0.4), c=(0.0, 0.0), s=2.4, it=100, trap=(0.0, 0.0)),
}

SINE_BAIL_SQ = 2500.0   # |z| > 50, the sine family's escape (SINE_BAIL2 in shaders.js)
SINE_LN_BAIL = np.log(50.0)
SINE_LNLN_BAIL = np.log(SINE_LN_BAIL)
SINE_COLOR_SCALE = 0.1  # colormap positions per iteration (the other types use 0.025)


def jacobian(ftype, x, y):
    """f(z) and its 2x2 Jacobian (p q / r s) for the Mandelbrot-family maps."""
    if ftype in ("mandel", "spider"):   # (the plain step; Spider's c-update is in render_fields)
        return x * x - y * y, 2 * x * y, 2 * x, -2 * y, 2 * y, 2 * x
    if ftype == "mandel3":
        # z^3 = (x^3 - 3xy^2, 3x^2y - y^3); derivative 3z^2 as a rotation-scaling matrix
        a, b = 3 * (x * x - y * y), 6 * x * y
        return x * x * x - 3 * x * y * y, 3 * x * x * y - y * y * y, a, -b, b, a
    if ftype == "ship":
        u, v = np.abs(x), np.abs(y)
        sx, sy = np.where(x >= 0, 1.0, -1.0), np.where(y >= 0, 1.0, -1.0)
        # f(u, v) = (u^2 - v^2, 2uv); chain rule through the fold diag(sx, sy)
        return u * u - v * v, 2 * u * v, 2 * u * sx, -2 * v * sy, 2 * v * sx, 2 * u * sy
    if ftype == "tricorn":
        return x * x - y * y, -2 * x * y, 2 * x, -2 * y, -2 * y, -2 * x
    if ftype == "celtic":
        a = x * x - y * y
        s = np.where(a >= 0, 1.0, -1.0)
        return np.abs(a), 2 * x * y, s * 2 * x, -s * 2 * y, 2 * y, 2 * x
    raise ValueError(ftype)


def render_fields_sine(name, tile=360, ss=2):
    """render_fields for the sine family (shaders.js renderSineFamily): z <- L sin z in float64 (numpy's own sin and
    cosh, so no range reduction), escape |z| > 50. Keeps the fields the styles read; the derivative fields stay zero
    because the app does not draw the styles that read them for this family. "lnprev" and "lnnow" are ln|z| before and
    after the escaping step (the smooth count's inputs, see smooth_n)."""
    v = VIEWS[name]
    H = W = tile * ss
    julia = v.get("julia")
    xs = ((np.arange(W) + 0.5) / W * 2 - 1)
    ys = (np.arange(H) + 0.5) / H * 2 - 1
    px = np.broadcast_to(v["c"][0] + xs[None, :] * v["s"], (H, W)).ravel().copy()
    py = np.broadcast_to(v["c"][1] - ys[:, None] * v["s"], (H, W)).ravel().copy()
    N = W * H
    if julia:   # L fixed, z starts at the pixel
        cx = np.full(N, julia[0]); cy = np.full(N, julia[1])
        zx, zy = px.copy(), py.copy()
    else:       # L is the pixel, z starts at the critical point pi/2
        cx, cy = px, py
        zx = np.full(N, np.pi / 2); zy = np.zeros(N)
    names = ("steps", "zabs", "logD", "E", "Eprev", "Ea", "Eaprev", "pt", "cross", "escaped", "gx", "gy", "Dn", "hcross",
             "lnprev", "lnnow")
    out = {k: np.zeros(N) for k in names}
    out["pt"][:] = 1e9; out["cross"][:] = 1e9
    out["hcross"][:] = -1.0
    idx = np.arange(N)
    E = np.zeros(N); Eprev = np.zeros(N); Ea = np.zeros(N); Eaprev = np.zeros(N)
    pt = np.full(N, 1e9); cr = np.full(N, 1e9)
    lam = STRIPE_LAM
    tx, ty = v["trap"]
    t0 = time.time()
    with np.errstate(all="ignore"):
        for it in range(1, v["it"] + 1):
            prev2 = zx * zx + zy * zy
            sx = np.sin(zx) * np.cosh(zy)
            sy = np.cos(zx) * np.sinh(zy)
            zx, zy = cx * sx - cy * sy, cx * sy + cy * sx
            a = 0.5 + 0.5 * np.sin(STRIPE_K * np.arctan2(zy, zx))
            r2 = np.maximum(zx * zx + zy * zy, 1e-30)
            aa = 0.5 + 0.5 * (2 * (2 * zx * zy / r2) * ((zx * zx - zy * zy) / r2))
            Eprev = E
            E = (lam * Eprev * (1 - lam ** (it - 1)) + (1 - lam) * a) / (1 - lam ** it)
            Eaprev = Ea
            Ea = (lam * Eaprev * (1 - lam ** (it - 1)) + (1 - lam) * aa) / (1 - lam ** it)
            if it >= 2:   # z1 sits at the pixel (the plane) or one step from it: not trapped, as in the shader
                dxp = zx - tx; dyp = zy - ty
                pt = np.minimum(pt, np.hypot(dxp, dyp))
                cr = np.minimum(cr, np.minimum(np.abs(dxp), np.abs(dyp)))
            esc = zx * zx + zy * zy > SINE_BAIL_SQ
            if esc.any():
                e = idx[esc]
                out["steps"][e] = it
                out["zabs"][e] = np.hypot(zx[esc], zy[esc])
                out["lnprev"][e] = 0.5 * np.log(np.maximum(prev2[esc], 1.0))
                out["lnnow"][e] = np.log(np.hypot(zx[esc], zy[esc]))
                for k, arr in (("E", E), ("Eprev", Eprev), ("Ea", Ea), ("Eaprev", Eaprev), ("pt", pt), ("cross", cr)):
                    out[k][e] = arr[esc]
                out["escaped"][e] = 1
                k = ~esc
                idx = idx[k]
                zx, zy, cx, cy = zx[k], zy[k], cx[k], cy[k]
                pt, cr, E, Eprev, Ea, Eaprev = pt[k], cr[k], E[k], Eprev[k], Ea[k], Eaprev[k]
                if idx.size == 0:
                    break
        if idx.size:  # never escaped: the trap minima still color it
            out["pt"][idx] = pt; out["cross"][idx] = cr
    print(f"{name}: iterated in {time.time() - t0:.1f}s, escaped {out['escaped'].mean() * 100:.1f}%",
          file=sys.stderr, flush=True)
    meta = dict(tile=tile, ss=ss, ps_out=2 * v["s"] / tile, maxit=v["it"], trap=list(v["trap"]), power=2,
                julia=bool(julia), sine=True, max_log10_D=0.0, frac_D_over_float32=0.0)
    return {k: a.reshape(H, W) for k, a in out.items()}, meta


def render_fields(name, tile=360, ss=2):
    """Iterate a square view of tile x tile output pixels (ss x ss samples
    each) once; returns the per-pixel fields and the metadata."""
    v = VIEWS[name]
    if v["ftype"] == "sine":
        return render_fields_sine(name, tile, ss)
    H = W = tile * ss
    julia = v.get("julia")
    xs = ((np.arange(W) + 0.5) / W * 2 - 1)
    ys = (np.arange(H) + 0.5) / H * 2 - 1
    px = np.broadcast_to(v["c"][0] + xs[None, :] * v["s"], (H, W)).ravel().copy()
    py = np.broadcast_to(v["c"][1] - ys[:, None] * v["s"], (H, W)).ravel().copy()  # +y up, like the app
    N = W * H
    if julia:
        cx = np.full(N, julia[0]); cy = np.full(N, julia[1])
        zx, zy = px.copy(), py.copy()
        da, db, dc_, dd = np.ones(N), np.zeros(N), np.zeros(N), np.ones(N)
        add = 0.0
    else:
        cx, cy = px, py
        zx = np.zeros(N); zy = np.zeros(N)
        if v["ftype"] == "spider":   # z = c = the pixel
            zx, zy = px.copy(), py.copy()
        da = np.zeros(N); db = np.zeros(N); dc_ = np.zeros(N); dd = np.zeros(N)
        add = 1.0
    tx, ty = v["trap"]
    names = ("steps", "zabs", "logD", "E", "Eprev", "Ea", "Eaprev", "pt", "cross", "escaped", "gx", "gy", "Dn", "hcross")
    out = {k: np.zeros(N) for k in names}
    out["pt"][:] = 1e9; out["cross"][:] = 1e9
    out["hcross"][:] = -1.0
    # halo style, Julia: the iteration where |D| first fell below HALO_EPS (-1: never), and |D| the step before
    hcross = np.full(N, -1.0); hprev = np.ones(N)
    idx = np.arange(N)
    E = np.zeros(N); Eprev = np.zeros(N)    # windowed stripe average (atan)
    Ea = np.zeros(N); Eaprev = np.zeros(N)  # the same with the algebraic k = 4 stripe (no trig)
    pt = np.full(N, 1e9); cr = np.full(N, 1e9)
    maxit = v["it"]
    t0 = time.time()
    lam = STRIPE_LAM
    with np.errstate(all="ignore"):
        for it in range(1, maxit + 1):
            fx, fy, p, q, r, s = jacobian(v["ftype"], zx, zy)
            na = p * da + q * dc_ + add
            nb = p * db + q * dd
            nc = r * da + s * dc_
            nd = r * db + s * dd + add
            da, db, dc_, dd = na, nb, nc, nd
            if julia:  # shaders.js haloCross: |D| (as haloNorm) first below HALO_EPS, interpolated in log between two steps
                dnh = np.maximum(np.sqrt(da ** 2 + db ** 2 + dc_ ** 2 + dd ** 2) / np.sqrt(2.0), 1e-30)
                hit = (hcross < 0) & (dnh < HALO_EPS)
                frac = (np.log(hprev) - np.log(HALO_EPS)) / np.maximum(np.log(hprev) - np.log(dnh), 1e-6)
                hcross = np.where(hit, (it - 1) + frac, hcross)
                hprev = dnh
            zx = fx + cx; zy = fy + cy
            if v["ftype"] == "spider":   # c <- z + c/2 with the new z
                cx = zx + 0.5 * cx; cy = zy + 0.5 * cy
            a = 0.5 + 0.5 * np.sin(STRIPE_K * np.arctan2(zy, zx))
            # sin(4 theta) from x and y alone: 2 * sin(2t) * cos(2t)
            r2 = np.maximum(zx * zx + zy * zy, 1e-30)
            aa = 0.5 + 0.5 * (2 * (2 * zx * zy / r2) * ((zx * zx - zy * zy) / r2))
            # exponential window with bias correction: E_n = R_n / (1 - lam^n), R_n = lam R_{n-1} + (1-lam) a_n
            Eprev = E
            E = (lam * Eprev * (1 - lam ** (it - 1)) + (1 - lam) * a) / (1 - lam ** it)
            Eaprev = Ea
            Ea = (lam * Eaprev * (1 - lam ** (it - 1)) + (1 - lam) * aa) / (1 - lam ** it)
            if it >= 2:  # z1 == c sits at the pixel, not on the orbit
                dxp = zx - tx; dyp = zy - ty
                pt = np.minimum(pt, np.hypot(dxp, dyp))
                cr = np.minimum(cr, np.minimum(np.abs(dxp), np.abs(dyp)))
            esc = zx * zx + zy * zy > ESC_SQ
            if esc.any():
                e = idx[esc]
                out["steps"][e] = it
                out["zabs"][e] = np.hypot(zx[esc], zy[esc])
                dn = np.sqrt(da[esc] ** 2 + db[esc] ** 2 + dc_[esc] ** 2 + dd[esc] ** 2) / np.sqrt(2.0)
                out["logD"][e] = np.log10(np.maximum(dn, 1e-300))
                for k, arr in (("E", E), ("Eprev", Eprev), ("Ea", Ea), ("Eaprev", Eaprev), ("pt", pt), ("cross", cr)):
                    out[k][e] = arr[esc]
                out["escaped"][e] = 1
                # J^T z, the gradient of 0.5 |z|^2 (the relief style's surface normal)
                out["gx"][e] = da[esc] * zx[esc] + dc_[esc] * zy[esc]
                out["gy"][e] = db[esc] * zx[esc] + dd[esc] * zy[esc]
                k = ~esc
                idx = idx[k]
                zx, zy, cx, cy = zx[k], zy[k], cx[k], cy[k]
                da, db, dc_, dd = da[k], db[k], dc_[k], dd[k]
                pt, cr, E, Eprev, Ea, Eaprev = pt[k], cr[k], E[k], Eprev[k], Ea[k], Eaprev[k]
                hcross, hprev = hcross[k], hprev[k]
                if idx.size == 0:
                    break
        if idx.size:  # never escaped: interior; the trap minima still color it
            out["pt"][idx] = pt; out["cross"][idx] = cr
            # the halo style lights the interior from D after the last iteration
            out["Dn"][idx] = np.sqrt(da ** 2 + db ** 2 + dc_ ** 2 + dd ** 2) / np.sqrt(2.0)
            out["hcross"][idx] = hcross
    print(f"{name}: iterated in {time.time() - t0:.1f}s, escaped {out['escaped'].mean() * 100:.1f}%",
          file=sys.stderr, flush=True)
    meta = dict(tile=tile, ss=ss, ps_out=2 * v["s"] / tile, maxit=maxit, trap=list(v["trap"]),
                power=3 if v["ftype"] == "mandel3" else 2, julia=bool(julia))
    lg = out["logD"][out["escaped"] > 0]
    meta["max_log10_D"] = float(lg.max()) if lg.size else 0.0
    meta["frac_D_over_float32"] = float((lg > 38.5).mean()) if lg.size else 0.0
    return {k: a.reshape(H, W) for k, a in out.items()}, meta


def cached_fields(name, tile, ss):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{name}-{tile}-{ss}-v4.npz"  # bump when render_fields changes
    if f.exists():
        z = np.load(f)
        return {k: z[k] for k in z.files if k != "meta"}, json.loads(str(z["meta"]))
    F, meta = render_fields(name, tile, ss)
    np.savez_compressed(f, **F, meta=np.array(json.dumps(meta)))
    return F, meta


def load_colormaps():
    src = (ROOT / "src/render/colormaps.js").read_text().split("const SOLID_COLORS")[0]
    maps = {}
    for block in src.split('{ name: "')[1:]:
        name = block.split('"')[0]
        stops = [(float(a), float(b), float(c), float(d)) for a, b, c, d in
                 re.findall(r"\[\s*([\d.]+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\]", block)]
        maps[name] = stops
    return maps


def build_lut(stops, size=256):
    """colormaps.js buildLUTBytes / sampleColor (a Uint8Array store truncates)."""
    out = np.zeros((size, 3))
    for i in range(size):
        t = i / (size - 1)
        col = None
        for (p0, r0, g0, b0), (p1, r1, g1, b1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                f = 0 if p1 == p0 else (t - p0) / (p1 - p0)
                col = (r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f)
                break
        out[i] = col if col else stops[-1][1:]
    return np.floor(out)


def lut_color(lut, t):
    """shaders.js lutColor over the app's 256x1 LUT texture (NEAREST, CLAMP_TO_EDGE)."""
    t = np.asarray(t, dtype=np.float64)
    u = np.where(np.abs(t - 1.0) < 1e-5, 255.5 / 256.0, t - np.floor(t))
    return lut[np.clip(np.floor(u * 256).astype(int), 0, 255)] / 255.0


def smooth_n(F, P):
    if P.get("sine"):
        # sineSmoothCount in shaders.js: the escape step i (0-based, so steps - 1) plus where in that step the orbit
        # crossed |z| = 50, placed linearly in ln ln |z|
        a = np.log(np.maximum(F["lnprev"], 0.1))
        b = np.log(np.maximum(F["lnnow"], SINE_LN_BAIL))
        return F["steps"] - 1 + np.clip((SINE_LNLN_BAIL - a) / np.maximum(b - a, 1e-6), 0.0, 1.0)
    # each iteration raises |z| to the map's power: log base 3 for Multibrot^3 (escapeColor's logBase)
    log_base = np.log2(3.0) if P.get("power", 2) == 3 else 1.0
    return np.maximum(F["steps"] - np.log2(np.log2(np.maximum(F["zabs"], 2.0))) / log_base, 0.0)


def style_t(F, P, style):
    """The colormap coordinate (before bands and shift) and which pixels are colored."""
    esc = F["escaped"] > 0
    k = SINE_COLOR_SCALE if P.get("sine") else 0.025   # colormap positions per iteration
    if style == "smooth":
        return smooth_n(F, P) * k, esc
    if style == "bands":
        return np.floor(F["steps"]) * k, esc
    if style == "relief":  # the smooth color; relief_shade() multiplies it
        return smooth_n(F, P) * k, esc
    if style == "glow":
        with np.errstate(all="ignore"):
            b = 2 * F["zabs"] * np.log(F["zabs"]) / (10.0 ** F["logD"])
        dist_px = b / P["ps_out"]
        return 1.0 - np.clip(np.log1p(dist_px) / np.log1p(DE_RANGE), 0, 1), esc
    if style in ("stripes", "stripes_atan"):
        # "stripes" is what the app draws (the algebraic k = 4 stripe); stripes_atan is the k = 5 atan version it replaced
        n = smooth_n(F, P)
        f = n - np.floor(n)
        e, ep = (F["Ea"], F["Eaprev"]) if style == "stripes" else (F["E"], F["Eprev"])
        A = ep + (e - ep) * f
        return np.clip(0.5 + (A - 0.5) * STRIPE_GAIN, 0, 1), esc
    if style in ("point", "cross"):
        v = F["pt" if style == "point" else "cross"]
        lo, hi = trap_range(v, F["escaped"] > 0, TRAP_RANGE if style == "point" else CROSS_RANGE)
        return 1.0 - np.clip((v - lo) / (hi - lo), 0, 1) ** 0.5, np.ones_like(esc)
    if style in ("point_fixed", "cross_fixed"):  # the pre-auto-range traps, for comparison
        if style == "point_fixed":
            return 1.0 - np.clip(F["pt"] / TRAP_RANGE, 0, 1) ** 0.5, np.ones_like(esc)
        return 1.0 - np.clip(F["cross"] / CROSS_RANGE, 0, 1) ** 0.5, np.ones_like(esc)
    raise ValueError(style)


def trap_range(v, escaped, fixed_hi):
    """The orbit traps' range as the app picks it (decodeTrapRange and trapRangeFor in
    app.js): the 2nd-98th percentile of the escaped pixels' distances, or of every pixel
    when fewer than 8% of them escaped (a view inside the set), blended with the old fixed
    range 0..fixed_hi: that range is kept while the percentile range is as wide as it is,
    and the colormap moves smoothly onto the percentile range as it narrows to half of
    the fixed one or less (so a shallow view looks as it always did)."""
    pool = v[escaped] if escaped.sum() >= max(24, 0.08 * v.size) else v.ravel()
    lo, hi = np.percentile(pool, [2.0, 98.0])
    if not hi > lo:
        hi = lo * 1.01 + 1e-9
    if lo >= fixed_hi:
        return float(lo), float(hi)
    w = min(1.0, max(0.0, (fixed_hi - hi) / (0.5 * fixed_hi)))
    lo, hi = w * lo, fixed_hi + w * (hi - fixed_hi)
    if not hi > lo:
        hi = lo * 1.01 + 1e-9
    return float(lo), float(hi)


STYLES = ("smooth", "bands", "glow", "stripes", "stripes_atan", "point", "cross", "point_fixed", "cross_fixed", "relief",
          "halo", "paper")

RELIEF_HEIGHT = 1.5
RELIEF_LIGHT = (-np.sqrt(0.5), np.sqrt(0.5))   # upper left of the screen (the oracle views aren't rotated)


def relief_shade(F):
    """Lambert shading of the unit gradient, as reliefColor in shaders.js."""
    gx, gy = F["gx"], F["gy"]
    with np.errstate(all="ignore"):
        n = np.hypot(gx, gy)
        ux, uy = np.where(n > 0, gx / n, 0.0), np.where(n > 0, gy / n, 0.0)
    return (ux * RELIEF_LIGHT[0] + uy * RELIEF_LIGHT[1] + RELIEF_HEIGHT) / (1.0 + RELIEF_HEIGHT)


def halo_image(F, P, lut, density, shift):
    """Halo, as haloColor and styleLit in shaders.js: Relief outside; inside the set (the cardioid and bulb
    shortcut is off for this style) the glow from |D| after the last iteration, or on a Julia set from the
    iteration where |D| fell below HALO_EPS (-1, never, is the brightest)."""
    t, _ = style_t(F, P, "relief")
    t = np.nan_to_num(t, nan=0.0, posinf=1.0, neginf=0.0)
    outside = lut_color(lut, t * density + shift) * np.nan_to_num(relief_shade(F), nan=0.6)[..., None]
    with np.errstate(all="ignore"):
        if P.get("julia"):
            h = F["hcross"]
            g = np.where(h < 0, 1.0, np.clip(np.log1p(np.maximum(h, 0.0)) / np.log1p(P["maxit"]), 0, 1))
        else:
            g = np.clip(np.log1p(F["Dn"]) / np.log1p(HALO_RANGE), 0, 1)
    inside = lut_color(lut, (HALO_FLOOR + (1.0 - HALO_FLOOR) * g ** 0.8) * density + shift) * (HALO_DIM + HALO_GAIN * g)[..., None]
    img = np.where((F["escaped"] > 0)[..., None], outside, inside)
    return np.clip(img, 0, 1)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def paper_image(F, P, lut, density, shift):
    """Paper cut, as paperColor in shaders.js: flat layers (PAPER_BAND iterations of the smooth count each) with
    a shadow to the lower right of every raised edge, from the count's gradient, and pixel anti-aliasing."""
    esc = F["escaped"] > 0
    log_base = np.log2(3.0) if P.get("power", 2) == 3 else 1.0
    with np.errstate(all="ignore"):
        r = np.where(esc, F["zabs"], 4.0)
        n_raw = F["steps"] - np.log2(np.log2(r)) / log_base
        n = np.maximum(n_raw, 0.0)
        g = np.hypot(F["gx"], F["gy"])
        ux, uy = np.where(g > 0, F["gx"] / g, 0.0), np.where(g > 0, F["gy"] / g, 0.0)
        # |grad n| = |J^T z| / (|z|^2 ln|z| ln P), in layers per CSS pixel
        grad_px = g / (r * r * np.log(r) * np.log(2.0) * log_base) * P["ps_out"] / PAPER_BAND
        q = n / PAPER_BAND
        band = np.floor(q)
        f = q - band
        to_light = -(ux * RELIEF_LIGHT[0] + uy * RELIEF_LIGHT[1]) * grad_px
        gp = np.maximum(grad_px, 1e-12)
        up, down = (1.0 - f) / gp, f / gp
        shadow = np.where(to_light > 0, 1.0 - smoothstep(0.0, PAPER_REACH, (1.0 - f) / to_light), 0.0)

        def layer(b, s):
            c = lut_color(lut, b * PAPER_STEP * density + shift) * (1.0 - PAPER_CREAM) + PAPER_STOCK * PAPER_CREAM
            return c * (1.0 - PAPER_SHADOW * s)[..., None]

        def mix(a, b, w):
            return a + (b - a) * w[..., None]

        c = layer(band, shadow)
        c = mix(c, layer(np.maximum(band - 1.0, 0.0), np.where((to_light > 0) & (band > 0), 1.0, 0.0)), np.clip(0.5 - down, 0, 0.5))
        c = mix(c, layer(band + 1.0, np.zeros_like(band)), np.clip(0.5 - up, 0, 0.5))
        c = mix(c, layer(q, np.full_like(q, 0.5)), smoothstep(0.45, 0.9, grad_px))
        c = np.where((n <= 0)[..., None], layer(np.zeros_like(band), np.zeros_like(band)), c)
    return np.where(esc[..., None], np.nan_to_num(c, nan=0.5), PAPER_HOLE)


def colorize(F, meta, style, lut, density=1.0, shift=0.0):
    """uint8 image and the escaped mask, averaged down from the ss x ss samples."""
    if style in ("halo", "paper"):
        img = (halo_image if style == "halo" else paper_image)(F, meta, lut, density, shift)
    else:
        t, colored = style_t(F, meta, style)
        t = np.nan_to_num(t, nan=0.0, posinf=1.0, neginf=0.0)
        img = lut_color(lut, t * density + shift)
        if style == "relief":
            img = img * np.nan_to_num(relief_shade(F), nan=0.6)[..., None]
        img[~colored] = 0
    ss = meta["ss"]
    n = img.shape[0] // ss
    img = img.reshape(n, ss, n, ss, 3).mean(axis=(1, 3))
    mask = (F["escaped"].reshape(n, ss, n, ss).mean(axis=(1, 3)) > 0.5)
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), mask


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("views")
    r = sub.add_parser("render")
    r.add_argument("view"); r.add_argument("style"); r.add_argument("cmap"); r.add_argument("out")
    r.add_argument("--density", type=float, default=1.0)
    r.add_argument("--shift", type=float, default=0.0)
    r.add_argument("--size", type=int, default=360)
    r.add_argument("--ss", type=int, default=2)
    r.add_argument("--trap", help="trap center as X,Y (written --trap=-0.5,0 when X is negative)")
    r.add_argument("--flip", action="store_true",
                   help="the app's flipped view (the Burning Ship's upright picture, state.flipY): its relief light is "
                        "at the screen's upper left, which is -Im, so in this +Im-up image it comes from the lower left")
    a = ap.parse_args()
    global RELIEF_LIGHT
    if a.cmd == "render" and a.flip:
        RELIEF_LIGHT = (-np.sqrt(0.5), -np.sqrt(0.5))
    if a.cmd == "views":
        print(json.dumps(VIEWS))
        return
    F, meta = cached_fields(a.view, a.size, a.ss)
    if a.trap:
        # the trap minima are baked into the cached fields: re-iterate for another center
        VIEWS[a.view]["trap"] = tuple(float(v) for v in a.trap.split(","))
        F, meta = render_fields(a.view, a.size, a.ss)
    maps = load_colormaps()
    img, mask = colorize(F, meta, a.style, build_lut(maps[a.cmap]), a.density, a.shift)
    Image.fromarray(img).save(a.out)
    Image.fromarray((mask * 255).astype(np.uint8)).save(a.out.replace(".png", ".mask.png"))
    print(json.dumps(dict(max_log10_D=meta["max_log10_D"], frac_D_over_float32=meta["frac_D_over_float32"])))


if __name__ == "__main__":
    main()
