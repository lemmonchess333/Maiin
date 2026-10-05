#!/usr/bin/env python3
"""Export selected native exercise artwork and its review metadata, unchanged."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import struct

ROOT = Path(__file__).resolve().parents[1]
TARGETS = (
    "db-row", "db-shoulder-press", "incline-db-press",
    "romanian-deadlift", "lat-pulldown", "bulgarian-split",
)
MANIFEST = "docs/exercise-art/BATCH_REVIEW_MANIFEST.json"
BULGARIAN_ROOT = "docs/exercise-art/pilots/continuation-20261005"
MANIFESTS = (MANIFEST, f"{BULGARIAN_ROOT}/MANIFEST.json")
ROW_SOURCES = (
    "docs/exercise-art/pilots/batch-04/db-row/1-master.png",
    "docs/exercise-art/pilots/batch-04/db-row/3-mid.png",
    "docs/exercise-art/pilots/batch-04/db-row/4-top.png",
    "docs/exercise-art/pilots/batch-04/db-row/composite/early-source.png",
    "docs/exercise-art/pilots/batch-04/db-row/composite/build.py",
    "docs/exercise-art/pilots/batch-04/db-row/composite/README.md",
    "docs/exercise-art/pilots/batch-04/db-row/composite/measurements.json",
)
BULGARIAN_REVIEW_SOURCES = (
    f"{BULGARIAN_ROOT}/REVIEW.md",
    f"{BULGARIAN_ROOT}/bulgarian-split/provenance.json",
    f"{BULGARIAN_ROOT}/validation/v2-selection.json",
)


def contained_path(relative: str) -> Path:
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or "\\" in relative:
        raise ValueError(f"Unsafe repository path: {relative}")
    resolved = (ROOT / relative).resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError(f"Path escapes repository: {relative}")
    return resolved


def export_review(output: Path) -> dict:
    """Validate all sources first, then write exactly those bytes to a fresh folder."""
    output = output.resolve()
    if output == ROOT or ROOT.is_relative_to(output):
        raise ValueError("Output must not be the repository root or its parent")
    # Reusing a populated export could leave obsolete frames beside a new index.
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("Output must be a new or empty directory")

    files: dict[str, bytes] = {}

    def read_source(relative: str) -> bytes:
        if relative not in files:
            files[relative] = contained_path(relative).read_bytes()
        return files[relative]

    selected = []
    for relative in MANIFESTS:
        manifest = json.loads(read_source(relative))
        selected.extend(
            selection for selection in manifest["completeDraftSets"]
            if selection["exerciseId"] in TARGETS
        )
    if sorted(s["exerciseId"] for s in selected) != sorted(TARGETS):
        raise ValueError("Every requested exact exercise ID must occur once")
    report = {
        "fileIntegrityOnly": True,
        "visualApproval": False,
        "manifestPaths": list(MANIFESTS),
        "sets": [],
        "sources": [],
    }

    for selection in selected:
        frames = selection["frames"]
        if len(frames) != 6 or len({f["path"] for f in frames}) != 6:
            raise ValueError(f"Six separate frame paths required: {selection['exerciseId']}")
        for index, frame in enumerate(frames, 1):
            relative = frame["path"]
            if not relative.startswith("docs/exercise-art/pilots/") or not relative.endswith(".png"):
                raise ValueError(f"Not a native draft PNG: {relative}")
            data = read_source(relative)
            if frame["frame"] != index or not frame["caption"].endswith(f" {index}/6"):
                raise ValueError(f"Frame order mismatch: {relative}")
            if len(data) != frame["bytes"] or sha256(data).hexdigest() != frame["sha256"]:
                raise ValueError(f"Source changed since manifest: {relative}")
            if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
                raise ValueError(f"Invalid native PNG: {relative}")
            if list(struct.unpack(">II", data[16:24])) != frame["dimensions"]:
                raise ValueError(f"Canvas mismatch: {relative}")
            if frame["dimensions"] != frames[0]["dimensions"]:
                raise ValueError(f"Sequence canvas differs: {relative}")
            reused = frame.get("reusedFrom")
            if reused is not None and not (
                type(reused) is int and 1 <= reused < index
                and frames[reused - 1]["sha256"] == frame["sha256"]
            ):
                raise ValueError(f"Incorrect return-pose reuse: {relative}")
        report["sets"].append(selection)

    for relative in (*MANIFESTS, *ROW_SOURCES, *BULGARIAN_REVIEW_SOURCES):
        data = read_source(relative)
        report["sources"].append({
            "path": relative, "bytes": len(data), "sha256": sha256(data).hexdigest(),
        })

    # No output is written until all manifests, frames and metadata are readable
    # and verified. Never transform, resize, re-encode or approve an image here.
    output.mkdir(parents=True, exist_ok=True)
    for relative, data in files.items():
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.resolve() == contained_path(relative):
            raise ValueError("Refusing to overwrite a source")
        destination.write_bytes(data)
    (output / "review-index.json").write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = export_review(args.output)
    print(json.dumps({
        "sets": len(report["sets"]),
        "frames": sum(len(s["frames"]) for s in report["sets"]),
        "hashes": "verified", "visualApproval": False,
    }))


if __name__ == "__main__":
    main()
