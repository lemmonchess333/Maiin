"""The app targets deploy-ios.yml signs, read from the Xcode project.

Every app and app extension target is signed with its own App Store
profile. Reading the list from project.pbxproj, rather than naming the
iPhone and Watch apps, means a target added later (the Live Activity widget
in docs/run-live-activity.md) is signed and exported without editing the
workflow; a target of a kind this does not know stops the run and says so.

    python3 scripts/ios_signed_targets.py list <project.pbxproj> <out.json> [--require <bundle id>]...
    python3 scripts/ios_signed_targets.py sign <project.pbxproj> <profiles.json>
    python3 scripts/ios_signed_targets.py export-options <App.app> <profiles.json> <team id> <out.plist>

profiles.json maps each bundle ID to the UUID of the profile that signs it.
"""

import argparse
import json
import os
from pathlib import Path
import plistlib
import re

# Bundles that carry their own App Store profile.
SIGNED_PRODUCT_TYPES = {
    "com.apple.product-type.application",
    "com.apple.product-type.app-extension",
    "com.apple.product-type.extensionkit-extension",
    "com.apple.product-type.application.watchapp2",
    "com.apple.product-type.application.watchapp2-container",
    "com.apple.product-type.watchkit2-extension",
}

AUTOMATIC = "CODE_SIGN_STYLE = Automatic;"
OBJECT_ID = r"[0-9A-F]{24}"


class ProjectError(ValueError):
    pass


def _unquote(value):
    value = value.strip()
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return re.sub(r"\\(.)", r"\1", value[1:-1])
    return value


def _block(text, object_id, isa):
    match = re.search(
        rf"^\t\t{object_id} /\*[^\n]*?\*/ = \{{\n\t\t\tisa = {isa};\n(.*?)^\t\t\}};",
        text, re.M | re.S,
    )
    if not match:
        raise ProjectError(f"project.pbxproj has no {isa} {object_id}.")
    return match


def _settings(block_text):
    found = re.search(r"buildSettings = \{\n(.*?)\n\t\t\t\};", block_text, re.S)
    settings = {}
    for line in (found.group(1) if found else "").split("\n"):
        m = re.match(r'^\t{4}([A-Za-z0-9_]+) = ("(?:[^"\\]|\\.)*"|[^"(;][^;]*);$', line)
        if m:
            settings[m.group(1)] = _unquote(m.group(2))
    return settings


def parse_targets(text):
    """Every native target, with its configurations' ids, names and settings."""
    targets = []
    for match in re.finditer(
        rf"^\t\t({OBJECT_ID}) /\*[^\n]*?\*/ = \{{\n\t\t\tisa = PBXNativeTarget;\n(.*?)^\t\t\}};",
        text, re.M | re.S,
    ):
        body = match.group(2)
        name = _unquote(re.search(r"^\t\t\tname = ([^;]+);", body, re.M).group(1))
        product_type = _unquote(re.search(r"^\t\t\tproductType = ([^;]+);", body, re.M).group(1))
        list_id = re.search(rf"buildConfigurationList = ({OBJECT_ID})", body).group(1)
        listed = _block(text, list_id, "XCConfigurationList").group(1)
        ids = re.search(r"buildConfigurations = \((.*?)\);", listed, re.S).group(1)
        configurations = []
        for config_id, config_name in re.findall(rf"({OBJECT_ID}) /\* (.+?) \*/", ids):
            config = _block(text, config_id, "XCBuildConfiguration")
            configurations.append({
                "id": config_id,
                "name": config_name,
                "settings": _settings(config.group(1)),
            })
        targets.append({"name": name, "product_type": product_type, "configurations": configurations})
    if not targets:
        raise ProjectError("project.pbxproj has no native targets.")
    return targets


def signed_targets(text, project_dir="ios/App"):
    """[{target, bundle_id, entitlements, configurations}] in project order."""
    out = []
    seen = {}
    for target in parse_targets(text):
        if target["product_type"] not in SIGNED_PRODUCT_TYPES:
            raise ProjectError(
                f'The target "{target["name"]}" is a {target["product_type"]}. '
                "scripts/ios_signed_targets.py does not know whether that needs an App Store "
                "profile: add its product type there, signed or not, before archiving."
            )
        bundles = {c["settings"].get("PRODUCT_BUNDLE_IDENTIFIER") for c in target["configurations"]}
        if len(bundles) != 1 or None in bundles:
            raise ProjectError(
                f'Every configuration of "{target["name"]}" must set one PRODUCT_BUNDLE_IDENTIFIER, '
                f"so one profile signs it; found {sorted(b or '(none)' for b in bundles)}."
            )
        bundle = bundles.pop()
        if "$(" in bundle:
            raise ProjectError(f'"{target["name"]}" builds its bundle ID from a setting ({bundle}); write it out.')
        if bundle in seen:
            raise ProjectError(f'"{target["name"]}" and "{seen[bundle]}" share the bundle ID {bundle}.')
        seen[bundle] = target["name"]
        entitlements = {c["settings"].get("CODE_SIGN_ENTITLEMENTS") for c in target["configurations"]}
        if len(entitlements) != 1:
            raise ProjectError(f'The configurations of "{target["name"]}" name different entitlements files.')
        path = entitlements.pop()
        out.append({
            "target": target["name"],
            "bundle_id": bundle,
            "entitlements": os.path.join(project_dir, path) if path else None,
            "configurations": [c["name"] for c in target["configurations"]],
        })
    return out


