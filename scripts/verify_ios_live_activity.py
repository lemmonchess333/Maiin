"""Verify that an iOS build carries the Live Activity widget.

Every build embeds it, a standard build and a connected training pilot
alike (docs/run-live-activity.md): the iPhone app declares
NSSupportsLiveActivities, without which iOS refuses every activity it
starts, and its PlugIns folder holds exactly one WidgetKit extension with
the widget's bundle ID, whose executable is there and whose versions are
the iPhone app's. deploy-ios.yml runs this on the signed archive and on the
exported IPA, where the widget is also checked for its own App Store
signing, and the widget and the iPhone app for the App Group they share:
the Home Screen widgets read what the app writes there (Wid1), and a build
signed without it draws nothing but first-use notes. ios-native-compile.yml
runs it with --unsigned on the simulator builds pull requests compile.
"""

import argparse
from pathlib import Path
import plistlib
import subprocess

from verify_ios_entitlements import APP_GROUPS
from verify_ios_push import command_output, read_plist

WIDGETKIT = "com.apple.widgetkit-extension"
APP_GROUP = "group.com.tropos.app"
VERSION_KEYS = ("CFBundleShortVersionString", "CFBundleVersion")


def embedded_extensions(iphone_app):
    plugins = Path(iphone_app) / "PlugIns"
    return sorted(plugins.glob("*.appex")) if plugins.is_dir() else []


def validate_widget(iphone_info, widget_info):
    if iphone_info.get("NSSupportsLiveActivities") is not True:
        raise ValueError(
            "The iPhone app does not declare NSSupportsLiveActivities, so iOS refuses every Live Activity it starts."
        )
    extension = widget_info.get("NSExtension")
    if not isinstance(extension, dict) or extension.get("NSExtensionPointIdentifier") != WIDGETKIT:
        raise ValueError(f"The widget is not a WidgetKit extension ({WIDGETKIT}).")
    for key in VERSION_KEYS:
        mine, apps = widget_info.get(key), iphone_info.get(key)
        if not isinstance(mine, str) or not mine or "$(" in mine or mine != apps:
            raise ValueError(
                f"The widget's {key} is {mine!r} and the iPhone app's {apps!r}: an extension's must be its app's."
            )


def validate_app_group(entitlements, profile, group, bundle):
    """A signed bundle and its profile both carry the App Group."""
    carried = (
        ("signature", entitlements.get(APP_GROUPS)),
        ("profile", profile.get("Entitlements", {}).get(APP_GROUPS)),
    )
    for source, value in carried:
        if not isinstance(value, list) or group not in value:
            raise ValueError(
                f"The {bundle} {source} carries no App Group {group}, so the Home Screen widgets cannot read what "
                f"the app writes. Assign {group} to the App ID {bundle} in Apple Developer and run again "
                f"(docs/ios-release.md, \"The App Group\")."
            )


def validate_signed_widget(entitlements, profile, bundle_id, app_group=None):
    signed_id = entitlements.get("application-identifier")
    profile_id = profile.get("Entitlements", {}).get("application-identifier")
    if not isinstance(signed_id, str) or not signed_id.endswith("." + bundle_id):
        raise ValueError("The signed widget's identifier does not match its bundle ID.")
    if signed_id != profile_id:
        raise ValueError("The signed widget's identifier does not match its profile.")
    if entitlements.get("get-task-allow") or profile.get("Entitlements", {}).get("get-task-allow"):
        raise ValueError("The widget must use App Store distribution signing.")
    if "ProvisionedDevices" in profile:
        raise ValueError("The widget's profile is a development or ad hoc profile, not an App Store one.")
    if app_group:
        validate_app_group(entitlements, profile, app_group, bundle_id)


def signing_of(bundle, runner, what):
    """A signed bundle's entitlements and its embedded profile."""
    signed = command_output(["codesign", "--display", "--entitlements", ":-", str(bundle)], runner)
    embedded = command_output(
        ["security", "cms", "-D", "-i", str(bundle / "embedded.mobileprovision")], runner
    )
    try:
        entitlements, profile = plistlib.loads(signed), plistlib.loads(embedded)
        if not isinstance(entitlements, dict) or not isinstance(profile, dict):
            raise ValueError()
    except (ValueError, plistlib.InvalidFileException):
        raise ValueError(f"The {what} has unreadable signing data.") from None
    return entitlements, profile


def inspect_signed_widget(widget, bundle_id, runner, app_group=None):
    command_output(["codesign", "--verify", "--deep", "--strict", str(widget)], runner)
    entitlements, profile = signing_of(widget, runner, "embedded widget")
    validate_signed_widget(entitlements, profile, bundle_id, app_group)


def inspect_build(iphone_app, bundle_id, runner=subprocess.run, signed=True, app_group=APP_GROUP):
    """Returns the embedded widget's path."""
    iphone_app = Path(iphone_app)
    iphone_info = read_plist(iphone_app / "Info.plist")
    widgets = []
    for extension in embedded_extensions(iphone_app):
        info = read_plist(extension / "Info.plist")
        if info.get("CFBundleIdentifier") == bundle_id:
            widgets.append((extension, info))
    if len(widgets) != 1:
        raise ValueError(
            f"Expected exactly one {bundle_id} in App.app/PlugIns, found {len(widgets)}: every build embeds the widget."
        )
    widget, widget_info = widgets[0]
    validate_widget(iphone_info, widget_info)
    executable = widget_info.get("CFBundleExecutable")
    if not isinstance(executable, str) or not (widget / executable).is_file():
        raise ValueError("The embedded widget has no executable.")
    if signed:
        inspect_signed_widget(widget, bundle_id, runner, app_group)
        if app_group:
            entitlements, profile = signing_of(iphone_app, runner, "iPhone app")
            validate_app_group(entitlements, profile, app_group, iphone_info.get("CFBundleIdentifier", "iPhone app"))
    return widget


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, help="The iPhone .app: archive, exported IPA or simulator build")
    parser.add_argument("--bundle-id", default="com.tropos.app.LiveActivities")
    parser.add_argument("--app-group", default=APP_GROUP, help="The App Group the app and the widget share")
    parser.add_argument(
        "--unsigned", action="store_true",
        help="Skip the signing checks, for a build made with CODE_SIGNING_ALLOWED=NO",
    )
    args = parser.parse_args(argv)
    try:
        widget = inspect_build(args.app, args.bundle_id, signed=not args.unsigned, app_group=args.app_group)
    except ValueError as error:
        raise SystemExit(f"::error::Live Activity packaging check failed: {error}") from None
    print(f"Verified the Live Activity widget: {widget.name}, {args.bundle_id}, in an app that declares Live Activities.")
    if not args.unsigned:
        print(f"Verified the widget's own App Store signing, and the App Group {args.app_group} on the widget and the app.")


if __name__ == "__main__":
    main()
