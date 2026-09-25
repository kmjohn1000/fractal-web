"""Renders the 1024px App Store icon (icons/icon-1024.png) to match the
existing web icons: the full Mandelbrot set in Magma, 3x3 supersampled.
Run: python3 scripts/render_icon.py  (needs numpy + Pillow)."""
import numpy as np
from PIL import Image

SIZE, SS, MAX_ITER = 1024, 3, 400
X0, X1 = -1.68, 0.565                # same framing as icons/icon-512.png
MAGMA = np.array([                  # colormaps.js "Magma" stops
    [0.00, 0, 0, 4], [0.13, 28, 16, 68], [0.29, 79, 18, 123],
    [0.43, 129, 37, 129], [0.58, 181, 54, 122], [0.71, 229, 80, 100],
    [0.83, 251, 135, 97], [0.92, 254, 194, 135], [1.00, 252, 253, 191]])
INTERIOR = np.array([8, 6, 20])

n = SIZE * SS
half = (X1 - X0) / 2
xs = np.linspace(X0, X1, n)
ys = np.linspace(half, -half, n)
c = xs[None, :] + 1j * ys[:, None]
z = np.zeros_like(c)
nu = np.full(c.shape, np.nan)
alive = np.ones(c.shape, bool)
for i in range(MAX_ITER):
    z[alive] = z[alive] ** 2 + c[alive]
    esc = alive & (np.abs(z) > 256)
    nu[esc] = i + 1 - np.log2(np.log(np.abs(z[esc])))
    alive &= ~esc

t = np.clip(0.02 + 0.98 * (np.nan_to_num(nu) / 120.0) ** 0.7, 0, 1)
rgb = np.stack([np.interp(t, MAGMA[:, 0], MAGMA[:, k]) for k in (1, 2, 3)], -1)
rgb[np.isnan(nu)] = INTERIOR
rgb = rgb.reshape(SIZE, SS, SIZE, SS, 3).mean(axis=(1, 3))
Image.fromarray(rgb.round().astype(np.uint8)).save("icons/icon-1024.png")
print("wrote icons/icon-1024.png")
