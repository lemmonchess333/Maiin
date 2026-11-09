"""Offline checks for the Live Activity widget packaging check in
deploy-ios.yml and ios-native-compile.yml."""

import plistlib
import tempfile
from pathlib import Path
import unittest
from unittest.mock import Mock

import verify_ios_live_activity as verifier

WIDGET = "com.tropos.app.LiveActivities"
GROUP = "group.com.tropos.app"
GROUPS = "com.apple.security.application-groups"


class WidgetSigningTests(unittest.TestCase):
    def setUp(self):
        self.entitlements = {"application-identifier": "TEAM." + WIDGET, "get-task-allow": False}
        self.profile = {"Entitlements": dict(self.entitlements)}

    def validate(self):
        verifier.validate_signed_widget(self.entitlements, self.profile, WIDGET)

    def test_a_widget_signed_with_its_own_app_store_profile_passes(self):
        self.validate()

    def test_a_widget_signed_as_another_bundle_is_refused(self):
        self.entitlements["application-identifier"] = "TEAM.com.tropos.app"
        with self.assertRaisesRegex(ValueError, "does not match its bundle ID"):
            self.validate()
        self.entitlements["application-identifier"] = "TEAM." + WIDGET
        self.profile["Entitlements"]["application-identifier"] = "OTHER." + WIDGET
        with self.assertRaisesRegex(ValueError, "does not match its profile"):
            self.validate()

    def test_a_widget_signed_without_the_app_group_is_refused(self):
        self.entitlements[GROUPS] = [GROUP]
        self.profile["Entitlements"][GROUPS] = [GROUP]
        verifier.validate_signed_widget(self.entitlements, self.profile, WIDGET, GROUP)
        self.profile["Entitlements"][GROUPS] = []
        with self.assertRaisesRegex(ValueError, "profile carries no App Group group.com.tropos.app"):
            verifier.validate_signed_widget(self.entitlements, self.profile, WIDGET, GROUP)
        self.profile["Entitlements"][GROUPS] = [GROUP]
        del self.entitlements[GROUPS]
        with self.assertRaisesRegex(ValueError, "signature carries no App Group"):
            verifier.validate_signed_widget(self.entitlements, self.profile, WIDGET, GROUP)

    def test_development_signing_is_refused(self):
        self.entitlements["get-task-allow"] = True
        with self.assertRaisesRegex(ValueError, "distribution"):
            self.validate()
        self.entitlements["get-task-allow"] = False
        self.profile["ProvisionedDevices"] = ["00008110-000000000000001E"]
        with self.assertRaisesRegex(ValueError, "App Store one"):
            self.validate()


