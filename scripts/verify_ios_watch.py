"""Verify the embedded Watch app in a signed iOS archive or exported IPA.

The iPhone push verifier checks only App.app. This checks the separately
signed Watch app and its profile before an IPA is uploaded to TestFlight.
"""

import argparse
from pathlib import Path
import plistlib
import subprocess

from verify_ios_push import command_output, read_plist


def validate_signed_watch(entitlements, profile, info, bundle_id, companion_id):
    if info.get("CFBundleIdentifier") != bundle_id:
        raise ValueError("The embedded Watch app has an unexpected bundle identifier.")
    if info.get("WKCompanionAppBundleIdentifier") != companion_id:
        raise ValueError("The Watch app does not name the expected iPhone companion.")
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


def inspect_embedded_watch(iphone_app, bundle_id, companion_id, runner=subprocess.run):
    iphone_app = Path(iphone_app)
    apps = list((iphone_app / "Watch").glob("*.app"))
    if len(apps) != 1:
        raise ValueError("Expected exactly one embedded Watch app in the signed iPhone app.")
    watch_app = apps[0]
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
    validate_signed_watch(entitlements, profile, read_plist(watch_app / "Info.plist"), bundle_id, companion_id)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, help="Signed iPhone .app in the archive or exported IPA")
    parser.add_argument("--bundle-id", default="com.tropos.app.watchkitapp")
    parser.add_argument("--companion-id", default="com.tropos.app")
    args = parser.parse_args(argv)
    try:
        inspect_embedded_watch(args.app, args.bundle_id, args.companion_id)
        print("Verified the embedded Watch app's bundle, HealthKit and App Store signing.")
    except ValueError as error:
        raise SystemExit(f"::error::Watch signing verification failed: {error}") from None


if __name__ == "__main__":
    main()
