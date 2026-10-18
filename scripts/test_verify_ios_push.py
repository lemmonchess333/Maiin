"""Offline signing regressions: no Apple credentials or macOS tools needed."""

import contextlib
import io
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import verify_ios_push as verifier


class IosPushSigningTest(unittest.TestCase):
    def setUp(self):
        self.requested = {"aps-environment": "production"}
        self.signed = {**self.requested, "application-identifier": "TEAM.com.tropos.app"}
        self.profile = {"Entitlements": dict(self.signed)}
        self.info = {"CFBundleIdentifier": "com.tropos.app"}

    def validate(self):
        verifier.validate_signed_app(self.signed, self.profile, self.info, "com.tropos.app")

    def test_production_source_profile_and_signed_app_pass(self):
        verifier.validate_push_profile(self.profile, self.requested)
        self.validate()

    def test_missing_development_or_unresolved_source_entitlement_fails(self):
        for environment in (None, "development", "$(APS_ENVIRONMENT)", True):
            with self.subTest(environment=environment):
                with self.assertRaisesRegex(ValueError, "app entitlements must declare"):
                    verifier.validate_push_profile(self.profile, {"aps-environment": environment})

    def test_old_or_development_profile_has_actionable_setup_error(self):
        for environment in (None, "development", True):
            with self.subTest(environment=environment):
                self.profile["Entitlements"]["aps-environment"] = environment
                with self.assertRaisesRegex(ValueError, "regenerate.*App Store Connect.*IOS_PROVISIONING_PROFILE_BASE64"):
                    verifier.validate_push_profile(self.profile, self.requested)

    def test_production_source_cannot_mask_missing_signed_push_entitlement(self):
        del self.signed["aps-environment"]
        with self.assertRaisesRegex(ValueError, "app entitlements must declare"):
            self.validate()

    def test_wrong_bundle_or_profile_identity_fails(self):
        self.info["CFBundleIdentifier"] = "other.app"
        with self.assertRaisesRegex(ValueError, "unexpected bundle"):
            self.validate()
        self.info["CFBundleIdentifier"] = "com.tropos.app"
        for app_id in (None, "TEAM.other.app", "TEAM.com.tropos.app.extra"):
            with self.subTest(app_id=app_id):
                self.signed["application-identifier"] = app_id
                with self.assertRaisesRegex(ValueError, "release bundle"):
                    self.validate()
        self.signed["application-identifier"] = "OTHERTEAM.com.tropos.app"
        with self.assertRaisesRegex(ValueError, "embedded provisioning profile"):
            self.validate()

    def test_debug_signing_fails(self):
        for target in (self.signed, self.profile["Entitlements"]):
            target["get-task-allow"] = True
            with self.assertRaisesRegex(ValueError, "App Store distribution"):
                self.validate()
            del target["get-task-allow"]

    def test_default_inspection_path_checks_signature_and_actual_embedded_plists(self):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / "App.app"
            app.mkdir()
            (app / "Info.plist").write_bytes(plistlib.dumps(self.info))
            runner = Mock(side_effect=[
                Mock(stdout=b""), Mock(stdout=plistlib.dumps(self.signed)),
                Mock(stdout=plistlib.dumps(self.profile)),
            ])
            verifier.inspect_signed_app(app, "com.tropos.app", runner)
            commands = [call.args[0] for call in runner.call_args_list]
            self.assertEqual(commands[0], ["codesign", "--verify", "--deep", "--strict", str(app)])
            self.assertEqual(commands[1], ["codesign", "--display", "--entitlements", ":-", str(app)])
            self.assertEqual(commands[2], ["security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")])
            self.assertTrue(all(call.kwargs["check"] and call.kwargs["capture_output"]
                                for call in runner.call_args_list))

    def test_apple_tool_failure_does_not_expose_its_output(self):
        runner = Mock(side_effect=subprocess.CalledProcessError(1, "codesign", stderr=b"private-profile-details"))
        with self.assertRaisesRegex(ValueError, "Apple signing tools") as caught:
            verifier.command_output(["codesign"], runner)
        self.assertNotIn("private", str(caught.exception))

    def test_profile_cli_reaches_validator_and_reports_only_safe_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            profile, requested = Path(directory) / "profile.plist", Path(directory) / "requested.plist"
            profile.write_bytes(plistlib.dumps({**self.profile, "private-material": "not-printed"}))
            requested.write_bytes(plistlib.dumps(self.requested))
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                verifier.main(["--profile", str(profile), "--requested", str(requested)])
            self.assertIn("permits production APNs", output.getvalue())
            self.assertNotIn("not-printed", output.getvalue())

    def test_app_cli_reaches_signed_app_inspection(self):
        with patch.object(verifier, "inspect_signed_app") as inspect, contextlib.redirect_stdout(io.StringIO()):
            verifier.main(["--app", "App.app", "--bundle-id", "com.tropos.app"])
        inspect.assert_called_once_with("App.app", "com.tropos.app")

    def test_missing_or_corrupt_plist_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.plist"
            for contents in (None, b"not a plist", plistlib.dumps(["wrong root type"])):
                if contents is not None:
                    path.write_bytes(contents)
                with self.assertRaisesRegex(ValueError, "missing or invalid"):
                    verifier.read_plist(path)


if __name__ == "__main__":
    unittest.main()
