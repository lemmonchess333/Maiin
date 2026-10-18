"""Fail a TestFlight build without production APNs signing. Prints no credentials.

Profile mode runs before signing; app mode reads the actual signed archive/export.
The pure validators also run offline in the production-verifier CI test step.
"""

import argparse
from pathlib import Path
import plistlib
import subprocess


SETUP = (
    "Enable Push Notifications for the App ID in Apple Developer, then regenerate "
    "the App Store Connect provisioning profile. If using your own profile, "
    "replace IOS_PROVISIONING_PROFILE_BASE64. See docs/ios-push-notifications.md."
)


def validate_push_profile(profile, requested):
    """Both source and distribution profile must request production APNs."""
    if requested.get("aps-environment") != "production":
        raise ValueError("The app entitlements must declare aps-environment=production for TestFlight.")
    allowed = profile.get("Entitlements", {})
    if not isinstance(allowed, dict) or allowed.get("aps-environment") != "production":
        raise ValueError("The provisioning profile does not allow production APNs. " + SETUP)


def validate_signed_app(entitlements, profile, info, bundle_id):
    """Check the signed app, not just the source entitlement template."""
    validate_push_profile(profile, entitlements)
    if info.get("CFBundleIdentifier") != bundle_id:
        raise ValueError("The signed app has an unexpected bundle identifier.")
    app_id = entitlements.get("application-identifier")
    if not isinstance(app_id, str) or not app_id.endswith("." + bundle_id):
        raise ValueError("The signed app identifier does not match the release bundle identifier.")
    if app_id != profile.get("Entitlements", {}).get("application-identifier"):
        raise ValueError("The signed app identifier does not match its embedded provisioning profile.")
    if entitlements.get("get-task-allow") or profile.get("Entitlements", {}).get("get-task-allow"):
        raise ValueError("The signed app must use App Store distribution signing.")


def read_plist(path):
    try:
        with Path(path).open("rb") as source:
            value = plistlib.load(source)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (OSError, ValueError, plistlib.InvalidFileException):
        raise ValueError("An expected signing plist is missing or invalid.") from None


def command_output(args, runner=subprocess.run):
    """Apple tools may print signing details on error; keep diagnostics bounded."""
    try:
        result = runner(args, capture_output=True, check=True, timeout=120)
        return result.stdout
    except (OSError, subprocess.SubprocessError):
        raise ValueError("The signed app could not be inspected with Apple signing tools.") from None


def inspect_signed_app(app, bundle_id, runner=subprocess.run):
    app = Path(app)
    if not app.is_dir() or app.suffix != ".app":
        raise ValueError("The expected signed app bundle is missing.")
    command_output(["codesign", "--verify", "--deep", "--strict", str(app)], runner)
    signed = command_output(["codesign", "--display", "--entitlements", ":-", str(app)], runner)
    embedded = command_output(["security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")], runner)
    try:
        entitlements, profile = plistlib.loads(signed), plistlib.loads(embedded)
        if not isinstance(entitlements, dict) or not isinstance(profile, dict):
            raise ValueError()
    except (ValueError, plistlib.InvalidFileException):
        raise ValueError("The signed app has unreadable entitlements or an unreadable embedded profile.") from None
    validate_signed_app(entitlements, profile, read_plist(app / "Info.plist"), bundle_id)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--profile", help="Decoded provisioning profile plist, before archive")
    mode.add_argument("--app", help="Signed .app inside the archive or exported IPA")
    parser.add_argument("--requested", default="ios/App/App/App.entitlements")
    parser.add_argument("--bundle-id", default="com.tropos.app")
    args = parser.parse_args(argv)
    try:
        if args.profile:
            validate_push_profile(read_plist(args.profile), read_plist(args.requested))
            print("Verified TestFlight profile permits production APNs.")
        else:
            inspect_signed_app(args.app, args.bundle_id)
            print("Verified signed app contains production APNs entitlements.")
    except ValueError as error:
        raise SystemExit(f"::error::iOS push signing verification failed: {error}") from None


if __name__ == "__main__":
    main()
