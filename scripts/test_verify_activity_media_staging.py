"""Offline safety checks for the non-deploying activity-media staging generator."""

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

_SPEC = importlib.util.spec_from_file_location(
    "prepare_activity_media_staging",
    Path(__file__).with_name("prepare-activity-media-staging.py"),
)
preparer = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(preparer)


class MediaStagingPreparationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "source"
        self.root.mkdir()
        self.output = self.base / "review"
        for name, count in preparer.EXPECTED_PROJECT_REFERENCES.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if name == ".firebaserc":
                value = json.dumps({"projects": {"default": preparer.PRODUCTION_PROJECT}}, indent=2) + "\n"
            else:
                value = "// Keep bucket/path constraints intact.\n" + "".join(
                    f'const bucket{index} = "{preparer.PRODUCTION_PROJECT}.firebasestorage.app";\n'
                    for index in range(count)
                )
            path.write_text(value, encoding="utf-8")

    def test_prepares_only_review_files_without_mutating_source(self):
        before = {name: (self.root / name).read_bytes() for name in preparer.EXPECTED_PROJECT_REFERENCES}
        manifest = preparer.prepare(self.root, self.output, "demo-media-staging")
        self.assertEqual(manifest["projectId"], "demo-media-staging")
        self.assertEqual(manifest["storageBucket"], "demo-media-staging.firebasestorage.app")
        self.assertFalse(manifest["deploysOrChangesCloudState"])
        self.assertEqual(set(p.name for p in self.output.iterdir()),
                         {"staging.patch", "manifest.json", ".env.staging.example", "CHECKLIST.md"})
        self.assertEqual(before, {name: (self.root / name).read_bytes() for name in before})
        self.assertEqual(json.loads((self.output / "manifest.json").read_text()), manifest)
        self.assertEqual(manifest["patchSha256"], hashlib.sha256((self.output / "staging.patch").read_bytes()).hexdigest())

    def test_production_destination_is_refused_before_output(self):
        with self.assertRaisesRegex(ValueError, "Production"):
            preparer.prepare(self.root, self.output, preparer.PRODUCTION_PROJECT)
        self.assertFalse(self.output.exists())

    def test_rejects_noncanonical_or_regex_injecting_projects(self):
        for project in ("short", "Staging-project", "stage/../../prod", "stage.*", "stage_foo", "stage-", "a" * 31):
            with self.subTest(project=project), self.assertRaises(ValueError):
                preparer.plan(self.root, project)

    def test_rejects_a_bucket_from_another_project_or_origin(self):
        for bucket in (f"{preparer.PRODUCTION_PROJECT}.appspot.com", "other.appspot.com",
                       "https://example.test/bucket", "demo-media-staging.firebasestorage.app/elsewhere"):
            with self.subTest(bucket=bucket), self.assertRaises(ValueError):
                preparer.plan(self.root, "demo-media-staging", bucket)

    def test_accepts_only_the_projects_two_standard_bucket_names(self):
        for suffix in ("firebasestorage.app", "appspot.com"):
            bucket = f"demo-media-staging.{suffix}"
            chosen, changes = preparer.plan(self.root, "demo-media-staging", bucket)
            self.assertEqual(chosen, bucket)
            self.assertEqual(len(changes), 6)

    def test_after_contents_preserve_constraints_and_never_production_alias(self):
        _, changes = preparer.plan(self.root, "demo-media-staging")
        self.assertEqual([c["path"] for c in changes], list(preparer.EXPECTED_PROJECT_REFERENCES))
        for change in changes:
            with self.subTest(path=change["path"]):
                self.assertNotIn(preparer.PRODUCTION_PROJECT, change["after"])
                if change["path"] != ".firebaserc":
                    self.assertEqual(change["after"].replace("demo-media-staging", preparer.PRODUCTION_PROJECT), change["before"])

    def test_unexpected_aliases_or_targets_are_not_carried_forward(self):
        (self.root / ".firebaserc").write_text(json.dumps({
            "projects": {"default": preparer.PRODUCTION_PROJECT, "other": "another-project"},
            "targets": {"another-project": {"storage": {"app": ["another-bucket"]}}},
        }))
        with self.assertRaisesRegex(ValueError, "aliases or targets"):
            preparer.prepare(self.root, self.output, "demo-media-staging")
        self.assertFalse(self.output.exists())

    def test_changed_reference_count_requires_review(self):
        path = self.root / "firestore.rules"
        path.write_text(path.read_text() + preparer.PRODUCTION_PROJECT)
        with self.assertRaisesRegex(ValueError, "drift in firestore.rules"):
            preparer.prepare(self.root, self.output, "demo-media-staging")
        self.assertFalse(self.output.exists())

    def test_missing_source_does_not_produce_partial_output(self):
        (self.root / "functions/lib/postPhotos.js").unlink()
        with self.assertRaisesRegex(ValueError, "Missing or non-local"):
            preparer.prepare(self.root, self.output, "demo-media-staging")
        self.assertFalse(self.output.exists())

    def test_symlink_source_cannot_read_another_tree(self):
        path = self.root / "functions/lib/postPhotos.js"
        outside = self.base / "other.js"
        outside.write_text(path.read_text())
        path.unlink()
        path.symlink_to(outside)
        with self.assertRaisesRegex(ValueError, "non-local"):
            preparer.prepare(self.root, self.output, "demo-media-staging")

    def test_refuses_output_inside_source_checkout(self):
        for output in (self.root, self.root / "generated"):
            with self.subTest(output=output), self.assertRaisesRegex(ValueError, "outside"):
                preparer.prepare(self.root, output, "demo-media-staging")

    def test_refuses_existing_output_without_overwriting(self):
        self.output.mkdir()
        (self.output / "keep.txt").write_text("keep this")
        with self.assertRaisesRegex(ValueError, "already exists"):
            preparer.prepare(self.root, self.output, "demo-media-staging")
        self.assertEqual((self.output / "keep.txt").read_text(), "keep this")
        self.assertEqual(len(list(self.output.iterdir())), 1)

    def test_refuses_a_dangling_output_symlink(self):
        target = self.base / "elsewhere"
        self.output.symlink_to(target, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "symlink"):
            preparer.prepare(self.root, self.output, "demo-media-staging")
        self.assertTrue(self.output.is_symlink())
        self.assertFalse(target.exists())

    def test_config_template_carries_only_staging_public_ids(self):
        preparer.prepare(self.root, self.output, "demo-media-staging", "demo-media-staging.appspot.com")
        env = (self.output / ".env.staging.example").read_text()
        self.assertIn("VITE_FIREBASE_STORAGE_BUCKET=demo-media-staging.appspot.com", env)
        self.assertIn("VITE_FIREBASE_API_KEY=\n", env)
        self.assertNotIn(preparer.PRODUCTION_PROJECT, env)
        checklist = (self.output / "CHECKLIST.md").read_text()
        self.assertIn("Nothing was deployed", checklist)
        self.assertIn("A project ID does not prove ownership or isolation", checklist)
        self.assertIn("Existing fixture URLs remain production-shaped", checklist)

    def test_cli_success_reports_preparation_not_deployment(self):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            status = preparer.main(["--source-root", str(self.root), "--output", str(self.output), "--project", "demo-media-staging"])
        self.assertEqual(status, 0)
        self.assertIn("Nothing deployed", stdout.getvalue())

    def test_cli_refusal_returns_nonzero(self):
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            status = preparer.main(["--source-root", str(self.root), "--output", str(self.output), "--project", preparer.PRODUCTION_PROJECT])
        self.assertEqual(status, 1)
        self.assertIn("Preparation refused", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
