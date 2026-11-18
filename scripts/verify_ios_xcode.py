"""Pick the Xcode that builds the iOS app, and check the SDK it links.

The iOS SDK an app links decides what an iPhone Duo shows it: only a build
with the iOS 27.1 SDK or later uses the whole display, and anything older
runs in compatibility mode (docs/ios/iphone-duo.md, owner decision A,
18 November 2026). GitHub's `xcode-27` runner image carries several Xcodes
side by side (a default, a release candidate, a beta), so deploy-ios.yml
and ios-native-compile.yml select one by name instead of taking the
default, and fail rather than build with another.

    python3 scripts/verify_ios_xcode.py --want 27.1
        prints the Xcode to select: the final 27.1 if the image has it,
        else its newest point release (27.1.1), else its release
        candidate. Never a beta, and never another minor version.
    python3 scripts/verify_ios_xcode.py --want 27.1 --sdk 27.1
        checks the selected Xcode's iOS SDK is 27.1 or later.
"""

import argparse
from pathlib import Path
import re
import sys


def version_tuple(text):
    return tuple(int(part) for part in text.split("."))


def pick_xcode(apps_dir, want):
    """The Xcode app for version `want` in `apps_dir`, or None."""
    apps = Path(apps_dir)
    final = apps / f"Xcode_{want}.app"
    if final.is_dir():
        return final
    point = re.compile(rf"^Xcode_{re.escape(want)}\.(\d+)\.app$")
    releases = sorted(
        (int(m.group(1)), path)
        for path in apps.glob(f"Xcode_{want}.*.app")
        if path.is_dir() and (m := point.match(path.name))
    )
    if releases:
        return releases[-1][1]
    candidates = sorted(
        path
        for path in apps.glob(f"Xcode_{want}_*.app")
        if path.is_dir() and re.search(r"release.?candidate|_rc", path.name, re.I)
    )
    return candidates[-1] if candidates else None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--want", required=True, help="Xcode version, e.g. 27.1")
    parser.add_argument("--apps", default="/Applications")
    parser.add_argument(
        "--sdk", help="the selected Xcode's iOS SDK version, to check instead"
    )
    args = parser.parse_args(argv)
    if args.sdk is not None:
        if version_tuple(args.sdk) < version_tuple(args.want):
            print(
                f"::error::The selected Xcode links iOS SDK {args.sdk}, "
                f"not {args.want} or later.",
                file=sys.stderr,
            )
            return 1
        print(f"iOS SDK {args.sdk}")
        return 0
    found = pick_xcode(args.apps, args.want)
    if found is None:
        listed = ", ".join(sorted(p.name for p in Path(args.apps).glob("Xcode*.app")))
        print(
            f"::error::No Xcode {args.want} (final, point release or release "
            f"candidate) on this runner. It has: {listed or 'none'}.",
            file=sys.stderr,
        )
        return 1
    print(found)
    return 0


if __name__ == "__main__":
    sys.exit(main())
