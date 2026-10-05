#!/usr/bin/env python3
"""Reproduce source hashes, annotated native equipment spans and edit deltas.

The contour endpoints are explicit manual image annotations, not a fitted
anatomical model or an automatic assertion that a depicted load is constant.
Only this directory's report.json is written. Source images are never changed.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
SOURCES = HERE.parent / "sources"

# ROI boxes use PIL's [left, top, right-exclusive, bottom-exclusive] convention.
# Chord endpoints are inclusive native pixel coordinates. Antialiasing and dark
# outlines introduce roughly +/-1 px uncertainty at EACH chosen endpoint.
ANNOTATIONS = [
    {"file": "setup.png", "near_head_roi": [570, 490, 648, 582],
     "horizontal": {"y": 536, "x_start": 575, "x_end": 641},
     "vertical": {"x": 604, "y_start": 499, "y_end": 574}},
    {"file": "shallow.png", "near_head_roi": [568, 514, 647, 606],
     "horizontal": {"y": 559, "x_start": 573, "x_end": 641},
     "vertical": {"x": 602, "y_start": 522, "y_end": 597}},
    {"file": "deep-grip-repair.png", "near_head_roi": [578, 590, 656, 684],
     "horizontal": {"y": 635, "x_start": 583, "x_end": 649},
     "vertical": {"x": 606, "y_start": 599, "y_end": 673}},
    {"file": "bottom.png", "near_head_roi": [578, 645, 662, 743],
     "horizontal": {"y": 692, "x_start": 583, "x_end": 655},
     "vertical": {"x": 610, "y_start": 654, "y_end": 731}},
    {"file": "bottom-join-repair.png", "near_head_roi": [578, 645, 662, 743],
     "horizontal": {"y": 692, "x_start": 583, "x_end": 655},
     "vertical": {"x": 610, "y_start": 654, "y_end": 731}},
    {"file": "bottom-secondary-repair.png", "near_head_roi": [578, 645, 662, 743],
     "horizontal": {"y": 692, "x_start": 583, "x_end": 655},
     "vertical": {"x": 610, "y_start": 654, "y_end": 731}},
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def neighborhood(im: Image.Image, axis: str, fixed: int, centre: int) -> list:
    """Retain actual RGB values on both sides of an annotated endpoint."""
    return [
        {"coordinate": moving,
         "rgb": list(im.getpixel((moving, fixed) if axis == "x" else (fixed, moving)))}
        for moving in range(centre - 3, centre + 4)
    ]


def measure(annotation: dict) -> dict:
    path = SOURCES / annotation["file"]
    im = Image.open(path).convert("RGB")
    horizontal = annotation["horizontal"]
    vertical = annotation["vertical"]
    width = horizontal["x_end"] - horizontal["x_start"] + 1
    height = vertical["y_end"] - vertical["y_start"] + 1
    return {
        **annotation,
        "sha256": sha256(path),
        "canvas": list(im.size),
        "horizontal_native_span_px": width,
        "horizontal_endpoint_uncertainty_range_px": [width - 2, width + 2],
        "vertical_native_span_px": height,
        "vertical_endpoint_uncertainty_range_px": [height - 2, height + 2],
        "endpoint_rgb_evidence": {
            "left": neighborhood(im, "x", horizontal["y"], horizontal["x_start"]),
            "right": neighborhood(im, "x", horizontal["y"], horizontal["x_end"]),
            "top": neighborhood(im, "y", vertical["x"], vertical["y_start"]),
            "bottom": neighborhood(im, "y", vertical["x"], vertical["y_end"]),
        },
    }


def compare_colour_edit() -> dict:
    parent_name = "bottom.png"
    edited_name = "bottom-secondary-repair.png"
    parent = Image.open(SOURCES / parent_name).convert("RGB")
    edited = Image.open(SOURCES / edited_name).convert("RGB")
    rois = {
        "near_dumbbell": [575, 644, 745, 742],
        "far_grip": [292, 556, 418, 671],
        "head": [465, 176, 587, 316],
    }
    result = {}
    for label, box in rois.items():
        original = parent.crop(box).tobytes()
        candidate = edited.crop(box).tobytes()
        differences = [abs(a - b) for a, b in zip(original, candidate)]
        result[label] = {
            "roi": box,
            "rgb_channel_count": len(differences),
            "changed_rgb_channels": sum(d > 0 for d in differences),
            "mean_absolute_channel_delta_0_to_255": sum(differences) / len(differences),
            "maximum_absolute_channel_delta_0_to_255": max(differences),
            "channels_with_absolute_delta_above_16": sum(d > 16 for d in differences),
        }
    return {
        "actual_parent": parent_name,
        "actual_parent_sha256": sha256(SOURCES / parent_name),
        "edited_source": edited_name,
        "edited_source_sha256": sha256(SOURCES / edited_name),
        "roi_differences": result,
        "interpretation": (
            "The colour edit re-renders pixels outside its intended colour area. "
            "Pixel deltas do not by themselves establish a scaling defect. "
            "Compare it with bottom.png, its actual edit parent, not the separate "
            "bottom-join-repair.png candidate. Importing only the colour patch "
            "can preserve the chosen original body/equipment pixels."
        ),
    }


def main() -> None:
    report = {
        "exercise_id": "bulgarian-split",
        "status": "diagnostic-not-release-approval",
        "release_approved": False,
        "scope": "Near dumbbell = dumbbell in the athlete's right-image hand; near head = its left-image/closest head.",
        "method": {
            "coordinates": "Native 1536x1024 pixels; source images are not resized.",
            "annotation": "Manual visible-contour chords with preserved endpoint RGB samples; inclusive endpoints.",
            "uncertainty": "Approximately +/-1 px per boundary, hence +/-2 px per span. This is a review estimate, not a calibrated confidence interval.",
            "limits": [
                "Chords are explicit projected image spans, not anatomical or real-world equipment dimensions.",
                "The selected vertical chord is not claimed to be the entire head's mathematical bounding box.",
                "Foreshortening, orientation and contour re-rendering can change projected head spans without uniform load scaling.",
                "The full handles are hidden by hands; no full handle-length invariant is measurable from these images alone.",
                "The far-side dumbbell's inner head is occluded by the working thigh; its complete dimensions are unverified.",
                "These measurements do not support a sub-percent invariant pass. Two bench dimensions must not replace equipment verification."
            ],
        },
        "measurements": [measure(a) for a in ANNOTATIONS],
        "native_visual_review": {
            "deep_grip_repair": "Far forearm, wrist, fingers and handle are now continuously connected and visible beside the working thigh. Near grip remains attached.",
            "other_grips": "Setup, shallow and bottom show attached near and far grips; partial equipment occlusion remains physically plausible.",
            "head_shape": "The closest head appears wider in bottom, while the other head of the same dumbbell appears narrower. Uniform load growth is not established, but unchanged rigid geometry is also not established.",
            "highlights": "Working front quads remain strongest purple; rear supporting thigh stays neutral. The secondary repair adds lilac to the exposed underside of the working front thigh.",
            "next_step": "Investigate a bounded rigid-equipment repair with body and hands preserved, then remeasure and inspect the actual resulting sources. No release approval follows from this diagnostic."
        },
        "colour_edit_comparison": compare_colour_edit(),
    }
    output = HERE / "report.json"
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "report": str(output),
        "status": report["status"],
        "spans": [
            {"file": row["file"], "horizontal_px": row["horizontal_native_span_px"],
             "vertical_px": row["vertical_native_span_px"]}
            for row in report["measurements"]
        ],
    }))


if __name__ == "__main__":
    main()
