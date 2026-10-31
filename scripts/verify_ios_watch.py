"""Verify what an iOS build carries for its connected training mode.

A standard build (release gate NO) embeds no Watch app and carries the short
Health usage text, because it reads steps and nothing else. A pilot build
(gate YES) embeds exactly one Watch app, names the iPhone as its companion,
carries the gate in both apps and the expanded Health text. deploy-ios.yml
runs this on the signed archive and on the exported IPA before upload, where
the pilot's Watch app is also checked for its own App Store profile and
HealthKit. ios-native-compile.yml runs it with --unsigned on the simulator
builds pull requests compile.
"""

import argparse
from pathlib import Path
import plistlib
import subprocess

from verify_ios_push import command_output, read_plist

GATE = "TroposConnectedTrainingEnabled"
HEALTH_SHARE = "NSHealthShareUsageDescription"
HEALTH_UPDATE = "NSHealthUpdateUsageDescription"


def validate_watch_identity(info, bundle_id, companion_id):
    if info.get("CFBundleIdentifier") != bundle_id:
        raise ValueError("The embedded Watch app has an unexpected bundle identifier.")
    if info.get("WKCompanionAppBundleIdentifier") != companion_id:
        raise ValueError("The Watch app does not name the expected iPhone companion.")


def validate_signed_watch(entitlements, profile, info, bundle_id, companion_id):
    validate_watch_identity(info, bundle_id, companion_id)
    signed_id = entitlements.get("application-identifier")
    profile_id = profile.get("Entitlements", {}).get("application-identifier")
    if not isinstance(signed_id, str) or not signed_id.endswith("." + bundle_id):
        raise ValueError("The signed Watch app identifier does not match its bundle ID.")
    if signed_id != profile_id:
        raise ValueError("The signed Watch app identifier does not match its profile.")
    if entitlements.get("get-task-allow") or profile.get("Entitlements", {}).get("get-task-allow"):
        raise ValueError("The Watch app must use App Store distribution signing.")
    if entitlements.get("com.apple.developer.healthkit") is not True:
        raise ValueError("The signed Watch app is missing its HealthKit entitlement.")
    if profile.get("Entitlements", {}).get("com.apple.developer.healthkit") is not True:
        raise ValueError("The Watch provisioning profile does not allow HealthKit.")


def validate_connected_training_flags(iphone_info, watch_info, expected):
    apps = (("iPhone", iphone_info),) if watch_info is None else (
        ("iPhone", iphone_info), ("Watch", watch_info),
    )
    for name, info in apps:
        if info.get(GATE) != expected:
            raise ValueError(f"The {name} connected training gate is not {expected} in this build.")


def validate_health_usage(iphone_info, expected):
    """The pilot asks for heart rate and workout export; a standard build for steps."""
    texts = {}
    for key in (HEALTH_SHARE, HEALTH_UPDATE):
        text = iphone_info.get(key)
        if not isinstance(text, str) or not text.strip() or "$(" in text:
            raise ValueError(f"The iPhone app's {key} is missing or was not resolved.")
        texts[key] = text.lower()
    pilot_text = "heart rate" in texts[HEALTH_SHARE] or "export" in texts[HEALTH_UPDATE]
    if expected == "YES" and not (
        "heart rate" in texts[HEALTH_SHARE] and "export" in texts[HEALTH_UPDATE]
    ):
        raise ValueError("A pilot build must carry the expanded Health text: heart rate and workout export.")
    if expected == "NO" and pilot_text:
        raise ValueError("A standard build must carry the short Health text, not the pilot's.")


def embedded_watch_apps(iphone_app):
    watch_dir = Path(iphone_app) / "Watch"
    return sorted(watch_dir.glob("*.app")) if watch_dir.is_dir() else []


def inspect_signed_watch(watch_app, bundle_id, companion_id, runner):
    command_output(["codesign", "--verify", "--deep", "--strict", str(watch_app)], runner)
    signed = command_output(["codesign", "--display", "--entitlements", ":-", str(watch_app)], runner)
    embedded = command_output(
        ["security", "cms", "-D", "-i", str(watch_app / "embedded.mobileprovision")], runner
    )
    try:
        entitlements, profile = plistlib.loads(signed), plistlib.loads(embedded)
        if not isinstance(entitlements, dict) or not isinstance(profile, dict):
            raise ValueError()
    except (ValueError, plistlib.InvalidFileException):
        raise ValueError("The embedded Watch app has unreadable signing data.") from None
    validate_signed_watch(
        entitlements, profile, read_plist(watch_app / "Info.plist"), bundle_id, companion_id
    )


def inspect_build(
    iphone_app, expected_connected_training, bundle_id, companion_id,
    runner=subprocess.run, signed=True,
):
    iphone_app = Path(iphone_app)
    iphone_info = read_plist(iphone_app / "Info.plist")
    if expected_connected_training == "NO":
        if (iphone_app / "Watch").exists():
            raise ValueError("A standard build must embed no Watch app, but App.app/Watch exists.")
        validate_connected_training_flags(iphone_info, None, "NO")
        validate_health_usage(iphone_info, "NO")
        return
    if expected_connected_training != "YES":
        raise ValueError("The expected connected training gate must be YES or NO.")
    apps = embedded_watch_apps(iphone_app)
    if len(apps) != 1:
        raise ValueError("Expected exactly one embedded Watch app in the pilot build.")
    watch_info = read_plist(apps[0] / "Info.plist")
    validate_watch_identity(watch_info, bundle_id, companion_id)
    if signed:
        inspect_signed_watch(apps[0], bundle_id, companion_id, runner)
    validate_connected_training_flags(iphone_info, watch_info, "YES")
    validate_health_usage(iphone_info, "YES")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, help="The iPhone .app: archive, exported IPA or simulator build")
    parser.add_argument("--bundle-id", default="com.tropos.app.watchkitapp")
    parser.add_argument("--companion-id", default="com.tropos.app")
    parser.add_argument("--expected-connected-training", choices=("YES", "NO"), required=True)
    parser.add_argument(
        "--unsigned", action="store_true",
        help="Skip the signing checks, for a build made with CODE_SIGNING_ALLOWED=NO",
    )
    args = parser.parse_args(argv)
    try:
        inspect_build(
            args.app, args.expected_connected_training, args.bundle_id, args.companion_id,
            signed=not args.unsigned,
        )
    except ValueError as error:
        raise SystemExit(f"::error::Connected training packaging check failed: {error}") from None
    if args.expected_connected_training == "NO":
        print("Verified a standard build: no Watch app, the gate off and the short Health text.")
    else:
        print("Verified a pilot build: one Watch app, both gates on and the expanded Health text.")
        if not args.unsigned:
            print("Verified the embedded Watch app's bundle, HealthKit and App Store signing.")


if __name__ == "__main__":
    main()