class BuildTests(unittest.TestCase):
    """A built App.app, written to a temporary folder."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.iphone = Path(self.temp.name) / "App.app"
        self.iphone.mkdir()
        self.calls = []
        self.ungrouped = Path("/nowhere")
        self.write_iphone()

    def write_iphone(self, **changes):
        info = {
            "CFBundleIdentifier": "com.tropos.app",
            "CFBundleShortVersionString": "1.2.0",
            "CFBundleVersion": "57",
            "NSSupportsLiveActivities": True,
            **changes,
        }
        # A built app's Info.plist is binary.
        (self.iphone / "Info.plist").write_bytes(plistlib.dumps(info, fmt=plistlib.FMT_BINARY))

    def write_extension(self, name="LiveActivitiesExtension", bundle=WIDGET, executable=True, **changes):
        extension = self.iphone / "PlugIns" / f"{name}.appex"
        extension.mkdir(parents=True, exist_ok=True)
        info = {
            "CFBundleIdentifier": bundle,
            "CFBundleExecutable": name,
            "CFBundleShortVersionString": "1.2.0",
            "CFBundleVersion": "57",
            "NSExtension": {"NSExtensionPointIdentifier": verifier.WIDGETKIT},
            **changes,
        }
        (extension / "Info.plist").write_bytes(plistlib.dumps(info, fmt=plistlib.FMT_BINARY))
        if executable:
            (extension / name).write_bytes(b"\xcf\xfa\xed\xfe")
        return extension

    def runner(self, args, **_kwargs):
        self.calls.append(args)
        result = Mock()
        entitlements = {"application-identifier": "TEAM." + WIDGET}
        # The app and the widget both signed into the App Group, unless a
        # test takes it off one of them.
        if not any(str(arg).startswith(str(self.ungrouped)) for arg in args[-1:]):
            entitlements[GROUPS] = [GROUP]
        if args[:2] == ["codesign", "--display"]:
            result.stdout = plistlib.dumps(entitlements)
        elif args[:2] == ["security", "cms"]:
            result.stdout = plistlib.dumps({"Entitlements": entitlements})
        else:
            result.stdout = b""
        return result

    def inspect(self, signed=True):
        return verifier.inspect_build(self.iphone, WIDGET, self.runner, signed=signed)

    def test_a_build_without_the_widget_is_refused(self):
        with self.assertRaisesRegex(ValueError, "exactly one com.tropos.app.LiveActivities"):
            self.inspect()
        # Another extension is not the widget.
        self.write_extension("ShareExtension", "com.tropos.app.share")
        with self.assertRaisesRegex(ValueError, "found 0"):
            self.inspect()

    def test_a_signed_build_checks_the_widgets_own_signature(self):
        widget = self.write_extension()
        self.write_extension("ShareExtension", "com.tropos.app.share")
        self.assertEqual(self.inspect(), widget)
        self.assertIn(["codesign", "--display", "--entitlements", ":-", str(widget)], self.calls)
        self.assertIn(["security", "cms", "-D", "-i", str(widget / "embedded.mobileprovision")], self.calls)

    def test_a_signed_build_checks_the_app_group_on_the_widget_and_on_the_app(self):
        widget = self.write_extension()
        self.inspect()
        self.assertIn(["codesign", "--display", "--entitlements", ":-", str(self.iphone)], self.calls)
        self.ungrouped = widget
        with self.assertRaisesRegex(ValueError, "com.tropos.app.LiveActivities signature carries no App Group"):
            self.inspect()
        # The app's own signing: its path is a prefix of the widget's, so
        # the stand-in takes the group off the app's calls alone.
        self.ungrouped = Path(str(self.iphone) + "/embedded.mobileprovision")
        self.calls.clear()
        with self.assertRaisesRegex(ValueError, "com.tropos.app profile carries no App Group"):
            self.inspect()

    def test_an_unsigned_build_checks_packaging_without_codesign(self):
        self.write_extension()
        self.inspect(signed=False)
        self.assertEqual(self.calls, [])

    def test_the_app_must_declare_live_activities(self):
        self.write_extension()
        self.write_iphone(NSSupportsLiveActivities=False)
        with self.assertRaisesRegex(ValueError, "NSSupportsLiveActivities"):
            self.inspect(signed=False)

    def test_the_widget_is_a_widgetkit_extension_with_an_executable(self):
        self.write_extension(NSExtension={"NSExtensionPointIdentifier": "com.apple.share-services"})
        with self.assertRaisesRegex(ValueError, "WidgetKit"):
            self.inspect(signed=False)
        self.write_extension(executable=False)
        (self.iphone / "PlugIns/LiveActivitiesExtension.appex/LiveActivitiesExtension").unlink(missing_ok=True)
        with self.assertRaisesRegex(ValueError, "no executable"):
            self.inspect(signed=False)

    def test_the_widgets_versions_are_the_apps(self):
        self.write_extension(CFBundleVersion="1")
        with self.assertRaisesRegex(ValueError, "CFBundleVersion"):
            self.inspect(signed=False)
        self.write_extension(CFBundleShortVersionString="$(MARKETING_VERSION)")
        with self.assertRaisesRegex(ValueError, "CFBundleShortVersionString"):
            self.inspect(signed=False)

    def test_the_command_line(self):
        self.write_extension()
        verifier.main(["--app", str(self.iphone), "--unsigned"])
        self.write_iphone(NSSupportsLiveActivities=False)
        with self.assertRaises(SystemExit):
            verifier.main(["--app", str(self.iphone), "--unsigned"])


if __name__ == "__main__":
    unittest.main()
