#!/usr/bin/env python3
"""Key the flat magenta background to alpha, find the hexagon, and
normalise it into the app's seal frame: a square where the hexagon's
bounding box spans x 7..93 and y 3..97 of 100 (SEAL_HEX in
sealGeometry.ts). Writes a PNG (alpha) and a WebP.
Usage: python3 scripts/art/key-hexagon.py in.png out-stem [size]"""
import sys, numpy as np
from PIL import Image, ImageFilter
src, stem = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.int16)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
# Magenta-ness: high R and B, low G. Soft threshold → alpha ramp.
mag = (np.minimum(r, b) - g)  # ~255 on pure magenta, ≤0 elsewhere
alpha = np.clip((140 - mag) / 60.0, 0, 1)  # 1 when mag ≤ 80, 0 when ≥ 140
# Despill: where partly transparent, pull residual magenta out of the colour.
rgb = a.astype(np.float32)
spill = np.clip((np.minimum(r, b) - g), 0, 255).astype(np.float32) * (1 - alpha)
rgb[..., 0] -= spill * 0.5
rgb[..., 2] -= spill * 0.5
rgb = np.clip(rgb, 0, 255).astype(np.uint8)
A = (alpha * 255).astype(np.uint8)
# Hexagon bbox from the solid pixels.
solid = alpha > 0.6
ys, xs = np.where(solid)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
w, h = x1 - x0 + 1, y1 - y0 + 1
print(f"hex bbox x{x0}-{x1} y{y0}-{y1}  w{w} h{h} ratio {w/h:.3f}")
rgba = np.dstack([rgb, A])
crop = Image.fromarray(rgba, "RGBA").crop((x0, y0, x1 + 1, y1 + 1))
# Map the bbox to the frame: 86% wide, 94% tall, centred.
tw, th = round(size * 0.86), round(size * 0.94)
fitted = crop.resize((tw, th), Image.LANCZOS)
out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
out.paste(fitted, ((size - tw) // 2, round(size * 0.03)))
out.save(stem + ".png")
out.save(stem + ".webp", quality=88, method=6)
import os
print("wrote", stem + ".png", os.path.getsize(stem + ".png"), stem + ".webp", os.path.getsize(stem + ".webp"))