def sign_project(text, profiles):
    """Switches every configuration of every signed target from automatic
    signing to its App Store profile. Returns the new text and what changed."""
    switched = []
    for target in parse_targets(text):
        if target["product_type"] not in SIGNED_PRODUCT_TYPES:
            continue
        for config in target["configurations"]:
            bundle = config["settings"].get("PRODUCT_BUNDLE_IDENTIFIER")
            if bundle not in profiles:
                raise ProjectError(f'No profile was made or given for {bundle} ("{target["name"]}").')
            match = _block(text, config["id"], "XCBuildConfiguration")
            block = match.group(0)
            if block.count(AUTOMATIC) != 1:
                raise ProjectError(
                    f'"{target["name"]}" {config["name"]} is not set to automatic signing once. '
                    "Update scripts/ios_signed_targets.py for the new project wiring."
                )
            manual = (
                "CODE_SIGN_STYLE = Manual;\n"
                '\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n'
                f'\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "{profiles[bundle]}";'
            )
            text = text[:match.start()] + block.replace(AUTOMATIC, manual) + text[match.end():]
            switched.append((target["name"], config["name"], bundle))
    if not switched:
        raise ProjectError("No target was switched to its App Store profile.")
    return text, switched


def bundles_in_app(app):
    """Every signed bundle in a built iPhone app: the app, then what it embeds."""
    app = Path(app)
    found = []
    for path in [app, *sorted(p for p in app.rglob("*") if p.suffix in (".app", ".appex") and p.is_dir())]:
        info = path / "Info.plist"
        try:
            with info.open("rb") as source:
                bundle = plistlib.load(source).get("CFBundleIdentifier")
        except (OSError, plistlib.InvalidFileException, ValueError):
            raise ProjectError(f"{path.relative_to(app.parent)} has no readable Info.plist.") from None
        if not isinstance(bundle, str) or not bundle:
            raise ProjectError(f"{path.relative_to(app.parent)} names no bundle ID.")
        found.append((str(path.relative_to(app.parent)), bundle))
    return found


def export_options(app, profiles, team):
    """The manual export's options, mapping each bundle in the archive, and
    only those, to its profile."""
    mapping = {}
    for path, bundle in bundles_in_app(app):
        if bundle not in profiles:
            raise ProjectError(f"{path} ({bundle}) is in the archive but no profile was made or given for it.")
        mapping[bundle] = profiles[bundle]
    return {
        "method": "app-store-connect",
        "teamID": team,
        "signingStyle": "manual",
        "signingCertificate": "Apple Distribution",
        "provisioningProfiles": mapping,
        "manageAppVersionAndBuildNumber": False,
        "uploadSymbols": True,
        "destination": "export",
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list")
    listing.add_argument("pbxproj")
    listing.add_argument("out")
    listing.add_argument("--require", action="append", default=[])
    signing = commands.add_parser("sign")
    signing.add_argument("pbxproj")
    signing.add_argument("profiles")
    exporting = commands.add_parser("export-options")
    exporting.add_argument("app")
    exporting.add_argument("profiles")
    exporting.add_argument("team")
    exporting.add_argument("out")
    args = parser.parse_args(argv)
    try:
        if args.command == "list":
            pbxproj = Path(args.pbxproj)
            targets = signed_targets(pbxproj.read_text(), str(pbxproj.parent.parent))
            bundles = {t["bundle_id"] for t in targets}
            missing = [b for b in args.require if b not in bundles]
            if missing:
                raise ProjectError(f"The project has no target for {', '.join(missing)}.")
            Path(args.out).write_text(json.dumps(targets, indent=2) + "\n")
            for t in targets:
                print(f'{t["bundle_id"]}: "{t["target"]}", {t["entitlements"] or "no entitlements"}, '
                      f'{len(t["configurations"])} configurations')
        elif args.command == "sign":
            pbxproj = Path(args.pbxproj)
            profiles = json.loads(Path(args.profiles).read_text())
            text, switched = sign_project(pbxproj.read_text(), profiles)
            pbxproj.write_text(text)
            for target, config, bundle in switched:
                print(f'Signing "{target}" {config} ({bundle}) with profile {profiles[bundle]}')
        else:
            profiles = json.loads(Path(args.profiles).read_text())
            options = export_options(args.app, profiles, args.team.strip())
            with open(args.out, "wb") as out:
                plistlib.dump(options, out)
            for bundle, uuid in options["provisioningProfiles"].items():
                print(f"Exporting {bundle} with profile {uuid}")
    except (ProjectError, OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"::error::{error}") from None


if __name__ == "__main__":
    main()
