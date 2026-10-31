"""Offline checks for the connected training packaging gate in deploy-ios.yml
and ios-native-compile.yml."""

import plistlib
import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock

import verify_ios_watch as verifier

STANDARD_HEALTH = {
    "NSHealthShareUsageDescription": "Tropos reads your step count from Health to show today's steps on Home.",
    "NSHealthUpdateUsageDescription": "Tropos does not add workouts or any other data to Health.",
}
PILOT_HEALTH = {
    "NSHealthShareUsageDescription": "Tropos reads your step count for Home, heart rate during Apple Watch runs if enabled, and its own exported workouts to avoid duplicates.",
    "NSHealthUpdateUsageDescription": "Tropos saves completed runs as Apple Health workouts when you turn on export, and may correct or remove workouts it previously added.",
}


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


class BuildModeTests(unittest.TestCase):
    """One build of each mode, written to a temporary App.app."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.iphone = Path(self.temp.name) / "App.app"
        self.iphone.mkdir()
        self.bundle = "com.tropos.app.watchkitapp"
        self.companion = "com.tropos.app"
        self.entitlements = {
            "application-identifier": "TEAM." + self.bundle,
            "com.apple.developer.healthkit": True,
        }
        self.calls = []

    def write_iphone(self, gate, health):
        info = {"CFBundleIdentifier": self.companion, verifier.GATE: gate, **health}
        (self.iphone / "Info.plist").write_bytes(plistlib.dumps(info))

    def write_watch(self, gate, companion=None):
        watch = self.iphone / "Watch" / "TroposWatch.app"
        watch.mkdir(parents=True, exist_ok=True)
        info = {
            "CFBundleIdentifier": self.bundle,
            "WKCompanionAppBundleIdentifier": companion or self.companion,
            verifier.GATE: gate,
        }
        (watch / "Info.plist").write_bytes(plistlib.dumps(info))
        return watch

    def runner(self, args, **_kwargs):
        self.calls.append(args)
        result = Mock()
        if args[:2] == ["codesign", "--display"]:
            result.stdout = plistlib.dumps(self.entitlements)
        elif args[:2] == ["security", "cms"]:
            result.stdout = plistlib.dumps({"Entitlements": dict(self.entitlements)})
        else:
            result.stdout = b""
        return result

    def inspect(self, mode, signed=True):
        verifier.inspect_build(
            self.iphone, mode, self.bundle, self.companion, self.runner, signed=signed
        )

    def test_a_standard_build_carries_no_watch_app(self):
        self.write_iphone("NO", STANDARD_HEALTH)
        self.inspect("NO")
        self.assertEqual(self.calls, [])

        self.write_watch("NO")
        with self.assertRaisesRegex(ValueError, "standard build must embed no Watch app"):
            self.inspect("NO")

    def test_a_standard_build_keeps_the_gate_off_and_the_short_health_text(self):
        self.write_iphone("YES", STANDARD_HEALTH)
        with self.assertRaisesRegex(ValueError, "iPhone connected training gate is not NO"):
            self.inspect("NO")
        self.write_iphone("NO", PILOT_HEALTH)
        with self.assertRaisesRegex(ValueError, "short Health text"):
            self.inspect("NO")
        self.write_iphone("NO", {**STANDARD_HEALTH, "NSHealthShareUsageDescription": "$(TROPOS_HEALTH_SHARE_USAGE)"})
        with self.assertRaisesRegex(ValueError, "not resolved"):
            self.inspect("NO")

    def test_a_pilot_build_embeds_one_signed_watch_app(self):
        self.write_iphone("YES", PILOT_HEALTH)
        with self.assertRaisesRegex(ValueError, "exactly one embedded Watch app"):
            self.inspect("YES")
        watch = self.write_watch("YES")
        self.inspect("YES")
        # The Watch app's own signature and profile, not only the iPhone's.
        self.assertIn(["codesign", "--display", "--entitlements", ":-", str(watch)], self.calls)

    def test_an_unsigned_pilot_build_checks_packaging_without_codesign(self):
        self.write_iphone("YES", PILOT_HEALTH)
        self.write_watch("YES")
        self.inspect("YES", signed=False)
        self.assertEqual(self.calls, [])
        self.write_watch("YES", companion="com.other.app")
        with self.assertRaisesRegex(ValueError, "companion"):
            self.inspect("YES", signed=False)

    def test_a_pilot_build_needs_both_gates_and_the_expanded_health_text(self):
        self.write_iphone("YES", PILOT_HEALTH)
        self.write_watch("NO")
        with self.assertRaisesRegex(ValueError, "Watch connected training gate"):
            self.inspect("YES")
        self.write_watch("YES")
        self.write_iphone("NO", PILOT_HEALTH)
        with self.assertRaisesRegex(ValueError, "iPhone connected training gate"):
            self.inspect("YES")
        self.write_iphone("YES", STANDARD_HEALTH)
        with self.assertRaisesRegex(ValueError, "expanded Health text"):
            self.inspect("YES")

    def test_the_command_line_needs_a_mode(self):
        self.write_iphone("NO", STANDARD_HEALTH)
        with self.assertRaises(SystemExit):
            verifier.main(["--app", str(self.iphone)])
        verifier.main(["--app", str(self.iphone), "--expected-connected-training", "NO"])


if __name__ == "__main__":
    unittest.main()
