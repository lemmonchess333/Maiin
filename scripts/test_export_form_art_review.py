"""Offline regression tests for the native artwork review export.

Fixtures are tiny synthetic PNGs, not evidence of production artwork approval.
"""
from __future__ import annotations

import copy
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib

SPEC = importlib.util.spec_from_file_location(
    "form_art_export", Path(__file__).with_name("export-form-art-review.py")
)
assert SPEC is not None and SPEC.loader is not None
exporter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exporter)


def png(value: int, width: int = 2, height: int = 2) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(
            ">I", zlib.crc32(kind + data) & 0xFFFFFFFF
        )
    scanline = b"\x00" + bytes([value, value, value]) * width
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(scanline * height))
        + chunk(b"IEND", b"")
    )


class ExportReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.root.mkdir()
        self.out = Path(self.temp.name) / "export"
        self.patch = patch.object(exporter, "ROOT", self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.manifests = {}
        sets = []
        for exercise in exporter.TARGETS:
            frames = []
            for index, pose in enumerate([1, 2, 3, 4, 3, 2], 1):
                relative = f"docs/exercise-art/pilots/test/{exercise}/{index}.png"
                data = png(pose)
                self.write(relative, data)
                frames.append({
                    "frame": index, "path": relative, "caption": f"POSE {index}/6",
                    "cue": f"Synthetic fixture cue {index}",
                    "dimensions": [2, 2], "bytes": len(data),
                    "sha256": sha256(data).hexdigest(),
                    "reusedFrom": {5: 3, 6: 2}.get(index),
                })
            sets.append({"exerciseId": exercise, "frames": frames})
        self.manifests[exporter.MANIFESTS[0]] = {"completeDraftSets": sets[:-1]}
        self.manifests[exporter.MANIFESTS[1]] = {
            "releaseApproved": False, "completeDraftSets": sets[-1:],
        }
        self.save_manifests()
        for relative in (*exporter.ROW_SOURCES, *exporter.BULGARIAN_REVIEW_SOURCES):
            self.write(relative, b'{"syntheticFixture": true}\n')

    def write(self, relative: str, data: bytes) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def save_manifests(self) -> None:
        for relative, data in self.manifests.items():
            self.write(relative, (json.dumps(data) + "\n").encode())

    def bulgarian(self) -> dict:
        return self.manifests[exporter.MANIFESTS[1]]["completeDraftSets"][0]

    def invalid(self, message: str) -> None:
        self.save_manifests()
        with self.assertRaisesRegex(ValueError, message):
            exporter.export_review(self.out)
        self.assertFalse(self.out.exists(), "Invalid input must not publish a partial export")

    def test_includes_all_six_sets_and_36_distinct_paths(self) -> None:
        report = exporter.export_review(self.out)
        self.assertEqual({s["exerciseId"] for s in report["sets"]}, set(exporter.TARGETS))
        frames = [f for s in report["sets"] for f in s["frames"]]
        self.assertEqual(len(frames), 36)
        self.assertEqual(len({f["path"] for f in frames}), 36)
        self.assertTrue(report["fileIntegrityOnly"])
        self.assertFalse(report["visualApproval"])
        for frame in frames:
            self.assertEqual((self.out / frame["path"]).read_bytes(),
                             (self.root / frame["path"]).read_bytes())
        self.assertEqual(report, json.loads((self.out / "review-index.json").read_text()))

    def test_retains_review_metadata_and_both_manifests_byte_for_byte(self) -> None:
        report = exporter.export_review(self.out)
        paths = {s["path"] for s in report["sources"]}
        self.assertTrue(set(exporter.MANIFESTS).issubset(paths))
        self.assertTrue(set(exporter.BULGARIAN_REVIEW_SOURCES).issubset(paths))
        for source in report["sources"]:
            data = (self.out / source["path"]).read_bytes()
            self.assertEqual(data, (self.root / source["path"]).read_bytes())
            self.assertEqual(sha256(data).hexdigest(), source["sha256"])
            self.assertEqual(len(data), source["bytes"])

    def test_missing_bulgarian_cannot_silently_export_only_older_sets(self) -> None:
        self.manifests[exporter.MANIFESTS[1]]["completeDraftSets"].clear()
        self.invalid("Every requested exact exercise ID")

    def test_duplicate_across_manifests_is_rejected(self) -> None:
        self.manifests[exporter.MANIFESTS[0]]["completeDraftSets"].append(copy.deepcopy(self.bulgarian()))
        self.invalid("Every requested exact exercise ID")

    def test_modified_frame_is_rejected(self) -> None:
        self.write(self.bulgarian()["frames"][0]["path"], png(99))
        self.invalid("Source changed since manifest")

    def test_wrong_byte_count_is_rejected(self) -> None:
        self.bulgarian()["frames"][0]["bytes"] += 1
        self.invalid("Source changed since manifest")

    def test_non_png_with_matching_hash_is_rejected(self) -> None:
        frame = self.bulgarian()["frames"][0]
        data = b"not a PNG"
        self.write(frame["path"], data)
        frame.update(bytes=len(data), sha256=sha256(data).hexdigest())
        self.invalid("Invalid native PNG")

    def test_wrong_canvas_is_rejected(self) -> None:
        self.bulgarian()["frames"][0]["dimensions"] = [3, 2]
        self.invalid("Canvas mismatch")

    def test_order_is_verified(self) -> None:
        self.bulgarian()["frames"][0]["frame"] = 2
        self.invalid("Frame order mismatch")

    def test_duplicate_frame_paths_are_rejected(self) -> None:
        self.bulgarian()["frames"][5]["path"] = self.bulgarian()["frames"][1]["path"]
        self.invalid("Six separate frame paths")

    def test_return_pose_requires_matching_prior_hash(self) -> None:
        self.bulgarian()["frames"][5]["reusedFrom"] = 1
        self.invalid("Incorrect return-pose reuse")

    def test_boolean_return_reference_is_rejected(self) -> None:
        self.bulgarian()["frames"][5]["reusedFrom"] = True
        self.invalid("Incorrect return-pose reuse")

    def test_traversal_is_rejected(self) -> None:
        self.bulgarian()["frames"][0]["path"] = "docs/exercise-art/pilots/../../outside.png"
        self.invalid("Unsafe repository path")

    def test_symlink_outside_repository_is_rejected(self) -> None:
        target = Path(self.temp.name) / "outside.png"
        target.write_bytes(png(1))
        source = self.root / self.bulgarian()["frames"][0]["path"]
        source.unlink()
        source.symlink_to(target)
        self.invalid("Path escapes repository")

    def test_nonempty_output_is_rejected_without_modifying_files(self) -> None:
        self.out.mkdir()
        sentinel = self.out / "old-review.png"
        sentinel.write_bytes(b"keep")
        with self.assertRaisesRegex(ValueError, "new or empty"):
            exporter.export_review(self.out)
        self.assertEqual(sentinel.read_bytes(), b"keep")

    def test_empty_output_is_accepted(self) -> None:
        self.out.mkdir()
        exporter.export_review(self.out)
        self.assertTrue((self.out / "review-index.json").exists())

    def test_repository_or_parent_cannot_be_output(self) -> None:
        for output in (self.root, self.root.parent):
            with self.subTest(output=output), self.assertRaisesRegex(ValueError, "repository root"):
                exporter.export_review(output)

    def test_missing_review_metadata_does_not_publish_partial_output(self) -> None:
        (self.root / exporter.BULGARIAN_REVIEW_SOURCES[-1]).unlink()
        with self.assertRaises(FileNotFoundError):
            exporter.export_review(self.out)
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
