"""Offline checks for the Watch signing gate in deploy-ios.yml."""

import plistlib
import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock

import verify_ios_watch as verifier


class WatchSigningTests(unittest.TestCase):
    def setUp(self):
        self.bundle = "com.tropos.app.watchkitapp"
        self.companion = "com.tropos.app"
        app_id = "TEAM." + self.bundle
        self.entitlements = {
            "application-identifier": app_id,
            "com.apple.developer.healthkit": True,
            "get-task-allow": False,
        }
        self.profile = {"Entitlements": dict(self.entitlements)}
        self.info = {
            "CFBundleIdentifier": self.bundle,
            "WKCompanionAppBundleIdentifier": self.companion,
        }

    def validate(self):
        verifier.validate_signed_watch(
            self.entitlements, self.profile, self.info, self.bundle, self.companion
        )

    def test_valid_watch_signature_and_profile(self):
        self.validate()

    def test_wrong_companion_or_bundle_is_rejected(self):
        self.info["WKCompanionAppBundleIdentifier"] = "com.other.app"
        with self.assertRaisesRegex(ValueError, "companion"):
            self.validate()
        self.info["WKCompanionAppBundleIdentifier"] = self.companion
        self.info["CFBundleIdentifier"] = "com.other.app.watchkitapp"
        with self.assertRaisesRegex(ValueError, "bundle identifier"):
            self.validate()

    def test_missing_healthkit_or_distribution_signing_is_rejected(self):
        self.profile["Entitlements"]["com.apple.developer.healthkit"] = False
        with self.assertRaisesRegex(ValueError, "HealthKit"):
            self.validate()
        self.profile["Entitlements"]["com.apple.developer.healthkit"] = True
        self.entitlements["get-task-allow"] = True
        with self.assertRaisesRegex(ValueError, "distribution"):
            self.validate()

    def test_missing_watch_app_fails_before_upload(self):
        with tempfile.TemporaryDirectory() as temp:
            iphone = Path(temp) / "App.app"
            iphone.mkdir()
            with self.assertRaisesRegex(ValueError, "exactly one embedded Watch app"):
                verifier.inspect_embedded_watch(iphone, self.bundle, self.companion)

    def test_inspects_the_embedded_watch_not_only_iphone_signature(self):
        with tempfile.TemporaryDirectory() as temp:
            iphone = Path(temp) / "App.app"
            watch = iphone / "Watch" / "TroposWatch.app"
            watch.mkdir(parents=True)
            (watch / "Info.plist").write_bytes(plistlib.dumps(self.info))
            def runner(args, **_kwargs):
                result = Mock()
                if args[:2] == ["codesign", "--display"]:
                    result.stdout = plistlib.dumps(self.entitlements)
                elif args[:2] == ["security", "cms"]:
                    result.stdout = plistlib.dumps(self.profile)
                else:
                    result.stdout = b""
                return result
            verifier.inspect_embedded_watch(iphone, self.bundle, self.companion, runner)

    def test_archive_and_ipa_must_have_matching_phone_and_watch_release_gates(self):
        with tempfile.TemporaryDirectory() as temp:
            iphone = Path(temp) / "App.app"
            watch = iphone / "Watch" / "TroposWatch.app"
            watch.mkdir(parents=True)
            phone_info = {"TroposConnectedTrainingEnabled": "NO"}
            watch_info = {
                **self.info,
                "TroposConnectedTrainingEnabled": "NO",
            }

            def write_plists():
                (iphone / "Info.plist").write_bytes(plistlib.dumps(phone_info))
                (watch / "Info.plist").write_bytes(plistlib.dumps(watch_info))

            def runner(args, **_kwargs):
                result = Mock()
                if args[:2] == ["codesign", "--display"]:
                    result.stdout = plistlib.dumps(self.entitlements)
                elif args[:2] == ["security", "cms"]:
                    result.stdout = plistlib.dumps(self.profile)
                else:
                    result.stdout = b""
                return result

            for mode in ("NO", "YES"):
                phone_info["TroposConnectedTrainingEnabled"] = mode
                watch_info["TroposConnectedTrainingEnabled"] = mode
                write_plists()
                verifier.inspect_embedded_watch(
                    iphone, self.bundle, self.companion, runner,
                    expected_connected_training=mode,
                )

            watch_info["TroposConnectedTrainingEnabled"] = "NO"
            write_plists()
            with self.assertRaisesRegex(ValueError, "Watch connected training gate"):
                verifier.inspect_embedded_watch(
                    iphone, self.bundle, self.companion, runner,
                    expected_connected_training="YES",
                )

            watch_info["TroposConnectedTrainingEnabled"] = "YES"
            phone_info["TroposConnectedTrainingEnabled"] = "NO"
            write_plists()
            with self.assertRaisesRegex(ValueError, "iPhone connected training gate"):
                verifier.inspect_embedded_watch(
                    iphone, self.bundle, self.companion, runner,
                    expected_connected_training="YES",
                )


if __name__ == "__main__":
    unittest.main()
