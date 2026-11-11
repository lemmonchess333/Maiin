#!/usr/bin/env python3
"""Build the six straight-arm pulldown frames from the three Gemini drawings.

    python3 docs/exercise-art/sources/straight-arm-pulldown/2026-11-07/build.py

Reads generated/{start,mid,finish}.jpg (gemini-3-pro-image, 2048 x 2048, the
bytes exactly as the API returned them) and writes
docs/exercise-art/pilots/redraw-20261107/straight-arm-pulldown/1.png ... 6.png.

Nothing is drawn here. Each frame is one generated drawing with these
deterministic steps, in order:

1. The cable station below y=400 (the column, rods, stack and base) is the
   start drawing's, in every frame, blended into the frame's own station over
   32 rows at y=400-432. Above y=400 each frame keeps its own pulleys and
   cables. No athlete pixel and no cable lies in the replaced region.
2. The selected block (the five plates and the cap on top) is moved as one
   rigid sprite to the height the scene's cable ladder gives
   (docs/exercise-art/scenes/straight-arm-pulldown.json): stack gap =
   100 mm + payout / 2, drawn at 0.92 px per mm, the start drawing's own gap
   of 92 px being 100 mm. The rods it uncovers are the start drawing's rods,
   repeated down the column.
3. Saturated violet is shifted to the library's primary #7B72E9 (the start
   drawing's median lat violet was #7C72DC: +13 blue, -1 red, weighted by
   saturation so the lilac and the anti-aliased edges move less).
4. Near-black (every channel <= 6) is set to pure black.
5. One crop, the same for every frame: x 195-1820, y 86-2036 (5:6). It keeps
   about 50-70 px of black round the athlete, the station's base and its
   right post, and cuts the top of the station's crossbar off above the
   pulleys, so the athlete is 94% of the canvas height (89% uncropped).
6. One uniform Lanczos resample of that crop to 1000 x 1200.
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
OUT = ROOT / "docs/exercise-art/pilots/redraw-20261107/straight-arm-pulldown"
CROP = (195, 86, 1820, 2036)  # x0, y0, x1, y1 in the 2048-px drawings
SIZE = (1000, 1200)

# Station geometry in the start drawing, 2048-px coordinates.
STATION = (1480, 400, 1800, 1960)  # x0, y0, x1, y1: column, stack, base
BASE_LEFT = (1270, 1680, 1480, 1960)  # the base's front foot
FEATHER = 32
INNER_X = (1505, 1678)  # between the column's posts
SPRITE_Y = (1104, 1284)  # cap top to block bottom
REST_TOP = 1376  # top of the twelve resting plates
ABOVE_ROW = 1090  # rods above the block
GAP_ROW = 1330  # rods in the gap below the block
PX_PER_MM = (REST_TOP - SPRITE_Y[1]) / 100  # 0.92: the drawn 92 px gap is 100 mm

# Ladder: payout per frame (mm), 2:1 routing, 100 mm starting gap.
PAYOUT = {"start": 0, "mid": 490, "finish": 880}
ORDER = ["start", "start", "mid", "finish", "mid", "start"]

TARGET = np.array([123, 114, 233], float)  # #7B72E9
MEASURED = np.array([124, 114, 220], float)  # start drawing's median lat violet


def load(name):
    return np.asarray(Image.open(HERE / "generated" / f"{name}.jpg").convert("RGB")).astype(float)


def station_patch(start, payout):
    """The start drawing's station with the selected block at this payout's gap."""
    x0, y0, x1, y1 = STATION
    patch = start[y0:y1, x0:x1].copy()
    ix0, ix1 = INNER_X[0] - x0, INNER_X[1] - x0
    s0, s1 = SPRITE_Y[0] - y0, SPRITE_Y[1] - y0
    sprite = patch[s0:s1, ix0:ix1].copy()
    above = patch[ABOVE_ROW - y0, ix0:ix1].copy()
    gap_row = patch[GAP_ROW - y0, ix0:ix1].copy()
    gap_mm = 100 + payout / 2
    bottom = round(REST_TOP - gap_mm * PX_PER_MM) - y0
    top = bottom - (s1 - s0)
    # Clear the block's old place: rods above it, the gap's rods below it.
    for r in range(min(top, ABOVE_ROW - y0), GAP_ROW - y0):
        patch[r, ix0:ix1] = above if r < top else gap_row
    patch[top:bottom, ix0:ix1] = sprite
    return patch, gap_mm, (bottom + y0)


def composite(frame, start, payout):
    out = frame.copy()
    x0, y0, x1, y1 = STATION
    patch, gap_mm, bottom = station_patch(start, payout)
    w = np.clip((np.arange(y1 - y0) / FEATHER), 0, 1)[:, None, None]
    out[y0:y1, x0:x1] = frame[y0:y1, x0:x1] * (1 - w) + patch * w
    bx0, by0, bx1, by1 = BASE_LEFT
    out[by0:by1, bx0:bx1] = start[by0:by1, bx0:bx1]
    return out, gap_mm, bottom


def violet(img):
    mx, mn = img.max(-1), img.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    hue = (b > g + 15) & (b >= r)
    w = np.clip((sat - 0.12) / (0.48 - 0.12), 0, 1) * hue
    return np.clip(img + w[..., None] * (TARGET - MEASURED), 0, 255)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    start = load("start")
    built = {}
    for name in ("start", "mid", "finish"):
        frame, gap_mm, bottom = composite(load(name), start, PAYOUT[name])
        frame = violet(frame)
        frame[(frame <= 6).all(-1)] = 0
        img = Image.fromarray(frame.round().astype(np.uint8)).crop(CROP).resize(SIZE, Image.LANCZOS)
        built[name] = img
        print(f"{name}: payout {PAYOUT[name]} mm, gap {gap_mm:.0f} mm, block bottom y={bottom} (2048 px)")
    for i, name in enumerate(ORDER, 1):
        built[name].save(OUT / f"{i}.png", optimize=True)
    print(f"six frames at {SIZE[0]}x{SIZE[1]} in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
