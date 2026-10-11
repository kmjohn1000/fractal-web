"""Renders the app icon: a close-up of Mandelbrot's Seahorse Valley in the
Classic colormap (bright spirals, no large dark area, so it stands out on
dark backgrounds), 2x2 supersampled. Writes the 1024px App Store icon, the
iOS asset-catalog copy, and the web/PWA sizes (the picture is full-bleed
texture, so the maskable icons are the same image).
Then recompresses them: lossless for the 1024px master (pngquant shows faint
banding in its smooth gradients when enlarged), pngquant for the smaller
sizes (about 70% smaller, no visible difference).
Run: python3 scripts/render_icon.py  (needs numpy + Pillow, and
`brew install oxipng pngquant`)."""
import subprocess

import numpy as np
from PIL import Image

SIZE, SS, MAX_ITER = 1024, 2, 1500
CENTER = (-0.743643887037151, 0.131825904205330)   # Seahorse Valley
WIDTH = 0.0005
CLASSIC = np.array([                # colormaps.js "Classic" stops
    [0.00, 0, 7, 100], [0.16, 32, 107, 203], [0.42, 237, 255, 255],
    [0.64, 255, 170, 0], [0.86, 70, 20, 0], [1.00, 0, 7, 100]])
INTERIOR = np.array([6, 6, 30])
CYCLE = 60.0                        # iterations per trip through the colormap

n = SIZE * SS
xs = np.linspace(CENTER[0] - WIDTH / 2, CENTER[0] + WIDTH / 2, n)
ys = np.linspace(CENTER[1] + WIDTH / 2, CENTER[1] - WIDTH / 2, n)
c = xs[None, :] + 1j * ys[:, None]
z = np.zeros_like(c)
nu = np.full(c.shape, np.nan)
alive = np.ones(c.shape, bool)
for i in range(MAX_ITER):
    z[alive] = z[alive] ** 2 + c[alive]
    esc = alive & (np.abs(z) > 256)
    nu[esc] = i + 1 - np.log2(np.log(np.abs(z[esc])))
    alive &= ~esc

t = (np.nan_to_num(nu) / CYCLE) % 1.0
rgb = np.stack([np.interp(t, CLASSIC[:, 0], CLASSIC[:, k]) for k in (1, 2, 3)], -1)
rgb[np.isnan(nu)] = INTERIOR
rgb = rgb.reshape(SIZE, SS, SIZE, SS, 3).mean(axis=(1, 3))
master = Image.fromarray(rgb.round().astype(np.uint8))

masters = ["icons/icon-1024.png",
           "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"]
for path in masters:
    master.save(path)
small = []
for name, px in [("icon-512", 512), ("icon-192", 192), ("icon-maskable-512", 512),
                 ("icon-maskable-192", 192), ("apple-touch-icon", 180), ("favicon-32", 32)]:
    small.append(f"icons/{name}.png")
    master.resize((px, px), Image.Resampling.LANCZOS).save(small[-1])
for path in small:
    subprocess.run(["pngquant", "--quality", "85-98", "--speed", "1", "--strip",
                    "--force", "--output", path, path], check=True)
subprocess.run(["oxipng", "-o", "4", "--strip", "safe", "-q", *masters, *small], check=True)
print("wrote icons/*.png and the iOS AppIcon")
