#!/usr/bin/env python3
"""Build the six deadlift frames, drawn from the front, from three Gemini drawings.

    python3 docs/exercise-art/sources/deadlift/2026-11-12/build.py

Reads generated/{start,mid,lockout}.jpg (gemini-3-pro-image, 2048 x 2048, the
bytes exactly as the API returned them) and writes
docs/exercise-art/pilots/redraw-20261112/deadlift/1.png ... 6.png and the
same pixels, losslessly, as public/form-frames/deadlift/2026-11-12/1.webp ...
6.webp.

The owner asked for it on 2026-11-12: the deadlift was drawn from behind and
"just looks weird"; draw it from the front. provenance.json has every call.

Nothing is drawn here. Each frame is one generated drawing with these
deterministic steps, in order:

1. The mid drawing is moved up 38 px. Measured, not chosen: the near shoe's
   sole is at y=1955 in mid.jpg and y=1917 in start.jpg and lockout.jpg, and
   its left and right edges agree within 8 px (790-1014 against 782-1021).
   The start and lockout drawings already share the near shoe to the pixel,
   because the lockout was drawn with the start attached. Nothing is scaled:
   the near plate measures 493 px across in the start and 484 px in the mid.
2. Saturated violet (the glutes and hamstrings) is scaled toward the
   library's primary #7B72E9 from each drawing's own median, weighted by
   saturation from 0.36 to 0.46, so the lighter lilac of the trapezius
   (saturation about 0.32) and the anti-aliased edges are left as drawn.
3. Near-black (every channel <= 8) is set to pure black.
4. One crop, the same for every frame: x 30-2010, y 39-2019 (a 1980 px
   square). It keeps 45-90 px of black round the union of the three
   drawings, so both plates and both bar ends stay in every frame.
5. One uniform Lanczos resample of that crop to 1080 x 1080, the most
   pixels the form guide's 360-point box can show at 3x.

Frame order follows the 2026-10-14 set: start, start, mid, lockout, lockout,
mid, so the six cues and their placard timings stay as they were.
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
PILOT = ROOT / "docs/exercise-art/pilots/redraw-20261112/deadlift"
PUBLIC = ROOT / "public/form-frames/deadlift/2026-11-12"
CROP = (30, 39, 2010, 2019)  # x0, y0, x1, y1 in the 2048-px drawings
SIZE = (1080, 1080)
SHIFT_Y = {"start": 0, "mid": -38, "lockout": 0}
ORDER = ["start", "start", "mid", "lockout", "lockout", "mid"]
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
    PILOT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    built = {}
    for name in ("start", "mid", "lockout"):
        frame = shift(load(name), SHIFT_Y[name])
        frame, measured = violet(frame)
        frame[(frame <= 8).all(-1)] = 0
        img = Image.fromarray(frame.round().astype(np.uint8)).crop(CROP).resize(SIZE, Image.LANCZOS)
        built[name] = img
        print(f"{name}: moved {SHIFT_Y[name]} px, violet median {measured.round().astype(int).tolist()} -> #7B72E9")
    for i, name in enumerate(ORDER, 1):
        built[name].save(PILOT / f"{i}.png", optimize=True)
        built[name].save(PUBLIC / f"{i}.webp", lossless=True, method=6)
    print(f"six frames at {SIZE[0]}x{SIZE[1]} in {PILOT.relative_to(ROOT)} and {PUBLIC.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
