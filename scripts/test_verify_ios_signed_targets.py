"""Offline checks for the signed-target list deploy-ios.yml derives from the
Xcode project, with the project as committed and with a Live Activity widget
extension added the way docs/run-live-activity.md adds it."""

import json
from pathlib import Path
import plistlib
import tempfile
import unittest

import ios_signed_targets as targets

ROOT = Path(__file__).resolve().parent.parent
PBXPROJ = (ROOT / "ios/App/App.xcodeproj/project.pbxproj").read_text()

WIDGET = "com.tropos.app.LiveActivities"


def with_widget(text, configurations=("Debug", "Release", "Profile"), product_type="com.apple.product-type.app-extension"):
    """The committed project plus a widget extension target with its own
    configuration list, as Xcode's File → New → Target writes one."""
    target_id = "D10000000000000000000001"
    list_id = "D10000000000000000000002"
    config_ids = [f"D1000000000000000000001{i}" for i in range(len(configurations))]
    configs = "".join(
        f"""\t\t{cid} /* {name} */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = LiveActivitiesExtension.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tINFOPLIST_FILE = LiveActivities/Info.plist;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {WIDGET};
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tTARGETED_DEVICE_FAMILY = 1;
\t\t\t}};
\t\t\tname = {name};
\t\t}};
"""
        for cid, name in zip(config_ids, configurations)
    )
    text = text.replace(
        "/* End XCBuildConfiguration section */",
        configs + "/* End XCBuildConfiguration section */",
    )
    config_list = "".join(f"\t\t\t\t{cid} /* {name} */,\n" for cid, name in zip(config_ids, configurations))
    text = text.replace(
        "/* End XCConfigurationList section */",
        f"""\t\t{list_id} /* Build configuration list for PBXNativeTarget "LiveActivitiesExtension" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
{config_list}\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
/* End XCConfigurationList section */""",
    )
    return text.replace(
        "/* End PBXNativeTarget section */",
        f"""\t\t{target_id} /* LiveActivitiesExtension */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {list_id} /* Build configuration list for PBXNativeTarget "LiveActivitiesExtension" */;
\t\t\tbuildPhases = (
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = LiveActivitiesExtension;
\t\t\tproductName = LiveActivitiesExtension;
\t\t\tproductType = "{product_type}";
\t\t}};
/* End PBXNativeTarget section */""",
    )


