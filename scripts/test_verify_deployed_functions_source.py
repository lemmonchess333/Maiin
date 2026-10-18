"""Offline regressions for deployed source identity and retries. No cloud calls."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

# The script's name has hyphens, so it is loaded by path.
_SPEC = importlib.util.spec_from_file_location(
    "verify_deployed_functions_source",
    Path(__file__).with_name("verify-deployed-functions-source.py"),
)
verifier = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(verifier)


class _Response:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def read(self):
        return self.body


def _http(code):
    return urllib.error.HTTPError("https://example.invalid", code, "error", {}, None)


class ReadBackRetryTest(unittest.TestCase):
    def setUp(self):
        self.sleeps = []
        self.calls = 0

    def read(self, outcomes):
        """Runs `read` against an opener that answers with `outcomes` in turn."""
        outcomes = list(outcomes)

        def opener(request, timeout):
            self.calls += 1
            outcome = outcomes.pop(0)
            if isinstance(outcome, BaseException):
                raise outcome
            return _Response(outcome)

        with contextlib.redirect_stdout(io.StringIO()):
            return verifier.read("request", 30, opener=opener, sleep=self.sleeps.append)

    def test_a_brief_503_is_tried_again(self):
        self.assertEqual(self.read([_http(503), b"ok"]), b"ok")
        self.assertEqual(self.calls, 2)
        self.assertEqual(self.sleeps, [5])

    def test_rate_limits_timeouts_and_dropped_connections_are_tried_again(self):
        outcomes = [_http(429), urllib.error.URLError("down"), TimeoutError(), b"ok"]
        self.assertEqual(self.read(outcomes), b"ok")
        self.assertEqual(self.sleeps, [5, 15, 45])

    def test_gives_up_after_the_fourth_try(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            self.read([_http(503)] * 4)
        self.assertEqual(caught.exception.code, 503)
        self.assertEqual(self.calls, 4)
        self.assertEqual(self.sleeps, [5, 15, 45])

    def test_a_refusal_fails_at_once(self):
        for code in (401, 403, 404):
            with self.subTest(code=code):
                self.setUp()
                with self.assertRaises(urllib.error.HTTPError):
                    self.read([_http(code), b"never read"])
                self.assertEqual(self.calls, 1)
                self.assertEqual(self.sleeps, [])

    def test_what_it_prints_names_no_address(self):
        printed = io.StringIO()

        def opener(request, timeout):
            if not printed.getvalue():
                raise _http(503)
            return _Response(b"ok")

        with contextlib.redirect_stdout(printed):
            verifier.read("https://storage.example/signed?token=secret", 60, opener=opener, sleep=lambda _: None)
        self.assertIn("HTTP 503", printed.getvalue())
        self.assertNotIn("token", printed.getvalue())
        self.assertNotIn("https://", printed.getvalue())


class ChallengeSourceTargetsTest(unittest.TestCase):
    def test_native_push_targets_cover_every_changed_sender_and_owner(self):
        targets = verifier.source_targets()
        token_artifacts = {"index.js", "package-lock.json", "lib/pushTokenOwnership.js"}
        sender_artifacts = token_artifacts | {"lib/pushConsent.js", "lib/pushSend.js", "lib/pushSchedule.js"}
        for name in ("claimPushDeviceToken", "releasePushDeviceToken"):
            self.assertTrue(token_artifacts.issubset(targets[name]))
        for name in ("sendTestPush", "hourlyStreakNudge", "hourlyChallengeAnnouncements"):
            self.assertTrue(sender_artifacts.issubset(targets[name]))
        self.assertTrue({"lib/challengeAnnouncements.js", "lib/challengeDefs.js",
                         "lib/challengeActivityWindow.js", "lib/streakNudge.js"}
                        .issubset(targets["hourlyChallengeAnnouncements"]))
        for name in verifier.PUSH_RUNTIME_LIMITS:
            self.assertEqual(len(targets[name]), len(set(targets[name])))

    def test_rotation_and_every_participation_entry_point_are_verified(self):
        targets = verifier.source_targets()
        self.assertTrue({"index.js", "package-lock.json", "lib/challengeDefs.js"}
                        .issubset(targets["rolloverChallenges"]))
        artifacts = {
            "index.js", "package-lock.json", "lib/challengeDefs.js",
            "lib/challengeParticipationProgress.js", "lib/challengeBackfill.js",
            "lib/challengeActivityWindow.js", "lib/challengeTiers.js",
            "lib/challengeMarkers.js", "lib/runEligibility.js", "lib/workoutVolume.js",
        }
        for name in ("onChallengeParticipantCreated", "onWorkoutCreated", "onRunCreated",
                     "onWorkoutUpdated", "onRunUpdated", "onWorkoutDeleted", "onRunDeleted"):
            with self.subTest(function=name):
                self.assertTrue(artifacts.issubset(targets[name]))
                self.assertEqual(len(targets[name]), len(set(targets[name])))

    def test_expanded_targets_keep_training_and_race_source_checks(self):
        targets = verifier.source_targets()
        for name in ("onWorkoutCreated", "onWorkoutUpdated"):
            with self.subTest(function=name):
                self.assertTrue({"lib/stateTransition.js", "lib/workoutCorrections.js",
                                 "lib/programCommands.js"}.issubset(targets[name]))
        self.assertTrue({"lib/raceReconciliation.js", "lib/raceDayCompletion.js"}
                        .issubset(targets["onRunCreated"]))
        self.assertTrue({"lib/raceReconciliation.js", "lib/runModeResolution.js",
                         "lib/dateUtils.js"}.issubset(targets["dailyRaceReconciliationSweep"]))

    def test_release_reads_back_every_target(self):
        with patch.object(verifier.subprocess, "check_output", return_value="private-token\n"), \
                patch.object(verifier, "verify_function_source") as check:
            verifier.verify()
        self.assertEqual([call.args[0] for call in check.call_args_list],
                         list(verifier.source_targets()))
        self.assertTrue(all(call.args[3] == "private-token" for call in check.call_args_list))


class DeployedSourceIdentityTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.paths = verifier.source_targets()["onRunUpdated"]
        self.uploaded = {path: f"uploaded {path}\n".encode() for path in self.paths}
        self.uploaded["index.js"] = b"// CI build: current-commit @ now\nexports.onRunUpdated = handler;\n"
        for name, contents in self.uploaded.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)

    def deployed(self, contents=None, status="ACTIVE", extra_metadata=None):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            for path, value in (self.uploaded if contents is None else contents).items():
                archive.writestr(path, value)
        return [
            json.dumps({"status": status, "versionId": "123", "updateTime": "now",
                        "eventTrigger": {"failurePolicy": {"retry": {}}},
                        **(extra_metadata or {})}).encode(),
            b'{"downloadUrl":"https://storage.invalid/source?token=private-signed-url"}',
            buffer.getvalue(),
        ]

    def check(self, responses, name="onRunUpdated"):
        printed = io.StringIO()
        with patch.object(verifier, "read", side_effect=responses) as reader, \
                contextlib.redirect_stdout(printed):
            verifier.verify_function_source(name, self.paths, self.root, "private-token")
        return printed.getvalue(), reader

    def test_exact_active_bundle_is_confirmed_without_printing_credentials(self):
        printed, reader = self.check(self.deployed())
        self.assertIn("Verified deployed source: onRunUpdated, version 123", printed)
        self.assertNotIn("private-token", printed)
        self.assertNotIn("private-signed-url", printed)
        self.assertNotIn("https://", printed)
        self.assertEqual(reader.call_count, 3)

    def test_any_stale_participation_artifact_fails_despite_active_metadata(self):
        for path in self.paths:
            with self.subTest(artifact=path):
                stale = {**self.uploaded, path: b"previous deployment"}
                with self.assertRaisesRegex(RuntimeError,
                                            f"onRunUpdated: deployed {path} differs from uploaded source"):
                    self.check(self.deployed(stale))

    def test_previous_commit_marker_fails_even_when_function_and_libraries_match(self):
        previous = {**self.uploaded,
                    "index.js": self.uploaded["index.js"].replace(b"current-commit", b"previous-commit")}
        with self.assertRaisesRegex(RuntimeError, "deployed index.js differs"):
            self.check(self.deployed(previous))

    def test_missing_new_progress_helper_fails(self):
        previous = dict(self.uploaded)
        del previous["lib/challengeParticipationProgress.js"]
        with self.assertRaises(KeyError):
            self.check(self.deployed(previous))

    def test_inactive_function_fails_before_reading_its_source(self):
        with patch.object(verifier, "read", side_effect=self.deployed(status="DEPLOY_IN_PROGRESS")) as reader:
            with self.assertRaisesRegex(RuntimeError, "onRunUpdated: deployed function is not ACTIVE"):
                verifier.verify_function_source("onRunUpdated", self.paths, self.root, "private-token")
        self.assertEqual(reader.call_count, 1)

    def test_participation_exports_require_deployed_retry_policy(self):
        for name in verifier.RETRY_REQUIRED:
            for policy in ({}, {"retry": False}, {"retry": None}):
                with self.subTest(function=name, policy=policy):
                    metadata = json.dumps({"status": "ACTIVE", "eventTrigger": {"failurePolicy": policy}}).encode()
                    with patch.object(verifier, "read", return_value=metadata) as reader:
                        with self.assertRaisesRegex(RuntimeError, "deployed event retries are not enabled"):
                            verifier.verify_function_source(name, self.paths, self.root, "private-token")
                    self.assertEqual(reader.call_count, 1)

    def test_push_runtime_caps_fail_before_source_download(self):
        for name, (instances, timeout) in verifier.PUSH_RUNTIME_LIMITS.items():
            for cap in (None, 0, instances + 1, str(instances), True):
                with self.subTest(function=name, cap=cap):
                    metadata = json.dumps({"status": "ACTIVE", "maxInstances": cap, "timeout": timeout}).encode()
                    with patch.object(verifier, "read", return_value=metadata) as reader:
                        with self.assertRaisesRegex(RuntimeError, "deployed instance cap differs"):
                            verifier.verify_function_source(name, self.paths, self.root, "private-token")
                    self.assertEqual(reader.call_count, 1)
            if timeout is not None:
                for wrong_timeout in (None, "60s", "540", 540):
                    with self.subTest(function=name, timeout=wrong_timeout):
                        metadata = json.dumps({"status": "ACTIVE", "maxInstances": instances,
                                               "timeout": wrong_timeout}).encode()
                        with patch.object(verifier, "read", return_value=metadata) as reader:
                            with self.assertRaisesRegex(RuntimeError, "deployed timeout differs"):
                                verifier.verify_function_source(name, self.paths, self.root, "private-token")
                        self.assertEqual(reader.call_count, 1)

    def test_every_push_export_accepts_exact_source_with_required_runtime_limits(self):
        for name, (instances, timeout) in verifier.PUSH_RUNTIME_LIMITS.items():
            with self.subTest(function=name):
                self.check(self.deployed(extra_metadata={"maxInstances": instances, "timeout": timeout}), name)

    def test_scheduled_timeout_accepts_equivalent_protobuf_duration(self):
        for timeout in ("540s", "540.000s", "540.000000000s"):
            with self.subTest(timeout=timeout):
                self.check(self.deployed(extra_metadata={"maxInstances": 1, "timeout": timeout}),
                           "hourlyChallengeAnnouncements")

    def test_schedules_do_not_require_unsupported_pubsub_retry_metadata(self):
        # The Firebase scheduled endpoint conversion does not deploy the
        # event failurePolicy that ordinary Firestore triggers support.
        for name in ("hourlyStreakNudge", "hourlyChallengeAnnouncements"):
            self.check(self.deployed(extra_metadata={"maxInstances": 1, "timeout": "540s",
                                                      "eventTrigger": {}}), name)

    def test_any_stale_announcement_artifact_fails_despite_active_capped_function(self):
        self.paths = verifier.source_targets()["hourlyChallengeAnnouncements"]
        self.uploaded = {path: f"uploaded {path}\n".encode() for path in self.paths}
        for name, contents in self.uploaded.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)
        for path in self.paths:
            with self.subTest(artifact=path):
                stale = {**self.uploaded, path: b"previous deployment"}
                with self.assertRaisesRegex(RuntimeError, "deployed .* differs from uploaded source"):
                    self.check(self.deployed(stale, extra_metadata={"maxInstances": 1, "timeout": "540s"}),
                               "hourlyChallengeAnnouncements")


if __name__ == "__main__":
    unittest.main()
