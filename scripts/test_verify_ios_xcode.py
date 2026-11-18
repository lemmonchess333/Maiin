"""Offline checks for the Xcode the iOS workflows select."""

import contextlib
import io
import tempfile
from pathlib import Path
import unittest

import verify_ios_xcode as verifier


class PickXcodeTests(unittest.TestCase):
    def apps(self, *names):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        for name in names:
            (Path(tmp.name) / name).mkdir()
        return tmp.name

    def pick(self, apps, want="27.1"):
        found = verifier.pick_xcode(apps, want)
        return found.name if found else None

    def test_a_second_candidate_after_the_first(self):
        apps = self.apps(
            "Xcode_27.1_Release_Candidate.app",
            "Xcode_27.1_Release_Candidate_2.app",
            "Xcode_27.1_Release_Candidate_10.app",
        )
        self.assertEqual(self.pick(apps), "Xcode_27.1_Release_Candidate_10.app")

    def test_the_final_release_before_a_candidate(self):
        apps = self.apps(
            "Xcode.app",
            "Xcode_27.0.app",
            "Xcode_27.1_Release_Candidate.app",
            "Xcode_27.1.app",
            "Xcode_27.2_beta.app",
        )
        self.assertEqual(self.pick(apps), "Xcode_27.1.app")

    def test_the_newest_point_release_before_the_final_one(self):
        apps = self.apps(
            "Xcode_27.1.app",
            "Xcode_27.1.1.app",
            "Xcode_27.1.2.app",
            "Xcode_27.1_Release_Candidate.app",
        )
        self.assertEqual(self.pick(apps), "Xcode_27.1.2.app")

    def test_the_release_candidate_when_that_is_all_there_is(self):
        apps = self.apps(
            "Xcode.app",
            "Xcode_27.0.app",
            "Xcode_27.1_Release_Candidate.app",
            "Xcode_27.2_beta.app",
        )
        self.assertEqual(self.pick(apps), "Xcode_27.1_Release_Candidate.app")

    def test_never_a_beta_or_another_minor(self):
        apps = self.apps("Xcode_27.0.app", "Xcode_27.1_beta_2.app", "Xcode_27.10.app")
        self.assertIsNone(self.pick(apps))

    def test_main_prints_the_pick_and_fails_without_one(self):
        apps = self.apps("Xcode_27.1_Release_Candidate.app")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(verifier.main(["--want", "27.1", "--apps", apps]), 0)
        self.assertTrue(out.getvalue().strip().endswith("Xcode_27.1_Release_Candidate.app"))
        empty = self.apps("Xcode_26.6.app")
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(verifier.main(["--want", "27.1", "--apps", empty]), 1)


class SdkCheckTests(unittest.TestCase):
    def check(self, sdk):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
            io.StringIO()
        ):
            return verifier.main(["--want", "27.1", "--sdk", sdk])

    def test_the_sdk_must_be_the_one_wanted_or_later(self):
        self.assertEqual(self.check("27.1"), 0)
        self.assertEqual(self.check("27.2"), 0)
        self.assertEqual(self.check("27.0"), 1)
        self.assertEqual(self.check("26.6"), 1)


if __name__ == "__main__":
    unittest.main()
