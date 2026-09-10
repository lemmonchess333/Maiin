#!/usr/bin/env python3
"""Rebuild the inactive row draft from native sources. Requires Pillow/NumPy/SciPy."""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
SOURCES = {
    "../1-master.png": "66dc7ae834dbdcc8f3bd9005793698000244ca0658b24d9101338fe71ecf441d",
    "early-source.png": "e04158a5cd117fdd97048c0285bfa583b52584d9d09b4f10758b27a65b842535",
    "../3-mid.png": "9824854faae1272014435f8528fb56a5e52bac0a760e54885d8fa8ac0b1d9b3d",
    "../4-top.png": "ddf95258de771e1e90de7837517d8107c47f209d33e65b5960e3d7d08e0d3ba9",
}
ORDER = [0, 1, 2, 3, 2, 1]
TRANSLATIONS = [(0, 0), (34, -125), (84, -237), (137, -372)]
ANCHORS = {
    "head": (260, 0, 445, 225),
    "supportHand": (240, 490, 400, 550),
    "nearShoe": (680, 810, 930, 985),
    "supportedLegAndShoe": (965, 430, 1360, 590),
    "leftBenchAndLeg": (185, 550, 455, 920),
    "rightBenchAndLeg": (980, 590, 1355, 945),
}
PLATE_INTERIORS = {
    "nearPlate": (610, 690, 645, 745),
    "farPlate": (490, 685, 510, 730),
}


def crop(array, box):
    x0, y0, x1, y1 = box
    return array[y0:y1, x0:x1]


def athlete_mask(array):
    mask = ndi.binary_closing(array.max(axis=2) > 120, iterations=2)
    labels, _ = ndi.label(mask)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    mask = ndi.binary_fill_holes(labels == sizes.argmax())
    return ndi.binary_dilation(mask, iterations=2)


def write_png(path, array):
    encoded = BytesIO()
    Image.fromarray(array).save(encoded, format="PNG", optimize=True)
    data = encoded.getvalue()
    decoded = np.array(Image.open(BytesIO(data)).convert("RGB"))
    assert np.array_equal(decoded, array), path
    pending = path.with_suffix(".pending")
    pending.write_bytes(data)
    assert pending.read_bytes() == data
    pending.replace(path)


def main():
    arrays = []
    for name, digest in SOURCES.items():
        data = (HERE / name).read_bytes()
        assert sha256(data).hexdigest() == digest, name
        array = np.array(Image.open(BytesIO(data)).convert("RGB"))
        assert array.shape == (1024, 1536, 3), name
        arrays.append(array)
    master, _, _, top = arrays
    scene = master.copy()
    scene[95:520, 450:815] = 0
    scene[350:635, 495:630] = 0
    scene[630:795, 460:685] = 0
    # One unoccluded bench patch behind the original hanging forearm.
    scene[520:640, 460:815] = top[520:640, 460:815]
    allowed = np.zeros(master.shape[:2], dtype=bool)
    allowed[95:795, 450:815] = True

    box = (465, 635, 675, 790)
    x0, y0, x1, y1 = box
    load = crop(master, box).copy()
    load_mask = ndi.binary_fill_holes(ndi.binary_closing(load.max(axis=2) > 8))
    load_mask &= ~crop(athlete_mask(master), box)
    ly, lx = np.mgrid[y0:y1, x0:x1]
    centre_x = 529 - 0.12 * (ly - 704)
    far_face = ((lx - centre_x) / 34) ** 2 + ((ly - 704) / 59) ** 2 <= 1
    missing_face = far_face & ~load_mask
    face_shade = np.median(master[680:730, 499:511], axis=(0, 1)).astype(np.uint8)
    assert face_shade.max() <= 120
    # Complete the once-occluded sector once, then reuse that same rigid layer.
    load[missing_face] = face_shade
    load_mask |= missing_face
    front_plate = load_mask & (lx >= 574)
    poses = [master.copy()]
    for source, (dx, dy) in zip(arrays[1:], TRANSLATIONS[1:]):
        pose = scene.copy()
        body = athlete_mask(source) & allowed
        pose[body] = source[body]
        target = pose[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
        body_at_load = body[y0 + dy:y1 + dy, x0 + dx:x1 + dx]
        visible_load = load_mask & (~body_at_load | front_plate)
        target[visible_load] = load[visible_load]
        poses.append(pose)

    measurements = []
    frames = []
    for i, pose_index in enumerate(ORDER, 1):
        pose = poses[pose_index]
        dx, dy = TRANSLATIONS[pose_index]
        for name, bounds in ANCHORS.items():
            assert np.array_equal(crop(pose, bounds), crop(master, bounds)), (i, name)
        for name, bounds in PLATE_INTERIORS.items():
            a, b, c, d = bounds
            assert np.array_equal(crop(pose, (a+dx, b+dy, c+dx, d+dy)), crop(master, bounds)), (i, name)
        path = HERE / f"{i}.png"
        write_png(path, pose)
        frames.append(Image.fromarray(pose))
        measurements.append({
            "frame": i, "translation": [dx, dy], "risePixels": -dy,
            "sha256": sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
            "anchorPixelsExact": True, "plateInteriorPixelsExact": True,
        })
    assert np.array_equal(poses[0], master)
    assert (HERE / "3.png").read_bytes() == (HERE / "5.png").read_bytes()
    assert (HERE / "2.png").read_bytes() == (HERE / "6.png").read_bytes()

    preview = Image.new("RGB", (1536, 724))
    draw = ImageDraw.Draw(preview)
    for i, frame in enumerate(frames):
        x, y = (i % 3) * 512, (i // 3) * 362
        preview.paste(frame.resize((512, 341), Image.Resampling.LANCZOS), (x, y))
        draw.text((x+10, y+344), f"{i+1}/6  |  rise {measurements[i]['risePixels']}px", fill="white")
    preview.save(HERE / "sequence-preview.jpg", quality=90)
    small = [im.resize((768, 512), Image.Resampling.LANCZOS) for im in frames]
    small[0].save(HERE / "sequence-preview.webp", save_all=True, append_images=small[1:],
                  duration=[650, 650, 650, 850, 800, 800], loop=0, quality=85)
    report = {
        "status": "inactive-draft", "canvas": [1536, 1024], "sourceSha256": SOURCES,
        "canonicalLoadBox": box, "anchorRegions": ANCHORS, "plateInteriorRegions": PLATE_INTERIORS,
        "frames": measurements, "masterPixelsExact": True, "loadScaling": 1,
        "farFaceCompletion": "One occluded sector filled once using the master face's median shade; not original pixels.",
        "strictVisualApproval": False, "sequentialPlaybackVerified": False, "mobileLightDarkVerified": False,
        "limitations": ["Plate interiors prove rigid registration only; outlines are partly occluded.",
                        "Generated shoulder/chest/arm anatomy and hand-to-handle contact still need technique review.",
                        "Static contact sheets and downloadable animation do not certify the actual mobile player or 6-to-1 loop."],
    }
    (HERE / "measurements.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"frames": 6, "sourceHashes": "passed", "fixedAnchors": "passed", "plateInteriors": "passed"}))


if __name__ == "__main__":
    main()
