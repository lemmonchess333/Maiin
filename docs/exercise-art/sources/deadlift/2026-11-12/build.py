#!/usr/bin/env python3
"""Line up the three front-view deadlift drawings for the card and Home's animation.

    python3 docs/exercise-art/sources/deadlift/2026-11-12/build.py
    npx tsx docs/exercise-art/sources/deadlift/2026-11-12/card.ts
    npm run art:cutouts -- --only=deadlift

The owner asked for it on 2026-11-12: the deadlift's card was drawn from
behind and "just looks weird" on Home; Home's card and animation should face
the person. The form guide keeps the reviewed 2026-10-14 frames, drawn from
behind, because the back angle and the muscles its key names (glutes,
hamstrings, erectors) are what a deadlift is taught by (the owner agreed the
same day). provenance.json has every call.

Reads generated/{start,mid,lockout}.jpg (gemini-3-pro-image, 2048 x 2048, the
bytes exactly as the API returned them) and writes
docs/exercise-art/pilots/redraw-20261112/deadlift-front/{start,knees,lockout}.png.
start.png is the card (card.ts keys it to transparency); start.png and
lockout.png are the two ends of Home's animation (motion README).

Nothing is drawn here. Each drawing goes through these deterministic steps:

1. The mid drawing is moved up 38 px. Measured, not chosen: the near shoe's
   sole is at y=1955 in mid.jpg and y=1917 in start.jpg and lockout.jpg, and
   its left and right edges agree within 8 px (790-1014 against 782-1021).
   The start and lockout drawings already share the near shoe to the pixel,
   because the lockout was drawn with the start's master attached. Nothing
   is scaled: the near plate measures 493 px across in the start and 484 px
   in the mid.
2. Saturated violet (the glutes and hamstrings) is scaled toward the
   library's primary #7B72E9 from each drawing's own median, weighted by
   saturation from 0.36 to 0.46, so the lighter lilac of the trapezius
   (saturation about 0.32) and the anti-aliased edges are left as drawn.
3. Near-black (every channel <= 8) is set to pure black.
4. One crop, the same for every drawing: x 30-2010, y 39-2019 (a 1980 px
   square), 45-90 px of black round the union of the three.
5. One uniform Lanczos resample of that crop to 1080 x 1080.
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
OUT = ROOT / "docs/exercise-art/pilots/redraw-20261112/deadlift-front"
CROP = (30, 39, 2010, 2019)  # x0, y0, x1, y1 in the 2048-px drawings
SIZE = (1080, 1080)
SHIFT_Y = {"start": 0, "mid": -38, "lockout": 0}
NAMES = {"start": "start", "mid": "knees", "lockout": "lockout"}
TARGET = np.array([123, 114, 233], float)  # #7B72E9
SAT_FROM, SAT_TO = 0.36, 0.46


def load(name):
    return np.asarray(Image.open(HERE / "generated" / f"{name}.jpg").convert("RGB")).astype(float)


def shift(img, dy):
    if dy == 0:
        return img
    out = np.zeros_like(img)
    if dy < 0:
        out[:dy] = img[-dy:]
    else:
        out[dy:] = img[:-dy]
    return out


def violet(img):
    mx, mn = img.max(-1), img.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    hue = (b > g + 15) & (b >= r)
    strong = hue & (sat > SAT_TO)
    measured = np.median(img[strong], 0)
    w = (np.clip((sat - SAT_FROM) / (SAT_TO - SAT_FROM), 0, 1) * hue)[..., None]
    scaled = img * (TARGET / measured)
    return np.clip(img * (1 - w) + scaled * w, 0, 255), measured


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ("start", "mid", "lockout"):
        frame = shift(load(name), SHIFT_Y[name])
        frame, measured = violet(frame)
        frame[(frame <= 8).all(-1)] = 0
        img = Image.fromarray(frame.round().astype(np.uint8)).crop(CROP).resize(SIZE, Image.LANCZOS)
        img.save(OUT / f"{NAMES[name]}.png", optimize=True)
        print(f"{NAMES[name]}: moved {SHIFT_Y[name]} px, violet median {measured.round().astype(int).tolist()} -> #7B72E9")
    print(f"three drawings at {SIZE[0]}x{SIZE[1]} in {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
