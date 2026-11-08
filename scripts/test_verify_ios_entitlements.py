"""Offline profile compatibility checks, including the actual CI preflight."""

import datetime
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys
import tempfile
import textwrap
import unittest

from verify_ios_entitlements import ASSOCIATED_DOMAINS, mismatched_entitlements

ROOT = Path(__file__).resolve().parent.parent
DOMAIN = "applinks:troposfit.com"


class IosEntitlementSigningTest(unittest.TestCase):
    def test_exact_explicit_domain_profile_passes(self):
        requested = {ASSOCIATED_DOMAINS: [DOMAIN]}
        self.assertEqual(mismatched_entitlements(requested, requested), [])

    def test_apple_profile_wildcard_authorizes_the_explicit_app_domain(self):
        requested = {ASSOCIATED_DOMAINS: [DOMAIN]}
        allowed = {ASSOCIATED_DOMAINS: ["*"]}
        self.assertEqual(mismatched_entitlements(requested, allowed), [])
        self.assertEqual(requested, {ASSOCIATED_DOMAINS: [DOMAIN]})
        self.assertEqual(allowed, {ASSOCIATED_DOMAINS: ["*"]})

    def test_apple_profile_string_wildcard_authorizes_the_explicit_app_domain(self):
        # The shape Apple's App Store profiles carry (deploy-ios run, 2026-11-08).
        self.assertEqual(mismatched_entitlements({ASSOCIATED_DOMAINS: [DOMAIN]}, {ASSOCIATED_DOMAINS: "*"}), [])

    def test_profile_list_allows_the_one_value_the_app_asks(self):
        # App Attest as Apple writes it into an App Store profile (2026-11-08).
        key = "com.apple.developer.devicecheck.appattest-environment"
        both = {key: ["development", "production"]}
        self.assertEqual(mismatched_entitlements({key: "production"}, both), [])
        for requested in ("staging", "", ["production"], None):
            with self.subTest(requested=requested):
                self.assertEqual(mismatched_entitlements({key: requested}, both), [key])
        self.assertEqual(mismatched_entitlements({key: "production"}, {key: ["development"]}), [key])

    def test_missing_malformed_or_different_domain_permission_fails(self):
        for allowed in (None, [], "", True, ["applinks:other.example"], ["applinks:*"], "applinks:*"):
            with self.subTest(allowed=allowed):
                self.assertEqual(
                    mismatched_entitlements({ASSOCIATED_DOMAINS: [DOMAIN]}, {ASSOCIATED_DOMAINS: allowed}),
                    [ASSOCIATED_DOMAINS],
                )
        self.assertEqual(mismatched_entitlements({ASSOCIATED_DOMAINS: [DOMAIN]}, {}), [ASSOCIATED_DOMAINS])

    def test_profile_wildcard_does_not_authorize_wildcard_or_malformed_app_domains(self):
        for requested in (None, [], "applinks:troposfit.com", [None], [""], ["*"], ["applinks:*.troposfit.com"]):
            with self.subTest(requested=requested):
                self.assertEqual(
                    mismatched_entitlements({ASSOCIATED_DOMAINS: requested}, {ASSOCIATED_DOMAINS: ["*"]}),
                    [ASSOCIATED_DOMAINS],
                )

    def test_other_entitlements_still_require_exact_values(self):
        requested = {
            ASSOCIATED_DOMAINS: [DOMAIN],
            "aps-environment": "production",
            "com.apple.developer.applesignin": ["Default"],
            "com.apple.developer.healthkit": True,
        }
        allowed = {**requested, ASSOCIATED_DOMAINS: ["*"]}
        self.assertEqual(mismatched_entitlements(requested, allowed), [])
        for key in requested.keys() - {ASSOCIATED_DOMAINS}:
            for invalid in (None, ["*"], False, "development"):
                with self.subTest(key=key, invalid=invalid):
                    self.assertEqual(mismatched_entitlements(requested, {**allowed, key: invalid}), [key])

    def test_unrequested_profile_capabilities_are_unchanged(self):
        self.assertEqual(mismatched_entitlements({}, {ASSOCIATED_DOMAINS: ["*"]}), [])

    def test_workflow_preflight_accepts_real_profile_shape_and_rejects_missing_capability(self):
        workflow = (ROOT / ".github/workflows/deploy-ios.yml").read_text()
        marker = "          python3 - <<'PY'\n          import datetime, hashlib, json, os, plistlib, sys\n"
        body = "import datetime, hashlib, json, os, plistlib, sys\n" + textwrap.dedent(
            workflow.split(marker, 1)[1].split("          PY\n", 1)[0]
        )
        source = ROOT / "ios/App/App/App.entitlements"
        requested = plistlib.loads(source.read_bytes())
        self.assertEqual(requested[ASSOCIATED_DOMAINS], [DOMAIN])
        bundle, team = "com.tropos.app", "A2B3C4D5E6"
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            (temporary / "signed-targets.json").write_text(json.dumps([
                {"bundle_id": bundle, "entitlements": str(source)},
            ]))
            for capability, expected_status in ((["*"], 0), ("*", 0), (None, 1)):
                with self.subTest(capability=capability):
                    allowed = {
                        **requested,
                        "application-identifier": f"{team}.{bundle}",
                        # Apple lists both environments where the app names one.
                        "com.apple.developer.devicecheck.appattest-environment": ["development", "production"],
                    }
                    if capability is None:
                        del allowed[ASSOCIATED_DOMAINS]
                    else:
                        allowed[ASSOCIATED_DOMAINS] = capability
                    profile = {
                        "Entitlements": allowed,
                        "TeamIdentifier": [team],
                        "ExpirationDate": datetime.datetime.now() + datetime.timedelta(days=1),
                        "Name": "Synthetic offline test profile",
                        "UUID": "synthetic-profile",
                        "DeveloperCertificates": [],
                    }
                    (temporary / f"{bundle}.plist").write_bytes(plistlib.dumps(profile))
                    result = subprocess.run(
                        [sys.executable, "-c", body], cwd=ROOT,
                        env={**os.environ, "PROFILES": directory, "RUNNER_TEMP": directory, "APPLE_TEAM_ID": team},
                        capture_output=True, text=True, timeout=10,
                    )
                    self.assertEqual(result.returncode, expected_status, result.stdout + result.stderr)
                    if expected_status:
                        self.assertIn(ASSOCIATED_DOMAINS, result.stdout)


if __name__ == "__main__":
    unittest.main()