class SignedTargetsTests(unittest.TestCase):
    def test_the_committed_project_signs_the_iphone_and_watch_apps(self):
        listed = targets.signed_targets(PBXPROJ)
        self.assertEqual(
            [(t["target"], t["bundle_id"], t["entitlements"], t["configurations"]) for t in listed],
            [
                ("App", "com.tropos.app", "ios/App/App/App.entitlements", ["Debug", "Release"]),
                ("TroposWatch", "com.tropos.app.watchkitapp",
                 "ios/App/TroposWatch/TroposWatch.entitlements", ["Debug", "Release"]),
            ],
        )

    def test_a_widget_extension_with_a_third_configuration_is_signed_too(self):
        listed = targets.signed_targets(with_widget(PBXPROJ))
        self.assertEqual([t["bundle_id"] for t in listed], ["com.tropos.app", "com.tropos.app.watchkitapp", WIDGET])
        self.assertEqual(listed[2]["configurations"], ["Debug", "Release", "Profile"])
        self.assertEqual(listed[2]["entitlements"], "ios/App/LiveActivitiesExtension.entitlements")

        profiles = {"com.tropos.app": "P-APP", "com.tropos.app.watchkitapp": "P-WATCH", WIDGET: "P-WIDGET"}
        signed, switched = targets.sign_project(with_widget(PBXPROJ), profiles)
        self.assertEqual(len(switched), 7)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-WIDGET";'), 3)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-APP";'), 2)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-WATCH";'), 2)
        self.assertNotIn("CODE_SIGN_STYLE = Automatic;", signed)
        # The project's own configurations and nothing else changed.
        self.assertEqual(signed.count('CODE_SIGN_IDENTITY = "Apple Distribution";'), 7)
        self.assertEqual(signed.count('CODE_SIGN_IDENTITY = "iPhone Developer";'), 2)

    def test_a_target_without_a_profile_stops_the_signing(self):
        with self.assertRaisesRegex(targets.ProjectError, f"No profile was made or given for {WIDGET}"):
            targets.sign_project(with_widget(PBXPROJ), {"com.tropos.app": "A", "com.tropos.app.watchkitapp": "W"})

    def test_an_unknown_kind_of_target_is_named_not_guessed(self):
        with self.assertRaisesRegex(targets.ProjectError, "com.apple.product-type.framework"):
            targets.signed_targets(with_widget(PBXPROJ, product_type="com.apple.product-type.framework"))

    def test_a_target_whose_configurations_disagree_on_its_bundle_is_refused(self):
        text = with_widget(PBXPROJ, configurations=("Debug", "Release"))
        text = text.replace(
            f"PRODUCT_BUNDLE_IDENTIFIER = {WIDGET};", f"PRODUCT_BUNDLE_IDENTIFIER = {WIDGET}.debug;", 1
        )
        with self.assertRaisesRegex(targets.ProjectError, "must set one PRODUCT_BUNDLE_IDENTIFIER"):
            targets.signed_targets(text)

    def test_a_configuration_already_signed_by_hand_is_refused(self):
        signed, _ = targets.sign_project(PBXPROJ, {"com.tropos.app": "A", "com.tropos.app.watchkitapp": "W"})
        with self.assertRaisesRegex(targets.ProjectError, "not set to automatic signing once"):
            targets.sign_project(signed, {"com.tropos.app": "A", "com.tropos.app.watchkitapp": "W"})

    def test_the_command_line_requires_the_apps_the_workflow_verifies(self):
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp) / "ios/App/App.xcodeproj/project.pbxproj"
            project.parent.mkdir(parents=True)
            project.write_text(with_widget(PBXPROJ))
            out = Path(temp) / "signed.json"
            targets.main(["list", str(project), str(out), "--require", "com.tropos.app"])
            self.assertEqual(len(json.loads(out.read_text())), 3)
            with self.assertRaises(SystemExit):
                targets.main(["list", str(project), str(out), "--require", "com.tropos.app.missing"])


class ExportOptionsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = Path(self.temp.name) / "App.app"

    def bundle(self, relative, bundle_id):
        path = self.app / relative if relative else self.app
        path.mkdir(parents=True, exist_ok=True)
        # A built app's Info.plist is binary.
        (path / "Info.plist").write_bytes(
            plistlib.dumps({"CFBundleIdentifier": bundle_id}, fmt=plistlib.FMT_BINARY)
        )

    def test_maps_each_bundle_in_the_archive_and_only_those(self):
        self.bundle("", "com.tropos.app")
        self.bundle("PlugIns/LiveActivitiesExtension.appex", WIDGET)
        (self.app / "Frameworks/Some.framework").mkdir(parents=True)
        profiles = {"com.tropos.app": "P-APP", "com.tropos.app.watchkitapp": "P-WATCH", WIDGET: "P-WIDGET"}
        options = targets.export_options(self.app, profiles, "TEAM123456")
        # A standard build embeds no Watch app, so its profile is left out.
        self.assertEqual(options["provisioningProfiles"], {"com.tropos.app": "P-APP", WIDGET: "P-WIDGET"})
        self.assertEqual(options["signingStyle"], "manual")
        self.assertEqual(options["method"], "app-store-connect")
        self.assertIs(options["manageAppVersionAndBuildNumber"], False)

        self.bundle("Watch/TroposWatch.app", "com.tropos.app.watchkitapp")
        self.assertIn(
            "com.tropos.app.watchkitapp",
            targets.export_options(self.app, profiles, "TEAM123456")["provisioningProfiles"],
        )

    def test_a_bundle_without_a_profile_stops_the_export(self):
        self.bundle("", "com.tropos.app")
        self.bundle("PlugIns/LiveActivitiesExtension.appex", WIDGET)
        with self.assertRaisesRegex(targets.ProjectError, "PlugIns/LiveActivitiesExtension.appex"):
            targets.export_options(self.app, {"com.tropos.app": "P-APP"}, "TEAM123456")


if __name__ == "__main__":
    unittest.main()
