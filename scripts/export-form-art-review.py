#!/usr/bin/env python3
"""Export only selected public exercise artwork for review, without modifying it."""
from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
import shutil
import struct

ROOT = Path(__file__).resolve().parents[1]
TARGETS = ("db-row", "db-shoulder-press", "incline-db-press", "romanian-deadlift", "lat-pulldown")
MANIFEST = "docs/exercise-art/BATCH_REVIEW_MANIFEST.json"
ROW_SOURCES = (
    "docs/exercise-art/pilots/batch-04/db-row/1-master.png",
    "docs/exercise-art/pilots/batch-04/db-row/3-mid.png",
    "docs/exercise-art/pilots/batch-04/db-row/4-top.png",
    "docs/exercise-art/pilots/batch-04/db-row/composite/early-source.png",
    "docs/exercise-art/pilots/batch-04/db-row/composite/build.py",
    "docs/exercise-art/pilots/batch-04/db-row/composite/README.md",
    "docs/exercise-art/pilots/batch-04/db-row/composite/measurements.json",
)


def contained_path(relative: str) -> Path:
    path = PurePosixPath(relative)
    if path.is_absolute() or ".." in path.parts or "\\" in relative:
        raise ValueError(f"Unsafe repository path: {relative}")
    resolved = (ROOT / relative).resolve()
    if not resolved.is_relative_to(ROOT):
        raise ValueError(f"Path escapes repository: {relative}")
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT.is_relative_to(output):
        raise ValueError("Output must not be the repository root or its parent")
    output.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / MANIFEST).read_text())
    selected = [s for s in manifest["completeDraftSets"] if s["exerciseId"] in TARGETS]
    if sorted(s["exerciseId"] for s in selected) != sorted(TARGETS):
        raise ValueError("Every requested exact exercise ID must occur once")
    report = {"fileIntegrityOnly": True, "visualApproval": False, "sets": [], "sources": []}

    def export(relative: str) -> dict:
        source = contained_path(relative)
        data = source.read_bytes()
        destination = output / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.resolve() == source:
            raise ValueError("Refusing to overwrite a source")
        shutil.copyfile(source, destination)
        return {"path": relative, "bytes": len(data), "sha256": sha256(data).hexdigest()}

    for selection in selected:
        frames = selection["frames"]
        if len(frames) != 6 or len({f["path"] for f in frames}) != 6:
            raise ValueError(f"Six separate frame paths required: {selection['exerciseId']}")
        for index, frame in enumerate(frames, 1):
            relative = frame["path"]
            if not relative.startswith("docs/exercise-art/pilots/") or not relative.endswith(".png"):
                raise ValueError(f"Not a native draft PNG: {relative}")
            data = contained_path(relative).read_bytes()
            if frame["frame"] != index or not frame["caption"].endswith(f" {index}/6"):
                raise ValueError(f"Frame order mismatch: {relative}")
            if len(data) != frame["bytes"] or sha256(data).hexdigest() != frame["sha256"]:
                raise ValueError(f"Source changed since manifest: {relative}")
            if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
                raise ValueError(f"Invalid native PNG: {relative}")
            if list(struct.unpack(">II", data[16:24])) != frame["dimensions"]:
                raise ValueError(f"Canvas mismatch: {relative}")
            if frame["dimensions"] != frames[0]["dimensions"]:
                raise ValueError(f"Sequence canvas differs: {relative}")
            reused = frame.get("reusedFrom")
            if reused is not None and not (1 <= reused < index and frames[reused - 1]["sha256"] == frame["sha256"]):
                raise ValueError(f"Incorrect return-pose reuse: {relative}")
            export(relative)
        report["sets"].append(selection)
    for relative in (MANIFEST, *ROW_SOURCES):
        report["sources"].append(export(relative))
    (output / "review-index.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"sets": len(selected), "frames": sum(len(s["frames"]) for s in selected),
                      "hashes": "verified", "visualApproval": False}))


if __name__ == "__main__":
    main()
