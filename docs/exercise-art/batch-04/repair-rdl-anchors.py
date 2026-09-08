"""Reproducible fixed-region repair candidate; never grants visual approval."""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
PILOT = ROOT / "docs/exercise-art/pilots/batch-04/romanian-deadlift"
master = np.asarray(Image.open(PILOT / "1-master.png").convert("RGB"))
bottom = np.asarray(Image.open(PILOT / "4-bottom.png").convert("RGB"))
if master.shape != bottom.shape or master.shape[:2] != (1536, 1024):
    raise ValueError("Expected matching native 1024x1536 source images")

# Keep the held bar untouched. Below y=1100 both plates are above the mask.
# Blend only across the lower-shin join, then preserve the entire shoe region.
y, x = np.mgrid[:1536, :1024]
vertical = np.clip((y - 1060) / 50, 0, 1)
horizontal = np.clip((x - 470) / 10, 0, 1) * np.clip((780 - x) / 10, 0, 1)
mask = (vertical * horizontal)[..., None]
repaired = np.rint(bottom * (1 - mask) + master * mask).astype(np.uint8)
Image.fromarray(repaired).save(PILOT / "4-fixed-region-candidate.png")

# The first alpha-blend candidate doubles calf contours, so it is unselected.
# Restore the missing 31px of lower-leg length with a continuous image warp.
# Translate shoes rigidly rather than blending or stretching their pixels.
from scipy.ndimage import map_coordinates

source_y = np.where(
    y <= 990,
    y,
    np.where(y < 1191, 990 + (y - 990) * 170 / 201, y - 31),
)
warped = np.stack(
    [map_coordinates(bottom[:, :, c], [source_y, x], order=1) for c in range(3)],
    axis=2,
)
# The near plate lies to the right of x=746 above y=1120; preserve it exactly.
right_edge = np.where(y < 1120, 746, 780)
left_edge = np.where(y < 1100, 560, 470)
leg_mask = (y >= 990) & (x >= left_edge) & (x < right_edge)
candidate = np.where(leg_mask[..., None], warped, bottom).astype(np.uint8)
Image.fromarray(candidate).save(PILOT / "4-fixed-anchor-warp-candidate.png")
