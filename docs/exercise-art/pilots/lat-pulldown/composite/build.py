"""Owner-authorized deterministic raster repair; no image generation calls."""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent
master = Image.open(PILOT / "1-stack-corrected.png").convert("RGB")
early = Image.open(PILOT / "2-early.png").convert("RGB")
bottom = Image.open(HERE / "bottom-source.png").convert("RGB")
assert master.size == early.size == bottom.size == (1024, 1536)

# Restore two continuous guide rails behind the selected plates, using the
# existing cylindrical rail texture. All frames share this same machine layer.
machine = master.copy()
machine.paste((0, 0, 0), (780, 180, 918, 889))
for left, right in [(816, 828), (880, 892)]:
    rail = master.crop((left, 865, right, 866)).resize((right-left, 779))
    machine.paste(rail, (left, 110))
# Keep the original top beam / pulley / diagonal cable in front of the rails.
top = np.asarray(master)[0:180].copy()
mask = Image.fromarray((top.max(axis=2) > 15).astype("uint8") * 255)
machine.paste(master.crop((0, 0, 1024, 180)), (0, 0), mask)

# The selected block is never resized or redrawn. Include its original cable
# attachment, then use an integer translation for each measured bar position.
plate_box = (782, 713, 918, 852)
plates = master.crop(plate_box)
plate_mask = Image.fromarray((np.asarray(plates).max(axis=2) > 12).astype("uint8") * 255)
cable = master.crop((838, 400, 850, 401))

def bar_top(im):
    rgb = np.asarray(im)
    col = rgb[200:660, 450].astype(int)
    hits = (col.min(axis=1) > 25) & (col.max(axis=1) < 140) & (np.ptp(col, axis=1) < 12)
    # The rigid central bar has a >= 15px run; ignore isolated contour pixels.
    for i in range(len(hits)-14):
        if hits[i:i+15].sum() >= 14:
            return i + 200
    raise ValueError("No measurable central bar")

def plate_top(im):
    col = np.asarray(im)[250:880, 800].astype(int)
    hits = (col.min(axis=1) > 25) & (col.max(axis=1) < 140) & (np.ptp(col, axis=1) < 12)
    for i in range(len(hits)-9):
        if hits[i:i+10].all():
            return i + 250
    raise ValueError("No measurable plate edge")

poses = []
for source in [master, early, bottom]:
    result = machine.copy()
    if source is not master:
        # Move only the upper-body/handle region. Below y876 and right of x700
        # are pixel-exact master anchors, including pelvis, feet and machine.
        alpha = np.zeros((1536, 1024), dtype="uint8")
        alpha[180:860, :700] = 255
        for y in range(860, 876):
            alpha[y, :700] = round(255 * (876-y)/16)
        result.paste(source, (0, 0), Image.fromarray(alpha))
    travel = bar_top(source) - bar_top(master)
    attach_y = plate_box[1] - travel
    result.paste(cable.resize((12, attach_y-180)), (838, 180))
    result.paste(plates, (plate_box[0], attach_y), plate_mask)
    poses.append((result, travel))

ordered = [0, 1, 2, 2, 1, 0]
captions = ["SET UP 1/6", "BEGIN PULL 2/6", "FINISH PULL 3/6",
            "BRIEF HOLD 4/6", "CONTROL RETURN 5/6", "REACH UP 6/6"]
checks = []
for i, pose in enumerate(ordered, 1):
    result, travel = poses[pose]
    path = HERE / f"{i}.png"
    result.save(path, optimize=True)
    arr = np.asarray(result)
    ref = np.asarray(master)
    assert np.array_equal(arr[889:, 700:], ref[889:, 700:])
    assert np.array_equal(arr[876:, :700], ref[876:, :700])
    assert np.array_equal(arr[:, 920:], ref[:, 920:])
    shifted = np.asarray(result)[713-travel:852-travel, 782:918]
    selected = np.asarray(plate_mask) > 0
    assert np.array_equal(shifted[selected], np.asarray(plates)[selected])
    observed_top = plate_top(result)
    assert plate_top(master) - observed_top == travel
    assert bar_top(result) - bar_top(master) == travel
    checks.append({"frame": i, "caption": captions[i-1], "pose": pose,
                   "barTravelPx": travel, "selectedPlateTravelPx": travel,
                   "observedPlateTopPx": observed_top,
                   "platePixelsExact": True, "lowerStackExact": True,
                   "pelvisFeetSeatExact": True, "rightFrameExact": True,
                   "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
(HERE / "measurements.json").write_text(json.dumps({
    "canvas": [1024, 1536], "method": "integer plate translation from the master",
    "barProbeX": 450, "fourSelectedPlates": True,
    "strictVisualApproval": False,
    "frames": checks,
}, indent=2) + "\n")
print(json.dumps(checks, indent=2))
