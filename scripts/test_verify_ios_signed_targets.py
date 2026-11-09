"""Offline checks for the signed-target list deploy-ios.yml derives from the
Xcode project, with the project as committed (the iPhone app, the Watch app
and the Live Activity widget) and with a further extension added the way
Xcode's File → New → Target adds one."""

import json
from pathlib import Path
import plistlib
import tempfile
import unittest

import ios_signed_targets as targets

ROOT = Path(__file__).resolve().parent.parent
PBXPROJ = (ROOT / "ios/App/App.xcodeproj/project.pbxproj").read_text()

APP = "com.tropos.app"
WATCH = "com.tropos.app.watchkitapp"
WIDGET = "com.tropos.app.LiveActivities"
EXTENSION = "com.tropos.app.NotificationService"
COMMITTED = {APP: "P-APP", WATCH: "P-WATCH", WIDGET: "P-WIDGET"}


def with_extension(text, configurations=("Debug", "Release", "Profile"), product_type="com.apple.product-type.app-extension"):
    """The committed project plus another extension target with its own
    configuration list, as Xcode's File → New → Target writes one."""
    target_id = "E90000000000000000000001"
    list_id = "E90000000000000000000002"
    config_ids = [f"E9000000000000000000001{i}" for i in range(len(configurations))]
    configs = "".join(
        f"""\t\t{cid} /* {name} */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = NotificationService/NotificationService.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tINFOPLIST_FILE = NotificationService/Info.plist;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {EXTENSION};
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
        f"""\t\t{list_id} /* Build configuration list for PBXNativeTarget "NotificationService" */ = {{
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
        f"""\t\t{target_id} /* NotificationService */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {list_id} /* Build configuration list for PBXNativeTarget "NotificationService" */;
\t\t\tbuildPhases = (
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = NotificationService;
\t\t\tproductName = NotificationService;
\t\t\tproductType = "{product_type}";
\t\t}};
/* End PBXNativeTarget section */""",
    )


class SignedTargetsTests(unittest.TestCase):
    def test_the_committed_project_signs_the_iphone_watch_and_widget_bundles(self):
        listed = targets.signed_targets(PBXPROJ)
        self.assertEqual(
            [(t["target"], t["bundle_id"], t["entitlements"], t["configurations"]) for t in listed],
            [
                ("App", APP, "ios/App/App/App.entitlements", ["Debug", "Release"]),
                ("TroposWatch", WATCH, "ios/App/TroposWatch/TroposWatch.entitlements", ["Debug", "Release"]),
                # The App Group it shares with the app (Wid1), so its App ID
                # is the owner's to make with that capability on, and its
                # profile is checked against the group.
                (
                    "LiveActivitiesExtension",
                    WIDGET,
                    "ios/App/LiveActivities/LiveActivities.entitlements",
                    ["Debug", "Release"],
                ),
            ],
        )
        signed, switched = targets.sign_project(PBXPROJ, COMMITTED)
        self.assertEqual(len(switched), 6)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-WIDGET";'), 2)
        self.assertNotIn("CODE_SIGN_STYLE = Automatic;", signed)

    def test_a_further_extension_with_a_third_configuration_is_signed_too(self):
        listed = targets.signed_targets(with_extension(PBXPROJ))
        self.assertEqual([t["bundle_id"] for t in listed], [APP, WATCH, WIDGET, EXTENSION])
        self.assertEqual(listed[3]["configurations"], ["Debug", "Release", "Profile"])
        self.assertEqual(listed[3]["entitlements"], "ios/App/NotificationService/NotificationService.entitlements")

        profiles = {**COMMITTED, EXTENSION: "P-EXT"}
        signed, switched = targets.sign_project(with_extension(PBXPROJ), profiles)
        self.assertEqual(len(switched), 9)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-EXT";'), 3)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-WIDGET";'), 2)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-APP";'), 2)
        self.assertEqual(signed.count('PROVISIONING_PROFILE_SPECIFIER = "P-WATCH";'), 2)
        self.assertNotIn("CODE_SIGN_STYLE = Automatic;", signed)
        # The project's own configurations and nothing else changed.
        self.assertEqual(signed.count('CODE_SIGN_IDENTITY = "Apple Distribution";'), 9)
        self.assertEqual(signed.count('CODE_SIGN_IDENTITY = "iPhone Developer";'), 2)

    def test_the_app_and_the_widget_ask_for_the_app_group_and_the_watch_for_none(self):
        listed = targets.signed_targets(PBXPROJ)
        groups = {t["bundle_id"]: targets.entitlement_app_groups(str(ROOT / t["entitlements"])) for t in listed}
        self.assertEqual(groups, {APP: ["group.com.tropos.app"], WATCH: [], WIDGET: ["group.com.tropos.app"]})
        self.assertEqual(targets.entitlement_app_groups(None), [])

    def test_an_entitlements_file_that_cannot_be_read_stops_the_listing(self):
        with tempfile.TemporaryDirectory() as directory:
            bad = Path(directory) / "Bad.entitlements"
            bad.write_text("not a plist")
            with self.assertRaisesRegex(targets.ProjectError, "not a readable entitlements file"):
                targets.entitlement_app_groups(str(bad))
            bad.write_bytes(plistlib.dumps({"com.apple.security.application-groups": "group.com.tropos.app"}))
            with self.assertRaisesRegex(targets.ProjectError, "not as a list"):
                targets.entitlement_app_groups(str(bad))

    def test_a_target_without_a_profile_stops_the_signing(self):
        with self.assertRaisesRegex(targets.ProjectError, f"No profile was made or given for {WIDGET}"):
            targets.sign_project(PBXPROJ, {APP: "A", WATCH: "W"})
        with self.assertRaisesRegex(targets.ProjectError, f"No profile was made or given for {EXTENSION}"):
            targets.sign_project(with_extension(PBXPROJ), COMMITTED)

    def test_an_unknown_kind_of_target_is_named_not_guessed(self):
        with self.assertRaisesRegex(targets.ProjectError, "com.apple.product-type.framework"):
            targets.signed_targets(with_extension(PBXPROJ, product_type="com.apple.product-type.framework"))

    def test_a_target_whose_configurations_disagree_on_its_bundle_is_refused(self):
        text = with_extension(PBXPROJ, configurations=("Debug", "Release"))
        text = text.replace(
            f"PRODUCT_BUNDLE_IDENTIFIER = {EXTENSION};", f"PRODUCT_BUNDLE_IDENTIFIER = {EXTENSION}.debug;", 1
        )
        with self.assertRaisesRegex(targets.ProjectError, "must set one PRODUCT_BUNDLE_IDENTIFIER"):
            targets.signed_targets(text)

    def test_a_configuration_already_signed_by_hand_is_refused(self):
        signed, _ = targets.sign_project(PBXPROJ, COMMITTED)
        with self.assertRaisesRegex(targets.ProjectError, "not set to automatic signing once"):
            targets.sign_project(signed, COMMITTED)

    def test_the_command_line_requires_the_apps_the_workflow_verifies(self):
        with tempfile.TemporaryDirectory() as temp:
            project = Path(temp) / "ios/App/App.xcodeproj/project.pbxproj"
            project.parent.mkdir(parents=True)
            project.write_text(with_extension(PBXPROJ))
            out = Path(temp) / "signed.json"
            targets.main(["list", str(project), str(out), "--require", APP, "--require", WIDGET])
            self.assertEqual(len(json.loads(out.read_text())), 4)
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
