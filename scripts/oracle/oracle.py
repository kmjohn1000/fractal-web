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

The style constants below (DE_RANGE, STRIPE_*, TRAP_*) are mirrored in
shaders.js (the COLOR_* constants); change both together.

Needs python3 with numpy and Pillow (`python3 -c "import numpy, PIL"`).

  oracle.py views                          the views as JSON (for oracle-compare.mjs)
  oracle.py render VIEW STYLE CMAP OUT.png [--density D] [--shift S] [--size PX]
            [--ss N] [--trap X Y] [--stripe atan|alg]
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
STRIPE_K = 5.0       # frequency of the atan stripe average
STRIPE_LAM = 0.85    # decay of the windowed stripe average (~7 iterations of memory)
STRIPE_GAIN = 2.2    # contrast gain around 0.5
DE_RANGE = 40.0      # distance estimate: glow fades out over this many CSS pixels
TRAP_RANGE = 1.0     # point trap distance that maps to the far end of the colormap
CROSS_RANGE = 0.2    # the same for the cross trap

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
}


def jacobian(ftype, x, y):
    """f(z) and its 2x2 Jacobian (p q / r s) for the Mandelbrot-family maps."""
    if ftype == "mandel":
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


def render_fields(name, tile=360, ss=2):
    """Iterate a square view of tile x tile output pixels (ss x ss samples
    each) once; returns the per-pixel fields and the metadata."""
    v = VIEWS[name]
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
        da = np.zeros(N); db = np.zeros(N); dc_ = np.zeros(N); dd = np.zeros(N)
        add = 1.0
    tx, ty = v["trap"]
    names = ("steps", "zabs", "logD", "E", "Eprev", "Ea", "Eaprev", "pt", "cross", "escaped")
    out = {k: np.zeros(N) for k in names}
    out["pt"][:] = 1e9; out["cross"][:] = 1e9
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
            zx = fx + cx; zy = fy + cy
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
                k = ~esc
                idx = idx[k]
                zx, zy, cx, cy = zx[k], zy[k], cx[k], cy[k]
                da, db, dc_, dd = da[k], db[k], dc_[k], dd[k]
                pt, cr, E, Eprev, Ea, Eaprev = pt[k], cr[k], E[k], Eprev[k], Ea[k], Eaprev[k]
                if idx.size == 0:
                    break
        if idx.size:  # never escaped: interior; the trap minima still color it
            out["pt"][idx] = pt; out["cross"][idx] = cr
    print(f"{name}: iterated in {time.time() - t0:.1f}s, escaped {out['escaped'].mean() * 100:.1f}%",
          file=sys.stderr, flush=True)
    meta = dict(tile=tile, ss=ss, ps_out=2 * v["s"] / tile, maxit=maxit, trap=list(v["trap"]),
                power=3 if v["ftype"] == "mandel3" else 2)
    lg = out["logD"][out["escaped"] > 0]
    meta["max_log10_D"] = float(lg.max()) if lg.size else 0.0
    meta["frac_D_over_float32"] = float((lg > 38.5).mean()) if lg.size else 0.0
    return {k: a.reshape(H, W) for k, a in out.items()}, meta


def cached_fields(name, tile, ss):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{name}-{tile}-{ss}-v2.npz"  # bump when render_fields changes
    if f.exists():
        z = np.load(f)
        return {k: z[k] for k in z.files if k != "meta"}, json.loads(str(z["meta"]))
    F, meta = render_fields(name, tile, ss)
    np.savez_compressed(f, **F, meta=np.array(json.dumps(meta)))
    return F, meta


def load_colormaps():
    src = (ROOT / "colormaps.js").read_text().split("const SOLID_COLORS")[0]
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
    # each iteration raises |z| to the map's power: log base 3 for Multibrot^3 (escapeColor's logBase)
    log_base = np.log2(3.0) if P.get("power", 2) == 3 else 1.0
    return np.maximum(F["steps"] - np.log2(np.log2(np.maximum(F["zabs"], 2.0))) / log_base, 0.0)


def style_t(F, P, style):
    """The colormap coordinate (before bands and shift) and which pixels are colored."""
    esc = F["escaped"] > 0
    if style == "smooth":
        return smooth_n(F, P) * 0.025, esc
    if style == "bands":
        return np.floor(F["steps"]) * 0.025, esc
    if style == "glow":
        with np.errstate(all="ignore"):
            b = 2 * F["zabs"] * np.log(F["zabs"]) / (10.0 ** F["logD"])
        dist_px = b / P["ps_out"]
        return 1.0 - np.clip(np.log1p(dist_px) / np.log1p(DE_RANGE), 0, 1), esc
    if style in ("stripes", "stripes_alg"):
        n = smooth_n(F, P)
        f = n - np.floor(n)
        e, ep = (F["E"], F["Eprev"]) if style == "stripes" else (F["Ea"], F["Eaprev"])
        A = ep + (e - ep) * f
        return np.clip(0.5 + (A - 0.5) * STRIPE_GAIN, 0, 1), esc
    if style == "point":
        return 1.0 - np.clip(F["pt"] / TRAP_RANGE, 0, 1) ** 0.5, np.ones_like(esc)
    if style == "cross":
        return 1.0 - np.clip(F["cross"] / CROSS_RANGE, 0, 1) ** 0.5, np.ones_like(esc)
    raise ValueError(style)


STYLES = ("smooth", "bands", "glow", "stripes", "stripes_alg", "point", "cross")


def colorize(F, meta, style, lut, density=1.0, shift=0.0):
    """uint8 image and the escaped mask, averaged down from the ss x ss samples."""
    t, colored = style_t(F, meta, style)
    t = np.nan_to_num(t, nan=0.0, posinf=1.0, neginf=0.0)
    img = lut_color(lut, t * density + shift)
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
    r.add_argument("--trap", type=float, nargs=2)
    a = ap.parse_args()
    if a.cmd == "views":
        print(json.dumps(VIEWS))
        return
    F, meta = cached_fields(a.view, a.size, a.ss)
    if a.trap:
        # the trap minima are baked into the cached fields: re-iterate for another center
        VIEWS[a.view]["trap"] = tuple(a.trap)
        F, meta = render_fields(a.view, a.size, a.ss)
    maps = load_colormaps()
    img, mask = colorize(F, meta, a.style, build_lut(maps[a.cmap]), a.density, a.shift)
    Image.fromarray(img).save(a.out)
    Image.fromarray((mask * 255).astype(np.uint8)).save(a.out.replace(".png", ".mask.png"))
    print(json.dumps(dict(max_log10_D=meta["max_log10_D"], frac_D_over_float32=meta["frac_D_over_float32"])))


if __name__ == "__main__":
    main()
