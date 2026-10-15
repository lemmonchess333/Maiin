"""One source-chroma-only Face Pulls colour proposal; no geometry edits."""
from pathlib import Path
from datetime import datetime, timezone
from collections import deque
import hashlib
import io
import json
import shutil
import zipfile
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image, ImageDraw


BASE = Path(__file__).resolve().parent
SOURCE = BASE.parent
ROOT = SOURCE.parents[1]
PRIMARY = np.array([123, 114, 233], dtype=float)
SECONDARY = np.array([149, 144, 224], dtype=float)
# Shared source-value anchors retain the sources' local light/dark structure.
# They are colour normalization values, never geometric or anatomical metrics.
VALUE_ANCHORS = {"primary": 243.0, "secondary": 247.0}
SOURCES = {1: "1-master.png", 4: "4-rope-rejected.png"}
EXPECTED = {
    1: "30c17a6d7c4416cb908d6f87ac5fb754bb45cb86116844a953893b761f48f8aa",
    4: "eb07393aa9a70788874b70bfc48cdab5de143798082cc300d627fd3aeea7c628",
}
# These broad ownership polygons select only the already tinted posterior
# shoulder caps. All paint is additionally gated by actual source chroma.
# The polygons add no contour strokes or anatomical regions to the artwork.
PRIMARY_OWNERSHIP = {
    1: [
        [(102, 359), (120, 360), (134, 378), (140, 399), (137, 418),
         (120, 435), (102, 423), (98, 395)],
        [(222, 383), (242, 370), (263, 359), (288, 351), (324, 350),
         (351, 357), (376, 370), (367, 389), (342, 412), (320, 429),
         (294, 431), (268, 426), (248, 416), (232, 402)],
    ],
    4: [
        [(79, 363), (88, 350), (103, 344), (117, 342), (128, 349),
         (132, 366), (140, 390), (132, 402), (118, 413), (103, 413),
         (91, 406), (84, 395), (79, 378)],
        [(240, 380), (253, 367), (268, 357), (284, 346), (299, 340),
         (325, 341), (349, 350), (370, 362), (372, 373), (350, 391),
         (332, 409), (313, 417), (289, 418), (269, 410), (254, 399)],
    ],
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def png_bytes(image):
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def source_coverage(rgb):
    a = rgb.astype(float)
    excess = a[:, :, 2] - np.minimum(a[:, :, 0], a[:, :, 1])
    roi = np.zeros(excess.shape, dtype=bool)
    roi[275:527, 76:383] = True
    weak = (excess > 3) & roi
    strong = excess >= 21
    seen = np.zeros_like(weak)
    eligible = np.zeros_like(weak)
    components = []
    height, width = weak.shape
    for sy, sx in zip(*np.where(weak)):
        if seen[sy, sx]:
            continue
        queue = deque([(int(sy), int(sx))])
        seen[sy, sx] = True
        points = []
        strong_count = 0
        while queue:
            y, x = queue.popleft()
            points.append((y, x))
            strong_count += int(strong[y, x])
            for yy in range(max(0, y - 1), min(height, y + 2)):
                for xx in range(max(0, x - 1), min(width, x + 2)):
                    if weak[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        queue.append((yy, xx))
        keep = len(points) >= 32 and strong_count >= 16
        if keep:
            yy, xx = np.array(points).T
            eligible[yy, xx] = True
            components.append({
                "pixels": len(points), "strongPixels": strong_count,
                "boundsInclusive": [int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())],
            })
    # Continuous source coverage, not a hard saturated/unsaturated colour cut.
    coverage = np.clip((excess - 3) / 18, 0, 1) * eligible
    return coverage, components


def ownership(size, polygons):
    scale = 4
    image = Image.new("L", (size[0] * scale, size[1] * scale))
    draw = ImageDraw.Draw(image)
    for polygon in polygons:
        draw.polygon([(x * scale, y * scale) for x, y in polygon], fill=255)
    return np.array(image.resize(size, Image.Resampling.LANCZOS), dtype=float) / 255


def make_ora(path, original, correction, merged):
    image = ET.Element("image", {"w": str(merged.width), "h": str(merged.height), "name": "Face Pulls colour-only proposal"})
    stack = ET.SubElement(image, "stack")
    layers = [("existing-source-fields-colour-only", correction), ("untouched-intact-original", original)]
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("mimetype", "image/openraster", compress_type=zipfile.ZIP_STORED)
        for i, (name, layer) in enumerate(layers):
            member = f"data/layer{i}.png"
            ET.SubElement(stack, "layer", {"name": name, "src": member, "opacity": "1.0", "visibility": "visible", "composite-op": "svg:src-over", "x": "0", "y": "0"})
            archive.writestr(member, png_bytes(layer))
        archive.writestr("stack.xml", ET.tostring(image, encoding="utf-8", xml_declaration=True))
        archive.writestr("mergedimage.png", png_bytes(merged))
    with zipfile.ZipFile(path) as archive:
        reopened_original = Image.open(io.BytesIO(archive.read("data/layer1.png"))).convert("RGBA")
        reopened_colour = Image.open(io.BytesIO(archive.read("data/layer0.png"))).convert("RGBA")
        reopened = Image.alpha_composite(reopened_original, reopened_colour)
        assert np.array_equal(np.array(reopened), np.array(merged))
        assert np.array_equal(np.array(Image.open(io.BytesIO(archive.read("mergedimage.png")))), np.array(merged))


def main():
    proof_path = BASE / "colour-pixel-proof.json"
    if proof_path.exists():
        raise SystemExit("One proposal already exists; refusing to overwrite or iterate.")
    (BASE / "originals").mkdir(exist_ok=True)
    canonical = ROOT / "work/Maiin-burpees/docs/exercise-art/identity/athlete-anatomy-v3.png"
    assert sha(canonical) == "fa56dd686d1e8ff88db91b9465255eefd9837f26174acebd18ddb2851d45a72b"
    proof = []
    for pose, source_name in SOURCES.items():
        source_path = SOURCE / source_name
        assert sha(source_path) == EXPECTED[pose]
        copy_path = BASE / "originals" / source_name
        assert not copy_path.exists()
        shutil.copyfile(source_path, copy_path)
        original = Image.open(source_path).convert("RGBA")
        assert original.size == (1024, 1536)
        a = np.array(original)
        coverage, components = source_coverage(a[:, :, :3])
        roles = ownership(original.size, PRIMARY_OWNERSHIP[pose])
        values = a[:, :, :3].max(axis=2).astype(float)
        primary = np.clip(values / VALUE_ANCHORS["primary"], 0, 1)[:, :, None] * PRIMARY
        secondary = np.clip(values / VALUE_ANCHORS["secondary"], 0, 1)[:, :, None] * SECONDARY
        target = primary * roles[:, :, None] + secondary * (1 - roles[:, :, None])
        layer_array = np.zeros_like(a)
        layer_array[:, :, :3] = np.rint(target).astype(np.uint8)
        layer_array[:, :, 3] = np.rint(coverage * 255).astype(np.uint8)
        layer_array[layer_array[:, :, 3] == 0, :3] = 0
        layer = Image.fromarray(layer_array, "RGBA")
        finished = Image.alpha_composite(original, layer)
        b = np.array(finished)
        support = layer_array[:, :, 3] > 0
        changed = np.any(a != b, axis=2)
        assert np.array_equal(a[~support], b[~support])
        assert np.array_equal(a[:, :, 3], b[:, :, 3])
        assert np.array_equal(a[:, 383:], b[:, 383:])
        gear_name = "1-start-equipment-mask.png" if pose == 1 else "4-finish-equipment-mask.png"
        gear_path = SOURCE / "ergonomic-handle-equipment-proposal-20261015" / gear_name
        gear = np.array(Image.open(gear_path).convert("L")) > 0
        assert gear.shape == support.shape
        assert not np.any(gear & support)
        layer.save(BASE / f"{pose}-colour-layer.png")
        Image.fromarray(np.uint8(support) * 255).save(BASE / f"{pose}-colour-support-mask.png")
        Image.fromarray(np.rint(coverage * 255).astype(np.uint8)).save(BASE / f"{pose}-source-chroma-coverage.png")
        Image.fromarray(np.rint(coverage * roles * 255).astype(np.uint8)).save(BASE / f"{pose}-primary-existing-field-mask.png")
        Image.fromarray(np.rint(coverage * (1 - roles) * 255).astype(np.uint8)).save(BASE / f"{pose}-secondary-existing-field-mask.png")
        Image.fromarray(np.uint8(changed) * 255).save(BASE / f"{pose}-actual-changed-pixels-mask.png")
        output = BASE / f"{pose}-native-colour-proposal.png"
        finished.save(output)
        finished.crop((64, 275, 390, 535)).save(BASE / f"{pose}-upperback-proposal-native-crop.png")
        ora_path = BASE / f"{pose}-native-colour-proposal.ora"
        make_ora(ora_path, original, layer, finished)
        assert sha(source_path) == EXPECTED[pose] == sha(copy_path)
        yy, xx = np.where(support)
        proof.append({
            "pose": pose, "sourcePath": str(source_path), "sourceSha256": EXPECTED[pose],
            "copiedOriginalExact": True, "nativeSize": list(original.size),
            "proposalSha256": sha(output), "oraSha256": sha(ora_path),
            "colourLayerSha256": sha(BASE / f"{pose}-colour-layer.png"),
            "supportMaskSha256": sha(BASE / f"{pose}-colour-support-mask.png"),
            "sourceChromaComponents": components,
            "sourceColourSupportPixels": int(support.sum()), "actualChangedPixels": int(changed.sum()),
            "supportBoundsInclusive": [int(xx.min()), int(yy.min()), int(xx.max()), int(yy.max())],
            "allPixelsOutsideSourceColourSupportExact": True, "originalAlphaExact": True,
            "rightApparatusRegionExact": True, "oraReopenedExact": True,
            "equipmentMaskPath": str(gear_path), "equipmentMaskSha256": sha(gear_path),
            "equipmentOverlapPixels": int((gear & support).sum()),
            "exactPrimaryPixels": int(np.all(b[:, :, :3] == PRIMARY, axis=2).sum()),
            "exactSecondaryPixels": int(np.all(b[:, :, :3] == SECONDARY, axis=2).sum()),
        })
    write_json(BASE / "colour-recipe.json", {
        "status": "one-colour-only-proposal-awaiting-parent-native-review",
        "canonicalPath": str(canonical), "canonicalSha256": sha(canonical),
        "primaryRearDelts": "#7B72E9", "secondaryRhomboidsTrapsVisibleRotatorCuff": "#9590E0",
        "method": "Existing upper-back source-chroma coverage only; two broad source-field shoulder-cap ownership polygons choose primary, remaining existing back chroma is secondary. No new anatomical fields or contour strokes.",
        "coverage": {"upperBackRoiInclusive": [76,275,382,526], "blueExcess": "B - min(R,G)", "continuousCoverage": "clip((blueExcess - 3) / 18, 0, 1)", "isolatedNoiseRejection": "Keep 8-connected source-chroma components with at least32 weak pixels and16 strong pixels (blueExcess>=21). No eroding, expanding or drawing a human silhouette."},
        "sourceValueAnchorsSharedAcrossPoses": VALUE_ANCHORS,
        "shading": "Source per-pixel maximum-channel brightness is monotonically mapped through the fixed declared role anchor. Existing fine light/dark contours remain; no spatial gradient, blur, anatomy retouch or new highlight is drawn. Source bright highlights above the declared anchor clamp to the role palette.",
        "primaryOwnershipPolygonsNative": PRIMARY_OWNERSHIP,
        "ownershipAntialiasing": "4x polygon rasterization downsampled to native coordinates; clipped to actual source-chroma coverage.",
        "noCropOrScale": True, "humanGeometryEdited": False, "neutralHumanPixelsPainted": False,
        "equipmentEdited": False, "imageGenerationRequests": 0, "repoOrPublicEdits": False,
        "scopeLimit": "Semantic field ownership and native quality require actual parent visual review. Numeric preservation facts are not acceptance. No missing or hidden rotator-cuff region is invented.",
    })
    write_json(proof_path, {"status": "colour-only-pixel-preservation-proved-not-visual-acceptance", "recordedAtUtc": datetime.now(timezone.utc).isoformat(), "poses": proof, "recipeSha256": sha(BASE / "colour-recipe.json"), "scriptSha256": sha(Path(__file__)), "registration": False, "completionCredit": False})
    files = {str(p.relative_to(BASE)): sha(p) for p in sorted(BASE.rglob("*")) if p.is_file() and p.name != "proposal-file-hashes.json"}
    write_json(BASE / "proposal-file-hashes.json", {"status": "one-proposal-file-bindings", "files": files})
    print(json.dumps({"folder": str(BASE), "status": "one-colour-proposal-ready-for-native-review", "poses": proof}, indent=2))


if __name__ == "__main__":
    main()
