"""Verify that an iOS build carries the Live Activity widget.

Every build embeds it, a standard build and a connected training pilot
alike (docs/run-live-activity.md): the iPhone app declares
NSSupportsLiveActivities, without which iOS refuses every activity it
starts, and its PlugIns folder holds exactly one WidgetKit extension with
the widget's bundle ID, whose executable is there and whose versions are
the iPhone app's. deploy-ios.yml runs this on the signed archive and on the
exported IPA, where the widget is also checked for its own App Store
signing. ios-native-compile.yml runs it with --unsigned on the simulator
builds pull requests compile.
"""

import argparse
from pathlib import Path
import plistlib
import subprocess

from verify_ios_push import command_output, read_plist

WIDGETKIT = "com.apple.widgetkit-extension"
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


def validate_signed_widget(entitlements, profile, bundle_id):
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


def inspect_signed_widget(widget, bundle_id, runner):
    command_output(["codesign", "--verify", "--deep", "--strict", str(widget)], runner)
    signed = command_output(["codesign", "--display", "--entitlements", ":-", str(widget)], runner)
    embedded = command_output(
        ["security", "cms", "-D", "-i", str(widget / "embedded.mobileprovision")], runner
    )
    try:
        entitlements, profile = plistlib.loads(signed), plistlib.loads(embedded)
        if not isinstance(entitlements, dict) or not isinstance(profile, dict):
            raise ValueError()
    except (ValueError, plistlib.InvalidFileException):
        raise ValueError("The embedded widget has unreadable signing data.") from None
    validate_signed_widget(entitlements, profile, bundle_id)


def inspect_build(iphone_app, bundle_id, runner=subprocess.run, signed=True):
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
        inspect_signed_widget(widget, bundle_id, runner)
    return widget


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, help="The iPhone .app: archive, exported IPA or simulator build")
    parser.add_argument("--bundle-id", default="com.tropos.app.LiveActivities")
    parser.add_argument(
        "--unsigned", action="store_true",
        help="Skip the signing checks, for a build made with CODE_SIGNING_ALLOWED=NO",
    )
    args = parser.parse_args(argv)
    try:
        widget = inspect_build(args.app, args.bundle_id, signed=not args.unsigned)
    except ValueError as error:
        raise SystemExit(f"::error::Live Activity packaging check failed: {error}") from None
    print(f"Verified the Live Activity widget: {widget.name}, {args.bundle_id}, in an app that declares Live Activities.")
    if not args.unsigned:
        print("Verified the widget's own App Store signing.")


if __name__ == "__main__":
    main()
